import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { NotFoundError } from '../errors.js';
import { requireApiKey } from '../http/middleware.js';
import { UUID_SOURCE, isUuid } from '../http/uuid.js';
import { ingestBatch } from '../ingest.js';

export const ingestRouter = Router();

const eventSchema = z.object({
  event_id: z.string().regex(new RegExp(`^${UUID_SOURCE}$`, 'i'), 'invalid event_id'),
  name: z.string().min(1).max(200),
  value: z.number().refine(Number.isFinite, 'value must be finite'),
  // Date.parse accepts the ISO forms clients actually send; anything it cannot
  // parse is rejected before it reaches Postgres.
  ts: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'invalid timestamp'),
});

const batchSchema = z.object({
  batch_id: z.string().max(200).optional(),
  events: z.array(eventSchema).min(1).max(500),
});

ingestRouter.post('/:runId/metrics', requireApiKey, async (req, res) => {
  const runId = String(req.params.runId);
  if (!isUuid(runId)) throw new NotFoundError();

  const body = batchSchema.parse(req.body ?? {});

  const result = await ingestBatch(pool, {
    projectId: req.apiKey!.projectId,
    runId,
    events: body.events,
  });

  res.json(result);
});
