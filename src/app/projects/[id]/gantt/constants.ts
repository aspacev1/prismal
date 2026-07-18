export const DAY_WIDTH = 36;
export const ROW_HEIGHT = 48;
export const SUB_ROW_HEIGHT = 40;
export const HEADER_HEIGHT = 52;
// Header day numbers and body gridlines render only every N days — the
// per-day cells (and all DAY_WIDTH drag math) are unchanged; only which
// cells get a label/line is sparser. Index-anchored to the range start.
export const TICK_INTERVAL_DAYS = 4;
// Bar heights: tall enough for an on-bar status label (tasks) per the
// epic-color redesign; categories render as a slim background pill.
export const BAR_HEIGHT_TASK = 22;
export const BAR_HEIGHT_SUBTASK = 16;
export const BAR_HEIGHT_CATEGORY = 18;
// Below this bar width the on-bar status label is hidden (tooltip remains).
export const MIN_LABEL_BAR_WIDTH = 76;
export const SIDEBAR_WIDTH = 280;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 440;
export const SIDEBAR_DEFAULT_WIDTH = 280;
export const SIDEBAR_COLLAPSED_WIDTH = 44;
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

// Bars render in their epic's color (see src/lib/epicPalette.ts): a solid
// segment sized by `progress` over a light tint of the same hue, with the
// status carried by an on-bar label and a status-colored end dot — see
// docs/superpowers/specs/2026-07-18-gantt-epic-color-redesign-design.md
// (which reverses the earlier gradient/opacity encoding).
//
// Statuses that are exceptions rather than progress stages — their on-bar
// label renders in the status's own color (not white/epic-dark) so
// "delayed"/"blocked" stay flagged regardless of the progress fill.
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