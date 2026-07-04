# MUI Design System Integration — Design

**Project:** flowline (Gantt chart SaaS)
**Scope:** Restyle the existing foundation-phase pages (login, register, register success, onboarding, workspace placeholder) using MUI (@mui/material) with a custom theme derived from a reference screenshot set. This is a presentation-layer change only — no new business logic, API routes, or data model changes.
**Date:** 2026-07-04

Reference: two screenshots of an unrelated media-monitoring tool, provided for visual language only (palette, shapes, spacing) — not for its domain features (search/filter/reports), which are out of scope here.

## Scope

In scope: introducing MUI as the component library, a shared theme, and rebuilding the five existing pages with real MUI components (TextField, Button, Card, Alert, etc.) in place of raw HTML elements.

Out of scope (explicitly deferred):
- The sidebar/dashboard nav shell seen in the reference (Drawer + icon nav). `/workspace` stays a simple centered placeholder card — there's nothing to navigate to yet. The nav shell is built when a later phase gives the workspace real content.
- Dark mode (reference is light-only; not requested).
- Any change to routes, API contracts, validation rules, or auth behavior. All existing business logic (email normalization, corporate-email check, CSRF origin check, session handling) is untouched — only the JSX/markup changes.

## Theme

Centralized in a single `src/theme.ts`, built with MUI's `createTheme`. One source of truth — no per-page `sx` overrides duplicating colors or radii.

- **Palette:** primary = teal `#0F9D8C` (hover/darker shade auto-derived by MUI), primary-tinted background `#DFF5F2` (used for icon badges and secondary buttons), page background `#F4F5F7`, surface `#FFFFFF`, text primary `#1A1A1A`, text secondary `#8A8F98`, error `#C43E3E` (for the corporate-email validation message).
- **Shape:** global `shape.borderRadius: 16` for the base scale (cards), with per-component overrides: `MuiButton` → pill (`borderRadius: 999`), `MuiTextField`/`MuiOutlinedInput` → `10px`, `MuiCard`/`MuiPaper` → `20px`.
- **Typography:** system font stack (no custom webfont in the reference), bold (700) page headings, semi-bold (600) section labels in small-caps/uppercase style, regular body text.

## Architecture

- `@mui/material` + `@emotion/react` + `@emotion/styled` (MUI v5's required peer deps — pinning to MUI v5.x explicitly rather than letting npm resolve latest, after the versioning surprises from the earlier phase).
- `@mui/material-nextjs` for the official Next.js App Router SSR integration (`AppRouterCacheProvider`), avoiding hand-rolled Emotion cache wiring.
- `src/theme.ts` exports the theme object; `src/app/providers.tsx` (already exists for `SessionProvider`) is extended to also wrap children in `AppRouterCacheProvider` → MUI `ThemeProvider` → `CssBaseline` → existing `SessionProvider`.
- `@mui/icons-material` for the small icon set needed (checkmark on the success screen, a placeholder icon on the workspace card) — minimal usage, not a full icon system.

## Page-by-page

- **`/login`, `/register`:** centered `Card` (20px radius) on the page-background color, `TextField` for email/password (outlined variant, 10px radius), `Button` (pill, teal, full-width). Register's live corporate-email check keeps its exact behavior (checks on every keystroke once `@` is present) — the error now renders as MUI's `TextField` error state + `helperText`, and the button uses MUI's `disabled` prop instead of a raw HTML attribute.
- **`/register/success`:** centered `Card` with a teal-tinted circular icon badge (checkmark), heading, body text, and a pill `Button` linking to `/onboarding`.
- **`/onboarding`:** same centered `Card`, fields stacked vertically (unchanged from the earlier approved layout) using MUI `TextField`. **Placeholder text changes from example values (e.g. "Ada", "Lovelace") to generic field-name placeholders ("First name", "Last name", "Department", "Position", "Company name")** — this reverses the placeholder decision from the 2026-07-03 foundation spec, per explicit feedback during this design pass.
- **`/workspace`:** stays a simple centered placeholder `Card` with the "coming in a later phase" copy and a `Button` (outlined, teal) for logout — no sidebar/dashboard shell.

## Testing

Presentation-only change: the existing Vitest suite (password/validation/CSRF/register/onboarding/middleware/health — 42 tests) covers logic and API routes, none of which change here, so it's expected to keep passing unmodified. No new automated tests are planned for this phase — matching the precedent set for the original UI pages (Task 11 of the foundation plan), which were verified manually in the browser rather than with component tests. Manual browser verification of all five restyled pages (including the corporate-email error state and the onboarding empty-submit validation state) is required before this is considered complete.
