# Playwright E2E Test Runner
# Build context should be monorepo root
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# Enable Corepack for Yarn 4 support
RUN corepack enable && corepack prepare yarn@4.9.1 --activate

# Copy workspace root files
COPY package.json yarn.lock .yarnrc.yml ./
COPY e2e/package.json ./e2e/

# Install all workspaces
RUN yarn install

# Copy E2E test files
COPY e2e/ ./e2e/

WORKDIR /app/e2e

# Browsers are pre-installed in the base image (matching v1.58.2)

# Wait for services to be ready, then run tests
CMD sh -c '\
  FRONTEND="${FRONTEND_URL:-http://frontend-e2e:3002}" && \
  API="${API_URL:-http://api-e2e:3000}" && \
  echo "Waiting for frontend at $FRONTEND..." && \
  for i in $(seq 1 60); do \
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND" 2>/dev/null) && \
    if [ "$CODE" != "000" ]; then echo "Frontend ready (HTTP $CODE)"; break; fi; \
    echo "  Attempt $i: not reachable yet, retrying in 3s..."; sleep 3; \
  done && \
  echo "Waiting for API at $API/up..." && \
  for i in $(seq 1 30); do \
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/up" 2>/dev/null) && \
    if [ "$CODE" = "200" ]; then echo "API ready (HTTP $CODE)"; break; fi; \
    echo "  Attempt $i: HTTP $CODE - retrying in 3s..."; sleep 3; \
  done && \
  echo "All services ready. Running Playwright tests..." && \
  npx playwright test --reporter=list'
