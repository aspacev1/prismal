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
import TaskSidebar from "./gantt/TaskSidebar";
import GanttGrid from "./gantt/GanttGrid";
import TaskDetailPanel from "./gantt/TaskDetailPanel";
import BacklogPanel from "./gantt/BacklogPanel";
import ScheduleChangeDialog, { type ScheduleChangeData } from "./gantt/ScheduleChangeDialog";
import {
  STATUSES,
  isStatus,
  type TaskStatus,
  DAY_WIDTH,
  ROW_HEIGHT,
  SUB_ROW_HEIGHT,
  HEADER_HEIGHT,
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
import { resolveDefaultSchedule } from "@/lib/scheduling";

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
// the mapped shape GET returns. Prisma's `successorDeps` relation holds the
// rows where the task is the successor — i.e. the rows naming its
// predecessors — matching the GET route's mapping.
type CreatedApiTask = Omit<ApiTask, "deps" | "successorDeps"> & {
  predecessorDeps: { id: string }[];
  successorDeps: { predecessorId: string }[];
};

function toApiTask(t: CreatedApiTask): ApiTask {
  const { predecessorDeps, successorDeps, ...rest } = t;
  return {
    ...rest,
    deps: successorDeps.map((d) => ({ predecessorId: d.predecessorId })),
    successorDeps: predecessorDeps.map((s) => ({ id: s.id })),
  };
}

type PendingScheduleChange = ScheduleChangeData | null;

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

  // Unscheduled (backlog) tasks render no row on the chart — they live only
  // in the backlog panel, keeping the "no bar = bug" principle intact for
  // every row that IS on the chart.
  const chartTasks = useMemo(
    () => effectiveTasks.filter((t) => t.scheduleStatus !== "unscheduled"),
    [effectiveTasks]
  );

  const backlogItems: TaskRow[] = useMemo(
    () =>
      tasks
        .filter((t) => t.scheduleStatus === "unscheduled")
        .sort((a, b) => a.order - b.order)
        .map((t) => ({ ...t, isSubtask: false })),
    [tasks]
  );

  // Build flat rows: Category → Task → Subtask (expanded).
  // Sort each level by `order` so optimistic reorder updates are reflected immediately.
  const rows: TaskRow[] = useMemo(() => {
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
  }, [chartTasks, expanded]);

  // Backlog (unscheduled) tasks have no chart row but can still be selected
  // from the backlog panel, so fall back to the raw task list.
  const selectedRow = useMemo(() => {
    const fromRows = rows.find((r) => r.id === selectedId);
    if (fromRows) return fromRows;
    const t = selectedId ? tasks.find((x) => x.id === selectedId) : undefined;
    return t ? { ...t, isSubtask: false } : null;
  }, [rows, tasks, selectedId]);

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

  // PATCH a task; returns { ok } or { needsConfirm, body }
  const patchTask = useCallback(
    async (
      rowId: string,
      patch: {
        name?: string;
        description?: string | null;
        startDate?: string | null;
        durationDays?: number;
        loggedHours?: number;
        progress?: number;
        status?: string;
        priority?: string;
        assigneeId?: string | null;
        kind?: TaskKind;
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
        const res = await fetch(`/api/projects/${projectId}/tasks/${rowId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ ...patch, confirmedDelay, reason }),
        });
        if (res.ok) {
          const data = await res.json();
          setTasks((prev) =>
            prev.map((t) => (t.id === rowId ? { ...t, ...data.task, deps: t.deps } : t))
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
    [projectId]
  );

  // ---- Undo (Ctrl/Cmd+Z) for schedule-shaping actions -------------------
  // A small client-side stack of "restore this task's prior schedule state"
  // entries, pushed by actions whose date changes are frictionless server-side
  // (ghost-bar drags, backlog moves, conversions). Deliberate re-planning of
  // confirmed tasks stays under the existing reason/delay dialog flow and is
  // not undoable from here.
  const undoStackRef = useRef<
    {
      taskId: string;
      before: {
        startDate: string | null;
        durationDays: number;
        scheduleStatus: ScheduleStatus;
        kind: TaskKind;
      };
    }[]
  >([]);

  const pushUndo = useCallback((task: ApiTask) => {
    undoStackRef.current.push({
      taskId: task.id,
      before: {
        startDate: task.startDate,
        durationDays: task.durationDays,
        scheduleStatus: task.scheduleStatus,
        kind: task.kind,
      },
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return; // let text fields keep their native undo
      }
      const entry = undoStackRef.current.pop();
      if (!entry) return;
      e.preventDefault();
      // Sending the explicit prior scheduleStatus/kind is what lets the
      // server skip the reason/delay guards and restore baselines correctly.
      patchTask(entry.taskId, { ...entry.before }).then((r) => {
        if (!r.ok) fetchTasks();
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [patchTask, fetchTasks]);

  // ---- Scroll a newly created/scheduled bar into view -------------------
  // Trailing 250ms debounce so rapid keyboard entry (Enter, type, Enter…)
  // scrolls once to the latest bar instead of thrashing on every commit.
  const [scrollRequest, setScrollRequest] = useState<{ id: string; seq: number } | null>(null);
  const scrollSeqRef = useRef(0);
  const requestScrollToTask = useCallback((taskId: string) => {
    scrollSeqRef.current += 1;
    setScrollRequest({ id: taskId, seq: scrollSeqRef.current });
  }, []);

  useEffect(() => {
    if (!scrollRequest) return;
    const timer = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const task = tasks.find((t) => t.id === scrollRequest.id);
      if (!task?.startDate) return;
      // Horizontal: only move if the bar is outside the visible timeline;
      // park it roughly in the left third of the viewport.
      const barLeft = daysBetween(rangeStart, new Date(task.startDate)) * DAY_WIDTH;
      const viewW = el.clientWidth;
      const inViewX = barLeft >= el.scrollLeft && barLeft + DAY_WIDTH * 2 <= el.scrollLeft + viewW;
      if (!inViewX) {
        el.scrollTo({ left: Math.max(barLeft - viewW / 3, 0), behavior: "smooth" });
      }
      // Vertical: make sure the row is visible under the sticky header (the
      // sidebar follows via the mirrored-scroll sync).
      const idx = rows.findIndex((r) => r.id === scrollRequest.id);
      if (idx >= 0) {
        let rowTop = 0;
        for (let i = 0; i < idx; i++) rowTop += rows[i].isSubtask ? SUB_ROW_HEIGHT : ROW_HEIGHT;
        const rowH = rows[idx].isSubtask ? SUB_ROW_HEIGHT : ROW_HEIGHT;
        const contentTop = HEADER_HEIGHT + rowTop;
        const visTop = el.scrollTop + HEADER_HEIGHT;
        const visBottom = el.scrollTop + el.clientHeight;
        if (contentTop < visTop) {
          el.scrollTo({ top: rowTop, behavior: "smooth" });
        } else if (contentTop + rowH > visBottom) {
          el.scrollTo({ top: contentTop + rowH - el.clientHeight, behavior: "smooth" });
        }
      }
      // Clear the served request so unrelated task mutations don't yank the
      // viewport back here when this effect re-runs.
      setScrollRequest(null);
    }, 250);
    return () => clearTimeout(timer);
  }, [scrollRequest, tasks, rows, rangeStart]);

  // Category rollups (client-side computed). Declared before the default-
  // scheduling resolver below, which uses a category's rollup as the parent
  // window for first-child scheduling.
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

  // ---- Default scheduling context (Phase 1) -----------------------------
  // Resolve smart default dates for an item appended under `parentId`:
  // chain from the sibling directly above, else the parent's window, else
  // today clamped to the project range. Backlog items never anchor a chain.
  const resolveDefaultsFor = useCallback(
    (parentId: string | null) => {
      const siblings = tasks
        .filter(
          (t) =>
            (t.parentId ?? null) === parentId &&
            t.kind !== "category" &&
            t.scheduleStatus !== "unscheduled"
        )
        .sort((a, b) => a.order - b.order);
      const siblingAbove = [...siblings].reverse().find((s) => s.startDate) ?? null;

      const parent = parentId ? tasks.find((t) => t.id === parentId) : null;
      let parentWindow: { startDate: Date; endDate: Date | null } | null = null;
      if (parent) {
        if (parent.kind === "category") {
          const r = rollupsByCategory[parent.id];
          if (r?.startDate) parentWindow = { startDate: r.startDate, endDate: r.endDate };
        } else if (parent.startDate) {
          const ps = new Date(parent.startDate);
          parentWindow = { startDate: ps, endDate: workEndDate(ps, parent.durationDays) };
        }
      }

      return resolveDefaultSchedule({
        siblingAbove: siblingAbove
          ? { startDate: siblingAbove.startDate, durationDays: siblingAbove.durationDays }
          : null,
        parentWindow,
        projectStartDate,
        today: getToday(),
      });
    },
    [tasks, rollupsByCategory, projectStartDate]
  );

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

  // Drag end from GanttGrid
  const handleDragEnd = useCallback(
    async (
      rowId: string,
      _isSubtask: boolean,
      finalStart: Date,
      finalDuration: number,
      _originalStart: Date,
      _originalDuration: number
    ) => {
      const patch = { startDate: finalStart.toISOString(), durationDays: finalDuration };
      // A drag on a ghost (estimated) bar confirms it server-side with no
      // dialog — one gesture fully schedules a fresh task. Make that gesture
      // undoable: Ctrl/Cmd+Z restores both the dates and the estimated flag.
      const before = tasks.find((t) => t.id === rowId);
      if (before && before.scheduleStatus === "estimated") pushUndo(before);
      const result = await patchTask(rowId, patch);
      if (!result.ok && before && before.scheduleStatus === "estimated") {
        undoStackRef.current.pop();
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
    [rows, tasks, patchTask, pushUndo]
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
        const res = await fetch(`/api/projects/${projectId}/tasks/${rowId}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setDeleteError(body.error ?? "Failed to delete.");
          return false;
        }
        setSelectedId((cur) => (cur === rowId ? null : cur));
        fetchTasks();
        return true;
      } catch {
        setDeleteError("Network error. Please try again.");
        return false;
      } finally {
        setDeleting(false);
      }
    },
    [projectId, fetchTasks]
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
  // Used by the hover-"+" inline add. Name-only creation always resolves
  // smart default dates (never a date-picker): the new item appears instantly
  // as a ghost bar — or a ghost diamond for milestones — cascading from the
  // sibling above, and is scrolled into view.
  const createChild = useCallback(
    async (parentId: string, name: string, kind: "task" | "milestone" = "task"): Promise<{ ok: boolean }> => {
      const firstMember = members[0];
      const defaults = resolveDefaultsFor(parentId);
      const body = {
        name: name.trim(),
        kind,
        startDate: defaults.startDate.toISOString(),
        durationDays: kind === "milestone" ? 0 : defaults.durationDays,
        scheduleStatus: "estimated" as const,
        status: "todo" as const,
        priority: "low" as const,
        parentId,
        assigneeId: firstMember?.id ?? null,
      };
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks((prev) => [...prev, toApiTask(data.task)]);
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(parentId);
          return next;
        });
        requestScrollToTask(data.task.id);
        return { ok: true };
      }
      return { ok: false };
    },
    [projectId, members, resolveDefaultsFor, requestScrollToTask]
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

  // Right-click "Add milestone here": the user picked the date deliberately,
  // so it's confirmed (solid diamond) from the start.
  const handleCreateMilestone = useCallback(
    async (parentId: string, name: string, date: Date) => {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name,
          kind: "milestone",
          parentId,
          startDate: date.toISOString(),
          durationDays: 0,
          scheduleStatus: "confirmed",
          status: "todo",
          priority: "medium",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks((prev) => [...prev, toApiTask(data.task)]);
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(parentId);
          return next;
        });
      } else {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? "Couldn't create the milestone.");
      }
    },
    [projectId]
  );

  // Drop from the backlog onto the timeline: scheduled at the hovered date
  // with the default 1-day duration; the user chose the date deliberately,
  // so the bar is confirmed (solid), not a ghost.
  const handleScheduleFromBacklog = useCallback(
    async (taskId: string, date: Date) => {
      const before = tasks.find((t) => t.id === taskId);
      if (!before || before.scheduleStatus !== "unscheduled") return;
      pushUndo(before);
      const result = await patchTask(taskId, {
        startDate: date.toISOString(),
        durationDays: 1,
        scheduleStatus: "confirmed",
      });
      if (result.ok) {
        requestScrollToTask(taskId);
      } else {
        undoStackRef.current.pop();
        setActionError(result.error ?? "Couldn't schedule that task.");
        fetchTasks();
      }
    },
    [tasks, pushUndo, patchTask, requestScrollToTask, fetchTasks]
  );

  // Backlog "Schedule" button: applies the default scheduling logic instead
  // of a chosen date, so the task lands on the chart as a ghost bar.
  const handleScheduleWithDefaults = useCallback(
    async (taskId: string) => {
      const before = tasks.find((t) => t.id === taskId);
      if (!before || before.scheduleStatus !== "unscheduled") return;
      const defaults = resolveDefaultsFor(before.parentId ?? null);
      pushUndo(before);
      const result = await patchTask(taskId, {
        startDate: defaults.startDate.toISOString(),
        durationDays: defaults.durationDays,
        scheduleStatus: "estimated",
      });
      if (result.ok) {
        requestScrollToTask(taskId);
      } else {
        undoStackRef.current.pop();
        setActionError(result.error ?? "Couldn't schedule that task.");
        fetchTasks();
      }
    },
    [tasks, resolveDefaultsFor, pushUndo, patchTask, requestScrollToTask, fetchTasks]
  );

  // Explicit "Move to backlog" (detail panel): clears dates, removes the bar.
  // Dependency decision: dependencies stay attached — their lines simply
  // don't render while the task is unscheduled, and they reconnect when it
  // is scheduled again (there is no auto-scheduling engine to reflow them).
  const handleMoveToBacklog = useCallback(
    async (taskId: string) => {
      const before = tasks.find((t) => t.id === taskId);
      if (!before || before.kind === "milestone" || before.kind === "category") return;
      pushUndo(before);
      const result = await patchTask(taskId, { scheduleStatus: "unscheduled" });
      if (!result.ok) {
        undoStackRef.current.pop();
        setActionError(result.error ?? "Couldn't move that task to the backlog.");
        fetchTasks();
      }
    },
    [tasks, pushUndo, patchTask, fetchTasks]
  );

  // Task ↔ milestone conversion. The server collapses/expands the dates
  // (bar end ↔ 1-day bar) and enforces the guards (no subtasks, must be
  // scheduled first); undo restores the exact prior dates and duration.
  const handleConvertKind = useCallback(
    async (taskId: string, toKind: "task" | "milestone") => {
      const before = tasks.find((t) => t.id === taskId);
      if (!before) return;
      pushUndo(before);
      const result = await patchTask(taskId, { kind: toKind });
      if (!result.ok) {
        undoStackRef.current.pop();
        setActionError(result.error ?? "Couldn't convert.");
      }
    },
    [tasks, pushUndo, patchTask]
  );

  // Create a task directly in the backlog: name only, no dates, no bar
  // anywhere. Every task still needs an epic, so backlog items attach to the
  // last epic (the panel is disabled until one exists).
  const createBacklogTask = useCallback(
    async (name: string): Promise<{ ok: boolean }> => {
      const lastEpic = [...tasks]
        .filter((t) => t.kind === "category")
        .sort((a, b) => a.order - b.order)
        .pop();
      if (!lastEpic) return { ok: false };
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: name.trim(),
          kind: "task",
          parentId: lastEpic.id,
          startDate: null,
          durationDays: 0,
          scheduleStatus: "unscheduled",
          status: "todo",
          priority: "low",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks((prev) => [...prev, toApiTask(data.task)]);
        return { ok: true };
      }
      return { ok: false };
    },
    [projectId, tasks]
  );

  const childCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      if (t.parentId) {
        counts[t.parentId] = (counts[t.parentId] ?? 0) + 1;
      }
    }
    return counts;
  }, [tasks]);

  const childrenOf = useCallback(
    (parentId: string) => tasks.filter((t) => t.parentId === parentId),
    [tasks]
  );

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

  // Enter commits and keeps the input open for bulk entry (matching the
  // Gantt sidebar); blur commits and closes.
  async function commitInlineAdd(parentId: string, keepOpen = false) {
    const name = inlineAddValue.trim();
    if (!name) { setInlineAddParentId(null); setInlineAddValue(""); return; }
    setInlineAddValue("");
    if (!keepOpen) setInlineAddParentId(null);
    await createChild(parentId, name);
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
          {task.kind === "milestone" && (
            <Box
              sx={{ width: 9, height: 9, transform: "rotate(45deg)", borderRadius: "1px", bgcolor: task.color ?? "#D99A20", flexShrink: 0 }}
              title="Milestone"
            />
          )}
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
              {/* Milestones are a point in time — duration is hidden everywhere. */}
              {task.kind === "milestone" || (rollup && !rollup.startDate) ? "—" : `${displayDurationDays}d`}
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
            <>
            <Box sx={{ display: "flex", height: 640, overflow: "hidden", borderRadius: 1 }}>
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
              <Box
                ref={scrollRef}
                onScroll={() => syncScrollTop("gantt")}
                sx={{ flex: 1, overflowX: "auto", overflowY: "auto" }}
              >
                <GanttGrid
                  rows={rows}
                  members={members}
                  rangeStart={rangeStart}
                  totalDays={totalDays}
                  onDragEnd={handleDragEnd}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  rollupsByCategory={rollupsByCategory}
                  allTasksById={allTasksById}
                  onCreateMilestone={handleCreateMilestone}
                  onScheduleFromBacklog={handleScheduleFromBacklog}
                />
              </Box>
            </Box>
            <BacklogPanel
              items={backlogItems}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSchedule={handleScheduleWithDefaults}
              onCreate={createBacklogTask}
              canCreate={tasks.some((t) => t.kind === "category")}
            />
            </>
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
          onConvertKind={handleConvertKind}
          onMoveToBacklog={handleMoveToBacklog}
        />
      )}

      <ScheduleChangeDialog
        data={pendingSchedule}
        onConfirm={confirmScheduleChange}
        onCancel={cancelScheduleChange}
      />

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