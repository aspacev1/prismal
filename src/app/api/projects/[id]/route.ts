import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateProjectSchema } from "@/lib/validation";
import { assertSameOrigin } from "@/lib/origin";
import { requireProjectRole } from "@/lib/projectAuth";
import { auth } from "@/auth";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const authz = await requireProjectRole(params.id, session.user.id, "admin");
  if (!authz.ok) return authz.response;

  const body = await request.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const project = await prisma.project.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json({ id: project.id, name: project.name, color: project.color, imageUrl: project.imageUrl });
}
