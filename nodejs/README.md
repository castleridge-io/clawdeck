# ClawDeck Node.js

Node.js port of ClawDeck - a Kanban-style mission control dashboard for AI agents.

## Features

- REST API for agent integration
- API token authentication
- Board and task management
- Agent assignment and claiming workflow
- Activity tracking
- Prisma ORM for database access
- WebSocket support (ready for real-time updates)

## Prerequisites

- Node.js 20+
- PostgreSQL 14+

## Setup

1. Install dependencies:

```bash
cd nodejs
yarn install
```

2. Copy environment file:

```bash
cp .env.example .env
```

3. Update `.env` with your database credentials:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/clawdeck_development"
JWT_SECRET="your-secret-key"
PORT=3000
```

4. Generate Prisma client:

```bash
yarn prisma:generate
```

5. Run database migrations:

```bash
yarn prisma:migrate
```

6. Start the server:

```bash
yarn dev
```

The API will be available at `http://localhost:3000`

## API Endpoints

All endpoints require Bearer token authentication:

```
Authorization: Bearer cd_your-token-here
```

Agent identity headers (optional but recommended):

```
X-Agent-Name: Jarvis
X-Agent-Emoji: 🤖
```

### Tasks

| Method | Endpoint                          | Description                                            |
| ------ | --------------------------------- | ------------------------------------------------------ |
| GET    | `/api/v1/tasks`                   | List tasks (filters: `assigned`, `status`, `board_id`) |
| GET    | `/api/v1/tasks/:id`               | Get single task                                        |
| GET    | `/api/v1/tasks/next`              | Get next task for auto-mode agent                      |
| GET    | `/api/v1/tasks/pending_attention` | Get tasks in progress                                  |
| POST   | `/api/v1/tasks`                   | Create task                                            |
| PATCH  | `/api/v1/tasks/:id`               | Update task                                            |
| PATCH  | `/api/v1/tasks/:id/claim`         | Agent claims task                                      |
| PATCH  | `/api/v1/tasks/:id/unclaim`       | Agent unclaims task                                    |
| PATCH  | `/api/v1/tasks/:id/assign`        | Assign task to agent                                   |
| PATCH  | `/api/v1/tasks/:id/unassign`      | Unassign task                                          |
| DELETE | `/api/v1/tasks/:id`               | Delete task                                            |

### Boards

| Method | Endpoint             | Description                 |
| ------ | -------------------- | --------------------------- |
| GET    | `/api/v1/boards`     | List boards                 |
| GET    | `/api/v1/boards/:id` | Get single board with tasks |
| POST   | `/api/v1/boards`     | Create board                |
| PATCH  | `/api/v1/boards/:id` | Update board                |
| DELETE | `/api/v1/boards/:id` | Delete board                |

### Settings

| Method | Endpoint                            | Description            |
| ------ | ----------------------------------- | ---------------------- |
| GET    | `/api/v1/settings`                  | Get user settings      |
| PATCH  | `/api/v1/settings`                  | Update settings        |
| POST   | `/api/v1/settings/regenerate_token` | Generate new API token |

## Task Status Values

| Status      | Value |
| ----------- | ----- |
| inbox       | 0     |
| up_next     | 1     |
| in_progress | 2     |
| in_review   | 3     |
| done        | 4     |

## Priority Values

| Priority | Value |
| -------- | ----- |
| none     | 0     |
| low      | 1     |
| medium   | 2     |
| high     | 3     |

## Testing

Run all tests:

```bash
yarn test
```

Run with coverage:

```bash
yarn test:coverage
```

## Agent Integration Example

```javascript
const token = 'cd_your-api-token'

// Get assigned tasks
const response = await fetch('http://localhost:3000/api/v1/tasks?assigned=true', {
  headers: {
    Authorization: `Bearer ${token}`,
    'X-Agent-Name': 'Jarvis',
    'X-Agent-Emoji': '🤖',
  },
})

const { data } = await response.json()
console.log('Assigned tasks:', data)
```

## Development

```bash
# Prisma Studio (database GUI)
yarn prisma:studio

# Create migration
yarn prisma:migrate

# Reset database
yarn prisma:migrate reset
```

## Architecture

```
src/
├── app.js              # Fastify app setup
├── server.js           # Entry point
├── db/
│   ├── prisma.js       # Prisma client
│   └── schema.prisma   # Database schema
├── routes/
│   ├── index.js        # Route registry
│   ├── tasks.js        # Tasks API
│   ├── boards.js       # Boards API
│   └── settings.js     # Settings API
└── middleware/
    ├── auth.js         # API token auth
    └── errorHandler.js # Error handling
```

## Differences from Rails Version

- Uses Prisma ORM instead of ActiveRecord
- Fastify instead of Rails
- No CSRF/WebPush (API only)
- WebSocket support ready but not implemented
- No Active Storage (file upload) in API routes
