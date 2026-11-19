import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { pool } from './db/pool.js';
import { HttpError } from './errors.js';
import { authRouter } from './routes/auth.js';
import { ingestRouter } from './routes/ingest.js';
import { keysRouter } from './routes/keys.js';
import { runsRouter } from './routes/runs.js';
import { streamRouter } from './routes/stream.js';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

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

  app.use('/api/auth', authRouter);
  app.use('/api/keys', keysRouter);
  app.use('/api/runs', streamRouter);
  app.use('/api/runs', runsRouter);
  // The ingestion path is fixed by the assignment.
  app.use('/runs', ingestRouter);

  // Built SPA, when present (the Docker image ships it). In development the
  // Vite dev server serves the UI and proxies /api here.
  const publicDir = path.resolve('public');
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

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
    // body-parser errors (bad JSON, payload too large, bad content type) carry
    // a numeric 4xx status.
    const status = (err as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      res.status(status).json({ error: 'invalid_request' });
      return;
    }
    console.error('[error]', err);
    res.status(500).json({ error: 'internal' });
  });

  return app;
}
