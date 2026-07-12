"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import AddIcon from "@mui/icons-material/Add";
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
import { isExtended, isAhead, isShifted, workEndDate } from "@/lib/dateUtils";
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
  onReorder,
  onReparent,
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
  onAddChild: (parentId: string, name: string) => Promise<{ ok: boolean }>;
  onAddEpic: (name: string) => Promise<{ ok: boolean }>;
  onReorder: (items: { id: string; order: number }[]) => void;
  onReparent: (taskId: string, newParentId: string | null, siblingOrder: { id: string; order: number }[]) => void;
  width: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCollapseAllEpics: () => void;
  onRestoreExpanded: (saved: Set<string>) => void;
}) {
  // inlineAddMode: "epic" | "task" | null — which kind of inline row is open.
  // inlineAddParentId: the parent (epic or task) under which a new row is being added.
  const [inlineAddMode, setInlineAddMode] = useState<"epic" | "task" | "subtask" | null>(null);
  const [inlineAddParentId, setInlineAddParentId] = useState<string | null>(null);
  const [inlineAddValue, setInlineAddValue] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const expandedBeforeDragRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (inlineAddMode && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [inlineAddMode, inlineAddParentId]);

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

  function openAddEpic() {
    setInlineAddMode("epic");
    setInlineAddParentId(null);
    setInlineAddValue("");
  }

  function openAddTaskForEpic(epicId: string) {
    if (!expanded.has(epicId)) onToggleExpand(epicId);
    setInlineAddMode("task");
    setInlineAddParentId(epicId);
    setInlineAddValue("");
  }

  function openAddSubtaskForTask(taskId: string) {
    if (!expanded.has(taskId)) onToggleExpand(taskId);
    setInlineAddMode("subtask");
    setInlineAddParentId(taskId);
    setInlineAddValue("");
  }

  function openAddTaskForLastEpic() {
    const lastEpic = [...topLevelRows].reverse().find((r) => r.kind === "category");
    if (!lastEpic) return;
    openAddTaskForEpic(lastEpic.id);
  }

  async function commitAddEpic() {
    const name = inlineAddValue.trim();
    if (!name) { resetInlineAdd(); return; }
    await onAddEpic(name);
    resetInlineAdd();
  }

  async function commitAddTask() {
    const name = inlineAddValue.trim();
    if (!name || !inlineAddParentId) { resetInlineAdd(); return; }
    await onAddChild(inlineAddParentId, name);
    resetInlineAdd();
  }

  function resetInlineAdd() {
    setInlineAddMode(null);
    setInlineAddParentId(null);
    setInlineAddValue("");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    // Восстанавливаем состояние expand после drag эпика
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
      // Categories can't be reparented (they're always top-level)
      if (activeRow.kind === "category") return;

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
    // Авто-сворачивание всех эпиков при drag эпика (только для category)
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

      <Box sx={{ overflowY: "auto", flex: 1 }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
            {topLevelRows.map((row) => {
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
                  isDragging={activeId === row.id}
                  memberFor={memberFor}
                  childIds={childIds}
                  isExpanded={isExpanded}
                  collapsed={collapsed}
                  onAddTaskUnderEpic={openAddTaskForEpic}
                >
                  {/* Nested SortableContext for tasks under an epic */}
                  {(isExpanded || (inlineAddMode === "task" && inlineAddParentId === row.id)) && (
                    <>
                      {children.length > 0 && (
                        <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
                          {children.map((child) => {
                            const grandchildren = childRowsByParent[child.id] ?? [];
                            const grandchildIds = grandchildren.map((g) => g.id);
                            const isChildExpanded = expanded.has(child.id);
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
                                isDragging={activeId === child.id}
                                memberFor={memberFor}
                                childIds={grandchildIds}
                                isExpanded={isChildExpanded}
                                collapsed={collapsed}
                                onAddSubtask={openAddSubtaskForTask}
                              >
                                {/* Subtasks (3rd level) — no further nesting */}
                                {(isChildExpanded || (inlineAddMode === "subtask" && inlineAddParentId === child.id)) && (
                                  <>
                                    {grandchildren.length > 0 && (
                                      <SortableContext items={grandchildIds} strategy={verticalListSortingStrategy}>
                                        {grandchildren.map((g) => (
                                          <SortableRow
                                            key={g.id}
                                            row={g}
                                            members={members}
                                            selectedId={selectedId}
                                            onRowSelect={onSelect}
                                            onDeleteTask={onDeleteTask}
                                            expanded={expanded}
                                            onToggleExpand={onToggleExpand}
                                            childCounts={childCounts}
                                            isDragging={activeId === g.id}
                                            memberFor={memberFor}
                                            childIds={[]}
                                            isExpanded={false}
                                            collapsed={collapsed}
                                          />
                                        ))}
                                      </SortableContext>
                                    )}
                                    {inlineAddMode === "subtask" && inlineAddParentId === child.id && !collapsed && (
                                      <InlineTaskInput
                                        value={inlineAddValue}
                                        onChange={setInlineAddValue}
                                        onCommit={commitAddTask}
                                        onCancel={resetInlineAdd}
                                        inputRef={inputRef}
                                        placeholder="Subtask name…"
                                        indentLevel="subtask"
                                      />
                                    )}
                                  </>
                                )}
                              </SortableRow>
                            );
                          })}
                        </SortableContext>
                      )}
                      {inlineAddMode === "task" && inlineAddParentId === row.id && !collapsed && (
                        <InlineTaskInput
                          value={inlineAddValue}
                          onChange={setInlineAddValue}
                          onCommit={commitAddTask}
                          onCancel={resetInlineAdd}
                          inputRef={inputRef}
                          placeholder="Task name…"
                        />
                      )}
                    </>
                  )}
                </SortableRow>
              );
            })}
          </SortableContext>
        </DndContext>

        {/* Root-level add row — inside the scrollable area, after the last
            task/subtask. Only root-level epics can be created here; every task
            must be mapped to an epic. */}
        {!collapsed && (
          inlineAddMode === "epic" ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1.5,
                height: SUB_ROW_HEIGHT,
                borderBottom: "1px solid",
                borderColor: "divider",
                bgcolor: "rgba(79,93,255,0.04)",
              }}
            >
              <Box sx={{ width: 16, flexShrink: 0 }} />
              <input
                ref={(el) => { (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el; }}
                value={inlineAddValue}
                onChange={(e) => setInlineAddValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitAddEpic(); }
                  if (e.key === "Escape") { resetInlineAdd(); }
                }}
                placeholder="Epic name…"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, fontWeight: 500, color: "inherit" }}
              />
              <IconButton size="small" onClick={commitAddEpic} disabled={!inlineAddValue.trim()}
                onMouseDown={(e) => e.preventDefault()}
                sx={{ color: "success.main", p: 0.25, "&.Mui-disabled": { color: "text.disabled" } }} title="Save">
                <CheckIcon sx={{ fontSize: 16 }} />
              </IconButton>
              <IconButton size="small" onClick={resetInlineAdd}
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
                py: 1,
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
  isDragging,
  memberFor,
  childIds: _childIds,
  isExpanded,
  collapsed = false,
  onAddTaskUnderEpic,
  onAddSubtask,
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
  isDragging: boolean;
  memberFor: (task: TaskRow) => MemberOption | null;
  childIds: string[];
  isExpanded: boolean;
  collapsed?: boolean;
  onAddTaskUnderEpic?: (epicId: string) => void;
  onAddSubtask?: (taskId: string) => void;
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
  const isCategory = row.kind === "category";

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

  // Indent level: epic/task=0 (same level), subtask=1
  const indentLevel = row.isSubtask ? 1 : 0;
  const paddingLeft = 1.25 + indentLevel * 1.5; // 5px (epic/task), 11px (subtask)

  return (
    <Box
      ref={setNodeRef}
      style={style}
      {...rest}
    >
      {collapsed ? (
        <Box
          onClick={() => onRowSelect(row.id)}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: row.isSubtask ? SUB_ROW_HEIGHT : ROW_HEIGHT,
            borderBottom: "1px solid",
            borderColor: "divider",
            cursor: "pointer",
            transition: "background-color 0.15s",
            borderLeft: isCategory
              ? "3px solid #5B63D6"
              : row.isSubtask
                ? "3px solid transparent"
                : "3px solid #2D6EEF",
            bgcolor: isSelected
              ? "rgba(79,93,255,0.12)"
              : isCategory
                ? "rgba(91,99,214,0.12)"
                : "background.paper",
            "&:hover": {
              bgcolor: isSelected ? "rgba(79,93,255,0.18)" : "rgba(0,0,0,0.04)",
            },
          }}
          title={row.name}
        >
          <StatusDot status={row.status} size={8} />
        </Box>
      ) : (
        <Box
          onClick={() => onRowSelect(row.id)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1.5,
            pl: paddingLeft,
            height: row.isSubtask ? SUB_ROW_HEIGHT : ROW_HEIGHT,
            borderBottom: "1px solid",
            borderColor: "divider",
            cursor: "pointer",
            transition: "background-color 0.15s",
            bgcolor: isSelected
              ? "rgba(79,93,255,0.08)"
              : isCategory
                ? "rgba(91,99,214,0.12)"
                : "background.paper",
            borderLeft: isCategory
              ? "3px solid #5B63D6"
              : row.isSubtask
                ? "3px solid transparent"
                : "3px solid #2D6EEF",
            "&:hover": {
              bgcolor: isSelected ? "rgba(79,93,255,0.12)" : "rgba(0,0,0,0.04)",
            },
            "& .row-delete": { opacity: 0 },
            "&:hover .row-delete": { opacity: 1 },
            "& .row-drag": { opacity: 0 },
            "&:hover .row-drag": { opacity: 0.4 },
            "& .row-add-task": { opacity: 0 },
            "&:hover .row-add-task": { opacity: 1 },
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
              width: 14,
              height: 14,
              "&:active": { cursor: "grabbing" },
              "&:hover": { color: "text.secondary", opacity: 1 },
            }}
            title="Drag to reorder"
          >
            <DragIndicatorIcon sx={{ fontSize: 12, transform: "rotate(90deg)" }} />
          </Box>

          {hasChildren ? (
            <Box
              component="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(row.id);
              }}
              sx={{
                width: 14,
                height: 14,
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
                fontSize: 9,
              }}
            >
              ▸
            </Box>
          ) : (
            <Box sx={{ width: 14, flexShrink: 0 }} />
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

          <Typography
            title={row.name}
            sx={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: row.isSubtask ? 12 : isCategory ? 12.5 : 13,
              color: row.isSubtask ? "text.secondary" : "text.primary",
              fontWeight: isCategory ? 700 : row.isSubtask ? 400 : 500,
              textTransform: isCategory ? "uppercase" : "none",
              letterSpacing: isCategory ? 0.3 : 0,
            }}
          >
            {row.name}
          </Typography>

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

          {isCategory && onAddTaskUnderEpic && (
            <Box
              className="row-add-task"
              component="button"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onAddTaskUnderEpic(row.id); }}
              sx={{
                border: "none",
                background: "none",
                cursor: "pointer",
                color: "text.disabled",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                p: 0.25,
                width: 20,
                height: 20,
                borderRadius: 1,
                transition: "color 0.15s, background-color 0.15s",
                "&:hover": { color: "primary.main", bgcolor: "rgba(79,93,255,0.08)" },
              }}
              title="Добавить task в этот эпик"
            >
              <AddIcon sx={{ fontSize: 16 }} />
            </Box>
          )}

          {!isCategory && !row.isSubtask && onAddSubtask && (
            <Box
              className="row-add-task"
              component="button"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onAddSubtask(row.id); }}
              sx={{
                border: "none",
                background: "none",
                cursor: "pointer",
                color: "text.disabled",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                p: 0.25,
                width: 20,
                height: 20,
                borderRadius: 1,
                transition: "color 0.15s, background-color 0.15s",
                "&:hover": { color: "primary.main", bgcolor: "rgba(79,93,255,0.08)" },
              }}
              title="Добавить подзадачу"
            >
              <AddIcon sx={{ fontSize: 16 }} />
            </Box>
          )}

          <IconButton
            className="row-delete"
            size="small"
            onClick={(e) => { e.stopPropagation(); onDeleteTask(row.id); }}
            sx={{ flexShrink: 0, p: 0.25, color: "text.disabled", "&:hover": { color: "error.main" } }}
          >
            <DeleteOutlineIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Box>
      )}

      {/* Children rendered inside the SortableRow via children prop */}
      {rest.children}
    </Box>
  );
}

// InlineTaskInput — the task-name input rendered inside an epic's children
// block, appearing as the last child of that epic (or as a subtask under a task).
function InlineTaskInput({
  value,
  onChange,
  onCommit,
  onCancel,
  inputRef,
  placeholder = "Task name…",
  indentLevel = "task",
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  placeholder?: string;
  indentLevel?: "task" | "subtask";
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1.5,
        pl: indentLevel === "subtask" ? 3 : 1.25,
        height: SUB_ROW_HEIGHT,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "rgba(79,93,255,0.04)",
        borderLeft: indentLevel === "subtask" ? "3px solid transparent" : "3px solid #2D6EEF",
      }}
    >
      <Box sx={{ width: 16, flexShrink: 0 }} />
      <input
        ref={(el) => { (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el; }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onCommit(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        placeholder={placeholder}
        style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, fontWeight: 500, color: "inherit" }}
      />
      <IconButton size="small" onClick={onCommit} disabled={!value.trim()}
        onMouseDown={(e) => e.preventDefault()}
        sx={{ color: "success.main", p: 0.25, "&.Mui-disabled": { color: "text.disabled" } }} title="Save">
        <CheckIcon sx={{ fontSize: 16 }} />
      </IconButton>
      <IconButton size="small" onClick={onCancel}
        onMouseDown={(e) => e.preventDefault()}
        sx={{ color: "text.disabled", p: 0.25 }} title="Cancel">
        <CloseIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
}