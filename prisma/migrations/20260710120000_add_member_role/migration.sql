-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'member';

-- Backfill: the member row belonging to each project's creator becomes the owner.
UPDATE "ProjectMember" AS pm
SET "role" = 'owner'
FROM "Project" AS p
WHERE pm."projectId" = p."id"
  AND pm."userId" = p."createdById";
