"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Autocomplete from "@mui/material/Autocomplete";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";
import LinkIcon from "@mui/icons-material/Link";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import {
  DETAIL_PANEL_WIDTH,
  STATUS_LIST,
  PRIORITY_LIST,
  STATUSES,
  PRIORITIES,
  isStatus,
  isPriority,
  userInitials,
  userFullName,
  type TaskStatus,
  type TaskPriority,
} from "./constants";
import { StatusDot, PriorityIcon, Avatar } from "./shared";
import PulseTab from "./PulseTab";
import { isoDate, workEndDate, fmtDate, isExtended, isAhead, isShifted, extensionDays, daysBetween } from "@/lib/dateUtils";
import type { TaskRow, MemberOption, TaskDraft } from "./types";

const SECTION_LABEL_SX = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "text.secondary",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  mb: 0.5,
} as const;

export default function TaskDetailPanel({
  row,
  members,
  rows,
  projectId,
  subtasks,
  onClose,
  onSave,
  onDelete,
  onAddDependency,
  onRemoveDependency,
  onSelectSubtask,
  onMoveToBacklog,
}: {
  row: TaskRow;
  members: MemberOption[];
  rows: TaskRow[];
  projectId: string;
  subtasks: TaskRow[];
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
  onDelete: (id: string) => void;
  onAddDependency: (rowId: string, predecessorId: string) => Promise<void>;
  onRemoveDependency: (rowId: string, predecessorId: string) => void;
  onSelectSubtask: (id: string) => void;
  // Present only when the task is eligible for the backlog (a task with no
  // subtasks that isn't already unscheduled).
  onMoveToBacklog?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"details" | "pulse">("details");
  const [depSelection, setDepSelection] = useState("");
  const [depError, setDepError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Comment bar state
  const [commentBody, setCommentBody] = useState("");
  const [commentExpanded, setCommentExpanded] = useState(false);
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionMembers, setMentionMembers] = useState<string[]>([]);
  const [commentRefreshKey, setCommentRefreshKey] = useState(0);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);

  const isCategory = row.kind === "category";
  const isPlanned = !isCategory && !!row.startDate && row.durationDays > 0;

  const [draft, setDraft] = useState<TaskDraft>({
    name: row.name,
    description: row.description ?? "",
    startDate: row.startDate,
    durationDays: row.durationDays,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assigneeId,
    progress: row.progress,
  });

  useEffect(() => {
    setDraft({
      name: row.name,
      description: row.description ?? "",
      startDate: row.startDate,
      durationDays: row.durationDays,
      status: row.status,
      priority: row.priority,
      assigneeId: row.assigneeId,
      progress: row.progress,
    });
  }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    onSave(draft);
    onClose();
  }

  function handleSaveClick() {
    onSave(draft);
  }

  const draftStart = draft.startDate ? new Date(draft.startDate) : null;
  const draftIsPlanned = draftStart && draft.durationDays > 0;
  const endDate = draftIsPlanned ? workEndDate(draftStart, draft.durationDays) : null;
  const ahead = endDate && isAhead(row.originalEndDate, endDate);
  const extended = endDate && isExtended(row.originalEndDate, endDate) && draft.durationDays > row.originalDurationDays;
  const shifted = endDate && isShifted(row.originalEndDate, endDate, draft.durationDays, row.originalDurationDays);

  const depCandidates = useMemo(
    // Categories are structural groupings and never participate in dependencies,
    // so they must not be offered as predecessors (the server rejects them too).
    () =>
      rows.filter(
        (r) =>
          r.id !== row.id &&
          r.kind !== "category" &&
          !(row.deps || []).some((d) => d.predecessorId === r.id)
      ),
    [rows, row]
  );

  // Group members by department for Autocomplete
  const memberOptions = useMemo(() => {
    return members.map((m) => ({
      id: m.id,
      name: userFullName(m.firstName, m.lastName, m.email),
      department: m.department || "No department",
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      avatarColor: m.avatarColor ?? "#4F5DFF",
    }));
  }, [members]);

  const selectedMember = useMemo(
    () => memberOptions.find((m) => m.id === draft.assigneeId) ?? null,
    [memberOptions, draft.assigneeId]
  );

  async function handleAddDependency() {
    if (!depSelection) return;
    setDepError(null);
    try {
      await onAddDependency(row.id, depSelection);
      setDepSelection("");
    } catch (err) {
      setDepError(
        (err as { body?: { error?: string } })?.body?.error ?? "Failed to add dependency"
      );
    }
  }

  function memberForSubtask(task: TaskRow): MemberOption | null {
    if (!task.assigneeId) return null;
    return members.find((m) => m.id === task.assigneeId) ?? null;
  }

  function handleCopyLink() {
    const link = `${window.location.origin}/projects/${projectId}?task=${row.id}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // @mention detection
  function handleCommentChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const value = e.target.value;
    setCommentBody(value);
    const cursorPos = e.target.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1].toLowerCase());
      setMentionStart(cursorPos - atMatch[0].length);
    } else {
      setMentionQuery(null);
    }
  }

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return [];
    return members
      .filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(mentionQuery))
      .slice(0, 5);
  }, [mentionQuery, members]);

  function insertMention(member: MemberOption) {
    const name = `${member.firstName} ${member.lastName}`;
    const before = commentBody.slice(0, mentionStart);
    const cursorPos = commentInputRef.current?.selectionStart ?? commentBody.length;
    const after = commentBody.slice(cursorPos);
    setCommentBody(`${before}@${name} ${after}`);
    setMentionMembers((prev) => [...new Set([...prev, member.id])]);
    setMentionQuery(null);
    setTimeout(() => commentInputRef.current?.focus(), 0);
  }

  async function handlePostComment() {
    const body = commentBody.trim();
    if (!body) return;
    setPosting(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${row.id}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ body, mentions: mentionMembers }),
      });
      if (res.ok) {
        setCommentBody("");
        setMentionMembers([]);
        setCommentExpanded(false);
        setCommentRefreshKey((k) => k + 1);
      } else {
        const data = await res.json().catch(() => ({}));
        setCommentError(data.error ?? "Couldn't post your comment. Please try again.");
      }
    } catch {
      setCommentError("Network error. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      <Box onClick={handleClose} sx={{ position: "fixed", inset: 0, bgcolor: "rgba(0,0,0,0.1)", zIndex: 20 }} />
      <Box
        sx={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: DETAIL_PANEL_WIDTH,
          bgcolor: "background.paper",
          borderLeft: "1px solid",
          borderColor: "divider",
          boxShadow: 24,
          zIndex: 30,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography fontWeight={600} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 12 }}>
              {isCategory ? "Epic" : row.isSubtask ? "Subtask" : "Task"}
            </Typography>
            <Typography component="span" sx={{ fontSize: 10, color: "text.disabled", fontFamily: "monospace", bgcolor: "rgba(0,0,0,0.04)", px: 0.5, py: 0.15, borderRadius: 0.5 }}>
              #{row.id.slice(-6)}
            </Typography>
            <IconButton size="small" onClick={handleCopyLink} sx={{ color: "text.disabled", "&:hover": { color: "primary.main" }, p: 0.25 }} title="Copy task link">
              {copied ? <CheckIcon sx={{ fontSize: 14, color: "success.main" }} /> : <LinkIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Box>
          <IconButton size="small" onClick={handleClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Tabs */}
        <Box sx={{ display: "flex", borderBottom: "1px solid", borderColor: "divider", px: 2 }}>
          {(["details", "pulse"] as const).map((tab) => (
            <Box
              key={tab}
              component="button"
              onClick={() => setActiveTab(tab)}
              sx={{
                px: 1.5,
                py: 1,
                background: "none",
                border: "none",
                borderBottom: 2,
                borderColor: activeTab === tab ? "primary.main" : "transparent",
                color: activeTab === tab ? "primary.main" : "text.disabled",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                transition: "color 0.15s",
                "&:hover": { color: "text.primary" },
              }}
            >
              {tab === "details" ? "Details" : "Pulse"}
            </Box>
          ))}
        </Box>

        {activeTab === "pulse" ? (
          <PulseTab taskId={row.id} projectId={projectId} members={members} refreshKey={commentRefreshKey} onCommentDeleted={() => setCommentRefreshKey((k) => k + 1)} />
        ) : (
          <Box sx={{ p: 2, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Name */}
            <Box>
              <Typography sx={SECTION_LABEL_SX}>Task</Typography>
              <TextField
                size="small"
                fullWidth
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                sx={{ "& .MuiOutlinedInput-root": { fontSize: 13, fontWeight: 500 } }}
              />
            </Box>

            {/* Description */}
            <Box>
              <Typography sx={SECTION_LABEL_SX}>Description</Typography>
              <TextField
                multiline
                minRows={2}
                maxRows={6}
                fullWidth
                size="small"
                value={draft.description ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Add context, acceptance criteria, or notes…"
                sx={{ "& .MuiOutlinedInput-root": { fontSize: 13 } }}
              />
            </Box>

            {/* Responsible (not for categories) — moved up, Autocomplete dropdown */}
            {!isCategory && (
              <Box>
                <Typography sx={SECTION_LABEL_SX}>{row.isSubtask ? "Executor" : "Responsible"}</Typography>
                <Autocomplete
                  size="small"
                  fullWidth
                  options={memberOptions}
                  groupBy={(option) => option.department}
                  getOptionLabel={(option) => option.name}
                  value={selectedMember}
                  onChange={(_, newValue) => {
                    setDraft((d) => ({ ...d, assigneeId: newValue?.id ?? null }));
                  }}
                  renderOption={(props, option) => (
                    <Box component="li" {...props} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Avatar initials={userInitials(option.firstName, option.lastName)} color={option.avatarColor} size={20} />
                      <Typography sx={{ fontSize: 13 }}>{option.name}</Typography>
                    </Box>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Unassigned"
                      sx={{ "& .MuiOutlinedInput-root": { fontSize: 13 } }}
                    />
                  )}
                  isOptionEqualToValue={(o, v) => o.id === v.id}
                />
              </Box>
            )}

            {/* Estimated-dates notice — manual date entry below confirms them */}
            {!isCategory && row.scheduleStatus === "estimated" && (
              <Typography
                variant="caption"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  color: "#61779B",
                  bgcolor: "rgba(97,119,155,0.08)",
                  border: "1px dashed rgba(97,119,155,0.4)",
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  fontSize: 11,
                }}
              >
                ≈ Dates are estimated — drag the bar or save new dates to confirm them
              </Typography>
            )}

            {/* Start + Planned (not for categories) */}
            {!isCategory && (
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                <Box>
                  <Typography sx={SECTION_LABEL_SX}>Start</Typography>
                  <TextField
                    type="date"
                    size="small"
                    fullWidth
                    value={draftStart ? isoDate(draftStart) : ""}
                    onChange={(e) => {
                      const d = e.target.value ? new Date(e.target.value) : null;
                      setDraft((dr) => ({ ...dr, startDate: d ? d.toISOString() : null }));
                    }}
                    InputLabelProps={{ shrink: true }}
                    sx={{ "& .MuiOutlinedInput-root": { fontSize: 13 } }}
                  />
                </Box>
                <Box>
                  <Typography sx={SECTION_LABEL_SX}>Planned</Typography>
                  <TextField
                    type="number"
                    size="small"
                    fullWidth
                    value={draft.durationDays > 0 ? draft.durationDays : ""}
                    onChange={(e) => setDraft((dr) => ({ ...dr, durationDays: Math.max(0, Number(e.target.value)) }))}
                    placeholder="—"
                    inputProps={{ min: 0 }}
                    sx={{ "& .MuiOutlinedInput-root": { fontSize: 13 } }}
                  />
                </Box>
              </Box>
            )}

            {/* Park the task in the backlog — clears its dates */}
            {!isCategory && onMoveToBacklog && (
              <Box>
                <Button
                  size="small"
                  startIcon={<MoveToInboxIcon sx={{ fontSize: 15 }} />}
                  onClick={onMoveToBacklog}
                  sx={{ textTransform: "none", fontSize: 12, color: "text.secondary", px: 1 }}
                >
                  Move to backlog
                </Button>
              </Box>
            )}

            {/* Completion date (only if planned) */}
            {!isCategory && draftIsPlanned && endDate && (
              <Typography sx={{ fontSize: 12, color: "text.disabled", display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                Completion: {fmtDate(endDate)}
                {ahead && row.originalEndDate && (
                  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: 11, fontWeight: 500, color: "#3A8B5E", bgcolor: "rgba(130,194,160,0.1)", border: "1px solid rgba(130,194,160,0.3)", px: 1, py: 0.25, borderRadius: 999 }}>
                    finished {daysBetween(endDate, row.originalEndDate)} {daysBetween(endDate, row.originalEndDate) === 1 ? "day" : "days"} early (was {fmtDate(row.originalEndDate)})
                  </Box>
                )}
                {extended && row.originalEndDate && (
                  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: 11, fontWeight: 500, color: "#B45309", bgcolor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", px: 1, py: 0.25, borderRadius: 999 }}>
                    extended from {fmtDate(row.originalEndDate)} (+{extensionDays(row.originalEndDate, endDate)} {extensionDays(row.originalEndDate, endDate) === 1 ? "day" : "days"})
                  </Box>
                )}
                {shifted && row.originalEndDate && (
                  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: 11, fontWeight: 500, color: "#4A5BB0", bgcolor: "rgba(124,149,224,0.1)", border: "1px solid rgba(124,149,224,0.3)", px: 1, py: 0.25, borderRadius: 999 }}>
                    shifted from {fmtDate(row.originalEndDate)} (+{extensionDays(row.originalEndDate, endDate)} {extensionDays(row.originalEndDate, endDate) === 1 ? "day" : "days"})
                  </Box>
                )}
              </Typography>
            )}

            {/* Progress slider (only if planned) */}
            {!isCategory && draftIsPlanned && (
              <Box>
                <Typography sx={SECTION_LABEL_SX}>Progress: {draft.progress}%</Typography>
                <Slider
                  value={draft.progress}
                  onChange={(_, v) => setDraft((dr) => ({ ...dr, progress: v as number }))}
                  min={0}
                  max={100}
                  step={5}
                  marks={[{ value: 0, label: "0%" }, { value: 50, label: "50%" }, { value: 100, label: "100%" }]}
                  size="small"
                />
              </Box>
            )}

            {/* Status + Priority (2-column dropdowns, not for categories) */}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
              <Box>
                <Typography sx={SECTION_LABEL_SX}>Status</Typography>
                <TextField
                  select
                  size="small"
                  fullWidth
                  value={draft.status}
                  onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                  sx={{ "& .MuiOutlinedInput-root": { fontSize: 13 } }}
                >
                  {STATUS_LIST.map((key) => {
                    const s = STATUSES[key];
                    return (
                      <MenuItem key={key} value={key} sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: 13 }}>
                        <StatusDot status={key} size={8} />
                        {s.label}
                      </MenuItem>
                    );
                  })}
                </TextField>
              </Box>
              {!isCategory && (
                <Box>
                  <Typography sx={SECTION_LABEL_SX}>Priority</Typography>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    value={isPriority(draft.priority) ? draft.priority : "medium"}
                    onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
                    sx={{ "& .MuiOutlinedInput-root": { fontSize: 13 } }}
                  >
                    {PRIORITY_LIST.map((key) => {
                      const p = PRIORITIES[key];
                      return (
                        <MenuItem key={key} value={key} sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: 13 }}>
                          <PriorityIcon priority={key} size={12} />
                          {p.label}
                        </MenuItem>
                      );
                    })}
                  </TextField>
                </Box>
              )}
            </Box>

            {/* Dependencies */}
            <Box>
              <Typography sx={SECTION_LABEL_SX}>Depends on</Typography>
              {(row.deps || []).length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
                  {row.deps.map((dep) => {
                    const depRow = rows.find((r) => r.id === dep.predecessorId);
                    return (
                      <Box
                        key={dep.predecessorId}
                        component="span"
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.5,
                          fontSize: 11,
                          fontWeight: 500,
                          pl: 0.5,
                          pr: 0.25,
                          py: 0.25,
                          borderRadius: 999,
                          bgcolor: "rgba(0,0,0,0.05)",
                          color: "text.secondary",
                        }}
                      >
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#2D6EEF", flexShrink: 0 }} />
                        <Typography sx={{ fontSize: 11, fontWeight: 500 }} noWrap>
                          {depRow ? depRow.name : "Unknown task"}
                        </Typography>
                        <IconButton size="small" onClick={() => onRemoveDependency(row.id, dep.predecessorId)} sx={{ p: 0.25, color: "text.disabled", "&:hover": { color: "error.main" } }} title="Remove dependency">
                          <CloseIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      </Box>
                    );
                  })}
                </Box>
              )}
              <Box sx={{ display: "flex", gap: 0.75 }}>
                <TextField
                  select
                  size="small"
                  fullWidth
                  value={depSelection}
                  onChange={(e) => setDepSelection(e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { fontSize: 13 } }}
                >
                  <MenuItem value="">No dependencies</MenuItem>
                  {depCandidates.map((r) => (
                    <MenuItem key={r.id} value={r.id} sx={{ fontSize: 13 }}>
                      {r.name}
                    </MenuItem>
                  ))}
                </TextField>
                <Button variant="outlined" size="small" onClick={handleAddDependency} disabled={!depSelection} sx={{ textTransform: "none", flexShrink: 0 }}>
                  Add
                </Button>
              </Box>
              {depError && (
                <Typography color="error" sx={{ mt: 0.5, fontSize: 12, bgcolor: "rgba(220,47,78,0.05)", border: "1px solid rgba(220,47,78,0.2)", borderRadius: 1, px: 1.5, py: 1 }}>
                  {depError}
                </Typography>
              )}
            </Box>

            {/* Children list */}
            {!row.isSubtask && (
              <Box>
                <Typography sx={SECTION_LABEL_SX}>
                  {isCategory ? "Tasks" : "Subtasks"}{subtasks.length > 0 ? ` (${subtasks.length})` : ""}
                </Typography>
                {subtasks.length > 0 ? (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                    {subtasks.map((st) => {
                      const member = memberForSubtask(st);
                      return (
                        <Box
                          key={st.id}
                          onClick={() => onSelectSubtask(st.id)}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                            px: 1,
                            py: 0.75,
                            borderRadius: 1,
                            cursor: "pointer",
                            bgcolor: "rgba(0,0,0,0.02)",
                            "&:hover": { bgcolor: "rgba(0,0,0,0.05)" },
                            transition: "background-color 0.15s",
                          }}
                        >
                          <StatusDot status={st.status} size={6} />
                          <Typography sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "text.primary", textDecoration: st.status === "completed" ? "line-through" : "none" }}>
                            {st.name}
                          </Typography>
                          <Typography sx={{ flexShrink: 0, fontSize: 11, color: "text.disabled" }}>
                            {st.durationDays > 0 ? `${st.durationDays}d` : "—"}
                          </Typography>
                          {member && (
                            <Avatar initials={userInitials(member.firstName, member.lastName)} color={member.avatarColor ?? "#4F5DFF"} size={18} title={userFullName(member.firstName, member.lastName, member.email)} />
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
                    No {isCategory ? "tasks" : "subtasks"} yet. Hover the row to add one.
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        )}

        {/* Comment bar */}
        <Box sx={{ px: 2, py: 1, borderTop: "1px solid", borderColor: "divider", position: "relative" }}>
          {filteredMembers.length > 0 && (
            <Box sx={{ position: "absolute", bottom: "100%", left: 2, right: 2, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 1, boxShadow: 4, zIndex: 10, mb: 0.5, maxHeight: 150, overflowY: "auto" }}>
              {filteredMembers.map((m) => (
                <Box key={m.id} component="button" onClick={() => insertMention(m)} sx={{ display: "flex", alignItems: "center", gap: 0.75, width: "100%", px: 1.5, py: 1, border: "none", background: "none", cursor: "pointer", textAlign: "left", "&:hover": { bgcolor: "rgba(0,0,0,0.04)" } }}>
                  <Avatar initials={userInitials(m.firstName, m.lastName)} color={m.avatarColor ?? "#4F5DFF"} size={20} />
                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.primary" }}>{m.firstName} {m.lastName}</Typography>
                    <Typography sx={{ fontSize: 10, color: "text.disabled" }}>{m.email}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
          {commentExpanded ? (
            <Box>
              <Box sx={{ display: "flex", gap: 0.75, alignItems: "flex-end" }}>
                <TextField
                  inputRef={commentInputRef}
                  multiline
                  minRows={2}
                  maxRows={4}
                  fullWidth
                  size="small"
                  value={commentBody}
                  onChange={handleCommentChange}
                  onBlur={() => { if (!commentBody.trim()) setCommentExpanded(false); }}
                  placeholder="Write a comment… use @ to tag someone"
                  sx={{ "& .MuiOutlinedInput-root": { fontSize: 13 } }}
                />
                <Button variant="contained" size="small" onClick={handlePostComment} disabled={posting || !commentBody.trim()} sx={{ textTransform: "none", flexShrink: 0 }}>
                  Post
                </Button>
              </Box>
              {commentError && (
                <Typography sx={{ mt: 0.75, fontSize: 12, color: "error.main" }}>{commentError}</Typography>
              )}
            </Box>
          ) : (
            <Box
              component="input"
              onFocus={() => setCommentExpanded(true)}
              placeholder="Write a comment…"
              sx={{
                width: "100%",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                px: 1.5,
                py: 0.75,
                fontSize: 13,
                color: "text.primary",
                bgcolor: "rgba(0,0,0,0.02)",
                outline: "none",
                cursor: "text",
                "&:focus": { borderColor: "primary.main", bgcolor: "background.paper" },
              }}
            />
          )}
        </Box>

        {/* Footer */}
        <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider", display: "flex", gap: 1 }}>
          <Button fullWidth variant="contained" onClick={handleSaveClick} sx={{ textTransform: "none" }}>
            Save
          </Button>
          <Button fullWidth variant="outlined" color="error" onClick={() => setDeleteConfirmOpen(true)} startIcon={<DeleteOutlineIcon fontSize="small" />} sx={{ textTransform: "none" }}>
            Delete
          </Button>
        </Box>
      </Box>

      {/* Delete confirmation */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 15, fontWeight: 600 }}>Delete this {isCategory ? "epic" : row.isSubtask ? "subtask" : "task"}?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ fontSize: 13 }}>
            {isCategory ? "This epic and all its tasks and subtasks will be permanently deleted." : "This task and all its subtasks will be permanently deleted."}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2.5 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => { setDeleteConfirmOpen(false); onDelete(row.id); }} sx={{ textTransform: "none" }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}