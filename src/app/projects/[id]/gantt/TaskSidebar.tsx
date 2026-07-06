"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
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
  userInitials,
  userFullName,
  isStatus,
  STATUSES,
} from "./constants";
import { StatusDot, PriorityIcon, Avatar } from "./shared";
import { isOverEstimate, isExtended, isAhead, isShifted, workEndDate, HOURS_PER_DAY } from "@/lib/dateUtils";
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
  rollupsByCategory,
  onReorder,
  onReparent,
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
  rollupsByCategory: Record<string, { startDate: Date | null; endDate: Date | null; progress: number }>;
  onReorder: (items: { id: string; order: number }[]) => void;
  onReparent: (taskId: string, newParentId: string | null, siblingOrder: { id: string; order: number }[]) => void;
}) {
  const [inlineAddParentId, setInlineAddParentId] = useState<string | null>(null);
  const [inlineAddValue, setInlineAddValue] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inlineAddParentId && inputRef.current) inputRef.current.focus();
  }, [inlineAddParentId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Separate top-level rows from subtask groups
  const topLevelRows = useMemo(() => rows.filter((r) => !r.isSubtask && !r.parentId), [rows]);
  const topLevelIds = useMemo(() => topLevelRows.map((r) => r.id), [topLevelRows]);

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

  async function commitInlineAdd(parentId: string) {
    const name = inlineAddValue.trim();
    if (!name) { setInlineAddParentId(null); setInlineAddValue(""); return; }
    await onAddChild(parentId, name);
    setInlineAddParentId(null);
    setInlineAddValue("");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
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
    setActiveId(String(event.active.id));
  }

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        borderRight: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          height: HEADER_HEIGHT,
          borderBottom: "1px solid",
          borderColor: "divider",
          px: 2,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Typography
          variant="caption"
          fontWeight={700}
          color="text.secondary"
          sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}
        >
          Task
        </Typography>
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
                  rollupsByCategory={rollupsByCategory}
                  onAddChildClick={(parentId) => {
                    onToggleExpand(parentId);
                    setInlineAddParentId(parentId);
                    setInlineAddValue("");
                  }}
                  isDragging={activeId === row.id}
                  memberFor={memberFor}
                  inlineAddParentId={inlineAddParentId}
                  inlineAddValue={inlineAddValue}
                  setInlineAddValue={setInlineAddValue}
                  setInlineAddParentId={setInlineAddParentId}
                  commitInlineAdd={commitInlineAdd}
                  inputRef={inputRef}
                  childIds={childIds}
                  isExpanded={isExpanded}
                >
                  {/* Nested SortableContext for subtasks */}
                  {isExpanded && children.length > 0 && (
                    <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
                      {children.map((child) => (
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
                          onAddChildClick={(parentId) => {
                            onToggleExpand(parentId);
                            setInlineAddParentId(parentId);
                            setInlineAddValue("");
                          }}
                          isDragging={activeId === child.id}
                          memberFor={memberFor}
                          inlineAddParentId={inlineAddParentId}
                          inlineAddValue={inlineAddValue}
                          setInlineAddValue={setInlineAddValue}
                          setInlineAddParentId={setInlineAddParentId}
                          commitInlineAdd={commitInlineAdd}
                          inputRef={inputRef}
                          childIds={[]}
                          isExpanded={false}
                        >
                          {/* Subtasks don't have nested children (3-level cap) */}
                        </SortableRow>
                      ))}
                    </SortableContext>
                  )}
                </SortableRow>
              );
            })}
          </SortableContext>
        </DndContext>
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
  onAddChildClick,
  isDragging,
  memberFor,
  inlineAddParentId,
  inlineAddValue,
  setInlineAddValue,
  setInlineAddParentId,
  commitInlineAdd,
  inputRef,
  childIds: _childIds,
  isExpanded,
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
  onAddChildClick: (parentId: string) => void;
  isDragging: boolean;
  memberFor: (task: TaskRow) => MemberOption | null;
  inlineAddParentId: string | null;
  inlineAddValue: string;
  setInlineAddValue: (v: string) => void;
  setInlineAddParentId: (v: string | null) => void;
  commitInlineAdd: (parentId: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  childIds: string[];
  isExpanded: boolean;
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
          borderBottom: "1px solid",
          borderColor: "divider",
          cursor: "pointer",
          transition: "background-color 0.15s",
          bgcolor: isSelected
            ? "rgba(79,93,255,0.08)"
            : isCategory
              ? "rgba(144,97,249,0.06)"
              : "background.paper",
          borderLeft: isCategory ? "3px solid #5B63D6" : "3px solid transparent",
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
                  bgcolor: "#5B63D6",
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
          <input
            ref={(el) => { (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el; }}
            value={inlineAddValue}
            onChange={(e) => setInlineAddValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitInlineAdd(row.id); }
              if (e.key === "Escape") { setInlineAddParentId(null); setInlineAddValue(""); }
            }}
            onBlur={() => commitInlineAdd(row.id)}
            placeholder={isCategory ? "Task name…" : "Subtask name…"}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, fontWeight: 500, color: "inherit" }}
          />
        </Box>
      )}

      {/* Children rendered inside the SortableRow via children prop */}
      {rest.children}
    </Box>
  );
}