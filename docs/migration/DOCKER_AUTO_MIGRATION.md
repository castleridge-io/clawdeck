# Auto-Migration Setup for Docker Compose

## Overview

The ClawDeck API server now automatically runs database migrations on startup when running in Docker Compose. No manual intervention needed!

---

## How It Works

### Docker Compose Environment Variable

**File**: `~/tools/clawdeck/nodejs/.env`

```bash
# Auto-migrate database on startup (true/false)
AUTO_MIGRATE=true

# Auto-seed database on startup (true/false)
AUTO_SEED=false

# Other settings
NODE_ENV=development
DATABASE_URL=postgresql://clawdeck:password@postgres:5432/clawdeck_development
JWT_SECRET=your-secret-here
```

### Startup Sequence

```
Docker Compose starts
    │
    ├─→ PostgreSQL starts (with health check)
    │
    ├─→ API waits for PostgreSQL healthy
    │
    └─→ API starts
        │
        ├─→ Check AUTO_MIGRATE=true
        │
        ├─→ Generate Prisma client
        │
        ├─→ Run migrations: npx prisma migrate deploy
        │
        ├─→ Check AUTO_SEED (optional)
        │
        └─→ Start API server
```

---

## Initialization Script

### Automatic Database Init (PostgreSQL)

**Directory**: `~/tools/clawdeck/nodejs/postgres/init/`

**Create init script**:

```bash
mkdir -p ~/tools/clawdeck/nodejs/postgres/init
```

**File**: `~/tools/clawdeck/nodejs/postgres/init/01-init-database.sh`

```bash
#!/bin/bash
# Initialize database with extensions and basic setup

echo "🔧 Initializing ClawDeck database..."

# Create extensions
psql -U clawdeck -d clawdeck_development << 'EOSQL'
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_status_board ON tasks(status, board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_to_agent) WHERE assigned_to_agent = true;
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

-- Log initialization
INSERT INTO _clawdeck_migrations (version, applied_at)
VALUES ('001_initial_setup', NOW())
ON CONFLICT (version) DO NOTHING;
EOSQL

echo "✅ Database initialized successfully"
```

**Make it executable**:

```bash
chmod +x ~/tools/clawdeck/nodejs/postgres/init/01-init-database.sh
```

---

## Migration Tracking Table

### Create Migration Table

**Add to Prisma schema** (`nodejs/prisma/schema.prisma`):

```prisma
// Migration tracking table
model _ClawdeckMigration {
  version   String   @id
  appliedAt DateTime @default(now())

  @@map("_clawdeck_migrations")
}
```

---

## Docker Compose Features

### Restart Policy

All services have `restart: unless-stopped`, which means:

- **Auto-start on boot** (if Docker daemon starts)
- **Auto-restart on crash**
- **Auto-restart on error**
- **Only stops if explicitly stopped**

**No systemd needed!**

### Health Checks

**PostgreSQL health check**:
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready", "-U", "clawdeck"]
  interval: 10s
  timeout: 5s
  retries: 5
```

**API health check**:
```yaml
healthcheck:
  test: ["CMD-SHELL", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/healthz", "--timeout=5"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

**Dependency management**:
```yaml
depends_on:
  postgres:
    condition: service_healthy
```

API waits for PostgreSQL to be healthy before starting.

---

## Complete Startup Flow

```
┌─────────────────────────────────────────────────────────────┐
│ docker-compose up -d                                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │ Docker Compose reads .env file │
        │   - AUTO_MIGRATE=true           │
        │   - AUTO_SEED=false            │
        └────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │ PostgreSQL container starts    │
        │ - Runs init scripts             │
        │ - Starts health check            │
        └────────────────────────────────┘
                         │
                         ▼ (waits for healthy)
        ┌────────────────────────────────┐
        │ API container starts            │
        │ - Checks AUTO_MIGRATE=true     │
        │ - Connects to PostgreSQL       │
        │ - Runs migrations:              │
        │   1. npx prisma generate       │
        │   2. npx prisma migrate deploy │
        │ - Starts API server             │
        └────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │ API server listening on :3000  │
        │ Health check returns 200 OK      │
        │ Ready to accept requests!       │
        └────────────────────────────────┘
```

---

## Environment Variables Reference

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://clawdeck:password@postgres:5432/clawdeck_development
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=clawdeck_development

# Security
JWT_SECRET=generate_with_openssl_rand_hex_32

# Application
NODE_ENV=development (or production)
PORT=3000
LOG_LEVEL=info (or debug, warn, error)
```

### Optional Variables

```bash
# Auto-migration (default: true)
AUTO_MIGRATE=true

# Auto-seeding (default: false)
AUTO_SEED=false

# API timeout (default: 300000ms)
API_TIMEOUT_MS=300000

# Ports (if defaults conflict)
API_PORT=3000
POSTGRES_PORT=5432
REDIS_PORT=6379
```

---

## First Time Setup

### 1. Create Environment File

```bash
cd ~/tools/clawdeck/nodejs
cp .env.docker.example .env
```

### 2. Generate Secure Values

```bash
# Generate JWT secret
JWT_SECRET=$(openssl rand -hex 32)
echo "JWT_SECRET=$JWT_SECRET" >> .env

# Generate database password
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" >> .env

# Generate production secret if needed
```

### 3. Start Services

```bash
cd ~/tools/clawdeck/nodejs

# Start everything
docker-compose up -d

# Watch logs
docker-compose logs -f
```

### 4. Verify Initialization

```bash
# Check all services are running
docker-compose ps

# Check API health
curl http://localhost:3000/health

# Check database
docker-compose exec postgres psql -U clawdeck -d clawdeck_development -c "SELECT 1"

# Check migrations ran
docker-compose logs api | grep -i migration
```

---

## Subsequent Starts

### Normal Startup

```bash
cd ~/tools/clawdeck/nodejs
docker-compose up -d
```

**What happens**:
1. All containers start
2. Health checks pass
3. API server starts (skips migrations if already applied)
4. Ready to serve requests

### After Code Changes

```bash
# Rebuild and restart
docker-compose up -d --build api

# Just restart (no rebuild)
docker-compose restart api
```

### Database Changes

```bash
# Run new migrations
docker-compose exec api npx prisma migrate deploy

# Generate Prisma client
docker-compose exec api npx prisma generate

# Restart API
docker-compose restart api
```

---

## Monitoring

### Check Service Status

```bash
# All services
docker-compose ps

# Specific service logs
docker-compose logs -f api
docker-compose logs -f postgres

# Resource usage
docker stats
```

### Health Checks

```bash
# API health
curl http://localhost:3000/health

# Database connection
docker-compose exec postgres pg_isready -U clawdeck

# View container health status
docker inspect clawdeck-api | jq '.[0].State.Health'
```

---

## Troubleshooting

### Issue: Migrations Fail

**Check logs**:
```bash
docker-compose logs api | grep -i error
docker-compose logs postgres
```

**Manual migration**:
```bash
# Connect to container
docker-compose exec api sh

# Run migrations manually
npx prisma migrate deploy

# Check database
npx prisma studio
```

### Issue: Services Won't Start

**Check port conflicts**:
```bash
netstat -tuln | grep -E '3000|5432|6379'
```

**Rebuild from scratch**:
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

---

## Production Considerations

### Production .env

```bash
NODE_ENV=production
AUTO_MIGRATE=true
AUTO_SEED=false
POSTGRES_PASSWORD=<strong-password>
JWT_SECRET=<production-secret>
API_TIMEOUT_MS=30000
LOG_LEVEL=warn
```

### Backup Strategy

```bash
# Backup database
docker-compose exec postgres pg_dump -U clawdeck clawdeck_production > backup_$(date +%Y%m%d).sql

# Backup volumes
docker run --rm -v clawdeck_postgres_data:/data -v $(pwd):/backup ubuntu \
  tar czf /backup/postgres_$(date +%Y%m%d).tar.gz /data
```

### Update Strategy

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose up -d --build api

# Run any new migrations
docker-compose exec api npx prisma migrate deploy
```

---

## Summary

### Auto-Initialization Features

| Feature | Description | Default |
|---------|-------------|---------|
| **AUTO_MIGRATE** | Run migrations on startup | `true` |
| **AUTO_SEED** | Seed database on startup | `false` |
| **Health Checks** | Ensure services are healthy | Enabled |
| **Restart Policy** | Auto-restart on failure | `unless-stopped` |
| **Dependency Management** | API waits for PostgreSQL | Enabled |

### No Systemd Needed

Docker Compose handles everything:
- ✅ Auto-start on boot (Docker daemon auto-start)
- ✅ Auto-restart on crash
- ✅ Health checks
- ✅ Dependency management
- ✅ Initialization scripts

### Quick Commands

```bash
cd ~/tools/clawdeck/nodejs

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Restart services
docker-compose restart

# Rebuild after changes
docker-compose up -d --build
```

### Full Documentation

- **Docker Compose**: `docker-compose.yml` (project root)
- **Dockerfile**: `nodejs/Dockerfile`
- **Setup Guide**: `docs/migration/DOCKER_SETUP.md`
- **Server Requirements**: `docs/migration/CLAWDECK_SERVER_REQUIREMENTS.md`
