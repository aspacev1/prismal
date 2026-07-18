// Default scheduling for tasks created with only a name.
//
// A task row with no bar reads as a bug, so creation always resolves a start
// date + duration immediately. Those dates are a system guess and are stored
// with scheduleStatus "estimated" (rendered as a ghost bar) until the user
// commits real dates by dragging, resizing, or editing them.
//
// Durations are working days (Mon–Fri) via the shared dateUtils helpers.
// "Today" must be computed with getToday() (the viewer's local calendar day
// as a UTC-midnight instant) and passed in, so this module stays pure and
// testable.

import { addDays, isWeekend, workEndDate } from "@/lib/dateUtils";

export const DEFAULT_DURATION_DAYS = 1;

/** The given day, or the next Monday if it falls on a weekend. */
export function nextWorkingDay(d: Date | string): Date {
  let day = new Date(d);
  while (isWeekend(day)) day = addDays(day, 1);
  return day;
}

export type ScheduleAnchor = {
  startDate: Date | string | null;
  durationDays: number;
};

export type DefaultScheduleContext = {
  /** The sibling row directly above the new task (same parent), if any. */
  siblingAbove?: ScheduleAnchor | null;
  /** The parent's date window (a category rollup or a parent task's own dates). */
  parentWindow?: { startDate: Date | string | null; endDate?: Date | string | null } | null;
  /** Project date range, used to clamp "today" for fallback scheduling. */
  projectStartDate?: Date | string | null;
  projectEndDate?: Date | string | null;
  /** The viewer's current calendar day (getToday()). */
  today: Date;
};

/**
 * Resolve default dates for a task created with only a name.
 *
 * Priority:
 * 1. Sibling directly above with dates → next working day after its end, so
 *    rapid sequential entry produces a cascade of bars.
 * 2. Parent with a start date → the parent's start, clamped inside the
 *    parent's window.
 * 3. Today — clamped to the project start if today falls outside the
 *    project's date range.
 *
 * The result always lands on a working day and is never null.
 */
export function resolveDefaultSchedule(context: DefaultScheduleContext): {
  startDate: Date;
  durationDays: number;
} {
  const { siblingAbove, parentWindow, projectStartDate, projectEndDate, today } = context;

  let start: Date | null = null;

  if (siblingAbove?.startDate) {
    // Chain from the sibling's end — even if the sibling is itself estimated
    // (a cascade of estimates is fine). A zero-duration sibling (milestone)
    // ends on its own date.
    const siblingEnd = workEndDate(new Date(siblingAbove.startDate), siblingAbove.durationDays);
    start = nextWorkingDay(addDays(siblingEnd, 1));
  } else if (parentWindow?.startDate) {
    // Start at the parent's start, clamped inside the parent's window: if
    // skipping a weekend would push past the parent's end, keep the raw
    // parent start rather than spill outside the window.
    const parentStart = new Date(parentWindow.startDate);
    start = nextWorkingDay(parentStart);
    if (parentWindow.endDate && start > new Date(parentWindow.endDate)) {
      start = parentStart;
    }
  } else {
    start = today;
    const projStart = projectStartDate ? new Date(projectStartDate) : null;
    const projEnd = projectEndDate ? new Date(projectEndDate) : null;
    const outsideRange =
      (projStart && start < projStart) || (projEnd && start > projEnd);
    if (projStart && outsideRange) start = projStart;
    start = nextWorkingDay(start);
  }

  return { startDate: start, durationDays: DEFAULT_DURATION_DAYS };
}
