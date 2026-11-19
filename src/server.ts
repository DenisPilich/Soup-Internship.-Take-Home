import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { seedDemoData } from './db/seed.js';

await migrate();
await seedDemoData();

const app = createApp();
const server = app.listen(config.PORT, () => {
  console.log(`[api] listening on http://localhost:${config.PORT}`);
});

function shutdown(signal: string): void {
  console.log(`[api] ${signal}, shutting down`);
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
