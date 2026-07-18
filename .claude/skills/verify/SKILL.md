---
name: verify
description: Build, launch, and drive this app (flowline) to verify UI changes end-to-end in a headless environment.
---

# Verifying flowline changes

Next.js 14 + Prisma + Postgres + NextAuth (credentials). No ESLint config; typecheck with `npx tsc --noEmit`.

## Database

Local Postgres (no Docker needed if the daemon is unavailable):

```bash
service postgresql start
su postgres -c "psql -c \"CREATE ROLE flowline LOGIN PASSWORD 'flowline'\""   # once
su postgres -c "createdb -O flowline flowline_dev"                             # once
```

Write `.env` (gitignored):

```
DATABASE_URL="postgresql://flowline:flowline@localhost:5432/flowline_dev"
AUTH_SECRET="<any string>"
AUTH_TRUST_HOST=true
DOMAIN=http://localhost:3000
```

Then `npx prisma db push --skip-generate`.

Tests: `.env.test` points at port 5433 (docker). Against local Postgres:
`export DATABASE_URL=postgresql://flowline:flowline@localhost:5432/flowline_test && npx dotenv -e .env.test -- npx vitest run`
(`tests/lib/email.test.ts` fails without a real `RESEND_API_KEY` — pre-existing, unrelated.)

## Seed + launch

- Seed via a Node script using `@prisma/client` + `bcryptjs` from the repo's node_modules (create user with `onboardingComplete: true`, a company, project, ProjectMember, and tasks; epics are `Task` rows with `kind: "category"`). Run the script from inside the repo dir so imports resolve.
- `npm ci --ignore-scripts` if install fails on a postinstall fetch; then `npx prisma generate`.
- `npm run dev`, wait ~10s, login at `/login` with the seeded credentials.

## Driving the UI (Playwright)

- Global playwright lives at `/opt/node22/lib/node_modules/playwright/index.mjs` (import by absolute path; NODE_PATH doesn't work for ESM). Chromium: `executablePath: "/opt/pw-browsers/chromium"`.
- The Roadmap/Gantt is on `/projects/<id>` (default tab). Tasks fetch client-side — wait ~4s after navigation.
- Gotchas:
  - `[title*="Task Name"]` matches BOTH the sidebar row and the chart bar — filter by `boundingBox().x > 550` for the chart bar.
  - The task detail panel is a fixed right-side overlay that covers the Gantt/List toggle; its close button sits under the sticky app header. Reload the page to dismiss it instead of clicking close.
  - Dragging a confirmed bar opens the schedule-change reason dialog (expected app behavior — cancel or confirm it).
  - The chart auto-scrolls horizontally; set `scrollLeft = 0` on the wide scrollable div to see the earliest bars.
