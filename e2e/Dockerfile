# Playwright E2E Test Runner
FROM mcr.microsoft.com/playwright:v1.42.0-jammy

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
COPY e2e/package.json ./e2e/

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy E2E test files
COPY e2e/ ./e2e/

WORKDIR /app/e2e

# Install Playwright browsers
RUN npx playwright install --with-deps chromium

# Run tests
CMD ["npx", "playwright", "test", "--reporter=list"]
