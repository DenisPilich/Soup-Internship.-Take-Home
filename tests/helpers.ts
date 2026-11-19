import { randomUUID } from 'node:crypto';
import { migrate } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';

export async function resetDb(): Promise<void> {
  await migrate();
  await pool.query('truncate projects cascade');
}

export async function seedProjectAndRun(): Promise<{ projectId: string; runId: string }> {
  const projectId = randomUUID();
  const runId = randomUUID();

  await pool.query('insert into projects (id, name) values ($1, $2)', [projectId, 'test-project']);
  await pool.query('insert into runs (id, project_id, name) values ($1, $2, $3)', [
    runId,
    projectId,
    'test-run',
  ]);

  return { projectId, runId };
}
