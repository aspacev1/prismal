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

  const movingToBacklog = scheduleStatus === "unscheduled";
  const resolvedStart = movingToBacklog
    ? null
    : startDate !== undefined ? (startDate ? new Date(startDate) : null) : existing.startDate;
  const resolvedDuration = movingToBacklog ? 0 : durationDays ?? existing.durationDays;

  // Schedule delay detection — only when the task has actual dates (planned tasks).
  // Unplanned tasks (null start or duration 0) skip delay detection.
  // Estimated schedules are exempt in both directions: confirming a ghost bar's
  // guessed dates (or undoing back to a ghost) is the primary scheduling
  // gesture and must not demand a delay confirmation or a reason. Scheduling a
  // task out of the backlog (existing "unscheduled") is likewise a fresh
  // scheduling decision, not a delay against a plan.
  const exemptFromDelayGuard =
    existing.scheduleStatus === "estimated" ||
    existing.scheduleStatus === "unscheduled" ||
    scheduleStatus === "estimated" ||
    movingToBacklog;
  const touchesSchedule = startDate !== undefined || durationDays !== undefined || movingToBacklog;
  if (touchesSchedule && !exemptFromDelayGuard && resolvedStart && resolvedDuration > 0) {
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
  if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
  if (durationDays !== undefined) updateData.durationDays = durationDays;
  if (parentId !== undefined) updateData.parentId = parentId || null;
  if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;

  // Schedule-status transitions.
  if (movingToBacklog) {
    // Parking a task in the backlog clears its dates and its plan baseline.
    updateData.scheduleStatus = "unscheduled";
    updateData.startDate = null;
    updateData.durationDays = 0;
    updateData.originalEndDate = null;
    updateData.originalDurationDays = 0;
  } else if (scheduleStatus !== undefined) {
    updateData.scheduleStatus = scheduleStatus;
  } else if (
    touchesSchedule &&
    existing.scheduleStatus !== "confirmed" &&
    resolvedStart &&
    resolvedDuration > 0
  ) {
    // Dates were explicitly set on an estimated/unscheduled task without a
    // status — that's a user scheduling decision, so it confirms the task.
    updateData.scheduleStatus = "confirmed";
  }
  const finalScheduleStatus = (updateData.scheduleStatus as string | undefined) ?? existing.scheduleStatus;

  if (finalScheduleStatus === "confirmed" && existing.scheduleStatus !== "confirmed" && resolvedStart && resolvedDuration > 0) {
    // The task's dates just became user-confirmed — this is where its plan
    // baseline starts (estimated ghosts carry none, see the POST handler).
    updateData.originalEndDate = workEndDate(resolvedStart, resolvedDuration);
    updateData.originalDurationDays = resolvedDuration;
  } else if (finalScheduleStatus === "estimated" && existing.scheduleStatus !== "estimated") {
    // Back to a ghost (undo) — drop the baseline again.
    updateData.originalEndDate = null;
    updateData.originalDurationDays = 0;
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
      // "in" check rather than ?? — clearing the date (backlog move) writes an
      // explicit null that must be recorded as a change, not read as "absent".
      newValue = "startDate" in updateData ? updateData.startDate : existing.startDate;
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

  // A backlog task has no dates, so finish-to-start dependencies through it
  // are meaningless — remove them in both directions. The client warns the
  // user before requesting the move when dependencies exist. (Undoing the move
  // restores the dates but not the removed dependencies.)
  if (movingToBacklog) {
    await prisma.taskDependency.deleteMany({
      where: { OR: [{ predecessorId: params.taskId }, { successorId: params.taskId }] },
    });
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