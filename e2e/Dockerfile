# Playwright E2E Test Runner
# Build context should be monorepo root
FROM mcr.microsoft.com/playwright:v1.42.0-jammy

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

# Install Playwright browsers
RUN npx playwright install --with-deps chromium

# Run tests
CMD ["npx", "playwright", "test", "--reporter=list"]
