import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { generateInviteToken } from "@/lib/inviteToken";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
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

  // upsert (not findUnique-then-create) — two concurrent requests for the
  // same project must not both try to insert and collide on the unique
  // projectId constraint.
  const link = await prisma.projectInviteLink.upsert({
    where: { projectId: params.id },
    create: { projectId: params.id, token: generateInviteToken(), createdById: session.user.id },
    update: {},
  });

  return NextResponse.json({ token: link.token, url: `${request.nextUrl.origin}/invite/${link.token}` });
}
