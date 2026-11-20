import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import pg from 'pg';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:3000';
const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://soup:soup@localhost:5432/soup';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4100';

const db = new pg.Client({ connectionString: DB_URL });
const projectIds: string[] = [];

type UiEvent = {
  seq: number;
  event_id: string;
  name: string;
  value: number;
  ts: string;
};

type UiState = {
  events: UiEvent[];
  cursor: number;
  status: string;
};

type DbEvent = UiEvent;

test.beforeAll(async () => {
  await db.connect();
});

test.afterAll(async () => {
  if (projectIds.length > 0) {
    await db.query('delete from projects where id = any($1::uuid[])', [projectIds]);
  }
  await db.end();
});

test.afterEach(async ({ request }) => {
  // A failed test must not leave the shared proxy offline for the next one.
  await request.post('/__online').catch(() => undefined);
});

async function seedProject(name: string): Promise<{ projectId: string; apiKey: string }> {
  const projectId = randomUUID();
  const prefix = randomBytes(4).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  const apiKey = `soup_${prefix}_${secret}`;

  await db.query('insert into projects (id, name) values ($1, $2)', [projectId, name]);
  await db.query(
    'insert into api_keys (project_id, prefix, secret_hash) values ($1, $2, $3)',
    [projectId, prefix, createHash('sha256').update(secret).digest()],
  );

  projectIds.push(projectId);
  return { projectId, apiKey };
}

async function login(page: Page, apiKey: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('API key').fill(apiKey);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Runs', exact: true })).toBeVisible();
}

async function createRun(page: Page, name: string): Promise<string> {
  await page.getByLabel('new run name').fill(name);
  await page.getByRole('button', { name: 'Create run' }).click();
  await page.locator('.runs-table').getByRole('link', { name: new RegExp(name) }).click();

  const main = page.locator('main[data-run-id]');
  await expect(main).toBeVisible();
  await expect(main).toHaveAttribute('data-stream-state', 'live');

  const runId = await main.getAttribute('data-run-id');
  if (!runId) throw new Error('run id is missing from the page');
  return runId;
}

function metric(offsetSeconds: number, value: number) {
  return {
    event_id: randomUUID(),
    name: 'loss',
    value,
    ts: new Date(Date.UTC(2026, 0, 1, 0, 0, offsetSeconds)).toISOString(),
  };
}

async function ingest(
  runId: string,
  apiKey: string,
  events: unknown[],
): Promise<{ accepted: number; duplicates: number; last_seq: number }> {
  const response = await fetch(`${API}/runs/${runId}/metrics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ events }),
  });

  expect(response.ok, `ingest failed with ${response.status}`).toBeTruthy();
  return (await response.json()) as { accepted: number; duplicates: number; last_seq: number };
}

async function uiState(page: Page): Promise<UiState> {
  return (await page.evaluate(() =>
    (window as unknown as { __getRunState: () => unknown }).__getRunState(),
  )) as UiState;
}

async function dbEvents(runId: string): Promise<DbEvent[]> {
  const result = await db.query(
    'select seq, event_id, name, value, ts from metric_events where run_id = $1 order by seq',
    [runId],
  );

  return result.rows.map((row) => ({
    seq: Number(row.seq),
    event_id: row.event_id as string,
    name: row.name as string,
    value: row.value as number,
    ts: (row.ts as Date).toISOString(),
  }));
}

async function expectConvergence(page: Page, runId: string): Promise<void> {
  const expected = await dbEvents(runId);

  await expect
    .poll(async () => (await uiState(page)).events.length, { timeout: 20_000 })
    .toBe(expected.length);

  const ui = await uiState(page);
  const dbRows = await dbEvents(runId);

  expect(ui.events.map((event) => event.seq)).toEqual(dbRows.map((event) => event.seq));
  expect(ui.events.map((event) => event.event_id)).toEqual(dbRows.map((event) => event.event_id));
  expect(ui.events.map((event) => event.ts)).toEqual(dbRows.map((event) => event.ts));
  expect(ui.events.map((event) => event.value)).toEqual(dbRows.map((event) => event.value));
  expect(ui.cursor).toBe(dbRows.length);

  await expect(page.locator('main[data-run-id]')).toHaveAttribute(
    'data-event-count',
    String(dbRows.length),
  );
  await expect(page.locator('main[data-run-id]')).toHaveAttribute(
    'data-cursor',
    String(dbRows.length),
  );
}

test('the page converges to the database across disorder, duplicates, lateness and a dropped connection', async ({
  page,
}) => {
  const project = await seedProject('E2E consistency');
  await login(page, project.apiKey);
  const runId = await createRun(page, 'consistency-run');

  const first = metric(10, 1);
  const third = metric(30, 3);
  const second = metric(20, 2);
  const late = metric(5, 0.5);

  await ingest(runId, project.apiKey, [first, third]);
  await ingest(runId, project.apiKey, [second]);

  const duplicate = await ingest(runId, project.apiKey, [first, third]);
  expect(duplicate).toMatchObject({ accepted: 0, duplicates: 2, last_seq: 3 });

  await ingest(runId, project.apiKey, [late]);

  await expectConvergence(page, runId);
  await expect(page.locator('.chart svg text').last()).toHaveText('4 pts');

  // The page sorted the points by timestamp, not by arrival: 0.5 is rendered
  // first even though it received seq 4.
  const chartValues = await page.locator('.chart .chart-last').textContent();
  expect(chartValues).toBe('3');

  // Cut the network at the socket level.
  await page.request.post('/__offline');
  await expect(page.locator('main[data-run-id]')).toHaveAttribute(
    'data-stream-state',
    'reconnecting',
  );

  await ingest(runId, project.apiKey, [metric(40, 4), metric(50, 5)]);

  await page.waitForTimeout(1500);
  expect((await uiState(page)).cursor).toBe(4);

  // Bring it back. The browser reconnects by itself and replays from its
  // Last-Event-ID; the page must catch up without duplicates.
  await page.request.post('/__online');
  await expect(page.locator('main[data-run-id]')).toHaveAttribute('data-stream-state', 'live', {
    timeout: 20_000,
  });

  await expectConvergence(page, runId);

  const ui = await uiState(page);
  expect(ui.cursor).toBe(6);
  expect(new Set(ui.events.map((event) => event.seq)).size).toBe(ui.events.length);
});

test('project B cannot open the run page of project A', async ({ page, browser }) => {
  const a = await seedProject('E2E project A');
  const b = await seedProject('E2E project B');

  await login(page, a.apiKey);
  const runId = await createRun(page, 'private-run');

  const contextB = await browser.newContext({ baseURL: BASE_URL });
  const pageB = await contextB.newPage();

  try {
    await login(pageB, b.apiKey);
    await expect(pageB.getByText('private-run')).toHaveCount(0);

    await pageB.goto(`/runs/${runId}`);
    await expect(pageB.getByText('Run not found')).toBeVisible();
    await expect(pageB.locator('main[data-run-id]')).toHaveAttribute(
      'data-stream-state',
      'not_found',
    );
  } finally {
    await contextB.close();
  }
});
