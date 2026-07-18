// Per-epic color assignment for the Gantt/Roadmap views.
//
// Each epic (a Task row with kind "category") gets a color triad; every
// descendant task/subtask/milestone inherits its epic's triad so hue reads
// as "which epic does this belong to" across the chart, sidebar, and list.
// See docs/superpowers/specs/2026-07-18-gantt-epic-color-redesign-design.md.

export type EpicColor = {
  // Saturated hue: solid progress segment, stripes, dots, milestone diamonds.
  main: string;
  // Light wash of the same hue: bar remainder, sidebar/list chip background.
  tint: string;
  // Darkened to clear 4.5:1 on white: chip text, on-tint labels, ghost borders.
  dark: string;
};

// Curated, hand-tuned triads rather than derived ones: the app is light-mode
// only, and hand-tuning is the only way to guarantee both tint legibility
// against weekend shading and 4.5:1 text contrast for the dark variant of
// every hue. First entry is brand blue so epic #1 ties to the brand; the
// order alternates hue families so adjacent epics stay distinct. Error red
// (#DC2F4E, over-budget outline) is deliberately not in the palette.
export const EPIC_PALETTE: EpicColor[] = [
  { main: "#2D6EEF", tint: "#E3ECFE", dark: "#1050CF" }, // blue (brand)
  { main: "#E39A26", tint: "#FBEFD9", dark: "#8F5B08" }, // amber
  { main: "#8961C7", tint: "#EFE9F9", dark: "#6236A8" }, // violet
  { main: "#0FA9C0", tint: "#DCF4F8", dark: "#087285" }, // teal
  { main: "#D9679F", tint: "#FAE7F1", dark: "#B02D6E" }, // pink
  { main: "#37A169", tint: "#DFF2E9", dark: "#1F7248" }, // green
  { main: "#5B63D6", tint: "#E7E9FA", dark: "#3A41B5" }, // indigo
  { main: "#E06655", tint: "#FBE8E5", dark: "#B03A28" }, // coral
];

// Tasks that can't be traced to a category (orphans, cycles) fall back to a
// neutral slate triad rather than borrowing a real epic's hue.
export const FALLBACK_EPIC_COLOR: EpicColor = {
  main: "#98A2B3",
  tint: "#EEF0F4",
  dark: "#475467",
};

export function epicColorAt(index: number): EpicColor {
  const i = ((index % EPIC_PALETTE.length) + EPIC_PALETTE.length) % EPIC_PALETTE.length;
  return EPIC_PALETTE[i];
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (c: number) => Math.min(255, Math.max(0, Math.round(c)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((c) => c.toString(16).padStart(2, "0").toUpperCase())
      .join("")
  );
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1 / 3) * 255,
  ];
}

// Builds a triad from an arbitrary #RRGGBB (user override stored in
// Task.color). If the hex matches a curated palette entry's main color, the
// curated triad is returned so hand-tuned tint/dark values win. Otherwise:
// tint = 85% mix toward white, dark = lightness clamped to <= 0.34 (keeps
// text contrast on white).
export function deriveTriad(hex: string): EpicColor {
  const rgb = hexToRgb(hex);
  if (!rgb) return FALLBACK_EPIC_COLOR;
  const normalized = rgbToHex(rgb[0], rgb[1], rgb[2]);
  const curated = EPIC_PALETTE.find((c) => c.main.toUpperCase() === normalized);
  if (curated) return curated;

  const [r, g, b] = rgb;
  const tint = rgbToHex(r + (255 - r) * 0.85, g + (255 - g) * 0.85, b + (255 - b) * 0.85);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [dr, dg, db] = hslToRgb(h, s, Math.min(l, 0.34));
  const dark = rgbToHex(dr, dg, db);
  return { main: normalized, tint, dark };
}

export type EpicColorInput = {
  id: string;
  kind: string;
  order: number;
  color: string | null;
  parentId: string | null;
};

// Maps EVERY task id to its epic's triad. Categories are colored by their
// `order`-sorted index cycling through the palette (a stored Task.color on
// the category overrides via deriveTriad); descendants inherit by walking
// parentId up to their category. Orphans and parentId cycles resolve to
// FALLBACK_EPIC_COLOR instead of hanging.
export function assignEpicColors(tasks: EpicColorInput[]): Record<string, EpicColor> {
  const byId = new Map<string, EpicColorInput>();
  for (const t of tasks) byId.set(t.id, t);

  const result: Record<string, EpicColor> = {};
  const categories = tasks
    .filter((t) => t.kind === "category")
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  categories.forEach((cat, i) => {
    result[cat.id] = cat.color ? deriveTriad(cat.color) : epicColorAt(i);
  });

  for (const t of tasks) {
    if (t.kind === "category") continue;
    let current: EpicColorInput | undefined = t;
    const visited = new Set<string>();
    let resolved = FALLBACK_EPIC_COLOR;
    while (current) {
      if (visited.has(current.id)) break; // parentId cycle — bail out
      visited.add(current.id);
      if (current.kind === "category" && result[current.id]) {
        resolved = result[current.id];
        break;
      }
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    result[t.id] = resolved;
  }
  return result;
}

export function resolveEpicColor(
  task: { id: string },
  map: Record<string, EpicColor>
): EpicColor {
  return map[task.id] ?? FALLBACK_EPIC_COLOR;
}
