import type { Pool } from 'pg';

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

/**
 * Core #1 — the ingestion transaction.
 *
 * Contract: tests/ingest.test.ts and docs/design.md §4-5.
 * Invariants that must hold:
 *   - the run is resolved with id AND project_id, otherwise NotFoundError;
 *   - seq is gap-free per run and ordered by commit;
 *   - the same event_id is never stored twice;
 *   - the whole batch is one transaction: nothing is written on failure.
 */
export async function ingestBatch(_pool: Pool, _args: IngestArgs): Promise<IngestResult> {
  throw new Error('ingestBatch is not implemented yet (core #1)');
}
