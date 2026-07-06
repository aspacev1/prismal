"use client";

import { useState, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import DeleteOutlineIcon from "@mui/icons-material/Delete";
import { Avatar } from "./shared";
import type { HistoryEntry, CommentEntry, MemberOption, FeedEntry, FeedFilter } from "./types";

export default function PulseTab({
  taskId,
  projectId,
  members,
  refreshKey,
  onCommentDeleted,
}: {
  taskId: string;
  projectId: string;
  members: MemberOption[];
  refreshKey: number;
  onCommentDeleted: () => void;
}) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedFilter>("all");

  // Load history + comments in parallel
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/projects/${projectId}/tasks/${taskId}/history`, { credentials: "same-origin" })
        .then((r) => r.json())
        .then((d) => d.history ?? [])
        .catch(() => []),
      fetch(`/api/projects/${projectId}/tasks/${taskId}/comments`, { credentials: "same-origin" })
        .then((r) => r.json())
        .then((d) => d.comments ?? [])
        .catch(() => []),
    ]).then(([h, c]) => {
      if (!cancelled) {
        setHistory(h);
        setComments(c);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [taskId, projectId, refreshKey]);

  // Merge into unified feed, sorted by timestamp descending
  const feed: FeedEntry[] = useMemo(() => {
    const entries: FeedEntry[] = [
      ...history.map((e) => ({ kind: "history" as const, entry: e, timestamp: e.changedAt })),
      ...comments.map((e) => ({ kind: "comment" as const, entry: e, timestamp: e.createdAt })),
    ];
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return entries;
  }, [history, comments]);

  // Apply filter
  const filteredFeed = useMemo(() => {
    if (filter === "comments") return feed.filter((e) => e.kind === "comment");
    if (filter === "schedule")
      return feed.filter(
        (e) => e.kind === "history" && (e.entry.field === "startDate" || e.entry.field === "durationDays")
      );
    return feed;
  }, [feed, filter]);

  async function handleDeleteComment(commentId: string) {
    const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/comments/${commentId}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onCommentDeleted();
    }
  }

  const filters: { value: FeedFilter; label: string }[] = [
    { value: "all", label: "All feed" },
    { value: "comments", label: "Comments" },
    { value: "schedule", label: "Schedule changes" },
  ];

  return (
    <Box sx={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* Filter pills */}
      <Box sx={{ display: "flex", gap: 0.75, px: 2.5, py: 1.5, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        {filters.map((f) => {
          const active = filter === f.value;
          return (
            <Box
              key={f.value}
              component="button"
              onClick={() => setFilter(f.value)}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                fontSize: 11,
                fontWeight: 500,
                px: 1,
                py: 0.5,
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                bgcolor: active ? "primary.main" : "rgba(0,0,0,0.05)",
                color: active ? "#fff" : "text.disabled",
                transition: "background-color 0.15s",
              }}
            >
              {f.label}
            </Box>
          );
        })}
      </Box>

      {/* Feed */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>
        {loading ? (
          <Typography variant="body2" color="text.disabled" sx={{ fontSize: 12, textAlign: "center", py: 4 }}>
            Loading activity…
          </Typography>
        ) : filteredFeed.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ fontSize: 12, textAlign: "center", py: 4 }}>
            {filter === "comments"
              ? "No comments yet."
              : filter === "schedule"
                ? "No schedule changes yet."
                : "No activity yet."}
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {filteredFeed.map((item) =>
              item.kind === "history" ? (
                <FeedHistoryItem key={`h-${item.entry.id}`} entry={item.entry} />
              ) : (
                <FeedCommentItem
                  key={`c-${item.entry.id}`}
                  entry={item.entry}
                  onDelete={() => handleDeleteComment(item.entry.id)}
                />
              )
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function FeedHistoryItem({ entry }: { entry: HistoryEntry }) {
  return (
    <Box sx={{ display: "flex", gap: 1.25 }}>
      <Avatar initials={entry.changedBy.initials} color={entry.changedBy.color} size={24} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" color="text.primary" sx={{ fontSize: 12.5 }}>
          <Box component="span" sx={{ fontWeight: 500 }}>{entry.changedBy.name}</Box> changed "{entry.fieldLabel}"
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.25, fontSize: 12 }}>
          <Box component="span" sx={{ textDecoration: "line-through" }}>{entry.oldLabel}</Box>
          {" → "}
          <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>{entry.newLabel}</Box>
        </Typography>
        {entry.reason && (
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mt: 0.5,
              fontSize: 11.5,
              color: "text.secondary",
              bgcolor: "rgba(0,0,0,0.04)",
              borderLeft: "2px solid",
              borderColor: "primary.main",
              px: 1,
              py: 0.5,
              borderRadius: 0.5,
            }}
          >
            <Box component="span" sx={{ fontWeight: 600, color: "primary.main" }}>Reason:</Box> {entry.reason}
          </Typography>
        )}
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.25, fontSize: 11 }}>
          {new Date(entry.changedAt).toLocaleString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </Typography>
      </Box>
    </Box>
  );
}

function FeedCommentItem({ entry, onDelete }: { entry: CommentEntry; onDelete: () => void }) {
  return (
    <Box sx={{ display: "flex", gap: 1.25 }}>
      <Avatar initials={entry.author.initials} color={entry.author.color} size={24} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 0.5 }}>
          <Typography variant="body2" sx={{ fontSize: 12.5, fontWeight: 500 }}>
            {entry.author.name} commented
          </Typography>
          {entry.isAuthor && (
            <IconButton
              size="small"
              onClick={onDelete}
              sx={{ color: "text.disabled", "&:hover": { color: "error.main" }, p: 0.25 }}
              title="Delete comment"
            >
              <DeleteOutlineIcon sx={{ fontSize: 13 }} />
            </IconButton>
          )}
        </Box>
        <CommentBody body={entry.body} mentions={entry.mentions} />
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.25, fontSize: 11 }}>
          {new Date(entry.createdAt).toLocaleString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </Typography>
      </Box>
    </Box>
  );
}

function CommentBody({ body, mentions }: { body: string; mentions: { id: string; name: string; initials: string; color: string }[] }) {
  const mentionNames = mentions.map((m) => m.name);
  if (mentionNames.length === 0) {
    return <Typography sx={{ fontSize: 12.5, color: "text.primary", mt: 0.25, lineHeight: 1.5 }}>{body}</Typography>;
  }
  const escaped = mentionNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`@(${escaped.join("|")})`, "g");
  const parts: (string | { name: string })[] = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) parts.push(body.slice(lastIndex, match.index));
    parts.push({ name: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));

  return (
    <Box sx={{ mt: 0.25, fontSize: 12.5, color: "text.primary", lineHeight: 1.5 }}>
      {parts.map((part, i) => {
        if (typeof part === "string") return <span key={i}>{part}</span>;
        const mention = mentions.find((m) => m.name === part.name);
        return (
          <Box
            key={i}
            component="span"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.25,
              fontSize: 11,
              fontWeight: 600,
              px: 0.5,
              py: 0.15,
              borderRadius: 999,
              bgcolor: mention ? `${mention.color}1F` : "rgba(0,0,0,0.05)",
              color: mention?.color ?? "text.secondary",
              mx: 0.25,
            }}
          >
            @{part.name}
          </Box>
        );
      })}
    </Box>
  );
}