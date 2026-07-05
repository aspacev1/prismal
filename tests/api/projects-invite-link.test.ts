import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { GET } from "@/app/api/projects/[id]/invite-link/route";

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

function makeRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/projects/${id}/invite-link`);
}

describe("GET /api/projects/[id]/invite-link", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const response = await GET(makeRequest("anything"), { params: { id: "anything" } });
    expect(response.status).toBe(401);
  });

  it("rejects a non-member", async () => {
    const user = await createOnboardedUser("nonmember@acme-corp.com");
    const owner = await createOnboardedUser("owner@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });

    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);
    const response = await GET(makeRequest(project.id), { params: { id: project.id } });
    expect(response.status).toBe(403);
  });

  it("creates a link on first request and returns the same one on the next", async () => {
    const owner = await createOnboardedUser("owner2@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    vi.mocked(auth).mockResolvedValue({ user: { id: owner.id } } as never);

    const first = await GET(makeRequest(project.id), { params: { id: project.id } });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.token).toBeTruthy();
    expect(firstBody.url).toContain(firstBody.token);

    const second = await GET(makeRequest(project.id), { params: { id: project.id } });
    const secondBody = await second.json();
    expect(secondBody.token).toBe(firstBody.token);

    const links = await prisma.projectInviteLink.findMany({ where: { projectId: project.id } });
    expect(links).toHaveLength(1);
  });
});
