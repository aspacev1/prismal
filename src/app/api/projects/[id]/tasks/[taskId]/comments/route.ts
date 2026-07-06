import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/origin";
import { auth } from "@/auth";
import { createCommentSchema } from "@/lib/validation";

function initials(first?: string | null, last?: string | null): string {
  const parts = [first, last].filter(Boolean) as string[];
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0].toUpperCase()).slice(0, 2).join("");
}

function userFullName(first?: string | null, last?: string | null, email?: string | null): string {
  const parts = [first, last].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(" ");
  return email ?? "Unknown";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; taskId: string } }
) {
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

  const task = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!task || task.projectId !== params.id) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const comments = await prisma.taskComment.findMany({
    where: { taskId: params.taskId },
    include: { author: true },
    orderBy: { createdAt: "asc" },
  });

  // Fetch mentioned members for display
  const allMemberIds = new Set<string>();
  for (const c of comments) {
    for (const m of c.mentions) allMemberIds.add(m);
  }
  const mentionedMembers = allMemberIds.size > 0
    ? await prisma.projectMember.findMany({
        where: { id: { in: [...allMemberIds] } },
        include: { user: true },
      })
    : [];
  const memberMap = new Map(mentionedMembers.map((m) => [m.id, m]));

  const mapped = comments.map((c) => ({
    id: c.id,
    body: c.body,
    mentions: c.mentions.map((mid) => {
      const m = memberMap.get(mid);
      return {
        id: mid,
        name: m ? userFullName(m.user.firstName, m.user.lastName, m.user.email) : "Unknown",
        initials: m ? initials(m.user.firstName, m.user.lastName) : "?",
        color: m?.user.avatarColor ?? "#4F5DFF",
      };
    }),
    author: {
      id: c.author.id,
      name: userFullName(c.author.firstName, c.author.lastName, c.author.email),
      initials: initials(c.author.firstName, c.author.lastName),
      color: c.author.avatarColor ?? "#4F5DFF",
    },
    isAuthor: c.authorId === session.user.id,
    createdAt: c.createdAt.toISOString(),
  }));

  return NextResponse.json({ comments: mapped });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; taskId: string } }
) {
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

  const task = await prisma.task.findUnique({ where: { id: params.taskId } });
  if (!task || task.projectId !== params.id) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { body: commentBody, mentions } = parsed.data;

  // Validate that mentioned ids are project members
  if (mentions && mentions.length > 0) {
    const validMembers = await prisma.projectMember.findMany({
      where: { id: { in: mentions }, projectId: params.id },
      select: { id: true },
    });
    const validIds = new Set(validMembers.map((m) => m.id));
    const invalid = mentions.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Some mentioned users are not members of this project." },
        { status: 400 }
      );
    }
  }

  const comment = await prisma.taskComment.create({
    data: {
      taskId: params.taskId,
      authorId: session.user.id,
      body: commentBody,
      mentions: mentions ?? [],
    },
    include: { author: true },
  });

  return NextResponse.json(
    {
      comment: {
        id: comment.id,
        body: comment.body,
        mentions: (mentions ?? []).map((mid) => ({ id: mid })),
        author: {
          id: comment.author.id,
          name: userFullName(comment.author.firstName, comment.author.lastName, comment.author.email),
          initials: initials(comment.author.firstName, comment.author.lastName),
          color: comment.author.avatarColor ?? "#4F5DFF",
        },
        isAuthor: true,
        createdAt: comment.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}