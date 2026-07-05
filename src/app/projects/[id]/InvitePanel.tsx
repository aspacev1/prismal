"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SendIcon from "@mui/icons-material/Send";
import CheckIcon from "@mui/icons-material/Check";

export default function InvitePanel({ projectId }: { projectId: string }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emails, setEmails] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/invite-link`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Couldn't load the invite link.");
        return res.json();
      })
      .then((body) => setInviteUrl(body.url))
      .catch(() => setError("Couldn't load the invite link. Try refreshing the page."));
  }, [projectId]);

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setSendResult(null);

    const emailList = emails
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const response = await fetch(`/api/projects/${projectId}/invite-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: emailList }),
    });

    setSending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Something went wrong." }));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    const body = await response.json();
    setEmails("");
    if (body.failed && body.failed.length > 0) {
      setSendResult(`Sent, but failed for: ${body.failed.join(", ")}`);
    } else {
      setSendResult("Invites sent.");
    }
  }

  return (
    <Card
      sx={{
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        border: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Typography variant="overline" color="primary.main" sx={{ mb: 2, display: "block" }}>
          Invite teammates
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Shareable link
        </Typography>
        <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
          <TextField
            value={inviteUrl ?? "Loading..."}
            InputProps={{ readOnly: true }}
            size="small"
            fullWidth
          />
          <Button
            variant="outlined"
            onClick={handleCopy}
            disabled={!inviteUrl}
            startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
            sx={{ flexShrink: 0 }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Or invite by email
        </Typography>
        <Box component="form" onSubmit={handleSend} sx={{ display: "flex", gap: 1 }}>
          <TextField
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="name@company.com, another@company.com"
            size="small"
            fullWidth
          />
          <Button
            type="submit"
            variant="contained"
            disabled={sending || !emails.trim()}
            startIcon={<SendIcon />}
            sx={{ flexShrink: 0 }}
          >
            Send
          </Button>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}
        {sendResult && (
          <Alert severity="success" sx={{ mt: 2, borderRadius: 2 }}>
            {sendResult}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
