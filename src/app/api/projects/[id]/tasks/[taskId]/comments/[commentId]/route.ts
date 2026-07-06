import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/origin";
import { auth } from "@/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; taskId: string; commentId: string } }
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

  const comment = await prisma.taskComment.findUnique({
    where: { id: params.commentId },
  });
  if (!comment || comment.taskId !== params.taskId) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  // Only the author can delete their comment
  if (comment.authorId !== session.user.id) {
    return NextResponse.json({ error: "You can only delete your own comments." }, { status: 403 });
  }

  await prisma.taskComment.delete({ where: { id: params.commentId } });

  return NextResponse.json({ ok: true });
}