-- Migration: Add project_id to tasks table
-- This migration adds the ability to associate tasks with projects

-- Add project_id column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id BIGINT;

-- Create index on project_id for queries
CREATE INDEX IF NOT EXISTS index_tasks_on_project_id ON tasks(project_id);

-- Add foreign key constraint to projects table
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- Create index on task_list_id if it doesn't exist (this was already in Rails schema)
CREATE INDEX IF NOT EXISTS index_tasks_on_task_list_id ON tasks(task_list_id);

-- Add comment for documentation
COMMENT ON COLUMN tasks.project_id IS 'Optional association to a project. NULL if task is not associated with a project.';
