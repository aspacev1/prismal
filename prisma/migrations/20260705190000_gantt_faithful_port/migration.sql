-- Add User.avatarColor
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarColor" TEXT;

-- Task schema changes: replace endDate with duration-based model
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "durationDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "originalEndDate" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "loggedHours" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- Backfill durationDays + originalEndDate from existing startDate/endDate
-- (working-day duration; for simplicity use calendar-day count as fallback)
UPDATE "Task"
SET "durationDays" = GREATEST(CASE
    WHEN "startDate" IS NOT NULL AND "endDate" IS NOT NULL
    THEN EXTRACT(DAY FROM ("endDate" - "startDate"))::int + 1
    ELSE 1
END, 1),
"originalEndDate" = "endDate"
WHERE "durationDays" = 1 AND "startDate" IS NOT NULL;

-- Migrate old statuses to reference enum
UPDATE "Task" SET "status" = 'todo'        WHERE "status" = 'NOT_STARTED';
UPDATE "Task" SET "status" = 'in_progress' WHERE "status" = 'IN_PROGRESS';
UPDATE "Task" SET "status" = 'completed'   WHERE "status" = 'COMPLETED';
UPDATE "Task" SET "status" = 'delayed'     WHERE "status" = 'ON_HOLD';
UPDATE "Task" SET "status" = 'todo'        WHERE "status" NOT IN ('todo','in_progress','in_review','delayed','blocked','completed','archived');

-- Change default status to 'todo'
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'todo';

-- Add createdById FK to User (nullable for legacy rows)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_createdById_fkey') THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Drop endDate column (duration-based now)
ALTER TABLE "Task" DROP COLUMN IF EXISTS "endDate";

-- TaskHistory table
CREATE TABLE IF NOT EXISTS "TaskHistory" (
    "id"          TEXT NOT NULL,
    "taskId"      TEXT NOT NULL,
    "field"       TEXT NOT NULL,
    "oldValue"    TEXT,
    "newValue"    TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TaskHistory_taskId_changedAt_idx"
    ON "TaskHistory"("taskId", "changedAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskHistory_taskId_fkey') THEN
    ALTER TABLE "TaskHistory" ADD CONSTRAINT "TaskHistory_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskHistory_changedById_fkey') THEN
    ALTER TABLE "TaskHistory" ADD CONSTRAINT "TaskHistory_changedById_fkey"
      FOREIGN KEY ("changedById") REFERENCES "User"("id");
  END IF;
END $$;