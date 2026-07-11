import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/origin";
import { requireMembership, roleAtLeast } from "@/lib/projectAuth";
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

  const authz = await requireMembership(params.id, session.user.id);
  if (!authz.ok) return authz.response;

  const comment = await prisma.taskComment.findUnique({
    where: { id: params.commentId },
  });
  if (!comment || comment.taskId !== params.taskId) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  // The author can delete their own comment; admins and the owner can moderate
  // any comment in the project.
  const canModerate = roleAtLeast(authz.membership.role, "admin");
  if (comment.authorId !== session.user.id && !canModerate) {
    return NextResponse.json({ error: "You can only delete your own comments." }, { status: 403 });
  }

  await prisma.taskComment.delete({ where: { id: params.commentId } });

  return NextResponse.json({ ok: true });
}