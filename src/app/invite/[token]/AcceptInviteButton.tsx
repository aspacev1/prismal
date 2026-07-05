"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

export default function AcceptInviteButton({ token, projectId }: { token: string; projectId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setSubmitting(true);
    setError(null);

    const response = await fetch(`/api/invite/${token}/accept`, { method: "POST" });

    if (!response.ok) {
      setSubmitting(false);
      setError(
        response.status === 401
          ? "Your session expired. Please log in again."
          : "This invite link isn't valid anymore."
      );
      return;
    }

    router.push(`/projects/${projectId}`);
  }

  return (
    <Box>
      <Button variant="contained" size="large" onClick={handleAccept} disabled={submitting}>
        Accept &amp; continue
      </Button>
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
