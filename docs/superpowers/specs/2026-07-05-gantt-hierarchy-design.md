# Gantt Hierarchy: Category → Task → Subtask, and a Better Subtask-Creation UX

**Goal:** Fix the current subtask-creation flow (hidden, inconsistent, two disconnected paths) and extend the Gantt's hierarchy from 2 levels (Task/Subtask) to 3 (Category/Task/Subtask), so work can be grouped the way project managers actually plan it — phases containing tasks containing subtasks.

**Context:** `RoadmapTab.tsx` and its `gantt/` subsystem (`GanttGrid`, `TaskSidebar`, `TaskDetailPanel`, etc.) already implement a working Gantt chart with 2-level task nesting via `Task.parentId`. Subtask creation today is split across two inconsistent, poorly-discoverable paths: a toolbar button (Gantt view only, requires pre-selecting a parent, creates an unnamed placeholder) and a detail-panel inline input (works in both views, but buried 3+ clicks deep, with no entry point in the List view's row menu at all).

---

## Part 1: Subtask/Category creation — hover-reveal inline add

**Interaction:** Hovering any Task or Category row (in either the Gantt sidebar or the List view) reveals a small "+" affordance. Clicking it inserts a new inline row directly beneath, in edit mode with a text cursor active immediately — type a name, press Enter to commit or Escape to cancel. This matches the Notion/Linear/ClickUp convention and requires no modal, no panel, and no pre-selection step.

This is the **only** way to add a Task under a Category or a Subtask under a Task going forward:
- The Gantt toolbar's "Subtask" button (`RoadmapTab.tsx:564-567`) is removed.
- The detail panel's "Subtasks" section (`TaskDetailPanel.tsx:332-421`, including its own inline-add input) is removed — subtasks are still *listed* there for reference, but added via the row hover-"+", not a second input.
- The List view's row "⋮" menu is not given an "Add subtask" entry — hover-"+" is available directly in the same rows, so a duplicate menu path isn't needed.

The affordance appears identically in both the Gantt sidebar (`TaskSidebar.tsx`) and the List view rows in `RoadmapTab.tsx`, so behavior doesn't diverge by view — this was an explicit requirement (adding subtasks was previously List-view-impossible).

Subtask rows themselves do not get a "+" — the hierarchy is capped at 3 levels (Category → Task → Subtask), and a Subtask cannot have children. This cap is enforced both in the UI (no "+" rendered on Subtask rows) and at the API layer (see Part 3) — today nothing stops infinite nesting server-side, only the UI hides deeper levels, which this design closes as a gap.

## Part 2: Category — the Epic model, with Section-header highlighting

**Visual model:** A Category is a real row in the same tree as Task/Subtask — it has a rolled-up progress percentage and a Gantt bar, similar to Jira's "Epic" concept — but is visually distinguished with the light-gray highlighted background band and colored left border used by Asana/monday.com-style section headers, so it reads clearly as a grouping level rather than "just another task."

- **Progress rollup:** average of direct children's `progress` values. A Category with zero children shows 0%.
- **Date rollup:** `startDate` = min of children's `startDate`; `endDate` = max of children's `endDate`. A Category with zero children (or children with no dates set) shows no date range.
- Rollup values are **computed client-side** from already-fetched sibling task data (the same pattern `RoadmapTab.tsx` already uses for `subtaskCounts`) — they are not stored on the Category row itself, and a Category's `startDate`/`endDate`/`progress` fields in the database are not written to directly by the UI.
- **Gantt bar rendering:** Category rows render as a thinner "bracket" bar spanning the rolled-up date range (the standard Gantt convention for group/summary rows), visually distinct from a normal Task/Subtask bar.
- **Detail panel:** Category rows get a simplified `TaskDetailPanel` — no assignee or priority fields, since those aren't meaningful for a rollup row. Name, description, and the list of child tasks remain.

## Part 3: Data model

Reuse the existing `Task` table for Category rather than introducing a new model — a Category is simply a `Task` row at the top of the `parentId` chain. Add one new field:

```prisma
model Task {
  // ...existing fields...
  kind        String   @default("task") // "category" | "task"
  // ...
}
```

`kind` is explicit rather than inferred from `parentId` depth, because depth-based inference breaks the moment a row is reparented (e.g., a Task moved out from under a Category would silently "become" a Category under depth-based logic). This requires a new Prisma migration adding the `kind` column.

**3-level cap enforcement:** The existing `createTaskSchema`/`updateTaskSchema` (`src/lib/validation.ts`) gain the `kind` field (`z.enum(["category", "task"]).optional()`, default `"task"`). Server-side, `POST /api/projects/[id]/tasks` and the update route must reject any create/reparent where the target parent is itself a Subtask — concretely: the parent's `kind` is `"task"` (not `"category"`) *and* the parent's own `parentId` is non-null (meaning the parent is already one level below a Category, i.e., a Subtask, which cannot have children). This is a genuine gap today — nothing prevents infinite nesting server-side — and this design closes it as part of adding the explicit cap.

No new API endpoints are needed: creating a Category, Task, or Subtask all go through the existing `POST /api/projects/[id]/tasks` route with `parentId` and `kind` set appropriately.

## Testing

- Extend `tests/lib/validation.test.ts` to cover the new `kind` field (valid values, default).
- Add API tests confirming: `kind: "category"` round-trips through create/update; attempting to create a task whose parent already has a non-null `parentId` (i.e., a 4th nesting level) is rejected with a 400.
- No new tests are needed for the client-side rollup math beyond standard component-level sanity, consistent with this project's existing pattern of testing the `lib`/`api` layers rather than React components (confirmed during the invite-teammates phase: no `tests/app/*` directory exists, and that's an intentional, established convention here).

## Out of scope

- Reordering/moving tasks between categories via drag-and-drop is not part of this design — creation and the existing edit flows are the only mechanisms considered here.
- Category-level assignee/priority/color customization beyond the rollup described above is not included.
- Bulk operations (e.g., deleting a Category and all its children in one action) are not addressed — existing single-row delete behavior is assumed to still apply per-row.
