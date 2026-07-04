import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Hits the DB on every call — must run per-request, never statically
// prerendered at build time (there's no reachable DB in the build step).
export const dynamic = "force-dynamic";

export async function GET() {
  await prisma.$queryRaw`SELECT 1`;
  return NextResponse.json({ status: "ok" });
}
