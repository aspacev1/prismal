import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTaskSchema } from "@/lib/validation";
import { assertSameOrigin } from "@/lib/origin";
import { requireMembership } from "@/lib/projectAuth";
import { auth } from "@/auth";
import { workEndDate } from "@/lib/dateUtils";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const authz = await requireMembership(params.id, session.user.id);
  if (!authz.ok) return authz.response;

  const tasks = await prisma.task.findMany({
    where: { projectId: params.id },
    include: {
      assignee: { include: { user: true } },
      children: true,
      predecessorDeps: true,
      successorDeps: true,
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  // A row's `deps` lists its predecessors. Prisma's `successorDeps` relation
  // holds the rows where this task is the successor — i.e. exactly the rows
  // naming its predecessors. (The previous loop read `predecessorDeps`, which
  // attributed each dependency to the predecessor task instead, so arrows
  // survived only as the client's optimistic state and vanished on reload.)
  const depsBySuccessor: Record<string, { predecessorId: string }[]> = {};
  for (const t of tasks) {
    for (const d of t.successorDeps) {
      if (!depsBySuccessor[t.id]) depsBySuccessor[t.id] = [];
      depsBySuccessor[t.id].push({ predecessorId: d.predecessorId });
    }
  }

  const mapped = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    kind: t.kind,
    scheduleStatus: t.scheduleStatus,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    durationDays: t.durationDays,
    originalEndDate: t.originalEndDate ? t.originalEndDate.toISOString() : null,
    originalDurationDays: t.originalDurationDays,
    loggedHours: t.loggedHours,
    progress: t.progress,
    status: t.status,
    priority: t.priority,
    order: t.order,
    color: t.color,
    projectId: t.projectId,
    parentId: t.parentId,
    assigneeId: t.assigneeId,
    assignee: t.assignee
      ? {
          id: t.assignee.id,
          user: {
            id: t.assignee.user.id,
            firstName: t.assignee.user.firstName,
            lastName: t.assignee.user.lastName,
            avatarColor: t.assignee.user.avatarColor,
            department: t.assignee.user.department,
          },
        }
      : null,
    deps: depsBySuccessor[t.id] ?? [],
    // Rows where this task is the predecessor (it has successors) — only the
    // presence matters to consumers (the "dependent only" filter).
    successorDeps: t.predecessorDeps.map((sd) => ({ id: sd.id })),
  }));

  return NextResponse.json({ tasks: mapped });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const authz = await requireMembership(params.id, session.user.id);
  if (!authz.ok) return authz.response;

  const body = await request.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { parentId, assigneeId, startDate, durationDays, kind, scheduleStatus, ...rest } = parsed.data;

  if (parentId) {
    const parent = await prisma.task.findUnique({ where: { id: parentId } });
    if (!parent || parent.projectId !== params.id) {
      return NextResponse.json({ error: "Parent task not found in this project." }, { status: 400 });
    }
    // 3-level cap: Category → Task → Subtask. A Subtask cannot have children.
    // A Subtask is a Task whose parent is a Task (not a Category). So if the
    // parent is a Task AND the parent's own parent is a Task, the parent is
    // itself a Subtask → reject.
    if (parent.kind === "task" && parent.parentId !== null) {
      const grandparent = await prisma.task.findUnique({ where: { id: parent.parentId } });
      if (grandparent && grandparent.kind === "task") {
        return NextResponse.json(
          { error: "Cannot add a child to a subtask — maximum nesting depth is 3 levels." },
          { status: 400 }
        );
      }
    }
  }

  // A Category cannot have a parentId (categories are top-level only).
  if (kind === "category" && parentId) {
    return NextResponse.json(
      { error: "An epic cannot be nested under another task." },
      { status: 400 }
    );
  }

  // Every task must be mapped to an epic. Tasks (non-categories) require a parentId.
  if (kind !== "category" && !parentId) {
    return NextResponse.json(
      { error: "Every task must be created under an epic." },
      { status: 400 }
    );
  }

  if (assigneeId) {
    const assignee = await prisma.projectMember.findUnique({ where: { id: assigneeId } });
    if (!assignee || assignee.projectId !== params.id) {
      return NextResponse.json({ error: "Assignee is not a member of this project." }, { status: 400 });
    }
  }

  let start = startDate ? new Date(startDate) : null;
  let duration = durationDays ?? 0;
  // Default: dates supplied by an API caller without an explicit status are
  // user-chosen ("confirmed"). The UI passes "estimated" for system-guessed
  // defaults and "unscheduled" for backlog creation explicitly.
  let resolvedScheduleStatus = scheduleStatus ?? "confirmed";

  if (kind === "milestone") {
    // Milestones always have a date, so they can never live in the backlog.
    if (resolvedScheduleStatus === "unscheduled") {
      return NextResponse.json(
        { error: "Milestones always have a date and cannot be unscheduled." },
        { status: 400 }
      );
    }
    if (!start) {
      return NextResponse.json({ error: "A milestone requires a date." }, { status: 400 });
    }
    // A milestone is a zero-duration point. The date means "done by end of
    // this day". An import/API payload with a duration > 0 is normalized to
    // the range's end date.
    if (duration > 0) {
      console.warn(
        `Milestone "${rest.name}" created with durationDays=${duration}; normalizing to its end date.`
      );
      start = workEndDate(start, duration);
      duration = 0;
    }
  }

  if (resolvedScheduleStatus === "unscheduled") {
    // Unscheduled tasks have no dates by definition.
    start = null;
    duration = 0;
  }

  // Estimated dates are a guess, not a plan — don't baseline them. The
  // baseline (originalEndDate/originalDurationDays) is set when the user
  // confirms real dates, so a first drag never trips delay detection.
  const originalEndDate =
    resolvedScheduleStatus === "confirmed" && start && duration > 0
      ? workEndDate(start, duration)
      : null;
  const originalDuration = resolvedScheduleStatus === "confirmed" ? duration : 0;

  // Read the current max order and insert in one serializable transaction so two
  // concurrent creates can't both read the same max and collide on `order`.
  const task = await prisma.$transaction(
    async (tx) => {
      const maxOrder = await tx.task.aggregate({
        where: { projectId: params.id },
        _max: { order: true },
      });

      return tx.task.create({
        data: {
          ...rest,
          kind: kind ?? "task",
          scheduleStatus: resolvedScheduleStatus,
          startDate: start,
          durationDays: duration,
          originalEndDate,
          originalDurationDays: originalDuration,
          parentId: parentId || null,
          assigneeId: assigneeId || null,
          createdById: session.user.id,
          projectId: params.id,
          order: rest.order ?? (maxOrder._max.order ?? -1) + 1,
        },
        include: {
          assignee: { include: { user: true } },
          children: true,
          predecessorDeps: true,
          successorDeps: true,
        },
      });
    },
    { isolationLevel: "Serializable" }
  );

  // Update project.startDate to the earliest task start (scroll floor anchor).
  // Only when the task has an actual start date (not null/unplanned).
  if (start) {
    const currentProject = await prisma.project.findUnique({
      where: { id: params.id },
      select: { startDate: true },
    });
    if (!currentProject?.startDate || start < currentProject.startDate) {
      await prisma.project.update({
        where: { id: params.id },
        data: { startDate: start },
      });
    }
  }

  return NextResponse.json({ task }, { status: 201 });
}