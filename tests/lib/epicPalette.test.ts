import { describe, it, expect } from "vitest";
import {
  EPIC_PALETTE,
  FALLBACK_EPIC_COLOR,
  epicColorAt,
  deriveTriad,
  assignEpicColors,
  resolveEpicColor,
  type EpicColorInput,
} from "@/lib/epicPalette";

const HEX = /^#[0-9A-F]{6}$/;

function row(overrides: Partial<EpicColorInput> & { id: string }): EpicColorInput {
  return { kind: "task", order: 0, color: null, parentId: null, ...overrides };
}

describe("epicColorAt", () => {
  it("cycles past the palette length", () => {
    expect(epicColorAt(EPIC_PALETTE.length)).toEqual(EPIC_PALETTE[0]);
    expect(epicColorAt(EPIC_PALETTE.length + 2)).toEqual(EPIC_PALETTE[2]);
  });

  it("handles negative indices without throwing", () => {
    expect(epicColorAt(-1)).toEqual(EPIC_PALETTE[EPIC_PALETTE.length - 1]);
  });
});

describe("deriveTriad", () => {
  it("returns the curated triad when the hex matches a palette main color", () => {
    expect(deriveTriad("#2d6eef")).toEqual(EPIC_PALETTE[0]);
    expect(deriveTriad("#E06655")).toEqual(EPIC_PALETTE[7]);
  });

  it("produces valid hex triads for arbitrary colors", () => {
    const triad = deriveTriad("#4A90D9");
    expect(triad.main).toMatch(HEX);
    expect(triad.tint).toMatch(HEX);
    expect(triad.dark).toMatch(HEX);
  });

  it("lightens the tint and darkens the dark variant", () => {
    const triad = deriveTriad("#4A90D9");
    const luminance = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 0xff) + ((n >> 8) & 0xff) + (n & 0xff);
    };
    expect(luminance(triad.tint)).toBeGreaterThan(luminance(triad.main));
    expect(luminance(triad.dark)).toBeLessThan(luminance(triad.main));
  });

  it("falls back to neutral on malformed input", () => {
    expect(deriveTriad("not-a-color")).toEqual(FALLBACK_EPIC_COLOR);
  });
});

describe("assignEpicColors", () => {
  it("assigns palette colors to categories by order and cascades to descendants", () => {
    const map = assignEpicColors([
      row({ id: "cat-b", kind: "category", order: 2 }),
      row({ id: "cat-a", kind: "category", order: 1 }),
      row({ id: "task-1", parentId: "cat-a" }),
      row({ id: "sub-1", parentId: "task-1" }),
      row({ id: "task-2", parentId: "cat-b" }),
    ]);
    expect(map["cat-a"]).toEqual(EPIC_PALETTE[0]);
    expect(map["cat-b"]).toEqual(EPIC_PALETTE[1]);
    expect(map["task-1"]).toEqual(EPIC_PALETTE[0]);
    expect(map["sub-1"]).toEqual(EPIC_PALETTE[0]);
    expect(map["task-2"]).toEqual(EPIC_PALETTE[1]);
  });

  it("is stable regardless of input array ordering", () => {
    const tasks = [
      row({ id: "cat-a", kind: "category", order: 1 }),
      row({ id: "cat-b", kind: "category", order: 2 }),
    ];
    const forward = assignEpicColors(tasks);
    const reversed = assignEpicColors([...tasks].reverse());
    expect(forward).toEqual(reversed);
  });

  it("wraps hues when there are more categories than palette entries", () => {
    const cats = Array.from({ length: EPIC_PALETTE.length + 1 }, (_, i) =>
      row({ id: `cat-${i}`, kind: "category", order: i })
    );
    const map = assignEpicColors(cats);
    expect(map[`cat-${EPIC_PALETTE.length}`]).toEqual(EPIC_PALETTE[0]);
  });

  it("applies a category color override to the category and all descendants", () => {
    const map = assignEpicColors([
      row({ id: "cat", kind: "category", order: 1, color: "#4A90D9" }),
      row({ id: "task", parentId: "cat" }),
      row({ id: "sub", parentId: "task" }),
    ]);
    const triad = deriveTriad("#4A90D9");
    expect(map["cat"]).toEqual(triad);
    expect(map["task"]).toEqual(triad);
    expect(map["sub"]).toEqual(triad);
  });

  it("ignores a color set on a non-category task for hue assignment", () => {
    const map = assignEpicColors([
      row({ id: "cat", kind: "category", order: 1 }),
      row({ id: "task", parentId: "cat", color: "#FF0000" }),
    ]);
    expect(map["task"]).toEqual(EPIC_PALETTE[0]);
  });

  it("returns the neutral fallback for orphans and parentId cycles", () => {
    const map = assignEpicColors([
      row({ id: "orphan" }),
      row({ id: "loop-a", parentId: "loop-b" }),
      row({ id: "loop-b", parentId: "loop-a" }),
    ]);
    expect(map["orphan"]).toEqual(FALLBACK_EPIC_COLOR);
    expect(map["loop-a"]).toEqual(FALLBACK_EPIC_COLOR);
    expect(map["loop-b"]).toEqual(FALLBACK_EPIC_COLOR);
  });
});

describe("resolveEpicColor", () => {
  it("looks up the map and falls back to neutral for unknown ids", () => {
    const map = assignEpicColors([row({ id: "cat", kind: "category", order: 1 })]);
    expect(resolveEpicColor({ id: "cat" }, map)).toEqual(EPIC_PALETTE[0]);
    expect(resolveEpicColor({ id: "missing" }, map)).toEqual(FALLBACK_EPIC_COLOR);
  });
});
