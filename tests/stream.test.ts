import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { clearRunListCache } from '../src/cache/runList.js';
import { ingestBatch } from '../src/ingest.js';
import { login, resetDb, seedProjectWithKey, testPool } from './helpers.js';

let app: Express;
let server: Server;
let base: string;

beforeAll(async () => {
  app = createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await testPool.end();
});

beforeEach(async () => {
  await resetDb();
  clearRunListCache();
});

type Frame = { id: string; data: string };

async function readFrames(response: Response, count: number): Promise<Frame[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const frames: Frame[] = [];
  let buffer = '';

  try {
    while (frames.length < count) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        if (!raw.startsWith(':')) {
          const lines = raw.split('\n');
          const id = lines.find((line) => line.startsWith('id: '))?.slice(4);
          const data = lines.find((line) => line.startsWith('data: '))?.slice(6);
          if (id && data) frames.push({ id, data });
        }

        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }

  return frames;
}

function event(index: number) {
  return {
    event_id: randomUUID(),
    name: 'loss',
    value: index / 10,
    ts: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  };
}

describe('sse stream', () => {
  it('replays the stored history from the beginning', async () => {
    const project = await seedProjectWithKey('Project A');
    await ingestBatch(testPool, {
      projectId: project.projectId,
      runId: project.runId,
      events: [event(1), event(2)],
    });

    const cookie = await login(app, project.apiKey);
    const controller = new AbortController();

    try {
      const response = await fetch(`${base}/api/runs/${project.runId}/stream`, {
        headers: { cookie },
        signal: controller.signal,
      });
      expect(response.status).toBe(200);

      const frames = await readFrames(response, 2);
      expect(frames.map((frame) => frame.id)).toEqual(['1', '2']);
    } finally {
      controller.abort();
    }
  });

  it('delivers events that are written after the connection is open', async () => {
    const project = await seedProjectWithKey('Project A');
    const cookie = await login(app, project.apiKey);
    const controller = new AbortController();

    try {
      const response = await fetch(`${base}/api/runs/${project.runId}/stream`, {
        headers: { cookie },
        signal: controller.signal,
      });
      expect(response.status).toBe(200);

      await ingestBatch(testPool, {
        projectId: project.projectId,
        runId: project.runId,
        events: [event(1)],
      });

      const frames = await readFrames(response, 1);
      expect(frames[0]!.id).toBe('1');
    } finally {
      controller.abort();
    }
  });

  it('catches up from Last-Event-ID without repeating what was already seen', async () => {
    const project = await seedProjectWithKey('Project A');
    const cookie = await login(app, project.apiKey);

    const first = new AbortController();
    const firstResponse = await fetch(`${base}/api/runs/${project.runId}/stream`, {
      headers: { cookie },
      signal: first.signal,
    });

    await ingestBatch(testPool, {
      projectId: project.projectId,
      runId: project.runId,
      events: [event(1), event(2)],
    });

    const delivered = await readFrames(firstResponse, 2);
    expect(delivered.map((frame) => frame.id)).toEqual(['1', '2']);
    first.abort();

    await ingestBatch(testPool, {
      projectId: project.projectId,
      runId: project.runId,
      events: [event(3), event(4)],
    });

    const second = new AbortController();
    try {
      const secondResponse = await fetch(`${base}/api/runs/${project.runId}/stream`, {
        headers: { cookie, 'last-event-id': '2' },
        signal: second.signal,
      });

      const missed = await readFrames(secondResponse, 2);
      expect(missed.map((frame) => frame.id)).toEqual(['3', '4']);
    } finally {
      second.abort();
    }
  });

  it('refuses to stream a run of another project', async () => {
    const a = await seedProjectWithKey('Project A');
    const b = await seedProjectWithKey('Project B');
    const cookieA = await login(app, a.apiKey);

    const response = await fetch(`${base}/api/runs/${b.runId}/stream`, {
      headers: { cookie: cookieA },
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('not_found');
  });

  it('requires a session', async () => {
    const project = await seedProjectWithKey('Project A');

    const response = await fetch(`${base}/api/runs/${project.runId}/stream`);
    expect(response.status).toBe(401);
  });
});
