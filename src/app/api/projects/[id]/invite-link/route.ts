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

  let link = await prisma.projectInviteLink.findUnique({ where: { projectId: params.id } });
  if (!link) {
    link = await prisma.projectInviteLink.create({
      data: { projectId: params.id, token: generateInviteToken(), createdById: session.user.id },
    });
  }

  return NextResponse.json({ token: link.token, url: `${request.nextUrl.origin}/invite/${link.token}` });
}
