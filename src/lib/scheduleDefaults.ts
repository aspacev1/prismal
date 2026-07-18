// Default scheduling for tasks created with only a name ("instant ghost bar").
// A new task must always get a start date + duration so a timeline bar can
// render immediately; the resulting schedule is marked `scheduleStatus:
// "estimated"` until the user confirms it by dragging the bar or entering
// dates. Shared by the POST /tasks handler (server-side guarantee) and the
// client (optimistic bar before the server responds).
//
// TODO: durations respect the Mon-Fri working-day calendar from dateUtils;
// there is no holiday / per-project calendar support yet — extend here when
// one exists.

import { addDays, isWeekend, workEndDate, getToday } from "./dateUtils";

export const DEFAULT_TASK_DURATION_DAYS = 1;

export type ScheduleSibling = {
  startDate: Date | string | null;
  durationDays: number;
  order: number;
};

export type DefaultScheduleContext = {
  // Existing children of the same parent (any schedule state; unscheduled or
  // dateless siblings are ignored).
  siblings: ScheduleSibling[];
  // The parent's own window — only meaningful when the parent is a task
  // (subtask creation). Categories derive their dates from children, so a
  // category parent contributes nothing here and the sibling/today rules apply.
  parentStartDate?: Date | string | null;
  parentEndDate?: Date | string | null;
  projectStartDate?: Date | string | null;
  // Injectable for tests; defaults to the viewer's local calendar day.
  today?: Date;
};

// First working day on or after `d`.
export function nextWorkingDay(d: Date): Date {
  let out = new Date(d);
  while (isWeekend(out)) out = addDays(out, 1);
  return out;
}

/**
 * Resolve a default start date + duration for a task created with only a name.
 * Priority:
 *   1. Sibling chaining — start the next working day after the end of the
 *      last scheduled sibling, so rapid entry produces a cascade. (A sibling
 *      whose own dates are estimated still chains; a cascade of estimates is
 *      fine.)
 *   2. Parent window — start at the parent's start date, clamped inside the
 *      parent's window (subtasks under a scheduled task).
 *   3. Today — clamped forward to the project start date if today falls
 *      before it.
 * The resolved start always lands on a working day; duration is 1 working day.
 */
export function resolveDefaultSchedule(ctx: DefaultScheduleContext): {
  startDate: Date;
  durationDays: number;
} {
  const scheduled = ctx.siblings
    .filter((s) => s.startDate !== null && s.durationDays > 0)
    .sort((a, b) => a.order - b.order);
  const above = scheduled[scheduled.length - 1];
  if (above) {
    const end = workEndDate(new Date(above.startDate as Date | string), above.durationDays);
    return {
      startDate: nextWorkingDay(addDays(end, 1)),
      durationDays: DEFAULT_TASK_DURATION_DAYS,
    };
  }

  if (ctx.parentStartDate) {
    let start = new Date(ctx.parentStartDate);
    if (ctx.parentEndDate && start > new Date(ctx.parentEndDate)) {
      start = new Date(ctx.parentEndDate);
    }
    return { startDate: nextWorkingDay(start), durationDays: DEFAULT_TASK_DURATION_DAYS };
  }

  let start = ctx.today ?? getToday();
  if (ctx.projectStartDate && start < new Date(ctx.projectStartDate)) {
    start = new Date(ctx.projectStartDate);
  }
  return { startDate: nextWorkingDay(start), durationDays: DEFAULT_TASK_DURATION_DAYS };
}
