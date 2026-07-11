import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appOrigin } from "@/lib/origin";
import { requireProjectRole } from "@/lib/projectAuth";
import { auth } from "@/auth";
import { generateInviteToken } from "@/lib/inviteToken";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Generating/exposing an invite link grants project access, so it is gated to
  // admins rather than every member.
  const authz = await requireProjectRole(params.id, session.user.id, "admin");
  if (!authz.ok) return authz.response;

  // upsert (not findUnique-then-create) — two concurrent requests for the
  // same project must not both try to insert and collide on the unique
  // projectId constraint.
  const link = await prisma.projectInviteLink.upsert({
    where: { projectId: params.id },
    create: { projectId: params.id, token: generateInviteToken(), createdById: session.user.id },
    update: {},
  });

  return NextResponse.json({ token: link.token, url: `${appOrigin(request)}/invite/${link.token}` });
}
