# Instant ghost task bars + unscheduled backlog — design decisions

Feature: creating a task with only a name always renders a timeline bar
instantly, with system-guessed dates styled as a "ghost" until the user
confirms them; an opt-in "Unscheduled" backlog lane holds tasks that are
deliberately dateless.

## Data model

`Task.scheduleStatus: "estimated" | "confirmed" | "unscheduled"` (persisted,
default `"confirmed"`).

- **estimated** — dates were resolved by `lib/scheduleDefaults.ts` at
  creation. Renders as a ghost bar (muted fill + 1.5px dashed border + "≈"
  badge). Carries **no plan baseline** (`originalEndDate = null`): drift
  badges and the delay-confirmation flow only start once dates are confirmed.
- **confirmed** — user-chosen dates, solid bar. The confirming change sets the
  baseline (`originalEndDate`/`originalDurationDays`) from the confirmed dates.
- **unscheduled** — parked in the backlog panel; `startDate = null`,
  `durationDays = 0`, no bar and no chart row. Migration marks pre-existing
  dateless/zero-duration tasks as unscheduled; everything else is confirmed.

## Default schedule resolution (`resolveDefaultSchedule`)

1. **Sibling cascade** — next working day after the end of the last scheduled
   sibling (by `order`). An estimated sibling still chains — a cascade of
   estimates is fine. This outranks the parent window because in this codebase
   every task lives under a parent; a literal parent-first rule would make the
   cascade unreachable.
2. **Parent window** — subtasks with no scheduled siblings start at the parent
   task's start date (category parents contribute nothing — their dates are
   rollups).
3. **Today** — clamped forward to the project start date when today is before
   it. "Today" is the viewer's local calendar day as UTC midnight
   (`getToday()`), matching how all task dates are stored.

Duration defaults to 1 working day (Mon–Fri). There is no holiday calendar in
the codebase yet; a TODO marks where one would hook in.

The server applies the same resolution when a POST arrives with no dates, so
the "never null dates" guarantee holds for API callers too. Explicit dates on
POST mean `confirmed` unless the caller says otherwise (import safety).

## What confirms an estimated schedule

- Drag/move/resize of the bar (on drop) — the PATCH sends
  `scheduleStatus: "confirmed"`, and the server also auto-confirms any
  date-touching PATCH on a non-confirmed task.
- Saving new dates from the detail panel.
- Rename, description, color, status, priority, assignee, reparenting: never.

Estimated tasks are exempt from the schedule-delay 409 and the
reason-required 400 — confirming a ghost is the primary scheduling gesture
and must be one uninterrupted drag. The guard still fully applies to
confirmed tasks.

## Backlog rules (decided + documented)

- **Dependencies:** moving a task to the backlog removes its dependencies in
  both directions (dateless tasks can't hold finish-to-start edges). The
  client shows a confirmation dialog when dependencies exist. Undo restores
  the dates and status but **not** the removed dependencies — the dialog says
  so.
- **Creating a dependency to/from an estimated task does not confirm it** —
  there is no auto-scheduling engine (out of scope), so the link implies no
  date choice.
- **Tasks with subtasks can't be backlogged** — their child rows would become
  unreachable (children render under their parent's chart row). Move or
  delete the subtasks first.
- **Drop position:** dragging a backlog item onto the timeline schedules it
  at the hovered day (snapped forward to a working day), duration 1 day,
  `confirmed` — the user chose the date. The vertical drop position is
  ignored; the task stays in its epic. The "Schedule" button instead applies
  the default logic and produces an estimated ghost.
- **Ordering:** backlog drag-reorder renumbers the backlog items 0..n-1.
  `order` is only a sort key; a rescheduled task simply sorts among its
  siblings by that number.
- Unscheduled tasks render **only** in the backlog panel (no chart row, no
  sidebar row, excluded from rollups and child counts) — keeping the "no bar
  = bug" principle intact on the chart. The list view still shows them with
  "—" dates.

## Undo

A lightweight client-side stack (Ctrl/Cmd+Z, Gantt tab) scoped to ghost/backlog
transitions: drag-confirm of an estimated bar, backlog moves in both
directions, and scheduling out of the backlog. Undo PATCHes the prior
dates + scheduleStatus back; the server drops/restores the baseline
accordingly. There is no general undo system in the app to hook into
(mutations are optimistic + refetch-on-failure), so broader undo is out of
scope.

## Viewport

After creation the chart scrolls (smooth) so the new bar sits in the left
third horizontally and its row is visible vertically — debounced at 800ms so
rapid keyboard entry scrolls once to the latest bar instead of jumping per
Enter.

## Instant rendering

`createChild` inserts an optimistic task under a `temp-` id before the POST
returns, so the ghost bar and sidebar row appear immediately and are
draggable right away. Any action that lands on a temp id (drag PATCH, delete,
undo) resolves through the pending create's promise to the real id first.
