import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type ParsedApiKey = {
  prefix: string;
  secret: string;
};

export type GeneratedApiKey = {
  raw: string;
  prefix: string;
  secretHash: Buffer;
};

// Format: soup_<8 lowercase alphanumeric>_<secret>. The prefix is stored in
// clear text so lookup is an index hit; the secret is only ever stored hashed.
const API_KEY_PATTERN = /^soup_([a-z0-9]{8})_([A-Za-z0-9_-]{16,})$/;

export function parseApiKey(raw: string): ParsedApiKey | null {
  const match = API_KEY_PATTERN.exec(raw);
  if (!match) return null;
  return { prefix: match[1]!, secret: match[2]! };
}

// SHA-256 is enough here: the secret is 32 random bytes, so there is nothing to
// brute-force. A password KDF would only add latency to every request.
export function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function verifySecret(secret: string, expectedHash: Buffer): boolean {
  const actual = hashSecret(secret);
  return actual.length === expectedHash.length && timingSafeEqual(actual, expectedHash);
}

export function generateApiKey(): GeneratedApiKey {
  const prefix = randomBytes(4).toString('hex'); // 8 characters
  const secret = randomBytes(32).toString('base64url');
  return {
    raw: `soup_${prefix}_${secret}`,
    prefix,
    secretHash: hashSecret(secret),
  };
}
