"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
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
import {
  addDays,
  daysBetween,
  workEndDate,
  workDaysBetween,
  isWeekend,
  isOverEstimate,
  isExtended,
  isAhead,
  isShifted,
  getToday,
} from "@/lib/dateUtils";
import type { TaskRow, MemberOption } from "./types";

type LiveOverride = { rowId: string; start: Date; duration: number } | null;

export default function GanttGrid({
  rows,
  members,
  rangeStart,
  totalDays,
  onDragEnd,
  selectedId,
  onSelect,
  rollupsByCategory,
  allTasksById,
}: {
  rows: TaskRow[];
  members: MemberOption[];
  rangeStart: Date;
  totalDays: number;
  onDragEnd: (
    rowId: string,
    isSubtask: boolean,
    finalStart: Date,
    finalDuration: number,
    originalStart: Date,
    originalDuration: number
  ) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  rollupsByCategory: Record<string, { startDate: Date | null; endDate: Date | null; progress: number }>;
  allTasksById: Record<string, TaskRow>;
}) {
  const dragRef = useRef<{
    rowId: string;
    isSubtask: boolean;
    mode: "move" | "resize";
    startX: number;
    originalStart: Date;
    originalDuration: number;
  } | null>(null);
  const [liveOverride, setLiveOverride] = useState<LiveOverride>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const today = useMemo(() => getToday(), []);

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

  const displayRows = useMemo<TaskRow[]>(() => {
    if (!liveOverride) return rows;
    return rows.map((r) =>
      r.id === liveOverride.rowId
        ? {
            ...r,
            startDate: liveOverride.start.toISOString(),
            durationDays: liveOverride.duration,
          }
        : r
    );
  }, [rows, liveOverride]);

  const rowHeights = displayRows.map((r) => (r.isSubtask ? SUB_ROW_HEIGHT : ROW_HEIGHT));
  const totalHeight = rowHeights.reduce((a, b) => a + b, 0);

  const rowTops = useMemo(() => {
    const tops: number[] = [];
    let acc = 0;
    for (const h of rowHeights) {
      tops.push(acc);
      acc += h;
    }
    return tops;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayRows.length, rowHeights.join(",")]);

  const rowIndexById = useMemo(() => {
    const m: Record<string, number> = {};
    displayRows.forEach((r, i) => (m[r.id] = i));
    return m;
  }, [displayRows]);

  // One-hop dependency neighbors of the hovered task — used to dim non-connected bars + lines.
  const hoveredNeighbors = useMemo(() => {
    if (!hoveredId) return null;
    const set = new Set<string>([hoveredId]);
    const hoveredRow = displayRows.find((r) => r.id === hoveredId);
    if (hoveredRow) {
      for (const d of hoveredRow.deps ?? []) set.add(d.predecessorId);
    }
    for (const r of displayRows) {
      if ((r.deps ?? []).some((d) => d.predecessorId === hoveredId)) set.add(r.id);
    }
    return set;
  }, [hoveredId, displayRows]);

  const memberFor = useCallback(
    (task: TaskRow): MemberOption | null => {
      if (!task.assigneeId) return null;
      return members.find((m) => m.id === task.assigneeId) ?? null;
    },
    [members]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, row: TaskRow, mode: "move" | "resize") => {
      e.preventDefault();
      e.stopPropagation();
      const start = row.startDate ? new Date(row.startDate) : new Date();
      dragRef.current = {
        rowId: row.id,
        isSubtask: row.isSubtask,
        mode,
        startX: e.clientX,
        originalStart: new Date(start),
        originalDuration: row.durationDays,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = ev.clientX - drag.startX;
        const dayDelta = Math.round(dx / DAY_WIDTH);
        if (drag.mode === "move") {
          setLiveOverride({
            rowId: drag.rowId,
            start: addDays(drag.originalStart, dayDelta),
            duration: drag.originalDuration,
          });
        } else {
          const originalEnd = workEndDate(drag.originalStart, drag.originalDuration);
          const newEndDate = addDays(originalEnd, dayDelta);
          const newDuration = Math.max(1, workDaysBetween(drag.originalStart, newEndDate));
          setLiveOverride({
            rowId: drag.rowId,
            start: drag.originalStart,
            duration: newDuration,
          });
        }
      };

      const handleMouseUp = () => {
        const drag = dragRef.current;
        dragRef.current = null;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        if (!drag) return;
        setLiveOverride((current) => {
          if (current && current.rowId === drag.rowId) {
            onDragEnd(
              drag.rowId,
              drag.isSubtask,
              current.start,
              current.duration,
              drag.originalStart,
              drag.originalDuration
            );
          }
          return null;
        });
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [onDragEnd]
  );

  const todayOffset = daysBetween(rangeStart, today);
  const chartWidth = totalDays * DAY_WIDTH;

  return (
    <Box sx={{ position: "relative", width: chartWidth }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          height: HEADER_HEIGHT,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
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
            {d.isFirstOfMonth && (
              <Typography
                sx={{
                  position: "absolute",
                  top: 4,
                  fontSize: 10,
                  fontWeight: 500,
                  color: "text.disabled",
                }}
              >
                {d.date.toLocaleDateString("en-US", { month: "short" })}
              </Typography>
            )}
            <Typography sx={{ fontSize: 11, color: "text.secondary", lineHeight: 1, mt: 2.5 }}>
              {d.date.getDate()}
            </Typography>
            <Typography sx={{ fontSize: 9, color: "text.disabled", lineHeight: 1, mt: 0.5 }}>
              {d.date.toLocaleDateString("en-US", { weekday: "narrow" })}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Body */}
      <Box sx={{ position: "relative", height: totalHeight }}>
        {/* Zebra rows */}
        <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {displayRows.map((row, i) =>
            i % 2 === 1 ? (
              <Box
                key={row.id}
                sx={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: rowTops[i],
                  height: rowHeights[i],
                  bgcolor: "rgba(0,0,0,0.015)",
                }}
              />
            ) : null
          )}
        </Box>

        {/* Weekend columns */}
        <Box sx={{ position: "absolute", inset: 0, display: "flex", pointerEvents: "none" }}>
          {dayLabels.map((d, i) => (
            <Box
              key={i}
              sx={{
                width: DAY_WIDTH,
                height: totalHeight,
                bgcolor: d.isWeekendDay ? "rgba(0,0,0,0.025)" : "transparent",
                flexShrink: 0,
              }}
            />
          ))}
        </Box>

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

        {/* Dependency curves — two-tier styling with arrowheads */}
        <svg
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 10 }}
          width={chartWidth}
          height={totalHeight}
        >
          <defs>
            <marker
              id="dep-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2D6EEF" />
            </marker>
          </defs>
          {displayRows.flatMap((row) =>
            (row.deps || []).map((dep) => {
              const depIdx = rowIndexById[dep.predecessorId];
              const toIdx = rowIndexById[row.id];
              const color = "#2D6EEF";
              // Both endpoints visible → draw the curve
              if (depIdx !== undefined && toIdx !== undefined) {
                const depRow = displayRows[depIdx];
                const depStart = depRow.startDate ? new Date(depRow.startDate) : new Date();
                const depEnd = depRow.durationDays > 0
                  ? workEndDate(depStart, depRow.durationDays)
                  : depStart;
                const fromX = (daysBetween(rangeStart, depEnd) + 1) * DAY_WIDTH;
                const fromY = rowTops[depIdx] + rowHeights[depIdx] / 2;
                const toX = daysBetween(
                  rangeStart,
                  row.startDate ? new Date(row.startDate) : new Date()
                ) * DAY_WIDTH;
                const toY = rowTops[toIdx] + rowHeights[toIdx] / 2;
                const midX = (fromX + toX) / 2;
                const dimmed = hoveredId !== null && hoveredId !== row.id && hoveredId !== dep.predecessorId;
                return (
                  <path
                    key={`${dep.predecessorId}-${row.id}`}
                    d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                    stroke={color}
                    strokeWidth={1.75}
                    fill="none"
                    markerEnd="url(#dep-arrow)"
                    opacity={dimmed ? 0.15 : 1}
                  />
                );
              }
              // One endpoint hidden (collapsed) → draw an arrow stub + chain-link badge
              const visibleIdx = depIdx !== undefined ? depIdx : toIdx;
              if (visibleIdx === undefined) return null;
              const visibleRow = displayRows[visibleIdx];
              const isPredecessorVisible = depIdx !== undefined;
              const hiddenTaskId = isPredecessorVisible ? row.id : dep.predecessorId;
              const hiddenTask = allTasksById[hiddenTaskId];
              const hiddenName = hiddenTask?.name ?? "Hidden task";
              const visStart = visibleRow.startDate ? new Date(visibleRow.startDate) : new Date();
              const visEnd = visibleRow.durationDays > 0
                ? workEndDate(visStart, visibleRow.durationDays)
                : visStart;
              const indicatorX = isPredecessorVisible
                ? (daysBetween(rangeStart, visEnd) + 1) * DAY_WIDTH + 8
                : daysBetween(rangeStart, row.startDate ? new Date(row.startDate) : new Date()) * DAY_WIDTH - 8;
              const indicatorY = rowTops[visibleIdx] + rowHeights[visibleIdx] / 2;
              const dimmed = hoveredId !== null && !hoveredNeighbors?.has(visibleRow.id);
              const stubDir = isPredecessorVisible ? 1 : -1;
              return (
                <g
                  key={`${dep.predecessorId}-${row.id}-hidden`}
                  opacity={dimmed ? 0.15 : 1}
                >
                  <line
                    x1={indicatorX}
                    y1={indicatorY}
                    x2={indicatorX + stubDir * 16}
                    y2={indicatorY}
                    stroke={color}
                    strokeWidth={1.75}
                    markerEnd="url(#dep-arrow)"
                  />
                  <circle
                    cx={indicatorX + stubDir * 22}
                    cy={indicatorY}
                    r={8}
                    fill="rgba(255,255,255,0.95)"
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <text
                    x={indicatorX + stubDir * 22}
                    y={indicatorY + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fill={color}
                    fontWeight={700}
                  >
                    {isPredecessorVisible ? "→" : "←"}
                  </text>
                  <title>
                    {isPredecessorVisible
                      ? `Depends on hidden task: ${hiddenName}`
                      : `Hidden predecessor: ${hiddenName}`}
                  </title>
                </g>
              );
            })
          )}
        </svg>

        {/* Bars */}
        {displayRows.map((row, i) => {
          const isCategory = row.kind === "category";
          const rollup = isCategory ? rollupsByCategory[row.id] : null;
          const rollupStart = isCategory ? (rollup?.startDate ?? null) : null;
          const rollupEnd = isCategory ? (rollup?.endDate ?? null) : null;
          const hasRollup = isCategory && rollupStart !== null && rollupEnd !== null;

          // Category bar position: from rollup start to rollup end.
          // Task bar position: from row.startDate to workEndDate(start, duration).
          let barLeft: number;
          let barWidth: number;

          if (isCategory) {
            if (hasRollup && rollupStart && rollupEnd) {
              barLeft = daysBetween(rangeStart, rollupStart) * DAY_WIDTH;
              const spanDays = Math.max(daysBetween(rollupStart, rollupEnd) + 1, 1);
              barWidth = Math.max(spanDays * DAY_WIDTH, 24);
            } else {
              // No planned children — small placeholder at the left edge.
              barLeft = 4;
              barWidth = 24;
            }
          } else {
            const start = row.startDate ? new Date(row.startDate) : null;
            if (start && row.durationDays > 0) {
              barLeft = daysBetween(rangeStart, start) * DAY_WIDTH;
              const end = workEndDate(start, row.durationDays);
              const spanDays = daysBetween(start, end) + 1;
              barWidth = Math.max(spanDays * DAY_WIDTH, 24);
            } else {
              // Unplanned task — no bar (handled by the placeholder dot below).
              barLeft = 4;
              barWidth = 0; // 0 width = no bar rendered
            }
          }

          const member = memberFor(row);
          const isSelected = selectedId === row.id;
          const status = isStatus(row.status) ? STATUSES[row.status] : STATUSES.todo;
          const priority = isPriority(row.priority) ? PRIORITIES[row.priority] : PRIORITIES.medium;
          const barHeight = isCategory ? 28 : row.isSubtask ? 8 : 10;

          // Task-only computed values (not used for categories)
          const taskStart = !isCategory && row.startDate ? new Date(row.startDate) : null;
          const taskEndDate = taskStart && row.durationDays > 0 ? workEndDate(taskStart, row.durationDays) : null;
          const overBudget = !isCategory && taskStart && row.durationDays > 0 && isOverEstimate(row.durationDays, row.loggedHours);
          const ahead = !isCategory && taskStart && taskEndDate && isAhead(row.originalEndDate, taskEndDate);
          const extended = !isCategory && taskStart && taskEndDate && isExtended(row.originalEndDate, taskEndDate)
            && row.durationDays > row.originalDurationDays;
          const shifted = !isCategory && taskStart && taskEndDate && isShifted(row.originalEndDate, taskEndDate, row.durationDays, row.originalDurationDays);
          const hasPlanChange = ahead || extended || shifted;

          // Ghost outline: original plan position (only if current differs from original)
          const ghostStartPx = hasPlanChange && row.originalEndDate && taskStart
            ? barLeft - (daysBetween(taskStart, new Date(row.originalEndDate)) - daysBetween(taskStart, taskEndDate)) * DAY_WIDTH
            : null;
          // Actually simpler: ghost starts at the same position as bar if start didn't change,
          // but if start changed, ghost is at the original start position. We don't store original start.
          // Pragmatic: ghost spans from barLeft to barLeft + originalDurationDays * DAY_WIDTH (approx).
          // But original start may differ. Let's compute ghost from originalEndDate backwards.
          // ghostEnd = originalEndDate position on the grid
          const ghostEndPx = hasPlanChange && row.originalEndDate
            ? daysBetween(rangeStart, new Date(row.originalEndDate)) * DAY_WIDTH + DAY_WIDTH
            : null;
          // ghostStart = ghostEnd - originalDurationDays * DAY_WIDTH
          const ghostStartPx2 = ghostEndPx !== null && row.originalDurationDays > 0
            ? ghostEndPx - row.originalDurationDays * DAY_WIDTH
            : null;
          const ghostWidthPx = ghostStartPx2 !== null && ghostEndPx !== null
            ? ghostEndPx - ghostStartPx2
            : 0;

          const workedSoFar = !isCategory && taskStart && row.durationDays > 0
            ? today <= taskStart ? 0 : Math.min(workDaysBetween(taskStart, addDays(today, -1)), row.durationDays)
            : 0;
          const filledWidthPx = workedSoFar > 0 && taskStart
            ? (daysBetween(taskStart, workEndDate(taskStart, workedSoFar)) + 1) * DAY_WIDTH
            : 0;
          const originalEndOffsetPx = extended && taskStart
            ? daysBetween(taskStart, new Date(row.originalEndDate!)) * DAY_WIDTH
            : null;

          return (
            <Box
              key={row.id}
              onMouseEnter={() => setHoveredId(row.id)}
              onMouseLeave={() => setHoveredId(null)}
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                top: rowTops[i],
                height: rowHeights[i],
                borderBottom: "1px solid",
                borderColor: "divider",
                bgcolor: isCategory ? "rgba(144,97,249,0.04)" : "transparent",
              }}
            >
              {/* Left-of-bar avatar + priority (not for categories) */}
              {!isCategory && (
                <Box
                  sx={{
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    left: Math.max(barLeft - 42, 2),
                    width: 40,
                    height: barHeight + 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 0.25,
                    justifyContent: "flex-end",
                    zIndex: 20,
                  }}
                >
                  {member && (
                    <Avatar
                      initials={userInitials(member.firstName, member.lastName)}
                      color={member.avatarColor ?? "#4F5DFF"}
                      size={row.isSubtask ? 14 : 16}
                      title={`Assignee: ${userFullName(member.firstName, member.lastName, member.email)}`}
                    />
                  )}
                  <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }} title={`Priority: ${priority.label}`}>
                    <PriorityIcon priority={row.priority} size={row.isSubtask ? 10 : 12} />
                  </Box>
                </Box>
              )}

              {/* Category bar — full height, spans rollup date range, with progress fill */}
              {isCategory && (
                <Box
                  onClick={() => onSelect(row.id)}
                  sx={{
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    left: barLeft,
                    width: barWidth,
                    height: barHeight,
                    borderRadius: 1,
                    cursor: "pointer",
                    bgcolor: "rgba(91,99,214,0.18)",
                    border: "1.5px solid #5B63D6",
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                    zIndex: 20,
                    boxShadow: isSelected ? "0 0 0 2px rgba(79,93,255,0.4)" : "none",
                  }}
                  title={
                    hasRollup
                      ? `${row.name} — ${rollupStart!.toLocaleDateString("en-US", { month: "short", day: "numeric" })} → ${rollupEnd!.toLocaleDateString("en-US", { month: "short", day: "numeric" })} (${rollup?.progress ?? 0}% progress)`
                      : `${row.name} — category (no planned tasks yet)`
                  }
                >
                  {/* Rollup progress fill */}
                  <Box
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: `${rollup?.progress ?? 0}%`,
                      bgcolor: "#5B63D6",
                      opacity: 0.5,
                      pointerEvents: "none",
                      transition: "width 0.3s ease",
                    }}
                  />
                </Box>
              )}

              {/* Ghost outline of original plan (faint dashed border) */}
              {!isCategory && hasPlanChange && ghostStartPx2 !== null && ghostWidthPx > 0 && (
                <Box
                  sx={{
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    left: ghostStartPx2,
                    width: ghostWidthPx,
                    height: barHeight,
                    borderRadius: 0.5,
                    border: "1px dashed rgba(0,0,0,0.2)",
                    bgcolor: "transparent",
                    zIndex: 15,
                    pointerEvents: "none",
                  }}
                  title="Original plan"
                />
              )}

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

                {/* Extended striped overlay */}
                {extended && originalEndOffsetPx !== null && originalEndOffsetPx < barWidth && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: Math.max(originalEndOffsetPx, 0),
                      width: barWidth - Math.max(originalEndOffsetPx, 0),
                      backgroundImage:
                        "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 3px, transparent 3px, transparent 7px)",
                      borderLeft: "2px dashed #E8A33D",
                      zIndex: 10,
                      pointerEvents: "none",
                    }}
                  />
                )}

                {/* Over-budget badge */}
                {overBudget && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      bgcolor: "#DC2F4E",
                      border: "2px solid #fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 30,
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: 700,
                      lineHeight: 1,
                      pointerEvents: "none",
                    }}
                  >
                    !
                  </Box>
                )}

                {/* Extended badge */}
                {extended && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -6,
                      left: -6,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      bgcolor: "#F59E0B",
                      border: "2px solid #fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 30,
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: 700,
                      lineHeight: 1,
                      pointerEvents: "none",
                    }}
                  >
                    →
                  </Box>
                )}

                {/* Ahead badge (green) */}
                {ahead && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -6,
                      left: -6,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      bgcolor: "#82C2A0",
                      border: "2px solid #fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 30,
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: 700,
                      lineHeight: 1,
                      pointerEvents: "none",
                    }}
                  >
                    ←
                  </Box>
                )}

                {/* Shifted badge (blue) */}
                {shifted && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -6,
                      left: -6,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      bgcolor: "#7C95E0",
                      border: "2px solid #fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 30,
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: 700,
                      lineHeight: 1,
                      pointerEvents: "none",
                    }}
                  >
                    ⟷
                  </Box>
                )}

                {/* Resize handle */}
                <Box
                  className="resize-handle"
                  onMouseDown={(e) => handleMouseDown(e, row, "resize")}
                  sx={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 8,
                    cursor: "ew-resize",
                    opacity: 0,
                    bgcolor: "rgba(0,0,0,0.1)",
                    borderRadius: "0 4px 4px 0",
                    zIndex: 10,
                    transition: "opacity 0.15s",
                  }}
                />
                </Box>
              )}

              {/* Unplanned task placeholder (no start date or duration 0) */}
              {!isCategory && (!row.startDate || row.durationDays === 0) && (
                <Box
                  onClick={() => onSelect(row.id)}
                  sx={{
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    left: 4,
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    bgcolor: "rgba(0,0,0,0.12)",
                    border: "1.5px solid rgba(0,0,0,0.2)",
                    cursor: "pointer",
                    zIndex: 20,
                  }}
                  title={`${row.name} — not yet planned`}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}