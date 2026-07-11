import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/register/route";
import { prisma } from "@/lib/prisma";

function makeRequest(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/register", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("POST /api/register", () => {
  it("creates a user with a hashed password", async () => {
    const response = await POST(makeRequest({ email: "new@example.com", password: "longenough" }));
    expect(response.status).toBe(201);

    const user = await prisma.user.findUnique({ where: { email: "new@example.com" } });
    expect(user).not.toBeNull();
    expect(user?.passwordHash).not.toBe("longenough");
    expect(user?.onboardingComplete).toBe(false);
  });

  it("rejects a duplicate email, case-insensitively", async () => {
    await POST(makeRequest({ email: "dup@example.com", password: "longenough" }));
    const response = await POST(makeRequest({ email: "DUP@Example.com", password: "anotherpass" }));
    expect(response.status).toBe(409);

    const users = await prisma.user.findMany({ where: { email: "dup@example.com" } });
    expect(users).toHaveLength(1);
  });

  it("rejects invalid input", async () => {
    const response = await POST(makeRequest({ email: "not-an-email", password: "short" }));
    expect(response.status).toBe(400);
  });

  it("rejects a free-email-provider address with the corporate-only message", async () => {
    const response = await POST(makeRequest({ email: "person@gmail.com", password: "longenough" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Please use a corporate email address.");

    const user = await prisma.user.findUnique({ where: { email: "person@gmail.com" } });
    expect(user).toBeNull();
  });

  it("rejects a mismatched origin", async () => {
    const response = await POST(
      makeRequest({ email: "csrf@example.com", password: "longenough" }, "http://evil.example.com")
    );
    expect(response.status).toBe(403);
  });
});
