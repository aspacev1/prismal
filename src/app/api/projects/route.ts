import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
    const message = parsed.error.issues[0]?.message ?? "Project name is required.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { name } = parsed.data;

  try {
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name,
          createdById: session.user.id,
          companyId: session.user.companyId,
        },
      });
      await tx.projectMember.create({
        data: { projectId: created.id, userId: session.user.id, role: "owner" },
      });
      return created;
    });

    return NextResponse.json({ id: project.id }, { status: 201 });
  } catch (err) {
    // FK violation on createdById/companyId → the session references a user or
    // company that no longer exists in the DB. Treat as auth failure so the
    // user is prompted to log in again rather than seeing a generic error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: "Your session is invalid. Please log in again." },
        { status: 401 }
      );
    }
    console.error("[projects/POST] failed:", err);
    return NextResponse.json(
      { error: "Could not create project. Please try again." },
      { status: 500 }
    );
  }
}

// Not currently called by the UI — /workspace queries Prisma directly as a
// Server Component instead (simpler, no extra HTTP round-trip). Kept for a
// future consumer (e.g. a client-side refresh action or external API use).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const memberships = await prisma.projectMember.findMany({
    where: { userId: session.user.id },
    include: { project: { include: { _count: { select: { members: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  const projects = memberships.map(({ project }) => ({
    id: project.id,
    name: project.name,
    memberCount: project._count.members,
  }));

  return NextResponse.json({ projects });
}
