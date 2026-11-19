import { Router } from 'express';
import { generateApiKey } from '../auth/keys.js';
import { pool } from '../db/pool.js';
import { requireSession } from '../http/middleware.js';

export const keysRouter = Router();

/**
 * Rotation revokes every active key of the project and issues one new key.
 * Sessions are bound to the key they were minted from, so they die with it.
 * The raw key is returned exactly once and never stored.
 */
keysRouter.post('/rotate', requireSession, async (req, res) => {
  const projectId = req.session!.projectId;
  const client = await pool.connect();

  try {
    await client.query('begin');

    await client.query(
      'update api_keys set revoked_at = now() where project_id = $1 and revoked_at is null',
      [projectId],
    );

    const generated = generateApiKey();
    await client.query(
      'insert into api_keys (project_id, prefix, secret_hash) values ($1, $2, $3)',
      [projectId, generated.prefix, generated.secretHash],
    );

    await client.query('commit');

    res.status(201).json({ api_key: generated.raw });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
});
