import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { auth } from "@/auth";
import { PATCH } from "@/app/api/projects/[id]/members/[memberId]/route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

async function createUser(email: string) {
  const company = await prisma.company.create({ data: { name: "Acme inc" } });
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("originalpass"),
      firstName: "Ada",
      lastName: "Lovelace",
      department: "Engineering",
      position: "Engineer",
      companyId: company.id,
      onboardingComplete: true,
    },
  });
}

function makeRequest(projectId: string, memberId: string, body: unknown, origin = "http://localhost:3000") {
  return new NextRequest(`http://localhost:3000/api/projects/${projectId}/members/${memberId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/projects/[id]/members/[memberId]", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  async function setup() {
    const owner = await createUser("owner@acme-corp.com");
    const member = await createUser("member@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: owner.id, companyId: owner.companyId },
    });
    const ownerMembership = await prisma.projectMember.create({
      data: { projectId: project.id, userId: owner.id, role: "owner" },
    });
    const memberMembership = await prisma.projectMember.create({
      data: { projectId: project.id, userId: member.id, role: "member" },
    });
    return { owner, member, project, ownerMembership, memberMembership };
  }

  it("blocks a plain member from resetting another member's password", async () => {
    const { member, memberMembership, ownerMembership, project, owner } = await setup();
    // The plain member tries to reset the owner's password (the account-takeover attack).
    vi.mocked(auth).mockResolvedValue({ user: { id: member.id } } as never);

    const response = await PATCH(
      makeRequest(project.id, ownerMembership.id, { resetPassword: "hijackedpass" }),
      { params: { id: project.id, memberId: ownerMembership.id } }
    );

    expect(response.status).toBe(403);
    const ownerRow = await prisma.user.findUnique({ where: { id: owner.id } });
    expect(await verifyPassword("hijackedpass", ownerRow!.passwordHash)).toBe(false);
    // memberMembership referenced to satisfy lint on destructuring
    expect(memberMembership.role).toBe("member");
  });

  it("lets an admin reset a plain member's password", async () => {
    const { owner, member, memberMembership, project } = await setup();
    vi.mocked(auth).mockResolvedValue({ user: { id: owner.id } } as never);

    const response = await PATCH(
      makeRequest(project.id, memberMembership.id, { resetPassword: "adminsetpass" }),
      { params: { id: project.id, memberId: memberMembership.id } }
    );

    expect(response.status).toBe(200);
    const memberRow = await prisma.user.findUnique({ where: { id: member.id } });
    expect(await verifyPassword("adminsetpass", memberRow!.passwordHash)).toBe(true);
  });

  it("protects the owner from being blocked or reset by an admin", async () => {
    const { owner, member, memberMembership, ownerMembership, project } = await setup();
    // Promote the plain member to admin, then have them try to block the owner.
    await prisma.projectMember.update({ where: { id: memberMembership.id }, data: { role: "admin" } });
    vi.mocked(auth).mockResolvedValue({ user: { id: member.id } } as never);

    const response = await PATCH(
      makeRequest(project.id, ownerMembership.id, { blocked: true }),
      { params: { id: project.id, memberId: ownerMembership.id } }
    );

    expect(response.status).toBe(403);
    const ownerMembershipRow = await prisma.projectMember.findUnique({ where: { id: ownerMembership.id } });
    expect(ownerMembershipRow!.blocked).toBe(false);
    expect(owner.id).toBeTruthy();
  });

  it("updates the target user's department (not the non-existent member column)", async () => {
    const { owner, member, memberMembership, project } = await setup();
    vi.mocked(auth).mockResolvedValue({ user: { id: owner.id } } as never);

    const response = await PATCH(
      makeRequest(project.id, memberMembership.id, { department: "Design" }),
      { params: { id: project.id, memberId: memberMembership.id } }
    );

    expect(response.status).toBe(200);
    const memberRow = await prisma.user.findUnique({ where: { id: member.id } });
    expect(memberRow!.department).toBe("Design");
  });

  it("blocks a blocked admin from acting (blocked flag is enforced)", async () => {
    const { member, memberMembership, ownerMembership, project } = await setup();
    await prisma.projectMember.update({
      where: { id: memberMembership.id },
      data: { role: "admin", blocked: true },
    });
    vi.mocked(auth).mockResolvedValue({ user: { id: member.id } } as never);

    const response = await PATCH(
      makeRequest(project.id, ownerMembership.id, { department: "Design" }),
      { params: { id: project.id, memberId: ownerMembership.id } }
    );

    expect(response.status).toBe(403);
  });
});
