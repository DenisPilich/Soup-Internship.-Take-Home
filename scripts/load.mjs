// Closed-loop ingestion load test.
//
// 50 runs x 10 events/sec for 30 seconds by default: 500 events/sec. Each run
// is a separate worker that sends a batch every (BATCH / RATE) seconds. When a
// request is slower than that interval the achieved rate drops, which is
// exactly what a closed-loop test should reveal.
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const API = process.env.API_URL ?? 'http://127.0.0.1:3000';
const KEY =
  process.env.API_KEY ?? 'soup_demoa001_1f8c2b6e4a9d4f7c8b3e5a1d6f9c2b7e4a8d1f3c';
const RUNS = Number(process.env.RUNS ?? 50);
const RATE = Number(process.env.RATE ?? 10);
const DURATION = Number(process.env.DURATION ?? 30);
const BATCH = Number(process.env.BATCH ?? 5);
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://soup:soup@localhost:5432/soup';

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function login() {
  const response = await fetch(`${API}/api/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_key: KEY }),
  });
  if (!response.ok) throw new Error(`login failed: ${response.status}`);

  const header = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie');
  if (!header) throw new Error('no session cookie');
  return header.split(';')[0];
}

async function createRun(cookie, index) {
  const response = await fetch(`${API}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: `load-${Date.now()}-${index}` }),
  });
  if (!response.ok) throw new Error(`create run failed: ${response.status}`);
  const body = await response.json();
  return body.run.id;
}

const cookie = await login();
const runIds = [];
for (let index = 0; index < RUNS; index += 1) {
  runIds.push(await createRun(cookie, index));
}
console.log(`created ${runIds.length} runs; target ${RUNS * RATE} events/sec for ${DURATION}s`);

const latencies = [];
let accepted = 0;
const failures = [];

async function worker(runId) {
  const interval = (BATCH / RATE) * 1000;
  const batches = Math.max(1, Math.round((DURATION * RATE) / BATCH));

  for (let batch = 0; batch < batches; batch += 1) {
    const startedAt = performance.now();
    const events = Array.from({ length: BATCH }, () => ({
      event_id: randomUUID(),
      name: 'loss',
      value: Math.random(),
      ts: new Date().toISOString(),
    }));

    try {
      const response = await fetch(`${API}/runs/${runId}/metrics`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${KEY}`,
        },
        body: JSON.stringify({ events }),
      });

      latencies.push(performance.now() - startedAt);

      if (!response.ok) failures.push(response.status);
      else accepted += (await response.json()).accepted;
    } catch (error) {
      failures.push(String(error));
    }

    const elapsed = performance.now() - startedAt;
    if (elapsed < interval) {
      await new Promise((resolve) => setTimeout(resolve, interval - elapsed));
    }
  }
}

const startedAt = Date.now();
await Promise.all(runIds.map((runId) => worker(runId)));
const wallSeconds = (Date.now() - startedAt) / 1000;

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
const stored = await client.query(
  'select count(*)::int as n from metric_events where run_id = any($1::uuid[])',
  [runIds],
);
await client.end();

const storedCount = stored.rows[0].n;
const required = RUNS * RATE * DURATION;

console.log(
  JSON.stringify(
    {
      runs: RUNS,
      batchSize: BATCH,
      durationSeconds: Number(wallSeconds.toFixed(2)),
      requests: latencies.length,
      requestsPerSecond: Number((latencies.length / wallSeconds).toFixed(1)),
      acceptedEvents: accepted,
      acceptedEventsPerSecond: Number((accepted / wallSeconds).toFixed(1)),
      targetEventsPerSecond: RUNS * RATE,
      latencyMs: {
        p50: Number(percentile(latencies, 50).toFixed(1)),
        p95: Number(percentile(latencies, 95).toFixed(1)),
        p99: Number(percentile(latencies, 99).toFixed(1)),
        max: Number(Math.max(...latencies).toFixed(1)),
      },
      failures: failures.length,
      failedStatuses: failures.slice(0, 5),
      storedEvents: storedCount,
      expectedEvents: required,
      lostOrRejected: required - storedCount,
    },
    null,
    2,
  ),
);
