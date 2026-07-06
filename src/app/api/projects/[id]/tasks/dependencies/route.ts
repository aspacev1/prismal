import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDependencySchema } from "@/lib/validation";
import { assertSameOrigin } from "@/lib/origin";
import { auth } from "@/auth";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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

  const body = await request.json().catch(() => null);
  const parsed = createDependencySchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { predecessorId, successorId } = parsed.data;

  if (predecessorId === successorId) {
    return NextResponse.json({ error: "A task cannot depend on itself." }, { status: 400 });
  }

  const predecessor = await prisma.task.findUnique({ where: { id: predecessorId } });
  const successor = await prisma.task.findUnique({ where: { id: successorId } });

  if (!predecessor || predecessor.projectId !== params.id) {
    return NextResponse.json({ error: "Predecessor task not found in this project." }, { status: 400 });
  }
  if (!successor || successor.projectId !== params.id) {
    return NextResponse.json({ error: "Successor task not found in this project." }, { status: 400 });
  }

  const existing = await prisma.taskDependency.findUnique({
    where: { predecessorId_successorId: { predecessorId, successorId } },
  });
  if (existing) {
    return NextResponse.json({ error: "This dependency already exists." }, { status: 409 });
  }

  // DFS cycle check: walking forward from successor, must not reach predecessor
  const visited = new Set<string>();
  const stack = [successorId];
  let createsCycle = false;
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === predecessorId) { createsCycle = true; break; }
    if (visited.has(current)) continue;
    visited.add(current);
    const outgoing = await prisma.taskDependency.findMany({
      where: { predecessorId: current },
      select: { successorId: true },
    });
    for (const o of outgoing) stack.push(o.successorId);
  }
  if (createsCycle) {
    return NextResponse.json({ error: "This dependency would create a cycle." }, { status: 400 });
  }

  const dep = await prisma.taskDependency.create({
    data: {
      predecessorId,
      successorId,
    },
  });

  return NextResponse.json({ dependency: dep }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
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

  const url = new URL(request.url);
  const depId = url.searchParams.get("depId");
  const predecessorId = url.searchParams.get("predecessorId");
  const successorId = url.searchParams.get("successorId");

  // Support both depId (direct) and predecessorId+successorId (from chip) lookup
  let dep;
  if (depId) {
    dep = await prisma.taskDependency.findUnique({ where: { id: depId } });
  } else if (predecessorId && successorId) {
    dep = await prisma.taskDependency.findUnique({
      where: { predecessorId_successorId: { predecessorId, successorId } },
    });
  } else {
    return NextResponse.json(
      { error: "Either depId or predecessorId+successorId query parameters are required." },
      { status: 400 }
    );
  }

  if (!dep) {
    return NextResponse.json({ error: "Dependency not found." }, { status: 404 });
  }

  const predecessor = await prisma.task.findUnique({ where: { id: dep.predecessorId } });
  if (!predecessor || predecessor.projectId !== params.id) {
    return NextResponse.json({ error: "Dependency not found in this project." }, { status: 404 });
  }

  await prisma.taskDependency.delete({ where: { id: dep.id } });

  return NextResponse.json({ ok: true });
}
