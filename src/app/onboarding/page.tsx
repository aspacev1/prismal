"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

type FormState = {
  firstName: string;
  lastName: string;
  department: string;
  position: string;
  companyName: string;
};

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  department: "",
  position: "",
  companyName: "",
};

const FIELD_LABELS: Record<keyof FormState, string> = {
  firstName: "First name",
  lastName: "Last name",
  department: "Department",
  position: "Position",
  companyName: "Company name",
};

const PERSONAL_FIELDS: (keyof FormState)[] = ["firstName", "lastName", "department", "position"];

function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const inviteToken = tokenInvalid ? null : searchParams.get("inviteToken");
  const { update } = useSession();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(name: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setError(null);

    const payload: Record<string, string> = {
      firstName: form.firstName,
      lastName: form.lastName,
      department: form.department,
      position: form.position,
    };
    if (inviteToken) {
      payload.inviteToken = inviteToken;
    } else {
      payload.companyName = form.companyName;
    }

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!response.ok) {
      const requiredFields: (keyof FormState)[] = inviteToken
        ? PERSONAL_FIELDS
        : [...PERSONAL_FIELDS, "companyName"];
      const missingFields = requiredFields.filter((key) => !form[key].trim());
      if (missingFields.length > 0) {
        const nextErrors: Partial<Record<keyof FormState, string>> = {};
        missingFields.forEach((key) => {
          nextErrors[key] = "This field is required.";
        });
        setErrors(nextErrors);
      } else {
        const body = await response.json().catch(() => ({ error: "Something went wrong." }));
        setError(body.error ?? "Something went wrong.");
        if (body.invalidInviteToken) {
          setTokenInvalid(true);
        }
      }
      return;
    }

    const body = await response.json().catch(() => null);
    if (!body) {
      setError("Something went wrong. Please try again.");
      return;
    }
    await update({ onboardingComplete: true, companyId: body.companyId });
    router.push(body.projectId ? `/projects/${body.projectId}` : "/workspace");
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
          width: 400,
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
            All fields are required.
          </Typography>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            <Typography variant="overline" color="primary.main">
              Personal details
            </Typography>
            {PERSONAL_FIELDS.map((key) => (
              <TextField
                key={key}
                label={FIELD_LABELS[key]}
                placeholder={FIELD_LABELS[key]}
                value={form[key]}
                onChange={(e) => setField(key, e.target.value)}
                error={Boolean(errors[key])}
                helperText={errors[key] ?? " "}
              />
            ))}

            {!inviteToken && (
              <>
                <Typography variant="overline" color="primary.main" sx={{ mt: 1 }}>
                  Company details
                </Typography>
                <TextField
                  label={FIELD_LABELS.companyName}
                  placeholder={FIELD_LABELS.companyName}
                  value={form.companyName}
                  onChange={(e) => setField("companyName", e.target.value)}
                  error={Boolean(errors.companyName)}
                  helperText={errors.companyName ?? " "}
                />
              </>
            )}

            {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

            <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
              Finish
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingForm />
    </Suspense>
  );
}
