-- Task.scheduleStatus: "estimated" | "confirmed" | "unscheduled".
-- "estimated" = dates were guessed by the system at creation (ghost bar),
-- "confirmed" = dates were chosen by a user, "unscheduled" = deliberately
-- parked in the backlog with no dates. Existing planned tasks are treated as
-- confirmed; existing dateless/zero-duration tasks become unscheduled (they
-- already rendered without a bar and now live in the backlog panel).
ALTER TABLE "Task" ADD COLUMN "scheduleStatus" TEXT NOT NULL DEFAULT 'confirmed';

UPDATE "Task"
SET "scheduleStatus" = 'unscheduled'
WHERE "kind" = 'task'
  AND ("startDate" IS NULL OR "durationDays" <= 0);
