import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { POST } from "@/app/api/onboarding/route";
import { generateInviteToken } from "@/lib/inviteToken";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

function makeRequest(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

async function createUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: await hashPassword("longenough") },
  });
}

const validInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  department: "Engineering",
  position: "Product manager",
  companyName: "Acme inc",
};

describe("POST /api/onboarding", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const response = await POST(makeRequest(validInput));
    expect(response.status).toBe(401);
  });

  it("rejects missing fields", async () => {
    const user = await createUser("onboard1@example.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);
    const response = await POST(makeRequest({ ...validInput, position: "" }));
    expect(response.status).toBe(400);
  });

  it("creates a new company and completes onboarding", async () => {
    const user = await createUser("onboard2@example.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);

    const response = await POST(makeRequest(validInput));
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.onboardingComplete).toBe(true);
    expect(updated?.firstName).toBe("Ada");

    const company = await prisma.company.findFirst({ where: { name: "Acme inc" } });
    expect(company).not.toBeNull();
    expect(updated?.companyId).toBe(company?.id);
  });

  it("joins an existing company matched case-insensitively instead of creating a duplicate", async () => {
    const existing = await prisma.company.create({ data: { name: "Acme Inc" } });
    const user = await createUser("onboard3@example.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);

    const response = await POST(makeRequest({ ...validInput, companyName: "acme inc" }));
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.companyId).toBe(existing.id);

    const companies = await prisma.company.findMany({
      where: { name: { equals: "Acme Inc", mode: "insensitive" } },
    });
    expect(companies).toHaveLength(1);
  });

  it("rejects a mismatched origin", async () => {
    const user = await createUser("onboard4@example.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);
    const response = await POST(makeRequest(validInput, "http://evil.example.com"));
    expect(response.status).toBe(403);
  });
});

describe("POST /api/onboarding with inviteToken", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("skips company-name match-or-create and joins the inviter's company + project", async () => {
    const inviterCompany = await prisma.company.create({ data: { name: "Acme inc" } });
    const inviter = await prisma.user.create({
      data: {
        email: "inviter@acme-corp.com",
        passwordHash: await hashPassword("longenough"),
        firstName: "Grace",
        lastName: "Hopper",
        department: "Engineering",
        position: "Engineer",
        companyId: inviterCompany.id,
        onboardingComplete: true,
      },
    });
    const project = await prisma.project.create({
      data: { name: "Website relaunch", createdById: inviter.id, companyId: inviterCompany.id },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: inviter.id } });
    const token = generateInviteToken();
    await prisma.projectInviteLink.create({ data: { projectId: project.id, token, createdById: inviter.id } });

    const newUser = await createUser("newperson@other-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: newUser.id } } as never);

    const response = await POST(
      makeRequest({
        firstName: "New",
        lastName: "Person",
        department: "Design",
        position: "Designer",
        inviteToken: token,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projectId).toBe(project.id);

    const updated = await prisma.user.findUnique({ where: { id: newUser.id } });
    expect(updated?.companyId).toBe(inviterCompany.id);
    expect(updated?.onboardingComplete).toBe(true);

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: newUser.id } },
    });
    expect(membership).not.toBeNull();

    const companies = await prisma.company.findMany();
    expect(companies).toHaveLength(1);
  });

  it("falls back to normal onboarding when the inviteToken is unknown", async () => {
    const newUser = await createUser("fallback@acme-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: newUser.id } } as never);

    const response = await POST(
      makeRequest({
        firstName: "New",
        lastName: "Person",
        department: "Design",
        position: "Designer",
        companyName: "Acme inc",
        inviteToken: "this-token-does-not-exist",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projectId).toBeNull();

    const updated = await prisma.user.findUnique({ where: { id: newUser.id } });
    expect(updated?.onboardingComplete).toBe(true);

    const company = await prisma.company.findFirst({ where: { name: "Acme inc" } });
    expect(updated?.companyId).toBe(company?.id);
  });
});
