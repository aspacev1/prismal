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

  const { firstName, lastName, department, position, companyName } = parsed.data;

  // Interim guard until Task 9 adds the inviteToken branch (which will let
  // invited users skip company name entirely) — for now this still requires
  // it on every submission, same as before companyName became schema-optional.
  if (!companyName) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  const existingCompany = await prisma.company.findFirst({
    where: { name: { equals: companyName, mode: "insensitive" } },
  });
  const company = existingCompany ?? (await prisma.company.create({ data: { name: companyName } }));

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      firstName,
      lastName,
      department,
      position,
      companyId: company.id,
      onboardingComplete: true,
    },
  });

  return NextResponse.json({ companyId: company.id }, { status: 200 });
}
