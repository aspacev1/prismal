import { z } from "zod";
import freeEmailDomains from "free-email-domains";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isCorporateEmail(email: string): boolean {
  const domain = normalizeEmail(email).split("@")[1];
  if (!domain) return false;
  return !freeEmailDomains.includes(domain);
}

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

export const registerSchema = z.object({
  email: emailSchema.refine(isCorporateEmail, { message: "please use only corporate email" }),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const onboardingSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  department: z.string().trim().min(1),
  position: z.string().trim().min(1),
  companyName: z.string().trim().min(1).optional(),
  inviteToken: z.string().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

export const inviteEmailListSchema = z.object({
  emails: z.array(emailSchema).min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type InviteEmailListInput = z.infer<typeof inviteEmailListSchema>;
