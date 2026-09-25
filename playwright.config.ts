import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3200',
    trace: 'retain-on-failure',
    ...(executablePath && { launchOptions: { executablePath } }),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node dist/server/index.mjs',
    url: 'http://localhost:3200/api/health',
    env: { PORT: '3200', DATA_FILE: `test-results/e2e-${Date.now()}.json` },
    reuseExistingServer: false,
  },
});
