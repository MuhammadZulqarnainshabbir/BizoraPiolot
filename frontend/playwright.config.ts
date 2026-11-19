import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests. `npm run e2e` starts the API on port 3999 (against its own throwaway
 * database) and the web app on port 4300, so they never touch the servers you use for development.
 * MongoDB must be running as a replica set (same requirement as the app).
 */
const CI = !!process.env['CI'];
const MONGO_URI = process.env['E2E_MONGO_URI'] ?? 'mongodb://127.0.0.1:27017/bizora_pilot_e2e?directConnection=true';

export default defineConfig({
  testDir: './e2e',
  timeout: 300_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4300',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    // Locally the installed Chrome is used, so no browser download is needed; CI installs Chromium.
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(CI ? {} : { channel: 'chrome' }) } }
  ],
  webServer: [
    {
      command: 'npm start',
      cwd: '../backend',
      url: 'http://localhost:3999/api/health',
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        PORT: '3999',
        NODE_ENV: 'test',
        MONGO_URI,
        JWT_SECRET: 'e2e-only-secret-that-is-long-enough-for-hs256-signing',
        CLIENT_ORIGIN: 'http://localhost:4300'
      }
    },
    {
      command: 'npx ng serve --port 4300 --configuration development --proxy-config e2e/proxy.conf.json',
      url: 'http://localhost:4300',
      timeout: 240_000,
      reuseExistingServer: false
    }
  ]
});
