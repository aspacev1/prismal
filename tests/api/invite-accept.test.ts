import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { generateInviteToken } from "@/lib/inviteToken";
import { POST } from "@/app/api/invite/[token]/accept/route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

async function createOnboardedUser(email: string) {
  const company = await prisma.company.create({ data: { name: "Acme inc" } });
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("longenough"),
      firstName: "Ada",
      lastName: "Lovelace",
      department: "Engineering",
      position: "Engineer",
      companyId: company.id,
      onboardingComplete: true,
    },
  });
}

function makeRequest(token: string, origin = "http://localhost:3000") {
  return new NextRequest(`http://localhost:3000/api/invite/${token}/accept`, {
    method: "POST",
    headers: { origin },
  });
}

describe("POST /api/invite/[token]/accept", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const response = await POST(makeRequest("anything"), { params: { token: "anything" } });
    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown token", async () => {
    const user = await createOnboardedUser("user1@acme-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);
    const response = await POST(makeRequest("unknown-token"), { params: { token: "unknown-token" } });
    expect(response.status).toBe(404);
  });

  it("adds the user as a project member", async () => {
    const owner = await createOnboardedUser("owner@acme-corp.com");
    const invitee = await createOnboardedUser("invitee@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    const token = generateInviteToken();
    await prisma.projectInviteLink.create({ data: { projectId: project.id, token, createdById: owner.id } });

    vi.mocked(auth).mockResolvedValue({ user: { id: invitee.id } } as never);
    const response = await POST(makeRequest(token), { params: { token } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projectId).toBe(project.id);

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: invitee.id } },
    });
    expect(membership).not.toBeNull();
  });

  it("is idempotent when the user is already a member", async () => {
    const owner = await createOnboardedUser("owner2@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    const token = generateInviteToken();
    await prisma.projectInviteLink.create({ data: { projectId: project.id, token, createdById: owner.id } });

    vi.mocked(auth).mockResolvedValue({ user: { id: owner.id } } as never);
    const response = await POST(makeRequest(token), { params: { token } });
    expect(response.status).toBe(200);

    const memberships = await prisma.projectMember.findMany({ where: { projectId: project.id, userId: owner.id } });
    expect(memberships).toHaveLength(1);
  });
});
