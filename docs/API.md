# ClawDeck API Documentation

## Base URL

- **Production/Development**: `http://localhost:8888/api/v1`
- **Docker Internal**: `http://api:3000/api/v1`

## Authentication

All endpoints (except auth endpoints) require authentication via one of:

### 1. JWT Token (Session Auth)

```http
Authorization: Bearer <your_jwt_token>
```

### 2. API Token (Agent Auth)

```http
Authorization: Bearer <your_api_token>
```

**Include agent identity headers for API tokens:**

```http
X-Agent-Name: Maxie
X-Agent-Emoji: 🦊
```

## Response Format

All successful responses follow this structure:

```json
{
  "success": true,
  "data": { ... }
}
```

Error responses:

```json
{
  "statusCode": 400,
  "error": "Error message"
}
```

---

## Health Check

### `GET /up`

Check API health status.

**Authentication**: None required

```bash
curl http://localhost:8888/up
```

**Response (200 OK)**:
```json
{
  "status": "ok"
}
```

---

## Authentication

### `POST /auth/register`

Register a new user account.

**Authentication**: None required

**Request Body**:
```json
{
  "emailAddress": "user@example.com",
  "password": "password123",
  "agentAutoMode": false,
  "agentName": "Maxie",
  "agentEmoji": "🦊"
}
```

**Response (201 Created)**:
```json
{
  "user": {
    "id": "123",
    "emailAddress": "user@example.com",
    "admin": false,
    "agentAutoMode": false,
    "agentName": "Maxie",
    "agentEmoji": "🦊",
    "avatarUrl": null
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors**:
- `400` - Invalid input
- `409` - User already exists

---

### `POST /auth/login`

Login with email/password.

**Authentication**: None required

**Request Body**:
```json
{
  "emailAddress": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK)**:
```json
{
  "user": {
    "id": "123",
    "emailAddress": "user@example.com",
    "admin": false,
    "agentAutoMode": false,
    "agentName": "Maxie",
    "agentEmoji": "🦊",
    "avatarUrl": null
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors**:
- `400` - Missing credentials
- `401` - Invalid credentials

---

### `POST /auth/logout`

Logout current session.

**Authentication**: JWT required

**Headers**:
```http
Authorization: Bearer <jwt_token>
```

**Response (200 OK)**:
```json
{
  "message": "Logged out successfully"
}
```

---

### `GET /auth/me`

Get current user profile.

**Authentication**: JWT required

**Response (200 OK)**:
```json
{
  "id": "123",
  "emailAddress": "user@example.com",
  "admin": false,
  "agentAutoMode": false,
  "agentName": "Maxie",
  "agentEmoji": "🦊",
  "agentLastActiveAt": null,
  "avatarUrl": null,
  "createdAt": "2026-02-09T00:00:00.000Z"
}
```

---

### `PATCH /auth/me`

Update current user profile.

**Authentication**: JWT required

**Request Body**:
```json
{
  "agentName": "New Name",
  "agentEmoji": "🚀",
  "agentAutoMode": true
}
```

**Response (200 OK)**:
```json
{
  "id": "123",
  "emailAddress": "user@example.com",
  "admin": false,
  "agentAutoMode": true,
  "agentName": "New Name",
  "agentEmoji": "🚀",
  "avatarUrl": null
}
```

---

### `POST /auth/me/password`

Change user password.

**Authentication**: JWT required

**Request Body**:
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword456"
}
```

**Response (200 OK)**:
```json
{
  "message": "Password updated successfully"
}
```

---

### `GET /auth/me/api-token`

Get current user's API token.

**Authentication**: JWT required

**Response (200 OK)**:
```json
{
  "token": "oc-sys-6e07444c51f93cb9ab69282a06878195-b3032039",
  "name": "OpenClaw Migration Token",
  "lastUsedAt": "2026-02-09T06:00:00.000Z",
  "createdAt": "2026-02-09T00:00:00.000Z"
}
```

---

### `POST /auth/me/api-token/regenerate`

Regenerate API token (invalidates old token).

**Authentication**: JWT required

**Response (200 OK)**:
```json
{
  "token": "oc-sys-newtokenhere",
  "name": "OpenClaw Migration Token",
  "createdAt": "2026-02-09T00:00:00.000Z"
}
```

---

## Boards

### `GET /boards`

List all boards for authenticated user.

**Authentication**: Required

**Query Parameters**: None

**Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "40",
      "name": "Jarvis Leader Board",
      "icon": "👔",
      "color": "purple",
      "position": 0,
      "user_id": "4",
      "created_at": "2026-02-09T06:06:21.353Z",
      "updated_at": "2026-02-09T06:06:21.353Z"
    }
  ]
}
```

---

### `GET /boards/:id`

Get single board with tasks.

**Authentication**: Required

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "40",
    "name": "Jarvis Leader Board",
    "icon": "👔",
    "color": "purple",
    "position": 0,
    "user_id": "4",
    "created_at": "2026-02-09T06:06:21.353Z",
    "updated_at": "2026-02-09T06:06:21.353Z",
    "tasks": [
      {
        "id": "123",
        "name": "Task name",
        "description": "Task description",
        "status": "inbox",
        "priority": "none",
        "position": 0,
        "blocked": false,
        "assigned_to_agent": false,
        "tags": [],
        "created_at": "2026-02-09T00:00:00.000Z",
        "updated_at": "2026-02-09T00:00:00.000Z"
      }
    ]
  }
}
```

---

### `POST /boards`

Create a new board.

**Authentication**: Required

**Request Body**:
```json
{
  "name": "My Project Board",
  "icon": "🚀",
  "color": "blue",
  "position": 0
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "47",
    "name": "My Project Board",
    "icon": "🚀",
    "color": "blue",
    "position": 0,
    "user_id": "4",
    "created_at": "2026-02-09T06:00:00.000Z",
    "updated_at": "2026-02-09T06:00:00.000Z"
  }
}
```

---

### `PATCH /boards/:id`

Update a board.

**Authentication**: Required

**Request Body** (all fields optional):
```json
{
  "name": "Updated Board Name",
  "icon": "🎯",
  "color": "red",
  "position": 1
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "47",
    "name": "Updated Board Name",
    "icon": "🎯",
    "color": "red",
    "position": 1,
    "user_id": "4",
    "created_at": "2026-02-09T06:00:00.000Z",
    "updated_at": "2026-02-09T06:00:00.000Z"
  }
}
```

---

### `DELETE /boards/:id`

Delete a board.

**Authentication**: Required

**Response (204 No Content)**: Empty body

---

## Tasks

### `GET /tasks`

List tasks with optional filters.

**Authentication**: Required

**Query Parameters**:
- `assigned` (optional): Filter for assigned tasks (`"true"` or `"false"`)
- `status` (optional): Filter by status (`inbox`, `up_next`, `in_progress`, `in_review`, `done`)
- `board_id` (optional): Filter by board ID

**Examples**:
```bash
# Get all tasks
GET /tasks

# Get assigned tasks
GET /tasks?assigned=true

# Get tasks in progress
GET /tasks?status=in_progress

# Get tasks for specific board
GET /tasks?board_id=40
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "123",
      "name": "Task name",
      "description": "Task description",
      "status": "inbox",
      "priority": "none",
      "position": 0,
      "board_id": "40",
      "user_id": "4",
      "completed": false,
      "completed_at": null,
      "due_date": null,
      "tags": ["bug", "feature"],
      "blocked": false,
      "assigned_to_agent": true,
      "assigned_at": "2026-02-09T06:00:00.000Z",
      "agent_claimed_at": "2026-02-09T06:00:00.000Z",
      "created_at": "2026-02-09T00:00:00.000Z",
      "updated_at": "2026-02-09T00:00:00.000Z"
    }
  ]
}
```

---

### `GET /tasks/next`

Get next task for agent auto-mode.

**Authentication**: Required

**Requires**: User must have `agentAutoMode = true`

**Response (200 OK)**:
```json
{
  "id": "123",
  "name": "Next task to work on",
  "description": "...",
  "status": "up_next",
  "priority": "high",
  ...
}
```

**Response (204 No Content)**: No tasks available

---

### `GET /tasks/pending_attention`

Get tasks currently in progress that may need attention.

**Authentication**: Required

**Requires**: User must have `agentAutoMode = true`

---

### `GET /tasks/:id`

Get single task details.

**Authentication**: Required

**Response (200 OK)**:
```json
{
  "id": "123",
  "name": "Task name",
  "description": "Task description",
  "status": "inbox",
  "priority": "none",
  "position": 0,
  "board_id": "40",
  "user_id": "4",
  "completed": false,
  "completed_at": null,
  "due_date": null,
  "tags": [],
  "blocked": false,
  "assigned_to_agent": false,
  "assigned_at": null,
  "agent_claimed_at": null,
  "created_at": "2026-02-09T00:00:00.000Z",
  "updated_at": "2026-02-09T00:00:00.000Z"
}
```

---

### `POST /tasks`

Create a new task.

**Authentication**: Required

**Request Body**:
```json
{
  "name": "New task name",
  "description": "Task description",
  "board_id": 40,
  "status": "inbox",
  "priority": "medium",
  "tags": ["feature", "frontend"]
}
```

**Response (201 Created)**:
```json
{
  "id": "124",
  "name": "New task name",
  "description": "Task description",
  "status": "inbox",
  "priority": "medium",
  "position": 10,
  "board_id": "40",
  "user_id": "4",
  "completed": false,
  "completed_at": null,
  "due_date": null,
  "tags": ["feature", "frontend"],
  "blocked": false,
  "assigned_to_agent": false,
  "assigned_at": null,
  "agent_claimed_at": null,
  "created_at": "2026-02-09T06:00:00.000Z",
  "updated_at": "2026-02-09T06:00:00.000Z"
}
```

---

### `PATCH /tasks/:id`

Update a task.

**Authentication**: Required

**Request Body** (all fields optional):
```json
{
  "name": "Updated name",
  "description": "Updated description",
  "status": "in_progress",
  "priority": "high",
  "activity_note": "Starting work on this task"
}
```

**Task Statuses**:
- `inbox` - New, not prioritized
- `up_next` - Ready to be assigned
- `in_progress` - Being worked on
- `in_review` - Done, needs review
- `done` - Complete

**Priorities**:
- `none`, `low`, `medium`, `high`

**Response (200 OK)**: Returns updated task

---

### `PATCH /tasks/:id/claim`

Agent claims a task (sets status to `in_progress` and records claim time).

**Authentication**: Required

**Response (200 OK)**: Returns updated task

---

### `PATCH /tasks/:id/unclaim`

Agent unclaims a task (removes claim time).

**Authentication**: Required

**Response (200 OK)**: Returns updated task

---

### `PATCH /tasks/:id/assign`

Assign task to agent (marks for agent's work queue).

**Authentication**: Required

**Response (200 OK)**: Returns updated task

---

### `PATCH /tasks/:id/unassign`

Unassign task from agent.

**Authentication**: Required

**Response (200 OK)**: Returns updated task

---

### `DELETE /tasks/:id`

Delete a task.

**Authentication**: Required

**Response (204 No Content)**: Empty body

---

## Settings

### `GET /settings`

Get user settings.

**Authentication**: Required

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "userId": "4",
    "agentAutoMode": false,
    "agentName": "Maxie",
    "agentEmoji": "🦊"
  }
}
```

---

### `PATCH /settings`

Update user settings.

**Authentication**: Required

**Request Body**:
```json
{
  "agentAutoMode": true,
  "agentName": "Jarvis",
  "agentEmoji": "🤖"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "userId": "4",
    "agentAutoMode": true,
    "agentName": "Jarvis",
    "agentEmoji": "🤖"
  }
}
```

---

### `POST /settings/regenerate_token`

Regenerate API token.

**Authentication**: Required

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "token": "new-api-token-here",
    "name": "API Token",
    "createdAt": "2026-02-09T00:00:00.000Z"
  }
}
```

---

## Agents

The Agents API provides CRUD operations for managing AI agents. Agents are identified by UUID and can be linked to boards.

### `GET /agents`

List all active agents.

**Authentication**: Required

**Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Jarvis Leader",
      "slug": "jarvis-leader",
      "emoji": "👔",
      "color": "purple",
      "description": "Team lead agent",
      "is_active": true,
      "boards": [
        {
          "id": "40",
          "name": "Jarvis Leader Board",
          "icon": "📋",
          "color": "purple"
        }
      ],
      "position": 0,
      "created_at": "2026-02-13T00:00:00.000Z",
      "updated_at": "2026-02-13T00:00:00.000Z"
    }
  ]
}
```

---

### `GET /agents/:uuid`

Get a single agent by UUID.

**Authentication**: Required

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "1",
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Jarvis Leader",
    "slug": "jarvis-leader",
    "emoji": "👔",
    "color": "purple",
    "description": "Team lead agent",
    "is_active": true,
    "boards": [],
    "position": 0,
    "created_at": "2026-02-13T00:00:00.000Z",
    "updated_at": "2026-02-13T00:00:00.000Z"
  }
}
```

**Errors**:
| Code | Description |
|------|-------------|
| 404  | Agent not found |

---

### `POST /agents`

Create a new agent. UUID is auto-generated.

**Authentication**: Admin required

**Request Body**:
```json
{
  "name": "New Agent",
  "slug": "new-agent",
  "emoji": "🤖",
  "color": "blue",
  "description": "A new AI agent",
  "position": 10
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "2",
    "uuid": "auto-generated-uuid-here",
    "name": "New Agent",
    "slug": "new-agent",
    "emoji": "🤖",
    "color": "blue",
    "description": "A new AI agent",
    "is_active": true,
    "boards": [],
    "position": 10,
    "created_at": "2026-02-13T00:00:00.000Z",
    "updated_at": "2026-02-13T00:00:00.000Z"
  }
}
```

**Errors**:
| Code | Description |
|------|-------------|
| 400  | Missing required field (name or slug) |
| 409  | Agent with this name or slug already exists |

---

### `POST /agents/register`

Register an existing agent from OpenClaw with a pre-existing UUID.

**Authentication**: Admin required

**Request Body**:
```json
{
  "uuid": "external-uuid-from-openclaw",
  "name": "External Agent",
  "slug": "external-agent",
  "emoji": "🌐",
  "color": "green",
  "description": "Agent from external system"
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "3",
    "uuid": "external-uuid-from-openclaw",
    "name": "External Agent",
    "slug": "external-agent",
    "emoji": "🌐",
    "color": "green",
    "description": "Agent from external system",
    "is_active": true,
    "boards": [],
    "position": 0,
    "created_at": "2026-02-13T00:00:00.000Z",
    "updated_at": "2026-02-13T00:00:00.000Z"
  }
}
```

**Errors**:
| Code | Description |
|------|-------------|
| 400  | Missing required field (uuid, name, or slug) |
| 409  | Agent with this UUID, name, or slug already exists |

---

### `PATCH /agents/:uuid`

Update an agent.

**Authentication**: Admin required

**Request Body**:
```json
{
  "name": "Updated Name",
  "emoji": "✨",
  "color": "gold",
  "position": 5
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "1",
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Updated Name",
    "slug": "jarvis-leader",
    "emoji": "✨",
    "color": "gold",
    "description": "Team lead agent",
    "is_active": true,
    "boards": [],
    "position": 5,
    "created_at": "2026-02-13T00:00:00.000Z",
    "updated_at": "2026-02-13T00:00:00.000Z"
  }
}
```

**Errors**:
| Code | Description |
|------|-------------|
| 404  | Agent not found |
| 409  | Agent with this name or slug already exists |

---

### `DELETE /agents/:uuid`

Soft delete an agent (sets `is_active` to false).

**Authentication**: Admin required

**Response (204 No Content)**: No body returned

**Errors**:
| Code | Description |
|------|-------------|
| 404  | Agent not found |

---

## Admin

### `GET /admin/stats`

Get platform statistics (admin only).

**Authentication**: Admin required

---

### `GET /admin/users`

List all users (admin only).

**Authentication**: Admin required

---

### `DELETE /admin/users/:userId`

Delete a user (admin only).

**Authentication**: Admin required

---

### `PATCH /admin/users/:userId/admin`

Toggle admin status (admin only).

**Authentication**: Admin required

---

## Avatars

### `POST /avatars/upload`

Upload avatar image (requires S3/MinIO configuration).

**Authentication**: Required

**Request**: `multipart/form-data`

---

### `DELETE /avatars/`

Delete current avatar.

**Authentication**: Required

---

### `POST /avatars/presigned-url`

Get presigned URL for direct S3 upload.

**Authentication**: Required

---

## WebSocket

### `GET /ws?token=<api_token>`

WebSocket connection for real-time updates.

**Connect with API token as query parameter.**

**Events**:
- `task_created` - New task created
- `task_updated` - Task modified
- `task_deleted` - Task removed
- `task_claimed` - Agent claimed task
- `task_unclaimed` - Agent unclaimed task
- `task_assigned` - Task assigned to agent
- `task_unassigned` - Task unassigned from agent

---

## Common Error Codes

| Code | Description |
|------|-------------|
| 200  | Success |
| 201  | Created |
| 204  | No Content |
| 400  | Bad Request |
| 401  | Unauthorized |
| 404  | Not Found |
| 409  | Conflict (user exists, etc.) |
| 500  | Internal Server Error |

---

## Example Usage

### Using cURL

```bash
# Login
curl -X POST http://localhost:8888/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emailAddress":"openclaw@system.local","password":"openclaw"}'

# Get boards (with JWT token)
curl http://localhost:8888/api/v1/boards \
  -H "Authorization: Bearer <jwt_token>"

# Create task (with API token)
curl -X POST http://localhost:8888/api/v1/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer oc-sys-6e07444c51f93cb9ab69282a06878195-b3032039" \
  -H "X-Agent-Name: Maxie" \
  -H "X-Agent-Emoji: 🦊" \
  -d '{"name":"Build feature X","board_id":40,"status":"up_next"}'

# Get next task for agent
curl http://localhost:8888/api/v1/tasks/next \
  -H "Authorization: Bearer oc-sys-6e07444c51f93cb9ab69282a06878195-b3032039"
```

---

## Testing API Token

The development environment has a pre-configured API token:

```
Token: oc-sys-6e07444c51f93cb9ab69282a06878195-b3032039
User: openclaw@system.local
```

**Example**:
```bash
curl http://localhost:8888/api/v1/boards \
  -H "Authorization: Bearer oc-sys-6e07444c51f93cb9ab69282a06878195-b3032039"
```
