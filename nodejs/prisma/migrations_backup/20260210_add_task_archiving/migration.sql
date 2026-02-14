-- Migration: Add task archiving fields
-- Adds archived, archivedAt, archiveScheduled, and archiveScheduledAt fields to tasks table
-- Also adds index for efficient archive queries

-- Add archiving fields to tasks table
ALTER TABLE "tasks" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tasks" ADD COLUMN "archived_at" TIMESTAMP;
ALTER TABLE "tasks" ADD COLUMN "archive_scheduled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tasks" ADD COLUMN "archive_scheduled_at" TIMESTAMP;

-- Create index for efficient archive queries
CREATE INDEX "index_tasks_on_archived_and_board" ON "tasks"("archived", "board_id", "completed_at");
