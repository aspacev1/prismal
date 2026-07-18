# Gantt Epic-Color Redesign

**Goal:** Recolor the Roadmap/Gantt so that **hue identifies the epic** — every category and all of its descendant tasks, subtasks, and milestones share one color family — and declutter the chart surface (sparser gridlines, softer today marker, group-level separators) toward an airier reference design supplied by the product owner.

**Context:** This spec **reverses two decisions** of [`2026-07-06-roadmap-brand-alignment-design.md`](./2026-07-06-roadmap-brand-alignment-design.md), per product-owner direction:

- §2 (bars = brand gradient + status-encoded opacity) is replaced by per-epic color with a progress-split fill. `STATUS_BAR_OPACITY` is removed from `gantt/constants.ts`.
- §4 (three-tier left-border stripes: indigo category / blue task / transparent subtask) is replaced by a single category stripe in the epic's hue; tasks and subtasks have no stripe — the epic chip and bar hues now carry grouping.

Status colors themselves (`STATUSES`/`PRIORITIES`) remain untouched, consistent with every prior palette spec — only where and how they appear changes.

## 1. Palette (`src/lib/epicPalette.ts`)

A curated 8-triad palette, cycled across categories by `order`-sorted index (wrapping past 8). Each triad is hand-tuned rather than derived: `main` (saturated hue: progress segment, stripes, milestone diamonds), `tint` (light wash: bar remainder, chip backgrounds — legible against weekend shading), `dark` (≥4.5:1 on white: chip text, on-tint labels, ghost borders).

| # | Hue | main | tint | dark |
|---|-----|------|------|------|
| 1 | Blue (brand) | `#2D6EEF` | `#E3ECFE` | `#1050CF` |
| 2 | Amber | `#E39A26` | `#FBEFD9` | `#8F5B08` |
| 3 | Violet | `#8961C7` | `#EFE9F9` | `#6236A8` |
| 4 | Teal | `#0FA9C0` | `#DCF4F8` | `#087285` |
| 5 | Pink | `#D9679F` | `#FAE7F1` | `#B02D6E` |
| 6 | Green | `#37A169` | `#DFF2E9` | `#1F7248` |
| 7 | Indigo | `#5B63D6` | `#E7E9FA` | `#3A41B5` |
| 8 | Coral | `#E06655` | `#FBE8E5` | `#B03A28` |

Entry 1 is brand blue so epic #1 ties to the brand; the order alternates hue families for adjacent distinction; error red (`#DC2F4E`, the over-budget outline) is deliberately excluded.

**Override:** a stored `Task.color` on a **category** switches the whole epic to `deriveTriad(color)` (tint = 85% mix toward white; dark = HSL lightness clamped ≤ 0.34; a hex matching a curated `main` returns the hand-tuned triad). `color` on non-category rows does not affect bar hue (a milestone's `color` still overrides its diamond at render, as before). Orphans and `parentId` cycles resolve to a neutral slate fallback. `assignEpicColors(tasks)` maps every task id to its epic's triad and is computed in `RoadmapTab` from the full task list, so backlog items and collapsed rows resolve too.

**Override UI:** the detail panel shows a "Color" swatch row for categories only — the 8 palette swatches plus an "Auto" swatch that PATCHes `color: null` (immediate PATCH via the existing route, outside the draft/save flow, so the chart recolors on click). No free hex input in v1: swatch-only choices keep every combination contrast-safe. No schema/API change was needed — `updateTaskSchema` already validated `color`.

## 2. Bar encoding

Task/subtask bars are pills (22px/16px tall) in the epic's colors:

- **Base:** `tint`. **Solid segment:** `main`, width = `progress`% (linear); `completed` renders fully solid regardless of stored progress. Delayed/blocked show their *real* progress — the exception flag comes from the label + dot, not the fill.
- **On-bar status label** (tasks, bars ≥ 76px): white over the solid segment (progress ≥ 25%), `dark` over the tint, and the status's own `textColor` for exceptions (`delayed`/`blocked`) so they stay flagged.
- **End dot** (bars ≥ 40px): 7px circle in `STATUSES[status].fill` with a white ring — the reference's bar-end marker doubling as the status signal. Replaces the old left-edge `StatusDot`.
- **Archived:** whole bar at 0.45 opacity.
- **Ghost (estimated) bars:** translucent tint + dashed `dark` border + `≈` badge, no progress split (guessed dates have no meaningful progress). The dashed edge remains the color-blind-safe signal, unchanged in principle.
- **Unchanged exception visuals:** over-budget `2px solid #DC2F4E` outline + `!` badge; plan-change badges; original-plan ghost outline. The extended striped overlay's stripes flip from white to `rgba(0,0,0,0.10)` (white is invisible over a light tint).
- **Category bar:** slim 18px `tint` pill with a `main` rollup-progress fill.
- **Milestones:** diamonds inherit `epic.main` (replacing the fixed gold `#D99A20`); explicit `row.color` still wins; completed stays green (`STATUSES.completed.textColor`).
- **Removed — hours sub-fill:** the old elapsed-days bar-within-a-bar would be indistinguishable from the new progress segment. Logged hours remain in the sidebar `Xh / Yd` column, bar tooltip, and the over-budget outline/badge.

Status → bar appearance summary:

| Status | Fill | Label color | End dot |
|---|---|---|---|
| todo | tint + progress% solid | dark/white | gray |
| in_progress | tint + progress% solid | dark/white | blue |
| in_review | tint + progress% solid | dark/white | purple |
| delayed | tint + real progress | amber `textColor` | amber |
| blocked | tint + real progress | pink `textColor` | pink |
| completed | fully solid | white | green |
| archived | as todo, bar at 0.45 opacity | dark/white | gray |

## 3. Chart surface declutter

- **Header:** per-day cells remain (all `DAY_WIDTH` drag math untouched) but only every `TICK_INTERVAL_DAYS = 4` cell renders a day number (left-anchored at the tick line; suppressed within the last interval to avoid edge clipping). First-of-month renders "Jul 1" style regardless of tick phase. Weekday letters and per-cell borders dropped.
- **Gridlines:** per-day verticals → 1px lines at tick intervals only; zebra row striping removed; weekend shading softened to `rgba(0,0,0,0.015)`.
- **Today:** the blue line + dot becomes a soft mint column band (`rgba(16,185,129,0.08)`) with a hairline mint left edge for the precise "now" position, plus a mint pill on the header date.
- **Row separators:** per-row hairlines removed in both panes; a single `rgba(0,0,0,0.08)` separator sits at the top of each category row (grid + sidebar), so lines mark epic groups, not every row.
- **Rows:** `ROW_HEIGHT` 44→48, `SUB_ROW_HEIGHT` 38→40 for breathing room (both panes read the shared constants, preserving scroll-sync).
- **Dependency curves:** neutral slate `#667085` at 0.55 opacity (1.0 for the hovered pair, 0.15 dimmed) — multi-hue curves over multi-hue bars would re-add noise, and a cross-epic dependency has no single owner hue. One shared SVG arrowhead marker (markers can't inherit stroke color).
- **Sidebar/List:** epic names render as tint/dark chips (replacing the uppercase treatment); the category stripe, rollup mini-bar, and milestone glyph fallback use `epic.main`. Applies identically in the Gantt sidebar and List view, keeping the two views consistent.

Tick-interval note: the chart renders all calendar days, so 4-day ticks drift across week boundaries and can land on weekends; they re-phase if the range start shifts. Accepted for v1; a Monday-anchored 7-day alternative was noted and not implemented.

## Testing

`tests/lib/epicPalette.test.ts` covers the pure module: palette cycling/wrapping, order-stable assignment, override cascade to descendants, non-category `color` not affecting hue, `deriveTriad` validity/direction, and orphan/cycle fallback. Everything else is visual/styling and follows the established convention of manual live-browser verification (mixed statuses, ghost/over-budget/extended tasks, milestones, dependencies incl. collapsed endpoints, backlog drop, >8 epics for wrap, swatch override + Auto, both views, scroll-sync at both ends).

## Out of scope

- Status/priority color values (`STATUSES`/`PRIORITIES`) — unchanged.
- Custom hex color input in the override UI (palette swatches only in v1).
- Dark theme — still deferred per the original brand-palette-refresh spec.
- Dependency-type visuals, backlog panel styling, and the schedule-change dialog.
