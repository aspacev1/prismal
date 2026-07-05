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

  it("does not redirect /api/onboarding for a user with incomplete onboarding (it's the endpoint that completes it)", () => {
    expect(evaluateGate("/api/onboarding", { onboardingComplete: false })).toBeNull();
    expect(evaluateGate("/api/onboarding", null)).toBeNull();
  });

  it("allows /invite/{token} through regardless of session state", () => {
    expect(evaluateGate("/invite/abc123", null)).toBeNull();
    expect(evaluateGate("/invite/abc123", { onboardingComplete: false })).toBeNull();
    expect(evaluateGate("/invite/abc123", { onboardingComplete: true })).toBeNull();
  });
});
