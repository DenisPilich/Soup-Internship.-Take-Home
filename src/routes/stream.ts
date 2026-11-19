import { Router } from 'express';
import type { Response } from 'express';
import { pool } from '../db/pool.js';
import { NotFoundError } from '../errors.js';
import { requireSession } from '../http/middleware.js';
import { isUuid } from '../http/uuid.js';

export const streamRouter = Router();

const POLL_MS = 300;
const BATCH = 500;
const HEARTBEAT_MS = 15_000;

type EventRow = {
  seq: string;
  event_id: string;
  name: string;
  value: number;
  ts: Date;
};

function frame(row: EventRow): string {
  const payload = {
    seq: Number(row.seq),
    event_id: row.event_id,
    name: row.name,
    value: row.value,
    ts: row.ts.toISOString(),
  };

  return `id: ${payload.seq}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Writes one chunk and waits for `drain` when the socket buffer is full.
 * This is the backpressure boundary: a slow client makes the loop wait, so the
 * server never accumulates an unbounded per-client queue.
 */
function write(res: Response, chunk: string): Promise<void> {
  return new Promise((resolve) => {
    if (res.writableEnded || res.destroyed) {
      resolve();
      return;
    }

    if (res.write(chunk)) {
      resolve();
      return;
    }

    const done = (): void => {
      res.off('drain', done);
      res.off('close', done);
      resolve();
    };

    res.once('drain', done);
    res.once('close', done);
  });
}

streamRouter.get('/:runId/stream', requireSession, async (req, res) => {
  const projectId = req.session!.projectId;
  const runId = String(req.params.runId);
  if (!isUuid(runId)) throw new NotFoundError();

  // Authorization happens before the first byte of the stream.
  const owned = await pool.query('select id from runs where id = $1 and project_id = $2', [
    runId,
    projectId,
  ]);
  if (owned.rowCount === 0) throw new NotFoundError();

  const headerCursor = req.header('last-event-id');
  const queryCursor = typeof req.query.after_seq === 'string' ? req.query.after_seq : undefined;
  const parsed = Number(headerCursor ?? queryCursor ?? '0');
  let cursor = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write('retry: 1000\n\n');
  res.flushHeaders();

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  let lastPing = Date.now();

  try {
    while (!closed) {
      const result = await pool.query<EventRow>(
        `select seq, event_id, name, value, ts
         from metric_events
         where run_id = $1 and seq > $2
         order by seq
         limit $3`,
        [runId, cursor, BATCH],
      );

      for (const row of result.rows) {
        await write(res, frame(row));
        cursor = Number(row.seq);
        if (closed) break;
      }

      if (closed) break;

      // A full page means there may be more events waiting: do not sleep yet.
      if (result.rowCount === BATCH) continue;

      if (Date.now() - lastPing >= HEARTBEAT_MS) {
        await write(res, ': ping\n\n');
        lastPing = Date.now();
      }

      await delay(POLL_MS);
    }
  } catch {
    // The client vanished mid-write. Nothing to repair: the database is the log.
  } finally {
    if (!res.writableEnded) res.end();
  }
});
