import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = ["/login", "/register", "/register/success", "/api/auth", "/api/register", "/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function evaluateGate(
  pathname: string,
  session: { onboardingComplete?: boolean } | null
): string | null {
  if (isPublicPath(pathname)) return null;
  if (!session) return "/login";
  if (pathname !== "/onboarding" && !session.onboardingComplete) return "/onboarding";
  return null;
}

export default auth((req) => {
  const redirectPath = evaluateGate(req.nextUrl.pathname, req.auth?.user ?? null);
  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
