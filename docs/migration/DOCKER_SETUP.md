# ClawDeck Docker Compose Setup

## Overview

Run ClawDeck API and PostgreSQL using Docker Compose for easy deployment and management.

---

## Quick Start

### 1. Create Environment File

```bash
cd ~/tools/clawdeck/nodejs
cp .env.docker.example .env

# Edit .env and update values (especially JWT_SECRET)
nano .env
```

**Generate secure JWT secret**:
```bash
openssl rand -hex 32
```

### 2. Start Services

```bash
cd ~/tools/clawdeck/nodejs

# Start PostgreSQL and API
docker-compose up -d

# View logs
docker-compose logs -f api
```

### 3. Initialize Database

```bash
# Run Prisma migrations
docker-compose exec api npx prisma migrate deploy

# Generate Prisma client
docker-compose exec api npx prisma generate

# (Optional) Seed database
docker-compose exec api yarn prisma:seed
```

### 4. Verify Services

```bash
# Check services are running
docker-compose ps

# Check API health
curl http://localhost:3000/health

# Check database connection
docker-compose exec postgres pg_isready -U clawdeck
```

---

## Service Details

### PostgreSQL Database

**Container**: `clawdeck-postgres`
**Port**: `5432`
**Database**: `clawdeck_development`
**User**: `clawdeck`
**Password**: From `.env` file

**Connect directly**:
```bash
docker-compose exec postgres psql -U clawdeck -d clawdeck_development
```

**Backup database**:
```bash
docker-compose exec postgres pg_dump -U clawdeck clawdeck_development > backup.sql
```

**Restore database**:
```bash
docker-compose exec -T postgres psql -U clawdeck clawdeck_development < backup.sql
```

### ClawDeck API

**Container**: `clawdeck-api`
**Port**: `3000`
**Health**: `http://localhost:3000/health`

**View logs**:
```bash
docker-compose logs -f api
```

**Restart API**:
```bash
docker-compose restart api
```

**Run commands in container**:
```bash
# Open shell in container
docker-compose exec api sh

# Run Prisma Studio
docker-compose exec api yarn prisma studio

# Run tests
docker-compose exec api yarn test

# Generate Prisma client
docker-compose exec api npx prisma generate
```

---

## Docker Compose Commands

### Basic Commands

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d postgres

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f api

# View service status
docker-compose ps
```

### Development Commands

```bash
# Rebuild API after code changes
docker-compose up -d --build api

# Restart API with hot reload
docker-compose restart api

# Run API in development mode
docker-compose run --rm --service-ports api yarn dev

# Run tests
docker-compose exec api yarn test

# Open Prisma Studio
docker-compose exec api npx prisma studio

# Create migration
docker-compose exec api npx prisma migrate dev --name add_new_field

# Deploy migrations
docker-compose exec api npx prisma migrate deploy
```

### Maintenance Commands

```bash
# Update dependencies
docker-compose exec api yarn install
docker-compose restart api

# Database backup
docker-compose exec postgres pg_dump -U clawdeck clawdeck_development > backup_$(date +%Y%m%d).sql

# Check database size
docker-compose exec postgres psql -U clawdeck -d clawdeck_development -c "SELECT pg_size_pretty(pg_database_size('clawdeck_development'));"

# View recent queries
docker-compose exec postgres psql -U clawdeck -d clawdeck_development -c "SELECT * FROM pg_stat_statements ORDER BY calls DESC LIMIT 10;"
```

---

## Production Deployment

### Using Docker Compose in Production

**1. Create production environment file**:
```bash
cp .env.docker.example .env.production

# Edit values
NODE_ENV=production
POSTGRES_PASSWORD=<strong-password>
JWT_SECRET=<generated-secret>
```

**2. Use production override file**:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**3. Set up reverse proxy** (Nginx):
```bash
# Enable nginx profile
docker-compose --profile with-nginx up -d
```

### Production Docker Compose Override

**File**: `docker-compose.prod.yml`

```yaml
version: '3.8'

services:
  postgres:
    environment:
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB:-clawdeck_production}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  api:
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - DATABASE_URL=postgresql://clawdeck:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-clawdeck_production}
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

---

## Networking

### Service Communication

Services communicate via Docker network `clawdeck-network`:

```
┌─────────────────┐
│ clawdeck-api    │
│ (port 3000)     │
└────────┬────────┘
         │
         │ Network: clawdeck-network
         │
         ├────────────────────┐
         │                    │
┌────────▼────────┐  ┌────────▼────────┐
│ clawdeck-postgres│  │ clawdeck-redis  │
│ (port 5432)     │  │ (port 6379)     │
└─────────────────┘  └─────────────────┘
```

### Access from Host Machine

- **API**: `http://localhost:3000`
- **PostgreSQL**: `localhost:5432`
- **Redis**: `localhost:6379`

### Access from OpenClaw Agents

**Configure OpenClaw** to use Docker services:

**File**: `~/.openclaw/config/clawdeck.json`

```json
{
  "apiUrl": "http://localhost:3000/api/v1",
  "wsUrl": "ws://localhost:3000/ws",
  "timeout": 5000,
  "retryAttempts": 3
}
```

---

## Troubleshooting

### Issue: Services Won't Start

```bash
# Check logs
docker-compose logs

# Check specific service
docker-compose logs api

# Check port conflicts
netstat -tuln | grep -E '3000|5432|6379'

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Issue: Database Connection Failed

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U clawdeck -d clawdeck_development -c "SELECT 1"

# Check DATABASE_URL in API container
docker-compose exec api printenv | grep DATABASE_URL
```

### Issue: API Not Responding

```bash
# Check API is running
docker-compose ps api

# Check API health
curl http://localhost:3000/health

# Check API logs
docker-compose logs api

# Restart API
docker-compose restart api
```

### Issue: Need to Rebuild After Code Changes

```bash
# Stop services
docker-compose down

# Rebuild API image
docker-compose build api

# Start services
docker-compose up -d

# View logs
docker-compose logs -f api
```

---

## Cleanup

### Stop and Remove Everything

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (deletes data!)
docker-compose down -v
```

### Remove Specific Volume

```bash
# Remove PostgreSQL data
docker volume rm clawdeck_postgres_data

# Remove Redis data
docker volume rm clawdeck_redis_data
```

---

## Integration with OpenClaw

### Update OpenClaw Configuration

**File**: `~/.openclaw/config/clawdeck.json`

```json
{
  "apiUrl": "http://localhost:3000/api/v1",
  "wsUrl": "ws://localhost:3000/ws",
  "timeout": 5000,
  "retryAttempts": 3,
  "fallbackEnabled": true
}
```

### Test Connection from OpenClaw

```bash
# From OpenClaw workspace
cd ~/.openclaw
curl http://localhost:3000/api/v1/health

# Should return:
{
  "healthy": true,
  "server": "clawdeck-api"
}
```

### Auto-Start on Boot

**Create systemd service** to start Docker Compose on boot:

**File**: `/etc/systemd/system/clawdeck-docker.service`

```ini
[Unit]
Description=ClawDeck Docker Compose
Requires=docker.service
After=docker.service
StartLimitIntervalSec=500

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/montelai/tools/clawdeck/nodejs
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
```

**Enable service**:
```bash
sudo systemctl enable clawdeck-docker.service
sudo systemctl start clawdeck-docker.service
```

---

## Summary

### Docker Compose Services

| Service | Container | Ports | Purpose |
|---------|-----------|-------|---------|
| **PostgreSQL** | clawdeck-postgres | 5432 | Database |
| **API** | clawdeck-api | 3000 | Task management API |
| **Redis** | clawdeck-redis | 6379 | Caching (optional) |
| **Nginx** | clawdeck-nginx | 80, 443 | Reverse proxy (optional) |

### Quick Commands

```bash
cd ~/tools/clawdeck/nodejs

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down

# Restart services
docker-compose restart

# Run commands in API container
docker-compose exec api npx prisma studio
```

### Production Setup

1. Create strong passwords
2. Generate secure JWT secret
3. Use production environment file
4. Enable nginx reverse proxy
5. Set up systemd service for auto-start
6. Configure backups
7. Monitor health and logs
