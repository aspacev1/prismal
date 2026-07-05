import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { POST, GET } from "@/app/api/projects/route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

function makeRequest(method: string, body?: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/projects", {
    method,
    headers: { "content-type": "application/json", origin },
    body: body ? JSON.stringify(body) : undefined,
  });
}

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

describe("POST /api/projects", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const response = await POST(makeRequest("POST", { name: "Website relaunch" }));
    expect(response.status).toBe(401);
  });

  it("rejects a missing name", async () => {
    const user = await createOnboardedUser("owner1@acme-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id, companyId: user.companyId } } as never);
    const response = await POST(makeRequest("POST", { description: "no name" }));
    expect(response.status).toBe(400);
  });

  it("creates a project and adds the creator as the first member", async () => {
    const user = await createOnboardedUser("owner2@acme-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id, companyId: user.companyId } } as never);

    const response = await POST(makeRequest("POST", { name: "Website relaunch", description: "Redesign" }));
    expect(response.status).toBe(201);
    const body = await response.json();

    const project = await prisma.project.findUnique({ where: { id: body.id } });
    expect(project?.name).toBe("Website relaunch");
    expect(project?.createdById).toBe(user.id);
    expect(project?.companyId).toBe(user.companyId);

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: body.id, userId: user.id } },
    });
    expect(membership).not.toBeNull();
  });

  it("rejects a mismatched origin", async () => {
    const user = await createOnboardedUser("owner3@acme-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id, companyId: user.companyId } } as never);
    const response = await POST(makeRequest("POST", { name: "X" }, "http://evil.example.com"));
    expect(response.status).toBe(403);
  });
});

describe("GET /api/projects", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("lists only projects the user is a member of", async () => {
    const user = await createOnboardedUser("lister@acme-corp.com");
    const other = await createOnboardedUser("other@acme-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id, companyId: user.companyId } } as never);

    await POST(makeRequest("POST", { name: "Mine" }));
    vi.mocked(auth).mockResolvedValue({ user: { id: other.id, companyId: other.companyId } } as never);
    await POST(makeRequest("POST", { name: "Not mine" }));

    vi.mocked(auth).mockResolvedValue({ user: { id: user.id, companyId: user.companyId } } as never);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].name).toBe("Mine");
  });
});
