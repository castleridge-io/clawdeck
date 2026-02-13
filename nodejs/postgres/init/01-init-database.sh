#!/bin/bash
# Initialize ClawDeck database with extensions

echo "🔧 Initializing ClawDeck database..."

# Connect to database and run initialization
psql -v ON_ERROR_STOP=0 -U clawdeck -d "$POSTGRES_DB" << 'EOSQL'
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create migration tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS _clawdeck_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance (will succeed after Prisma creates tables)
-- Using DO blocks to handle missing tables gracefully
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
        CREATE INDEX IF NOT EXISTS idx_tasks_status_board ON tasks(status, board_id) WHERE status IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_to_agent) WHERE assigned_to_agent = true;
        CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_activities') THEN
        CREATE INDEX IF NOT EXISTS idx_task_activities_created_at ON task_activities(created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_tokens') THEN
        CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);
    END IF;
END $$;

-- Log initialization
INSERT INTO _clawdeck_migrations (version, applied_at)
VALUES ('001_initial_setup', NOW())
ON CONFLICT (version) DO NOTHING;

EOSQL

echo "✅ Database initialized successfully"
