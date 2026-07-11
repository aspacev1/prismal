import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { PATCH } from "@/app/api/projects/[id]/route";

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

function makeRequest(id: string, body: unknown, origin = "http://localhost:3000") {
  return new NextRequest(`http://localhost:3000/api/projects/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/projects/[id]", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("updates name and color", async () => {
    const user = await createOnboardedUser("patch1@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "Old", createdById: user.id, companyId: user.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: "owner" } });
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);

    const response = await PATCH(
      makeRequest(project.id, { name: "New", color: "#E17055" }),
      { params: { id: project.id } }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe("New");
    expect(body.color).toBe("#E17055");

    const updated = await prisma.project.findUnique({ where: { id: project.id } });
    expect(updated?.name).toBe("New");
  });

  it("rejects a mismatched origin", async () => {
    const user = await createOnboardedUser("patch2@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: user.id, companyId: user.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: "owner" } });
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);

    const response = await PATCH(makeRequest(project.id, { name: "Y" }, "http://evil.com"), {
      params: { id: project.id },
    });
    expect(response.status).toBe(403);
  });

  it("rejects an invalid color", async () => {
    const user = await createOnboardedUser("patch3@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: user.id, companyId: user.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: "owner" } });
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);

    const response = await PATCH(makeRequest(project.id, { color: "not-a-color" }), {
      params: { id: project.id },
    });
    expect(response.status).toBe(400);
  });

  it("rejects unknown fields", async () => {
    const user = await createOnboardedUser("patch4@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: user.id, companyId: user.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: "owner" } });
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);

    const response = await PATCH(makeRequest(project.id, { name: "X", description: "Old", color: "#0F9D8C" }), {
      params: { id: project.id },
    });
    expect(response.status).toBe(400);
  });
});
