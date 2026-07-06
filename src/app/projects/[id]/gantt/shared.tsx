"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import FlagIcon from "@mui/icons-material/Flag";
import {
  STATUSES,
  PRIORITIES,
  isStatus,
  isPriority,
  initialsFromName,
  type TaskStatus,
  type TaskPriority,
} from "./constants";

export function StatusDot({ status, size = 8 }: { status: string; size?: number }) {
  const s = isStatus(status) ? STATUSES[status] : STATUSES.todo;
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: s.fill,
        flexShrink: 0,
      }}
      title={s.label}
    />
  );
}

export function PriorityIcon({
  priority,
  size = 12,
}: {
  priority: string;
  size?: number;
}) {
  const p = isPriority(priority) ? PRIORITIES[priority] : PRIORITIES.medium;
  return (
    <FlagIcon
      sx={{
        color: p.textColor,
        fontSize: size,
        fill: p.filled ? p.textColor : "none",
        animation: p.pulse ? "gantt-pulse 1.5s infinite" : undefined,
        "@keyframes gantt-pulse": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.4 },
        },
      }}
      titleAccess={p.label}
    />
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = isStatus(status) ? STATUSES[status] : STATUSES.todo;
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.6,
        fontSize: 11,
        fontWeight: 500,
        px: 1,
        py: 0.25,
        borderRadius: 999,
        bgcolor: `${s.fill}1F`,
        color: s.textColor,
      }}
    >
      <StatusDot status={status} size={6} />
      {s.label}
    </Box>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const p = isPriority(priority) ? PRIORITIES[priority] : PRIORITIES.medium;
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        fontSize: 11,
        fontWeight: 500,
        px: 1,
        py: 0.25,
        borderRadius: 999,
        border: `1px solid ${p.textColor}`,
        color: p.textColor,
      }}
    >
      <PriorityIcon priority={priority} size={11} />
      {p.label}
    </Box>
  );
}

export function Avatar({
  initials,
  color,
  size = 20,
  title,
}: {
  initials: string;
  color: string;
  size?: number;
  title?: string;
}) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: color,
        color: "#fff",
        fontSize: size * 0.4,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        border: "1px solid rgba(255,255,255,0.6)",
      }}
      title={title}
    >
      {initials}
    </Box>
  );
}

export function SelectPills<T extends string>({
  value,
  onChange,
  options,
  renderOption,
}: {
  value: T;
  onChange: (v: T) => void;
  options: T[];
  renderOption: (key: T) => React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.6 }}>
      {options.map((key) => (
        <Box
          key={key}
          component="button"
          onClick={() => onChange(key)}
          sx={{
            background: "none",
            border: "none",
            cursor: "pointer",
            p: 0,
            transition: "opacity 0.15s",
            opacity: value === key ? 1 : 0.45,
            "&:hover": { opacity: 0.75 },
          }}
        >
          {renderOption(key)}
        </Box>
      ))}
    </Box>
  );
}

export { initialsFromName };