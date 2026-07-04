# MUI Design System Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle flowline's five existing pages (login, register, register success, onboarding, workspace placeholder) using MUI (@mui/material) with a single custom theme (teal palette, pill buttons, rounded cards/inputs), matching the approved mockups — no business-logic changes.

**Architecture:** One theme object (`src/theme.ts`) consumed via `ThemeProvider` + `CssBaseline`, wrapped in MUI's official Next.js App Router SSR cache provider. Each page keeps its existing state/fetch/validation logic untouched and only swaps raw HTML elements for MUI components.

**Tech Stack:** @mui/material v5, @emotion/react + @emotion/styled (MUI's styling engine), @mui/material-nextjs (App Router SSR integration), @mui/icons-material (two icons only).

---

Reference spec: [docs/superpowers/specs/2026-07-04-mui-design-system-design.md](../specs/2026-07-04-mui-design-system-design.md)

## File Structure

```
src/theme.ts                        - MUI theme (palette, shape, typography, component overrides)
src/app/providers.tsx                - modified: adds AppRouterCacheProvider + ThemeProvider + CssBaseline
src/app/login/page.tsx                - modified: MUI components
src/app/register/page.tsx             - modified: MUI components, same corporate-email logic
src/app/register/success/page.tsx     - modified: MUI components
src/app/onboarding/page.tsx           - modified: MUI components, generic field-name placeholders
src/app/workspace/page.tsx            - modified: MUI components
```

No test files change — this is a presentation-only pass. The existing 42 Vitest tests (password/validation/CSRF/register/onboarding/middleware/health) don't render these pages, so they must keep passing unmodified; that's the regression check for this whole plan.

---

### Task 1: Install MUI and create the theme

**Files:**
- Modify: `package.json`
- Create: `src/theme.ts`

- [ ] **Step 1: Install dependencies, pinned to MUI v5**

```bash
cd /Users/aspacev/flowline
npm install @mui/material@^5 @emotion/react@^11 @emotion/styled@^11 @mui/material-nextjs@^5 @mui/icons-material@^5
```

- [ ] **Step 2: Create the theme**

`src/theme.ts`:

```ts
import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    primary: {
      main: "#0F9D8C",
    },
    background: {
      default: "#F4F5F7",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1A1A1A",
      secondary: "#8A8F98",
    },
    error: {
      main: "#C43E3E",
    },
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      "Helvetica",
      "Arial",
      "sans-serif",
    ].join(","),
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 600 },
    overline: { fontWeight: 700, letterSpacing: "0.04em" },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
        fullWidth: true,
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 20,
        },
      },
    },
  },
});
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/theme.ts
git commit -m "Install MUI and add the shared theme"
```

---

### Task 2: Wire MUI providers

**Files:**
- Modify: `src/app/providers.tsx`

- [ ] **Step 1: Add the App Router cache provider, theme provider, and CssBaseline**

`src/app/providers.tsx`:

```tsx
"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { SessionProvider } from "next-auth/react";
import { theme } from "@/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SessionProvider>{children}</SessionProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
```

- [ ] **Step 2: Run the existing test suite to confirm no regression**

Run: `npm test`
Expected: `Test Files 8 passed (8)`, `Tests 42 passed (42)` — unchanged from before this plan

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Boot the dev server and confirm no runtime errors**

```bash
npm run dev
```

In another terminal: `curl -s http://localhost:3000/api/health` → expect `{"status":"ok"}`. Then stop the dev server (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add src/app/providers.tsx
git commit -m "Wire MUI theme provider and App Router cache provider"
```

---

### Task 3: Restyle /login

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Replace the page with MUI components**

`src/app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

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
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Card sx={{ width: 360 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" component="h1" gutterBottom>
            Log in
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Welcome back.
          </Typography>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={submitting}>
              Log in
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 3 }}>
            New here? <Link href="/register">Create an account</Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "Restyle /login with MUI"
```

---

### Task 4: Restyle /register

**Files:**
- Modify: `src/app/register/page.tsx`

- [ ] **Step 1: Replace the page with MUI components, keeping the exact corporate-email logic**

`src/app/register/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
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

    await signIn("credentials", { email, password, redirect: false });

    router.push("/register/success");
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
            Create your account
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Start building your roadmaps.
          </Typography>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              error={Boolean(emailError)}
              helperText={emailError ?? " "}
              required
            />
            <TextField
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={submitting || Boolean(emailError)}>
              Create account
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 3 }}>
            Already have an account? <Link href="/login">Log in</Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/register/page.tsx
git commit -m "Restyle /register with MUI, keep corporate-email validation"
```

---

### Task 5: Restyle /register/success

**Files:**
- Modify: `src/app/register/success/page.tsx`

- [ ] **Step 1: Replace the page with MUI components**

`src/app/register/success/page.tsx`:

```tsx
import Link from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CheckIcon from "@mui/icons-material/Check";

export default function RegisterSuccessPage() {
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
      <Card sx={{ width: 360, textAlign: "center" }}>
        <CardContent sx={{ p: 4 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              bgcolor: "#DFF5F2",
              color: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 2,
            }}
          >
            <CheckIcon />
          </Box>
          <Typography variant="h6" component="h1" gutterBottom>
            Account created
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Next, set up your profile and company.
          </Typography>
          <Button component={Link} href="/onboarding" variant="contained" size="large">
            Continue
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/register/success/page.tsx
git commit -m "Restyle /register/success with MUI"
```

---

### Task 6: Restyle /onboarding with generic field placeholders

**Files:**
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Replace the page with MUI components; placeholders show the field name, not an example value**

`src/app/onboarding/page.tsx`:

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "Restyle /onboarding with MUI and generic field placeholders"
```

---

### Task 7: Restyle /workspace

**Files:**
- Modify: `src/app/workspace/page.tsx`

- [ ] **Step 1: Replace the page with MUI components (still a simple placeholder, no sidebar shell)**

`src/app/workspace/page.tsx`:

```tsx
"use client";

import { signOut } from "next-auth/react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

export default function WorkspacePage() {
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
      <Card sx={{ width: 360, textAlign: "center" }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" component="h1" gutterBottom>
            Your workspace
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Personal workspace — coming in a later phase.
          </Typography>
          <Button variant="outlined" size="large" onClick={() => signOut({ callbackUrl: "/login" })}>
            Log out
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/workspace/page.tsx
git commit -m "Restyle /workspace with MUI"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: `Test Files 8 passed (8)`, `Tests 42 passed (42)` — unchanged, since this plan touched no logic/API/test files

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Rebuild the Docker dev image (new dependencies must be baked into the image, not just the host's node_modules)**

```bash
docker compose up app postgres --build -d
```

Expected: build succeeds; if the app container was already running with a stale anonymous `node_modules` volume from before this plan, force a clean recreate:

```bash
docker compose stop app
docker compose rm -f -v app
docker compose up app postgres -d
```

Then: `curl -s http://localhost:3000/api/health` → expect `{"status":"ok"}`.

- [ ] **Step 4: Verify the production image still builds**

```bash
docker compose -f docker-compose.yml build app
```

Expected: build succeeds through the `runner` stage (this also re-runs `npm run build`, which will catch any MUI/SSR issue that only shows up in a production build).

- [ ] **Step 5: Manual browser walkthrough of all five restyled pages**

Using the dev server (`npm run dev` or the Dockerized one from Step 3), in a browser:

1. `/login` — card layout, teal "Log in" button, "New here? Create an account" link.
2. `/register` — type a free-email address (e.g. `person@gmail.com`) → the email field shows MUI's error state (red outline) with helper text "please use only corporate email", and the "Create account" button is disabled. Switch to a corporate domain → error clears, button re-enables. Submit with a valid corporate email + 8+ char password.
3. `/register/success` — teal check-icon badge, "Continue" button.
4. `/onboarding` — fields stacked vertically, placeholders read "First name", "Last name", "Department", "Position", "Company name" (not example values). Submit empty → each field shows MUI's error state with "This field is required." Fill in and submit → redirected to `/workspace`.
5. `/workspace` — placeholder card, outlined "Log out" button. Click it → back to `/login`. Log back in → redirected straight to `/workspace` (onboarding already complete).

- [ ] **Step 6: Final commit if any stray changes remain**

```bash
git status
git add -A
git commit -m "Finish MUI design system integration"
```

(Skip this step if `git status` is already clean.)
