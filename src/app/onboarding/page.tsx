"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

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
    <main>
      <h1>Set up your profile</h1>
      <p>All fields are required.</p>
      <form onSubmit={handleSubmit}>
        <p>Personal details</p>

        <label htmlFor="firstName">First name</label>
        <input
          id="firstName"
          placeholder="Ada"
          value={form.firstName}
          onChange={(e) => setField("firstName", e.target.value)}
        />
        {errors.firstName && <p role="alert">{errors.firstName}</p>}

        <label htmlFor="lastName">Last name</label>
        <input
          id="lastName"
          placeholder="Lovelace"
          value={form.lastName}
          onChange={(e) => setField("lastName", e.target.value)}
        />
        {errors.lastName && <p role="alert">{errors.lastName}</p>}

        <label htmlFor="department">Department</label>
        <input
          id="department"
          placeholder="Engineering"
          value={form.department}
          onChange={(e) => setField("department", e.target.value)}
        />
        {errors.department && <p role="alert">{errors.department}</p>}

        <label htmlFor="position">Position</label>
        <input
          id="position"
          placeholder="Product manager"
          value={form.position}
          onChange={(e) => setField("position", e.target.value)}
        />
        {errors.position && <p role="alert">{errors.position}</p>}

        <p>Company details</p>

        <label htmlFor="companyName">Company name</label>
        <input
          id="companyName"
          placeholder="Acme inc"
          value={form.companyName}
          onChange={(e) => setField("companyName", e.target.value)}
        />
        {errors.companyName && <p role="alert">{errors.companyName}</p>}

        <button type="submit" disabled={submitting}>
          Finish
        </button>
      </form>
    </main>
  );
}
