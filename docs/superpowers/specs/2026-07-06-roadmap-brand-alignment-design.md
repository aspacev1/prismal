# Roadmap Visual Elements: Brand Alignment

**Goal:** Extend the blue-cyan brand palette refresh (see [`2026-07-06-brand-palette-refresh-design.md`](./2026-07-06-brand-palette-refresh-design.md)) to the five Roadmap/Gantt elements that refresh intentionally left untouched, because they carry semantic/informational meaning (status, priority) rather than pure brand identity: the calendar header, task/subtask bars, category rows, task/subtask hierarchy styling, and the Gantt/List view toggle.

**Context:** The prior palette refresh correctly left status colors (`STATUSES`/`PRIORITIES` in `gantt/constants.ts`) untouched, since they encode functional information across 7 statuses and 4 priorities — recoloring them to brand blue/indigo would have destroyed that signal. This spec makes deliberate, scoped decisions about where brand color *can* be introduced without losing that information, and where it should stay purely functional.

## 1. Calendar header — minimal "today" accent

The existing today-marker (`gantt/GanttGrid.tsx:300-327`) — a vertical line + dot drawn across the body rows — changes color from `#E0909F` (pink, coincidentally also `STATUSES.blocked.fill` but this is a separate, unrelated hardcoded literal) to brand blue `#2D6EEF`.

Additionally, the header day-cell (`gantt/GanttGrid.tsx:225-261`) for the current date gets its own distinct highlight: a light blue tint background (`rgba(45,110,239,0.04)`) and a `2px solid #2D6EEF` left/right border on just that one column — distinguishing it from the plain white/weekend-gray treatment every other day-cell gets. This requires adding an `isToday: boolean` field to the `dayLabels` array (`gantt/GanttGrid.tsx:75-83`), computed the same way `isWeekendDay` is (via a date comparison against `getToday()`).

Weekend shading and column dividers elsewhere in the header/body remain untouched (neutral gray, as today) — this is a minimal, precise accent, not a wholesale header restyle.

## 2. Task/subtask bars — brand gradient + status-encoded opacity

Bars (`gantt/GanttGrid.tsx:637-663`) currently render as `bgcolor: ${status.fill}26` (15%-alpha status color) with a solid `status.fill` border. This changes to a brand-gradient fill (`theme.gradient.button`, the same deepened gradient used for buttons) at an **opacity that reflects status**, replacing color-as-status-signal with opacity-as-status-signal:

| Status | Opacity | Rationale |
|---|---|---|
| `todo` | 0.25 | Barely started |
| `in_progress` | 0.5 | Underway |
| `in_review` | 0.7 | Nearly done, pending review |
| `completed` | 1.0 | Fully opaque — done |
| `archived` | 0.15 | De-emphasized, out of active view |
| `delayed` | 1.0 | Exception state — see below |
| `blocked` | 1.0 | Exception state — see below |

`delayed` and `blocked` aren't points on a "how far along" progression — they're exceptions that need to stand out regardless of actual progress, so they render fully opaque (grabbing attention) and additionally keep a small status-dot indicator (reusing the existing `StatusDot` component from `gantt/shared.tsx`, already used in the sidebar) at the bar's left edge, so their specific exception type is identifiable without relying on opacity alone.

The existing "worked-so-far" hours sub-fill (`gantt/GanttGrid.tsx:665-678`, a bar-within-a-bar showing logged hours vs. planned duration — a distinct signal from status) stays conceptually the same but switches its fill color from `status.fill` (solid) to flat brand blue (`#2D6EEF`), since it's answering a different question (hours logged) than the outer bar (status), and reusing brand blue here keeps it visually subordinate to the gradient-filled outer bar.

The bar's border (currently solid `status.fill`) is dropped in favor of the gradient fill providing the bar's visual boundary — no separate border color needed once the fill itself carries brand identity.

## 3. Category rows — no changes

Confirmed via live verification: category rows already use the correct indigo (`#5B63D6`) left-border stripe and rollup progress fill, from the original palette refresh. Out of scope here.

## 4. Task/subtask hierarchy — three-tier left-border stripe

Extends the category left-border pattern one level further, rather than introducing a new visual mechanism:

- **Category**: indigo (`#5B63D6`) stripe + highlighted band (unchanged).
- **Task**: new thin brand-blue (`#2D6EEF`) left-border stripe, no background tint — visually subordinate to a category's indigo band, but still marked.
- **Subtask**: no stripe (`transparent`) — the deepest, most granular level, intentionally the quietest.

Applies identically in both the Gantt sidebar (`gantt/TaskSidebar.tsx`) and the List view (`RoadmapTab.tsx`'s `renderListRow`), so the two views stay visually consistent with each other (matching the existing project convention of parity between Gantt and List views established during the hierarchy/dependency work).

## 5. Gantt/List toggle — `color="primary"` on ToggleButtonGroups

The `ToggleButtonGroup` for Gantt/List (`RoadmapTab.tsx:864-878`) and the neighboring `ToggleButton`s (Category filter, "Dependent only" filter) currently render their selected state using MUI's default `action.selected` (a neutral dark-tinted gray, confirmed live at `rgba(26,26,46,0.08)`). Adding `color="primary"` to each `ToggleButtonGroup`/standalone `ToggleButton` uses MUI's built-in color-prop mechanism to tint the selected state with the theme's primary blue instead — no custom CSS overrides needed, since this is exactly what the `color` prop is for.

## Testing

This is a visual/styling change with no new business logic — consistent with this project's established convention (lib/API layers get unit tests; visual/component-level styling does not, per the earlier brand-palette-refresh and hierarchy specs). The one behavioral addition is the `isToday` computation in `dayLabels` (§1) — this is a pure date-comparison function and could reasonably get a unit test if extracted to a testable helper, but given `isWeekendDay` (the existing precedent it directly parallels) has no dedicated test either, this follows the same established pattern rather than introducing new test coverage inconsistently.

Verification is manual: load the Roadmap tab (both Gantt and List views) with a mix of categories/tasks/subtasks across different statuses, and confirm each of the five changes above renders correctly — matching this project's existing practice of live-browser verification for UI-only changes.

## Out of scope

- Any further redesign of category rows (confirmed already correct).
- Status/priority color values themselves (`STATUSES`/`PRIORITIES` in `gantt/constants.ts`) — these remain exactly as they are; only how bars *use* them (opacity instead of fill color) changes.
- The "ghost outline" (original plan indicator, `GanttGrid.tsx:616-634`) and over-budget outline (`#DC2F4E`) are unrelated existing features and are not touched by this spec.
- Dark theme — still deferred per the original brand-palette-refresh spec; nothing here needs to anticipate it beyond what that spec already established.
