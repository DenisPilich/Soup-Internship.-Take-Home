import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { config } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';

// Tests never touch the development database: they create and use a separate
// one, so `npm test` cannot wipe the demo data.
const TEST_DATABASE = 'soup_test';
const testUrl = config.DATABASE_URL.replace(/\/[^/]+$/, `/${TEST_DATABASE}`);

export const testPool = new pg.Pool({ connectionString: testUrl, max: 10 });

let ensured = false;

async function ensureTestDatabase(): Promise<void> {
  if (ensured) return;

  const admin = new pg.Client({ connectionString: config.DATABASE_URL });
  await admin.connect();
  try {
    const exists = await admin.query('select 1 from pg_database where datname = $1', [TEST_DATABASE]);
    if (exists.rowCount === 0) {
      await admin.query(`create database ${TEST_DATABASE}`);
    }
  } finally {
    await admin.end();
  }

  ensured = true;
}

export async function resetDb(): Promise<void> {
  await ensureTestDatabase();
  await migrate(testPool);
  await testPool.query('truncate projects cascade');
}

export async function seedProjectAndRun(): Promise<{ projectId: string; runId: string }> {
  const projectId = randomUUID();
  const runId = randomUUID();

  await testPool.query('insert into projects (id, name) values ($1, $2)', [
    projectId,
    'test-project',
  ]);
  await testPool.query('insert into runs (id, project_id, name) values ($1, $2, $3)', [
    runId,
    projectId,
    'test-run',
  ]);

  return { projectId, runId };
}
