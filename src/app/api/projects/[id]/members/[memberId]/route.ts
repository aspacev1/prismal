import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateMemberSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/password";
import { assertSameOrigin } from "@/lib/origin";
import { auth } from "@/auth";

export async function PATCH(request: NextRequest, { params }: { params: { id: string; memberId: string } }) {
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

  const targetMembership = await prisma.projectMember.findUnique({
    where: { id: params.memberId },
    include: { user: true },
  });
  if (!targetMembership || targetMembership.projectId !== params.id) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateMemberSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { blocked, department, resetPassword } = parsed.data;

  if (resetPassword) {
    const passwordHash = await hashPassword(resetPassword);
    await prisma.user.update({
      where: { id: targetMembership.userId },
      data: { passwordHash },
    });
  }

  const updateData: Record<string, unknown> = {};
  if (typeof blocked === "boolean") updateData.blocked = blocked;
  if (department) {
    updateData.department = department;
    await prisma.user.update({
      where: { id: targetMembership.userId },
      data: { department },
    });
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.projectMember.update({
      where: { id: params.memberId },
      data: updateData,
    });
  }

  return NextResponse.json({ ok: true });
}
