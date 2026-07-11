import { describe, it, expect } from "vitest";
import { addDays, isWeekend, workEndDate, workDaysBetween, daysBetween, getToday } from "@/lib/dateUtils";

// Task dates are stored as UTC-midnight calendar dates. These helpers must
// operate in UTC so a date renders on the same calendar day regardless of the
// viewer's timezone (the vitest process may run in any TZ).
describe("dateUtils UTC semantics", () => {
  it("treats a UTC-midnight date's weekday in UTC", () => {
    // 2026-07-06 is a Monday in UTC.
    expect(isWeekend(new Date("2026-07-06"))).toBe(false);
    // 2026-07-04 is a Saturday, 2026-07-05 a Sunday.
    expect(isWeekend(new Date("2026-07-04"))).toBe(true);
    expect(isWeekend(new Date("2026-07-05"))).toBe(true);
  });

  it("addDays advances the UTC calendar day", () => {
    const d = addDays(new Date("2026-07-06"), 1);
    expect(d.toISOString().slice(0, 10)).toBe("2026-07-07");
  });

  it("workEndDate skips weekends", () => {
    // Start Monday 2026-07-06, 5 working days -> Friday 2026-07-10.
    const end = workEndDate(new Date("2026-07-06"), 5);
    expect(end.toISOString().slice(0, 10)).toBe("2026-07-10");
  });

  it("workDaysBetween counts inclusive working days", () => {
    // Mon 07-06 -> Fri 07-10 inclusive = 5 working days.
    expect(workDaysBetween(new Date("2026-07-06"), new Date("2026-07-10"))).toBe(5);
    // Across a weekend: Fri 07-10 -> Mon 07-13 inclusive = 2 working days.
    expect(workDaysBetween(new Date("2026-07-10"), new Date("2026-07-13"))).toBe(2);
  });

  it("getToday returns a UTC-midnight instant", () => {
    const t = getToday();
    expect(t.getUTCHours()).toBe(0);
    expect(t.getUTCMinutes()).toBe(0);
    expect(t.getUTCSeconds()).toBe(0);
    expect(daysBetween(t, t)).toBe(0);
  });
});
