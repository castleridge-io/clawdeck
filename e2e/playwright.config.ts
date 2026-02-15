import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputDir: '../e2e-results/html' }]],
  use: {
    // FRONTEND_URL is set by:
    // - .env.e2e when running from host (http://localhost:4002)
    // - docker-compose.e2e.yml when running in Docker (http://frontend-e2e:3002)
    baseURL: process.env.FRONTEND_URL || 'http://localhost:4002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
