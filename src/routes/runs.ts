import { Router } from 'express';
import { z } from 'zod';
import { getRunList, invalidateRunList, setRunList } from '../cache/runList.js';
import { pool } from '../db/pool.js';
import { HttpError, NotFoundError } from '../errors.js';
import { requireSession } from '../http/middleware.js';
import { isUuid } from '../http/uuid.js';

export const runsRouter = Router();
runsRouter.use(requireSession);

type RunRow = {
  id: string;
  name: string;
  status: string;
  created_at: Date;
};

function toRun(row: RunRow) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    created_at: row.created_at.toISOString(),
  };
}

async function findRun(runId: string, projectId: string): Promise<RunRow | null> {
  // A malformed id is treated exactly like an unknown one: 404, no oracle.
  if (!isUuid(runId)) return null;

  const result = await pool.query<RunRow>(
    'select id, name, status, created_at from runs where id = $1 and project_id = $2',
    [runId, projectId],
  );

  return result.rows[0] ?? null;
}

const createRunSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

runsRouter.get('/', async (req, res) => {
  const projectId = req.session!.projectId;

  const cached = getRunList(projectId);
  if (cached) {
    res.json({ runs: cached });
    return;
  }

  const result = await pool.query<RunRow>(
    `select id, name, status, created_at
     from runs
     where project_id = $1
     order by created_at desc, id desc
     limit 100`,
    [projectId],
  );

  const runs = result.rows.map(toRun);
  setRunList(projectId, runs);
  res.json({ runs });
});

runsRouter.post('/', async (req, res) => {
  const body = createRunSchema.parse(req.body ?? {});
  const projectId = req.session!.projectId;

  const result = await pool.query<RunRow>(
    `insert into runs (project_id, name)
     values ($1, $2)
     returning id, name, status, created_at`,
    [projectId, body.name],
  );

  invalidateRunList(projectId);
  res.status(201).json({ run: toRun(result.rows[0]!) });
});

runsRouter.get('/:runId', async (req, res) => {
  const projectId = req.session!.projectId;
  const run = await findRun(String(req.params.runId), projectId);
  if (!run) throw new NotFoundError();

  res.json({ run: toRun(run) });
});

runsRouter.get('/:runId/events', async (req, res) => {
  const projectId = req.session!.projectId;
  const run = await findRun(String(req.params.runId), projectId);
  if (!run) throw new NotFoundError();

  const afterSeq = parseInteger(req.query.after_seq, 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = parseInteger(req.query.limit, 500, 1, 1000);

  const events = await pool.query<{
    seq: string;
    event_id: string;
    name: string;
    value: number;
    ts: Date;
  }>(
    `select seq, event_id, name, value, ts
     from metric_events
     where run_id = $1 and seq > $2
     order by seq
     limit $3`,
    [run.id, afterSeq, limit],
  );

  const last = await pool.query<{ last_seq: string }>(
    'select coalesce(max(seq), 0) as last_seq from metric_events where run_id = $1',
    [run.id],
  );

  res.json({
    events: events.rows.map((row) => ({
      seq: Number(row.seq),
      event_id: row.event_id,
      name: row.name,
      value: row.value,
      ts: row.ts.toISOString(),
    })),
    last_seq: Number(last.rows[0]!.last_seq),
  });
});

function parseInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;

  const parsed = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(422, 'invalid_query');
  }

  return parsed;
}
