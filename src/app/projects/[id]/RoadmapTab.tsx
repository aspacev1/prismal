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
import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ViewListIcon from "@mui/icons-material/ViewList";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import TaskSidebar from "./gantt/TaskSidebar";
import GanttGrid from "./gantt/GanttGrid";
import TaskDetailPanel from "./gantt/TaskDetailPanel";
import ScheduleChangeDialog, { type ScheduleChangeData } from "./gantt/ScheduleChangeDialog";
import { STATUS_LIST, STATUSES, isStatus, type TaskStatus, DAY_WIDTH } from "./gantt/constants";
import { StatusDot } from "./gantt/shared";
import { rollupChildren } from "./gantt/rollups";
import type { TaskRow, MemberOption, TaskKind, TaskDraft } from "./gantt/types";
import {
  addDays,
  daysBetween,
  workEndDate,
  getToday,
} from "@/lib/dateUtils";

type ApiTask = {
  id: string;
  name: string;
  description: string | null;
  kind: TaskKind;
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
  isMilestone: boolean;
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

  const fetchTasks = useCallback(async () => {
    setLoading(true);
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
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Auto-expand tasks that have subtasks on first load
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const t of tasks) {
        if (!t.parentId && tasks.some((x) => x.parentId === t.id)) {
          next.add(t.id);
        }
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
  const rows: TaskRow[] = useMemo(() => {
    const topLevel = effectiveTasks.filter((t) => !t.parentId).sort((a, b) => a.order - b.order);
    const out: TaskRow[] = [];
    for (const t of topLevel) {
      const children = effectiveTasks.filter((x) => x.parentId === t.id).sort((a, b) => a.order - b.order);
      out.push({ ...t, isSubtask: false });
      if (expanded.has(t.id)) {
        for (const c of children) {
          out.push({ ...c, isSubtask: false });
          const grandChildren = effectiveTasks.filter((x) => x.parentId === c.id).sort((a, b) => a.order - b.order);
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
    for (const t of effectiveTasks) {
      if (t.startDate) {
        const end = workEndDate(new Date(t.startDate), t.durationDays);
        if (!maxEnd || end > maxEnd) maxEnd = end;
      }
    }
    const end = maxEnd ? addDays(maxEnd, 14) : addDays(today, 21);
    const days = Math.max(daysBetween(start, end), 28);
    return { rangeStart: start, totalDays: days };
  }, [projectStartDate, effectiveTasks]);

  // Auto-scroll the Gantt so "today" is visible ~1 week from the left edge
  // on initial load (or when switching to the Gantt view). This prevents the
  // user from landing at the project start date (potentially far in the past)
  // and having to scroll forward through weeks of past work to find today.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scrollRef.current && view === "gantt" && !loading) {
      const todayOffsetPx = daysBetween(rangeStart, getToday()) * DAY_WIDTH;
      scrollRef.current.scrollLeft = Math.max(todayOffsetPx - DAY_WIDTH, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, loading, rangeStart]);

  function toggleExpand(taskId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

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
      },
      confirmedDelay = false,
      reason?: string
    ): Promise<{
      ok: boolean;
      needsConfirm?: boolean;
      needsReason?: boolean;
      isDelay?: boolean;
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
        }
        return { ok: false };
      } catch {
        return { ok: false };
      }
    },
    [projectId]
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
      const result = await patchTask(rowId, patch);
      if (result.needsConfirm && result.body) {
        openScheduleDialog(rowId, patch, true, result.body);
      } else if (result.needsReason) {
        openScheduleDialog(rowId, patch, false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, patchTask]
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
      if (result.ok) fetchTasks();
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

  // Bulk reorder — optimistic update + API call
  const handleReorder = useCallback(
    (items: { id: string; order: number }[]) => {
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
    [projectId, fetchTasks]
  );

  // Reparent a task (move it to a different category or to top-level) + reorder siblings
  const handleReparent = useCallback(
    (taskId: string, newParentId: string | null, siblingOrder: { id: string; order: number }[]) => {
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
    [projectId, fetchTasks]
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

  const deleteRow = useCallback(
    async (rowId: string) => {
      await fetch(`/api/projects/${projectId}/tasks/${rowId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      setSelectedId((cur) => (cur === rowId ? null : cur));
      fetchTasks();
    },
    [projectId, fetchTasks]
  );

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
      setSelectedId(data.task.id);
      fetchTasks();
    }
  }, [projectId, members, fetchTasks]);

  const addCategory = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        name: "New category",
        kind: "category",
        status: "todo",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setTasks((prev) => [...prev, { ...data.task, deps: [] }]);
      setSelectedId(data.task.id);
      fetchTasks();
    }
  }, [projectId, fetchTasks]);

  // Create a child (Task under a Category, or Subtask under a Task).
  // Used by the hover-"+" inline add. The parent's kind determines the
  // semantic level of the new row but the API just needs parentId + kind=task.
  const createChild = useCallback(
    async (parentId: string, name: string): Promise<{ ok: boolean }> => {
      const parent = tasks.find((t) => t.id === parentId);
      if (!parent) return { ok: false };
      const firstMember = members[0];
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: name.trim(),
          kind: "task",
          startDate: null,
          durationDays: 0,
          status: "todo",
          priority: "low",
          parentId,
          assigneeId: firstMember?.id ?? null,
        }),
      });
      if (res.ok) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(parentId);
          return next;
        });
        fetchTasks();
        return { ok: true };
      }
      return { ok: false };
    },
    [tasks, projectId, members, fetchTasks]
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
  async function handleDeleteFromList() {
    if (!menuTask) return;
    handleCloseMenu();
    await deleteRow(menuTask.id);
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
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const [inlineAddParentId, setInlineAddParentId] = useState<string | null>(null);
  const [inlineAddValue, setInlineAddValue] = useState("");

  async function commitInlineAdd(parentId: string) {
    const name = inlineAddValue.trim();
    if (!name) { setInlineAddParentId(null); setInlineAddValue(""); return; }
    await createChild(parentId, name);
    setInlineAddParentId(null);
    setInlineAddValue("");
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
        ? daysBetween(rollup.startDate, rollup.endDate) + 1
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
                if (e.key === "Enter") { e.preventDefault(); commitInlineAdd(task.id); }
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
        <CardContent sx={{ p: view === "gantt" && !loading && rootTasks.length > 0 ? 0 : 4 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: view === "gantt" && !loading && rootTasks.length > 0 ? 0 : 3,
              px: view === "gantt" && !loading && rootTasks.length > 0 ? 0 : 0,
            }}
          >
            <Typography variant="h6" fontWeight={700}>
              Tasks
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
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
              {view === "gantt" && (
                <ToggleButton
                  value="dependent"
                  size="small"
                  color="primary"
                  selected={onlyDependent}
                  onChange={() => setOnlyDependent((v) => !v)}
                  sx={{ textTransform: "none", px: 1.5 }}
                  title="Show only tasks that have dependencies"
                >
                  <FilterAltIcon sx={{ fontSize: 16, mr: 0.5 }} />
                  Dependent only
                </ToggleButton>
              )}
              <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={addCategory}>
                Category
              </Button>
              <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={addTask}>
                Task
              </Button>
            </Box>
          </Box>

          {view === "gantt" && !loading && rootTasks.length > 0 && (
            <Box sx={{ display: "flex", height: 640, overflow: "hidden", borderRadius: 1 }}>
              <TaskSidebar
                rows={rows}
                members={members}
                onSelect={setSelectedId}
                selectedId={selectedId}
                onDeleteTask={deleteRow}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                childCounts={childCounts}
                onAddChild={createChild}
                rollupsByCategory={rollupsByCategory}
                onReorder={handleReorder}
                onReparent={handleReparent}
              />
              <Box ref={scrollRef} sx={{ flex: 1, overflowX: "auto", overflowY: "hidden" }}>
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
                />
              </Box>
            </Box>
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

          {!loading && !error && rootTasks.length === 0 && (
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

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleCloseMenu}>
        <MenuItem onClick={() => { if (menuTask) setSelectedId(menuTask.id); handleCloseMenu(); }} dense>
          <EditIcon sx={{ mr: 1, fontSize: 18 }} />
          Edit
        </MenuItem>
        <MenuItem onClick={handleDeleteFromList} dense>
          <DeleteIcon sx={{ mr: 1, fontSize: 18 }} />
          Delete
        </MenuItem>
      </Menu>

      {selectedRow && (
        <TaskDetailPanel
          row={selectedRow}
          members={members}
          rows={rows}
          projectId={projectId}
          subtasks={selectedRow.isSubtask ? [] : childrenOf(selectedRow.id).map((t) => ({ ...t, isSubtask: t.kind === "task" && selectedRow.kind === "task" }))}
          onClose={() => setSelectedId(null)}
          onSave={handleSaveTask}
          onDelete={deleteRow}
          onAddDependency={handleAddDependency}
          onRemoveDependency={handleRemoveDependency}
          onSelectSubtask={setSelectedId}
        />
      )}

      <ScheduleChangeDialog
        data={pendingSchedule}
        onConfirm={confirmScheduleChange}
        onCancel={cancelScheduleChange}
      />
    </Box>
  );
}