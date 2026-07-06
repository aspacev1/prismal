export const DAY_WIDTH = 36;
export const ROW_HEIGHT = 44;
export const SUB_ROW_HEIGHT = 38;
export const HEADER_HEIGHT = 52;
export const SIDEBAR_WIDTH = 280;
export const DETAIL_PANEL_WIDTH = 360;

export const HOURS_PER_DAY = 8;

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "delayed"
  | "blocked"
  | "completed"
  | "archived";

export type TaskPriority = "low" | "medium" | "high" | "critical";

// `fill` is the soft/pastel color used for decorative elements (status dots,
// bar tints) where WCAG's looser 3:1 non-text contrast applies. `textColor`
// is a darkened version of the same hue, used anywhere the color is applied
// to actual text or an information-bearing icon, so it clears the 4.5:1
// text contrast minimum against a white/near-white background.
export const STATUSES: Record<TaskStatus, { label: string; fill: string; textColor: string }> = {
  todo: { label: "To do", fill: "#A8B3C5", textColor: "#61779B" },
  in_progress: { label: "In progress", fill: "#7C95E0", textColor: "#496FE0" },
  in_review: { label: "In review", fill: "#A98FD1", textColor: "#8961C7" },
  delayed: { label: "Delayed", fill: "#E0B57A", textColor: "#A1681B" },
  blocked: { label: "Blocked", fill: "#E0909F", textColor: "#D53A57" },
  completed: { label: "Completed", fill: "#82C2A0", textColor: "#38825B" },
  archived: { label: "Archived", fill: "#D5D9E0", textColor: "#677692" },
};

// Task/subtask Gantt bars now render as the brand gradient at an opacity
// reflecting status, replacing per-status bar color as the status signal.
// `delayed`/`blocked` are exceptions (not points on a progress ladder) and
// always render fully opaque so they visually demand attention regardless
// of actual progress — see docs/superpowers/specs/2026-07-06-roadmap-brand-alignment-design.md.
export const STATUS_BAR_OPACITY: Record<TaskStatus, number> = {
  todo: 0.25,
  in_progress: 0.5,
  in_review: 0.7,
  delayed: 1,
  blocked: 1,
  completed: 1,
  archived: 0.15,
};

// Statuses that are exceptions rather than progress stages — these keep a
// small StatusDot on the bar itself (in addition to full opacity) since
// opacity alone can't distinguish "delayed" from "completed" at 1.0.
export const EXCEPTION_STATUSES: TaskStatus[] = ["delayed", "blocked"];

export const STATUS_LIST: TaskStatus[] = [
  "todo",
  "in_progress",
  "in_review",
  "delayed",
  "blocked",
  "completed",
  "archived",
];

export const PRIORITIES: Record<
  TaskPriority,
  { label: string; color: string; textColor: string; filled: boolean; pulse: boolean }
> = {
  low: { label: "Low", color: "#A8B3C5", textColor: "#61779B", filled: false, pulse: false },
  medium: { label: "Medium", color: "#8AA0DE", textColor: "#496ED8", filled: true, pulse: false },
  high: { label: "High", color: "#E0A571", textColor: "#B2611B", filled: true, pulse: false },
  critical: { label: "Critical", color: "#D17E8C", textColor: "#C9485E", filled: true, pulse: true },
};

export const PRIORITY_LIST: TaskPriority[] = ["low", "medium", "high", "critical"];

export function isStatus(s: string): s is TaskStatus {
  return Object.prototype.hasOwnProperty.call(STATUSES, s);
}

export function isPriority(p: string): p is TaskPriority {
  return Object.prototype.hasOwnProperty.call(PRIORITIES, p);
}

export function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .map((p) => p[0].toUpperCase())
    .slice(0, 2)
    .join("");
}

export function userInitials(first?: string | null, last?: string | null): string {
  const parts = [first, last].filter(Boolean) as string[];
  if (parts.length === 0) return "?";
  return parts
    .map((p) => p[0].toUpperCase())
    .slice(0, 2)
    .join("");
}

export function userFullName(first?: string | null, last?: string | null, email?: string | null): string {
  const parts = [first, last].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(" ");
  return email ?? "Unknown";
}