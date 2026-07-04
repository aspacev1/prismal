"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { isCorporateEmail } from "@/lib/validation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleEmailChange(value: string) {
    setEmail(value);
    if (value.includes("@") && !isCorporateEmail(value)) {
      setEmailError("please use only corporate email");
    } else {
      setEmailError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (emailError) return;

    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Something went wrong." }));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    // Registration only creates the account — sign in immediately so the
    // session exists before the onboarding gate is reached.
    await signIn("credentials", { email, password, redirect: false });

    router.push("/register/success");
  }

  return (
    <main>
      <h1>Create your account</h1>
      <p>Start building your roadmaps.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
          required
        />
        {emailError && <p role="alert">{emailError}</p>}
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting || Boolean(emailError)}>
          Create account
        </button>
      </form>
      <p>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
