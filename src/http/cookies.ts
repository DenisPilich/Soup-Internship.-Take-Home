const SESSION_COOKIE = 'soup_session';

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    if (key !== name) continue;

    return decodeURIComponent(part.slice(index + 1).trim());
  }

  return null;
}

// Secure is intentionally omitted: the demo runs over http://localhost.
// Behind TLS this must become `Secure` (documented in the known limitations).
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
