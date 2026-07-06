import { NextRequest, NextResponse } from "next/server";

export function assertSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  // When DOMAIN is set (e.g. behind a reverse proxy like Caddy), compare
  // against it instead of request.nextUrl.origin, which inside a container
  // resolves to the internal host (http://localhost:3000) and would block
  // legitimate browser requests from the public origin.
  const expected = process.env.DOMAIN ?? new URL(request.url).origin;
  if (origin !== expected) {
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  }

  return null;
}