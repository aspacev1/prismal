import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { authenticateUser } from "@/lib/authenticateUser";

async function createUser(email: string, password: string) {
  return prisma.user.create({ data: { email, passwordHash: await hashPassword(password) } });
}

describe("authenticateUser", () => {
  it("returns the user when the password is correct", async () => {
    await createUser("login1@example.com", "correcthorse");
    const result = await authenticateUser("login1@example.com", "correcthorse");
    expect(result?.email).toBe("login1@example.com");
  });

  it("returns null for an incorrect password", async () => {
    await createUser("login2@example.com", "correcthorse");
    const result = await authenticateUser("login2@example.com", "wrongpassword");
    expect(result).toBeNull();
  });

  it("returns null for an unknown email", async () => {
    const result = await authenticateUser("nobody@example.com", "whatever1");
    expect(result).toBeNull();
  });

  it("matches an email regardless of casing", async () => {
    await createUser("login3@example.com", "correcthorse");
    const result = await authenticateUser("Login3@Example.com", "correcthorse");
    expect(result?.email).toBe("login3@example.com");
  });
});
