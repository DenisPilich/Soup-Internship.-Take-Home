import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { ingestBatch } from '../src/ingest.js';
import { resetDb, seedProjectAndRun } from './helpers.js';

function event(index: number) {
  return {
    event_id: randomUUID(),
    name: 'loss',
    value: index / 10,
    ts: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  };
}

describe('ingestBatch', () => {
  let projectId: string;
  let runId: string;

  beforeEach(async () => {
    await resetDb();
    ({ projectId, runId } = await seedProjectAndRun());
  });

  it('stores a batch and assigns a gap-free seq', async () => {
    const result = await ingestBatch(pool, {
      projectId,
      runId,
      events: [event(1), event(2), event(3)],
    });

    expect(result).toEqual({ accepted: 3, duplicates: 0, last_seq: 3 });

    const rows = await pool.query<{ seq: string }>(
      'select seq from metric_events where run_id = $1 order by seq',
      [runId],
    );
    expect(rows.rows.map((row) => Number(row.seq))).toEqual([1, 2, 3]);
  });

  it('is idempotent when the same batch is sent again', async () => {
    const events = [event(1), event(2)];
    await ingestBatch(pool, { projectId, runId, events });

    const second = await ingestBatch(pool, { projectId, runId, events });

    expect(second).toEqual({ accepted: 0, duplicates: 2, last_seq: 2 });

    const count = await pool.query<{ n: number }>(
      'select count(*)::int as n from metric_events where run_id = $1',
      [runId],
    );
    expect(count.rows[0]!.n).toBe(2);
  });

  it('deduplicates event ids inside a single batch', async () => {
    const repeated = event(1);

    const result = await ingestBatch(pool, {
      projectId,
      runId,
      events: [repeated, repeated, event(2)],
    });

    expect(result).toEqual({ accepted: 2, duplicates: 1, last_seq: 2 });
  });

  it('refuses a run that belongs to another project', async () => {
    const foreign = await seedProjectAndRun();

    await expect(
      ingestBatch(pool, { projectId: foreign.projectId, runId, events: [event(1)] }),
    ).rejects.toMatchObject({ status: 404 });

    const count = await pool.query<{ n: number }>(
      'select count(*)::int as n from metric_events where run_id = $1',
      [runId],
    );
    expect(count.rows[0]!.n).toBe(0);
  });

  it('keeps seq gap-free when writers race', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        ingestBatch(pool, { projectId, runId, events: [event(index)] }),
      ),
    );

    const rows = await pool.query<{ seq: string }>(
      'select seq from metric_events where run_id = $1 order by seq',
      [runId],
    );
    expect(rows.rows.map((row) => Number(row.seq))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
