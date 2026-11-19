import { pool } from '../db/pool.js';
import { parseApiKey, verifySecret } from './keys.js';

export type ApiKeyContext = {
  keyId: string;
  projectId: string;
};

/**
 * Returns the key context only for a live (not revoked) key with a matching
 * secret. Returns null for every failure mode, so callers cannot distinguish
 * "unknown prefix" from "wrong secret".
 */
export async function verifyApiKey(raw: string): Promise<ApiKeyContext | null> {
  const parsed = parseApiKey(raw);
  if (!parsed) return null;

  const result = await pool.query<{ id: string; project_id: string; secret_hash: Buffer }>(
    'select id, project_id, secret_hash from api_keys where prefix = $1 and revoked_at is null',
    [parsed.prefix],
  );

  const row = result.rows[0];
  if (!row) return null;
  if (!verifySecret(parsed.secret, row.secret_hash)) return null;

  return { keyId: row.id, projectId: row.project_id };
}
