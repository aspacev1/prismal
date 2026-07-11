// Applies pending Prisma migrations, but only on a Vercel Production build.
// Preview deployments (one per PR/branch) typically share the same
// DATABASE_URL as production — running `prisma migrate deploy` there would
// apply schema changes to the live database as soon as a branch is pushed,
// before the PR is reviewed or merged. Gating on VERCEL_ENV keeps migrations
// tied to what actually reaches production.
const { execSync } = require("child_process");

const vercelEnv = process.env.VERCEL_ENV;

if (vercelEnv === "production") {
  console.log("[build] VERCEL_ENV=production — applying pending Prisma migrations...");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log(
    `[build] VERCEL_ENV=${vercelEnv ?? "unset"} — skipping prisma migrate deploy (only runs on Production).`
  );
}
