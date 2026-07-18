import { describe, it, expect } from "vitest";
import { resolveDefaultSchedule, nextWorkingDay, DEFAULT_DURATION_DAYS } from "@/lib/scheduling";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Fixed reference days (UTC): 2026-07-06 is a Monday, 07-10 a Friday,
// 07-11/12 the weekend, 07-13 the next Monday.
const MON = new Date("2026-07-06");
const FRI = new Date("2026-07-10");
const SAT = new Date("2026-07-11");

describe("nextWorkingDay", () => {
  it("returns a weekday unchanged", () => {
    expect(iso(nextWorkingDay(MON))).toBe("2026-07-06");
  });

  it("rolls a weekend forward to Monday", () => {
    expect(iso(nextWorkingDay(SAT))).toBe("2026-07-13");
    expect(iso(nextWorkingDay(new Date("2026-07-12")))).toBe("2026-07-13");
  });
});

describe("resolveDefaultSchedule", () => {
  it("empty project: defaults to today with a 1-working-day duration", () => {
    const { startDate, durationDays } = resolveDefaultSchedule({ today: MON });
    expect(iso(startDate)).toBe("2026-07-06");
    expect(durationDays).toBe(DEFAULT_DURATION_DAYS);
    expect(durationDays).toBe(1);
  });

  it("today on a weekend rolls to the next working day", () => {
    const { startDate } = resolveDefaultSchedule({ today: SAT });
    expect(iso(startDate)).toBe("2026-07-13");
  });

  it("clamps to project start when today is before the project range", () => {
    const { startDate } = resolveDefaultSchedule({
      today: MON,
      projectStartDate: new Date("2026-08-03"), // a Monday after "today"
      projectEndDate: new Date("2026-09-01"),
    });
    expect(iso(startDate)).toBe("2026-08-03");
  });

  it("clamps to project start when today is after the project range", () => {
    const { startDate } = resolveDefaultSchedule({
      today: MON,
      projectStartDate: new Date("2026-06-01"),
      projectEndDate: new Date("2026-06-30"),
    });
    expect(iso(startDate)).toBe("2026-06-01");
  });

  it("chains from the sibling above: next working day after the sibling's end", () => {
    const { startDate } = resolveDefaultSchedule({
      today: MON,
      siblingAbove: { startDate: MON, durationDays: 2 }, // ends Tue 07-07
    });
    expect(iso(startDate)).toBe("2026-07-08");
  });

  it("sibling chaining skips the weekend", () => {
    const { startDate } = resolveDefaultSchedule({
      today: MON,
      siblingAbove: { startDate: FRI, durationDays: 1 }, // ends Fri 07-10
    });
    expect(iso(startDate)).toBe("2026-07-13"); // Monday, not Saturday
  });

  it("chains from an estimated sibling the same way (cascade of estimates)", () => {
    // The function has no knowledge of scheduleStatus — an estimated sibling's
    // dates chain identically, which is what the cascade behavior requires.
    const first = resolveDefaultSchedule({ today: MON });
    const second = resolveDefaultSchedule({
      today: MON,
      siblingAbove: { startDate: first.startDate, durationDays: first.durationDays },
    });
    expect(iso(second.startDate)).toBe("2026-07-07");
  });

  it("a zero-duration sibling (milestone) chains from its own date", () => {
    const { startDate } = resolveDefaultSchedule({
      today: MON,
      siblingAbove: { startDate: MON, durationDays: 0 },
    });
    expect(iso(startDate)).toBe("2026-07-07");
  });

  it("sibling above takes precedence over the parent window", () => {
    const { startDate } = resolveDefaultSchedule({
      today: MON,
      siblingAbove: { startDate: MON, durationDays: 1 },
      parentWindow: { startDate: new Date("2026-07-20") },
    });
    expect(iso(startDate)).toBe("2026-07-07");
  });

  it("first child under a parent starts at the parent's start", () => {
    const { startDate } = resolveDefaultSchedule({
      today: MON,
      parentWindow: { startDate: new Date("2026-07-20"), endDate: new Date("2026-07-24") },
    });
    expect(iso(startDate)).toBe("2026-07-20");
  });

  it("parent start on a weekend rolls forward but stays clamped inside the window", () => {
    // Parent starts Saturday 07-11; next working day (Mon 07-13) is inside
    // the window, so it wins.
    const rolled = resolveDefaultSchedule({
      today: MON,
      parentWindow: { startDate: SAT, endDate: new Date("2026-07-17") },
    });
    expect(iso(rolled.startDate)).toBe("2026-07-13");

    // Degenerate weekend-only window: rolling forward would spill past the
    // parent's end, so the raw parent start is kept (clamped inside).
    const clamped = resolveDefaultSchedule({
      today: MON,
      parentWindow: { startDate: SAT, endDate: new Date("2026-07-12") },
    });
    expect(iso(clamped.startDate)).toBe("2026-07-11");
  });

  it("never returns null dates", () => {
    const contexts = [
      { today: MON },
      { today: SAT },
      { today: MON, siblingAbove: { startDate: null, durationDays: 0 } },
      { today: MON, parentWindow: { startDate: null } },
    ];
    for (const ctx of contexts) {
      const { startDate, durationDays } = resolveDefaultSchedule(ctx);
      expect(startDate).toBeInstanceOf(Date);
      expect(durationDays).toBeGreaterThan(0);
    }
  });
});
