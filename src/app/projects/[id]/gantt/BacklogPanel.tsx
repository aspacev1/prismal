"use client";

import { useState, useRef, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StatusDot, PriorityIcon } from "./shared";

export type BacklogItem = {
  id: string;
  name: string;
  status: string;
  priority: string;
  // Label of the epic (or parent task, for subtasks) the item belongs to.
  parentLabel: string;
};

export type BacklogEpicOption = { id: string; name: string };

// The "Unscheduled" backlog lane, docked under the Gantt chart. An explicit,
// opt-in home for tasks that intentionally have no dates — creating a task in
// the chart never routes here. Items can be dragged onto the timeline (drop
// date, confirmed), scheduled via the button (default dates, estimated ghost),
// or reordered within the lane. The panel is also the drop target for bars
// dragged off the timeline (see `data-backlog-dropzone` + GanttGrid).
//
// This component must live inside the DndContext owned by RoadmapTab — the
// timeline drop zone and the reorder handling are registered there.
export default function BacklogPanel({
  items,
  epics,
  open,
  onToggle,
  onCreate,
  onSchedule,
  dropActive,
}: {
  items: BacklogItem[];
  epics: BacklogEpicOption[];
  open: boolean;
  onToggle: () => void;
  onCreate: (name: string, parentId: string) => void;
  onSchedule: (taskId: string) => void;
  // A timeline bar is being dragged — advertise the panel as a drop target.
  dropActive: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [epicId, setEpicId] = useState<string>(epics[0]?.id ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  // Keep the epic selection valid if epics change while the form is open.
  useEffect(() => {
    if (!epics.some((e) => e.id === epicId)) setEpicId(epics[0]?.id ?? "");
  }, [epics, epicId]);

  function commitAdd(keepOpen = false) {
    const name = nameValue.trim();
    if (!name || !epicId) {
      if (!keepOpen) setAdding(false);
      setNameValue("");
      return;
    }
    onCreate(name, epicId);
    setNameValue("");
    if (!keepOpen) setAdding(false);
  }

  return (
    <Box
      data-backlog-dropzone
      sx={{
        borderTop: "1px solid",
        borderColor: dropActive ? "#2D6EEF" : "divider",
        bgcolor: dropActive ? "rgba(45,110,239,0.04)" : "background.paper",
        transition: "background-color 0.15s, border-color 0.15s",
        flexShrink: 0,
      }}
    >
      {/* Header — always visible; the count badge stays live even collapsed */}
      <Box
        onClick={onToggle}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          height: 36,
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
        {dropActive && (
          <Typography variant="caption" sx={{ color: "#2D6EEF", fontSize: 11 }}>
            Drop here to move to the backlog
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" sx={{ p: 0.25 }} title={open ? "Collapse" : "Expand"}>
          {open ? <ExpandMoreIcon sx={{ fontSize: 18 }} /> : <ExpandLessIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </Box>

      {open && (
        <Box sx={{ maxHeight: 180, overflowY: "auto", borderTop: "1px solid", borderColor: "divider" }}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <BacklogRow key={item.id} item={item} onSchedule={onSchedule} />
            ))}
          </SortableContext>

          {items.length === 0 && !adding && (
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", px: 1.5, py: 1 }}>
              No unscheduled tasks. Drag a bar here to park it, or add one below.
            </Typography>
          )}

          {adding ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, height: 34 }}>
              <input
                ref={inputRef}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitAdd(true); }
                  if (e.key === "Escape") { setAdding(false); setNameValue(""); }
                }}
                onBlur={(e) => {
                  // Ignore blur caused by picking an epic in the select.
                  if (e.relatedTarget && (e.relatedTarget as HTMLElement).tagName === "SELECT") return;
                  commitAdd();
                }}
                placeholder="Task name…"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, fontWeight: 500, color: "inherit" }}
              />
              {epics.length > 1 && (
                <select
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  style={{ fontSize: 12, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 4, padding: "2px 4px", background: "transparent" }}
                >
                  {epics.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              )}
            </Box>
          ) : (
            <Box sx={{ px: 1.5, py: 0.5 }}>
              <Tooltip title={epics.length === 0 ? "Create an epic first" : ""}>
                <span>
                  <Button
                    size="small"
                    startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                    disabled={epics.length === 0}
                    onClick={() => setAdding(true)}
                    sx={{ textTransform: "none", fontSize: 12, color: "text.disabled", "&:hover": { color: "primary.main", bgcolor: "transparent" } }}
                  >
                    Add an unscheduled task
                  </Button>
                </span>
              </Tooltip>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

function BacklogRow({
  item,
  onSchedule,
}: {
  item: BacklogItem;
  onSchedule: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition || "transform 200ms ease",
        opacity: isDragging ? 0.5 : 1,
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.5,
        height: 34,
        borderBottom: "1px solid rgba(0,0,0,0.04)",
        bgcolor: "background.paper",
        "&:hover .backlog-schedule": { opacity: 1 },
      }}
    >
      {/* Drag handle — reorder within the lane, or drag onto the timeline to
          schedule at the drop date. */}
      <Box
        {...attributes}
        {...listeners}
        component="button"
        sx={{
          border: "none",
          background: "none",
          cursor: "grab",
          color: "text.disabled",
          display: "flex",
          alignItems: "center",
          p: 0,
          width: 16,
          height: 16,
          "&:active": { cursor: "grabbing" },
        }}
        title="Drag to reorder, or drop on the timeline to schedule"
      >
        <DragIndicatorIcon sx={{ fontSize: 14, transform: "rotate(90deg)" }} />
      </Box>
      <StatusDot status={item.status} size={8} />
      <PriorityIcon priority={item.priority} size={11} />
      <Typography noWrap sx={{ fontSize: 13, fontWeight: 500, minWidth: 0 }}>
        {item.name}
      </Typography>
      <Typography noWrap variant="caption" color="text.disabled" sx={{ fontSize: 11, minWidth: 0 }}>
        {item.parentLabel}
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Button
        className="backlog-schedule"
        size="small"
        startIcon={<EventAvailableIcon sx={{ fontSize: 14 }} />}
        onClick={() => onSchedule(item.id)}
        sx={{ textTransform: "none", fontSize: 12, py: 0, opacity: 0, transition: "opacity 0.15s" }}
        title="Give this task estimated dates and show it on the chart"
      >
        Schedule
      </Button>
    </Box>
  );
}
