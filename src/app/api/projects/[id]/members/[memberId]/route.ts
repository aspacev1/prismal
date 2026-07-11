import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateMemberSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/password";
import { assertSameOrigin } from "@/lib/origin";
import { requireProjectRole } from "@/lib/projectAuth";
import { auth } from "@/auth";

export async function PATCH(request: NextRequest, { params }: { params: { id: string; memberId: string } }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Member management (block/unblock, reset password, change department) is an
  // administrative action. Without this gate, any member could reset another
  // member's global account password and take over their account.
  const authz = await requireProjectRole(params.id, session.user.id, "admin");
  if (!authz.ok) return authz.response;

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

  // The project owner cannot be blocked or have their password reset by an
  // admin — otherwise an admin could lock the owner out of their own project
  // or take over the owner's account.
  if (targetMembership.role === "owner" && (typeof blocked === "boolean" || resetPassword)) {
    return NextResponse.json({ error: "The project owner cannot be blocked or reset." }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    if (resetPassword) {
      const passwordHash = await hashPassword(resetPassword);
      await tx.user.update({
        where: { id: targetMembership.userId },
        data: { passwordHash },
      });
    }

    if (department) {
      await tx.user.update({
        where: { id: targetMembership.userId },
        data: { department },
      });
    }

    if (typeof blocked === "boolean") {
      await tx.projectMember.update({
        where: { id: params.memberId },
        data: { blocked },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
