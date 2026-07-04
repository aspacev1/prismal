"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";

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

export default function OnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  function setField(name: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });

    setSubmitting(false);

    if (!response.ok) {
      const nextErrors: Partial<Record<keyof FormState, string>> = {};
      (Object.keys(form) as (keyof FormState)[]).forEach((key) => {
        if (!form[key].trim()) nextErrors[key] = "This field is required.";
      });
      setErrors(nextErrors);
      return;
    }

    const body = await response.json();
    await update({ onboardingComplete: true, companyId: body.companyId });
    router.push("/workspace");
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Card sx={{ width: 360 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" component="h1" gutterBottom>
            Set up your profile
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            All fields are required.
          </Typography>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
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

            <Typography variant="overline" color="primary.main">
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

            <Button type="submit" variant="contained" size="large" disabled={submitting}>
              Finish
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
