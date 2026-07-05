import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createProjectSchema } from "@/lib/validation";
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
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  }

  const { name, description } = parsed.data;

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name,
        description: description || null,
        createdById: session.user.id,
        companyId: session.user.companyId,
      },
    });
    await tx.projectMember.create({
      data: { projectId: created.id, userId: session.user.id },
    });
    return created;
  });

  return NextResponse.json({ id: project.id }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const memberships = await prisma.projectMember.findMany({
    where: { userId: session.user.id },
    include: { project: { include: { members: true } } },
    orderBy: { createdAt: "desc" },
  });

  const projects = memberships.map(({ project }) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    memberCount: project.members.length,
  }));

  return NextResponse.json({ projects });
}
