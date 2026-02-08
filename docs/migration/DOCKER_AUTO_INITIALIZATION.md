# Docker Compose Auto-Initialization

## Overview

The ClawDeck API server automatically initializes the database on startup when using Docker Compose. No manual steps needed!

---

## Quick Start

```bash
cd ~/tools/clawdeck/nodejs

# 1. Create environment file
cp .env.docker.example .env

# 2. Generate secure secrets
JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)

# 3. Update .env file
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" .env

# 4. Start services (auto-initializes!)
docker-compose up -d

# 5. Verify
curl http://localhost:3000/health
```

---

## What Happens Automatically

### 1. PostgreSQL Initialization

**When**: PostgreSQL container first starts

**What happens**:
1. PostgreSQL database created
2. Runs init scripts from `postgres/init/`
3. Creates extensions and indexes
4. Records migration version

**Files**:
- `postgres/init/01-init-database.sh` - Initialization script

### 2. API Server Initialization

**When**: API container starts (after PostgreSQL is healthy)

**What happens**:
1. Checks `AUTO_MIGRATE` environment variable
2. If `true`, runs:
   - `npx prisma generate` (generate client)
   - `npx prisma migrate deploy` (run migrations)
3. Starts API server

**Configuration**:
```bash
# In .env or docker-compose.yml
AUTO_MIGRATE=true
AUTO_SEED=false
```

---

## Initialization Flow

```
docker-compose up -d
        │
        ▼
┌─────────────────────────────────┐
│ Docker Compose starts postgres   │
│                                 │
│ ├─ Create database                │
│ ├─ Run init scripts:            │
│ │  - Enable uuid-ossp            │
│ │  - Create indexes              │
│ └─ Start health check            │
└─────────────────────────────────┘
        │
        ▼ (wait for healthy)
┌─────────────────────────────────┐
│ Docker Compose starts api       │
│                                 │
│ ├─ Wait for postgres healthy    │
│ ├─ Check AUTO_MIGRATE=true      │
│ │                               │
│ ├─ Connect to database           │
│ ├─ Run migrations:              │
│ │  - prisma generate           │
│ │  - prisma migrate deploy    │
│ │                               │
│ ├─ Start server                 │
│ └─ Start health check           │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ API server ready!                │
│                                 │
│ curl http://localhost:3000/health │
│ → { healthy: true }              │
└─────────────────────────────────┘
```

---

## Configuration

### Environment Variables

**File**: `.env` (root of nodejs directory)

```bash
# Auto-migration on startup (default: true)
AUTO_MIGRATE=true

# Auto-seed on startup (default: false)
AUTO_SEED=false

# Database
DATABASE_URL=postgresql://clawdeck:password@postgres:5432/clawdeck_development
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=clawdeck_development

# Application
NODE_ENV=development
PORT=3000
JWT_SECRET=your-secret-here
```

### Docker Compose Configuration

**File**: `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/init:/docker-entrypoint-initdb.d  # Init scripts
    healthcheck:
      test: ["CMD-SHELL", "pg_isready", "-U", "clawdeck"]

  api:
    environment:
      AUTO_MIGRATE: ${AUTO_MIGRATE:-true}
      AUTO_SEED: ${AUTO_SEED:-false}
    depends_on:
      postgres:
        condition: service_healthy
```

---

## Migration Tracking

### Migration Table

**Schema** (in `prisma/schema.prisma`):

```prisma
model _ClawdeckMigration {
  version   String   @id
  appliedAt DateTime @default(now())

  @@map("_clawdeck_migrations")
}
```

### Initialization Script

**File**: `postgres/init/01-init-database.sh`

```bash
#!/bin/bash
# Automatically runs on first start

echo "🔧 Initializing ClawDeck database..."

psql -U clawdeck -d $POSTGRES_DB << 'EOSQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE INDEX IF NOT EXISTS idx_tasks_status_board ON tasks(status, board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_to_agent) WHERE assigned_to_agent = true;
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_activities_created_at ON task_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);

INSERT INTO _clawdeck_migrations (version, appliedAt)
VALUES ('001_initial_setup', NOW())
ON CONFLICT (version) DO NOTHING;
EOSQL

echo "✅ Database initialized successfully"
```

---

## Server Startup Code

### Modified server.js

**File**: `src/server.js`

**Key additions**:

```javascript
// Auto-migrate on startup (if enabled)
const autoMigrate = process.env.AUTO_MIGRATE === 'true'
const autoSeed = process.env.AUTO_SEED === 'true'

const start = async () => {
  try {
    if (autoMigrate) {
      console.log('Running database migrations...')

      await prisma.$connect()

      // Generate Prisma client
      execSync('npx prisma generate', { stdio: 'inherit' })

      // Deploy migrations
      execSync('npx prisma migrate deploy', { stdio: 'inherit' })

      console.log('✅ Migrations completed')

      await prisma.$disconnect()
    }

    // ... start server
  }
}
```

---

## First Time Startup

### Automatic Setup

```bash
cd ~/tools/clawdeck/nodejs

# 1. Create environment
cp .env.docker.example .env

# 2. Add to .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)" >> .env

# 3. Start (everything initializes automatically!)
docker-compose up -d

# 4. Watch the magic happen
docker-compose logs -f api
```

**You'll see**:
```
api       | 🔧 Initializing ClawDeck database...
api       | ✅ Database initialized successfully
postgres  | Database system is ready to accept connections
api       | Running database migrations...
api       | ✅ Migrations completed
api       | Server listening on 0.0.0.0:3000
```

---

## No Systemd Needed!

### Why Systemd is NOT Required

Docker Compose provides everything systemd would:

| Feature | Systemd | Docker Compose |
|---------|----------|----------------|
| Auto-start on boot | ✅ | ✅ (via Docker daemon) |
| Auto-restart on crash | ✅ | ✅ (`restart: unless-stopped`) |
| Health checks | ✅ | ✅ (`healthcheck:`) |
| Dependency management | ✅ | ✅ (`depends_on: condition: service_healthy`) |
| Log management | ✅ | ✅ (`docker-compose logs`) |
| Resource limits | ✅ | ✅ (`deploy.resources`) |

### How Docker Auto-Start Works

```
System boot
    │
    ▼
Docker daemon starts (via systemd)
    │
    ├─→ Checks for containers with restart: always
    │
    └─→ Starts all ClawDeck containers
        ├─→ postgres
        └─→ api (with auto-migration)
```

**Docker daemon itself** is managed by systemd, not individual containers.

---

## Monitoring Auto-Initialization

### Check Logs

```bash
# Watch initialization happen
docker-compose up -d
docker-compose logs -f api

# Look for initialization messages
docker-compose logs api | grep -E "migration|initializ|✅"
```

### Verify Success

```bash
# Check migrations applied
docker-compose exec api npx prisma migrate status

# Check database
docker-compose exec postgres psql -U clawdeck -d clawdeck_development -c "\dt"

# Check API health
curl http://localhost:3000/health
```

---

## Troubleshooting

### Issue: Migrations Don't Run

**Check**:
```bash
# Is AUTO_MIGRATE set?
docker-compose exec api printenv | grep AUTO_MIGRATE

# Check logs
docker-compose logs api | grep -i migration
```

**Fix**:
```bash
# Add to .env
echo "AUTO_MIGRATE=true" >> .env

# Restart
docker-compose restart api
```

### Issue: Init Scripts Don't Run

**Check**:
```bash
# Init scripts only run on FIRST start
docker volume rm clawdeck_postgres_data
docker-compose down
docker-compose up -d
```

### Issue: Database Already Initialized

**This is normal!**
- Init scripts only run on fresh database
- `ON CONFLICT DO NOTHING` prevents errors
- Migration version tracking prevents re-runs

---

## Production Deployment

### Production Docker Compose

**File**: `docker-compose.prod.yml`

```yaml
version: '3.8'

services:
  postgres:
    environment:
      - POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password
      - POSTGRES_DB=clawdeck_production
    secrets:
      - postgres_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  api:
    environment:
      - NODE_ENV=production
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
      - AUTO_MIGRATE=true
      - AUTO_SEED=false
    secrets:
      - jwt_secret
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt
```

### Deploy

```bash
# Create secrets
echo "strong_password_here" > secrets/postgres_password.txt
openssl rand -hex 32 > secrets/jwt_secret.txt

# Start production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Summary

### Initialization is Automatic!

✅ **No manual migration commands needed**
✅ **No systemd configuration needed**
✅ **Database auto-initializes on first start**
✅ **Migrations auto-run on API startup**
✅ **Services restart automatically**
✅ **Health checks ensure everything is ready**

### Quick Commands

```bash
cd ~/tools/clawdeck/nodejs

# Start (auto-initializes!)
docker-compose up -d

# Watch logs
docker-compose logs -f

# Stop
docker-compose down

# Restart
docker-compose restart
```

### Docker Compose Handles Everything

- ✅ Service orchestration
- ✅ Auto-start on boot (via Docker daemon)
- ✅ Auto-restart on failure
- ✅ Health checks
- ✅ Dependency management
- ✅ Initialization scripts
- ✅ Migration execution
- ✅ Log aggregation

**No additional orchestration needed!**
