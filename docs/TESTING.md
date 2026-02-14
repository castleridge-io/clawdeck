# ClawDeck Testing Guide

## Overview

ClawDeck uses a multi-tier testing approach:

- **Unit Tests**: Test individual functions and modules
- **Integration Tests**: Test API endpoints with test database
- **E2E Tests**: Test full user flows across the application

## Test Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Test Environment                      │
│  ┌──────────────┐      ┌──────────────┐                 │
│  │ Test Runner  │─────▶│ Test Database │                 │
│  │ (Docker)     │      │ (Postgres)   │                 │
│  └──────────────┘      └──────────────┘                 │
│         │                                                  │
│         ▼                                                  │
│  ┌────────────────────────────────────┐                   │
│  │    Tests (integration + e2e)      │                   │
│  └────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

**Key Principle**: Tests run in an isolated Docker environment that does NOT affect running development or production instances.

## Quick Start

### Run All Tests in Docker (Isolated)

```bash
cd nodejs
yarn test:docker
```

This will:

- Create isolated test database on port 15433
- Run all unit, integration, and e2e tests
- Clean up containers after completion
- **Does not affect** your development database (port 15432)

### Run Specific Test Types

```bash
# Unit tests only
yarn test:docker:unit

# E2E tests only
yarn test:docker:e2e
```

### Run Tests Locally (Without Docker)

```bash
# Set up test database first (needs local postgres on port 15433)
export DATABASE_URL="postgresql://clawdeck_test:test_password@localhost:15433/clawdeck_test"
export NODE_ENV=test

# Run tests
yarn test

# With coverage
yarn test:coverage
```

## Test Structure

```
nodejs/
├── tests/
│   ├── unit/                    # Unit tests (to be added)
│   │   ├── services/
│   │   │   └── auth.service.test.js
│   │   └── middleware/
│   │       └── auth.test.js
│   ├── integration/             # Integration tests
│   │   ├── tasks.test.js        # Task CRUD operations
│   │   ├── boards.test.js       # Board management
│   │   └── settings.test.js     # Settings endpoints
│   └── e2e/                     # End-to-end tests
│       └── migration-e2e.test.js
├── docker-compose.test.yml      # Isolated test environment
└── .env.test                    # Test environment variables
```

## Writing Tests

### Unit Test Example

```javascript
// tests/unit/services/auth.service.test.js
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { createAuthService } from '../../src/services/auth.service.js'

describe('AuthService', () => {
  let prismaMock

  beforeEach(() => {
    // Setup mocks
  })

  afterEach(() => {
    // Cleanup
  })

  it('should hash password correctly', async () => {
    const authService = createAuthService(prismaMock)
    const hashed = await authService.hashPassword('password123')
    assert.notEqual(hashed, 'password123')
    assert.ok(hashed.length > 20)
  })

  it('should verify correct password', async () => {
    const authService = createAuthService(prismaMock)
    const hashed = await authService.hashPassword('password123')
    const isValid = await authService.verifyPassword('password123', hashed)
    assert.strictEqual(isValid, true)
  })
})
```

### Integration Test Example

```javascript
// tests/integration/tasks.test.js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'

describe('Tasks API', () => {
  let api
  let authToken

  before(async () => {
    // Setup test database and start server
    await prisma.$connect()
    // Create test user and get auth token
  })

  after(async () => {
    // Cleanup test database
    await prisma.$disconnect()
  })

  it('should create a task', async () => {
    const response = await fetch('http://localhost:3500/api/v1/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test Task',
        status: 'inbox',
        board_id: 1,
      }),
    })

    assert.strictEqual(response.status, 201)
    const data = await response.json()
    assert.strictEqual(data.name, 'Test Task')
  })

  it('should get tasks for a board', async () => {
    const response = await fetch('http://localhost:3500/api/v1/tasks?board_id=1', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    assert.strictEqual(response.status, 200)
    const data = await response.json()
    assert.ok(Array.isArray(data))
  })
})
```

### E2E Test Example

```javascript
// tests/e2e/task-workflow-e2e.test.js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'

describe('Task Management E2E', () => {
  before(async () => {
    // Setup full application stack
  })

  after(async () => {
    // Teardown
  })

  it('should complete full task lifecycle', async () => {
    // 1. Create board
    const boardResponse = await fetch('http://localhost:3500/api/v1/boards', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: 'Test Board', icon: '🧪' }),
    })
    const board = await boardResponse.json()

    // 2. Create task
    const taskResponse = await fetch('http://localhost:3500/api/v1/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        name: 'E2E Test Task',
        status: 'inbox',
        board_id: board.id,
      }),
    })
    const task = await taskResponse.json()

    // 3. Update task status
    const updateResponse = await fetch(`http://localhost:3500/api/v1/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ status: 'done' }),
    })
    assert.strictEqual(updateResponse.status, 200)

    // 4. Verify task is complete
    const finalResponse = await fetch(`http://localhost:3500/api/v1/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    const finalTask = await finalResponse.json()
    assert.strictEqual(finalTask.status, 'done')
  })
})
```

## Test Database

The test environment uses a completely separate PostgreSQL instance:

| Property      | Development            | Test                    |
| ------------- | ---------------------- | ----------------------- |
| Database Name | `clawdeck_development` | `clawdeck_test`         |
| User          | `clawdeck`             | `clawdeck_test`         |
| Port          | `15432`                | `15433`                 |
| Network       | `clawdeck-network`     | `clawdeck-test-network` |

This ensures:

- Tests never affect development data
- Tests can run while development server is running
- Tests can run in parallel with development work

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: clawdeck_test
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: clawdeck_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd nodejs
          yarn install --frozen-lockfile

      - name: Generate Prisma Client
        run: |
          cd nodejs
          yarn prisma generate

      - name: Run tests
        run: |
          cd nodejs
          DATABASE_URL="postgresql://clawdeck_test:test_password@localhost:5432/clawdeck_test" yarn test
```

## Best Practices

1. **Isolation**: Each test should be independent - use `beforeEach`/`afterEach` to reset state
2. **Cleanup**: Always clean up created data in `afterEach` or `after` blocks
3. **Mock External Services**: Mock S3, external APIs in unit tests
4. **Use Test Database**: Never run tests against development/production databases
5. **Descriptive Names**: Test names should clearly describe what they test
6. **One Assertion Per Test**: Keep tests focused and easy to debug
7. **Test Edge Cases**: Test not just happy path, but errors and edge cases

## Running Specific Tests

```bash
# Run a single test file
node --test tests/integration/tasks.test.js

# Run tests matching pattern
node --test tests/**/*.test.js

# Run with verbose output
node --test --experimental-test-coverage tests/
```

## Debugging Tests

```bash
# Run tests with inspect for debugging
node --inspect --test tests/integration/tasks.test.js

# Then attach with Chrome DevTools or VS Code debugger
```

## Coverage

```bash
# Generate coverage report
yarn test:coverage

# View coverage in HTML
open coverage/index.html
```

Target coverage: **80%+** for all critical paths.

## Troubleshooting

### Port 15433 Already in Use

```bash
# Find what's using the port
lsof -i :15433

# Or use a different port in .env.test
```

### Tests Fail to Connect to Database

```bash
# Verify test database is running
docker ps | grep clawdeck-postgres-test

# Check test database logs
docker logs clawdeck-postgres-test
```

### Migration Issues in Tests

```bash
# Reset test database
docker exec clawdeck-postgres-test psql -U clawdeck_test -c "DROP DATABASE IF EXISTS clawdeck_test;"
docker exec clawdeck-postgres-test psql -U clawdeck_test -c "CREATE DATABASE clawdeck_test;"

# Re-run migrations
DATABASE_URL="..." npx prisma migrate deploy
```
