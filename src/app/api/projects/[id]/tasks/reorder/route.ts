import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/origin";
import { auth } from "@/auth";
import { reorderSchema } from "@/lib/validation";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Verify all tasks belong to this project
  const taskIds = parsed.data.items.map((item) => item.id);
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, projectId: true },
  });
  const validIds = new Set(tasks.filter((t) => t.projectId === params.id).map((t) => t.id));
  if (validIds.size !== taskIds.length) {
    return NextResponse.json(
      { error: "Some tasks were not found in this project." },
      { status: 400 }
    );
  }

  // Bulk update order in a transaction
  await prisma.$transaction(
    parsed.data.items.map((item) =>
      prisma.task.update({
        where: { id: item.id },
        data: { order: item.order },
      })
    )
  );

  return NextResponse.json({ ok: true });
}