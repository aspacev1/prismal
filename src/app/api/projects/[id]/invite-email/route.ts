import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/origin";
import { auth } from "@/auth";
import { inviteEmailListSchema } from "@/lib/validation";
import { generateInviteToken } from "@/lib/inviteToken";
import { sendInviteEmail } from "@/lib/email";

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
  const parsed = inviteEmailListSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Enter at least one valid email address.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  const inviter = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!project || !inviter) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // upsert (not findUnique-then-create) — two concurrent requests for the
  // same project must not both try to insert and collide on the unique
  // projectId constraint.
  const link = await prisma.projectInviteLink.upsert({
    where: { projectId: params.id },
    create: { projectId: params.id, token: generateInviteToken(), createdById: session.user.id },
    update: {},
  });

  const inviteUrl = `${request.nextUrl.origin}/invite/${link.token}`;
  const inviterName = `${inviter.firstName} ${inviter.lastName}`;

  // allSettled — one address failing (bad domain, Resend rate limit, a
  // transient network blip) must not silently drop the rest of the batch
  // or turn into an opaque 500 after the invite link was already created.
  const results = await Promise.allSettled(
    parsed.data.emails.map((email) => sendInviteEmail(email, project.name, inviterName, inviteUrl))
  );
  const failed = parsed.data.emails.filter((_, i) => results[i].status === "rejected");

  return NextResponse.json({ sent: parsed.data.emails.length - failed.length, failed });
}
