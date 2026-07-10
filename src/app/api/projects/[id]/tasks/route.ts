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

  const depsBySuccessor: Record<string, { predecessorId: string }[]> = {};
  for (const t of tasks) {
    for (const d of t.predecessorDeps) {
      if (!depsBySuccessor[t.id]) depsBySuccessor[t.id] = [];
      depsBySuccessor[t.id].push({ predecessorId: d.predecessorId });
    }
  }

  const mapped = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    kind: t.kind,
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
    isMilestone: t.isMilestone,
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
    successorDeps: t.successorDeps.map((sd) => ({ id: sd.id })),
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

  const { parentId, assigneeId, startDate, durationDays, kind, ...rest } = parsed.data;

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
      { error: "A category cannot be nested under another task." },
      { status: 400 }
    );
  }

  if (assigneeId) {
    const assignee = await prisma.projectMember.findUnique({ where: { id: assigneeId } });
    if (!assignee || assignee.projectId !== params.id) {
      return NextResponse.json({ error: "Assignee is not a member of this project." }, { status: 400 });
    }
  }

  const start = startDate ? new Date(startDate) : null;
  const duration = durationDays ?? 0;
  const originalEndDate = start && duration > 0 ? workEndDate(start, duration) : null;

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
          startDate: start,
          durationDays: duration,
          originalEndDate,
          originalDurationDays: duration,
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