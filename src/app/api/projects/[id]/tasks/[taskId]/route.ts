import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateTaskSchema, TASK_HISTORY_FIELDS } from "@/lib/validation";
import { assertSameOrigin } from "@/lib/origin";
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

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.id, userId: session.user.id } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this project." }, { status: 403 });
  }

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

  const { parentId, assigneeId, startDate, durationDays, confirmedDelay, reason, kind, ...rest } = parsed.data;

  if (parentId !== undefined) {
    if (parentId) {
      const parent = await prisma.task.findUnique({ where: { id: parentId } });
      if (!parent || parent.projectId !== params.id) {
        return NextResponse.json({ error: "Parent task not found in this project." }, { status: 400 });
      }
      if (parentId === params.taskId) {
        return NextResponse.json({ error: "A task cannot be its own parent." }, { status: 400 });
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
      { error: "A category cannot be nested under another task." },
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

  const resolvedStart = startDate !== undefined ? (startDate ? new Date(startDate) : null) : existing.startDate;
  const resolvedDuration = durationDays ?? existing.durationDays;

  // Schedule delay detection — only when the task has actual dates (planned tasks).
  // Unplanned tasks (null start or duration 0) skip delay detection.
  const touchesSchedule = startDate !== undefined || durationDays !== undefined;
  if (touchesSchedule && resolvedStart && resolvedDuration > 0) {
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
  _request: NextRequest,
  { params }: { params: { id: string; taskId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.id, userId: session.user.id } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this project." }, { status: 403 });
  }

  const existing = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!existing || existing.projectId !== params.id) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  await prisma.task.delete({ where: { id: params.taskId } });

  return NextResponse.json({ ok: true });
}