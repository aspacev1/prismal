import type { TaskRow } from "./types";
import { workEndDate } from "@/lib/dateUtils";

export type Rollup = {
  startDate: Date | null;
  endDate: Date | null;
  progress: number;
};

/**
 * Compute a category's rolled-up date range and progress from its children.
 * - startDate = earliest child start date
 * - endDate = latest child end date (computed via workEndDate)
 * - progress = duration-weighted average (longer tasks weigh more)
 *
 * Only planned children (startDate set + durationDays > 0) contribute.
 * Unplanned children are skipped entirely.
 */
export function rollupChildren(children: TaskRow[]): Rollup {
  let minStart: Date | null = null;
  let maxEnd: Date | null = null;
  let weightedProgress = 0;
  let totalDuration = 0;

  for (const c of children) {
    // Skip unplanned tasks entirely — they don't contribute dates or progress.
    if (!c.startDate || c.durationDays <= 0) continue;

    const s = new Date(c.startDate);
    const e = workEndDate(s, c.durationDays);

    if (!minStart || s < minStart) minStart = s;
    if (!maxEnd || e > maxEnd) maxEnd = e;

    // Duration-weighted progress: a 5-day task at 80% counts 5x more than a 1-day task at 20%.
    weightedProgress += c.progress * c.durationDays;
    totalDuration += c.durationDays;
  }

  return {
    startDate: minStart,
    endDate: maxEnd,
    progress: totalDuration > 0 ? Math.round(weightedProgress / totalDuration) : 0,
  };
}