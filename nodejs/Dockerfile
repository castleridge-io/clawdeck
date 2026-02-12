# Node.js Dockerfile for ClawDeck API
FROM node:20-alpine

# Install netcat for database health checking
RUN apk add --no-cache netcat-openbsd

# Create non-root user first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies as root, then chown only what's needed
RUN npm ci --only=production && npm cache clean --force && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Copy application source (runs as nodejs, so no chown needed)
COPY --chown=nodejs:nodejs . .

# Generate Prisma client
RUN npx prisma generate

# Make entrypoint executable
RUN chmod +x scripts/docker-entrypoint.sh

# Expose port
EXPOSE 3000

# Health check (BusyBox-compatible wget, use IPv4)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -q -T 10 -t 1 -O /dev/null http://127.0.0.1:3000/up || exit 1

# Use entrypoint script for migrations
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
