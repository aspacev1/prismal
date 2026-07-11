import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDependencySchema } from "@/lib/validation";
import { assertSameOrigin } from "@/lib/origin";
import { requireMembership } from "@/lib/projectAuth";
import { auth } from "@/auth";

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

  // Categories are structural groupings, not schedulable work — they never
  // participate in dependencies (see lib/taskUtils.ts).
  if (predecessor.kind === "category" || successor.kind === "category") {
    return NextResponse.json({ error: "Categories cannot have dependencies." }, { status: 400 });
  }

  // The existence check, the cycle walk, and the insert run in one transaction
  // so two concurrent requests can't each pass the check and then both insert,
  // producing a cycle. The unique (predecessorId, successorId) constraint still
  // guards against a duplicate created by a concurrent request.
  try {
    const dep = await prisma.$transaction(async (tx) => {
      const existing = await tx.taskDependency.findUnique({
        where: { predecessorId_successorId: { predecessorId, successorId } },
      });
      if (existing) {
        throw new DependencyError("This dependency already exists.", 409);
      }

      // DFS cycle check: walking forward from successor, must not reach predecessor.
      const visited = new Set<string>();
      const stack = [successorId];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (current === predecessorId) {
          throw new DependencyError("This dependency would create a cycle.", 400);
        }
        if (visited.has(current)) continue;
        visited.add(current);
        const outgoing = await tx.taskDependency.findMany({
          where: { predecessorId: current },
          select: { successorId: true },
        });
        for (const o of outgoing) stack.push(o.successorId);
      }

      return tx.taskDependency.create({ data: { predecessorId, successorId } });
    });

    return NextResponse.json({ dependency: dep }, { status: 201 });
  } catch (err) {
    if (err instanceof DependencyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

class DependencyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const authz = await requireMembership(params.id, session.user.id);
  if (!authz.ok) return authz.response;

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
