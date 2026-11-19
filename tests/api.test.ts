import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { clearRunListCache } from '../src/cache/runList.js';
import { login, resetDb, seedProjectWithKey, testPool } from './helpers.js';

function event(index = 1) {
  return {
    event_id: randomUUID(),
    name: 'loss',
    value: index / 10,
    ts: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  };
}

describe('http api', () => {
  let app: Express;

  beforeEach(async () => {
    await resetDb();
    clearRunListCache();
    app = createApp();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('rejects a login with an unknown key', async () => {
    const response = await request(app)
      .post('/api/auth/session')
      .send({ api_key: 'soup_aaaaaaaa_does-not-exist' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'invalid_key' });
  });

  it('logs in with a valid key and sets an HttpOnly cookie', async () => {
    const project = await seedProjectWithKey('Project A');

    const response = await request(app)
      .post('/api/auth/session')
      .send({ api_key: project.apiKey })
      .expect(200);

    expect(response.body.project).toEqual({ id: project.projectId, name: 'Project A' });

    const header = response.headers['set-cookie'] as unknown as string[];
    expect(header[0]).toContain('HttpOnly');
    expect(header[0]).toContain('SameSite=Lax');
  });

  it('requires a session for the dashboard', async () => {
    const response = await request(app).get('/api/runs');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'not_authenticated' });
  });

  it('lists only the runs of the authenticated project', async () => {
    const a = await seedProjectWithKey('Project A');
    const b = await seedProjectWithKey('Project B');
    const cookieA = await login(app, a.apiKey);

    const response = await request(app).get('/api/runs').set('Cookie', cookieA).expect(200);

    expect(response.body.runs.map((run: { id: string }) => run.id)).toEqual([a.runId]);
    expect(response.body.runs.map((run: { id: string }) => run.id)).not.toContain(b.runId);
  });

  it('answers a foreign run exactly like a nonexistent one', async () => {
    const a = await seedProjectWithKey('Project A');
    const b = await seedProjectWithKey('Project B');
    const cookieA = await login(app, a.apiKey);

    const foreign = await request(app)
      .get(`/api/runs/${b.runId}`)
      .set('Cookie', cookieA)
      .expect(404);

    const missing = await request(app)
      .get(`/api/runs/${randomUUID()}`)
      .set('Cookie', cookieA)
      .expect(404);

    expect(foreign.body).toEqual({ error: 'not_found' });
    expect(foreign.body).toEqual(missing.body);
  });

  it('does not expose the events of a foreign run', async () => {
    const a = await seedProjectWithKey('Project A');
    const b = await seedProjectWithKey('Project B');
    const cookieA = await login(app, a.apiKey);

    await request(app)
      .post(`/runs/${b.runId}/metrics`)
      .set('Authorization', `Bearer ${b.apiKey}`)
      .send({ events: [event()] })
      .expect(200);

    await request(app).get(`/api/runs/${b.runId}/events`).set('Cookie', cookieA).expect(404);
  });

  it('rejects ingestion into a foreign run and writes nothing', async () => {
    const a = await seedProjectWithKey('Project A');
    const b = await seedProjectWithKey('Project B');

    await request(app)
      .post(`/runs/${b.runId}/metrics`)
      .set('Authorization', `Bearer ${a.apiKey}`)
      .send({ events: [event()] })
      .expect(404);

    const count = await testPool.query<{ n: number }>(
      'select count(*)::int as n from metric_events where run_id = $1',
      [b.runId],
    );
    expect(count.rows[0]!.n).toBe(0);
  });

  it('accepts a batch and is idempotent on resend', async () => {
    const a = await seedProjectWithKey('Project A');
    const events = [event(1), event(2)];

    const first = await request(app)
      .post(`/runs/${a.runId}/metrics`)
      .set('Authorization', `Bearer ${a.apiKey}`)
      .send({ events })
      .expect(200);

    expect(first.body).toEqual({ accepted: 2, duplicates: 0, last_seq: 2 });

    const second = await request(app)
      .post(`/runs/${a.runId}/metrics`)
      .set('Authorization', `Bearer ${a.apiKey}`)
      .send({ events })
      .expect(200);

    expect(second.body).toEqual({ accepted: 0, duplicates: 2, last_seq: 2 });
  });

  it('rejects malformed events with 422', async () => {
    const a = await seedProjectWithKey('Project A');

    await request(app)
      .post(`/runs/${a.runId}/metrics`)
      .set('Authorization', `Bearer ${a.apiKey}`)
      .send({ events: [{ ...event(), value: 'not-a-number' }] })
      .expect(422);
  });

  it('rejects batches larger than 500 events', async () => {
    const a = await seedProjectWithKey('Project A');
    const events = Array.from({ length: 501 }, () => event());

    await request(app)
      .post(`/runs/${a.runId}/metrics`)
      .set('Authorization', `Bearer ${a.apiKey}`)
      .send({ events })
      .expect(422);
  });

  it('requires an api key for ingestion', async () => {
    const a = await seedProjectWithKey('Project A');

    await request(app).post(`/runs/${a.runId}/metrics`).send({ events: [event()] }).expect(401);
  });

  it('rotates the key: the old key and its sessions stop working', async () => {
    const a = await seedProjectWithKey('Project A');
    const cookieA = await login(app, a.apiKey);

    const rotated = await request(app)
      .post('/api/keys/rotate')
      .set('Cookie', cookieA)
      .expect(201);

    const newKey = rotated.body.api_key as string;
    expect(newKey).toMatch(/^soup_[a-z0-9]{8}_/);

    await request(app)
      .post(`/runs/${a.runId}/metrics`)
      .set('Authorization', `Bearer ${a.apiKey}`)
      .send({ events: [event()] })
      .expect(401);

    await request(app)
      .post(`/runs/${a.runId}/metrics`)
      .set('Authorization', `Bearer ${newKey}`)
      .send({ events: [event()] })
      .expect(200);

    // The session was minted from the revoked key, so it dies with it.
    await request(app).get('/api/runs').set('Cookie', cookieA).expect(401);
  });

  it('invalidates the run list cache when a run is created', async () => {
    const a = await seedProjectWithKey('Project A');
    const cookieA = await login(app, a.apiKey);

    await request(app).get('/api/runs').set('Cookie', cookieA).expect(200);

    await request(app)
      .post('/api/runs')
      .set('Cookie', cookieA)
      .send({ name: 'fresh-run' })
      .expect(201);

    const response = await request(app).get('/api/runs').set('Cookie', cookieA).expect(200);
    expect(response.body.runs.map((run: { name: string }) => run.name)).toContain('fresh-run');
  });

  it('returns events after a cursor and the current last_seq', async () => {
    const a = await seedProjectWithKey('Project A');
    const events = [event(1), event(2), event(3)];

    await request(app)
      .post(`/runs/${a.runId}/metrics`)
      .set('Authorization', `Bearer ${a.apiKey}`)
      .send({ events })
      .expect(200);

    const cookieA = await login(app, a.apiKey);
    const response = await request(app)
      .get(`/api/runs/${a.runId}/events?after_seq=1&limit=10`)
      .set('Cookie', cookieA)
      .expect(200);

    expect(response.body.events.map((row: { seq: number }) => row.seq)).toEqual([2, 3]);
    expect(response.body.last_seq).toBe(3);
  });
});
