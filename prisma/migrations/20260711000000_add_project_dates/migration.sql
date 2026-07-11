-- AlterTable
-- Project.startDate/endDate exist in schema.prisma and are written by
-- POST /api/projects/[id]/tasks (updates the earliest task start as a scroll
-- anchor) and read by the project page, but no prior migration ever added
-- these columns — creating any task with a start date would fail at runtime
-- with "column Project.startDate does not exist".
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
