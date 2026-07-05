import { describe, it, expect } from "vitest";
import { generateInviteToken } from "@/lib/inviteToken";

describe("generateInviteToken", () => {
  it("generates a url-safe, reasonably long token", () => {
    const token = generateInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates a different token each call", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});
