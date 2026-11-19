import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashSecret, parseApiKey } from '../auth/keys.js';
import { config } from '../config.js';
import { pool } from './pool.js';

// Fixed ids make the seed idempotent and the demo predictable. They are not
// secrets and are not used for authorization.
const PROJECT_A = '00000000-0000-4000-8000-0000000000a1';
const PROJECT_B = '00000000-0000-4000-8000-0000000000b2';
const RUN_A = '00000000-0000-4000-8000-0000000000c1';
const RUN_B = '00000000-0000-4000-8000-0000000000c2';

type DemoProject = {
  id: string;
  name: string;
  rawKey: string | undefined;
  runId: string;
  runName: string;
};

const demoProjects: DemoProject[] = [
  { id: PROJECT_A, name: 'Project A', rawKey: config.SEED_KEY_A, runId: RUN_A, runName: 'demo-run-a' },
  { id: PROJECT_B, name: 'Project B', rawKey: config.SEED_KEY_B, runId: RUN_B, runName: 'demo-run-b' },
];

export async function seedDemoData(): Promise<void> {
  let created = 0;

  for (const project of demoProjects) {
    if (!project.rawKey) continue;

    const parsed = parseApiKey(project.rawKey);
    if (!parsed) {
      console.warn(`[seed] skipping ${project.name}: SEED_KEY is not a valid API key`);
      continue;
    }

    const insertedProject = await pool.query(
      `insert into projects (id, name) values ($1, $2)
       on conflict (id) do nothing
       returning id`,
      [project.id, project.name],
    );

    await pool.query(
      `insert into api_keys (project_id, prefix, secret_hash) values ($1, $2, $3)
       on conflict (prefix) do nothing`,
      [project.id, parsed.prefix, hashSecret(parsed.secret)],
    );

    await pool.query(
      `insert into runs (id, project_id, name) values ($1, $2, $3)
       on conflict (id) do nothing`,
      [project.runId, project.id, project.runName],
    );

    if (insertedProject.rowCount === 1) created += 1;
  }

  if (created > 0) {
    console.log(`[seed] created ${created} demo project(s)`);
  }
}

const entry = process.argv[1];
if (entry && path.resolve(entry) === fileURLToPath(import.meta.url)) {
  seedDemoData()
    .then(() => pool.end())
    .then(() => {
      console.log('[seed] done');
    })
    .catch((error: unknown) => {
      console.error('[seed] failed', error);
      process.exitCode = 1;
    });
}
