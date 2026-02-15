-- Migration: Add project_id to tasks table
-- This migration adds the ability to associate tasks with projects

-- Add project_id column to tasks table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN project_id BIGINT;
  END IF;
END $$;

-- Create index on project_id for queries
CREATE INDEX IF NOT EXISTS index_tasks_on_project_id ON tasks(project_id);

-- Add foreign key constraint to projects table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tasks_project_id_fkey'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index on task_list_id if it doesn't exist (this was already in Rails schema)
CREATE INDEX IF NOT EXISTS index_tasks_on_task_list_id ON tasks(task_list_id);
