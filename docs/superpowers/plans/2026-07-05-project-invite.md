# Phase 2 Slice 1: First Project + Invite Teammates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a freshly onboarded user create their first project, and invite teammates to it via one reusable link (copyable or sent by email through Resend), with invited users skipping the company-name step during their own onboarding.

**Architecture:** Three new Prisma models (`Project`, `ProjectMember`, `ProjectInviteLink`), a handful of new API routes following the existing pattern (Zod validation, `assertSameOrigin`, `auth()` session checks), and Server Component pages for data-heavy views (workspace project list, project detail, invite landing) with small Client Components for the interactive bits (invite panel, accept button, logout button).

**Tech Stack:** Same as phase 1 (Next.js 14 App Router, Prisma 5, Auth.js v5, MUI v5, Vitest) plus the `resend` package for transactional email.

---

Reference spec: [docs/superpowers/specs/2026-07-05-project-invite-design.md](../specs/2026-07-05-project-invite-design.md)

## File Structure

```
prisma/schema.prisma                              - modified: Project, ProjectMember, ProjectInviteLink models
prisma/migrations/<ts>_add_projects/migration.sql - new migration

src/lib/inviteToken.ts                             - generateInviteToken()
src/lib/email.ts                                   - sendInviteEmail() wrapping Resend
src/lib/validation.ts                              - modified: emailSchema extracted, createProjectSchema,
                                                      inviteEmailListSchema, onboardingSchema gains optional
                                                      companyName + inviteToken

src/app/api/projects/route.ts                      - POST create project, GET list current user's projects
src/app/api/projects/[id]/invite-link/route.ts     - GET get-or-create the project's invite link
src/app/api/projects/[id]/invite-email/route.ts    - POST send invite emails
src/app/api/invite/[token]/accept/route.ts         - POST accept invite (join project)
src/app/api/onboarding/route.ts                    - modified: optional inviteToken support

src/middleware.ts                                  - modified: "/invite" added to PUBLIC_PATHS

src/app/workspace/page.tsx                         - modified: project list instead of placeholder
src/app/workspace/LogoutButton.tsx                 - new: extracted client component
src/app/projects/new/page.tsx                      - new: create-project form
src/app/projects/[id]/page.tsx                     - new: project detail (members + invite panel)
src/app/projects/[id]/InvitePanel.tsx              - new: client component (copy link, send email)
src/app/invite/[token]/page.tsx                    - new: invite landing page
src/app/invite/[token]/AcceptInviteButton.tsx      - new: client component
src/app/register/page.tsx                          - modified: thread inviteToken through
src/app/register/success/page.tsx                  - modified: thread inviteToken through
src/app/onboarding/page.tsx                        - modified: hide company step + thread inviteToken

tests/lib/inviteToken.test.ts
tests/lib/email.test.ts
tests/lib/validation.test.ts                       - modified: new schema tests
tests/api/projects.test.ts
tests/api/projects-invite-link.test.ts
tests/api/projects-invite-email.test.ts
tests/api/invite-accept.test.ts
tests/api/onboarding.test.ts                        - modified: inviteToken cases
tests/middleware.test.ts                            - modified: /invite public-path case

.env, .env.test, .env.example                       - RESEND_API_KEY, EMAIL_FROM
```

---

### Task 1: Prisma schema — Project, ProjectMember, ProjectInviteLink

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration under `prisma/migrations/`

- [ ] **Step 1: Add the new models and back-relations**

Add to `prisma/schema.prisma`:

```prisma
model Project {
  id          String             @id @default(cuid())
  name        String
  description String?
  createdById String
  createdBy   User               @relation(fields: [createdById], references: [id])
  companyId   String?
  company     Company?           @relation(fields: [companyId], references: [id])
  createdAt   DateTime           @default(now())
  members     ProjectMember[]
  inviteLink  ProjectInviteLink?

  @@index([createdById])
  @@index([companyId])
}

model ProjectMember {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id])
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())

  @@unique([projectId, userId])
  @@index([userId])
}

model ProjectInviteLink {
  id          String   @id @default(cuid())
  projectId   String   @unique
  project     Project  @relation(fields: [projectId], references: [id])
  token       String   @unique
  createdById String
  createdBy   User     @relation(fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
}
```

Update the existing `User` model to add the reverse relations (add these three lines inside the `User` block, anywhere after the existing fields):

```prisma
  createdProjects    Project[]
  projectMemberships ProjectMember[]
  createdInviteLinks ProjectInviteLink[]
```

Update the existing `Company` model to add the reverse relation (add inside the `Company` block):

```prisma
  projects Project[]
```

- [ ] **Step 2: Generate the incremental migration (non-interactive — `migrate dev` requires a TTY we don't have)**

```bash
cd /Users/aspacev/flowline
TS=$(date -u +%Y%m%d%H%M%S)
mkdir -p "prisma/migrations/${TS}_add_projects"
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "prisma/migrations/${TS}_add_projects/migration.sql"
cat "prisma/migrations/${TS}_add_projects/migration.sql"
```

Expected: SQL creating `Project`, `ProjectMember`, `ProjectInviteLink` tables, their indexes, and foreign keys — nothing about `User` or `Company` (those tables already exist unchanged).

- [ ] **Step 3: Apply the migration to the dev database and regenerate the client**

```bash
npx dotenv -e .env -- npx prisma migrate deploy
```

Expected: `All migrations have been successfully applied.`

- [ ] **Step 4: Push the same schema to the test database**

```bash
npm run db:push:test
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add Project, ProjectMember, ProjectInviteLink models"
```

---

### Task 2: Invite token generator

**Files:**
- Create: `src/lib/inviteToken.ts`
- Test: `tests/lib/inviteToken.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/lib/inviteToken.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateInviteToken } from "@/lib/inviteToken";

describe("generateInviteToken", () => {
  it("generates a url-safe, reasonably long token", () => {
    const token = generateInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates a different token each call", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/lib/inviteToken.test.ts`
Expected: FAIL — `Cannot find module '@/lib/inviteToken'`

- [ ] **Step 3: Implement**

`src/lib/inviteToken.ts`:

```ts
import { randomBytes } from "node:crypto";

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/lib/inviteToken.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/inviteToken.ts tests/lib/inviteToken.test.ts
git commit -m "Add invite token generator"
```

---

### Task 3: Validation schemas — project, invite emails, onboarding with invite support

**Files:**
- Modify: `src/lib/validation.ts`
- Test: `tests/lib/validation.test.ts`

- [ ] **Step 1: Write the failing test additions**

Add to `tests/lib/validation.test.ts` (append these `describe` blocks; keep the existing ones as-is):

```ts
import { createProjectSchema, inviteEmailListSchema } from "@/lib/validation";

describe("createProjectSchema", () => {
  it("accepts a name-only project", () => {
    expect(createProjectSchema.safeParse({ name: "Website relaunch" }).success).toBe(true);
  });

  it("accepts a name with a description", () => {
    const result = createProjectSchema.safeParse({ name: "Website relaunch", description: "Redesign" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createProjectSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    expect(createProjectSchema.safeParse({ description: "no name" }).success).toBe(false);
  });
});

describe("inviteEmailListSchema", () => {
  it("accepts a list of valid emails, does not require them to be corporate", () => {
    const result = inviteEmailListSchema.safeParse({ emails: ["person@gmail.com", "someone@acme-corp.com"] });
    expect(result.success).toBe(true);
  });

  it("rejects an empty list", () => {
    expect(inviteEmailListSchema.safeParse({ emails: [] }).success).toBe(false);
  });

  it("rejects a list containing an invalid email", () => {
    expect(inviteEmailListSchema.safeParse({ emails: ["not-an-email"] }).success).toBe(false);
  });
});

describe("onboardingSchema with invite support", () => {
  it("still accepts the normal shape (companyName, no inviteToken)", () => {
    const result = onboardingSchema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      department: "Engineering",
      position: "Product manager",
      companyName: "Acme inc",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an inviteToken with no companyName", () => {
    const result = onboardingSchema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      department: "Engineering",
      position: "Product manager",
      inviteToken: "some-token",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/lib/validation.test.ts`
Expected: FAIL — `Cannot find module` or `createProjectSchema is not exported` / `inviteEmailListSchema is not exported`

- [ ] **Step 3: Implement**

Replace the contents of `src/lib/validation.ts` with:

```ts
import { z } from "zod";
import freeEmailDomains from "free-email-domains";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isCorporateEmail(email: string): boolean {
  const domain = normalizeEmail(email).split("@")[1];
  if (!domain) return false;
  return !freeEmailDomains.includes(domain);
}

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

export const registerSchema = z.object({
  email: emailSchema.refine(isCorporateEmail, { message: "please use only corporate email" }),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const onboardingSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  department: z.string().trim().min(1),
  position: z.string().trim().min(1),
  companyName: z.string().trim().optional(),
  inviteToken: z.string().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

export const inviteEmailListSchema = z.object({
  emails: z.array(emailSchema).min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type InviteEmailListInput = z.infer<typeof inviteEmailListSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/lib/validation.test.ts`
Expected: PASS (all tests, existing + new)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation.ts tests/lib/validation.test.ts
git commit -m "Add project/invite-email validation schemas, make onboarding companyName conditional"
```

---

### Task 4: Email sending (Resend)

**Files:**
- Create: `src/lib/email.ts`
- Test: `tests/lib/email.test.ts`
- Modify: `.env`, `.env.test`, `.env.example`

- [ ] **Step 1: Install the Resend SDK**

```bash
cd /Users/aspacev/flowline
npm install resend
```

- [ ] **Step 2: Add env vars**

Add to `.env`:

```
RESEND_API_KEY="re_dev_placeholder_get_a_real_key_from_resend.com"
EMAIL_FROM="flowline <onboarding@resend.dev>"
```

Add to `.env.test`:

```
RESEND_API_KEY="re_test_placeholder"
EMAIL_FROM="flowline <onboarding@resend.dev>"
```

Add to `.env.example`:

```
RESEND_API_KEY="get-a-real-key-from-resend.com"
EMAIL_FROM="flowline <onboarding@resend.dev>"
```

- [ ] **Step 3: Write the failing test**

`tests/lib/email.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn().mockResolvedValue({ data: { id: "test" }, error: null });

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

describe("sendInviteEmail", () => {
  beforeEach(() => {
    sendMock.mockClear();
  });

  it("sends an email with the invite link, project name, and inviter name", async () => {
    const { sendInviteEmail } = await import("@/lib/email");
    await sendInviteEmail("teammate@acme-corp.com", "Website relaunch", "Grace Hopper", "https://flowline.app/invite/abc123");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe("teammate@acme-corp.com");
    expect(call.subject).toContain("Website relaunch");
    expect(call.html).toContain("https://flowline.app/invite/abc123");
    expect(call.html).toContain("Grace Hopper");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- tests/lib/email.test.ts`
Expected: FAIL — `Cannot find module '@/lib/email'`

- [ ] **Step 5: Implement**

`src/lib/email.ts`:

```ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInviteEmail(
  to: string,
  projectName: string,
  inviterName: string,
  inviteUrl: string
): Promise<void> {
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "flowline <onboarding@resend.dev>",
    to,
    subject: `${inviterName} invited you to ${projectName} on flowline`,
    html: `<p>${inviterName} invited you to join <strong>${projectName}</strong> on flowline.</p><p><a href="${inviteUrl}">Accept invite</a></p>`,
  });
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- tests/lib/email.test.ts`
Expected: PASS (1 test)

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/email.ts tests/lib/email.test.ts .env.example
git commit -m "Add Resend email sending for project invites"
```

(`.env` and `.env.test` are gitignored — they won't show up in `git status`, nothing to stage there.)

---

### Task 5: POST/GET /api/projects

**Files:**
- Create: `src/app/api/projects/route.ts`
- Test: `tests/api/projects.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/api/projects.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { POST, GET } from "@/app/api/projects/route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

function makeRequest(method: string, body?: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/projects", {
    method,
    headers: { "content-type": "application/json", origin },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function createOnboardedUser(email: string) {
  const company = await prisma.company.create({ data: { name: "Acme inc" } });
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("longenough"),
      firstName: "Ada",
      lastName: "Lovelace",
      department: "Engineering",
      position: "Engineer",
      companyId: company.id,
      onboardingComplete: true,
    },
  });
}

describe("POST /api/projects", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const response = await POST(makeRequest("POST", { name: "Website relaunch" }));
    expect(response.status).toBe(401);
  });

  it("rejects a missing name", async () => {
    const user = await createOnboardedUser("owner1@acme-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id, companyId: user.companyId } } as never);
    const response = await POST(makeRequest("POST", { description: "no name" }));
    expect(response.status).toBe(400);
  });

  it("creates a project and adds the creator as the first member", async () => {
    const user = await createOnboardedUser("owner2@acme-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id, companyId: user.companyId } } as never);

    const response = await POST(makeRequest("POST", { name: "Website relaunch", description: "Redesign" }));
    expect(response.status).toBe(201);
    const body = await response.json();

    const project = await prisma.project.findUnique({ where: { id: body.id } });
    expect(project?.name).toBe("Website relaunch");
    expect(project?.createdById).toBe(user.id);
    expect(project?.companyId).toBe(user.companyId);

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: body.id, userId: user.id } },
    });
    expect(membership).not.toBeNull();
  });

  it("rejects a mismatched origin", async () => {
    const user = await createOnboardedUser("owner3@acme-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id, companyId: user.companyId } } as never);
    const response = await POST(makeRequest("POST", { name: "X" }, "http://evil.example.com"));
    expect(response.status).toBe(403);
  });
});

describe("GET /api/projects", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("lists only projects the user is a member of", async () => {
    const user = await createOnboardedUser("lister@acme-corp.com");
    const other = await createOnboardedUser("other@acme-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id, companyId: user.companyId } } as never);

    await POST(makeRequest("POST", { name: "Mine" }));
    vi.mocked(auth).mockResolvedValue({ user: { id: other.id, companyId: other.companyId } } as never);
    await POST(makeRequest("POST", { name: "Not mine" }));

    vi.mocked(auth).mockResolvedValue({ user: { id: user.id, companyId: user.companyId } } as never);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].name).toBe("Mine");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/api/projects.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/projects/route'`

- [ ] **Step 3: Implement**

`src/app/api/projects/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createProjectSchema } from "@/lib/validation";
import { assertSameOrigin } from "@/lib/origin";
import { auth } from "@/auth";

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  }

  const { name, description } = parsed.data;

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name,
        description: description || null,
        createdById: session.user.id,
        companyId: session.user.companyId,
      },
    });
    await tx.projectMember.create({
      data: { projectId: created.id, userId: session.user.id },
    });
    return created;
  });

  return NextResponse.json({ id: project.id }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const memberships = await prisma.projectMember.findMany({
    where: { userId: session.user.id },
    include: { project: { include: { members: true } } },
    orderBy: { createdAt: "desc" },
  });

  const projects = memberships.map(({ project }) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    memberCount: project.members.length,
  }));

  return NextResponse.json({ projects });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/api/projects.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects/route.ts tests/api/projects.test.ts
git commit -m "Add POST/GET /api/projects"
```

---

### Task 6: GET /api/projects/[id]/invite-link

**Files:**
- Create: `src/app/api/projects/[id]/invite-link/route.ts`
- Test: `tests/api/projects-invite-link.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/api/projects-invite-link.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { GET } from "@/app/api/projects/[id]/invite-link/route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

async function createOnboardedUser(email: string) {
  const company = await prisma.company.create({ data: { name: "Acme inc" } });
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("longenough"),
      firstName: "Ada",
      lastName: "Lovelace",
      department: "Engineering",
      position: "Engineer",
      companyId: company.id,
      onboardingComplete: true,
    },
  });
}

function makeRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/projects/${id}/invite-link`);
}

describe("GET /api/projects/[id]/invite-link", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const response = await GET(makeRequest("anything"), { params: { id: "anything" } });
    expect(response.status).toBe(401);
  });

  it("rejects a non-member", async () => {
    const user = await createOnboardedUser("nonmember@acme-corp.com");
    const owner = await createOnboardedUser("owner@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });

    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);
    const response = await GET(makeRequest(project.id), { params: { id: project.id } });
    expect(response.status).toBe(403);
  });

  it("creates a link on first request and returns the same one on the next", async () => {
    const owner = await createOnboardedUser("owner2@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    vi.mocked(auth).mockResolvedValue({ user: { id: owner.id } } as never);

    const first = await GET(makeRequest(project.id), { params: { id: project.id } });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.token).toBeTruthy();
    expect(firstBody.url).toContain(firstBody.token);

    const second = await GET(makeRequest(project.id), { params: { id: project.id } });
    const secondBody = await second.json();
    expect(secondBody.token).toBe(firstBody.token);

    const links = await prisma.projectInviteLink.findMany({ where: { projectId: project.id } });
    expect(links).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/api/projects-invite-link.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/projects/[id]/invite-link/route'`

- [ ] **Step 3: Implement**

`src/app/api/projects/[id]/invite-link/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { generateInviteToken } from "@/lib/inviteToken";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.id, userId: session.user.id } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this project." }, { status: 403 });
  }

  let link = await prisma.projectInviteLink.findUnique({ where: { projectId: params.id } });
  if (!link) {
    link = await prisma.projectInviteLink.create({
      data: { projectId: params.id, token: generateInviteToken(), createdById: session.user.id },
    });
  }

  return NextResponse.json({ token: link.token, url: `${request.nextUrl.origin}/invite/${link.token}` });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/api/projects-invite-link.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/projects/[id]/invite-link/route.ts" tests/api/projects-invite-link.test.ts
git commit -m "Add GET /api/projects/[id]/invite-link (get-or-create)"
```

---

### Task 7: POST /api/projects/[id]/invite-email

**Files:**
- Create: `src/app/api/projects/[id]/invite-email/route.ts`
- Test: `tests/api/projects-invite-email.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/api/projects-invite-email.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { sendInviteEmail } from "@/lib/email";
import { POST } from "@/app/api/projects/[id]/invite-email/route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

async function createOnboardedUser(email: string) {
  const company = await prisma.company.create({ data: { name: "Acme inc" } });
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("longenough"),
      firstName: "Grace",
      lastName: "Hopper",
      department: "Engineering",
      position: "Engineer",
      companyId: company.id,
      onboardingComplete: true,
    },
  });
}

function makeRequest(id: string, body: unknown, origin = "http://localhost:3000") {
  return new NextRequest(`http://localhost:3000/api/projects/${id}/invite-email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("POST /api/projects/[id]/invite-email", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
    vi.mocked(sendInviteEmail).mockClear();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const response = await POST(makeRequest("anything", { emails: ["a@b.com"] }), { params: { id: "anything" } });
    expect(response.status).toBe(401);
  });

  it("rejects an invalid email in the list", async () => {
    const owner = await createOnboardedUser("owner@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "Website relaunch", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    vi.mocked(auth).mockResolvedValue({ user: { id: owner.id } } as never);

    const response = await POST(makeRequest(project.id, { emails: ["not-an-email"] }), { params: { id: project.id } });
    expect(response.status).toBe(400);
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("sends one email per valid address, including free-email-provider addresses", async () => {
    const owner = await createOnboardedUser("owner2@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "Website relaunch", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    vi.mocked(auth).mockResolvedValue({ user: { id: owner.id } } as never);

    const response = await POST(
      makeRequest(project.id, { emails: ["teammate@gmail.com", "other@acme-corp.com"] }),
      { params: { id: project.id } }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sent).toBe(2);
    expect(sendInviteEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendInviteEmail).mock.calls[0][0]).toBe("teammate@gmail.com");
    expect(vi.mocked(sendInviteEmail).mock.calls[0][1]).toBe("Website relaunch");
    expect(vi.mocked(sendInviteEmail).mock.calls[0][2]).toBe("Grace Hopper");
  });

  it("rejects a non-member", async () => {
    const owner = await createOnboardedUser("owner3@acme-corp.com");
    const outsider = await createOnboardedUser("outsider@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    vi.mocked(auth).mockResolvedValue({ user: { id: outsider.id } } as never);

    const response = await POST(makeRequest(project.id, { emails: ["a@b.com"] }), { params: { id: project.id } });
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/api/projects-invite-email.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/projects/[id]/invite-email/route'`

- [ ] **Step 3: Implement**

`src/app/api/projects/[id]/invite-email/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/origin";
import { auth } from "@/auth";
import { inviteEmailListSchema } from "@/lib/validation";
import { generateInviteToken } from "@/lib/inviteToken";
import { sendInviteEmail } from "@/lib/email";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.id, userId: session.user.id } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this project." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = inviteEmailListSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Enter at least one valid email address.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  const inviter = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!project || !inviter) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let link = await prisma.projectInviteLink.findUnique({ where: { projectId: params.id } });
  if (!link) {
    link = await prisma.projectInviteLink.create({
      data: { projectId: params.id, token: generateInviteToken(), createdById: session.user.id },
    });
  }

  const inviteUrl = `${request.nextUrl.origin}/invite/${link.token}`;
  const inviterName = `${inviter.firstName} ${inviter.lastName}`;

  for (const email of parsed.data.emails) {
    await sendInviteEmail(email, project.name, inviterName, inviteUrl);
  }

  return NextResponse.json({ sent: parsed.data.emails.length });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/api/projects-invite-email.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/projects/[id]/invite-email/route.ts" tests/api/projects-invite-email.test.ts
git commit -m "Add POST /api/projects/[id]/invite-email"
```

---

### Task 8: POST /api/invite/[token]/accept

**Files:**
- Create: `src/app/api/invite/[token]/accept/route.ts`
- Test: `tests/api/invite-accept.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/api/invite-accept.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { generateInviteToken } from "@/lib/inviteToken";
import { POST } from "@/app/api/invite/[token]/accept/route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

async function createOnboardedUser(email: string) {
  const company = await prisma.company.create({ data: { name: "Acme inc" } });
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("longenough"),
      firstName: "Ada",
      lastName: "Lovelace",
      department: "Engineering",
      position: "Engineer",
      companyId: company.id,
      onboardingComplete: true,
    },
  });
}

function makeRequest(token: string, origin = "http://localhost:3000") {
  return new NextRequest(`http://localhost:3000/api/invite/${token}/accept`, {
    method: "POST",
    headers: { origin },
  });
}

describe("POST /api/invite/[token]/accept", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const response = await POST(makeRequest("anything"), { params: { token: "anything" } });
    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown token", async () => {
    const user = await createOnboardedUser("user1@acme-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);
    const response = await POST(makeRequest("unknown-token"), { params: { token: "unknown-token" } });
    expect(response.status).toBe(404);
  });

  it("adds the user as a project member", async () => {
    const owner = await createOnboardedUser("owner@acme-corp.com");
    const invitee = await createOnboardedUser("invitee@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    const token = generateInviteToken();
    await prisma.projectInviteLink.create({ data: { projectId: project.id, token, createdById: owner.id } });

    vi.mocked(auth).mockResolvedValue({ user: { id: invitee.id } } as never);
    const response = await POST(makeRequest(token), { params: { token } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projectId).toBe(project.id);

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: invitee.id } },
    });
    expect(membership).not.toBeNull();
  });

  it("is idempotent when the user is already a member", async () => {
    const owner = await createOnboardedUser("owner2@acme-corp.com");
    const project = await prisma.project.create({
      data: { name: "X", createdById: owner.id, companyId: owner.companyId },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id } });
    const token = generateInviteToken();
    await prisma.projectInviteLink.create({ data: { projectId: project.id, token, createdById: owner.id } });

    vi.mocked(auth).mockResolvedValue({ user: { id: owner.id } } as never);
    const response = await POST(makeRequest(token), { params: { token } });
    expect(response.status).toBe(200);

    const memberships = await prisma.projectMember.findMany({ where: { projectId: project.id, userId: owner.id } });
    expect(memberships).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/api/invite-accept.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/invite/[token]/accept/route'`

- [ ] **Step 3: Implement**

`src/app/api/invite/[token]/accept/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/origin";
import { auth } from "@/auth";

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const link = await prisma.projectInviteLink.findUnique({ where: { token: params.token } });
  if (!link) {
    return NextResponse.json({ error: "This invite link isn't valid." }, { status: 404 });
  }

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: link.projectId, userId: session.user.id } },
    create: { projectId: link.projectId, userId: session.user.id },
    update: {},
  });

  return NextResponse.json({ projectId: link.projectId });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/api/invite-accept.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/invite/[token]/accept/route.ts" tests/api/invite-accept.test.ts
git commit -m "Add POST /api/invite/[token]/accept"
```

---

### Task 9: Onboarding route — invite token support

**Files:**
- Modify: `src/app/api/onboarding/route.ts`
- Modify: `tests/api/onboarding.test.ts`

- [ ] **Step 1: Write the failing test additions**

Add to `tests/api/onboarding.test.ts` (append; keep existing tests as-is). Add these imports at the top alongside the existing ones:

```ts
import { generateInviteToken } from "@/lib/inviteToken";
```

Append this `describe` block at the end of the file (before the final closing, i.e. as a sibling to the existing `describe("POST /api/onboarding", ...)` block):

```ts
describe("POST /api/onboarding with inviteToken", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("skips company-name match-or-create and joins the inviter's company + project", async () => {
    const inviterCompany = await prisma.company.create({ data: { name: "Acme inc" } });
    const inviter = await prisma.user.create({
      data: {
        email: "inviter@acme-corp.com",
        passwordHash: await hashPassword("longenough"),
        firstName: "Grace",
        lastName: "Hopper",
        department: "Engineering",
        position: "Engineer",
        companyId: inviterCompany.id,
        onboardingComplete: true,
      },
    });
    const project = await prisma.project.create({
      data: { name: "Website relaunch", createdById: inviter.id, companyId: inviterCompany.id },
    });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: inviter.id } });
    const token = generateInviteToken();
    await prisma.projectInviteLink.create({ data: { projectId: project.id, token, createdById: inviter.id } });

    const newUser = await createUser("newperson@other-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: newUser.id } } as never);

    const response = await POST(
      makeRequest({
        firstName: "New",
        lastName: "Person",
        department: "Design",
        position: "Designer",
        inviteToken: token,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projectId).toBe(project.id);

    const updated = await prisma.user.findUnique({ where: { id: newUser.id } });
    expect(updated?.companyId).toBe(inviterCompany.id);
    expect(updated?.onboardingComplete).toBe(true);

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: newUser.id } },
    });
    expect(membership).not.toBeNull();

    const companies = await prisma.company.findMany();
    expect(companies).toHaveLength(1);
  });

  it("falls back to normal onboarding when the inviteToken is unknown", async () => {
    const newUser = await createUser("fallback@acme-corp.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: newUser.id } } as never);

    const response = await POST(
      makeRequest({
        firstName: "New",
        lastName: "Person",
        department: "Design",
        position: "Designer",
        companyName: "Acme inc",
        inviteToken: "this-token-does-not-exist",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projectId).toBeNull();

    const updated = await prisma.user.findUnique({ where: { id: newUser.id } });
    expect(updated?.onboardingComplete).toBe(true);

    const company = await prisma.company.findFirst({ where: { name: "Acme inc" } });
    expect(updated?.companyId).toBe(company?.id);
  });
});
```

This test file already has an `async function createUser(email: string)` helper from phase 1 — reuse it as-is, no changes needed to it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/api/onboarding.test.ts`
Expected: FAIL — existing tests still pass, but the new `describe("POST /api/onboarding with inviteToken", ...)` tests fail because `body.projectId` is `undefined` (not `null`), since the route doesn't return that field yet.

- [ ] **Step 3: Implement**

Replace `src/app/api/onboarding/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { onboardingSchema } from "@/lib/validation";
import { assertSameOrigin } from "@/lib/origin";
import { auth } from "@/auth";

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  const { firstName, lastName, department, position, companyName, inviteToken } = parsed.data;

  let companyId: string | null = null;
  let projectIdToJoin: string | null = null;

  if (inviteToken) {
    const invite = await prisma.projectInviteLink.findUnique({
      where: { token: inviteToken },
      include: { project: { include: { createdBy: true } } },
    });
    if (invite && invite.project.createdBy.companyId) {
      companyId = invite.project.createdBy.companyId;
      projectIdToJoin = invite.projectId;
    }
  }

  if (!companyId) {
    if (!companyName || !companyName.trim()) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    const existingCompany = await prisma.company.findFirst({
      where: { name: { equals: companyName, mode: "insensitive" } },
    });
    const company = existingCompany ?? (await prisma.company.create({ data: { name: companyName } }));
    companyId = company.id;
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: session.user.id },
      data: {
        firstName,
        lastName,
        department,
        position,
        companyId,
        onboardingComplete: true,
      },
    });

    if (projectIdToJoin) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: projectIdToJoin, userId: session.user.id } },
        create: { projectId: projectIdToJoin, userId: session.user.id },
        update: {},
      });
    }
  });

  return NextResponse.json({ companyId, projectId: projectIdToJoin }, { status: 200 });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/api/onboarding.test.ts`
Expected: PASS (all tests, existing + new)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/api/onboarding/route.ts tests/api/onboarding.test.ts
git commit -m "Add inviteToken support to onboarding: skip company step, join project"
```

---

### Task 10: Middleware — /invite public path

**Files:**
- Modify: `src/middleware.ts`
- Modify: `tests/middleware.test.ts`

- [ ] **Step 1: Write the failing test additions**

Append to `tests/middleware.test.ts`, inside the existing `describe("evaluateGate", ...)` block (add as a new `it`, alongside the others):

```ts
  it("allows /invite/{token} through regardless of session state", () => {
    expect(evaluateGate("/invite/abc123", null)).toBeNull();
    expect(evaluateGate("/invite/abc123", { onboardingComplete: false })).toBeNull();
    expect(evaluateGate("/invite/abc123", { onboardingComplete: true })).toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/middleware.test.ts`
Expected: FAIL — `/invite/abc123` currently redirects to `/login` (or `/onboarding`) instead of returning `null`

- [ ] **Step 3: Implement**

In `src/middleware.ts`, update the `PUBLIC_PATHS` array to include `/invite`:

```ts
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/register/success",
  "/api/auth",
  "/api/register",
  "/api/onboarding",
  "/api/health",
  "/invite",
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/middleware.test.ts`
Expected: PASS (all tests, existing + new)

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts tests/middleware.test.ts
git commit -m "Add /invite to public middleware paths"
```

---

### Task 11: Workspace becomes the project list

**Files:**
- Modify: `src/app/workspace/page.tsx`
- Create: `src/app/workspace/LogoutButton.tsx`

No TDD here — presentation-only, following the same precedent as phase 1's UI pages (manual browser verification in the final task).

- [ ] **Step 1: Extract the logout button into its own client component**

`src/app/workspace/LogoutButton.tsx`:

```tsx
"use client";

import { signOut } from "next-auth/react";
import Button from "@mui/material/Button";

export default function LogoutButton() {
  return (
    <Button variant="outlined" onClick={() => signOut({ callbackUrl: "/login" })}>
      Log out
    </Button>
  );
}
```

- [ ] **Step 2: Rewrite the workspace page as a Server Component showing the project list**

`src/app/workspace/page.tsx`:

```tsx
import Link from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import LogoutButton from "./LogoutButton";

export default async function WorkspacePage() {
  const session = await auth();

  const memberships = await prisma.projectMember.findMany({
    where: { userId: session!.user.id },
    include: { project: { include: { members: true } } },
    orderBy: { createdAt: "desc" },
  });
  const projects = memberships.map((m) => m.project);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Box
        sx={{
          bgcolor: "background.paper",
          px: 3,
          py: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <Typography variant="h6" component="span" fontWeight={700}>
          flowline
        </Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <Button component={Link} href="/projects/new" variant="contained">
            + New project
          </Button>
          <LogoutButton />
        </Box>
      </Box>

      <Box sx={{ p: 3, maxWidth: 640, mx: "auto" }}>
        {projects.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Start your first project
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Projects are where your roadmaps and tasks will live.
            </Typography>
            <Button component={Link} href="/projects/new" variant="contained" size="large">
              + New project
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {projects.map((project) => (
              <Card
                key={project.id}
                component={Link}
                href={`/projects/${project.id}`}
                sx={{ textDecoration: "none", display: "block" }}
              >
                <CardContent sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {project.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {project.description || "No description"}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {project.members.length} member{project.members.length === 1 ? "" : "s"}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/workspace/page.tsx src/app/workspace/LogoutButton.tsx
git commit -m "Turn /workspace into the project list"
```

---

### Task 12: /projects/new page

**Files:**
- Create: `src/app/projects/new/page.tsx`

- [ ] **Step 1: Create the page**

`src/app/projects/new/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description: description || undefined }),
    });

    setSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Something went wrong." }));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    const body = await response.json();
    router.push(`/projects/${body.id}`);
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
            New project
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Name is required.
          </Typography>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <TextField
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              minRows={2}
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={submitting}>
              Create project
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
git add src/app/projects/new/page.tsx
git commit -m "Add /projects/new page"
```

---

### Task 13: /projects/[id] page + InvitePanel

**Files:**
- Create: `src/app/projects/[id]/page.tsx`
- Create: `src/app/projects/[id]/InvitePanel.tsx`

- [ ] **Step 1: Create the invite panel client component**

`src/app/projects/[id]/InvitePanel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

export default function InvitePanel({ projectId }: { projectId: string }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emails, setEmails] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/invite-link`)
      .then((res) => res.json())
      .then((body) => setInviteUrl(body.url));
  }, [projectId]);

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setSendResult(null);

    const emailList = emails
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const response = await fetch(`/api/projects/${projectId}/invite-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails: emailList }),
    });

    setSending(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Something went wrong." }));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    setEmails("");
    setSendResult("Invites sent.");
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="overline" color="primary.main">
          Invite teammates
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 0.5 }}>
          Shareable link
        </Typography>
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <TextField value={inviteUrl ?? "Loading..."} InputProps={{ readOnly: true }} size="small" fullWidth />
          <Button variant="outlined" onClick={handleCopy} disabled={!inviteUrl}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          Or invite by email
        </Typography>
        <Box component="form" onSubmit={handleSend} sx={{ display: "flex", gap: 1 }}>
          <TextField
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="name@company.com, another@company.com"
            size="small"
            fullWidth
          />
          <Button type="submit" variant="contained" disabled={sending || !emails.trim()}>
            Send
          </Button>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
        {sendResult && (
          <Alert severity="success" sx={{ mt: 1 }}>
            {sendResult}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create the project detail page**

`src/app/projects/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import InvitePanel from "./InvitePanel";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const session = await auth();

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.id, userId: session!.user.id } },
  });
  if (!membership) notFound();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { members: { include: { user: true } } },
  });
  if (!project) notFound();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", p: 3 }}>
      <Box sx={{ maxWidth: 640, mx: "auto" }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {project.name}
        </Typography>
        {project.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {project.description}
          </Typography>
        )}

        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="overline" color="primary.main">
              Members
            </Typography>
            {project.members.map((member) => (
              <Box key={member.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1 }}>
                <Avatar sx={{ width: 30, height: 30, bgcolor: "#DFF5F2", color: "primary.main", fontSize: 13, fontWeight: 700 }}>
                  {member.user.firstName?.[0]?.toUpperCase() ?? "?"}
                </Avatar>
                <Typography variant="body2">
                  {member.user.firstName} {member.user.lastName}
                  {member.userId === session!.user.id ? " (you)" : ""}
                </Typography>
              </Box>
            ))}
          </CardContent>
        </Card>

        <InvitePanel projectId={project.id} />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add "src/app/projects/[id]/page.tsx" "src/app/projects/[id]/InvitePanel.tsx"
git commit -m "Add /projects/[id] page with members list and invite panel"
```

---

### Task 14: /invite/[token] landing page + AcceptInviteButton

**Files:**
- Create: `src/app/invite/[token]/page.tsx`
- Create: `src/app/invite/[token]/AcceptInviteButton.tsx`

- [ ] **Step 1: Create the accept-button client component**

`src/app/invite/[token]/AcceptInviteButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";

export default function AcceptInviteButton({ token, projectId }: { token: string; projectId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleAccept() {
    setSubmitting(true);
    await fetch(`/api/invite/${token}/accept`, { method: "POST" });
    router.push(`/projects/${projectId}`);
  }

  return (
    <Button variant="contained" size="large" onClick={handleAccept} disabled={submitting}>
      Accept &amp; continue
    </Button>
  );
}
```

- [ ] **Step 2: Create the landing page**

`src/app/invite/[token]/page.tsx`:

```tsx
import Link from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import AcceptInviteButton from "./AcceptInviteButton";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const link = await prisma.projectInviteLink.findUnique({
    where: { token: params.token },
    include: { project: { include: { createdBy: true } } },
  });

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
          {!link ? (
            <>
              <Typography variant="h6" gutterBottom>
                This invite link isn&apos;t valid.
              </Typography>
              <Button component={Link} href="/login" variant="contained" size="large">
                Go to login
              </Button>
            </>
          ) : (
            <InviteAccept
              token={params.token}
              projectId={link.projectId}
              projectName={link.project.name}
              inviterName={`${link.project.createdBy.firstName} ${link.project.createdBy.lastName}`}
            />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

async function InviteAccept({
  token,
  projectId,
  projectName,
  inviterName,
}: {
  token: string;
  projectId: string;
  projectName: string;
  inviterName: string;
}) {
  const session = await auth();

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {inviterName} invited you to
      </Typography>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 3 }}>
        {projectName}
      </Typography>
      {!session ? (
        <Button component={Link} href={`/register?inviteToken=${token}`} variant="contained" size="large">
          Accept &amp; continue
        </Button>
      ) : !session.user.onboardingComplete ? (
        <Button component={Link} href={`/onboarding?inviteToken=${token}`} variant="contained" size="large">
          Accept &amp; continue
        </Button>
      ) : (
        <AcceptInviteButton token={token} projectId={projectId} />
      )}
    </>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add "src/app/invite/[token]/page.tsx" "src/app/invite/[token]/AcceptInviteButton.tsx"
git commit -m "Add /invite/[token] landing page"
```

---

### Task 15: Thread inviteToken through register and onboarding

**Files:**
- Modify: `src/app/register/page.tsx`
- Modify: `src/app/register/success/page.tsx`
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Register page — read inviteToken, forward it, wrap in Suspense**

Replace `src/app/register/page.tsx` with:

```tsx
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("inviteToken");
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

    router.push(inviteToken ? `/register/success?inviteToken=${inviteToken}` : "/register/success");
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

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
```

- [ ] **Step 2: Register success page — forward inviteToken via the searchParams prop**

Replace `src/app/register/success/page.tsx` with:

```tsx
import Link from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CheckIcon from "@mui/icons-material/Check";

export default function RegisterSuccessPage({
  searchParams,
}: {
  searchParams: { inviteToken?: string };
}) {
  const onboardingHref = searchParams.inviteToken
    ? `/onboarding?inviteToken=${searchParams.inviteToken}`
    : "/onboarding";

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
          <Button component={Link} href={onboardingHref} variant="contained" size="large">
            Continue
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
```

- [ ] **Step 3: Onboarding page — hide company step and thread inviteToken through, wrap in Suspense**

Replace `src/app/onboarding/page.tsx` with:

```tsx
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
  const inviteToken = searchParams.get("inviteToken");
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
      const nextErrors: Partial<Record<keyof FormState, string>> = {};
      requiredFields.forEach((key) => {
        if (!form[key].trim()) nextErrors[key] = "This field is required.";
      });
      setErrors(nextErrors);
      return;
    }

    const body = await response.json();
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

            {!inviteToken && (
              <>
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
              </>
            )}

            <Button type="submit" variant="contained" size="large" disabled={submitting}>
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
```

- [ ] **Step 4: Run the full test suite (nothing UI-related should have broken anything wired to `/lib` or `/api`)**

Run: `npm test`
Expected: all tests still PASS

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/register/page.tsx src/app/register/success/page.tsx src/app/onboarding/page.tsx
git commit -m "Thread inviteToken through register, register/success, and onboarding"
```

---

### Task 16: Final verification

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: all test files pass, including the new `inviteToken.test.ts`, `email.test.ts`, `projects.test.ts`, `projects-invite-link.test.ts`, `projects-invite-email.test.ts`, `invite-accept.test.ts`, plus the extended `validation.test.ts`, `onboarding.test.ts`, `middleware.test.ts`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Rebuild the Docker dev image (new `resend` dependency + new env vars need to be in the container)**

```bash
cd /Users/aspacev/flowline
docker compose stop app
docker compose rm -f -v app
docker compose up app postgres --build -d
```

Then: `curl -s http://localhost:3000/api/health` → expect `{"status":"ok"}`.

- [ ] **Step 4: Verify the production image still builds**

```bash
docker compose -f docker-compose.yml build app
```

Expected: build succeeds through the `runner` stage. Since `/register`, `/onboarding` now use `useSearchParams`, this step also confirms the `Suspense` wrapping is correct — an unwrapped `useSearchParams` call fails static generation with a build error, so a clean build here confirms it's wired correctly.

- [ ] **Step 5: Manual browser walkthrough — brand-new user via invite**

Using the dev server:
1. Log in as an existing onboarded user (or register one fresh), create a project from `/workspace`, open it, and copy the invite link from the invite panel.
2. Open the invite link in a new session/incognito context (no cookies). Confirm it shows "{inviter} invited you to {project}" with an "Accept & continue" button linking to `/register?inviteToken=...`.
3. Register with a new corporate email. Confirm you land on `/register/success` and the "Continue" link points to `/onboarding?inviteToken=...`.
4. On `/onboarding`, confirm the "Company details" section is **not shown** — only personal details. Submit.
5. Confirm you're redirected straight to `/projects/{id}` (not `/workspace`), and that you appear in the Members list.
6. Log out, log back in as the original inviter, open the same project, confirm the new teammate appears in Members.

- [ ] **Step 6: Manual browser walkthrough — already-registered user via invite**

1. Register a second brand-new account normally (not via invite), fully onboarded, with its own company.
2. While logged in as that second user, open the same invite link from Step 5 above.
3. Confirm the landing page shows the "Accept & continue" button that (since already onboarded) directly calls the accept API and redirects to `/projects/{id}` without touching registration/onboarding at all.
4. Confirm this user's own company was **not** changed (still their original company) — only project membership was added.

- [ ] **Step 7: Final commit if any stray changes remain**

```bash
git status
git add -A
git commit -m "Finish phase 2 slice 1: first project + invite teammates"
```

(Skip this step if `git status` is already clean.)
