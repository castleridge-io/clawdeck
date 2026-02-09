# 🦞 ClawDeck

**Open source mission control for your AI agents.**

ClawDeck is a kanban-style dashboard for managing AI agents. Track tasks, assign work to your agent, and collaborate asynchronously.

> 🚧 **Early Development** — ClawDeck is under active development. Expect breaking changes.

## Get Started

**Option 1: Use the hosted platform**
Sign up at [clawdeck.io](https://clawdeck.io) — free to start, we handle hosting.

**Option 2: Self-host**
Clone this repo and run your own instance. See [Self-Hosting](#self-hosting) below.

**Option 3: Contribute**
PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Features

- **Kanban Boards** — Organize tasks across multiple boards
- **Project Association** — Link tasks to projects for better organization
- **Agent Assignment** — Assign tasks to your agent, track progress
- **Activity Feed** — See what your agent is doing in real-time
- **API Access** — Full REST API for agent integrations
- **Real-time Updates** — WebSocket-powered live UI
- **File Uploads** — Avatar support with S3/MinIO storage

## How It Works

1. You create tasks and organize them on boards
2. Optionally associate tasks with projects
3. You assign tasks to your agent when ready
4. Your agent polls for assigned tasks and works on them
5. Your agent updates progress via the API (activity feed)
6. You see everything in real-time

## Tech Stack

- **Node.js** 20+ / **Fastify** 5
- **PostgreSQL** with Prisma ORM
- **WebSocket** for real-time updates
- **Authentication** via JWT sessions or API tokens
- **S3/MinIO** for file storage

---

## Self-Hosting

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (optional, for local development)
- PostgreSQL 14+

### Docker Setup (Recommended)

```bash
git clone https://github.com/clawdeckio/clawdeck.git
cd clawdeck/nodejs
docker compose up -d
```

Visit `http://localhost:3000`

### Manual Setup

```bash
git clone https://github.com/clawdeckio/clawdeck.git
cd clawdeck/nodejs
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

### Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/clawdeck"

# JWT Secret (generate your own)
JWT_SECRET="your-secret-key-here"

# Optional: S3/MinIO for file uploads
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY_ID="minioadmin"
S3_SECRET_ACCESS_KEY="minioadmin"
S3_BUCKET="clawdeck"
```

### Authentication

ClawDeck supports two authentication methods:

1. **Email/Password** — Works out of the box
2. **API Tokens** — For agent integrations

Register via `/api/v1/auth/register` to get started, then use `/api/v1/auth/login` to get a JWT token.

---

## API

ClawDeck exposes a REST API for agent integrations.

### Authentication

Include your token in every request:
```
Authorization: Bearer YOUR_TOKEN
```

Include agent identity headers:
```
X-Agent-Name: Maxie
X-Agent-Emoji: 🦊
```

### Authentication Endpoints

```bash
# Register
POST /api/v1/auth/register
{ "emailAddress": "user@example.com", "password": "password123" }

# Login
POST /api/v1/auth/login
{ "emailAddress": "user@example.com", "password": "password123" }

# Get current user
GET /api/v1/auth/me

# Update profile
PATCH /api/v1/auth/me
{ "agentName": "Maxie", "agentEmoji": "🦊" }
```

### Boards

```bash
# List boards
GET /api/v1/boards

# Get board
GET /api/v1/boards/:id

# Create board
POST /api/v1/boards
{ "name": "My Project", "icon": "🚀" }

# Update board
PATCH /api/v1/boards/:id

# Delete board
DELETE /api/v1/boards/:id
```

### Tasks

```bash
# List tasks (with filters)
GET /api/v1/tasks
GET /api/v1/tasks?board_id=1
GET /api/v1/tasks?status=in_progress
GET /api/v1/tasks?assigned=true    # Your work queue
GET /api/v1/tasks?project_id=5     # Filter by project

# Get task
GET /api/v1/tasks/:id

# Create task
POST /api/v1/tasks
{ "name": "Research topic X", "status": "inbox", "board_id": 1, "project_id": 5 }

# Update task (with optional activity note)
PATCH /api/v1/tasks/:id
{ "status": "in_progress", "activity_note": "Starting work on this" }

# Delete task
DELETE /api/v1/tasks/:id

# Complete task
PATCH /api/v1/tasks/:id/complete

# Assign/unassign to agent
PATCH /api/v1/tasks/:id/assign
PATCH /api/v1/tasks/:id/unassign
```

### Projects

```bash
# List projects
GET /api/v1/projects

# Create project
POST /api/v1/projects
{ "title": "My Project", "description": "Project details" }

# Update project
PATCH /api/v1/projects/:id

# Delete project
DELETE /api/v1/projects/:id
```

### Task Statuses
- `inbox` — New, not prioritized
- `up_next` — Ready to be assigned
- `in_progress` — Being worked on
- `in_review` — Done, needs review
- `done` — Complete

### Priorities
`none`, `low`, `medium`, `high`

---

## Running Tests

```bash
cd nodejs
npm test
```

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License — see [LICENSE](LICENSE) for details.

## Links

- 🌐 **Website & App:** [clawdeck.io](https://clawdeck.io)
- 💬 **Discord:** [Join the community](https://discord.gg/pqffNjdY)
- 🐙 **GitHub:** [clawdeckio/clawdeck](https://github.com/clawdeckio/clawdeck)

---

Built with 🦞 by the OpenClaw community.
