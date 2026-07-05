import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { onboardingSchema } from "@/lib/validation";
import { assertSameOrigin } from "@/lib/origin";
import { auth } from "@/auth";

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  const { firstName, lastName, department, position, companyName, inviteToken } = parsed.data;

  let companyId: string | null = null;
  let projectIdToJoin: string | null = null;

  if (inviteToken) {
    const invite = await prisma.projectInviteLink.findUnique({
      where: { token: inviteToken },
      include: { project: { include: { createdBy: true } } },
    });
    // invite.project.createdBy.companyId is guaranteed non-null in practice —
    // Project creation requires onboardingComplete (which only ever sets
    // companyId, never clears it) — this null-check is defense-in-depth
    // against a state the system can't currently produce, not a live case.
    if (invite && invite.project.createdBy.companyId) {
      companyId = invite.project.createdBy.companyId;
      projectIdToJoin = invite.projectId;
    }
  }

  if (!companyId) {
    if (inviteToken && (!companyName || !companyName.trim())) {
      return NextResponse.json(
        { error: "This invite link is no longer valid. Please enter your company name instead.", invalidInviteToken: true },
        { status: 400 }
      );
    }

    if (!companyName || !companyName.trim()) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    const existingCompany = await prisma.company.findFirst({
      where: { name: { equals: companyName, mode: "insensitive" } },
    });
    const company = existingCompany ?? (await prisma.company.create({ data: { name: companyName } }));
    companyId = company.id;
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: session.user.id },
      data: {
        firstName,
        lastName,
        department,
        position,
        companyId,
        onboardingComplete: true,
      },
    });

    if (projectIdToJoin) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: projectIdToJoin, userId: session.user.id } },
        create: { projectId: projectIdToJoin, userId: session.user.id },
        update: {},
      });
    }
  });

  return NextResponse.json({ companyId, projectId: projectIdToJoin }, { status: 200 });
}
