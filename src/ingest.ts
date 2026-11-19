import type { Pool } from 'pg';
import { NotFoundError } from './errors.js';

export type IncomingEvent = {
  event_id: string;
  name: string;
  value: number;
  ts: string;
};

export type IngestArgs = {
  projectId: string;
  runId: string;
  events: IncomingEvent[];
};

export type IngestResult = {
  /** Events actually written by this call. */
  accepted: number;
  /** Input events that were already stored (same event_id). */
  duplicates: number;
  /** Highest seq in the run after the call; 0 for an empty run. */
  last_seq: number;
};

export async function ingestBatch(pool: Pool, args: IngestArgs): Promise<IngestResult> {
  // The client must live inside the call: it is a connection borrowed from the
  // pool, it belongs to this transaction only, and it must be released.
  const client = await pool.connect();

  try {
    await client.query('begin');

    // 1. Find the run and lock its row until this transaction ends.
    //    The lock is what makes seq assignment safe: two batches for the same
    //    run cannot read the same max(seq) at the same time.
    const run = await client.query(
      'select id from runs where id = $1 and project_id = $2 for update',
      [args.runId, args.projectId],
    );

    if (run.rowCount === 0) {
      // Same error for "does not exist" and "belongs to another project":
      // the caller must not learn which one it is.
      throw new NotFoundError();
    }

    // 2. Collapse duplicates inside the incoming batch, first one wins.
    const byId = new Map<string, IncomingEvent>();
    for (const event of args.events) {
      if (!byId.has(event.event_id)) byId.set(event.event_id, event);
    }
    const unique = [...byId.values()];

    // 3. Drop events that are already stored. This must happen before seq is
    //    assigned, otherwise duplicates would consume sequence numbers and
    //    leave holes that a reconnecting client would read as lost events.
    let fresh = unique;
    if (unique.length > 0) {
      const existing = await client.query<{ event_id: string }>(
        'select event_id from metric_events where run_id = $1 and event_id = any($2::uuid[])',
        [args.runId, unique.map((event) => event.event_id)],
      );
      const stored = new Set(existing.rows.map((row) => row.event_id));
      fresh = unique.filter((event) => !stored.has(event.event_id));
    }

    // 4. Continue the run's gap-free sequence.
    const maxSeqResult = await client.query<{ max_seq: string }>(
      'select coalesce(max(seq), 0) as max_seq from metric_events where run_id = $1',
      [args.runId],
    );
    const maxSeq = Number(maxSeqResult.rows[0]!.max_seq);

    // 5. Insert everything in one statement. unnest() turns the arrays into
    //    rows, so a batch of N events is one round trip, not N.
    if (fresh.length > 0) {
      const seqs = fresh.map((_event, index) => maxSeq + index + 1);

      await client.query(
        `insert into metric_events (run_id, seq, event_id, name, value, ts)
         select $1, s.seq, s.event_id, s.name, s.value, s.ts
         from unnest($2::bigint[], $3::uuid[], $4::text[], $5::float8[], $6::timestamptz[])
           as s(seq, event_id, name, value, ts)`,
        [
          args.runId,
          seqs,
          fresh.map((event) => event.event_id),
          fresh.map((event) => event.name),
          fresh.map((event) => event.value),
          fresh.map((event) => event.ts),
        ],
      );
    }

    await client.query('commit');

    return {
      accepted: fresh.length,
      duplicates: args.events.length - fresh.length,
      last_seq: maxSeq + fresh.length,
    };
  } catch (error) {
    // Without this rollback the client returns to the pool with an open
    // transaction and a held lock.
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
