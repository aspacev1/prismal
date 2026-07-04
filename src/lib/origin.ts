import { NextRequest, NextResponse } from "next/server";

export function assertSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin) {
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  }

  return null;
}
