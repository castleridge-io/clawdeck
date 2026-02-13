# ClawDeck Development Guide

## Project Requirements

**TypeScript is REQUIRED for all backend code.**

- All new services, routes, and middleware MUST be written in TypeScript (`.ts`)
- Existing JavaScript files should be converted to TypeScript when modified
- Use strict type checking - no `any`, `as unknown as`, or `@ts-ignore`
- Run `yarn typecheck` or `tsc --noEmit` before committing

## Docker / Local Development

Non-standard ports are used by default to avoid conflicts with other Docker containers.

### Port Configuration (Defaults)

| Service    | Standard Port | ClawDeck Port |
| ---------- | ------------- | ------------- |
| API        | 3000          | 3333          |
| PostgreSQL | 5432          | 15432         |
| Redis      | 6379          | 16379         |

### Running Docker Services

```bash
# From project root (docker-compose.yml is in root)
# .env file is present with API_PORT=3333, POSTGRES_PORT=15432, etc.

# Start core services (postgres + api + frontend)
docker-compose up -d

# Start with Redis (optional)
docker-compose --profile with-redis up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Local Development (without Docker)

If running Node.js directly, update DATABASE_URL to use the custom PostgreSQL port:

```bash
DATABASE_URL="postgresql://clawdeck:password@localhost:15432/clawdeck_development"
```

### Connecting from Outside Docker

- API: `http://localhost:3333`
- PostgreSQL: `localhost:15432`
- Redis: `localhost:16379`
