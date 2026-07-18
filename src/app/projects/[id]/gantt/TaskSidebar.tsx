"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ViewListIcon from "@mui/icons-material/ViewList";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  HEADER_HEIGHT,
  ROW_HEIGHT,
  SUB_ROW_HEIGHT,
  SIDEBAR_COLLAPSED_WIDTH,
  userInitials,
  userFullName,
  isStatus,
  STATUSES,
} from "./constants";
import { StatusDot, PriorityIcon, Avatar } from "./shared";
import { isOverEstimate, isExtended, isAhead, isShifted, workEndDate, HOURS_PER_DAY } from "@/lib/dateUtils";
import { resolveEpicColor, type EpicColor } from "@/lib/epicPalette";
import type { TaskRow, MemberOption } from "./types";

export default function TaskSidebar({
  rows,
  members,
  onSelect,
  selectedId,
  onDeleteTask,
  expanded,
  onToggleExpand,
  childCounts,
  onAddChild,
  onAddEpic,
  rollupsByCategory,
  epicColorByTaskId,
  onReorder,
  onReparent,
  bodyRef,
  onBodyScroll,
  width,
  collapsed,
  onToggleCollapsed,
  onCollapseAllEpics,
  onRestoreExpanded,
}: {
  rows: TaskRow[];
  members: MemberOption[];
  onSelect: (id: string) => void;
  selectedId: string | null;
  onDeleteTask: (id: string) => void;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  childCounts: Record<string, number>;
  onAddChild: (parentId: string, name: string, kind?: "task" | "milestone") => Promise<{ ok: boolean }>;
  onAddEpic: (name: string) => Promise<{ ok: boolean }>;
  rollupsByCategory: Record<string, { startDate: Date | null; endDate: Date | null; progress: number }>;
  epicColorByTaskId: Record<string, EpicColor>;
  onReorder: (items: { id: string; order: number }[]) => void;
  onReparent: (taskId: string, newParentId: string | null, siblingOrder: { id: string; order: number }[]) => void;
  bodyRef?: React.Ref<HTMLDivElement>;
  onBodyScroll?: () => void;
  width: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCollapseAllEpics: () => void;
  onRestoreExpanded: (saved: Set<string>) => void;
}) {
  const [inlineAddParentId, setInlineAddParentId] = useState<string | null>(null);
  const [inlineAddValue, setInlineAddValue] = useState("");
  const [inlineAddKind, setInlineAddKind] = useState<"task" | "milestone">("task");
  const [isAddingEpic, setIsAddingEpic] = useState(false);
  const [epicInputValue, setEpicInputValue] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const epicInputRef = useRef<HTMLInputElement | null>(null);
  const expandedBeforeDragRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (inlineAddParentId && inputRef.current) inputRef.current.focus();
  }, [inlineAddParentId]);

  useEffect(() => {
    if (isAddingEpic && epicInputRef.current) epicInputRef.current.focus();
  }, [isAddingEpic]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Separate top-level rows from subtask groups
  const topLevelRows = useMemo(() => rows.filter((r) => !r.isSubtask && !r.parentId), [rows]);
  const topLevelIds = useMemo(() => topLevelRows.map((r) => r.id), [topLevelRows]);
  const hasEpics = useMemo(() => topLevelRows.some((r) => r.kind === "category"), [topLevelRows]);

  // Map of parentId → child rows (for nested sortable)
  const childRowsByParent = useMemo(() => {
    const m: Record<string, TaskRow[]> = {};
    for (const r of rows) {
      if (r.parentId) {
        if (!m[r.parentId]) m[r.parentId] = [];
        m[r.parentId].push(r);
      }
    }
    return m;
  }, [rows]);

  function memberFor(task: TaskRow): MemberOption | null {
    if (!task.assigneeId) return null;
    return members.find((m) => m.id === task.assigneeId) ?? null;
  }

  // Keyboard-first bulk entry: Enter commits the name and keeps the input
  // open for the next one (each commit gets a cascading ghost bar), so ten
  // task names can be typed without touching the mouse. Blur commits and
  // closes; Escape cancels an empty in-progress row.
  async function commitInlineAdd(parentId: string, keepOpen = false) {
    const name = inlineAddValue.trim();
    if (!name) { setInlineAddParentId(null); setInlineAddValue(""); return; }
    setInlineAddValue("");
    if (!keepOpen) setInlineAddParentId(null);
    await onAddChild(parentId, name, inlineAddKind);
  }

  function handleAddChildClick(parentId: string, kind: "task" | "milestone" = "task") {
    // Expand (never collapse) the parent so the inline input and the new child
    // are visible — onToggleExpand on an already-expanded row would fold it.
    if (!expanded.has(parentId)) onToggleExpand(parentId);
    setInlineAddParentId(parentId);
    setInlineAddKind(kind);
    setInlineAddValue("");
  }

  function openAddEpic() {
    setIsAddingEpic(true);
    setEpicInputValue("");
  }

  function openAddTaskForLastEpic(kind: "task" | "milestone" = "task") {
    const lastEpic = [...topLevelRows].reverse().find((r) => r.kind === "category");
    if (!lastEpic) return;
    handleAddChildClick(lastEpic.id, kind);
  }

  async function commitAddEpic() {
    const name = epicInputValue.trim();
    if (!name) { setIsAddingEpic(false); setEpicInputValue(""); return; }
    await onAddEpic(name);
    setIsAddingEpic(false);
    setEpicInputValue("");
  }

  function cancelAddEpic() {
    setIsAddingEpic(false);
    setEpicInputValue("");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    // Restore the expand state that was collapsed at drag-start for a category.
    if (expandedBeforeDragRef.current) {
      onRestoreExpanded(expandedBeforeDragRef.current);
      expandedBeforeDragRef.current = null;
    }

    if (!over || active.id === over.id) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    const activeRow = rows.find((r) => r.id === activeIdStr);
    const overRow = rows.find((r) => r.id === overIdStr);
    if (!activeRow || !overRow) return;

    // Categories can't be reparented (they're always top-level)
    if (activeRow.kind === "category") return;

    const activeParent = activeRow.parentId ?? null;
    const overParent = overRow.parentId ?? null;

    if (activeParent === overParent) {
      // Same-parent reorder
      const siblings = activeParent
        ? (childRowsByParent[activeParent] ?? [])
        : topLevelRows;
      const oldIndex = siblings.findIndex((r) => r.id === activeIdStr);
      const newIndex = siblings.findIndex((r) => r.id === overIdStr);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(siblings, oldIndex, newIndex);
      onReorder(reordered.map((r, idx) => ({ id: r.id, order: idx })));
    } else {
      // Cross-parent: reparent the active task into the over task's parent group
      // The dragged task is inserted at the position of the over task.
      const targetSiblings = overParent
        ? (childRowsByParent[overParent] ?? [])
        : topLevelRows.filter((r) => r.kind !== "category");

      // Can't drop a task onto a category row if the category is the over target
      // — instead, dropping on a category should move the task INTO that category
      if (overRow.kind === "category" && !overParent) {
        // Dropping a task onto a category → move it into that category as the last child
        const categoryChildren = childRowsByParent[overRow.id] ?? [];
        const newSiblings = [...categoryChildren, activeRow];
        onReparent(activeIdStr, overRow.id, newSiblings.map((r, idx) => ({ id: r.id, order: idx })));
        // Also reorder the old siblings (remove the dragged task)
        if (activeParent) {
          const oldSiblings = (childRowsByParent[activeParent] ?? []).filter((r) => r.id !== activeIdStr);
          onReorder(oldSiblings.map((r, idx) => ({ id: r.id, order: idx })));
        } else {
          const oldTopLevel = topLevelRows.filter((r) => r.id !== activeIdStr && r.kind !== "category");
          onReorder(oldTopLevel.map((r, idx) => ({ id: r.id, order: idx })));
        }
        return;
      }

      // Normal cross-parent: insert at the over task's position
      const overIndex = targetSiblings.findIndex((r) => r.id === overIdStr);
      if (overIndex === -1) return;

      // Build new sibling list: remove active from old position, insert at over position
      const newSiblings = [...targetSiblings];
      newSiblings.splice(overIndex, 0, activeRow);

      onReparent(activeIdStr, overParent, newSiblings.map((r, idx) => ({ id: r.id, order: idx })));

      // Reorder the old siblings (remove the dragged task)
      if (activeParent) {
        const oldSiblings = (childRowsByParent[activeParent] ?? []).filter((r) => r.id !== activeIdStr);
        onReorder(oldSiblings.map((r, idx) => ({ id: r.id, order: idx })));
      } else {
        const oldTopLevel = topLevelRows.filter((r) => r.id !== activeIdStr && r.kind !== "category");
        onReorder(oldTopLevel.map((r, idx) => ({ id: r.id, order: idx })));
      }
    }
  }

  function handleDragStart(event: { active: { id: string | number } }) {
    const id = String(event.active.id);
    setActiveId(id);
    // Auto-collapse all epics while dragging a category so drop targets are clear.
    const activeRow = rows.find((r) => r.id === id);
    if (activeRow?.kind === "category") {
      expandedBeforeDragRef.current = new Set(expanded);
      onCollapseAllEpics();
    }
  }

  return (
    <Box
      sx={{
        width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : width,
        flexShrink: 0,
        borderRight: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        transition: "width 0.2s ease",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          height: HEADER_HEIGHT,
          borderBottom: "1px solid",
          borderColor: "divider",
          px: collapsed ? 0 : 2,
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
        }}
      >
        {collapsed ? (
          <IconButton
            size="small"
            onClick={onToggleCollapsed}
            title="Expand sidebar"
            sx={{ p: 0.5 }}
          >
            <ChevronRightIcon sx={{ fontSize: 18 }} />
          </IconButton>
        ) : (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <ViewListIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography
                variant="caption"
                fontWeight={700}
                color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}
              >
                Epic / Task
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={onToggleCollapsed}
              title="Collapse sidebar"
              sx={{ p: 0.5 }}
            >
              <ChevronLeftIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </>
        )}
      </Box>

      <Box ref={bodyRef} onScroll={onBodyScroll} sx={{ overflowY: "auto", flex: 1 }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
            {topLevelRows.map((row, rowIdx) => {
              const children = childRowsByParent[row.id] ?? [];
              const childIds = children.map((c) => c.id);
              const isExpanded = expanded.has(row.id);

              return (
                <SortableRow
                  key={row.id}
                  row={row}
                  members={members}
                  selectedId={selectedId}
                  onRowSelect={onSelect}
                  onDeleteTask={onDeleteTask}
                  expanded={expanded}
                  onToggleExpand={onToggleExpand}
                  childCounts={childCounts}
                  rollupsByCategory={rollupsByCategory}
                  epicColorByTaskId={epicColorByTaskId}
                  isFirstRow={rowIdx === 0}
                  onAddChildClick={handleAddChildClick}
                  isDragging={activeId === row.id}
                  memberFor={memberFor}
                  inlineAddParentId={inlineAddParentId}
                  inlineAddValue={inlineAddValue}
                  setInlineAddValue={setInlineAddValue}
                  setInlineAddParentId={setInlineAddParentId}
                  commitInlineAdd={commitInlineAdd}
                  inlineAddKind={inlineAddKind}
                  inputRef={inputRef}
                  childIds={childIds}
                  isExpanded={isExpanded}
                  collapsed={collapsed}
                >
                  {/* Nested SortableContext for subtasks */}
                  {isExpanded && children.length > 0 && (
                    <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
                      {children.map((child) => {
                        // Third level (Category → Task → Subtask): `rows` from
                        // RoadmapTab only contains grandchildren when this child
                        // is expanded, and GanttGrid renders them — the sidebar
                        // must render the same rows or the two panes drift out
                        // of vertical alignment.
                        const grandChildren = childRowsByParent[child.id] ?? [];
                        const grandChildIds = grandChildren.map((g) => g.id);
                        const childExpanded = expanded.has(child.id);

                        return (
                          <SortableRow
                            key={child.id}
                            row={child}
                            members={members}
                            selectedId={selectedId}
                            onRowSelect={onSelect}
                            onDeleteTask={onDeleteTask}
                            expanded={expanded}
                            onToggleExpand={onToggleExpand}
                            childCounts={childCounts}
                            rollupsByCategory={rollupsByCategory}
                            epicColorByTaskId={epicColorByTaskId}
                            onAddChildClick={handleAddChildClick}
                            isDragging={activeId === child.id}
                            memberFor={memberFor}
                            inlineAddParentId={inlineAddParentId}
                            inlineAddValue={inlineAddValue}
                            setInlineAddValue={setInlineAddValue}
                            setInlineAddParentId={setInlineAddParentId}
                            commitInlineAdd={commitInlineAdd}
                            inlineAddKind={inlineAddKind}
                            inputRef={inputRef}
                            childIds={grandChildIds}
                            isExpanded={childExpanded}
                            collapsed={collapsed}
                          >
                            {childExpanded && grandChildren.length > 0 && (
                              <SortableContext items={grandChildIds} strategy={verticalListSortingStrategy}>
                                {grandChildren.map((grandChild) => (
                                  <SortableRow
                                    key={grandChild.id}
                                    row={grandChild}
                                    members={members}
                                    selectedId={selectedId}
                                    onRowSelect={onSelect}
                                    onDeleteTask={onDeleteTask}
                                    expanded={expanded}
                                    onToggleExpand={onToggleExpand}
                                    childCounts={childCounts}
                                    rollupsByCategory={rollupsByCategory}
                                    epicColorByTaskId={epicColorByTaskId}
                                    onAddChildClick={handleAddChildClick}
                                    isDragging={activeId === grandChild.id}
                                    memberFor={memberFor}
                                    inlineAddParentId={inlineAddParentId}
                                    inlineAddValue={inlineAddValue}
                                    setInlineAddValue={setInlineAddValue}
                                    setInlineAddParentId={setInlineAddParentId}
                                    commitInlineAdd={commitInlineAdd}
                            inlineAddKind={inlineAddKind}
                                    inputRef={inputRef}
                                    childIds={[]}
                                    isExpanded={false}
                                    collapsed={collapsed}
                                  >
                                    {/* Subtasks have no children of their own (3-level cap) */}
                                  </SortableRow>
                                ))}
                              </SortableContext>
                            )}
                          </SortableRow>
                        );
                      })}
                    </SortableContext>
                  )}
                </SortableRow>
              );
            })}
          </SortableContext>
        </DndContext>

        {/* Root-level add row — sticky to the bottom of the scroll area, so it
            sits right after the last row when the list is short, and stays
            pinned in view while scrolling a long list. Only root-level epics
            can be created here; every task must be mapped to an epic. */}
        {!collapsed && (
          isAddingEpic ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1.5,
                height: SUB_ROW_HEIGHT,
                flexShrink: 0,
                position: "sticky",
                bottom: 0,
                zIndex: 1,
                borderTop: "1px solid",
                borderColor: "divider",
                bgcolor: "#F5F6FE",
              }}
            >
              <Box sx={{ width: 16, flexShrink: 0 }} />
              <input
                ref={epicInputRef}
                value={epicInputValue}
                onChange={(e) => setEpicInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitAddEpic(); }
                  if (e.key === "Escape") { cancelAddEpic(); }
                }}
                placeholder="Epic name…"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, fontWeight: 500, color: "inherit" }}
              />
              <IconButton size="small" onClick={commitAddEpic} disabled={!epicInputValue.trim()}
                onMouseDown={(e) => e.preventDefault()}
                sx={{ color: "success.main", p: 0.25, "&.Mui-disabled": { color: "text.disabled" } }} title="Save">
                <CheckIcon sx={{ fontSize: 16 }} />
              </IconButton>
              <IconButton size="small" onClick={cancelAddEpic}
                onMouseDown={(e) => e.preventDefault()}
                sx={{ color: "text.disabled", p: 0.25 }} title="Cancel">
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          ) : (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                px: 1.5,
                // Fixed height (same as the epic-input state) so the Gantt can
                // reserve a matching bottom spacer and both panes end up with
                // the same scrollable height — see GanttGrid's footer spacer.
                height: SUB_ROW_HEIGHT,
                flexShrink: 0,
                position: "sticky",
                bottom: 0,
                zIndex: 1,
                borderTop: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
              }}
            >
              <Box
                component="span"
                onClick={openAddEpic}
                sx={{ fontSize: 12, color: "text.disabled", fontWeight: 600, cursor: "pointer", "&:hover": { color: "primary.main" } }}
              >
                + Add an epic
              </Box>
              <Box
                component="span"
                onClick={() => { if (hasEpics) openAddTaskForLastEpic(); }}
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: hasEpics ? "text.disabled" : "rgba(0,0,0,0.22)",
                  cursor: hasEpics ? "pointer" : "not-allowed",
                  "&:hover": hasEpics ? { color: "primary.main" } : {},
                }}
                title={hasEpics ? "" : "Сначала создайте эпик"}
              >
                + Add a task
              </Box>
              <Box
                component="span"
                onClick={() => { if (hasEpics) openAddTaskForLastEpic("milestone"); }}
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: hasEpics ? "text.disabled" : "rgba(0,0,0,0.22)",
                  cursor: hasEpics ? "pointer" : "not-allowed",
                  "&:hover": hasEpics ? { color: "primary.main" } : {},
                }}
                title={hasEpics ? "Creates a ghost diamond with an estimated date — drag to place it" : "Сначала создайте эпик"}
              >
                + Add a milestone
              </Box>
            </Box>
          )
        )}
      </Box>
    </Box>
  );
}

// SortableRow — a single row in the sidebar that can be dragged
function SortableRow({
  row,
  members,
  selectedId,
  onRowSelect,
  onDeleteTask,
  expanded,
  onToggleExpand,
  childCounts,
  rollupsByCategory,
  epicColorByTaskId,
  isFirstRow = false,
  onAddChildClick,
  isDragging,
  memberFor,
  inlineAddParentId,
  inlineAddValue,
  setInlineAddValue,
  setInlineAddParentId,
  commitInlineAdd,
  inlineAddKind = "task",
  inputRef,
  childIds: _childIds,
  isExpanded,
  collapsed = false,
  ...rest
}: {
  row: TaskRow;
  members: MemberOption[];
  selectedId: string | null;
  onRowSelect: (id: string) => void;
  onDeleteTask: (id: string) => void;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  childCounts: Record<string, number>;
  rollupsByCategory: Record<string, { startDate: Date | null; endDate: Date | null; progress: number }>;
  epicColorByTaskId: Record<string, EpicColor>;
  isFirstRow?: boolean;
  onAddChildClick: (parentId: string) => void;
  isDragging: boolean;
  memberFor: (task: TaskRow) => MemberOption | null;
  inlineAddParentId: string | null;
  inlineAddValue: string;
  setInlineAddValue: (v: string) => void;
  setInlineAddParentId: (v: string | null) => void;
  commitInlineAdd: (parentId: string, keepOpen?: boolean) => void;
  inlineAddKind?: "task" | "milestone";
  inputRef: React.RefObject<HTMLInputElement | null>;
  childIds: string[];
  isExpanded: boolean;
  collapsed?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: row.id });

  const member = memberFor(row);
  const hasChildren = !row.isSubtask && (childCounts[row.id] ?? 0) > 0;
  const isSelected = selectedId === row.id;
  const overBudget = isOverEstimate(row.durationDays, row.loggedHours);
  const childCount = !row.isSubtask ? childCounts[row.id] ?? 0 : 0;
  const isCategory = row.kind === "category";
  const canAddChild = !row.isSubtask;
  const epic = resolveEpicColor(row, epicColorByTaskId);
  // Per-row hairlines removed to mirror the grid: only epic groups get a
  // separator (top of each category row, except the very first).
  const groupSeparator = isCategory && !isFirstRow ? "1px solid rgba(0,0,0,0.08)" : "none";

  // Plan state indicators
  const taskStart = !isCategory && row.startDate ? new Date(row.startDate) : null;
  const taskEnd = taskStart && row.durationDays > 0 ? workEndDate(taskStart, row.durationDays) : null;
  const planAhead = !!(taskEnd && isAhead(row.originalEndDate, taskEnd));
  const planExtended = !!(taskEnd && isExtended(row.originalEndDate, taskEnd) && row.durationDays > row.originalDurationDays);
  const planShifted = !!(taskEnd && isShifted(row.originalEndDate, taskEnd, row.durationDays, row.originalDurationDays));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms ease",
    opacity: isDragging || isSortableDragging ? 0.5 : 1,
  };

  if (collapsed) {
    return (
      <Box ref={setNodeRef} style={style} {...rest}>
        <Box
          onClick={() => onRowSelect(row.id)}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: row.isSubtask ? SUB_ROW_HEIGHT : ROW_HEIGHT,
            borderTop: groupSeparator,
            cursor: "pointer",
            transition: "background-color 0.15s",
            borderLeft: isCategory ? `3px solid ${epic.main}` : "3px solid transparent",
            bgcolor: isSelected
              ? "rgba(79,93,255,0.12)"
              : isCategory
                ? `${epic.main}14`
                : "background.paper",
            "&:hover": {
              bgcolor: isSelected ? "rgba(79,93,255,0.18)" : "rgba(0,0,0,0.04)",
            },
          }}
          title={row.name}
        >
          <StatusDot status={row.status} size={8} />
        </Box>
        {rest.children}
      </Box>
    );
  }

  return (
    <Box ref={setNodeRef} style={style} {...rest}>
      <Box
        onClick={() => onRowSelect(row.id)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.5,
          pl: row.isSubtask ? 4.5 : 1.5,
          height: row.isSubtask ? SUB_ROW_HEIGHT : ROW_HEIGHT,
          borderTop: groupSeparator,
          cursor: "pointer",
          transition: "background-color 0.15s",
          bgcolor: isSelected
            ? "rgba(79,93,255,0.08)"
            : isCategory
              ? `${epic.main}0A`
              : "background.paper",
          // Only categories keep a stripe — in their epic's hue. The chip
          // and bar colors now carry grouping for tasks/subtasks.
          borderLeft: isCategory ? `3px solid ${epic.main}` : "3px solid transparent",
          "&:hover": {
            bgcolor: isSelected ? "rgba(79,93,255,0.12)" : "rgba(0,0,0,0.04)",
          },
          "& .row-delete": { opacity: 0 },
          "&:hover .row-delete": { opacity: 1 },
          "& .row-add": { opacity: 0 },
          "&:hover .row-add": { opacity: 1 },
          "& .row-drag": { opacity: 0 },
          "&:hover .row-drag": { opacity: 0.4 },
        }}
      >
        {/* Drag handle */}
        <Box
          className="row-drag"
          {...attributes}
          {...listeners}
          component="button"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          sx={{
            border: "none",
            background: "none",
            cursor: "grab",
            color: "text.disabled",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            p: 0,
            width: 16,
            height: 16,
            "&:active": { cursor: "grabbing" },
            "&:hover": { color: "text.secondary", opacity: 1 },
          }}
          title="Drag to reorder"
        >
          <DragIndicatorIcon sx={{ fontSize: 14, transform: "rotate(90deg)" }} />
        </Box>

        {hasChildren ? (
          <Box
            component="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(row.id);
            }}
            sx={{
              width: 16,
              height: 16,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: "text.secondary",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              p: 0,
              transform: isExpanded ? "rotate(90deg)" : "none",
              transition: "transform 0.15s",
              fontSize: 10,
            }}
          >
            ▸
          </Box>
        ) : (
          <Box sx={{ width: 16, flexShrink: 0 }} />
        )}

        <StatusDot status={row.status} size={8} />
        {row.kind === "milestone" && (
          <Box
            sx={{ width: 9, height: 9, transform: "rotate(45deg)", borderRadius: "1px", bgcolor: row.color ?? epic.main, flexShrink: 0 }}
            title="Milestone"
          />
        )}
        {!isCategory && <PriorityIcon priority={row.priority} size={11} />}

        {member && !isCategory && (
          <Avatar
            initials={userInitials(member.firstName, member.lastName)}
            color={member.avatarColor ?? "#4F5DFF"}
            size={20}
            title={`${userFullName(member.firstName, member.lastName, member.email)} · ${member.department ?? "No department"}`}
          />
        )}

        {isCategory ? (
          // Epic name renders as a colored chip in the epic's hue — the
          // primary "which epic is this" signal, mirrored in the List view.
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              title={row.name}
              sx={{
                display: "inline-block",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                px: 1,
                py: 0.25,
                borderRadius: 999,
                bgcolor: epic.tint,
                color: epic.dark,
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              {row.name}
            </Typography>
          </Box>
        ) : (
          <Typography
            title={row.name}
            sx={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: row.isSubtask ? 12 : 13,
              color: row.isSubtask ? "text.secondary" : "text.primary",
              fontWeight: row.isSubtask ? 400 : 500,
            }}
          >
            {row.name}
          </Typography>
        )}

        {/* Plan state indicator */}
        {!isCategory && planAhead && (
          <Box component="span" sx={{ fontSize: 10, color: "#82C2A0", flexShrink: 0, fontWeight: 700 }} title="Ahead of original plan">←</Box>
        )}
        {!isCategory && planExtended && (
          <Box component="span" sx={{ fontSize: 10, color: "#F59E0B", flexShrink: 0, fontWeight: 700 }} title="Extended past original plan">→</Box>
        )}
        {!isCategory && planShifted && (
          <Box component="span" sx={{ fontSize: 10, color: "#7C95E0", flexShrink: 0, fontWeight: 700 }} title="Shifted from original plan">⟷</Box>
        )}

        {childCount > 0 && (
          <Box
            sx={{
              flexShrink: 0,
              minWidth: 18,
              height: 18,
              px: 0.5,
              borderRadius: 999,
              bgcolor: "rgba(0,0,0,0.06)",
              color: "text.disabled",
              fontSize: 10,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title={`${childCount} ${isCategory ? "task" : "subtask"}${childCount === 1 ? "" : "s"}`}
          >
            {childCount}
          </Box>
        )}

        {/* Category progress indicator */}
        {isCategory && childCount > 0 && (
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}
            title={`${rollupsByCategory[row.id]?.progress ?? 0}% rolled up`}
          >
            <Box sx={{ width: 28, height: 4, borderRadius: 2, bgcolor: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <Box
                sx={{
                  width: `${rollupsByCategory[row.id]?.progress ?? 0}%`,
                  height: "100%",
                  bgcolor: epic.main,
                  borderRadius: 2,
                  transition: "width 0.3s ease",
                }}
              />
            </Box>
            <Typography sx={{ fontSize: 9, fontWeight: 600, color: "text.disabled", minWidth: 22 }}>
              {rollupsByCategory[row.id]?.progress ?? 0}%
            </Typography>
          </Box>
        )}

        {canAddChild && (
          <IconButton
            className="row-add"
            size="small"
            onClick={(e) => { e.stopPropagation(); onAddChildClick(row.id); }}
            sx={{ flexShrink: 0, p: 0.25, color: "text.disabled", "&:hover": { color: "primary.main" } }}
            title={isCategory ? "Add task" : "Add subtask"}
          >
            <AddIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}

        <Typography
          sx={{
            fontSize: 11,
            flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
            color: overBudget ? "error.main" : "text.disabled",
            fontWeight: overBudget ? 600 : 400,
          }}
          title={row.durationDays > 0 ? `${row.loggedHours}h spent of ${row.durationDays}d plan (${row.durationDays * HOURS_PER_DAY}h)` : "Not yet planned"}
        >
          {row.durationDays > 0 ? `${row.loggedHours}h / ${row.durationDays}d` : "—"}
        </Typography>

        <IconButton
          className="row-delete"
          size="small"
          onClick={(e) => { e.stopPropagation(); onDeleteTask(row.id); }}
          sx={{ flexShrink: 0, p: 0.25, color: "text.disabled", "&:hover": { color: "error.main" } }}
        >
          <DeleteOutlineIcon sx={{ fontSize: 13 }} />
        </IconButton>
      </Box>

      {/* Inline add input */}
      {inlineAddParentId === row.id && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.5,
            pl: 4.5,
            height: SUB_ROW_HEIGHT,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "rgba(79,93,255,0.04)",
          }}
        >
          <Box sx={{ width: 16, flexShrink: 0 }} />
          {inlineAddKind === "milestone" && (
            <Box
              sx={{ width: 9, height: 9, transform: "rotate(45deg)", borderRadius: "1px", bgcolor: epic.main, flexShrink: 0 }}
              title="Milestone"
            />
          )}
          <input
            ref={(el) => { (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el; }}
            value={inlineAddValue}
            onChange={(e) => setInlineAddValue(e.target.value)}
            onKeyDown={(e) => {
              // Enter commits and keeps the input open for the next name
              // (bulk entry); Escape cancels the in-progress row.
              if (e.key === "Enter") { e.preventDefault(); commitInlineAdd(row.id, true); }
              if (e.key === "Escape") { setInlineAddParentId(null); setInlineAddValue(""); }
            }}
            onBlur={() => commitInlineAdd(row.id)}
            placeholder={inlineAddKind === "milestone" ? "Milestone name…" : isCategory ? "Task name…" : "Subtask name…"}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, fontWeight: 500, color: "inherit" }}
          />
        </Box>
      )}

      {/* Children rendered inside the SortableRow via children prop */}
      {rest.children}
    </Box>
  );
}
