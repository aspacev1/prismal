import { describe, it, expect } from "vitest";
import { registerSchema, onboardingSchema, normalizeEmail, isCorporateEmail } from "@/lib/validation";

describe("normalizeEmail", () => {
  it("lowercases and trims the email", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
  });
});

describe("isCorporateEmail", () => {
  it("rejects well-known free email providers", () => {
    expect(isCorporateEmail("person@gmail.com")).toBe(false);
    expect(isCorporateEmail("person@hotmail.com")).toBe(false);
    expect(isCorporateEmail("person@yahoo.com")).toBe(false);
  });

  it("accepts a company domain", () => {
    expect(isCorporateEmail("person@acme-corp.com")).toBe(true);
  });

  it("is case-insensitive on the domain", () => {
    expect(isCorporateEmail("Person@GMAIL.com")).toBe(false);
  });
});

describe("registerSchema", () => {
  it("accepts a valid corporate email and an 8+ character password", () => {
    const result = registerSchema.safeParse({ email: "user@acme-corp.com", password: "longenough" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ email: "not-an-email", password: "longenough" });
    expect(result.success).toBe(false);
  });

  it("rejects a free-email-provider address with the corporate-only message", () => {
    const result = registerSchema.safeParse({ email: "user@gmail.com", password: "longenough" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("please use only corporate email");
    }
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({ email: "user@acme-corp.com", password: "short" });
    expect(result.success).toBe(false);
  });

  it("normalizes email casing and whitespace", () => {
    const result = registerSchema.safeParse({ email: "  User@Acme-Corp.COM  ", password: "longenough" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@acme-corp.com");
    }
  });
});

describe("onboardingSchema", () => {
  const validInput = {
    firstName: "Ada",
    lastName: "Lovelace",
    department: "Engineering",
    position: "Product manager",
    companyName: "Acme inc",
  };

  it("accepts a fully filled form", () => {
    expect(onboardingSchema.safeParse(validInput).success).toBe(true);
  });

  it.each(["firstName", "lastName", "department", "position", "companyName"])(
    "rejects when %s is empty",
    (field) => {
      const result = onboardingSchema.safeParse({ ...validInput, [field]: "" });
      expect(result.success).toBe(false);
    }
  );
});
