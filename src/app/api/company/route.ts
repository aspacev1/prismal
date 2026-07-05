import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertSameOrigin } from "@/lib/origin";
import { z } from "zod";

const companySchema = z.object({
  name: z.string().trim().min(1),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { company: true },
  });

  if (!user?.company) {
    return NextResponse.json({ error: "No company found." }, { status: 404 });
  }

  return NextResponse.json({ id: user.company.id, name: user.company.name });
}

export async function PATCH(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { company: true },
  });

  if (!user?.companyId) {
    return NextResponse.json({ error: "No company found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = companySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  }

  const company = await prisma.company.update({
    where: { id: user.companyId },
    data: { name: parsed.data.name },
  });

  return NextResponse.json({ id: company.id, name: company.name });
}
