# Gantt Dependency Visualization: Line Styling + "Show Only Dependent Tasks" Filter

**Goal:** Make task dependencies actually legible on the Gantt chart. Today `GanttGrid.tsx` already draws SVG curves between dependent tasks, but the implementation has several real gaps that this design closes.

**Relationship to other specs:** This is a companion to [`2026-07-05-gantt-hierarchy-design.md`](./2026-07-05-gantt-hierarchy-design.md), which introduces the Category/Task/Subtask hierarchy and its collapsing behavior. That spec is independently shippable; this one is scoped separately because it's a distinct concern (relationship visualization, not structural hierarchy) with its own component surface, but both touch `GanttGrid.tsx`/`RoadmapTab.tsx` and should land in an order where the hierarchy work (which changes collapsing behavior) lands first, since this spec's filter interacts with which rows are visible.

## Current gaps (as implemented in `gantt/GanttGrid.tsx:310-345`)

1. **No arrowheads** — a plain curve gives no visual indication of which end is predecessor vs. successor.
2. **All four dependency types render identically** — `TaskDependency.dependencyType` (`FS`/`SS`/`FF`/`SF`) already exists in the schema but has zero visual representation.
3. **Silently disappears when an endpoint is hidden** — `rowIndexById` lookup returns `undefined` for a collapsed row, and the line is just not rendered, with no indicator that a hidden dependency exists. (Out of scope to fully solve here — see "Out of scope" below — but the filter feature in this spec reduces how often this matters.)
4. **No hover/focus isolation** — with several crossing lines, there's no way to visually isolate one task's dependencies from the rest.

This design addresses gaps 1 and 2 directly, and gap 4 partially (via the filter). Gap 3 (dependencies pointing into collapsed rows) is explicitly out of scope — see below.

## Part 1: Two-tier line styling

Dependencies are grouped into two visual treatments rather than four, since finish-to-start is overwhelmingly the common "blocking" case and the other three are comparatively rare "auxiliary" relationships:

- **Finish-to-Start (`FS`):** solid line, teal (`#0F9D8C`, matching the app's primary color), with an arrowhead at the successor end.
- **Start-to-Start / Finish-to-Finish / Start-to-Finish (`SS`/`FF`/`SF`):** dashed line, neutral gray (`#9CA3AF`), also with an arrowhead at the successor end, but visually lighter-weight so these don't compete with blocking dependencies for attention.

Both styles use an SVG `<marker>` arrowhead (see mockup approved during brainstorming), added to the existing `<svg>` block in `GanttGrid.tsx` alongside the current `<path>` rendering — no new rendering approach, just extending the existing SVG dependency-curve block with a `stroke-dasharray` conditional on `dependencyType !== "FS"` and a shared `marker-end`.

## Part 2: "Show only dependent tasks" filter

A toggle in the Gantt view's toolbar (next to the existing Gantt/List `ToggleButtonGroup` in `RoadmapTab.tsx`) that, when enabled, hides any Task or Subtask row that has no dependency relationship at all — i.e., it appears in neither any `predecessorDeps` nor `successorDeps` across the project's tasks.

- **Scope:** Gantt view only. List view is unaffected — no filter control is added there, since dependency arrows themselves only render in the Gantt/timeline view.
- **Category rows:** never participate in dependencies directly (consistent with the hierarchy spec, where Category is a computed rollup, not a schedulable unit). When the filter is active, a Category is hidden if *all* of its children are hidden by the filter, and shown (with only its dependent children visible) if at least one child remains.
- **Implementation:** purely client-side. The task list already includes each task's dependency data (`predecessorDeps`/`successorDeps`, per the existing `GET /api/projects/[id]/tasks` include clause) — no new API call or schema change is needed. A pure function, `isDependentTask(task): boolean`, is extracted into `src/lib/dateUtils.ts`'s sibling module or a new small `src/lib/taskUtils.ts` (matching this codebase's existing pattern of pulling client-side logic into a testable `src/lib` module rather than inlining it in a component), so it can be unit tested directly rather than only through component behavior.

## Testing

- Unit test `isDependentTask()` in isolation: a task with no deps returns `false`; a task with an entry in `predecessorDeps` returns `true`; a task with an entry in `successorDeps` returns `true`.
- No API or schema tests are needed — this spec introduces no server-side changes.
- Consistent with this project's established convention (confirmed during the invite-teammates and hierarchy work): tests live in `src/lib`/`tests/api`, not as React component tests.

## Out of scope

- Solving gap 3 (a dependency line disappearing entirely when its other endpoint is inside a collapsed group) is not addressed here. A future iteration could show a small "linked task hidden" indicator on the visible endpoint, but that's a separate, more involved design and isn't required for this spec's goal of making *visible* dependencies legible.
- Hover/focus isolation of a single task's dependency chain (highlighting just its lines, dimming the rest) is not included — the two-tier styling and filter together are considered sufficient for this iteration.
- Editing or creating dependencies is unchanged — this spec is about visualization and filtering only, not the creation UX for `TaskDependency` rows (which already exists via `api/projects/[id]/tasks/dependencies/route.ts`).
