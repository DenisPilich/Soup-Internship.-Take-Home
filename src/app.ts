import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { pool } from './db/pool.js';
import { HttpError } from './errors.js';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    res
      .type('html')
      .send('<!doctype html><h1>Soup experiment tracker</h1><p>API is up. UI comes next.</p>');
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/readyz', async (_req, res) => {
    try {
      await pool.query('select 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  // Feature routes are mounted here as they are implemented.

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof ZodError) {
      res.status(422).json({ error: 'invalid_request' });
      return;
    }
    // body-parser syntax errors carry a numeric status.
    const status = (err as { status?: unknown } | null)?.status;
    if (status === 400) {
      res.status(400).json({ error: 'invalid_json' });
      return;
    }
    console.error('[error]', err);
    res.status(500).json({ error: 'internal' });
  });

  return app;
}
