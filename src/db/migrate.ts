import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { pool } from './pool.js';

export async function migrate(target: Pool = pool): Promise<void> {
  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  const client = await target.connect();
  try {
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const entry = process.argv[1];
if (entry && path.resolve(entry) === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => pool.end())
    .then(() => {
      console.log('[migrate] schema applied');
    })
    .catch((error: unknown) => {
      console.error('[migrate] failed', error);
      process.exitCode = 1;
    });
}
