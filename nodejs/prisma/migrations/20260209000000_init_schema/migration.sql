-- Migration: Initialize complete schema matching Rails
-- This ensures all tables exist for the Node.js backend

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email_address VARCHAR(255) NOT NULL UNIQUE,
  password_digest VARCHAR(255),
  provider VARCHAR(255),
  uid VARCHAR(255),
  admin BOOLEAN DEFAULT FALSE NOT NULL,
  agent_auto_mode BOOLEAN DEFAULT TRUE NOT NULL,
  agent_name VARCHAR(255),
  agent_emoji VARCHAR(255),
  agent_last_active_at TIMESTAMP,
  avatar_url VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_users_on_email_address ON users(email_address);
CREATE UNIQUE INDEX IF NOT EXISTS index_users_on_provider_and_uid ON users(provider, uid) WHERE provider IS NOT NULL;

-- API Tokens table
CREATE TABLE IF NOT EXISTS api_tokens (
  id BIGSERIAL PRIMARY KEY,
  token VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_api_tokens_on_user_id ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS index_api_tokens_on_token ON api_tokens(token);

-- Boards table
CREATE TABLE IF NOT EXISTS boards (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  icon VARCHAR(255) DEFAULT '📋',
  color VARCHAR(255) DEFAULT 'gray',
  position INTEGER DEFAULT 0 NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_boards_on_user_id ON boards(user_id);
CREATE INDEX IF NOT EXISTS index_boards_on_user_id_and_position ON boards(user_id, position);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255),
  description TEXT,
  status INTEGER DEFAULT 0 NOT NULL,
  priority INTEGER DEFAULT 0 NOT NULL,
  position INTEGER,
  original_position INTEGER,
  board_id BIGINT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  completed BOOLEAN DEFAULT FALSE NOT NULL,
  completed_at TIMESTAMP,
  due_date DATE,
  tags VARCHAR(255)[] DEFAULT '{}' NOT NULL,
  blocked BOOLEAN DEFAULT FALSE NOT NULL,
  assigned_to_agent BOOLEAN DEFAULT FALSE NOT NULL,
  assigned_at TIMESTAMP,
  agent_claimed_at TIMESTAMP,
  confidence INTEGER DEFAULT 0 NOT NULL,
  effort INTEGER DEFAULT 0 NOT NULL,
  impact INTEGER DEFAULT 0 NOT NULL,
  reach INTEGER DEFAULT 0 NOT NULL,
  task_list_id BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_tasks_on_board_id ON tasks(board_id);
CREATE INDEX IF NOT EXISTS index_tasks_on_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS index_tasks_on_status ON tasks(status);
CREATE INDEX IF NOT EXISTS index_tasks_on_position ON tasks(position);
CREATE INDEX IF NOT EXISTS index_tasks_on_assigned_to_agent ON tasks(assigned_to_agent);
CREATE INDEX IF NOT EXISTS index_tasks_on_blocked ON tasks(blocked);

-- Task Activities table
CREATE TABLE IF NOT EXISTS task_activities (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  actor_type VARCHAR(255),
  actor_name VARCHAR(255),
  actor_emoji VARCHAR(255),
  field_name VARCHAR(255),
  old_value VARCHAR(255),
  new_value VARCHAR(255),
  note TEXT,
  source VARCHAR(255) DEFAULT 'web',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_task_activities_on_task_id ON task_activities(task_id);
CREATE INDEX IF NOT EXISTS index_task_activities_on_task_id_and_created_at ON task_activities(task_id, created_at);
CREATE INDEX IF NOT EXISTS index_task_activities_on_user_id ON task_activities(user_id);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(255),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_sessions_on_user_id ON sessions(user_id);

-- Projects table (legacy, kept for compatibility)
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255),
  description TEXT,
  inbox BOOLEAN DEFAULT FALSE NOT NULL,
  position INTEGER,
  prioritization_method INTEGER DEFAULT 0 NOT NULL,
  user_id BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_projects_on_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS index_projects_on_user_id_and_position ON projects(user_id, position) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS index_projects_on_user_id_inbox_unique ON projects(user_id, inbox) WHERE inbox = TRUE;
CREATE INDEX IF NOT EXISTS index_projects_on_position ON projects(position);

-- Task Lists table (legacy)
CREATE TABLE IF NOT EXISTS task_lists (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255),
  position INTEGER,
  project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_task_lists_on_project_id ON task_lists(project_id);
CREATE INDEX IF NOT EXISTS index_task_lists_on_user_id ON task_lists(user_id);
CREATE INDEX IF NOT EXISTS index_task_lists_on_position ON task_lists(position);

-- Tags table (legacy)
CREATE TABLE IF NOT EXISTS tags (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(255) DEFAULT 'gray' NOT NULL,
  position INTEGER,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_tags_on_project_id ON tags(project_id);
CREATE INDEX IF NOT EXISTS index_tags_on_user_id ON tags(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS index_tags_on_project_id_and_name ON tags(project_id, name);

-- Task Tags join table (legacy)
CREATE TABLE IF NOT EXISTS task_tags (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, tag_id)
);

CREATE INDEX IF NOT EXISTS index_task_tags_on_task_id ON task_tags(task_id);
CREATE INDEX IF NOT EXISTS index_task_tags_on_tag_id ON task_tags(tag_id);
CREATE UNIQUE INDEX IF NOT EXISTS index_task_tags_on_task_id_and_tag_id ON task_tags(task_id, tag_id);

-- Active Storage Blobs table
CREATE TABLE IF NOT EXISTS active_storage_blobs (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL UNIQUE,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(255),
  metadata TEXT,
  byte_size BIGINT NOT NULL,
  checksum VARCHAR(255),
  service_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Active Storage Attachments table
CREATE TABLE IF NOT EXISTS active_storage_attachments (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  record_type VARCHAR(255) NOT NULL,
  record_id BIGINT NOT NULL,
  blob_id BIGINT NOT NULL REFERENCES active_storage_blobs(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(record_type, record_id, name, blob_id)
);

-- Active Storage Variant Records table
CREATE TABLE IF NOT EXISTS active_storage_variant_records (
  id BIGSERIAL PRIMARY KEY,
  blob_id BIGINT NOT NULL REFERENCES active_storage_blobs(id) ON DELETE CASCADE,
  variation_digest VARCHAR(255) NOT NULL,
  UNIQUE(blob_id, variation_digest)
);

-- Create indexes for Active Storage
CREATE INDEX IF NOT EXISTS index_active_storage_blobs_on_key ON active_storage_blobs(key);
CREATE INDEX IF NOT EXISTS index_active_storage_attachments_on_blob_id ON active_storage_attachments(blob_id);
CREATE UNIQUE INDEX IF NOT EXISTS index_active_storage_variant_records_uniqueness
  ON active_storage_variant_records(blob_id, variation_digest);

-- Solid Cable for WebSocket
CREATE TABLE IF NOT EXISTS solid_cable_messages (
  id BIGSERIAL PRIMARY KEY,
  channel BYTEA NOT NULL,
  channel_hash BIGINT NOT NULL,
  payload BYTEA NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_solid_cable_messages_on_channel ON solid_cable_messages(channel);
CREATE INDEX IF NOT EXISTS index_solid_cable_messages_on_channel_hash ON solid_cable_messages(channel_hash);
CREATE INDEX IF NOT EXISTS index_solid_cable_messages_on_created_at ON solid_cable_messages(created_at);

-- Workflows table
CREATE TABLE IF NOT EXISTS workflows (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_workflows_on_id ON workflows(id);

-- Workflow Steps table
CREATE TABLE IF NOT EXISTS workflow_steps (
  id BIGSERIAL PRIMARY KEY,
  workflow_id BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_id VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  agent_id VARCHAR(255) NOT NULL,
  input_template TEXT NOT NULL,
  expects TEXT NOT NULL,
  type VARCHAR(255) DEFAULT 'single',
  loop_config JSONB,
  position INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(workflow_id, step_id)
);

CREATE INDEX IF NOT EXISTS index_workflow_steps_on_workflow_id ON workflow_steps(workflow_id);
CREATE UNIQUE INDEX IF NOT EXISTS index_workflow_steps_on_workflow_id_and_step_id ON workflow_steps(workflow_id, step_id);

-- Runs table
CREATE TABLE IF NOT EXISTS runs (
  id VARCHAR(255) PRIMARY KEY,
  workflow_id BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  task_id VARCHAR(255),
  task TEXT,
  status VARCHAR(255) DEFAULT 'running',
  context TEXT,
  notify_url VARCHAR(255),
  awaiting_approval INTEGER,
  awaiting_approval_since TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_runs_on_workflow_id ON runs(workflow_id);
CREATE INDEX IF NOT EXISTS index_runs_on_task_id ON runs(task_id);
CREATE INDEX IF NOT EXISTS index_runs_on_status ON runs(status);

-- Steps table
CREATE TABLE IF NOT EXISTS steps (
  id VARCHAR(255) PRIMARY KEY,
  run_id VARCHAR(255) NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id VARCHAR(255) NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  step_index INTEGER NOT NULL,
  input_template VARCHAR(255) NOT NULL,
  expects TEXT NOT NULL,
  status VARCHAR(255) DEFAULT 'waiting',
  output TEXT,
  retry_count INTEGER DEFAULT 0 NOT NULL,
  max_retries INTEGER DEFAULT 3 NOT NULL,
  type VARCHAR(255),
  loop_config TEXT,
  current_story_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_steps_on_run_id ON steps(run_id);
CREATE INDEX IF NOT EXISTS index_steps_on_status ON steps(status);

-- Stories table
CREATE TABLE IF NOT EXISTS stories (
  id VARCHAR(255) PRIMARY KEY,
  run_id VARCHAR(255) NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  story_index INTEGER NOT NULL,
  story_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  acceptance_criteria TEXT,
  status VARCHAR(255) DEFAULT 'pending',
  output TEXT,
  retry_count INTEGER DEFAULT 0 NOT NULL,
  max_retries INTEGER DEFAULT 3 NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS index_stories_on_run_id ON stories(run_id);
CREATE INDEX IF NOT EXISTS index_stories_on_status ON stories(status);
