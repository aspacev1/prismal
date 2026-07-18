import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateTaskSchema, TASK_HISTORY_FIELDS } from "@/lib/validation";
import { assertSameOrigin } from "@/lib/origin";
import { requireMembership } from "@/lib/projectAuth";
import { auth } from "@/auth";
import { workEndDate, daysBetween } from "@/lib/dateUtils";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; taskId: string } }
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const authz = await requireMembership(params.id, session.user.id);
  if (!authz.ok) return authz.response;

  const existing = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!existing || existing.projectId !== params.id) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { parentId, assigneeId, startDate, durationDays, confirmedDelay, reason, kind, scheduleStatus, ...rest } = parsed.data;

  if (parentId !== undefined) {
    if (parentId) {
      const parent = await prisma.task.findUnique({ where: { id: parentId } });
      if (!parent || parent.projectId !== params.id) {
        return NextResponse.json({ error: "Parent task not found in this project." }, { status: 400 });
      }
      if (parentId === params.taskId) {
        return NextResponse.json({ error: "A task cannot be its own parent." }, { status: 400 });
      }
      // Cycle guard: the chosen parent must not be a descendant of this task,
      // otherwise reparenting would create a loop (A → B → A) that infinite-loops
      // any recursive tree walk in the UI.
      let ancestorId: string | null = parent.parentId;
      while (ancestorId) {
        if (ancestorId === params.taskId) {
          return NextResponse.json(
            { error: "Cannot move a task under one of its own descendants." },
            { status: 400 }
          );
        }
        const ancestor: { parentId: string | null } | null = await prisma.task.findUnique({
          where: { id: ancestorId },
          select: { parentId: true },
        });
        ancestorId = ancestor?.parentId ?? null;
      }
      // 3-level cap: a Subtask (a Task whose parent is a Task) cannot have children.
      if (parent.kind === "task" && parent.parentId !== null) {
        const grandparent = await prisma.task.findUnique({ where: { id: parent.parentId } });
        if (grandparent && grandparent.kind === "task") {
          return NextResponse.json(
            { error: "Cannot nest under a subtask — maximum nesting depth is 3 levels." },
            { status: 400 }
          );
        }
      }
    }
  }

  // A Category cannot be given a parentId.
  if (kind === "category" && parentId) {
    return NextResponse.json(
      { error: "An epic cannot be nested under another task." },
      { status: 400 }
    );
  }

  if (assigneeId !== undefined) {
    if (assigneeId) {
      const assignee = await prisma.projectMember.findUnique({ where: { id: assigneeId } });
      if (!assignee || assignee.projectId !== params.id) {
        return NextResponse.json({ error: "Assignee is not a member of this project." }, { status: 400 });
      }
    }
  }

  const isConversion = kind !== undefined && kind !== existing.kind;
  const finalKind = kind ?? existing.kind;

  // Task ↔ milestone conversion guards and derived schedule effects.
  // Conversion overrides apply only where the patch didn't supply explicit
  // dates, so undo (which sends the exact prior dates) round-trips losslessly.
  let conversionStart: Date | undefined;
  let conversionDuration: number | undefined;
  if (isConversion && kind === "milestone") {
    if (existing.kind === "category") {
      return NextResponse.json(
        { error: "An epic cannot be converted to a milestone." },
        { status: 400 }
      );
    }
    const childCount = await prisma.task.count({ where: { parentId: params.taskId } });
    if (childCount > 0) {
      return NextResponse.json({ error: "Milestones can't contain subtasks." }, { status: 400 });
    }
    if (existing.scheduleStatus === "unscheduled" || !existing.startDate) {
      return NextResponse.json(
        { error: "Schedule this task first — milestones always have a date." },
        { status: 400 }
      );
    }
    // Collapse the bar to its end date ("done by end of this day").
    if (startDate === undefined) {
      conversionStart = workEndDate(existing.startDate, existing.durationDays);
    }
    if (durationDays === undefined) conversionDuration = 0;
  }
  if (isConversion && existing.kind === "milestone" && kind === "task") {
    // Expand the diamond into a 1-day bar ending on the milestone date.
    if (durationDays === undefined) conversionDuration = 1;
  }

  if (scheduleStatus === "unscheduled" && finalKind === "milestone") {
    return NextResponse.json(
      { error: "Milestones always have a date and cannot be unscheduled." },
      { status: 400 }
    );
  }

  // Explicit status wins (undo sends it to restore a prior state). Otherwise,
  // directly manipulating the dates of an estimated or unscheduled item —
  // dragging the ghost bar, resizing it, entering dates, dropping from the
  // backlog — is the act that confirms them.
  let newScheduleStatus = scheduleStatus;
  if (
    newScheduleStatus === undefined &&
    existing.scheduleStatus !== "confirmed" &&
    (startDate !== undefined || durationDays !== undefined)
  ) {
    newScheduleStatus = "confirmed";
  }

  let resolvedStart =
    startDate !== undefined
      ? startDate
        ? new Date(startDate)
        : null
      : conversionStart ?? existing.startDate;
  let resolvedDuration = durationDays ?? conversionDuration ?? existing.durationDays;
  if (finalKind === "milestone" && resolvedDuration > 0) {
    return NextResponse.json({ error: "Milestones have no duration." }, { status: 400 });
  }
  if (newScheduleStatus === "unscheduled") {
    // Unscheduled tasks have no dates by definition.
    resolvedStart = null;
    resolvedDuration = 0;
  }

  // Schedule delay detection — only for committed plans. Estimated dates are
  // a system guess and unscheduled tasks have no plan, so changing either is
  // frictionless (this is what makes "one drag fully schedules a fresh task"
  // work). Conversions and explicit status reverts (undo) are also exempt:
  // their date changes are mechanical, not a slipped deadline.
  const touchesSchedule = startDate !== undefined || durationDays !== undefined;
  const planGuardsApply =
    existing.scheduleStatus === "confirmed" &&
    !isConversion &&
    scheduleStatus === undefined;
  if (touchesSchedule && planGuardsApply && resolvedStart && resolvedDuration > 0) {
    const newEnd = workEndDate(resolvedStart, resolvedDuration);
    const isDelay =
      existing.originalEndDate && daysBetween(new Date(existing.originalEndDate), newEnd) > 0;
    if (isDelay && !confirmedDelay) {
      return NextResponse.json(
        {
          error: "SCHEDULE_DELAY_REQUIRES_CONFIRMATION",
          message: "This change extends the deadline beyond the original plan.",
          originalEndDate: existing.originalEndDate,
          newEndDate: newEnd,
        },
        { status: 409 }
      );
    }
    // Require a reason for any schedule change on planned tasks
    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: "A reason is required when changing task dates." },
        { status: 400 }
      );
    }
  }

  // Build the update data
  const updateData: Record<string, unknown> = { ...rest };
  if (kind !== undefined) updateData.kind = kind;
  if (startDate !== undefined || conversionStart !== undefined || newScheduleStatus === "unscheduled") {
    updateData.startDate = resolvedStart;
  }
  if (durationDays !== undefined || conversionDuration !== undefined || newScheduleStatus === "unscheduled") {
    updateData.durationDays = resolvedDuration;
  }
  if (newScheduleStatus !== undefined) updateData.scheduleStatus = newScheduleStatus;
  if (parentId !== undefined) updateData.parentId = parentId || null;
  if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;

  // Baseline maintenance. Reverting to a guess (undo) or to the backlog
  // clears the baseline; confirming previously-unconfirmed dates — or
  // reshaping via conversion — establishes a fresh baseline at the final
  // schedule so later delay detection measures from what the user committed.
  const finalScheduleStatus = newScheduleStatus ?? existing.scheduleStatus;
  if (finalScheduleStatus === "estimated" || finalScheduleStatus === "unscheduled") {
    updateData.originalEndDate = null;
    updateData.originalDurationDays = 0;
  } else if (
    (newScheduleStatus === "confirmed" && existing.scheduleStatus !== "confirmed") ||
    isConversion
  ) {
    if (resolvedStart) {
      updateData.originalEndDate = workEndDate(resolvedStart, resolvedDuration);
      updateData.originalDurationDays = resolvedDuration;
    }
  }

  // Build history entries
  const historyEntries: { field: string; oldValue: string | null; newValue: string | null; reason: string | null }[] = [];
  const scheduleReason = touchesSchedule ? (reason ?? null) : null;
  for (const field of TASK_HISTORY_FIELDS) {
    let oldValue: unknown;
    let newValue: unknown;
    if (field === "name") {
      oldValue = existing.name;
      newValue = updateData.name ?? existing.name;
    } else if (field === "startDate") {
      oldValue = existing.startDate;
      newValue = updateData.startDate ?? existing.startDate;
    } else if (field === "durationDays") {
      oldValue = existing.durationDays;
      newValue = updateData.durationDays ?? existing.durationDays;
    } else if (field === "loggedHours") {
      oldValue = existing.loggedHours;
      newValue = updateData.loggedHours ?? existing.loggedHours;
    } else if (field === "status") {
      oldValue = existing.status;
      newValue = updateData.status ?? existing.status;
    } else if (field === "priority") {
      oldValue = existing.priority;
      newValue = updateData.priority ?? existing.priority;
    } else if (field === "assigneeId") {
      oldValue = existing.assigneeId;
      newValue = updateData.assigneeId ?? existing.assigneeId;
    } else if (field === "description") {
      oldValue = existing.description;
      newValue = updateData.description ?? existing.description;
    } else if (field === "progress") {
      oldValue = existing.progress;
      newValue = updateData.progress ?? existing.progress;
    } else {
      continue;
    }

    const oldStr = oldValue === null || oldValue === undefined ? null : String(oldValue);
    const newStr = newValue === null || newValue === undefined ? null : String(newValue);

    let changed: boolean;
    if (field === "startDate") {
      changed =
        (oldValue === null ? null : new Date(oldValue as Date).toDateString()) !==
        (newValue === null ? null : new Date(newValue as Date).toDateString());
    } else {
      changed = oldStr !== newStr;
    }
    if (changed) {
      const isScheduleField = field === "startDate" || field === "durationDays";
      historyEntries.push({
        field,
        oldValue: oldStr,
        newValue: newStr,
        reason: isScheduleField ? scheduleReason : null,
      });
    }
  }

  const task = await prisma.task.update({
    where: { id: params.taskId },
    data: updateData,
    include: {
      assignee: { include: { user: true } },
      children: true,
      predecessorDeps: true,
      successorDeps: true,
    },
  });

  if (historyEntries.length > 0) {
    await prisma.taskHistory.createMany({
      data: historyEntries.map((e) => ({
        taskId: params.taskId,
        field: e.field,
        oldValue: e.oldValue,
        newValue: e.newValue,
        reason: e.reason,
        changedById: session.user.id,
      })),
    });
  }

  return NextResponse.json({ task });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; taskId: string } }
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const authz = await requireMembership(params.id, session.user.id);
  if (!authz.ok) return authz.response;

  const existing = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!existing || existing.projectId !== params.id) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  await prisma.task.delete({ where: { id: params.taskId } });

  return NextResponse.json({ ok: true });
}