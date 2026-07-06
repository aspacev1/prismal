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

**Dependency lines into collapsed rows (gap 3).** Today, if Task B depends on Task A and A is inside a collapsed Category (or, before this spec, a collapsed parent Task), the line connecting them simply isn't rendered — `rowIndexById` has no entry for a hidden row, so the lookup in `GanttGrid.tsx:318` returns `undefined` and the `.map()` callback returns `null` for that dependency. There's no visual trace that a hidden relationship exists at all; a user looking at Task B has no way to know it's blocked by something they can't currently see. Fixing this properly would mean deciding what a "dependency into a collapsed group" should look like — options a future design would need to weigh include: (a) a small arrow stub pointing off the edge of the visible row toward the collapsed group, similar to how some Gantt tools show a truncated connector at the group boundary, (b) a compact badge on the visible row itself (e.g., a small chain-link icon with a tooltip naming the hidden task), or (c) auto-expanding the collapsed group whenever a dependency inside it is relevant to a currently-visible task. Each of these has real tradeoffs around visual noise and expected/surprising auto-expand behavior, which is why this is deferred rather than folded in here — this spec's filter (Part 2) only reduces how often the problem is *encountered*, by letting a user hide independent tasks and thereby reduce the number of collapsed groups they need to open to see full dependency chains; it does not fix the underlying rendering gap.

**Hover/focus isolation of a dependency chain.** With more than a handful of dependencies visible at once, overlapping SVG curves become hard to trace back to their endpoints — a real problem once a project has, say, 15+ interdependent tasks. A future iteration could implement this as: hovering (or selecting) a task row dims every dependency line *except* the ones connected to that task, and dims every task bar that isn't a direct predecessor or successor of it (a one-hop highlight, not a full transitive-chain highlight, to keep the interaction predictable). This would likely reuse the same `selectedId`/`onSelect` state `GanttGrid.tsx` already tracks for row selection, rather than introducing new state — but it's deferred because it's a materially bigger rendering change (conditional opacity/stroke on every path and bar, recomputed on hover) than the two fixes this spec actually makes, and the two-tier styling plus the "show only dependent tasks" filter are judged sufficient to make dependencies legible for the common case of a handful of relationships per project.

**Creating or editing dependencies.** This spec only changes how existing `TaskDependency` rows are *drawn* and *filtered* — it does not touch how they're created. That flow already exists via `POST api/projects/[id]/tasks/dependencies/route.ts` and whatever UI currently calls it (outside the scope of this document to describe or change). A natural follow-on question — should the new two-tier styling influence how a user *picks* a dependency type when creating one, e.g. by previewing which visual style a given type will get — is worth considering later, but isn't addressed here since it concerns the creation UX, not visualization of what already exists.
