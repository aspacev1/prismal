"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import { signIn } from "next-auth/react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import MuiLink from "@mui/material/Link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn("credentials", { email, password, redirect: false });

    setSubmitting(false);

    if (!result || result.error) {
      setError("Invalid email or password.");
      return;
    }

    router.push("/workspace");
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #F0F9F7 0%, #F8F9FB 50%, #F0F4FF 100%)",
        p: 2,
      }}
    >
      <Card
        sx={{
          width: 380,
          boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
          border: "1px solid rgba(45,110,239,0.10)",
        }}
      >
        <CardContent sx={{ p: 5 }}>
          <Typography
            variant="h4"
            sx={{
              background: "linear-gradient(135deg, #3D7EFF 0%, #1CC8E0 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              mb: 0.5,
            }}
          >
            flowline
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Welcome back. Sign in to continue.
          </Typography>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            <TextField
              label="Email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <TextField
              label="Password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
              Log in
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 3 }}>
            New here?{" "}
            <MuiLink component={NextLink} href="/register" fontWeight={600} color="primary.main">
              Create an account
            </MuiLink>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
