// Working-day date utilities matching the reference repo design.
// Duration is expressed in working days (Mon-Fri). End dates are computed by
// skipping weekends.

export const HOURS_PER_DAY = 8;

export function daysBetween(a: Date | string, b: Date | string): number {
  return Math.round((new Date(b).valueOf() - new Date(a).valueOf()) / (1000 * 60 * 60 * 24));
}

// Dates are stored and compared as UTC-midnight calendar dates. All date math
// below operates in UTC so a task on a given calendar day renders on that same
// day regardless of the viewer's timezone (a local-time getDay/getDate would
// shift a UTC-midnight date to the previous day west of UTC).
export function addDays(date: Date | string, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

export function isoDate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function isWeekend(d: Date | string): boolean {
  const day = new Date(d).getUTCDay();
  return day === 0 || day === 6;
}

export function workEndDate(start: Date | string, duration: number): Date {
  if (duration <= 0) return new Date(start);
  let d = new Date(start);
  while (isWeekend(d)) d = addDays(d, 1);
  let remaining = duration - 1;
  while (remaining > 0) {
    d = addDays(d, 1);
    if (!isWeekend(d)) remaining--;
  }
  return d;
}

export function workDaysBetween(a: Date | string, b: Date | string): number {
  let start = new Date(a);
  let end = new Date(b);
  if (end < start) return -workDaysBetween(end, start);
  let count = 0;
  let d = new Date(start);
  while (d <= end) {
    if (!isWeekend(d)) count++;
    d = addDays(d, 1);
  }
  return count;
}

export function currentEndDate(item: {
  startDate: Date | string | null;
  durationDays: number;
}): Date {
  const start = item.startDate ? new Date(item.startDate) : new Date();
  return workEndDate(start, item.durationDays);
}

export function isOverEstimate(durationDays: number, loggedHours: number): boolean {
  return durationDays > 0 && loggedHours > durationDays * HOURS_PER_DAY;
}

export function isExtended(originalEndDate: Date | string | null, currentEnd: Date | string): boolean {
  if (!originalEndDate) return false;
  return daysBetween(new Date(originalEndDate), new Date(currentEnd)) > 0;
}

export function isAhead(originalEndDate: Date | string | null, currentEnd: Date | string): boolean {
  if (!originalEndDate) return false;
  return daysBetween(new Date(currentEnd), new Date(originalEndDate)) > 0;
}

export function isShifted(
  originalEndDate: Date | string | null,
  currentEnd: Date | string,
  currentDuration: number,
  originalDuration: number
): boolean {
  if (!originalEndDate) return false;
  // Shifted: currentEnd > originalEndDate but duration didn't increase
  return isExtended(originalEndDate, currentEnd) && currentDuration <= originalDuration;
}

export function extensionDays(originalEndDate: Date | string | null, currentEnd: Date | string): number {
  if (!originalEndDate) return 0;
  return daysBetween(new Date(originalEndDate), new Date(currentEnd));
}

export function getToday(): Date {
  // The viewer's local calendar date, expressed as a UTC-midnight instant to
  // match how task dates are stored and compared.
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}