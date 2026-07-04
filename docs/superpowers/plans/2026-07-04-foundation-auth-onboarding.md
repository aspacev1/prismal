# Foundation: Auth & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the flowline foundation — registration, login/logout, JWT-based sessions, and a mandatory onboarding step (personal + company details) that gates access to a placeholder workspace — deployed via Docker to an external server behind Caddy.

**Architecture:** Next.js 14 (App Router, TypeScript) full-stack app with Prisma → Postgres and Auth.js v5 (Credentials provider, JWT sessions — no adapter, since Auth.js doesn't support database sessions with Credentials). Route protection and the onboarding gate run in Next.js middleware reading `onboardingComplete` straight off the JWT.

**Tech Stack:** Next.js 14, TypeScript, Prisma 5 + PostgreSQL 16, next-auth (Auth.js) v5 beta, zod, bcryptjs, Vitest, Docker + Docker Compose, Caddy 2.

**Prerequisites:** Node.js >= 18.18, Docker + Docker Compose, on the `/Users/aspacev/flowline` repo (already git-initialized).

Reference spec: [docs/superpowers/specs/2026-07-03-foundation-auth-onboarding-design.md](../specs/2026-07-03-foundation-auth-onboarding-design.md)

---

## File Structure

```
package.json, tsconfig.json, next.config.mjs, next-env.d.ts, .gitignore
.env.example, .env (gitignored), .env.test (gitignored)
prisma/schema.prisma
src/lib/prisma.ts          - Prisma client singleton
src/lib/password.ts        - bcrypt hash/verify
src/lib/validation.ts      - normalizeEmail, registerSchema, onboardingSchema
src/lib/origin.ts          - CSRF same-origin check for custom API routes
src/lib/authenticateUser.ts - email+password lookup used by Auth.js authorize()
src/auth.ts                - Auth.js config (Credentials provider, JWT callbacks)
src/types/next-auth.d.ts   - module augmentation (onboardingComplete, companyId, id)
src/middleware.ts          - route protection + onboarding gate (exports evaluateGate)
src/app/layout.tsx         - root layout, wraps children in Providers
src/app/providers.tsx      - client SessionProvider wrapper
src/app/page.tsx           - "/" -> redirect to /workspace
src/app/register/page.tsx
src/app/register/success/page.tsx
src/app/login/page.tsx
src/app/onboarding/page.tsx
src/app/workspace/page.tsx
src/app/api/auth/[...nextauth]/route.ts
src/app/api/register/route.ts
src/app/api/onboarding/route.ts
src/app/api/health/route.ts
tests/setup.ts
tests/lib/password.test.ts
tests/lib/validation.test.ts
tests/lib/origin.test.ts
tests/lib/authenticateUser.test.ts
tests/api/register.test.ts
tests/api/onboarding.test.ts
tests/api/health.test.ts
tests/middleware.test.ts
vitest.config.ts
Dockerfile
docker-compose.yml           - production: app, postgres, caddy
docker-compose.override.yml  - dev: hot reload, exposed ports, no caddy
docker-compose.test.yml      - postgres-test only, for the Vitest suite
Caddyfile
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `next-env.d.ts`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Initialize the package and install dependencies**

```bash
cd /Users/aspacev/flowline
npm init -y
npm install next@14 react@18 react-dom@18 next-auth@beta @prisma/client bcryptjs zod
npm install -D typescript @types/node @types/react @types/react-dom @types/bcryptjs prisma vitest vite-tsconfig-paths dotenv-cli
```

- [ ] **Step 2: Set package.json scripts**

Open `package.json` and set the `"scripts"` key to:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "dotenv -e .env.test -- vitest run",
  "test:watch": "dotenv -e .env.test -- vitest",
  "db:push:test": "dotenv -e .env.test -- prisma db push"
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 5: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules
.next
.env
.env.test
.env.local
*.log
```

- [ ] **Step 7: Create the root layout and home page**

`src/app/layout.tsx`:

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
export default function HomePage() {
  return <p>flowline</p>;
}
```

- [ ] **Step 8: Verify the dev server boots**

Run: `npm run dev`
In another terminal: `curl -s http://localhost:3000 | grep -o flowline`
Expected: `flowline`

Stop the dev server (Ctrl+C) before continuing.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs next-env.d.ts .gitignore src/app/layout.tsx src/app/page.tsx
git commit -m "Scaffold Next.js + TypeScript project"
```

---

### Task 2: Postgres (dev + test) and Prisma schema

**Files:**
- Create: `docker-compose.override.yml` (postgres service only for now — app service added in Task 12)
- Create: `docker-compose.test.yml`
- Create: `prisma/schema.prisma`
- Create: `.env`, `.env.example`, `.env.test`

- [ ] **Step 1: Create the dev Postgres compose file**

`docker-compose.override.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: flowline
      POSTGRES_PASSWORD: flowline
      POSTGRES_DB: flowline
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

- [ ] **Step 2: Create the test Postgres compose file**

`docker-compose.test.yml`:

```yaml
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: flowline
      POSTGRES_PASSWORD: flowline
      POSTGRES_DB: flowline_test
    ports:
      - "5433:5432"
```

- [ ] **Step 3: Start both databases**

```bash
docker compose -f docker-compose.override.yml up -d postgres
docker compose -f docker-compose.test.yml up -d postgres-test
```

Expected: both commands report the container as `Started` or `Running`. Leave these containers running for the rest of this plan.

- [ ] **Step 4: Create env files**

`.env` (dev, gitignored):

```
DATABASE_URL="postgresql://flowline:flowline@localhost:5432/flowline"
AUTH_SECRET="dev-secret-change-me-32-bytes-min"
AUTH_TRUST_HOST=true
```

`.env.test` (gitignored):

```
DATABASE_URL="postgresql://flowline:flowline@localhost:5433/flowline_test"
AUTH_SECRET="test-secret-not-for-production-32b"
AUTH_TRUST_HOST=true
```

`.env.example` (committed):

```
DATABASE_URL="postgresql://flowline:flowline@localhost:5432/flowline"
AUTH_SECRET="generate-with-openssl-rand-base64-32"
AUTH_TRUST_HOST=true
POSTGRES_USER=flowline
POSTGRES_PASSWORD=flowline
POSTGRES_DB=flowline
DOMAIN=example.com
```

- [ ] **Step 5: Create the Prisma schema**

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                 String   @id @default(cuid())
  email              String   @unique
  passwordHash       String
  firstName          String?
  lastName           String?
  department         String?
  position           String?
  onboardingComplete Boolean  @default(false)
  companyId          String?
  company            Company? @relation(fields: [companyId], references: [id])
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([companyId])
}

model Company {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  users     User[]

  @@index([name])
}
```

- [ ] **Step 6: Run the first migration against the dev database**

```bash
npx dotenv -e .env -- npx prisma migrate dev --name init
```

Expected: output ends with `Your database is now in sync with your schema.` and creates `prisma/migrations/<timestamp>_init/migration.sql`.

- [ ] **Step 7: Push the same schema to the test database**

```bash
npm run db:push:test
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 8: Commit**

```bash
git add docker-compose.override.yml docker-compose.test.yml prisma .env.example
git commit -m "Add Postgres (dev+test) and Prisma schema"
```

---

### Task 3: Password hashing and email normalization

**Files:**
- Create: `src/lib/password.ts`
- Test: `tests/lib/password.test.ts`
- Create: `vitest.config.ts`, `tests/setup.ts`

- [ ] **Step 1: Create the Vitest config and global setup**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    hookTimeout: 30000,
  },
});
```

`tests/setup.ts`:

```ts
import { afterEach } from "vitest";
import { prisma } from "@/lib/prisma";

afterEach(async () => {
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
});
```

- [ ] **Step 2: Create the Prisma client singleton (needed by the setup file)**

`src/lib/prisma.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 3: Write the failing test**

`tests/lib/password.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("hashPassword / verifyPassword", () => {
  it("produces a hash that verifies against the original password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    const valid = await verifyPassword("correct-horse-battery-staple", hash);
    expect(valid).toBe(true);
  });

  it("rejects an incorrect password against a hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    const valid = await verifyPassword("wrong-password", hash);
    expect(valid).toBe(false);
  });

  it("produces a different hash each time (salted)", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    expect(hash1).not.toBe(hash2);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- tests/lib/password.test.ts`
Expected: FAIL — `Cannot find module '@/lib/password'` (or similar "not defined").

- [ ] **Step 5: Implement**

`src/lib/password.ts`:

```ts
import bcrypt from "bcryptjs";

// bcryptjs (pure JS) avoids native-binding rebuilds across Docker base images.
const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- tests/lib/password.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts tests/setup.ts src/lib/prisma.ts src/lib/password.ts tests/lib/password.test.ts
git commit -m "Add password hashing utilities"
```

---

### Task 4: Validation schemas

**Files:**
- Create: `src/lib/validation.ts`
- Test: `tests/lib/validation.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/lib/validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { registerSchema, onboardingSchema, normalizeEmail } from "@/lib/validation";

describe("normalizeEmail", () => {
  it("lowercases and trims the email", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
  });
});

describe("registerSchema", () => {
  it("accepts a valid email and an 8+ character password", () => {
    const result = registerSchema.safeParse({ email: "user@example.com", password: "longenough" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ email: "not-an-email", password: "longenough" });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({ email: "user@example.com", password: "short" });
    expect(result.success).toBe(false);
  });

  it("normalizes email casing and whitespace", () => {
    const result = registerSchema.safeParse({ email: "  User@Example.COM  ", password: "longenough" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });
});

describe("onboardingSchema", () => {
  const validInput = {
    firstName: "Ada",
    lastName: "Lovelace",
    department: "Engineering",
    position: "Product manager",
    companyName: "Acme inc",
  };

  it("accepts a fully filled form", () => {
    expect(onboardingSchema.safeParse(validInput).success).toBe(true);
  });

  it.each(["firstName", "lastName", "department", "position", "companyName"])(
    "rejects when %s is empty",
    (field) => {
      const result = onboardingSchema.safeParse({ ...validInput, [field]: "" });
      expect(result.success).toBe(false);
    }
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/lib/validation.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validation'`

- [ ] **Step 3: Implement**

`src/lib/validation.ts`:

```ts
import { z } from "zod";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

export const onboardingSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  department: z.string().trim().min(1),
  position: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/lib/validation.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts tests/lib/validation.test.ts
git commit -m "Add register/onboarding validation schemas"
```

---

### Task 5: CSRF same-origin check

**Files:**
- Create: `src/lib/origin.ts`
- Test: `tests/lib/origin.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/lib/origin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/origin";

function makeRequest(origin: string | null) {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new NextRequest("http://localhost:3000/api/register", {
    method: "POST",
    headers,
  });
}

describe("assertSameOrigin", () => {
  it("allows a request with a matching origin", () => {
    expect(assertSameOrigin(makeRequest("http://localhost:3000"))).toBeNull();
  });

  it("allows a request with no origin header", () => {
    expect(assertSameOrigin(makeRequest(null))).toBeNull();
  });

  it("rejects a request with a mismatched origin", () => {
    const result = assertSameOrigin(makeRequest("http://evil.example.com"));
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/lib/origin.test.ts`
Expected: FAIL — `Cannot find module '@/lib/origin'`

- [ ] **Step 3: Implement**

`src/lib/origin.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

export function assertSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin) {
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  }

  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/lib/origin.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/origin.ts tests/lib/origin.test.ts
git commit -m "Add CSRF same-origin check for custom API routes"
```

---

### Task 6: Login logic and Auth.js configuration

**Files:**
- Create: `src/lib/authenticateUser.ts`
- Test: `tests/lib/authenticateUser.test.ts`
- Create: `src/auth.ts`, `src/types/next-auth.d.ts`, `src/app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Write the failing test for login logic**

`tests/lib/authenticateUser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { authenticateUser } from "@/lib/authenticateUser";

async function createUser(email: string, password: string) {
  return prisma.user.create({ data: { email, passwordHash: await hashPassword(password) } });
}

describe("authenticateUser", () => {
  it("returns the user when the password is correct", async () => {
    await createUser("login1@example.com", "correcthorse");
    const result = await authenticateUser("login1@example.com", "correcthorse");
    expect(result?.email).toBe("login1@example.com");
  });

  it("returns null for an incorrect password", async () => {
    await createUser("login2@example.com", "correcthorse");
    const result = await authenticateUser("login2@example.com", "wrongpassword");
    expect(result).toBeNull();
  });

  it("returns null for an unknown email", async () => {
    const result = await authenticateUser("nobody@example.com", "whatever1");
    expect(result).toBeNull();
  });

  it("matches an email regardless of casing", async () => {
    await createUser("login3@example.com", "correcthorse");
    const result = await authenticateUser("Login3@Example.com", "correcthorse");
    expect(result?.email).toBe("login3@example.com");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/lib/authenticateUser.test.ts`
Expected: FAIL — `Cannot find module '@/lib/authenticateUser'`

- [ ] **Step 3: Implement**

`src/lib/authenticateUser.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { normalizeEmail } from "@/lib/validation";

export type AuthenticatedUser = {
  id: string;
  email: string;
  onboardingComplete: boolean;
  companyId: string | null;
};

export async function authenticateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
  const normalized = normalizeEmail(email);
  if (!normalized || !password) return null;

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    onboardingComplete: user.onboardingComplete,
    companyId: user.companyId,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/lib/authenticateUser.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the type augmentation**

`src/types/next-auth.d.ts`:

```ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      onboardingComplete: boolean;
      companyId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    onboardingComplete: boolean;
    companyId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    onboardingComplete?: boolean;
    companyId?: string | null;
  }
}
```

- [ ] **Step 6: Create the Auth.js config**

`src/auth.ts`:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateUser } from "@/lib/authenticateUser";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Not deployed on Vercel — Auth.js only auto-trusts the host there.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        return authenticateUser(String(credentials?.email ?? ""), String(credentials?.password ?? ""));
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.onboardingComplete = (user as { onboardingComplete: boolean }).onboardingComplete;
        token.companyId = (user as { companyId: string | null }).companyId ?? null;
      }
      if (trigger === "update" && session) {
        if (typeof session.onboardingComplete === "boolean") {
          token.onboardingComplete = session.onboardingComplete;
        }
        if ("companyId" in session) {
          token.companyId = session.companyId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.onboardingComplete = Boolean(token.onboardingComplete);
      session.user.companyId = (token.companyId as string | null) ?? null;
      return session;
    },
  },
});
```

- [ ] **Step 7: Create the Auth.js route handler**

`src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/authenticateUser.ts tests/lib/authenticateUser.test.ts src/auth.ts src/types/next-auth.d.ts "src/app/api/auth/[...nextauth]/route.ts"
git commit -m "Add login logic and configure Auth.js with JWT sessions"
```

---

### Task 7: POST /api/register

**Files:**
- Create: `src/app/api/register/route.ts`
- Test: `tests/api/register.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/api/register.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/register/route";
import { prisma } from "@/lib/prisma";

function makeRequest(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/register", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("POST /api/register", () => {
  it("creates a user with a hashed password", async () => {
    const response = await POST(makeRequest({ email: "new@example.com", password: "longenough" }));
    expect(response.status).toBe(201);

    const user = await prisma.user.findUnique({ where: { email: "new@example.com" } });
    expect(user).not.toBeNull();
    expect(user?.passwordHash).not.toBe("longenough");
    expect(user?.onboardingComplete).toBe(false);
  });

  it("rejects a duplicate email, case-insensitively", async () => {
    await POST(makeRequest({ email: "dup@example.com", password: "longenough" }));
    const response = await POST(makeRequest({ email: "DUP@Example.com", password: "anotherpass" }));
    expect(response.status).toBe(409);

    const users = await prisma.user.findMany({ where: { email: "dup@example.com" } });
    expect(users).toHaveLength(1);
  });

  it("rejects invalid input", async () => {
    const response = await POST(makeRequest({ email: "not-an-email", password: "short" }));
    expect(response.status).toBe(400);
  });

  it("rejects a mismatched origin", async () => {
    const response = await POST(
      makeRequest({ email: "csrf@example.com", password: "longenough" }, "http://evil.example.com")
    );
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/api/register.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/register/route'`

- [ ] **Step 3: Implement**

`src/app/api/register/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validation";
import { assertSameOrigin } from "@/lib/origin";

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email and a password with at least 8 characters." },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash } });

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/api/register.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/register/route.ts tests/api/register.test.ts
git commit -m "Add POST /api/register"
```

---

### Task 8: POST /api/onboarding

**Files:**
- Create: `src/app/api/onboarding/route.ts`
- Test: `tests/api/onboarding.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/api/onboarding.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { auth } from "@/auth";
import { POST } from "@/app/api/onboarding/route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

function makeRequest(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

async function createUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: await hashPassword("longenough") },
  });
}

const validInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  department: "Engineering",
  position: "Product manager",
  companyName: "Acme inc",
};

describe("POST /api/onboarding", () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const response = await POST(makeRequest(validInput));
    expect(response.status).toBe(401);
  });

  it("rejects missing fields", async () => {
    const user = await createUser("onboard1@example.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);
    const response = await POST(makeRequest({ ...validInput, position: "" }));
    expect(response.status).toBe(400);
  });

  it("creates a new company and completes onboarding", async () => {
    const user = await createUser("onboard2@example.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);

    const response = await POST(makeRequest(validInput));
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.onboardingComplete).toBe(true);
    expect(updated?.firstName).toBe("Ada");

    const company = await prisma.company.findFirst({ where: { name: "Acme inc" } });
    expect(company).not.toBeNull();
    expect(updated?.companyId).toBe(company?.id);
  });

  it("joins an existing company matched case-insensitively instead of creating a duplicate", async () => {
    const existing = await prisma.company.create({ data: { name: "Acme Inc" } });
    const user = await createUser("onboard3@example.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);

    const response = await POST(makeRequest({ ...validInput, companyName: "acme inc" }));
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.companyId).toBe(existing.id);

    const companies = await prisma.company.findMany({
      where: { name: { equals: "Acme Inc", mode: "insensitive" } },
    });
    expect(companies).toHaveLength(1);
  });

  it("rejects a mismatched origin", async () => {
    const user = await createUser("onboard4@example.com");
    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);
    const response = await POST(makeRequest(validInput, "http://evil.example.com"));
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/api/onboarding.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/onboarding/route'`

- [ ] **Step 3: Implement**

`src/app/api/onboarding/route.ts`:

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

  const { firstName, lastName, department, position, companyName } = parsed.data;

  const existingCompany = await prisma.company.findFirst({
    where: { name: { equals: companyName, mode: "insensitive" } },
  });
  const company = existingCompany ?? (await prisma.company.create({ data: { name: companyName } }));

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      firstName,
      lastName,
      department,
      position,
      companyId: company.id,
      onboardingComplete: true,
    },
  });

  return NextResponse.json({ companyId: company.id }, { status: 200 });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/api/onboarding.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/onboarding/route.ts tests/api/onboarding.test.ts
git commit -m "Add POST /api/onboarding with company match-or-create"
```

---

### Task 9: Middleware route protection

**Files:**
- Create: `src/middleware.ts`
- Test: `tests/middleware.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/middleware.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluateGate } from "@/middleware";

describe("evaluateGate", () => {
  it("allows public paths through with no session", () => {
    expect(evaluateGate("/login", null)).toBeNull();
    expect(evaluateGate("/register", null)).toBeNull();
    expect(evaluateGate("/register/success", null)).toBeNull();
    expect(evaluateGate("/api/health", null)).toBeNull();
  });

  it("redirects an unauthenticated user hitting a protected path to /login", () => {
    expect(evaluateGate("/workspace", null)).toBe("/login");
  });

  it("redirects an authenticated user who hasn't finished onboarding to /onboarding", () => {
    expect(evaluateGate("/workspace", { onboardingComplete: false })).toBe("/onboarding");
  });

  it("does not redirect an authenticated, onboarded user", () => {
    expect(evaluateGate("/workspace", { onboardingComplete: true })).toBeNull();
  });

  it("does not redirect a user with incomplete onboarding away from /onboarding itself", () => {
    expect(evaluateGate("/onboarding", { onboardingComplete: false })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/middleware.test.ts`
Expected: FAIL — `Cannot find module '@/middleware'`

- [ ] **Step 3: Implement**

`src/middleware.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = ["/login", "/register", "/register/success", "/api/auth", "/api/register", "/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function evaluateGate(
  pathname: string,
  session: { onboardingComplete?: boolean } | null
): string | null {
  if (isPublicPath(pathname)) return null;
  if (!session) return "/login";
  if (pathname !== "/onboarding" && !session.onboardingComplete) return "/onboarding";
  return null;
}

export default auth((req) => {
  const redirectPath = evaluateGate(req.nextUrl.pathname, req.auth?.user ?? null);
  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/middleware.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts tests/middleware.test.ts
git commit -m "Add middleware route protection and onboarding gate"
```

---

### Task 10: Health check endpoint

**Files:**
- Create: `src/app/api/health/route.ts`
- Test: `tests/api/health.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/api/health.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns ok when the database is reachable", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/api/health.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/health/route'`

- [ ] **Step 3: Implement**

`src/app/api/health/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await prisma.$queryRaw`SELECT 1`;
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/api/health.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/health/route.ts tests/api/health.test.ts
git commit -m "Add /api/health endpoint for container healthchecks"
```

---

### Task 11: UI pages

**Files:**
- Create: `src/app/providers.tsx`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/app/register/page.tsx`, `src/app/register/success/page.tsx`, `src/app/login/page.tsx`, `src/app/onboarding/page.tsx`, `src/app/workspace/page.tsx`

No TDD here — this reproduces the already-approved clickable prototype as real pages wired to the API routes built above. Verify manually in the browser at the end (Step 9).

- [ ] **Step 1: Add the SessionProvider wrapper**

`src/app/providers.tsx`:

```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Step 2: Wire it into the root layout, and redirect "/" to the workspace**

`src/app/layout.tsx`:

```tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/workspace");
}
```

- [ ] **Step 3: Register page**

`src/app/register/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          onChange={(e) => setEmail(e.target.value)}
          required
        />
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
        <button type="submit" disabled={submitting}>
          Create account
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Registration success screen**

`src/app/register/success/page.tsx`:

```tsx
import Link from "next/link";

export default function RegisterSuccessPage() {
  return (
    <main>
      <h1>Account created</h1>
      <p>Next, set up your profile and company.</p>
      <Link href="/onboarding">Continue</Link>
    </main>
  );
}
```

- [ ] **Step 5: Login page**

`src/app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

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
    <main>
      <h1>Log in</h1>
      <p>Welcome back.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          Log in
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Onboarding page (fields stacked vertically, placeholder in every input, matching the approved prototype)**

`src/app/onboarding/page.tsx`:

```tsx
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
```

- [ ] **Step 7: Workspace placeholder page, with logout**

`src/app/workspace/page.tsx`:

```tsx
"use client";

import { signOut } from "next-auth/react";

export default function WorkspacePage() {
  return (
    <main>
      <h1>Your workspace</h1>
      <p>Personal workspace — coming in a later phase.</p>
      <button onClick={() => signOut({ callbackUrl: "/login" })}>Log out</button>
    </main>
  );
}
```

- [ ] **Step 8: Run the full test suite (nothing UI-related should have broken anything wired to `/lib` or `/api`)**

Run: `npm test`
Expected: all prior tests still PASS.

- [ ] **Step 9: Manual browser verification**

```bash
npm run dev
```

In a browser:
1. Visit `http://localhost:3000` → redirected to `/login` (no session yet).
2. Go to `/register`, submit a new email + 8+ char password → redirected to `/register/success`.
3. Click **Continue** → `/onboarding`, fields are stacked vertically with placeholders. Click **Finish** with empty fields → inline "This field is required." errors appear and you stay on the page. Fill all fields, click **Finish** → redirected to `/workspace`.
4. Click **Log out** → redirected to `/login`.
5. Log back in with the same email/password → redirected straight to `/workspace` (onboarding not re-shown, since it's already complete).

Stop the dev server (Ctrl+C) when done.

- [ ] **Step 10: Commit**

```bash
git add src/app
git commit -m "Add register, login, onboarding, and workspace pages"
```

---

### Task 12: Docker packaging and deployment

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `Caddyfile`
- Modify: `docker-compose.override.yml` (add the `app` service for dev)

- [ ] **Step 1: Create the multi-stage Dockerfile**

`Dockerfile`:

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma

FROM base AS dev
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS builder
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS deps-prod
RUN npm ci --omit=dev
RUN npx prisma generate

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
```

Note: `public/` doesn't exist yet in this project — create an empty `public/.gitkeep` so the `COPY --from=builder /app/public ./public` line has something to copy:

```bash
mkdir -p public && touch public/.gitkeep
```

- [ ] **Step 2: Create the production Compose file**

`docker-compose.yml`:

```yaml
services:
  app:
    build:
      context: .
      target: runner
    restart: unless-stopped
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - internal

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - internal

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMAIN: ${DOMAIN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on:
      app:
        condition: service_healthy
    networks:
      - internal

networks:
  internal:

volumes:
  postgres_data:
  caddy_data:
```

- [ ] **Step 3: Create the Caddyfile**

`Caddyfile`:

```
{$DOMAIN} {
  reverse_proxy app:3000
}
```

- [ ] **Step 4: Add the dev `app` service to the override file**

Update `docker-compose.override.yml` to:

```yaml
services:
  app:
    build:
      context: .
      target: dev
    command: npm run dev
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - ./:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: flowline
      POSTGRES_PASSWORD: flowline
      POSTGRES_DB: flowline
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

- [ ] **Step 5: Verify the dev stack builds and runs through Docker (not just `npm run dev`)**

Stop any locally-running Postgres container from Task 2 first, since the compose stack now manages it:

```bash
docker compose -f docker-compose.override.yml down
docker compose up app postgres --build
```

Expected: both containers start; `app` logs show the Next.js dev server ready message. Visit `http://localhost:3000/api/health` → `{"status":"ok"}`. Stop with Ctrl+C, then `docker compose down`.

- [ ] **Step 6: Verify the production image builds**

```bash
docker compose build app
```

Expected: build succeeds through the `runner` stage with no errors.

- [ ] **Step 7: Generate a real production `AUTH_SECRET` (do this on the external server, not in git)**

The `.env` used in Task 2 has a placeholder dev secret — that's fine for local dev, but the actual external-server deployment needs a real one. On the server, after copying the repo and `.env.example` to `.env`:

```bash
openssl rand -base64 32
```

Paste the output as `AUTH_SECRET` in the server's `.env`. Also set real values there for `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` (pointing at the `postgres` service, e.g. `postgresql://<user>:<password>@postgres:5432/<db>`), and `DOMAIN` (the real domain Caddy should request a TLS cert for).

- [ ] **Step 8: Document the Postgres backup command (manual for this phase, not scheduled)**

Add this section to the end of `docker-compose.yml` as a comment, so the command lives next to the volume it backs up:

```yaml
# Manual backup (run from the host, with the stack up):
#   docker compose exec -T postgres pg_dump -U ${POSTGRES_USER} ${POSTGRES_DB} > backup-$(date +%F).sql
# Restore:
#   docker compose exec -T postgres psql -U ${POSTGRES_USER} ${POSTGRES_DB} < backup-YYYY-MM-DD.sql
# Scheduled/automated backups are out of scope for this phase.
```

- [ ] **Step 9: Commit**

```bash
git add Dockerfile docker-compose.yml docker-compose.override.yml Caddyfile public/.gitkeep
git commit -m "Add Docker packaging: dev/prod Compose files, Dockerfile, Caddy reverse proxy"
```

---

### Task 13: Final verification

- [ ] **Step 1: Bring up dev Postgres and test Postgres again (in case they were stopped in Task 12)**

```bash
docker compose up -d postgres
docker compose -f docker-compose.test.yml up -d postgres-test
```

- [ ] **Step 2: Run the full automated test suite**

Run: `npm test`
Expected: all test files PASS — `password.test.ts`, `validation.test.ts`, `origin.test.ts`, `register.test.ts`, `onboarding.test.ts`, `health.test.ts`, `middleware.test.ts`.

- [ ] **Step 3: Re-run the manual browser walkthrough from Task 11, Step 9, this time via the Dockerized dev stack**

```bash
docker compose up app postgres --build
```

Repeat the register → success → onboarding (empty-submit validation, then filled) → workspace → logout → login walkthrough in the browser. Then `docker compose down`.

- [ ] **Step 4: Confirm nothing sensitive is committed**

```bash
git status
git log --oneline -1
```

Expected: working tree clean, `.env` and `.env.test` are not tracked (`git status` should not list them, and `git check-ignore .env .env.test` should print both paths).

- [ ] **Step 5: Final commit if any stray changes remain**

```bash
git add -A
git commit -m "Finish foundation auth & onboarding phase"
```

(Skip this step if `git status` is already clean.)
