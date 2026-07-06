"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import AppHeader from "../../AppHeader";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });

    setSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Something went wrong." }));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    const body = await response.json();
    router.push(`/projects/${body.id}/invite`);
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppHeader />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
          pt: 8,
        }}
      >
        <Card
          sx={{
            width: 420,
            boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
            border: "1px solid rgba(45,110,239,0.10)",
          }}
        >
          <CardContent sx={{ p: 5 }}>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              New project
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              Name is required.
            </Typography>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <TextField
                label="Project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
              <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
                Create project
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
