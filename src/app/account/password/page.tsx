"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import AppHeader from "../../AppHeader";

export default function ChangePasswordPage() {
  const { data: session } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSubmitting(true);
    const response = await fetch("/api/account/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    setSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Something went wrong." }));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  const userName = session?.user?.firstName
    ? `${session.user.firstName} ${session.user.lastName ?? ""}`.trim()
    : session?.user?.email ?? "User";

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppHeader />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", p: 2, pt: 8 }}>
        <Card sx={{ width: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.08)", border: "1px solid rgba(45,110,239,0.10)" }}>
          <CardContent sx={{ p: 5 }}>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              Change password
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              Update the password for {userName}.
            </Typography>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <TextField
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <TextField
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <TextField
                label="Confirm new password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
              {success && <Alert severity="success" sx={{ borderRadius: 2 }}>Password updated successfully.</Alert>}
              <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
                Update password
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
