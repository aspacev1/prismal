-- Existing rows predate the estimated/unscheduled states: any dates they have
-- were user-entered, so "confirmed" is the correct backfill for all of them.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "scheduleStatus" TEXT NOT NULL DEFAULT 'confirmed';
