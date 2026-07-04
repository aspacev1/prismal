import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { POST } from "@/app/api/onboarding/route";

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
