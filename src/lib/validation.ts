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
}).strict();

export const inviteEmailListSchema = z.object({
  emails: z.array(emailSchema).min(1),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color.").optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
}).strict();

export const updateMemberSchema = z.object({
  blocked: z.boolean().optional(),
  department: z.string().trim().min(1).optional(),
  resetPassword: z.string().min(8).optional(),
});

const TASK_STATUSES = [
  "todo",
  "in_progress",
  "in_review",
  "delayed",
  "blocked",
  "completed",
  "archived",
] as const;
const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;
const TASK_KINDS = ["category", "task"] as const;

export const createTaskSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  kind: z.enum(TASK_KINDS).optional(),
  startDate: z.string().datetime().optional().nullable(),
  durationDays: z.number().int().min(0).max(365).optional(),
  loggedHours: z.number().min(0).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  order: z.number().int().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color.").optional().nullable(),
  isMilestone: z.boolean().optional(),
  parentId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
}).strict();

export const updateTaskSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  kind: z.enum(TASK_KINDS).optional(),
  startDate: z.string().datetime().optional().nullable(),
  durationDays: z.number().int().min(0).max(365).optional(),
  loggedHours: z.number().min(0).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  order: z.number().int().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color.").optional().nullable(),
  isMilestone: z.boolean().optional(),
  parentId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  confirmedDelay: z.boolean().optional(),
  reason: z.string().trim().optional(),
}).strict();

export const TASK_HISTORY_FIELDS = [
  "name",
  "startDate",
  "durationDays",
  "loggedHours",
  "status",
  "priority",
  "assigneeId",
  "description",
  "progress",
] as const;

export const TASK_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  startDate: "Start date",
  durationDays: "Duration",
  loggedHours: "Logged hours",
  status: "Status",
  priority: "Priority",
  assigneeId: "Assignee",
  description: "Description",
  progress: "Progress",
};

export const createDependencySchema = z.object({
  predecessorId: z.string().min(1),
  successorId: z.string().min(1),
}).strict();

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty."),
  mentions: z.array(z.string()).optional(),
}).strict();

export const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1), order: z.number().int() })).min(1),
}).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type InviteEmailListInput = z.infer<typeof inviteEmailListSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateDependencyInput = z.infer<typeof createDependencySchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;
