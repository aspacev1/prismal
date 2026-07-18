import { describe, it, expect } from "vitest";
import { resolveDefaultSchedule, nextWorkingDay, DEFAULT_TASK_DURATION_DAYS } from "@/lib/scheduleDefaults";
import { isoDate } from "@/lib/dateUtils";

// Fixed calendar anchors (2026): Jan 5 = Monday … Jan 9 = Friday,
// Jan 10/11 = weekend, Jan 12 = Monday.
const MON = new Date("2026-01-05T00:00:00.000Z");
const TUE = new Date("2026-01-06T00:00:00.000Z");
const WED = new Date("2026-01-07T00:00:00.000Z");
const FRI = new Date("2026-01-09T00:00:00.000Z");
const SAT = new Date("2026-01-10T00:00:00.000Z");
const NEXT_MON = new Date("2026-01-12T00:00:00.000Z");

describe("nextWorkingDay", () => {
  it("keeps a weekday", () => {
    expect(isoDate(nextWorkingDay(WED))).toBe(isoDate(WED));
  });

  it("advances a weekend to Monday", () => {
    expect(isoDate(nextWorkingDay(SAT))).toBe(isoDate(NEXT_MON));
  });
});

describe("resolveDefaultSchedule", () => {
  it("empty project: starts today with a 1-working-day duration", () => {
    const r = resolveDefaultSchedule({ siblings: [], today: WED });
    expect(isoDate(r.startDate)).toBe(isoDate(WED));
    expect(r.durationDays).toBe(DEFAULT_TASK_DURATION_DAYS);
  });

  it("today on a weekend advances to the next working day", () => {
    const r = resolveDefaultSchedule({ siblings: [], today: SAT });
    expect(isoDate(r.startDate)).toBe(isoDate(NEXT_MON));
  });

  it("clamps to the project start when today is before it", () => {
    const r = resolveDefaultSchedule({ siblings: [], projectStartDate: WED, today: MON });
    expect(isoDate(r.startDate)).toBe(isoDate(WED));
  });

  it("does not clamp when today is after the project start", () => {
    const r = resolveDefaultSchedule({ siblings: [], projectStartDate: MON, today: WED });
    expect(isoDate(r.startDate)).toBe(isoDate(WED));
  });

  it("chains from the sibling above: next working day after its end", () => {
    const r = resolveDefaultSchedule({
      siblings: [{ startDate: MON, durationDays: 1, order: 0 }],
      today: MON,
    });
    expect(isoDate(r.startDate)).toBe(isoDate(TUE));
  });

  it("sibling ending on Friday chains to Monday (weekend skipped)", () => {
    const r = resolveDefaultSchedule({
      // Mon + 5 working days ends Friday Jan 9.
      siblings: [{ startDate: MON, durationDays: 5, order: 0 }],
      today: MON,
    });
    expect(isoDate(r.startDate)).toBe(isoDate(NEXT_MON));
  });

  it("uses the last sibling by order, not array position", () => {
    const r = resolveDefaultSchedule({
      siblings: [
        { startDate: WED, durationDays: 1, order: 5 },
        { startDate: MON, durationDays: 1, order: 0 },
      ],
      today: MON,
    });
    // Chains from the order-5 sibling (Wed, 1d → ends Wed) → Thu Jan 8.
    expect(isoDate(r.startDate)).toBe("2026-01-08");
  });

  it("ignores dateless/zero-duration siblings and falls through to today", () => {
    const r = resolveDefaultSchedule({
      siblings: [
        { startDate: null, durationDays: 1, order: 0 },
        { startDate: MON, durationDays: 0, order: 1 },
      ],
      today: WED,
    });
    expect(isoDate(r.startDate)).toBe(isoDate(WED));
  });

  it("first subtask starts at the parent's start date", () => {
    const r = resolveDefaultSchedule({
      siblings: [],
      parentStartDate: TUE,
      parentEndDate: FRI,
      today: MON,
    });
    expect(isoDate(r.startDate)).toBe(isoDate(TUE));
  });

  it("parent start on a weekend advances to the next working day", () => {
    const r = resolveDefaultSchedule({
      siblings: [],
      parentStartDate: SAT,
      today: MON,
    });
    expect(isoDate(r.startDate)).toBe(isoDate(NEXT_MON));
  });

  it("sibling chaining wins over the parent window", () => {
    const r = resolveDefaultSchedule({
      siblings: [{ startDate: TUE, durationDays: 1, order: 0 }],
      parentStartDate: TUE,
      parentEndDate: FRI,
      today: MON,
    });
    expect(isoDate(r.startDate)).toBe(isoDate(WED));
  });
});
