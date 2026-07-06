CREATE TABLE IF NOT EXISTS "TaskComment" (
    "id"        TEXT NOT NULL,
    "taskId"    TEXT NOT NULL,
    "authorId"  TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "mentions"  TEXT[] NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TaskComment_taskId_createdAt_idx"
    ON "TaskComment"("taskId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskComment_taskId_fkey') THEN
    ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskComment_authorId_fkey') THEN
    ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id");
  END IF;
END $$;