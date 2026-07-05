import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/origin";
import { auth } from "@/auth";

// No explicit onboardingComplete check here on purpose — this route is only
// ever reached by an already-onboarded user (middleware's default gate
// redirects anyone else to /onboarding before this handler runs, since
// neither "/invite" nor "/api/invite" is a public path). If a future change
// ever adds a broader "/api/invite" prefix to PUBLIC_PATHS, that protection
// disappears silently — keep this route's exposure in mind if that happens.
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const link = await prisma.projectInviteLink.findUnique({ where: { token: params.token } });
  if (!link) {
    return NextResponse.json({ error: "This invite link isn't valid." }, { status: 404 });
  }

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: link.projectId, userId: session.user.id } },
    create: { projectId: link.projectId, userId: session.user.id },
    update: {},
  });

  return NextResponse.json({ projectId: link.projectId });
}
