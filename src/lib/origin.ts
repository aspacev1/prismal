import { NextRequest, NextResponse } from "next/server";

export function assertSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  // When DOMAIN is set (e.g. behind a reverse proxy like Caddy), compare
  // against it instead of request.nextUrl.origin, which inside a container
  // resolves to the internal host (http://localhost:3000) and would block
  // legitimate browser requests from the public origin.
  if (origin !== appOrigin(request)) {
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  }

  return null;
}

/**
 * The public origin of the app (scheme + host), used both for the CSRF
 * same-origin check and for building absolute links (invites) that must be
 * reachable from a browser. Behind a reverse proxy like Caddy, request.url
 * resolves to the internal host (http://localhost:3000), so DOMAIN — a full
 * origin such as https://app.example.com — takes precedence when set.
 */
export function appOrigin(request: NextRequest): string {
  return process.env.DOMAIN ?? new URL(request.url).origin;
}