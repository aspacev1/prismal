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
- **Docker** everywhere: a multi-stage `Dockerfile` (Next.js standalone output) and Compose files for both local dev and the external server deploy — see [Deployment](#deployment-docker) for why these are two files, not one.
- **Reverse proxy: Caddy**, for automatic TLS on the external server. Terminates HTTPS and forwards to the `app` container over the Docker network.

### Middleware runs on the Node.js runtime, not Edge

Next.js middleware defaults to the Edge runtime, which Prisma's Postgres driver doesn't support. Since our route protection (session check + onboarding gate) needs a DB-backed lookup, middleware is explicitly pinned to the Node.js runtime (`export const config = { runtime: 'nodejs', matcher: [...] }`). To avoid a *second* DB round-trip just for the onboarding flag, the Auth.js `session` callback attaches `onboardingComplete` (and `companyId`) onto `session.user` from the adapter-fetched `User` row — so the single session lookup middleware already has to do answers both "is this user authenticated" and "have they finished onboarding."

### Known tradeoff: Auth.js now, managed auth later

Auth.js was chosen to move fast on the MVP without an external dependency. Migrating to a managed provider (e.g. Clerk) later is possible but not seamless: password hashes generally aren't portable across providers, so a future migration means either (a) running both systems in parallel and migrating each user on next login, or (b) a bulk export/import with a forced password reset for all users. This is accepted as a future cost, not solved here.

## Data Model

```
User
- id                 String   @id @default(cuid())
- email              String   @unique   // stored lowercased+trimmed, see below
- passwordHash       String
- firstName          String?
- lastName           String?
- department         String?
- position           String?
- onboardingComplete Boolean  @default(false)
- companyId          String?  (FK → Company)  @@index([companyId])
- createdAt          DateTime
- updatedAt          DateTime

Company
- id         String   @id @default(cuid())
- name       String
- createdAt  DateTime
- @@index([name])   // supports the case-insensitive lookup on onboarding

Session / Account / VerificationToken
- standard Auth.js Prisma-adapter tables (Session used for DB-backed sessions;
  VerificationToken exists because Auth.js requires it, but is unused in this
  phase since email verification and password reset are deferred)
```

Personal/company fields are nullable on `User` because they don't exist until onboarding is finished. `onboardingComplete` is the single source of truth for whether a user's profile is complete — no logic should infer completeness from the presence/absence of individual fields.

**Email normalization:** `email` is lowercased and trimmed before every write and lookup (register, login, uniqueness check). Postgres's unique constraint is case-sensitive by default, so without this, `User@x.com` and `user@x.com` would be treated as different accounts and silently bypass the "email already exists" check.

`Company` is a separate table (not a plain string field on `User`) so that phase 2's team/workspace concept can attach multiple users to the same company without a migration. To make that actually work in this phase (not just in theory), onboarding does a case-insensitive exact-match lookup on `Company.name` before creating one — see [Onboarding Flow](#onboarding-flow).

## Registration Flow

1. User submits the registration form (email, password).
2. `POST /api/register` validates input with Zod (valid email format, password ≥ 8 chars), normalizes the email (lowercase + trim), checks uniqueness against the normalized value, hashes the password with bcrypt (cost factor 12), and creates the `User` row (`onboardingComplete: false`).
3. User is signed in immediately — no email verification step in this phase.
4. Instead of redirecting straight into the app, the user sees an **"Account created successfully"** confirmation screen with a **Continue** button.

## Onboarding Flow

1. **Continue** (from the registration success screen, or via the onboarding gate below) → `/onboarding` page.
2. Form with two sections, all fields mandatory, laid out as a single vertical column (one field per row, not a multi-column grid) with a placeholder example in every input:
   - **Personal details**: first name (e.g. "Ada"), last name (e.g. "Lovelace"), department (e.g. "Engineering"), position (e.g. "Product manager") — free-text inputs, no fixed dropdown list in this phase.
   - **Company details**: company name (e.g. "Acme inc").
3. **Finish** → `POST /api/onboarding` → Zod-validates all fields are present and non-empty → looks up `Company` by case-insensitive exact match on the submitted name:
   - **Match found** → reuse that `Company`'s id (the user joins it).
   - **No match** → create a new `Company` row.
   → updates the `User` row (`firstName`, `lastName`, `department`, `position`, `companyId`) → sets `onboardingComplete = true` → redirects to `/workspace` (the personal workspace — specified in a later phase).

**Known simplification, flagged for phase 2:** joining an existing company only requires typing its exact name — there's no invite, approval, or ownership check. This is acceptable for phase 1 because no permissions or shared data hang off `Company` yet (it's just a label), but phase 2 (Teams & Projects) must replace this with a real invite/approval flow before `Company` membership grants access to anything.

### Onboarding gate

Any authenticated request to a protected route is checked against `onboardingComplete`. If `false`, the request is redirected to `/onboarding` regardless of which page was requested — so a user can never reach the workspace with an incomplete profile, including across separate login sessions (e.g. they closed the browser mid-onboarding and log back in later).

## Login / Logout

- **Login**: Auth.js Credentials provider normalizes the submitted email (lowercase + trim), looks up the user, verifies the password with `bcrypt.compare`, and creates a DB-backed session on success.
- **Logout**: Auth.js `signOut()` destroys the DB session.
- **Route protection**: Node.js-runtime middleware (see Architecture) enforces two gates in order, using `onboardingComplete` from the enriched session — no extra query: (1) authenticated at all → else redirect to `/login`; (2) `onboardingComplete` → else redirect to `/onboarding`.

## Validation & Error Handling

- Zod schemas for register, login, and onboarding payloads.
- Duplicate email on register → clear field-level error ("an account with this email already exists").
- Invalid login → generic **"invalid email or password"** message for both unknown-email and wrong-password cases, to avoid leaking which emails are registered.
- Onboarding submit with missing/empty fields → field-level validation errors; submit is rejected until all fields are filled.
- No rate limiting on `/api/register` or `/api/login` in this phase — flagged as a known gap to close before real launch, not blocking for foundation.
- **CSRF**: Auth.js's own sign-in/sign-out routes are protected out of the box, but `/api/register` and `/api/onboarding` are plain custom routes outside that protection. They're mitigated by (a) `SameSite=Lax` session cookies (Auth.js default) and (b) an explicit origin check — reject the request if the `Origin` header doesn't match the app's own origin.
- **Secrets**: `AUTH_SECRET` is generated once via `openssl rand -base64 32` and stored only in `.env` (never committed). Rotation is manual and deferred — not needed until multi-instance/zero-downtime deploys matter.

## Explicitly deferred (not in this phase)

- Email verification on signup.
- Password reset ("forgot password").
- Rate limiting / brute-force protection on auth endpoints.
- Teams/workspaces beyond the single `Company` record (multi-user companies, roles, invites) — phase 2. This includes replacing the exact-name-match auto-join in onboarding with a real invite/approval flow before `Company` membership carries any actual access.
- The personal workspace itself (`/workspace` destination) — specified separately.
- Postgres backup automation (a manual `pg_dump` procedure is documented, not scheduled) and `AUTH_SECRET` rotation.

## Deployment (Docker)

- **Two Compose files**, not one: `docker-compose.yml` (base — production-oriented, builds the app from the standalone Docker image, no source volumes) and `docker-compose.override.yml` (dev-only — mounts source for hot reload, applied automatically by Compose when present, not shipped to the server). Treating "one file, just swap env vars" as sufficient was wrong: dev needs live-reload volumes and a dev-mode Dockerfile target that have no business running in production.
- Services: `app` (Next.js), `postgres` (named volume for persistence), `caddy` (reverse proxy, automatic TLS, only in the production compose file).
- `.env` holds `DATABASE_URL`, `AUTH_SECRET`, etc. — not committed; `.env.example` committed as a template.
- **Startup ordering**: `app` runs `prisma migrate deploy` before starting the server; a Compose healthcheck on `app` (hitting a `/api/health` route) gates when `caddy` starts routing traffic to it, so a failed migration or slow boot never serves a broken instance.
- Postgres data is on a named volume with a documented manual `pg_dump` backup command; scheduled/automated backups are deferred (noted above).

## Testing

- **Vitest** for:
  - Password hashing and Zod validation rules.
  - `/api/register`: success, duplicate email (including differently-cased duplicate, e.g. `User@x.com` vs `user@x.com`), invalid input.
  - Login logic: correct password, wrong password, unknown email, differently-cased email matches the stored account.
  - `/api/onboarding`: rejects missing/empty fields; on valid input with a new company name creates a `Company` and updates `User`; on a name matching an existing `Company` (case-insensitive) reuses it instead of creating a duplicate; sets `onboardingComplete = true`.
  - `/api/register` and `/api/onboarding`: reject requests with a mismatched `Origin` header (CSRF check).
  - Middleware: unauthenticated → `/login`; authenticated + incomplete onboarding → `/onboarding`; authenticated + complete → allowed through.
- Tests run against a dedicated `postgres-test` Docker service for realism with Prisma.
