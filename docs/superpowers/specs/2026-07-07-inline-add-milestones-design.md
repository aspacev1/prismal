# Inline "Add a Task / Add a Milestone" Creation + Milestone Rendering

**Goal:** Replace the Roadmap's instant-generic-name creation (root-level "Add Epic"/"Add Task" footer buttons) with a consistent, typed inline-input creation flow available everywhere a task can be added — root level and per-category — each offering both "Add a task" and "Add a milestone." Also render milestones for the first time: `Task.isMilestone` has existed in the schema/API since the Gantt hierarchy work, but nothing in the UI creates one or renders it differently from a regular task.

**Context:** A reference screenshot (a competing Gantt tool) showed an inline "+ Add a task | Add a milestone" text-link row, which is a more discoverable and consistent creation pattern than flowline's current split behavior: root-level creation (`addTask`/`addCategory` in `RoadmapTab.tsx`) instantly creates a generically-named item with no prompt, while per-category creation (`createChild`, triggered by a hover-only "+" icon in `TaskSidebar.tsx`) already uses a typed inline-input — two different UX patterns for what should feel like the same action.

## 1. Inline creation UX — one consistent pattern everywhere

Both the root-level add row (bottom of the sidebar/list) and the per-category add affordance (currently a hover-only "+" icon in `TaskSidebar.tsx:637-647` and its List-view equivalent) change to the same text-link pair: **"+ Add a task | Add a milestone"**. Clicking either link reveals an inline name-input in place (reusing the existing `inlineAddParentId`/`inlineAddValue` mechanism already built for per-category task creation), rather than instantly creating a generically-named item.

- Root-level: `addTask()`/`addCategory()`'s current instant-create-with-generic-name behavior (`RoadmapTab.tsx:500-540`) is replaced by the same typed-input flow, wired through a root-level equivalent of `createChild` (parentId `null`).
- Per-category: the existing single "+" icon becomes the two-link row shown on hover, in the same position.
- "Add Epic" (category creation) is **not** part of this text-link pair — categories are a project-wide concept, not something you add "under" a row, so a separate, clearly-distinct "Add Epic" action remains available at the root level only (not per-category, since a category can't contain another category).

## 2. Milestone creation

Clicking "Add a milestone" (root or per-category) reveals the same inline name-input, but the resulting `POST /api/projects/[id]/tasks` call differs from a regular task in three fields:

- `isMilestone: true`
- `startDate`: today's date (via `getToday()`), rather than `null`
- `durationDays: 0` (already the default for regular tasks too, so no change there)

The `startDate: today` default is the one meaningful behavioral difference from a regular new task: a freshly-created regular task is intentionally "unplanned" (`startDate: null`) until the user drags it into place on the Gantt or edits its details — but a milestone is inherently a single point in time, so it needs a real date to mean anything as soon as it's created. Defaulting to today gives it an immediate, sensible position on the chart rather than being invisible until manually scheduled.

## 3. Milestone rendering — diamond marker

In `gantt/GanttGrid.tsx`, the existing task/subtask bar render condition (`!isCategory && row.startDate && row.durationDays > 0`) gains `&& !row.isMilestone`, so milestones never render as a bar. A new sibling condition, `!isCategory && row.isMilestone && row.startDate`, renders a small fixed-size diamond (e.g. 12×12px, independent of zoom level and unaffected by `DAY_WIDTH` scaling) centered on the milestone's date.

Unlike regular task bars (which use the brand-gradient-at-status-opacity system from the earlier Roadmap brand-alignment work), the milestone diamond uses a **flat status color** — brand blue while open/in-progress, green (`STATUSES.completed.fill`-equivalent, i.e. the same green already used for completed-status elsewhere) once marked completed. A milestone is a single point, not a 0%→100% progression over a date range, so the opacity-as-progress system doesn't apply to it the way it does to a bar.

In the sidebar/list, a milestone row looks like any other task row (same indentation, same three-tier border stripe from the earlier hierarchy work) — only its Gantt-timeline representation differs.

## 4. Scope: both views

All of the above applies identically to the Gantt sidebar (`gantt/TaskSidebar.tsx`) and the List view (`RoadmapTab.tsx`'s `renderListRow`), consistent with this project's established pattern of keeping the two views in visual/behavioral parity.

## Testing

- Extend the existing task-creation API tests to cover creating a task with `isMilestone: true` and confirm it's persisted and returned correctly (the validation schema already accepts this field — `src/lib/validation.ts:74,91` — so this is confirming existing support, not adding new server-side logic).
- No new pure-function logic is introduced that needs isolated unit testing — the diamond-vs-bar branch is a rendering condition inside an existing component, consistent with this project's established convention (tests live in `tests/lib`/`tests/api`, not as React component tests).
- Manual browser verification (per this project's established practice for UI-only changes): confirm the root-level and per-category "+ Add a task | Add a milestone" rows work in both views, confirm a created milestone renders as a diamond (not a bar) on the correct date, and confirm marking a milestone "completed" changes the diamond's color.

## Out of scope

- Any change to how milestones behave once created beyond their initial visual/creation treatment — e.g., no new milestone-specific detail-panel fields, no milestone-specific dependency behavior. A milestone remains a `Task` row with `isMilestone: true`; existing task editing/deletion/dependency mechanics apply unchanged.
- Root-level milestone/task creation defaulting to something other than today's date for the *task* (non-milestone) case — that stays `startDate: null` (unplanned), unchanged from today's behavior.
- Any redesign of the "Add Epic" flow itself — it keeps its current instant-creation behavior; only the task/milestone creation pattern changes.
