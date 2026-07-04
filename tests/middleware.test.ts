import { describe, it, expect } from "vitest";
import { evaluateGate } from "@/middleware";

describe("evaluateGate", () => {
  it("allows public paths through with no session", () => {
    expect(evaluateGate("/login", null)).toBeNull();
    expect(evaluateGate("/register", null)).toBeNull();
    expect(evaluateGate("/register/success", null)).toBeNull();
    expect(evaluateGate("/api/health", null)).toBeNull();
  });

  it("redirects an unauthenticated user hitting a protected path to /login", () => {
    expect(evaluateGate("/workspace", null)).toBe("/login");
  });

  it("redirects an authenticated user who hasn't finished onboarding to /onboarding", () => {
    expect(evaluateGate("/workspace", { onboardingComplete: false })).toBe("/onboarding");
  });

  it("does not redirect an authenticated, onboarded user", () => {
    expect(evaluateGate("/workspace", { onboardingComplete: true })).toBeNull();
  });

  it("does not redirect a user with incomplete onboarding away from /onboarding itself", () => {
    expect(evaluateGate("/onboarding", { onboardingComplete: false })).toBeNull();
  });
});
