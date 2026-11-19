import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4100';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    // A locally installed browser keeps the setup free of a 150 MB download.
    // In CI, omit E2E_CHANNEL and run `npx playwright install chromium`.
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node proxy.mjs',
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
