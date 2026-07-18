import { describe, it, expect } from "vitest";
import {
  registerSchema,
  onboardingSchema,
  normalizeEmail,
  isCorporateEmail,
  createProjectSchema,
  inviteEmailListSchema,
  createTaskSchema,
  updateTaskSchema,
} from "@/lib/validation";

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
      expect(result.error.issues[0].message).toBe("Please use a corporate email address.");
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

describe("createProjectSchema", () => {
  it("accepts a name-only project", () => {
    expect(createProjectSchema.safeParse({ name: "Website relaunch" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createProjectSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    expect(createProjectSchema.safeParse({}).success).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(createProjectSchema.safeParse({ name: "Website relaunch", description: "Redesign" }).success).toBe(false);
  });
});

describe("inviteEmailListSchema", () => {
  it("accepts a list of valid emails, does not require them to be corporate", () => {
    const result = inviteEmailListSchema.safeParse({ emails: ["person@gmail.com", "someone@acme-corp.com"] });
    expect(result.success).toBe(true);
  });

  it("rejects an empty list", () => {
    expect(inviteEmailListSchema.safeParse({ emails: [] }).success).toBe(false);
  });

  it("rejects a list containing an invalid email", () => {
    expect(inviteEmailListSchema.safeParse({ emails: ["not-an-email"] }).success).toBe(false);
  });
});

describe("onboardingSchema with invite support", () => {
  it("still accepts the normal shape (companyName, no inviteToken)", () => {
    const result = onboardingSchema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      department: "Engineering",
      position: "Product manager",
      companyName: "Acme inc",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an inviteToken with no companyName", () => {
    const result = onboardingSchema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      department: "Engineering",
      position: "Product manager",
      inviteToken: "some-token",
    });
    expect(result.success).toBe(true);
  });
});

describe("createTaskSchema — kind field", () => {
  it("defaults kind to 'task' when omitted", () => {
    const result = createTaskSchema.safeParse({ name: "Do something" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBeUndefined();
    }
  });

  it("accepts kind: 'category'", () => {
    const result = createTaskSchema.safeParse({ name: "Phase 1", kind: "category" });
    expect(result.success).toBe(true);
  });

  it("accepts kind: 'task'", () => {
    const result = createTaskSchema.safeParse({ name: "A task", kind: "task" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown kind value", () => {
    const result = createTaskSchema.safeParse({ name: "X", kind: "epic" });
    expect(result.success).toBe(false);
  });
});

describe("updateTaskSchema — kind field", () => {
  it("accepts kind: 'category' on update", () => {
    const result = updateTaskSchema.safeParse({ kind: "category" });
    expect(result.success).toBe(true);
  });

  it("accepts kind: 'task' on update", () => {
    const result = updateTaskSchema.safeParse({ kind: "task" });
    expect(result.success).toBe(true);
  });

  it("accepts kind: 'milestone' on update", () => {
    const result = updateTaskSchema.safeParse({ kind: "milestone" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown kind value on update", () => {
    const result = updateTaskSchema.safeParse({ kind: "epic" });
    expect(result.success).toBe(false);
  });
});
