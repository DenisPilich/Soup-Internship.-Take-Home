import { Router } from 'express';
import { z } from 'zod';
import { verifyApiKey } from '../auth/apiKey.js';
import { createSession, revokeSession } from '../auth/session.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../errors.js';
import { clearedSessionCookie, readCookie, sessionCookie } from '../http/cookies.js';
import { requireSession } from '../http/middleware.js';

export const authRouter = Router();

const loginSchema = z.object({ api_key: z.string().min(1) });

authRouter.post('/session', async (req, res) => {
  const body = loginSchema.parse(req.body ?? {});

  const key = await verifyApiKey(body.api_key);
  if (!key) throw new HttpError(401, 'invalid_key');

  const project = await pool.query<{ name: string }>('select name from projects where id = $1', [
    key.projectId,
  ]);

  const { token, maxAgeSeconds } = await createSession(key.keyId, key.projectId);
  res.setHeader('Set-Cookie', sessionCookie(token, maxAgeSeconds));
  res.json({ project: { id: key.projectId, name: project.rows[0]!.name } });
});

authRouter.delete('/session', async (req, res) => {
  const token = readCookie(req.headers.cookie, 'soup_session');
  if (token) await revokeSession(token);

  res.setHeader('Set-Cookie', clearedSessionCookie());
  res.status(204).end();
});

authRouter.get('/me', requireSession, async (req, res) => {
  res.json({
    project: { id: req.session!.projectId, name: req.session!.projectName },
  });
});
