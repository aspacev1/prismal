"use client";

import { useState, useRef, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AddIcon from "@mui/icons-material/Add";
import TodayIcon from "@mui/icons-material/Today";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import Collapse from "@mui/material/Collapse";
import { StatusDot } from "./shared";
import type { TaskRow } from "./types";

// The Unscheduled backlog — an explicit, opt-in home for tasks that
// intentionally have no dates. Creating a task in the chart never routes
// here implicitly (chart creation always produces a ghost bar); tasks land
// in the backlog only when created here or explicitly moved.
//
// Scheduling out of the backlog:
// - Drag a card onto the timeline → drops at the hovered date as a
//   deliberately confirmed (solid) 1-day bar. The drop is handled by
//   GanttGrid's drop target; cards publish their task id via native DnD.
// - The calendar button applies the default scheduling logic instead,
//   producing a ghost (estimated) bar on the chart.
export default function BacklogPanel({
  items,
  selectedId,
  onSelect,
  onSchedule,
  onCreate,
  canCreate,
}: {
  items: TaskRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Apply default scheduling (ghost bar) to a backlog task. */
  onSchedule: (id: string) => void;
  onCreate: (name: string) => Promise<{ ok: boolean }>;
  /** False when the project has no epics yet (every task needs one). */
  canCreate: boolean;
}) {
  // Collapsed by default when empty; remembers the user's toggle otherwise.
  const [open, setOpen] = useState(items.length > 0);
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  // Auto-expand when the first item lands (e.g. "Move to backlog" from the
  // detail panel) so the move has visible feedback; never auto-collapse.
  const prevCount = useRef(items.length);
  useEffect(() => {
    if (prevCount.current === 0 && items.length > 0) setOpen(true);
    prevCount.current = items.length;
  }, [items.length]);

  async function commitAdd(keepOpen: boolean) {
    const name = addValue.trim();
    if (!name) {
      setAdding(false);
      setAddValue("");
      return;
    }
    await onCreate(name);
    setAddValue("");
    if (!keepOpen) setAdding(false);
  }

  return (
    <Box sx={{ borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
      {/* Header — count badge stays live even when collapsed */}
      <Box
        onClick={() => setOpen((o) => !o)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 0.75,
          cursor: "pointer",
          userSelect: "none",
          "&:hover": { bgcolor: "rgba(0,0,0,0.02)" },
        }}
      >
        <Typography
          variant="caption"
          fontWeight={700}
          color="text.secondary"
          sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}
        >
          Unscheduled
        </Typography>
        <Box
          sx={{
            minWidth: 18,
            height: 18,
            px: 0.5,
            borderRadius: 999,
            bgcolor: items.length > 0 ? "rgba(45,110,239,0.12)" : "rgba(0,0,0,0.06)",
            color: items.length > 0 ? "#2D6EEF" : "text.disabled",
            fontSize: 10,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {items.length}
        </Box>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" sx={{ p: 0.25 }}>
          {open ? <ExpandMoreIcon sx={{ fontSize: 18 }} /> : <ExpandLessIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Box>

      <Collapse in={open}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, px: 2, pb: 1.5, alignItems: "center" }}>
          {items.map((t) => (
            <Box
              key={t.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-flowline-task", t.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => onSelect(t.id)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                pl: 0.5,
                pr: 0.75,
                py: 0.5,
                borderRadius: 1,
                border: "1px solid",
                borderColor: selectedId === t.id ? "primary.main" : "divider",
                bgcolor: "rgba(0,0,0,0.02)",
                cursor: "grab",
                "&:active": { cursor: "grabbing" },
                "&:hover": { bgcolor: "rgba(0,0,0,0.05)" },
              }}
              title="Drag onto the timeline to schedule at a date"
            >
              <DragIndicatorIcon sx={{ fontSize: 14, color: "text.disabled" }} />
              <StatusDot status={t.status} size={7} />
              <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 500, maxWidth: 180 }}>
                {t.name}
              </Typography>
              <Tooltip title="Schedule with default dates (ghost bar)">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSchedule(t.id);
                  }}
                  sx={{ p: 0.25, color: "text.disabled", "&:hover": { color: "primary.main" } }}
                >
                  <TodayIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Box>
          ))}

          {adding ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                border: "1px dashed",
                borderColor: "primary.main",
              }}
            >
              <input
                ref={inputRef}
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                onKeyDown={(e) => {
                  // Enter keeps the input open for rapid entry of several
                  // backlog items; Escape cancels an empty in-progress row.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitAdd(true);
                  }
                  if (e.key === "Escape") {
                    setAdding(false);
                    setAddValue("");
                  }
                }}
                onBlur={() => commitAdd(false)}
                placeholder="Task name…"
                style={{
                  width: 160,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: 12.5,
                  fontWeight: 500,
                }}
              />
            </Box>
          ) : (
            <Tooltip title={canCreate ? "Add a task with no dates" : "Create an epic first"}>
              <Box
                component="span"
                onClick={() => {
                  if (canCreate) setAdding(true);
                }}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.25,
                  fontSize: 12,
                  fontWeight: 600,
                  color: canCreate ? "text.disabled" : "rgba(0,0,0,0.22)",
                  cursor: canCreate ? "pointer" : "not-allowed",
                  "&:hover": canCreate ? { color: "primary.main" } : {},
                }}
              >
                <AddIcon sx={{ fontSize: 14 }} /> Add to backlog
              </Box>
            </Tooltip>
          )}

          {items.length === 0 && !adding && (
            <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
              Tasks parked here have no dates and no bar on the chart.
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
