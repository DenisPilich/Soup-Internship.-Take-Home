import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db/pool.js';

export type SessionContext = {
  sessionId: string;
  projectId: string;
  projectName: string;
};

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export async function createSession(
  apiKeyId: string,
  projectId: string,
): Promise<{ token: string; maxAgeSeconds: number }> {
  const token = randomBytes(32).toString('base64url');
  const maxAgeSeconds = config.SESSION_TTL_HOURS * 3600;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

  // Only the hash is stored: a database dump must not hand over live sessions.
  await pool.query(
    `insert into sessions (token_hash, project_id, api_key_id, expires_at)
     values ($1, $2, $3, $4)`,
    [hashToken(token), projectId, apiKeyId, expiresAt],
  );

  return { token, maxAgeSeconds };
}

export async function resolveSession(token: string): Promise<SessionContext | null> {
  // The join on api_keys is deliberate: rotating a key revokes the sessions
  // that were minted from it, without any extra bookkeeping.
  const result = await pool.query<{ id: string; project_id: string; name: string }>(
    `select s.id, s.project_id, p.name
     from sessions s
     join projects p on p.id = s.project_id
     join api_keys k on k.id = s.api_key_id
     where s.token_hash = $1
       and s.revoked_at is null
       and s.expires_at > now()
       and k.revoked_at is null`,
    [hashToken(token)],
  );

  const row = result.rows[0];
  if (!row) return null;

  return { sessionId: row.id, projectId: row.project_id, projectName: row.name };
}

export async function revokeSession(token: string): Promise<void> {
  await pool.query(
    'update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null',
    [hashToken(token)],
  );
}
