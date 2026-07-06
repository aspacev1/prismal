# Roadmap Visual Elements Brand Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the blue-cyan brand identity to the Roadmap/Gantt chart's calendar header, task/subtask bars, task/subtask hierarchy stripes, and the Gantt/List toggle — the elements the earlier palette refresh intentionally left untouched because they carry status/priority information.

**Architecture:** All changes are contained to `gantt/constants.ts` (a new status→opacity map), `gantt/GanttGrid.tsx` (today marker, header highlight, bar rendering), `gantt/TaskSidebar.tsx` and `RoadmapTab.tsx` (task-level border stripe, toggle color prop). No new files, no schema/API changes — purely presentational.

**Tech Stack:** Next.js 14, MUI v5, TypeScript.

---

Reference spec: [docs/superpowers/specs/2026-07-06-roadmap-brand-alignment-design.md](../specs/2026-07-06-roadmap-brand-alignment-design.md)

## File Structure

```
src/app/projects/[id]/gantt/constants.ts    - modified: add STATUS_BAR_OPACITY map
src/app/projects/[id]/gantt/GanttGrid.tsx   - modified: isToday header highlight, today-marker recolor, bar gradient+opacity, worked-so-far fill color
src/app/projects/[id]/gantt/TaskSidebar.tsx - modified: task-level blue border stripe
src/app/projects/[id]/RoadmapTab.tsx        - modified: task-level blue border stripe (List view), ToggleButtonGroup/ToggleButton color="primary"
```

---

### Task 1: Add status→opacity map to `gantt/constants.ts`

**Files:**
- Modify: `src/app/projects/[id]/gantt/constants.ts`

- [ ] **Step 1: Add the `STATUS_BAR_OPACITY` constant**

Add this near the existing `STATUSES` constant (after its closing `};`, before `STATUS_LIST`):

```ts
// Task/subtask Gantt bars now render as the brand gradient at an opacity
// reflecting status, replacing per-status bar color as the status signal.
// `delayed`/`blocked` are exceptions (not points on a progress ladder) and
// always render fully opaque so they visually demand attention regardless
// of actual progress — see docs/superpowers/specs/2026-07-06-roadmap-brand-alignment-design.md.
export const STATUS_BAR_OPACITY: Record<TaskStatus, number> = {
  todo: 0.25,
  in_progress: 0.5,
  in_review: 0.7,
  delayed: 1,
  blocked: 1,
  completed: 1,
  archived: 0.15,
};

// Statuses that are exceptions rather than progress stages — these keep a
// small StatusDot on the bar itself (in addition to full opacity) since
// opacity alone can't distinguish "delayed" from "completed" at 1.0.
export const EXCEPTION_STATUSES: TaskStatus[] = ["delayed", "blocked"];
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "src/app/projects/[id]/gantt/constants.ts"
git commit -m "Add status-to-opacity map for brand-gradient Gantt bars"
```

---

### Task 2: Calendar header — "today" marker + header cell brand accent

**Files:**
- Modify: `src/app/projects/[id]/gantt/GanttGrid.tsx`

- [ ] **Step 1: Add `isToday` to the `dayLabels` computation**

Find (around line 75-86):

```ts
  const dayLabels = useMemo(() => {
    const labels: { date: Date; isWeekendDay: boolean; isFirstOfMonth: boolean }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(rangeStart, i);
      labels.push({
        date: d,
        isWeekendDay: isWeekend(d),
        isFirstOfMonth: d.getDate() === 1 || i === 0,
      });
    }
    return labels;
  }, [rangeStart, totalDays]);
```

Replace with:

```ts
  const dayLabels = useMemo(() => {
    const labels: { date: Date; isWeekendDay: boolean; isFirstOfMonth: boolean; isToday: boolean }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(rangeStart, i);
      labels.push({
        date: d,
        isWeekendDay: isWeekend(d),
        isFirstOfMonth: d.getDate() === 1 || i === 0,
        isToday: daysBetween(today, d) === 0,
      });
    }
    return labels;
  }, [rangeStart, totalDays, today]);
```

- [ ] **Step 2: Highlight the header day-cell for today**

Find (around line 225-239):

```ts
        {dayLabels.map((d, i) => (
          <Box
            key={i}
            sx={{
              width: DAY_WIDTH,
              flexShrink: 0,
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              borderRight: "1px solid",
              borderColor: "divider",
              bgcolor: d.isWeekendDay ? "rgba(0,0,0,0.02)" : "background.paper",
            }}
          >
```

Replace with:

```ts
        {dayLabels.map((d, i) => (
          <Box
            key={i}
            sx={{
              width: DAY_WIDTH,
              flexShrink: 0,
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              borderRight: "1px solid",
              borderColor: d.isToday ? "#2D6EEF" : "divider",
              borderLeft: d.isToday ? "2px solid #2D6EEF" : "none",
              bgcolor: d.isToday ? "rgba(45,110,239,0.04)" : d.isWeekendDay ? "rgba(0,0,0,0.02)" : "background.paper",
            }}
          >
```

- [ ] **Step 3: Recolor the today-marker line + dot**

Find (around line 300-327):

```tsx
        {/* Today marker */}
        {todayOffset >= 0 && todayOffset < totalDays && (
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: todayOffset * DAY_WIDTH,
              width: 2,
              height: totalHeight,
              bgcolor: "#E0909F",
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            <Box
              sx={{
                position: "absolute",
                top: -6,
                left: -6,
                width: 14,
                height: 14,
                borderRadius: "50%",
                bgcolor: "#E0909F",
                border: "2px solid #fff",
              }}
            />
          </Box>
        )}
```

Replace with:

```tsx
        {/* Today marker */}
        {todayOffset >= 0 && todayOffset < totalDays && (
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: todayOffset * DAY_WIDTH,
              width: 2,
              height: totalHeight,
              bgcolor: "#2D6EEF",
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            <Box
              sx={{
                position: "absolute",
                top: -6,
                left: -6,
                width: 14,
                height: 14,
                borderRadius: "50%",
                bgcolor: "#2D6EEF",
                border: "2px solid #fff",
              }}
            />
          </Box>
        )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add "src/app/projects/[id]/gantt/GanttGrid.tsx"
git commit -m "Recolor calendar 'today' marker and header cell to brand blue"
```

---

### Task 3: Task/subtask bars — brand gradient + status-encoded opacity

**Files:**
- Modify: `src/app/projects/[id]/gantt/GanttGrid.tsx`

- [ ] **Step 1: Import the new constants and `StatusDot`**

Find (around line 6-18):

```ts
import {
  DAY_WIDTH,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  SUB_ROW_HEIGHT,
  isStatus,
  isPriority,
  STATUSES,
  PRIORITIES,
  userInitials,
  userFullName,
} from "./constants";
import { StatusDot, PriorityIcon, Avatar } from "./shared";
```

Replace with:

```ts
import {
  DAY_WIDTH,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  SUB_ROW_HEIGHT,
  isStatus,
  isPriority,
  STATUSES,
  PRIORITIES,
  STATUS_BAR_OPACITY,
  EXCEPTION_STATUSES,
  userInitials,
  userFullName,
} from "./constants";
import { StatusDot, PriorityIcon, Avatar } from "./shared";
```

(`StatusDot` is already imported — this step only adds `STATUS_BAR_OPACITY` and `EXCEPTION_STATUSES` to the same import from `./constants`.)

- [ ] **Step 2: Compute the bar's gradient background from its status opacity**

Find (around line 481-483, inside the `displayRows.map` callback, right after `status`/`priority` are computed):

```ts
          const status = isStatus(row.status) ? STATUSES[row.status] : STATUSES.todo;
          const priority = isPriority(row.priority) ? PRIORITIES[row.priority] : PRIORITIES.medium;
          const barHeight = isCategory ? 28 : row.isSubtask ? 8 : 10;
```

Replace with:

```ts
          const status = isStatus(row.status) ? STATUSES[row.status] : STATUSES.todo;
          const priority = isPriority(row.priority) ? PRIORITIES[row.priority] : PRIORITIES.medium;
          const barHeight = isCategory ? 28 : row.isSubtask ? 8 : 10;
          const barOpacity = isStatus(row.status) ? STATUS_BAR_OPACITY[row.status] : STATUS_BAR_OPACITY.todo;
          const barGradient = `linear-gradient(135deg, rgba(45,110,239,${barOpacity}) 0%, rgba(15,169,192,${barOpacity}) 100%)`;
          const isExceptionStatus = isStatus(row.status) && EXCEPTION_STATUSES.includes(row.status);
```

- [ ] **Step 3: Replace the bar's background/border with the gradient, drop the old status-color border**

Find (around line 636-663):

```tsx
              {/* Thin bar (Tasks + Subtasks, only when planned) */}
              {!isCategory && row.startDate && row.durationDays > 0 && (
                <Box
                  onClick={() => onSelect(row.id)}
                  onMouseDown={(e) => handleMouseDown(e, row, "move")}
                  sx={{
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    left: barLeft,
                    width: barWidth,
                    height: barHeight,
                    borderRadius: 0.5,
                    cursor: "grab",
                    bgcolor: `${status.fill}26`,
                    border: `1.5px solid ${status.fill}`,
                    outline: overBudget ? "2px solid #DC2F4E" : "none",
                    outlineOffset: overBudget ? "1px" : "0",
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                    zIndex: 20,
                    transition: "box-shadow 0.15s",
                    boxShadow: isSelected ? "0 0 0 2px rgba(79,93,255,0.4)" : "none",
                    "&:active": { cursor: "grabbing" },
                    "&:hover .resize-handle": { opacity: 1 },
                  }}
                  title={`${row.name}${overBudget ? ` — over budget: ${row.loggedHours}h vs ${row.durationDays * 8}h plan` : ""}${ahead ? " — ahead of plan" : ""}${extended ? " — extended past original plan" : ""}${shifted ? " — shifted from original plan" : ""}`}
                >
```

Replace with:

```tsx
              {/* Thin bar (Tasks + Subtasks, only when planned) */}
              {!isCategory && row.startDate && row.durationDays > 0 && (
                <Box
                  onClick={() => onSelect(row.id)}
                  onMouseDown={(e) => handleMouseDown(e, row, "move")}
                  sx={{
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    left: barLeft,
                    width: barWidth,
                    height: barHeight,
                    borderRadius: 0.5,
                    cursor: "grab",
                    background: barGradient,
                    outline: overBudget ? "2px solid #DC2F4E" : "none",
                    outlineOffset: overBudget ? "1px" : "0",
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                    zIndex: 20,
                    transition: "box-shadow 0.15s",
                    boxShadow: isSelected ? "0 0 0 2px rgba(79,93,255,0.4)" : "none",
                    "&:active": { cursor: "grabbing" },
                    "&:hover .resize-handle": { opacity: 1 },
                  }}
                  title={`${row.name} — ${status.label}${overBudget ? ` — over budget: ${row.loggedHours}h vs ${row.durationDays * 8}h plan` : ""}${ahead ? " — ahead of plan" : ""}${extended ? " — extended past original plan" : ""}${shifted ? " — shifted from original plan" : ""}`}
                >
                  {isExceptionStatus && (
                    <Box sx={{ position: "absolute", left: 2, top: "50%", transform: "translateY(-50%)", zIndex: 25 }}>
                      <StatusDot status={row.status} size={row.isSubtask ? 6 : 8} />
                    </Box>
                  )}
```

- [ ] **Step 4: Change the "worked-so-far" sub-fill from status color to flat brand blue**

Find (around line 665-678):

```tsx
                {/* Worked-so-far fill */}
                {filledWidthPx > 0 && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: filledWidthPx,
                      bgcolor: status.fill,
                      zIndex: 0,
                      pointerEvents: "none",
                    }}
                  />
                )}
```

Replace with:

```tsx
                {/* Worked-so-far fill — a distinct signal (hours logged vs. planned)
                    from the status-opacity gradient above, so it stays flat brand
                    blue rather than picking up the status color. */}
                {filledWidthPx > 0 && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: filledWidthPx,
                      bgcolor: "#2D6EEF",
                      zIndex: 0,
                      pointerEvents: "none",
                    }}
                  />
                )}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add "src/app/projects/[id]/gantt/GanttGrid.tsx"
git commit -m "Render Gantt bars as brand gradient with status-encoded opacity"
```

---

### Task 4: Task-level border stripe in the Gantt sidebar

**Files:**
- Modify: `src/app/projects/[id]/gantt/TaskSidebar.tsx`

- [ ] **Step 1: Extend the category-only border stripe to a three-tier stripe**

Find (around line 399):

```ts
          borderLeft: isCategory ? "3px solid #5B63D6" : "3px solid transparent",
```

Replace with:

```ts
          // Category: indigo stripe (unchanged). Task: new thin brand-blue
          // stripe. Subtask: no stripe — the deepest, quietest level.
          borderLeft: isCategory
            ? "3px solid #5B63D6"
            : row.isSubtask
              ? "3px solid transparent"
              : "3px solid #2D6EEF",
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "src/app/projects/[id]/gantt/TaskSidebar.tsx"
git commit -m "Add task-level brand-blue border stripe in Gantt sidebar"
```

---

### Task 5: Task-level border stripe in List view + toggle color

**Files:**
- Modify: `src/app/projects/[id]/RoadmapTab.tsx`

- [ ] **Step 1: Extend the category-only border stripe to a three-tier stripe (List view)**

Find (around line 720):

```ts
            borderLeft: task.kind === "category" ? "3px solid #5B63D6" : "3px solid transparent",
```

Replace with:

```ts
            // Category: indigo stripe (unchanged). Task: new thin brand-blue
            // stripe. Subtask: no stripe — the deepest, quietest level.
            borderLeft: task.kind === "category"
              ? "3px solid #5B63D6"
              : task.isSubtask
                ? "3px solid transparent"
                : "3px solid #2D6EEF",
```

- [ ] **Step 2: Add `color="primary"` to the Gantt/List toggle group**

Find (around line 864-878):

```tsx
              <ToggleButtonGroup
                value={view}
                exclusive
                size="small"
                onChange={(_, next) => { if (next) setView(next); }}
              >
                <ToggleButton value="gantt">
                  <CalendarMonthIcon sx={{ mr: 0.5, fontSize: 18 }} />
                  Gantt
                </ToggleButton>
                <ToggleButton value="list">
                  <ViewListIcon sx={{ mr: 0.5, fontSize: 18 }} />
                  List
                </ToggleButton>
              </ToggleButtonGroup>
```

Replace with:

```tsx
              <ToggleButtonGroup
                value={view}
                exclusive
                size="small"
                color="primary"
                onChange={(_, next) => { if (next) setView(next); }}
              >
                <ToggleButton value="gantt">
                  <CalendarMonthIcon sx={{ mr: 0.5, fontSize: 18 }} />
                  Gantt
                </ToggleButton>
                <ToggleButton value="list">
                  <ViewListIcon sx={{ mr: 0.5, fontSize: 18 }} />
                  List
                </ToggleButton>
              </ToggleButtonGroup>
```

- [ ] **Step 3: Add `color="primary"` to the "Dependent only" toggle**

Find (around line 880-890):

```tsx
                <ToggleButton
                  value="dependent"
                  size="small"
                  selected={onlyDependent}
                  onChange={() => setOnlyDependent((v) => !v)}
                  sx={{ textTransform: "none", px: 1.5 }}
                  title="Show only tasks that have dependencies"
                >
```

Replace with:

```tsx
                <ToggleButton
                  value="dependent"
                  size="small"
                  color="primary"
                  selected={onlyDependent}
                  onChange={() => setOnlyDependent((v) => !v)}
                  sx={{ textTransform: "none", px: 1.5 }}
                  title="Show only tasks that have dependencies"
                >
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add "src/app/projects/[id]/RoadmapTab.tsx"
git commit -m "Add task-level border stripe (List view) and primary color to toggles"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests still pass (this is a styling-only change; no test should reference bar/header colors)

- [ ] **Step 3: Manual browser verification**

Using the dev server, seed a project with at least one category containing 2+ tasks with different statuses (including one `delayed` or `blocked` task), one subtask, and confirm:
1. **Calendar header**: today's date column has a light blue tint background and blue borders; the vertical "today" line/dot in the body is brand blue (not pink).
2. **Bars**: each task bar renders as the blue-cyan gradient, with visibly different opacity per status (a `todo` bar much fainter than a `completed` bar); the `delayed`/`blocked` bar is fully opaque and shows its status dot on the left edge; the "worked-so-far" sub-fill (if any task has logged hours) is flat blue, not colored by status.
3. **Hierarchy stripe**: in both Gantt and List views, the category row has an indigo left stripe, a top-level task has a thinner blue left stripe, and a subtask has no stripe at all.
4. **Toggle**: the currently-selected "Gantt"/"List" button and the "Dependent only" button (when active) show a blue-tinted background/text instead of the previous neutral gray.

- [ ] **Step 4: Commit if any stray changes remain**

```bash
git status
git add -A
git commit -m "Finish Roadmap visual elements brand alignment"
```

(Skip this step if `git status` is already clean.)
