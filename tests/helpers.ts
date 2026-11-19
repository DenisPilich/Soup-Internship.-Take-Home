import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import pg from 'pg';
import request from 'supertest';
import { generateApiKey } from '../src/auth/keys.js';
import { config } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';

// vitest.config.ts points DATABASE_URL at soup_test; the guard below makes a
// misconfiguration loud instead of silently truncating the dev database.
const TEST_DATABASE = 'soup_test';
const adminUrl = config.DATABASE_URL.replace(/\/[^/]+$/, '/soup');

export const testPool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });

let ensured = false;

async function ensureTestDatabase(): Promise<void> {
  if (ensured) return;

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const exists = await admin.query('select 1 from pg_database where datname = $1', [
      TEST_DATABASE,
    ]);
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

  const current = await testPool.query<{ name: string }>('select current_database() as name');
  if (current.rows[0]?.name !== TEST_DATABASE) {
    throw new Error(`tests must run against ${TEST_DATABASE}, got ${current.rows[0]?.name}`);
  }

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

export type SeededProject = {
  projectId: string;
  runId: string;
  apiKey: string;
};

export async function seedProjectWithKey(name: string): Promise<SeededProject> {
  const projectId = randomUUID();
  const runId = randomUUID();
  const key = generateApiKey();

  await testPool.query('insert into projects (id, name) values ($1, $2)', [projectId, name]);
  await testPool.query(
    'insert into api_keys (project_id, prefix, secret_hash) values ($1, $2, $3)',
    [projectId, key.prefix, key.secretHash],
  );
  await testPool.query('insert into runs (id, project_id, name) values ($1, $2, $3)', [
    runId,
    projectId,
    'run-1',
  ]);

  return { projectId, runId, apiKey: key.raw };
}

export async function login(app: Express, apiKey: string): Promise<string> {
  const response = await request(app).post('/api/auth/session').send({ api_key: apiKey });
  if (response.status !== 200) {
    throw new Error(`login failed with status ${response.status}`);
  }

  const header = response.headers['set-cookie'] as unknown as string[] | string | undefined;
  const cookie = Array.isArray(header) ? header[0] : header;
  if (!cookie) throw new Error('no session cookie in response');

  return cookie.split(';')[0]!;
}
