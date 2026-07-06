"use client";

import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import { fmtDate } from "@/lib/dateUtils";

export type ScheduleChangeData = {
  rowId: string;
  rowName: string;
  originalEndDate: Date;
  newEndDate: Date;
  extDays: number;
  isDelay: boolean;
  patch: { startDate?: string; durationDays?: number };
};

export default function ScheduleChangeDialog({
  data,
  onConfirm,
  onCancel,
}: {
  data: ScheduleChangeData | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (data) setReason("");
  }, [data]);

  if (!data) return null;

  const trimmed = reason.trim();
  const canConfirm = trimmed.length > 0;

  return (
    <Box
      onClick={onCancel}
      sx={{
        position: "fixed",
        inset: 0,
        bgcolor: "rgba(0,0,0,0.4)",
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
      }}
    >
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          bgcolor: "background.paper",
          borderRadius: 2,
          boxShadow: 24,
          width: "100%",
          maxWidth: 420,
          p: 2.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 2 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              bgcolor: data.isDelay ? "rgba(245,158,11,0.1)" : "rgba(79,93,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Typography
              sx={{
                color: data.isDelay ? "#F59E0B" : "primary.main",
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              {data.isDelay ? "!" : "↻"}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ fontSize: 14.5 }}>
              {data.isDelay ? "Task deadline is shifting" : "Task schedule changed"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: 12.5 }}>
              “{data.rowName}” — new completion date {fmtDate(data.newEndDate)} instead of{" "}
              {fmtDate(data.originalEndDate)}
              {data.isDelay
                ? `. That’s a delay of ${data.extDays} ${data.extDays === 1 ? "day" : "days"} relative to the original plan.`
                : "."}
            </Typography>
          </Box>
        </Box>

        {data.isDelay && (
          <Alert severity="warning" sx={{ mb: 2, fontSize: 12.5 }}>
            This change will be recorded in the task history with your reason.
          </Alert>
        )}

        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
            Reason for schedule change *
          </Typography>
          <TextField
            multiline
            minRows={3}
            fullWidth
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why the task dates are changing…"
            error={reason.length > 0 && trimmed.length === 0}
            helperText={reason.length > 0 && trimmed.length === 0 ? "Reason cannot be empty." : " "}
          />
        </Box>

        <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
          <Button fullWidth variant="outlined" onClick={onCancel} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            fullWidth
            variant="contained"
            onClick={() => onConfirm(trimmed)}
            disabled={!canConfirm}
            sx={{
              textTransform: "none",
              ...(data.isDelay
                ? { bgcolor: "#F59E0B", "&:hover": { bgcolor: "#D97706" } }
                : {}),
            }}
          >
            Confirm change
          </Button>
        </Box>
      </Box>
    </Box>
  );
}