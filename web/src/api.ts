export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401) throw new UnauthorizedError();
  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}
