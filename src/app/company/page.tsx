"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import AppHeader from "../AppHeader";

export default function CompanyManagementPage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/company")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load company.");
        return res.json();
      })
      .then((body) => {
        setName(body.name ?? "");
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const response = await fetch("/api/company", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });

    setSaving(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Something went wrong." }));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    setSuccess(true);
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppHeader />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", p: 2, pt: 8 }}>
        <Card sx={{ width: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.08)", border: "1px solid rgba(45,110,239,0.10)" }}>
          <CardContent sx={{ p: 5 }}>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              Company management
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              Update your company name.
            </Typography>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <TextField
                label="Company name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
              />
              {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
              {success && <Alert severity="success" sx={{ borderRadius: 2 }}>Company updated.</Alert>}
              <Button type="submit" variant="contained" size="large" disabled={saving || loading} fullWidth>
                Save changes
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
