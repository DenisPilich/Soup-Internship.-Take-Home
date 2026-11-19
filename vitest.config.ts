import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only the API/integration suites; e2e/ belongs to Playwright.
    include: ['tests/**/*.test.ts'],
    // All integration tests share one database and truncate between tests.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      // Tests never touch the development database.
      DATABASE_URL: 'postgres://soup:soup@localhost:5432/soup_test',
    },
  },
});
