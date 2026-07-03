# Foundation: Auth & Onboarding — Design

**Project:** flowline (Gantt chart SaaS)
**Phase:** 1 of 3 — Foundation (auth + onboarding). Followed by Phase 2 (Teams & Projects) and Phase 3 (Gantt/Roadmap core).
**Date:** 2026-07-03

## Scope

This phase delivers: user registration, login/logout, session handling, and a mandatory onboarding step that collects personal and company details before a user can reach their workspace. It does **not** include teams/workspaces beyond a single `Company` record, project management, or the Gantt chart itself — those are later phases.

## Architecture & Stack

- **Next.js 14 (App Router) + TypeScript** — single full-stack codebase, no separate API server.
- **Prisma ORM → Postgres**, schema-first, migrations tracked in git.
- **Auth.js (NextAuth) v5** with a Credentials provider (email + password) and the Prisma adapter. Database-backed sessions (not JWT-only) so sessions can be revoked server-side later (e.g. "log out everywhere").
- **Docker** everywhere: a multi-stage `Dockerfile` (Next.js standalone output) and a `docker-compose.yml` with `app` + `postgres` services. The same compose setup is used for local dev and the external server deploy; only env vars differ.

### Known tradeoff: Auth.js now, managed auth later

Auth.js was chosen to move fast on the MVP without an external dependency. Migrating to a managed provider (e.g. Clerk) later is possible but not seamless: password hashes generally aren't portable across providers, so a future migration means either (a) running both systems in parallel and migrating each user on next login, or (b) a bulk export/import with a forced password reset for all users. This is accepted as a future cost, not solved here.

## Data Model

```
User
- id                 String   @id @default(cuid())
- email              String   @unique
- passwordHash       String
- firstName          String?
- lastName           String?
- department         String?
- position           String?
- onboardingComplete Boolean  @default(false)
- companyId          String?  (FK → Company)
- createdAt          DateTime
- updatedAt          DateTime

Company
- id         String   @id @default(cuid())
- name       String
- createdAt  DateTime

Session / Account / VerificationToken
- standard Auth.js Prisma-adapter tables (Session used for DB-backed sessions;
  VerificationToken exists because Auth.js requires it, but is unused in this
  phase since email verification and password reset are deferred)
```

Personal/company fields are nullable on `User` because they don't exist until onboarding is finished. `onboardingComplete` is the single source of truth for whether a user's profile is complete — no logic should infer completeness from the presence/absence of individual fields.

`Company` is a separate table (not a plain string field on `User`) so that phase 2's team/workspace concept can attach multiple users to the same company without a migration.

## Registration Flow

1. User submits the registration form (email, password, confirm password).
2. `POST /api/register` validates input with Zod (valid email format, password ≥ 8 chars), checks email uniqueness, hashes the password with bcrypt, and creates the `User` row (`onboardingComplete: false`).
3. User is signed in immediately — no email verification step in this phase.
4. Instead of redirecting straight into the app, the user sees an **"Account created successfully"** confirmation screen with a **Continue** button.

## Onboarding Flow

1. **Continue** (from the registration success screen, or via the onboarding gate below) → `/onboarding` page.
2. Form with two sections, all fields mandatory:
   - **Personal details**: first name, last name, department, position (free-text inputs; no fixed dropdown list for department/position in this phase).
   - **Company details**: company name.
3. **Finish** → `POST /api/onboarding` → Zod-validates all fields are present and non-empty → creates the `Company` row → updates the `User` row (`firstName`, `lastName`, `department`, `position`, `companyId`) → sets `onboardingComplete = true` → redirects to `/workspace` (the personal workspace — specified in a later phase).

### Onboarding gate

Any authenticated request to a protected route is checked against `onboardingComplete`. If `false`, the request is redirected to `/onboarding` regardless of which page was requested — so a user can never reach the workspace with an incomplete profile, including across separate login sessions (e.g. they closed the browser mid-onboarding and log back in later).

## Login / Logout

- **Login**: Auth.js Credentials provider looks up the user by email, verifies the password with `bcrypt.compare`, and creates a DB-backed session on success.
- **Logout**: Auth.js `signOut()` destroys the DB session.
- **Route protection**: Next.js middleware enforces two gates in order — (1) authenticated at all → else redirect to `/login`; (2) `onboardingComplete` → else redirect to `/onboarding`.

## Validation & Error Handling

- Zod schemas for register, login, and onboarding payloads.
- Duplicate email on register → clear field-level error ("an account with this email already exists").
- Invalid login → generic **"invalid email or password"** message for both unknown-email and wrong-password cases, to avoid leaking which emails are registered.
- Onboarding submit with missing/empty fields → field-level validation errors; submit is rejected until all fields are filled.
- No rate limiting on `/api/register` or `/api/login` in this phase — flagged as a known gap to close before real launch, not blocking for foundation.

## Explicitly deferred (not in this phase)

- Email verification on signup.
- Password reset ("forgot password").
- Rate limiting / brute-force protection on auth endpoints.
- Teams/workspaces beyond the single `Company` record (multi-user companies, roles, invites) — phase 2.
- The personal workspace itself (`/workspace` destination) — specified separately.

## Deployment (Docker)

- `docker-compose.yml`: `app` (Next.js, built via multi-stage Dockerfile) + `postgres` (named volume for persistence).
- `.env` holds `DATABASE_URL`, `AUTH_SECRET`, etc. — not committed; `.env.example` committed as a template.
- Prisma migrations run via `prisma migrate deploy` as a startup step before the app container serves traffic.

## Testing

- **Vitest** for:
  - Password hashing and Zod validation rules.
  - `/api/register`: success, duplicate email, invalid input.
  - Login logic: correct password, wrong password, unknown email.
  - `/api/onboarding`: rejects missing/empty fields; on valid input creates `Company`, updates `User`, sets `onboardingComplete = true`.
  - Middleware: unauthenticated → `/login`; authenticated + incomplete onboarding → `/onboarding`; authenticated + complete → allowed through.
- Tests run against a dedicated `postgres-test` Docker service for realism with Prisma.
