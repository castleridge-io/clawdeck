# Node.js Dockerfile for ClawDeck API
# Build context should be monorepo root
FROM node:20-alpine

# Install netcat for database health checking
RUN apk add --no-cache netcat-openbsd

# Create non-root user first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory and give ownership to nodejs user
WORKDIR /app
RUN chown nodejs:nodejs /app

# Enable Corepack for Yarn 4 support
RUN corepack enable && corepack prepare yarn@4.9.1 --activate

# Copy workspace root files with proper ownership
COPY --chown=nodejs:nodejs package.json yarn.lock .yarnrc.yml ./
COPY --chown=nodejs:nodejs nodejs/package.json ./nodejs/

# Switch to non-root user before install
USER nodejs

# Install all workspaces
RUN yarn install && yarn cache clean

# Copy API source with proper ownership
COPY --chown=nodejs:nodejs nodejs ./nodejs

WORKDIR /app/nodejs

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript to dist/
RUN npx tsc || true

# Make entrypoint executable
RUN chmod +x scripts/docker-entrypoint.sh

# Expose port
EXPOSE 3000

# Health check (BusyBox-compatible wget, use IPv4)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -q -T 10 -t 1 -O /dev/null http://127.0.0.1:3000/up || exit 1

# Use entrypoint script for migrations, then run CMD
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
