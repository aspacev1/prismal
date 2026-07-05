"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";

export default function AcceptInviteButton({ token, projectId }: { token: string; projectId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleAccept() {
    setSubmitting(true);
    await fetch(`/api/invite/${token}/accept`, { method: "POST" });
    router.push(`/projects/${projectId}`);
  }

  return (
    <Button variant="contained" size="large" onClick={handleAccept} disabled={submitting}>
      Accept &amp; continue
    </Button>
  );
}
