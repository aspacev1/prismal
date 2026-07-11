import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ProjectMember } from "@prisma/client";

export type ProjectRole = "owner" | "admin" | "member";

const ROLE_RANK: Record<string, number> = { member: 0, admin: 1, owner: 2 };

export function roleAtLeast(role: string, minRole: ProjectRole): boolean {
  return (ROLE_RANK[role] ?? 0) >= ROLE_RANK[minRole];
}

export type MembershipResult =
  | { ok: true; membership: ProjectMember }
  | { ok: false; response: NextResponse };

export async function getMembership(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

/**
 * Requires an active (non-blocked) membership. A blocked member is treated as
 * having no access at all — every mutating route funnels through here so the
 * `blocked` flag is actually enforced rather than being inert.
 */
export async function requireMembership(projectId: string, userId: string): Promise<MembershipResult> {
  const membership = await getMembership(projectId, userId);
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: "Not a member of this project." }, { status: 403 }) };
  }
  if (membership.blocked) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Your access to this project has been blocked." }, { status: 403 }),
    };
  }
  return { ok: true, membership };
}

/**
 * Requires an active membership whose role is at least `minRole`. Used to gate
 * administrative actions (project settings, member management, invites) so they
 * are not available to every member.
 */
export async function requireProjectRole(
  projectId: string,
  userId: string,
  minRole: ProjectRole
): Promise<MembershipResult> {
  const result = await requireMembership(projectId, userId);
  if (!result.ok) return result;
  if (!roleAtLeast(result.membership.role, minRole)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "You do not have permission to do this." }, { status: 403 }),
    };
  }
  return result;
}
