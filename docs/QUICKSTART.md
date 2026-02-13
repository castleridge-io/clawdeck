# ClawDeck + OpenClaw Integration Quick Start

## Overview

**ClawDeck**: Kanban task management system with API
**OpenClaw**: Multi-agent AI platform with Telegram bots

This guide sets up bidirectional integration so OpenClaw agents can work on ClawDeck tasks.

---

## Endpoints

| Service | URL |
|---------|-----|
| ClawDeck API | `http://localhost:4333/api/v1` |
| ClawDeck Frontend | `http://localhost:8888` |
| OpenClaw Gateway | `ws://127.0.0.1:18789` |

## Authentication

Two options:

### Option 1: API Token (Long-lived, preferred)

```bash
# In ~/.openclaw/.env
CLAWDECK_API_TOKEN="your-api-token-here"
```

### Option 2: Credentials (Auto-refresh JWT)

```bash
# In ~/.openclaw/.env
CLAWDECK_EMAIL="your-email@example.com"
CLAWDECK_PASSWORD="your-password"
```

The skill automatically:
- Uses `CLAWDECK_API_TOKEN` if set (no expiry)
- Falls back to login with `CLAWDECK_EMAIL` + `CLAWDECK_PASSWORD` to get fresh JWT

---

## Agent → Board Mapping

| OpenClaw Agent | Agent ID | ClawDeck Board | Board ID | Emoji | Color |
|----------------|----------|----------------|----------|-------|-------|
| Jarvis Leader | `main` | Jarvis Leader Board | 40 | 👔 | purple |
| Dave Engineer | `coder` | Dave Engineer Board | 41 | 👨‍💻 | blue |
| Sally Designer | `sally` | Sally Designer Board | 42 | 👩‍🎨 | pink |
| Mike QA | `mike` | Mike QA Board | 43 | 🧪 | green |
| Richard | `richard` | Richard Board | 44 | 📚 | yellow |
| Nolan | `nolan` | Nolan Board | 45 | ⚙️ | gray |
| Elsa | `elsa` | Elsa Board | 46 | 📢 | orange |

### Workflow Agents (Subagents)

| Agent | Agent ID | Board | Emoji | Color |
|-------|----------|-------|-------|-------|
| Bug Fix Triager | `bug-fix/triager` | - | 🔍 | red |
| Bug Fix Investigator | `bug-fix/investigator` | - | 🕵️ | orange |
| Bug Fix Fixer | `bug-fix/fixer` | - | 🔧 | blue |
| Feature Dev Planner | `feature-dev/planner` | - | 📋 | purple |
| Feature Dev Developer | `feature-dev/developer` | - | 💻 | green |
| Security Scanner | `security-audit/scanner` | - | 🛡️ | red |

---

## Setup Checklist

### 1. Environment Variables

In `~/.openclaw/.env`:
```bash
# Required
CLAWDECK_API_URL="http://localhost:4333/api/v1"

# Option A: Long-lived API token (preferred)
CLAWDECK_API_TOKEN="your-api-token-here"

# Option B: Credentials (auto-refresh JWT)
CLAWDECK_EMAIL="your-email@example.com"
CLAWDECK_PASSWORD="your-password"
```

### 2. Get API Token

1. Login to ClawDeck frontend (http://localhost:8888)
2. Go to Settings → API Token
3. Copy the token

OR register via API:
```bash
curl -X POST "http://localhost:4333/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"emailAddress":"agent@clawdeck.local","password":"your-password"}'
```

### 3. OpenClaw Config

In `~/.openclaw/openclaw.json`:
```json
"skills": {
  "entries": {
    "clawdeck": {
      "env": {
        "CLAWDECK_API_URL": "${CLAWDECK_API_URL}",
        "CLAWDECK_API_TOKEN": "${CLAWDECK_API_TOKEN}"
      }
    }
  }
}
```

### 4. Register Agents in ClawDeck

Run this to register all OpenClaw agents:

```bash
# Primary agents
curl -X POST "http://localhost:4333/api/v1/agents/register" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid": "main", "name": "Jarvis Leader", "slug": "jarvis-leader", "emoji": "👔", "color": "purple", "description": "Coordinator agent - delegates all work"}'

curl -X POST "http://localhost:4333/api/v1/agents/register" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid": "coder", "name": "Dave Engineer", "slug": "dave-engineer", "emoji": "👨‍💻", "color": "blue", "description": "All coding - backend + frontend"}'

curl -X POST "http://localhost:4333/api/v1/agents/register" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid": "sally", "name": "Sally Designer", "slug": "sally-designer", "emoji": "👩‍🎨", "color": "pink", "description": "UI/UX design only"}'

curl -X POST "http://localhost:4333/api/v1/agents/register" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid": "mike", "name": "Mike QA", "slug": "mike-qa", "emoji": "🧪", "color": "green", "description": "Testing and QA"}'

curl -X POST "http://localhost:4333/api/v1/agents/register" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid": "richard", "name": "Richard", "slug": "richard", "emoji": "📚", "color": "yellow", "description": "Research & documentation"}'

curl -X POST "http://localhost:4333/api/v1/agents/register" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid": "nolan", "name": "Nolan", "slug": "nolan", "emoji": "⚙️", "color": "gray", "description": "Project setup & config"}'

curl -X POST "http://localhost:4333/api/v1/agents/register" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid": "elsa", "name": "Elsa", "slug": "elsa", "emoji": "📢", "color": "orange", "description": "Marketing & content"}'
```

---

## API Quick Reference

### Test Connection
```bash
curl http://localhost:4333/up
```

### List Boards
```bash
curl -s "http://localhost:4333/api/v1/boards" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" | jq '.data'
```

### Link Board to Agent
```bash
# Link board to agent by UUID
curl -X PATCH "http://localhost:4333/api/v1/boards/BOARD_ID" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "main"}'

# Unlink board from agent
curl -X PATCH "http://localhost:4333/api/v1/boards/BOARD_ID" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": null}'
```

### List Agents
```bash
curl -s "http://localhost:4333/api/v1/agents" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" | jq '.data'
```

### Create Task
```bash
curl -X POST "http://localhost:4333/api/v1/tasks" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Name: jarvis" \
  -H "X-Agent-Emoji: 👔" \
  -d '{"name": "Build feature X", "board_id": 40, "status": "up_next"}'
```

### Get Tasks for Agent
```bash
curl -s "http://localhost:4333/api/v1/tasks?board_id=40" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "X-Agent-Name: jarvis" | jq '.data'
```

### Claim Task
```bash
curl -X PATCH "http://localhost:4333/api/v1/tasks/TASK_ID/claim" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "X-Agent-Name: jarvis"
```

### Update Task Status
```bash
curl -X PATCH "http://localhost:4333/api/v1/tasks/TASK_ID" \
  -H "Authorization: Bearer $CLAWDECK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Name: jarvis" \
  -d '{"status": "in_progress", "activity_note": "Starting work!"}'
```

---

## Task Statuses

| Status | Who Sets It | Meaning |
|--------|-------------|---------|
| `inbox` | User | New, not prioritized |
| `up_next` | User | Ready for agent assignment |
| `in_progress` | Agent | Currently being worked on |
| `in_review` | Agent | Done, needs human review |
| `done` | User | Approved and complete |

---

## Agent Workflow

1. **Poll for tasks**: `GET /tasks?board_id=X`
2. **Claim task**: `PATCH /tasks/:id/claim`
3. **Update status**: `PATCH /tasks/:id` with `status: "in_progress"`
4. **Add progress notes**: Include `activity_note` in updates
5. **Submit for review**: Set `status: "in_review"`
6. **Human approves**: User moves to `done`

---

## Files

| File | Purpose |
|------|---------|
| `~/.openclaw/.env` | Environment variables |
| `~/.openclaw/openclaw.json` | OpenClaw configuration |
| `~/.openclaw/skills/clawdeck/SKILL.md` | OpenClaw skill definition |
| `docs/API.md` | Full ClawDeck API docs |
| `docs/AGENT_INTEGRATION.md` | Agent integration spec |

---

## Troubleshooting

### ClawDeck not responding
```bash
# Check if API is up
curl http://localhost:4333/up

# Check Docker containers
cd /home/montelai/tools/clawdeck/nodejs
docker-compose ps
```

### Invalid token error
```bash
# Regenerate token via API
curl -X POST "http://localhost:4333/api/v1/settings/regenerate_token" \
  -H "Authorization: Bearer <jwt_token_from_login>"
```

### Agent not found
Register the agent first using the `/agents/register` endpoint.
