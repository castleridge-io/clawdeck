---
name: clawdeck
description: 'ClawDeck task management and workflow orchestration. Use for querying/claiming tasks, managing workflows, runs, steps, and stories. Agents can claim steps, report progress, and complete work.'
metadata:
  {
    'openclaw':
      { 'emoji': '📋', 'requires': { 'bins': ['curl', 'jq'], 'env': ['CLAWDECK_API_URL'] } },
  }
---

# ClawDeck Task & Workflow Management

## Quick Reference

**API URL**: `$CLAWDECK_API_URL` (default: http://localhost:3333/api/v1)

## Authentication

Two options - API Token (preferred) or Credentials:

### Option 1: API Token (Long-lived)

```bash
# In ~/.openclaw/.env
CLAWDECK_API_URL="http://localhost:3333/api/v1"
CLAWDECK_API_TOKEN="your-api-token-here"
```

### Option 2: Credentials (Auto-refresh JWT)

```bash
# In ~/.openclaw/.env
CLAWDECK_API_URL="http://localhost:3333/api/v1"
CLAWDECK_EMAIL="your-email@example.com"
CLAWDECK_PASSWORD="your-password"
```

## Get Auth Token Helper

If using credentials, call this first to get a fresh JWT:

```bash
# Get JWT token from credentials
CLAWDECK_AUTH_TOKEN=$(curl -s -X POST "$CLAWDECK_API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"emailAddress\":\"$CLAWDECK_EMAIL\",\"password\":\"$CLAWDECK_PASSWORD\"}" | jq -r '.token')

# Use CLAWDECK_AUTH_TOKEN if we got one, otherwise use CLAWDECK_API_TOKEN
CLAWDECK_TOKEN="${CLAWDECK_AUTH_TOKEN:-$CLAWDECK_API_TOKEN}"
```

## Register New User

```bash
# Register returns both JWT (token) and long-lived apiToken
curl -X POST "$CLAWDECK_API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"emailAddress":"agent@clawdeck.local","password":"your-password"}'
# Response: { "user": {...}, "token": "jwt-token", "apiToken": "64-char-hex-token" }
```

**Note:** Both `register` and `login` endpoints return an `apiToken` field containing a long-lived API token that can be stored and used for subsequent requests.

---

# Authentication Helper

## Get Fresh Token (run first)

```bash
# Authenticate and get token - use API token if available, otherwise login
if [ -n "$CLAWDECK_API_TOKEN" ]; then
  CLAWDECK_TOKEN="$CLAWDECK_API_TOKEN"
elif [ -n "$CLAWDECK_EMAIL" ] && [ -n "$CLAWDECK_PASSWORD" ]; then
  CLAWDECK_TOKEN=$(curl -s -X POST "$CLAWDECK_API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"emailAddress\":\"$CLAWDECK_EMAIL\",\"password\":\"$CLAWDECK_PASSWORD\"}" | jq -r '.token')
else
  echo "ERROR: Set CLAWDECK_API_TOKEN or CLAWDECK_EMAIL+CLAWDECK_PASSWORD"
  exit 1
fi

# Verify token works
curl -s "$CLAWDECK_API_URL/agents" -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.success'
```

---

# Task Management

## Query Tasks for Your Board

```bash
# Replace BOARD_ID with your board ID
curl -s "$CLAWDECK_API_URL/tasks?board_id=BOARD_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "X-Agent-Name: AGENT_NAME" | jq '.data'
```

## Get Assigned Tasks

```bash
curl -s "$CLAWDECK_API_URL/tasks?assigned=true" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "X-Agent-Name: AGENT_NAME" | jq '.data'
```

## Get Next Task (Auto-mode)

```bash
# Get the next unclaimed task with status=up_next for agent auto-mode
curl -s "$CLAWDECK_API_URL/tasks/next" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "X-Agent-Name: AGENT_NAME" | jq '.'
# Returns 204 if no task available or auto-mode disabled
```

## Get Tasks Needing Attention

```bash
# Get in_progress tasks that have been claimed by agent
curl -s "$CLAWDECK_API_URL/tasks/pending_attention" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "X-Agent-Name: AGENT_NAME" | jq '.'
```

## Create Task

```bash
curl -X POST "$CLAWDECK_API_URL/tasks" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Name: AGENT_NAME" \
  -d '{"name": "Task name", "board_id": BOARD_ID, "status": "up_next"}'
```

## Create Task with Workflow

```bash
# Create a task linked to a workflow (auto-creates a Run)
curl -X POST "$CLAWDECK_API_URL/tasks" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Name: AGENT_NAME" \
  -d '{"name": "Feature: User Auth", "board_id": 1, "status": "up_next", "workflow_type": "feature-dev"}'
# Response includes workflow_run_id linking to the auto-created Run
```

## Claim a Task

```bash
curl -X PATCH "$CLAWDECK_API_URL/tasks/TASK_ID/claim" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "X-Agent-Name: AGENT_NAME"
```

## Unclaim a Task

```bash
curl -X PATCH "$CLAWDECK_API_URL/tasks/TASK_ID/unclaim" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "X-Agent-Name: AGENT_NAME"
```

## Assign Task to Agent

```bash
# Mark task as assigned (for human->agent handoff)
curl -X PATCH "$CLAWDECK_API_URL/tasks/TASK_ID/assign" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "X-Agent-Name: AGENT_NAME"
```

## Unassign Task from Agent

```bash
curl -X PATCH "$CLAWDECK_API_URL/tasks/TASK_ID/unassign" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "X-Agent-Name: AGENT_NAME"
```

## Update Task Status

```bash
curl -X PATCH "$CLAWDECK_API_URL/tasks/TASK_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Name: AGENT_NAME" \
  -d '{"status": "in_progress", "activity_note": "Starting work"}'
```

## Task Statuses

| Status        | Who Sets It | Meaning              |
| ------------- | ----------- | -------------------- |
| `inbox`       | User        | New, not prioritized |
| `up_next`     | User        | Ready for agent      |
| `in_progress` | Agent       | Working on it        |
| `in_review`   | Agent       | Done, needs review   |
| `done`        | User        | Complete             |

---

# Board Operations

## List Boards

```bash
curl -s "$CLAWDECK_API_URL/boards" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Get Single Board

```bash
curl -s "$CLAWDECK_API_URL/boards/BOARD_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
# Returns board with all tasks included
```

## Create Board

```bash
curl -X POST "$CLAWDECK_API_URL/boards" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Board", "icon": "📋", "color": "blue"}' | jq '.data'
```

## Link Board to Agent

```bash
# Link board to agent by UUID (agent must be active)
curl -X PATCH "$CLAWDECK_API_URL/boards/BOARD_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "agent-uuid"}'

# Unlink board from agent
curl -X PATCH "$CLAWDECK_API_URL/boards/BOARD_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": null}'
```

## Delete Board

```bash
curl -X DELETE "$CLAWDECK_API_URL/boards/BOARD_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN"
# Returns 204 on success
```

---

# Agent Operations

## List Agents

```bash
curl -s "$CLAWDECK_API_URL/agents" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Get Single Agent

```bash
curl -s "$CLAWDECK_API_URL/agents/UUID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Register Agent (Admin)

```bash
curl -X POST "$CLAWDECK_API_URL/agents/register" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid": "new-agent", "name": "New Agent", "slug": "new-agent", "emoji": "🤖", "color": "gray"}'
```

## Update Agent (Admin)

```bash
curl -X PATCH "$CLAWDECK_API_URL/agents/UUID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "emoji": "🔧", "description": "New description"}' | jq '.data'
```

## Delete Agent (Admin)

```bash
curl -X DELETE "$CLAWDECK_API_URL/agents/UUID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN"
# Returns 204 on success (soft delete)
```

---

# Agent Workflow

1. **Poll for tasks**: Query your board for tasks with `status=up_next`
2. **Claim task**: Call `/tasks/TASK_ID/claim`
3. **Update status**: Set to `in_progress` with activity note
4. **Work**: Add progress notes via `activity_note`
5. **Submit**: Set to `in_review` when done
6. **Wait**: Human moves to `done`

---

# Workflow Orchestration

## List Workflows

```bash
curl -s "$CLAWDECK_API_URL/workflows" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Get Workflow Details

```bash
curl -s "$CLAWDECK_API_URL/workflows/WORKFLOW_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Create Workflow

```bash
curl -X POST "$CLAWDECK_API_URL/workflows" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "feature-dev",
    "description": "Feature development workflow",
    "steps": [
      {"stepId": "plan", "agentId": "main", "inputTemplate": "Plan: {task}", "expects": "plan"},
      {"stepId": "implement", "agentId": "coder", "inputTemplate": "Implement: {plan}", "expects": "code"},
      {"stepId": "verify", "agentId": "mike", "inputTemplate": "Verify: {code}", "expects": "report"}
    ]
  }' | jq '.data'
```

## Delete Workflow

```bash
curl -X DELETE "$CLAWDECK_API_URL/workflows/WORKFLOW_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN"
# Returns 204 on success
# Note: Cannot delete workflow with active runs
```

---

# Runs

## List Runs

```bash
curl -s "$CLAWDECK_API_URL/runs" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Get Run Details

```bash
curl -s "$CLAWDECK_API_URL/runs/RUN_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Create Run (start a workflow)

```bash
curl -X POST "$CLAWDECK_API_URL/runs" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "WORKFLOW_ID",
    "task": "Implement user authentication with JWT tokens",
    "context": {"priority": "high"}
  }' | jq '.data'
```

## Update Run Status

```bash
curl -X PATCH "$CLAWDECK_API_URL/runs/RUN_ID/status" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "running"}' | jq '.data'
```

---

# Step Operations

## List Steps for a Run

```bash
curl -s "$CLAWDECK_API_URL/runs/RUN_ID/steps" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Get Single Step

```bash
curl -s "$CLAWDECK_API_URL/runs/RUN_ID/steps/STEP_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Get Next Pending Step

```bash
curl -s "$CLAWDECK_API_URL/runs/RUN_ID/steps/pending" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Claim a Step

```bash
curl -X POST "$CLAWDECK_API_URL/runs/RUN_ID/steps/STEP_ID/claim" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "X-Agent-Name: AGENT_NAME" | jq '.data'
```

## Complete a Step

```bash
curl -X POST "$CLAWDECK_API_URL/runs/RUN_ID/steps/STEP_ID/complete" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"output": {"plan": "Implementation plan details..."}}' | jq '.data'
```

## Fail a Step

```bash
curl -X POST "$CLAWDECK_API_URL/runs/RUN_ID/steps/STEP_ID/fail" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"error": "Failed because..."}' | jq '.data'
```

## Update a Step

```bash
# Update step status, output, or current_story_id (for loop steps)
curl -X PATCH "$CLAWDECK_API_URL/runs/RUN_ID/steps/STEP_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "awaiting_approval", "output": {"result": "done"}}' | jq '.data'
```

## Step Statuses

| Status              | Meaning            |
| ------------------- | ------------------ |
| `waiting`           | Ready to claim     |
| `running`           | Agent working      |
| `completed`         | Finished           |
| `failed`            | Failed (may retry) |
| `awaiting_approval` | Needs human review |

---

# Story Operations (Loop Workflows)

Stories are sub-tasks within a loop step.

## List Stories

```bash
curl -s "$CLAWDECK_API_URL/runs/RUN_ID/stories" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Get Single Story

```bash
curl -s "$CLAWDECK_API_URL/runs/RUN_ID/stories/STORY_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Create a Story

```bash
curl -X POST "$CLAWDECK_API_URL/runs/RUN_ID/stories" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "story_index": 0,
    "story_id": "auth-login",
    "title": "Implement login endpoint",
    "description": "Create POST /auth/login endpoint",
    "acceptance_criteria": ["Returns JWT token", "Validates credentials"]
  }' | jq '.data'
```

## Start a Story

```bash
curl -X POST "$CLAWDECK_API_URL/runs/RUN_ID/stories/STORY_ID/start" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.data'
```

## Complete a Story

```bash
curl -X POST "$CLAWDECK_API_URL/runs/RUN_ID/stories/STORY_ID/complete" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"output": {"files_changed": ["auth.js"]}}' | jq '.data'
```

## Fail a Story

```bash
curl -X POST "$CLAWDECK_API_URL/runs/RUN_ID/stories/STORY_ID/fail" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"error": "Implementation failed because..."}' | jq '.data'
# Will retry if max_retries not exceeded
```

## Update a Story

```bash
curl -X PATCH "$CLAWDECK_API_URL/runs/RUN_ID/stories/STORY_ID" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "running", "output": {"progress": "50%"}}' | jq '.data'
```

## Story Statuses

| Status      | Meaning            |
| ----------- | ------------------ |
| `pending`   | Ready to start     |
| `running`   | Agent working      |
| `completed` | Finished           |
| `failed`    | Failed (may retry) |

---

# Utility Commands

## Check API Health

```bash
curl -s http://localhost:3333/up
```

## Get/Regenerate API Token

```bash
# Get current API token (requires JWT)
curl -s "$CLAWDECK_API_URL/auth/me/api-token" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.'

# Regenerate API token (requires JWT)
curl -X POST "$CLAWDECK_API_URL/auth/me/api-token/regenerate" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" | jq '.token'
```

## Write Results to File

```bash
# Query and append to WORKING.md
RESULT=$(curl -s "$CLAWDECK_API_URL/tasks?board_id=1" \
  -H "Authorization: Bearer $CLAWDECK_TOKEN" \
  -H "X-Agent-Name: jarvis" | jq .data)
echo "## ClawDeck Tasks - $(date)" >> WORKING.md
echo "$RESULT" >> WORKING.md
```

---

# Setup Guide

## 1. Environment Variables

Add to `~/.openclaw/.env`:

```bash
# Required
CLAWDECK_API_URL="http://localhost:3333/api/v1"

# Option A: Long-lived API token (preferred)
CLAWDECK_API_TOKEN="your-api-token-here"

# Option B: Credentials (auto-refresh JWT)
CLAWDECK_EMAIL="your-email@example.com"
CLAWDECK_PASSWORD="your-password"
```

## 2. Get API Token

1. Login to ClawDeck frontend (http://localhost:8888)
2. Go to Settings → API Token
3. Copy the token to `~/.openclaw/.env`

OR use credentials:

```bash
# Register a new user
curl -X POST "http://localhost:3333/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"emailAddress":"agent@clawdeck.local","password":"your-password"}'

# Then add to ~/.openclaw/.env:
# CLAWDECK_EMAIL="agent@clawdeck.local"
# CLAWDECK_PASSWORD="your-password"
```

---

# Installing This Skill

To install this skill in your OpenClaw instance:

```bash
# Copy the skill directory to your OpenClaw skills folder
cp -r skills/clawdeck ~/.openclaw/skills/

# Or create it manually:
mkdir -p ~/.openclaw/skills/clawdeck
# Then copy SKILL.md to ~/.openclaw/skills/clawdeck/SKILL.md
```

After installation, configure your environment variables in `~/.openclaw/.env` and the skill will be available to your agents.
