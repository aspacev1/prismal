# Phase 2, Slice 1: First Project + Invite Teammates — Design

**Project:** flowline (Gantt chart SaaS)
**Phase:** 2 of 3 — Teams & Projects. This is the first vertical slice: what a freshly onboarded user sees to create their first project and invite teammates. Broader team/project management (settings, roles, project switching, member-management pages, multiple teams per company) is deferred to later sub-projects within phase 2.
**Date:** 2026-07-05

Reference: [docs/superpowers/specs/2026-07-03-foundation-auth-onboarding-design.md](2026-07-03-foundation-auth-onboarding-design.md) (Phase 1 — auth, onboarding, `User`/`Company` model).

## Scope

In scope:
- Creating a project (name + description).
- `/workspace` becomes the project list (previously a placeholder).
- Inviting teammates to a specific project via one reusable link, shareable directly or sent by email (Resend).
- Accepting an invite: registering (with the company-name step skipped) or logging in, then joining the project.

Out of scope, explicitly deferred:
- A `Team` entity (a grouping between `Company` and `Project`). Considered and deliberately dropped for this slice — project access is governed entirely by project membership, not by any team or company relationship. Introduce `Team` later only when something concrete needs to group multiple projects.
- Per-project departments/roles for invited members (e.g. "join as Marketing" vs "join as FE"). Considered and dropped — adds a UI/data-model surface with no clear owner yet.
- Any owner/permission distinction within a project. For this slice, **any project member can generate/share the invite link or send email invites** — there's no "owner-only" action yet.
- The phase-1 "join a company by typing its exact name" auto-join simplification (documented in the foundation spec as a known gap). This slice doesn't touch it — it still only affects fresh, non-invited signups.
- Invite link expiry, revocation, or regeneration. The link is permanent once created.
- Broader project surfaces: editing/deleting a project, project settings, removing members, multiple invite links per project.

## Data model

```
Project
- id             String   @id @default(cuid())
- name           String
- description    String?
- createdById    String   (FK → User)
- companyId      String?  (FK → Company, copied from creator at creation time —
                            informational only, not used for access control)
- createdAt      DateTime

ProjectMember
- id             String   @id @default(cuid())
- projectId      String   (FK → Project)
- userId         String   (FK → User)
- createdAt      DateTime
- @@unique([projectId, userId])   — idempotent membership, a user can't join twice

ProjectInviteLink
- id             String   @id @default(cuid())
- projectId      String   (FK → Project) @@unique   — one link per project, created lazily
- token          String   @unique (random, unguessable — e.g. 32 bytes, url-safe base64)
- createdById    String   (FK → User)
- createdAt      DateTime
```

`ProjectInviteLink` is deliberately one row per project, not one row per invite action. "Copy link" and "send by email" both read/create this same row and send the same URL (`/invite/{token}`) — email invite is just "deliver this link to these addresses," not a separately tracked object. No expiry, no single-use consumption, no per-recipient tracking: whoever has the link can accept it, repeatedly, for as long as the project exists.

## Project creation & list

- `/workspace` is now the project list: a top bar ("flowline" + a "New project" button) and either an empty-state prompt ("Start your first project") or a list of project cards (name, description, member avatars) the current user belongs to (`ProjectMember` lookup).
- `/projects/new`: centered card (matching the auth-page pattern), fields `name` (required) and `description` (optional). On submit, `POST /api/projects` creates the `Project` (`createdById` = current user, `companyId` copied from `session.user.companyId`), creates the first `ProjectMember` row for the creator, and redirects to `/projects/{id}`.
- `/projects/{id}`: project name/description header, a **Members** section (avatar + name per member), and an **Invite teammates** section — a read-only text field showing the invite URL with a "Copy" button, plus a separate email input (comma-separated addresses) with a "Send" button.

## Invite flow

1. Opening the invite panel calls `GET /api/projects/{id}/invite-link`, which returns the existing `ProjectInviteLink` for that project or creates one on first request (get-or-create, no user-facing "generate" step).
2. **Copy link**: client-side only, copies the returned URL.
3. **Send by email**: `POST /api/projects/{id}/invite-email` with an array of email addresses → validates each is a plausible email (reuse the existing email format check, **not** the corporate-only check — teammates being invited to a specific project aren't going through registration yet at this point, and the corporate check still applies later when they actually register) → sends one email per address via Resend, each containing the invite link. No new database rows for "who was emailed" — the project's member list is the source of truth once someone actually accepts.
4. **`/invite/{token}` landing page**: looks up the `ProjectInviteLink` by token (404 page if not found — links never expire, so this only happens for a mistyped/garbage token). Shows "{inviter name} invited you to {project name}" with an "Accept & continue" button. Three cases:
   - **Not authenticated:** button links to `/register?inviteToken={token}`.
   - **Authenticated, `onboardingComplete: false`:** button links to `/onboarding?inviteToken={token}` (finishing onboarding is still required before joining anything).
   - **Authenticated, `onboardingComplete: true`:** button calls `POST /api/invite/{token}/accept` directly, which creates the `ProjectMember` row (no-op if already a member) and redirects to `/projects/{id}`.

## Threading the invite token through registration and onboarding

The token has to survive across three pages for a brand-new user:

`/invite/{token}` → `/register?inviteToken={token}` → (after registering + signing in) `/register/success?inviteToken={token}` → `/onboarding?inviteToken={token}`.

- **Register page:** unchanged behavior, just reads `inviteToken` from the query string and forwards it to the success-screen URL. Registration itself doesn't need to know about the token.
- **Onboarding page:** if `inviteToken` is present in the URL, the "Company details" section is hidden entirely — only personal details (first name, last name, department, position) are shown and required.
- **`POST /api/onboarding`:** accepts an optional `inviteToken` field. If present, it's validated server-side (never trust the client-supplied company-skip decision) by looking up the `ProjectInviteLink` → `Project` → `Project.createdById` → that user's `companyId`. The onboarding `User` update uses that `companyId` directly, skipping the existing case-insensitive company-name match-or-create logic entirely (the `companyName` field isn't required or read when `inviteToken` is present). After setting `onboardingComplete: true`, it also creates the `ProjectMember` row for the invited project (same as the direct-accept path), so onboarding completion and invite acceptance happen atomically in one request.
- **Client-side after onboarding submit:** if `inviteToken` was present, redirect to `/projects/{id}` (the id comes back in the API response) instead of `/workspace`.
- An existing user (already onboarded) can accept an invite to a project under a **different** company than their own — this is expected and requires no special handling, since project membership was never tied to company membership in this design.

## Middleware

`/invite` is added to `PUBLIC_PATHS` (matching the existing pattern for `/login`, `/register`, etc.) — reachable while logged out and while `onboardingComplete: false`, since the landing page itself branches on auth/onboarding state rather than relying on the gate to do it.

## Email sending (Resend)

- New dependency: `resend` npm package, `RESEND_API_KEY` and `EMAIL_FROM` env vars (added to `.env`, `.env.test`, `.env.example`).
- `src/lib/email.ts` wraps the Resend client behind a single `sendInviteEmail(to: string, projectName: string, inviterName: string, inviteUrl: string)` function, so the API route doesn't call the Resend SDK directly (keeps it swappable and mockable in tests).
- **Setup requirement for you:** create a Resend account and get an API key. For local dev, Resend's sandbox `onboarding@resend.dev` sender works without domain verification but only delivers to the email address on your Resend account; sending to arbitrary teammate addresses in production requires verifying a sending domain in Resend and using an address at that domain for `EMAIL_FROM`.

## Validation & error handling

- Project name: required, non-empty (reuses the same `.trim().min(1)` pattern as onboarding fields).
- Email invite addresses: split on commas, trim, validate each with the same email-format check used elsewhere (`registerSchema`'s email validation minus the corporate-only refinement) — invalid entries are rejected with a field-level error listing which address(es) failed, valid ones are not partially sent.
- Invite token lookup failures (`/invite/{token}` for an unknown token, or the accept API for an unknown/tampered token): a plain "This invite link isn't valid." message, not a generic 500.
- `POST /api/onboarding` with an `inviteToken` that fails validation (unknown token) falls back to normal onboarding behavior (company-name match-or-create) rather than failing the whole request — a broken invite token shouldn't block someone from finishing their own onboarding.

## Testing

Following the same split established in phase 1: TDD for API routes and logic, manual browser verification for UI pages.

- `POST /api/projects`: creates project + first `ProjectMember`, rejects missing name, requires auth.
- `GET /api/projects/{id}/invite-link`: creates on first call, returns the same link on subsequent calls (get-or-create idempotency).
- `POST /api/projects/{id}/invite-email`: rejects invalid email formats, calls `sendInviteEmail` once per valid address (mocked in tests — no real Resend calls in the test suite), requires auth and project membership.
- `POST /api/invite/{token}/accept`: creates `ProjectMember` for an authenticated+onboarded user, no-ops if already a member, 404s for an unknown token, 401s if unauthenticated.
- `POST /api/onboarding` with a valid `inviteToken`: skips company-name match-or-create, sets `companyId` from the inviter, creates the `ProjectMember` row, all in one request. With an invalid/unknown `inviteToken`: falls back to normal onboarding behavior instead of failing.
- Middleware: `/invite/{token}` is reachable with no session and with `onboardingComplete: false` (extending the existing `evaluateGate` test suite).
- Manual browser walkthrough: full invite loop for a brand-new user (invite link → register → onboarding without company step → lands on the project) and for an already-registered user (invite link → straight into the project).
