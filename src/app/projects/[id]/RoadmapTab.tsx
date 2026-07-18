"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ViewListIcon from "@mui/icons-material/ViewList";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import TaskSidebar from "./gantt/TaskSidebar";
import GanttGrid from "./gantt/GanttGrid";
import TaskDetailPanel from "./gantt/TaskDetailPanel";
import BacklogPanel, { type BacklogItem } from "./gantt/BacklogPanel";
import ScheduleChangeDialog, { type ScheduleChangeData } from "./gantt/ScheduleChangeDialog";
import {
  STATUSES,
  isStatus,
  type TaskStatus,
  DAY_WIDTH,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  SUB_ROW_HEIGHT,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
} from "./gantt/constants";
import { StatusDot } from "./gantt/shared";
import { rollupChildren } from "./gantt/rollups";
import type { TaskRow, MemberOption, TaskKind, TaskDraft, ScheduleStatus } from "./gantt/types";
import {
  addDays,
  daysBetween,
  workDaysBetween,
  workEndDate,
  getToday,
} from "@/lib/dateUtils";
import { resolveDefaultSchedule, nextWorkingDay, DEFAULT_TASK_DURATION_DAYS } from "@/lib/scheduleDefaults";

type ApiTask = {
  id: string;
  name: string;
  description: string | null;
  kind: TaskKind;
  scheduleStatus: ScheduleStatus;
  startDate: string | null;
  durationDays: number;
  originalEndDate: string | null;
  originalDurationDays: number;
  loggedHours: number;
  progress: number;
  status: string;
  priority: string;
  order: number;
  color: string | null;
  projectId: string;
  parentId: string | null;
  assigneeId: string | null;
  assignee: {
    id: string;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      avatarColor: string | null;
      department: string | null;
    };
  } | null;
  deps: { predecessorId: string }[];
  successorDeps: { id: string }[];
};

// Shape of the task returned by POST /tasks: raw Prisma includes rather than
// the mapped shape GET returns (`predecessorDeps` instead of `deps`).
type CreatedApiTask = Omit<ApiTask, "deps" | "successorDeps"> & {
  predecessorDeps: { predecessorId: string }[];
  successorDeps: { id: string }[];
};

function toApiTask(t: CreatedApiTask): ApiTask {
  const { predecessorDeps, successorDeps, ...rest } = t;
  return {
    ...rest,
    deps: predecessorDeps.map((d) => ({ predecessorId: d.predecessorId })),
    successorDeps: successorDeps.map((s) => ({ id: s.id })),
  };
}

type PendingScheduleChange = ScheduleChangeData | null;

// Snapshot of a task's schedule before a change, for the lightweight undo
// stack (Ctrl/Cmd+Z). Covers the ghost-bar flows: confirming an estimated
// schedule by drag, and moves in/out of the backlog.
type ScheduleSnapshot = {
  startDate: string | null;
  durationDays: number;
  scheduleStatus: ScheduleStatus;
};

const TIMELINE_DROPZONE_ID = "timeline-dropzone";

// The Gantt scroll container doubles as the drop target for backlog items
// dragged onto the timeline. useDroppable must live under the DndContext that
// owns the backlog drag, hence this thin wrapper around the scroller Box.
function TimelineDropZone({
  scrollElRef,
  onScroll,
  children,
}: {
  scrollElRef: React.MutableRefObject<HTMLDivElement | null>;
  onScroll: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: TIMELINE_DROPZONE_ID });
  return (
    <Box
      ref={(el: HTMLDivElement | null) => {
        setNodeRef(el);
        scrollElRef.current = el;
      }}
      onScroll={onScroll}
      sx={{
        flex: 1,
        overflowX: "auto",
        overflowY: "auto",
        outline: isOver ? "2px dashed #2D6EEF" : "none",
        outlineOffset: -2,
      }}
    >
      {children}
    </Box>
  );
}

export default function RoadmapTab({
  projectId,
  projectName,
  projectStartDate,
  members,
}: {
  projectId: string;
  projectName: string;
  projectStartDate: string | null;
  members: MemberOption[];
}) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"gantt" | "list">("gantt");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingSchedule, setPendingSchedule] = useState<PendingScheduleChange>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [onlyDependent, setOnlyDependent] = useState(false);
  const [menuTask, setMenuTask] = useState<TaskRow | null>(null);
  // Delete confirmation: the row awaiting a confirmed delete, plus any error.
  const [pendingDelete, setPendingDelete] = useState<TaskRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Transient error banner for actions that otherwise fail silently (rejected
  // drag, failed schedule-change save).
  const [actionError, setActionError] = useState<string | null>(null);
  // Backlog ("Unscheduled") lane state. Collapsed by default; auto-opened once
  // if unscheduled tasks exist, and whenever a task is parked there so it
  // doesn't look like the task vanished.
  const [backlogOpen, setBacklogOpen] = useState(false);
  // True while a Gantt bar is being dragged — highlights the backlog drop zone.
  const [barDragActive, setBarDragActive] = useState(false);
  // Backlog move awaiting confirmation because the task has dependencies
  // (moving to the backlog removes them).
  const [pendingBacklogMove, setPendingBacklogMove] = useState<ApiTask | null>(null);

  // Resizable / collapsible sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
    const saved = localStorage.getItem("roadmap.sidebarWidth");
    return saved ? Number(saved) : SIDEBAR_DEFAULT_WIDTH;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("roadmap.sidebarCollapsed") === "true";
  });

  const handleSidebarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarCollapsed ? SIDEBAR_DEFAULT_WIDTH : sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newWidth = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, startWidth + delta)
      );
      setSidebarWidth(newWidth);
      if (sidebarCollapsed) setSidebarCollapsed(false);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth, sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem("roadmap.sidebarCollapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem("roadmap.sidebarWidth", String(sidebarWidth));
  }, [sidebarWidth]);

  // Only the very first load blocks the UI behind the "Loading tasks..."
  // state. Refetches after mutations run in the background: tearing the whole
  // Gantt down and remounting it on every create/save read as a full page
  // reload (loading flash + scroll reset).
  const hasLoadedRef = useRef(false);
  const fetchTasks = useCallback(async () => {
    const isInitialLoad = !hasLoadedRef.current;
    if (isInitialLoad) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, { credentials: "same-origin" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to load tasks.");
        return;
      }
      const body = await res.json();
      setTasks(body.tasks);
      hasLoadedRef.current = true;
    } catch {
      setError("Network error.");
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Auto-expand tasks that have subtasks — only once, on the first load that
  // returns tasks. Running it on every `tasks` change would re-expand a
  // category the user just collapsed whenever any mutation refetched.
  const didAutoExpand = useRef(false);
  useEffect(() => {
    if (didAutoExpand.current || tasks.length === 0) return;
    didAutoExpand.current = true;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const t of tasks) {
        if (tasks.some((x) => x.parentId === t.id)) next.add(t.id);
      }
      return next;
    });
  }, [tasks]);

  // "Show only dependent tasks" filter — Gantt view only.
  // A task is "dependent" if it has predecessors (deps) or is a predecessor
  // of another task (appears in someone's deps). Categories never participate
  // directly; a category is kept if at least one of its children is kept.
  const dependentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasks) {
      for (const d of t.deps ?? []) {
        ids.add(t.id);
        ids.add(d.predecessorId);
      }
    }
    return ids;
  }, [tasks]);

  const effectiveTasks = useMemo(() => {
    if (!onlyDependent || view !== "gantt") return tasks;
    // Keep a category if any of its children is dependent.
    const categoryKept = new Set<string>();
    for (const t of tasks) {
      if (t.parentId && dependentIds.has(t.id)) {
        categoryKept.add(t.parentId);
      }
    }
    return tasks.filter((t) => {
      if (t.kind === "category") return categoryKept.has(t.id);
      return dependentIds.has(t.id);
    });
  }, [tasks, onlyDependent, view, dependentIds]);

  // Build flat rows: Category → Task → Subtask (expanded).
  // Sort each level by `order` so optimistic reorder updates are reflected immediately.
  // Unscheduled tasks are excluded — they live in the backlog panel only, so
  // the chart never shows a task row without a bar.
  const rows: TaskRow[] = useMemo(() => {
    const chartTasks = effectiveTasks.filter((t) => t.scheduleStatus !== "unscheduled");
    const topLevel = chartTasks.filter((t) => !t.parentId).sort((a, b) => a.order - b.order);
    const out: TaskRow[] = [];
    for (const t of topLevel) {
      const children = chartTasks.filter((x) => x.parentId === t.id).sort((a, b) => a.order - b.order);
      out.push({ ...t, isSubtask: false });
      if (expanded.has(t.id)) {
        for (const c of children) {
          out.push({ ...c, isSubtask: false });
          const grandChildren = chartTasks.filter((x) => x.parentId === c.id).sort((a, b) => a.order - b.order);
          if (expanded.has(c.id)) {
            for (const g of grandChildren) out.push({ ...g, isSubtask: true });
          }
        }
      }
    }
    return out;
  }, [effectiveTasks, expanded]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  );

  // Range: left edge = project start (−1 day pad) if set, otherwise today − 7.
  // Right edge = latest task end + 14 days, or today + 21 if no tasks.
  // Minimum 28 days so the initial 4-week view is always visible.
  const { rangeStart, totalDays } = useMemo(() => {
    const today = getToday();
    const start = projectStartDate
      ? addDays(new Date(projectStartDate), -1)
      : addDays(today, -7);
    let maxEnd: Date | null = null;
    for (const t of tasks) {
      if (t.startDate) {
        const end = workEndDate(new Date(t.startDate), t.durationDays);
        if (!maxEnd || end > maxEnd) maxEnd = end;
      }
    }
    const end = maxEnd ? addDays(maxEnd, 14) : addDays(today, 21);
    const days = Math.max(daysBetween(start, end), 28);
    return { rangeStart: start, totalDays: days };
  }, [projectStartDate, tasks]);

  // Latest values for callbacks that fire after awaits or debounce timers
  // (optimistic creation, scroll-into-view, backlog drops) — plain closures
  // over `tasks`/`rows`/`rangeStart` would go stale across those gaps.
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const rangeStartRef = useRef(rangeStart);
  rangeStartRef.current = rangeStart;

  // Tasks parked in the backlog, in their manual (drag) order.
  const unscheduledTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.kind === "task" && t.scheduleStatus === "unscheduled")
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [tasks]
  );
  const backlogItems: BacklogItem[] = useMemo(
    () =>
      unscheduledTasks.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        priority: t.priority,
        parentLabel: tasks.find((p) => p.id === t.parentId)?.name ?? "",
      })),
    [unscheduledTasks, tasks]
  );
  const epicOptions = useMemo(
    () =>
      tasks
        .filter((t) => t.kind === "category")
        .sort((a, b) => a.order - b.order)
        .map((t) => ({ id: t.id, name: t.name })),
    [tasks]
  );

  // Open the backlog lane once if the project loads with unscheduled tasks
  // ("collapsed by default when empty"); afterwards the user's toggle wins.
  const didAutoOpenBacklog = useRef(false);
  useEffect(() => {
    if (didAutoOpenBacklog.current || unscheduledTasks.length === 0) return;
    didAutoOpenBacklog.current = true;
    setBacklogOpen(true);
  }, [unscheduledTasks]);

  // Auto-scroll the Gantt so "today" is visible ~1 week from the left edge
  // on initial load (or when switching to the Gantt view). This prevents the
  // user from landing at the project start date (potentially far in the past)
  // and having to scroll forward through weeks of past work to find today.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // The sidebar and the Gantt grid are two side-by-side panes that must scroll
  // vertically as one. They each own their vertical scroll (a single shared
  // scroller can't also keep the Gantt's horizontal scroll independent), so
  // their scrollTop is mirrored here. The guard prevents the mirrored write
  // from echoing back into an infinite scroll loop.
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  // Echo suppression is value-based, not flag-based: the echo event our own
  // mirrored write produces arrives with both panes already equal, so it
  // no-ops on the equality check. A "skip the next event" flag breaks when
  // the mirrored write clamps at the target's scroll limit — a clamped
  // assignment fires no scroll event, the stale flag then swallows the next
  // *real* scroll, and the panes drift apart.
  const syncScrollTop = useCallback((source: "sidebar" | "gantt") => {
    const from = source === "sidebar" ? sidebarScrollRef.current : scrollRef.current;
    const to = source === "sidebar" ? scrollRef.current : sidebarScrollRef.current;
    if (!from || !to) return;
    if (to.scrollTop === from.scrollTop) return;
    to.scrollTop = from.scrollTop;
    // The two panes' max scrollTop can differ (the Gantt's horizontal
    // scrollbar shortens its viewport; content heights are only kept equal
    // best-effort). If the write clamped, pull the source back to the
    // clamped value so the rows stay aligned instead of letting one pane
    // keep scrolling past the other.
    if (to.scrollTop !== from.scrollTop) from.scrollTop = to.scrollTop;
  }, []);
  // Guarded by a ref so it fires once per Gantt-view entry: `rangeStart` gets
  // a new identity every time tasks change, and re-running this after each
  // mutation would yank the user's horizontal scroll back to "today".
  const didAutoScrollRef = useRef(false);
  useEffect(() => {
    if (view !== "gantt") {
      didAutoScrollRef.current = false;
      return;
    }
    if (loading || didAutoScrollRef.current || !scrollRef.current) return;
    didAutoScrollRef.current = true;
    const todayOffsetPx = daysBetween(rangeStart, getToday()) * DAY_WIDTH;
    scrollRef.current.scrollLeft = Math.max(todayOffsetPx - DAY_WIDTH, 0);
  }, [view, loading, rangeStart]);

  function toggleExpand(taskId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function collapseAllEpics() {
    setExpanded((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        const t = tasks.find((t) => t.id === id);
        if (t && t.kind !== "category") next.add(id);
      }
      return next;
    });
  }

  function restoreExpanded(saved: Set<string>) {
    setExpanded(saved);
  }

  // Optimistically created tasks get a temporary id so their ghost bar renders
  // before the POST returns; any later action on that id (drag, delete, undo)
  // resolves through the pending create first. Entries are kept after
  // resolution — the map doubles as the temp→real id lookup.
  const pendingCreatesRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const tempIdSeq = useRef(0);
  const resolveTaskId = useCallback(async (id: string): Promise<string> => {
    const pending = pendingCreatesRef.current.get(id);
    if (!pending) return id;
    return (await pending) ?? id;
  }, []);

  // Scroll the viewport so a newly created bar is visible: horizontally into
  // the left third if off-screen, vertically so the row shows. Debounced so
  // rapid keyboard entry scrolls once, to the latest bar, instead of jumping
  // on every Enter.
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTargetRef = useRef<{ start: Date; taskId: string; parentId: string | null } | null>(null);
  const requestScrollToBar = useCallback((start: Date, taskId: string, parentId: string | null) => {
    scrollTargetRef.current = { start, taskId, parentId };
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      scrollDebounceRef.current = null;
      const target = scrollTargetRef.current;
      scrollTargetRef.current = null;
      const el = scrollRef.current;
      if (!target || !el) return;

      let left: number | undefined;
      const barLeftPx = daysBetween(rangeStartRef.current, target.start) * DAY_WIDTH;
      if (barLeftPx < el.scrollLeft || barLeftPx + DAY_WIDTH > el.scrollLeft + el.clientWidth) {
        left = Math.max(barLeftPx - el.clientWidth / 3, 0);
      }

      let top: number | undefined;
      const currentRows = rowsRef.current;
      // The temp id may have been swapped for the server id by now — fall back
      // to the last row under the same parent (new tasks append at the end).
      let idx = currentRows.findIndex((r) => r.id === target.taskId);
      if (idx === -1 && target.parentId) {
        for (let i = currentRows.length - 1; i >= 0; i--) {
          if (currentRows[i].parentId === target.parentId) {
            idx = i;
            break;
          }
        }
      }
      if (idx !== -1) {
        let y = HEADER_HEIGHT;
        for (let i = 0; i < idx; i++) y += currentRows[i].isSubtask ? SUB_ROW_HEIGHT : ROW_HEIGHT;
        const h = currentRows[idx].isSubtask ? SUB_ROW_HEIGHT : ROW_HEIGHT;
        // The sticky header overlays the top of the viewport, so a row is only
        // visible between scrollTop + HEADER_HEIGHT and scrollTop + clientHeight.
        if (y < el.scrollTop + HEADER_HEIGHT || y + h > el.scrollTop + el.clientHeight) {
          top = Math.max(y - HEADER_HEIGHT, 0);
        }
      }

      if (left !== undefined || top !== undefined) {
        el.scrollTo({ left, top, behavior: "smooth" });
      }
    }, 800);
  }, []);
  useEffect(
    () => () => {
      if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    },
    []
  );

  // Lightweight schedule undo (Ctrl/Cmd+Z): drag-confirm of a ghost bar and
  // backlog moves in either direction. Reverts dates AND scheduleStatus (the
  // server also drops/restores the plan baseline on those transitions).
  // Dependencies removed by a backlog move are not restored — see the
  // confirmation dialog.
  const undoStackRef = useRef<{ taskId: string; before: ScheduleSnapshot }[]>([]);
  const pushUndo = useCallback((taskId: string, before: ScheduleSnapshot) => {
    undoStackRef.current.push({ taskId, before });
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
  }, []);

  // PATCH a task; returns { ok } or { needsConfirm, body }
  const patchTask = useCallback(
    async (
      rowId: string,
      patch: {
        name?: string;
        description?: string | null;
        startDate?: string;
        durationDays?: number;
        loggedHours?: number;
        progress?: number;
        status?: string;
        priority?: string;
        assigneeId?: string | null;
        scheduleStatus?: ScheduleStatus;
      },
      confirmedDelay = false,
      reason?: string
    ): Promise<{
      ok: boolean;
      needsConfirm?: boolean;
      needsReason?: boolean;
      isDelay?: boolean;
      error?: string;
      body?: { originalEndDate: string; newEndDate: string };
    }> => {
      try {
        // A drag/edit can land on an optimistically created task before its
        // POST returns — wait for the real id.
        const taskId = await resolveTaskId(rowId);
        const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ ...patch, confirmedDelay, reason }),
        });
        if (res.ok) {
          const data = await res.json();
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, ...data.task, deps: t.deps } : t))
          );
          return { ok: true };
        }
        if (res.status === 409) {
          const body = await res.json().catch(() => ({}));
          if (body.error === "SCHEDULE_DELAY_REQUIRES_CONFIRMATION") {
            return { ok: false, needsConfirm: true, isDelay: true, body };
          }
        }
        if (res.status === 400) {
          const body = await res.json().catch(() => ({}));
          if (body.error === "A reason is required when changing task dates.") {
            return { ok: false, needsReason: true };
          }
          return { ok: false, error: body.error };
        }
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: body.error };
      } catch {
        return { ok: false, error: "Network error. Please try again." };
      }
    },
    [projectId, resolveTaskId]
  );

  const undoLastScheduleChange = useCallback(async () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    const { taskId, before } = entry;
    const result =
      before.scheduleStatus === "unscheduled"
        ? await patchTask(taskId, { scheduleStatus: "unscheduled" })
        : await patchTask(taskId, {
            startDate: before.startDate ?? undefined,
            durationDays: before.durationDays,
            scheduleStatus: before.scheduleStatus,
          });
    if (!result.ok) {
      setActionError(result.error ?? "Couldn't undo the last schedule change.");
      fetchTasks();
    } else if (before.scheduleStatus === "unscheduled") {
      setBacklogOpen(true);
    }
  }, [patchTask, fetchTasks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "z" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return; // let text fields keep their native undo
      }
      if (undoStackRef.current.length === 0) return;
      e.preventDefault();
      void undoLastScheduleChange();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoLastScheduleChange]);

  // Open the schedule-change dialog with delay + reason context.
  // Computes newEndDate locally so the dialog can render before any API call
  // when the change is a non-delay schedule edit (API returns 400 needsReason).
  function openScheduleDialog(
    rowId: string,
    patch: { startDate?: string; durationDays?: number },
    isDelay: boolean,
    body?: { originalEndDate: string; newEndDate: string }
  ) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const start = patch.startDate ? new Date(patch.startDate) : new Date(row.startDate ?? Date.now());
    const duration = patch.durationDays ?? row.durationDays;
    const newEndDate = body ? new Date(body.newEndDate) : workEndDate(start, duration);
    const originalEndDate = row.originalEndDate ? new Date(row.originalEndDate) : newEndDate;
    const extDays = Math.max(daysBetween(originalEndDate, newEndDate), 0);
    setPendingSchedule({
      rowId,
      rowName: row.name,
      originalEndDate,
      newEndDate,
      extDays,
      isDelay,
      patch,
    });
  }

  // Drag end from GanttGrid. Dropping a ghost (estimated) bar is THE
  // scheduling gesture: it confirms the dates in the same PATCH — no dialog,
  // no reason — and registers an undo entry back to the estimated state.
  const handleDragEnd = useCallback(
    async (
      rowId: string,
      _isSubtask: boolean,
      finalStart: Date,
      finalDuration: number,
      originalStart: Date,
      originalDuration: number
    ) => {
      const wasEstimated = rows.find((r) => r.id === rowId)?.scheduleStatus === "estimated";
      const patch: Parameters<typeof patchTask>[1] = {
        startDate: finalStart.toISOString(),
        durationDays: finalDuration,
      };
      if (wasEstimated) patch.scheduleStatus = "confirmed";
      const result = await patchTask(rowId, patch);
      if (result.ok && wasEstimated) {
        pushUndo(rowId, {
          startDate: originalStart.toISOString(),
          durationDays: originalDuration,
          scheduleStatus: "estimated",
        });
      }
      if (result.needsConfirm && result.body) {
        openScheduleDialog(rowId, patch, true, result.body);
      } else if (result.needsReason) {
        openScheduleDialog(rowId, patch, false);
      } else if (!result.ok) {
        setActionError(result.error ?? "Couldn't move that task. Please try again.");
        fetchTasks(); // snap the bar back to the server state
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, patchTask, pushUndo]
  );

  // Detail panel schedule edits (start date / duration) — must go via dialog
  const handleScheduleChange = useCallback(
    (patch: { startDate?: string; durationDays?: number }) => {
      if (!selectedId) return;
      openScheduleDialog(selectedId, patch, false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, rows]
  );

  const confirmScheduleChange = useCallback(
    async (reason: string) => {
      if (!pendingSchedule) return;
      const isDelay = pendingSchedule.isDelay;
      const rowId = pendingSchedule.rowId;
      const patch = pendingSchedule.patch;
      setPendingSchedule(null);
      const result = await patchTask(rowId, patch, isDelay, reason);
      if (result.ok) {
        fetchTasks();
      } else {
        setActionError(result.error ?? "Couldn't save the schedule change. Please try again.");
        fetchTasks(); // resync to server state so the bar reflects reality
      }
    },
    [pendingSchedule, patchTask, fetchTasks]
  );

  const cancelScheduleChange = useCallback(() => setPendingSchedule(null), []);

  // Batch save from the detail panel — diffs draft vs row, PATCHes only changed fields.
  // If schedule fields changed, the PATCH may return 409 (delay) or 400 (reason needed),
  // in which case the ScheduleChangeDialog opens; the pending patch stores the schedule
  // portion so it can be retried with the reason.
  const handleSaveTask = useCallback(
    async (draft: TaskDraft) => {
      if (!selectedId) return;
      const row = tasks.find((t) => t.id === selectedId);
      if (!row) return;

      // Build the patch from only changed fields
      const patch: Record<string, unknown> = {};
      if (draft.name !== row.name) patch.name = draft.name;
      if ((draft.description ?? null) !== (row.description ?? null)) patch.description = draft.description ?? null;
      if (draft.status !== row.status) patch.status = draft.status;
      if (draft.priority !== row.priority) patch.priority = draft.priority;
      if ((draft.assigneeId ?? null) !== (row.assigneeId ?? null)) patch.assigneeId = draft.assigneeId ?? null;
      if (draft.progress !== row.progress) patch.progress = draft.progress;
      const scheduleChanged =
        (draft.startDate ?? null) !== (row.startDate ?? null) ||
        draft.durationDays !== row.durationDays;
      if (scheduleChanged) {
        patch.startDate = draft.startDate;
        patch.durationDays = draft.durationDays;
      }

      if (Object.keys(patch).length === 0) return; // nothing changed

      // Store the schedule portion separately in case we need to retry with reason
      const schedulePatch: { startDate?: string; durationDays?: number } = {};
      if (scheduleChanged) {
        schedulePatch.startDate = draft.startDate ?? undefined;
        schedulePatch.durationDays = draft.durationDays;
      }

      const result = await patchTask(selectedId, patch);
      if (result.needsConfirm && result.body) {
        openScheduleDialog(selectedId, schedulePatch, true, result.body);
      } else if (result.needsReason) {
        openScheduleDialog(selectedId, schedulePatch, false);
      } else if (result.ok) {
        fetchTasks();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, tasks, patchTask, fetchTasks]
  );

  const handleRemoveDependency = useCallback(
    async (rowId: string, predecessorId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/tasks/dependencies?predecessorId=${predecessorId}&successorId=${rowId}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      if (res.ok) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === rowId
              ? { ...t, deps: (t.deps || []).filter((d) => d.predecessorId !== predecessorId) }
              : t
          )
        );
        fetchTasks();
      }
    },
    [projectId, fetchTasks]
  );

  // Reordering computes each row's new order from its index among the *visible*
  // rows. When the "Dependent only" filter hides siblings, that index no longer
  // reflects the true sibling order, so persisting it would scramble the hidden
  // tasks. Bail and refetch (revert) rather than corrupt the order.
  const reorderBlockedByFilter = onlyDependent && view === "gantt";

  // Bulk reorder — optimistic update + API call
  const handleReorder = useCallback(
    (items: { id: string; order: number }[]) => {
      if (reorderBlockedByFilter) {
        fetchTasks();
        return;
      }
      // Optimistically update order in local state — UI updates instantly, no reload.
      const orderMap = new Map(items.map((item) => [item.id, item.order]));
      setTasks((prev) =>
        prev.map((t) => (orderMap.has(t.id) ? { ...t, order: orderMap.get(t.id)! } : t))
      );

      // Persist to server — only refetch on failure to revert.
      fetch(`/api/projects/${projectId}/tasks/reorder`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ items }),
      }).then((res) => {
        if (!res.ok) fetchTasks(); // revert on failure
      });
    },
    [projectId, fetchTasks, reorderBlockedByFilter]
  );

  // Reparent a task (move it to a different category or to top-level) + reorder siblings
  const handleReparent = useCallback(
    (taskId: string, newParentId: string | null, siblingOrder: { id: string; order: number }[]) => {
      if (reorderBlockedByFilter) {
        fetchTasks();
        return;
      }
      // Optimistically update: change parentId + reorder siblings — UI updates instantly.
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === taskId) return { ...t, parentId: newParentId };
          const orderItem = siblingOrder.find((s) => s.id === t.id);
          if (orderItem) return { ...t, order: orderItem.order };
          return t;
        })
      );

      // Persist: PATCH parentId, then reorder siblings. Only refetch on failure.
      fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ parentId: newParentId }),
      }).then((parentRes) => {
        fetch(`/api/projects/${projectId}/tasks/reorder`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ items: siblingOrder }),
        }).then((reorderRes) => {
          if (!parentRes.ok || !reorderRes.ok) fetchTasks(); // revert on failure
        });
      });
    },
    [projectId, fetchTasks, reorderBlockedByFilter]
  );

  // Inline update from detail panel — kept for non-draft interactions (e.g., assignee pills
  // that still use onUpdate for immediate feedback). handleSaveTask is the primary save path.
  const handleDetailUpdate = useCallback(
    (patch: Parameters<typeof patchTask>[1]) => {
      if (!selectedId) return;
      patchTask(selectedId, patch);
    },
    [selectedId, patchTask]
  );

  const handleAddDependency = useCallback(
    async (rowId: string, predecessorId: string) => {
      const res = await fetch(`/api/projects/${projectId}/tasks/dependencies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ predecessorId, successorId: rowId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.error ?? "Failed") as Error & { body?: { error?: string } };
        err.body = body;
        throw err;
      }
      setTasks((prev) =>
        prev.map((t) => (t.id === rowId ? { ...t, deps: [...(t.deps || []), { predecessorId }] } : t))
      );
    },
    [projectId]
  );

  // Actually delete a task. Checks the response and surfaces an error instead
  // of silently assuming success. Returns whether the delete succeeded.
  const performDelete = useCallback(
    async (rowId: string): Promise<boolean> => {
      setDeleting(true);
      setDeleteError(null);
      try {
        const taskId = await resolveTaskId(rowId);
        const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setDeleteError(body.error ?? "Failed to delete.");
          return false;
        }
        setSelectedId((cur) => (cur === rowId || cur === taskId ? null : cur));
        fetchTasks();
        return true;
      } catch {
        setDeleteError("Network error. Please try again.");
        return false;
      } finally {
        setDeleting(false);
      }
    },
    [projectId, fetchTasks, resolveTaskId]
  );

  // Open the delete confirmation for a row. Deleting a category cascades to all
  // of its tasks and subtasks, so paths that don't already confirm (the sidebar
  // trash icon and the list-row menu) route through this dialog.
  const requestDelete = useCallback(
    (rowId: string) => {
      const row = tasks.find((t) => t.id === rowId);
      if (!row) return;
      setDeleteError(null);
      setPendingDelete({ ...row, isSubtask: false });
    },
    [tasks]
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const ok = await performDelete(pendingDelete.id);
    if (ok) setPendingDelete(null);
  }, [pendingDelete, performDelete]);

  const addTask = useCallback(async () => {
    const firstMember = members[0];
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        name: "New task",
        kind: "task",
        startDate: null,
        durationDays: 0,
        status: "todo",
        priority: "medium",
        assigneeId: firstMember?.id ?? null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      // Insert the created task directly — the POST response is the server
      // row, so no refetch is needed and the row appears without a reload.
      setTasks((prev) => [...prev, toApiTask(data.task)]);
      setSelectedId(data.task.id);
    }
  }, [projectId, members]);

  // Create a child (Task under a Category, or Subtask under a Task).
  // Used by the hover-"+" inline add. The parent's kind determines the
  // semantic level of the new row but the API just needs parentId + kind=task.
  //
  // The task gets a default schedule (sibling cascade → parent window → today,
  // see resolveDefaultSchedule) marked "estimated", and is inserted
  // optimistically under a temp id so its ghost bar appears instantly — the
  // server row replaces it when the POST returns. The bar is immediately
  // interactive: actions on the temp id resolve through pendingCreatesRef.
  const createChild = useCallback(
    async (parentId: string, name: string): Promise<{ ok: boolean }> => {
      const firstMember = members[0];
      const current = tasksRef.current;
      const parent = current.find((t) => t.id === parentId);
      const parentIsTask = parent?.kind === "task";
      const resolved = resolveDefaultSchedule({
        siblings: current
          .filter((t) => t.parentId === parentId && t.scheduleStatus !== "unscheduled")
          .map((t) => ({ startDate: t.startDate, durationDays: t.durationDays, order: t.order })),
        parentStartDate: parentIsTask ? parent!.startDate : null,
        parentEndDate:
          parentIsTask && parent!.startDate && parent!.durationDays > 0
            ? workEndDate(new Date(parent!.startDate), parent!.durationDays)
            : null,
        projectStartDate,
      });
      const startIso = resolved.startDate.toISOString();
      const body = {
        name: name.trim(),
        kind: "task" as const,
        scheduleStatus: "estimated" as const,
        startDate: startIso,
        durationDays: resolved.durationDays,
        status: "todo" as const,
        priority: "low" as const,
        parentId,
        assigneeId: firstMember?.id ?? null,
      };

      const tempId = `temp-task-${++tempIdSeq.current}`;
      const optimistic: ApiTask = {
        id: tempId,
        name: body.name,
        description: null,
        kind: "task",
        scheduleStatus: "estimated",
        startDate: startIso,
        durationDays: resolved.durationDays,
        originalEndDate: null,
        originalDurationDays: 0,
        loggedHours: 0,
        progress: 0,
        status: "todo",
        priority: "low",
        order: current.reduce((m, t) => Math.max(m, t.order), -1) + 1,
        color: null,
        projectId,
        parentId,
        assigneeId: firstMember?.id ?? null,
        assignee: null,
        deps: [],
        successorDeps: [],
      };

      const createPromise = (async (): Promise<CreatedApiTask | null> => {
        try {
          const res = await fetch(`/api/projects/${projectId}/tasks`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(body),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return data.task as CreatedApiTask;
        } catch {
          return null;
        }
      })();
      pendingCreatesRef.current.set(tempId, createPromise.then((t) => t?.id ?? null));

      setTasks((prev) => [...prev, optimistic]);
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(parentId);
        return next;
      });
      requestScrollToBar(resolved.startDate, tempId, parentId);

      const created = await createPromise;
      if (!created) {
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
        setActionError("Couldn't create the task. Please try again.");
        return { ok: false };
      }
      setTasks((prev) => prev.map((t) => (t.id === tempId ? toApiTask(created) : t)));
      setSelectedId((cur) => (cur === tempId ? created.id : cur));
      return { ok: true };
    },
    [projectId, members, projectStartDate, requestScrollToBar]
  );

  const createEpic = useCallback(
    async (name: string): Promise<{ ok: boolean }> => {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: name.trim(),
          kind: "category",
          status: "todo",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks((prev) => [...prev, toApiTask(data.task)]);
        return { ok: true };
      }
      return { ok: false };
    },
    [projectId]
  );

  // Create a task directly in the backlog: name only, no dates, no bar.
  const createBacklogTask = useCallback(
    async (name: string, parentId: string) => {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: name.trim(),
          kind: "task",
          scheduleStatus: "unscheduled",
          status: "todo",
          priority: "low",
          parentId,
          assigneeId: members[0]?.id ?? null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks((prev) => [...prev, toApiTask(data.task)]);
      } else {
        setActionError("Couldn't create the task. Please try again.");
      }
    },
    [projectId, members]
  );

  const performBacklogMove = useCallback(
    async (task: ApiTask) => {
      const before: ScheduleSnapshot = {
        startDate: task.startDate,
        durationDays: task.durationDays,
        scheduleStatus: task.scheduleStatus,
      };
      const result = await patchTask(task.id, { scheduleStatus: "unscheduled" });
      if (result.ok) {
        pushUndo(task.id, before);
        setBacklogOpen(true);
        // The server also removed dependencies through this task — refetch so
        // other rows' dep arrows disappear too.
        fetchTasks();
      } else {
        setActionError(result.error ?? "Couldn't move the task to the backlog.");
      }
    },
    [patchTask, pushUndo, fetchTasks]
  );

  // Park a task in the backlog: clears its dates (and, after confirmation,
  // its dependencies). Tasks with subtasks stay on the chart — their children
  // would otherwise become unreachable rows.
  const moveToBacklog = useCallback(
    (rowId: string) => {
      const task = tasksRef.current.find((t) => t.id === rowId);
      if (!task || task.kind !== "task" || task.scheduleStatus === "unscheduled") return;
      if (tasksRef.current.some((t) => t.parentId === rowId)) {
        setActionError("A task with subtasks can't move to the backlog — move or delete its subtasks first.");
        return;
      }
      const hasDeps = (task.deps?.length ?? 0) > 0 || (task.successorDeps?.length ?? 0) > 0;
      if (hasDeps) {
        setPendingBacklogMove(task);
        return;
      }
      void performBacklogMove(task);
    },
    [performBacklogMove]
  );

  // "Schedule" button on a backlog item: apply the Phase-1 default logic —
  // the task returns to the chart as an estimated ghost bar.
  const scheduleFromBacklog = useCallback(
    async (taskId: string) => {
      const current = tasksRef.current;
      const task = current.find((t) => t.id === taskId);
      if (!task || !task.parentId) return;
      const parent = current.find((t) => t.id === task.parentId);
      const parentIsTask = parent?.kind === "task";
      const resolved = resolveDefaultSchedule({
        siblings: current
          .filter((t) => t.parentId === task.parentId && t.id !== taskId && t.scheduleStatus !== "unscheduled")
          .map((t) => ({ startDate: t.startDate, durationDays: t.durationDays, order: t.order })),
        parentStartDate: parentIsTask ? parent!.startDate : null,
        parentEndDate:
          parentIsTask && parent!.startDate && parent!.durationDays > 0
            ? workEndDate(new Date(parent!.startDate), parent!.durationDays)
            : null,
        projectStartDate,
      });
      const before: ScheduleSnapshot = { startDate: null, durationDays: 0, scheduleStatus: "unscheduled" };
      const result = await patchTask(taskId, {
        startDate: resolved.startDate.toISOString(),
        durationDays: resolved.durationDays,
        scheduleStatus: "estimated",
      });
      if (result.ok) {
        pushUndo(taskId, before);
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(task.parentId!);
          return next;
        });
        requestScrollToBar(resolved.startDate, taskId, task.parentId);
      } else {
        setActionError(result.error ?? "Couldn't schedule the task.");
      }
    },
    [patchTask, pushUndo, projectStartDate, requestScrollToBar]
  );

  // Backlog item dropped on the timeline: the user chose the date, so the
  // task is scheduled *confirmed* (solid bar) at the drop position, snapped
  // forward to a working day, with the default 1-day duration.
  const scheduleBacklogTaskAtDate = useCallback(
    async (taskId: string, date: Date) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task || !task.parentId) return;
      const start = nextWorkingDay(date);
      const before: ScheduleSnapshot = { startDate: null, durationDays: 0, scheduleStatus: "unscheduled" };
      const result = await patchTask(taskId, {
        startDate: start.toISOString(),
        durationDays: DEFAULT_TASK_DURATION_DAYS,
        scheduleStatus: "confirmed",
      });
      if (result.ok) {
        pushUndo(taskId, before);
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(task.parentId!);
          return next;
        });
      } else {
        setActionError(result.error ?? "Couldn't schedule the task.");
      }
    },
    [patchTask, pushUndo]
  );

  // DndContext handler for backlog drags: drop on the timeline schedules at
  // the hovered date; drop on another backlog item reorders the lane.
  const backlogSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleBacklogDndEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, activatorEvent, delta } = event;
      if (!over) return;
      const activeId = String(active.id);

      if (over.id === TIMELINE_DROPZONE_ID) {
        const el = scrollRef.current;
        const pointer = activatorEvent as PointerEvent;
        if (!el || typeof pointer.clientX !== "number") return;
        const clientX = pointer.clientX + delta.x;
        const rect = el.getBoundingClientRect();
        const dayIdx = Math.floor((clientX - rect.left + el.scrollLeft) / DAY_WIDTH);
        const date = addDays(rangeStartRef.current, Math.max(dayIdx, 0));
        void scheduleBacklogTaskAtDate(activeId, date);
        return;
      }

      const overId = String(over.id);
      if (overId === activeId) return;
      const list = tasksRef.current
        .filter((t) => t.kind === "task" && t.scheduleStatus === "unscheduled")
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      const oldIndex = list.findIndex((t) => t.id === activeId);
      const newIndex = list.findIndex((t) => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      // Renumber the backlog 0..n-1 in the new arrangement. `order` is only a
      // sort key, so this is always representable; when an item is scheduled
      // back out it simply sorts among its siblings by that number.
      const moved = arrayMove(list, oldIndex, newIndex);
      handleReorder(moved.map((t, idx) => ({ id: t.id, order: idx })));
    },
    [scheduleBacklogTaskAtDate, handleReorder]
  );

  // Children visible on the chart — unscheduled tasks live in the backlog
  // panel, so they don't count toward the sidebar badges/expand arrows.
  const childCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      if (t.parentId && t.scheduleStatus !== "unscheduled") {
        counts[t.parentId] = (counts[t.parentId] ?? 0) + 1;
      }
    }
    return counts;
  }, [tasks]);

  const childrenOf = useCallback(
    (parentId: string) => tasks.filter((t) => t.parentId === parentId),
    [tasks]
  );

  // Category rollups (client-side computed)
  const rollupsByCategory = useMemo(() => {
    const m: Record<string, { startDate: Date | null; endDate: Date | null; progress: number }> = {};
    for (const t of tasks) {
      if (t.kind === "category") {
        const kids = tasks.filter((x) => x.parentId === t.id).map((x) => ({ ...x, isSubtask: false }));
        m[t.id] = rollupChildren(kids);
      }
    }
    return m;
  }, [tasks]);

  // Map of every task id → TaskRow, for GanttGrid hidden-dependency lookups.
  const allTasksById = useMemo(() => {
    const m: Record<string, TaskRow> = {};
    for (const t of tasks) {
      m[t.id] = { ...t, isSubtask: false };
    }
    return m;
  }, [tasks]);

  // List view helpers
  function handleOpenMenu(e: React.MouseEvent<HTMLElement>, task: TaskRow) {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuTask(task);
  }
  function handleCloseMenu() {
    setMenuAnchor(null);
    setMenuTask(null);
  }
  function handleDeleteFromList() {
    if (!menuTask) return;
    const id = menuTask.id;
    handleCloseMenu();
    requestDelete(id);
  }

  const rootTasks = effectiveTasks.filter((t) => !t.parentId);
  function getChildren(parentId: string): TaskRow[] {
    return childrenOf(parentId).map((t) => ({
      ...t,
      isSubtask: t.parentId !== null && tasks.some((x) => x.id === t.parentId && x.parentId !== null),
    }));
  }
  function formatDate(d: string | Date | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }

  const [inlineAddParentId, setInlineAddParentId] = useState<string | null>(null);
  const [inlineAddValue, setInlineAddValue] = useState("");

  // keepOpen (Enter) leaves the input in place for the next name — see the
  // matching keyboard-first flow in TaskSidebar. createChild inserts
  // optimistically, so there's nothing to await before clearing.
  function commitInlineAdd(parentId: string, keepOpen = false) {
    const name = inlineAddValue.trim();
    if (!name) { setInlineAddParentId(null); setInlineAddValue(""); return; }
    void createChild(parentId, name);
    setInlineAddValue("");
    if (!keepOpen) setInlineAddParentId(null);
  }

  function renderListRow(task: TaskRow, depth: number) {
    const children = getChildren(task.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(task.id);
    const statusLabel = isStatus(task.status) ? STATUSES[task.status as TaskStatus].label : task.status;
    const canHaveChildren = task.kind !== "task" || !task.isSubtask;
    const showPlus = canHaveChildren && !task.isSubtask;

    // Category rows show rolled-up values from their children rather than
    // their own (unused) stored fields, matching the Gantt view's sidebar.
    const rollup = task.kind === "category" ? rollupsByCategory[task.id] : null;
    const displayStartDate: string | Date | null = rollup ? rollup.startDate : task.startDate;
    const displayDurationDays =
      rollup && rollup.startDate && rollup.endDate
        ? workDaysBetween(rollup.startDate, rollup.endDate)
        : rollup
          ? 0
          : task.durationDays;
    const displayProgress = rollup ? rollup.progress : task.progress;

    return (
      <Box key={task.id}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            py: 1.25,
            px: 2,
            pl: 2 + depth * 3,
            borderRadius: 1,
            "&:hover": { bgcolor: "rgba(0,0,0,0.02)" },
            "&:hover .row-add": { opacity: 1 },
            cursor: "pointer",
            bgcolor: task.kind === "category" ? "rgba(0,0,0,0.03)" : "transparent",
            // Category: indigo stripe (unchanged). Task: new thin brand-blue
            // stripe. Subtask: no stripe — the deepest, quietest level.
            borderLeft: task.kind === "category"
              ? "3px solid #5B63D6"
              : task.isSubtask
                ? "3px solid transparent"
                : "3px solid #2D6EEF",
          }}
          onClick={() => setSelectedId(task.id)}
        >
          <Box sx={{ width: 24, flexShrink: 0 }}>
            {hasChildren && (
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}>
                {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </IconButton>
            )}
          </Box>
          <StatusDot status={task.status} size={8} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Tooltip title={task.name} enterDelay={500}>
              <Typography
                variant="body2"
                fontWeight={task.kind === "category" ? 700 : 600}
                noWrap
                sx={{
                  textDecoration: task.status === "completed" ? "line-through" : "none",
                  color: task.status === "completed" ? "text.secondary" : "text.primary",
                  textTransform: task.kind === "category" ? "uppercase" : "none",
                  letterSpacing: task.kind === "category" ? 0.3 : 0,
                }}
              >
                {task.name}
              </Typography>
            </Tooltip>
          </Box>
          {showPlus && (
            <IconButton
              className="row-add"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) => { const n = new Set(prev); n.add(task.id); return n; });
                setInlineAddParentId(task.id);
                setInlineAddValue("");
              }}
              sx={{ flexShrink: 0, opacity: 0, p: 0.25, color: "text.disabled", "&:hover": { color: "primary.main" } }}
              title={task.kind === "category" ? "Add task" : "Add subtask"}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          )}
          <Box sx={{ width: 100, flexShrink: 0, display: { xs: "none", md: "block" } }}>
            <Typography variant="caption" color="text.secondary">
              {task.assignee
                ? `${task.assignee.user.firstName ?? ""} ${task.assignee.user.lastName ?? ""}`.trim() || "—"
                : "—"}
            </Typography>
          </Box>
          <Box sx={{ width: 100, flexShrink: 0, display: { xs: "none", md: "block" } }}>
            <Typography variant="caption" color="text.secondary">{formatDate(displayStartDate)}</Typography>
          </Box>
          <Box sx={{ width: 70, flexShrink: 0, display: { xs: "none", md: "block" } }}>
            <Typography variant="caption" color="text.secondary">
              {rollup && !rollup.startDate ? "—" : `${displayDurationDays}d`}
            </Typography>
          </Box>
          <Box sx={{ width: 80, flexShrink: 0, display: { xs: "none", md: "flex" }, alignItems: "center", gap: 1 }}>
            <LinearProgress
              variant="determinate"
              value={displayProgress}
              sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: "rgba(0,0,0,0.06)" }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 28 }}>
              {displayProgress}%
            </Typography>
          </Box>
          <Chip
            label={statusLabel}
            size="small"
            sx={{
              height: 22,
              fontSize: 11,
              flexShrink: 0,
              bgcolor: isStatus(task.status) ? `${STATUSES[task.status as TaskStatus].fill}1F` : undefined,
              color: isStatus(task.status) ? STATUSES[task.status as TaskStatus].textColor : undefined,
            }}
          />
          <IconButton size="small" onClick={(e) => handleOpenMenu(e, task)} sx={{ flexShrink: 0 }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
        {inlineAddParentId === task.id && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              py: 1,
              pl: 2 + (depth + 1) * 3,
              pr: 2,
            }}
          >
            <Box sx={{ width: 24, flexShrink: 0 }} />
            <input
              autoFocus
              value={inlineAddValue}
              onChange={(e) => setInlineAddValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitInlineAdd(task.id, true); }
                if (e.key === "Escape") { setInlineAddParentId(null); setInlineAddValue(""); }
              }}
              onBlur={() => commitInlineAdd(task.id)}
              placeholder={task.kind === "category" ? "Task name…" : "Subtask name…"}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 13,
                fontWeight: 500,
              }}
            />
          </Box>
        )}
        {hasChildren && (
          <Collapse in={isExpanded}>
            {children.map((child) => renderListRow(child, depth + 1))}
          </Collapse>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Card sx={{ boxShadow: "0 4px 16px rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.06)" }}>
        <CardContent sx={{ p: view === "gantt" && !loading ? 0 : 4 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              mb: view === "gantt" && !loading ? 0 : 3,
              px: view === "gantt" && !loading ? 0 : 0,
            }}
          >
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
          </Box>

          {view === "gantt" && !loading && (
            <DndContext
              sensors={backlogSensors}
              collisionDetection={pointerWithin}
              onDragEnd={handleBacklogDndEnd}
            >
            <Box sx={{ display: "flex", flexDirection: "column", height: 640, overflow: "hidden", borderRadius: 1 }}>
            <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
              <TaskSidebar
                rows={rows}
                members={members}
                onSelect={setSelectedId}
                selectedId={selectedId}
                onDeleteTask={requestDelete}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                childCounts={childCounts}
                onAddChild={createChild}
                onAddEpic={createEpic}
                rollupsByCategory={rollupsByCategory}
                onReorder={handleReorder}
                onReparent={handleReparent}
                bodyRef={sidebarScrollRef}
                onBodyScroll={() => syncScrollTop("sidebar")}
                width={sidebarWidth}
                collapsed={sidebarCollapsed}
                onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
                onCollapseAllEpics={collapseAllEpics}
                onRestoreExpanded={restoreExpanded}
              />
              <Box
                onMouseDown={handleSidebarResize}
                sx={{
                  width: 4,
                  flexShrink: 0,
                  cursor: "col-resize",
                  bgcolor: "divider",
                  transition: "background-color 0.15s",
                  position: "relative",
                  zIndex: 10,
                  "&:hover": { bgcolor: "primary.main" },
                  "&:active": { bgcolor: "primary.dark" },
                }}
              />
              <TimelineDropZone scrollElRef={scrollRef} onScroll={() => syncScrollTop("gantt")}>
                <GanttGrid
                  rows={rows}
                  members={members}
                  rangeStart={rangeStart}
                  totalDays={totalDays}
                  onDragEnd={handleDragEnd}
                  onDropToBacklog={moveToBacklog}
                  onBarDragActiveChange={setBarDragActive}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  rollupsByCategory={rollupsByCategory}
                  allTasksById={allTasksById}
                />
              </TimelineDropZone>
            </Box>
            <BacklogPanel
              items={backlogItems}
              epics={epicOptions}
              open={backlogOpen}
              onToggle={() => setBacklogOpen((o) => !o)}
              onCreate={createBacklogTask}
              onSchedule={scheduleFromBacklog}
              dropActive={barDragActive}
            />
            </Box>
            </DndContext>
          )}

          {loading && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
              Loading tasks...
            </Typography>
          )}

          {error && (
            <Typography variant="body2" color="error" sx={{ textAlign: "center", py: 4 }}>
              {error}
            </Typography>
          )}

          {!loading && !error && view === "list" && rootTasks.length === 0 && (
            <Box sx={{ textAlign: "center", py: 6 }}>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                No tasks yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Add your first task to start building the roadmap for {projectName}.
              </Typography>
              <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={addTask}>
                Add Task
              </Button>
            </Box>
          )}

          {!loading && !error && rootTasks.length > 0 && view === "list" && (
            <Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  py: 1,
                  px: 2,
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <Box sx={{ width: 24, flexShrink: 0 }} />
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ flex: 1 }}>
                  Name
                </Typography>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ width: 100, flexShrink: 0, display: { xs: "none", md: "block" } }}>
                  Assignee
                </Typography>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ width: 100, flexShrink: 0, display: { xs: "none", md: "block" } }}>
                  Start
                </Typography>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ width: 70, flexShrink: 0, display: { xs: "none", md: "block" } }}>
                  Duration
                </Typography>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ width: 80, flexShrink: 0, display: { xs: "none", md: "block" } }}>
                  Progress
                </Typography>
                <Box sx={{ width: 90, flexShrink: 0 }} />
                <Box sx={{ width: 36, flexShrink: 0 }} />
              </Box>
              {rootTasks.map((task) => renderListRow({ ...task, isSubtask: false }, 0))}
            </Box>
          )}
        </CardContent>
      </Card>

      {selectedRow && (
        <TaskDetailPanel
          row={selectedRow}
          members={members}
          rows={rows}
          projectId={projectId}
          subtasks={selectedRow.isSubtask ? [] : childrenOf(selectedRow.id).map((t) => ({ ...t, isSubtask: t.kind === "task" && selectedRow.kind === "task" }))}
          onClose={() => setSelectedId(null)}
          onSave={handleSaveTask}
          onDelete={performDelete}
          onAddDependency={handleAddDependency}
          onRemoveDependency={handleRemoveDependency}
          onSelectSubtask={setSelectedId}
          onMoveToBacklog={
            selectedRow.kind === "task" &&
            selectedRow.scheduleStatus !== "unscheduled" &&
            !tasks.some((t) => t.parentId === selectedRow.id)
              ? () => moveToBacklog(selectedRow.id)
              : undefined
          }
        />
      )}

      <ScheduleChangeDialog
        data={pendingSchedule}
        onConfirm={confirmScheduleChange}
        onCancel={cancelScheduleChange}
      />

      {/* Backlog-move confirmation — shown only when the task has dependencies,
          which the move will remove (see the PATCH handler). */}
      <Dialog open={pendingBacklogMove !== null} onClose={() => setPendingBacklogMove(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 15, fontWeight: 600 }}>Move to backlog?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ fontSize: 13 }}>
            “{pendingBacklogMove?.name}” is linked to other tasks. Moving it to the backlog clears
            its dates and removes those dependencies. Undo restores the dates, but not the
            dependencies.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2.5 }}>
          <Button onClick={() => setPendingBacklogMove(null)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const task = pendingBacklogMove;
              setPendingBacklogMove(null);
              if (task) void performBacklogMove(task);
            }}
            sx={{ textTransform: "none" }}
          >
            Move to backlog
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation for paths that don't confirm inline (sidebar, list menu) */}
      <Dialog open={pendingDelete !== null} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 15, fontWeight: 600 }}>
          Delete this {pendingDelete?.kind === "category" ? "category" : "task"}?
        </DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ fontSize: 13 }}>
            {pendingDelete?.kind === "category"
              ? "This category and all its tasks and subtasks will be permanently deleted."
              : "This task and all its subtasks will be permanently deleted."}
          </Typography>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2.5 }}>
          <Button onClick={() => setPendingDelete(null)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleting}
            onClick={confirmDelete}
            sx={{ textTransform: "none" }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error feedback for the inline (detail-panel) delete path */}
      <Snackbar
        open={deleteError !== null && pendingDelete === null}
        autoHideDuration={6000}
        onClose={() => setDeleteError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setDeleteError(null)} sx={{ borderRadius: 2 }}>
          {deleteError}
        </Alert>
      </Snackbar>

      {/* Error feedback for actions that otherwise fail silently (drag, schedule save) */}
      <Snackbar
        open={actionError !== null}
        autoHideDuration={6000}
        onClose={() => setActionError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ borderRadius: 2 }}>
          {actionError}
        </Alert>
      </Snackbar>
    </Box>
  );
}