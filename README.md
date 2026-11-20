# Soup internship — mini experiment tracker

A small experiment tracker: projects and API keys, batched metric ingestion over
an unreliable network, a live run page, and a run list. Postgres is the only
source of truth; the SSE stream is a replayable tail of the event log.

![Run page](docs/run-page.png)

## Run

```bash
docker compose up --build
```

Open http://localhost:3000 and sign in with a demo key (development only, not
secrets):

Reset the demo at any time with `docker compose down -v` and start again.

| Project | API key |
|---|---|
| Project A | `soup_demoa001_1f8c2b6e4a9d4f7c8b3e5a1d6f9c2b7e4a8d1f3c` |
| Project B | `soup_demob002_7c4e1a9f3b6d2e8a5c1f7b4d9e2a6c3f8b5d1e7a` |

Send a batch:

```bash
curl -X POST http://localhost:3000/runs/00000000-0000-4000-8000-0000000000c1/metrics \
  -H "Authorization: Bearer soup_demoa001_1f8c2b6e4a9d4f7c8b3e5a1d6f9c2b7e4a8d1f3c" \
  -H "Content-Type: application/json" \
  -d '{"events":[{"event_id":"11111111-1111-4111-8111-111111111111","name":"loss","value":0.42,"ts":"2026-11-19T17:00:00Z"}]}'
```

Watch it live: `node scripts/demo.mjs` sends one `loss` and one `accuracy`
sample per second to the demo run. The seed already gives both demo runs a
short curve, so the page is not empty on the first visit.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/runs/{id}/metrics` | API key | ingest a batch (≤500 events, ≤1 MiB) |
| POST | `/api/auth/session` | API key | exchange a key for an HttpOnly cookie |
| DELETE | `/api/auth/session` | cookie | sign out |
| GET | `/api/auth/me` | cookie | current project |
| POST | `/api/keys/rotate` | cookie | revoke all keys, return the new one once |
| GET | `/api/runs` | cookie | list runs (2 s cache) |
| POST | `/api/runs` | cookie | create a run |
| GET | `/api/runs/{id}` | cookie | run metadata |
| GET | `/api/runs/{id}/events?after_seq=` | cookie | snapshot / catch-up |
| GET | `/api/runs/{id}/stream` | cookie | SSE, honours `Last-Event-ID` |

Errors: `401` missing, expired or revoked credential; `404` unknown **or
foreign** resource with the same body; `422` invalid batch or query parameter;
`413` batch over the limit.

### Key rotation

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/session \
  -H 'Content-Type: application/json' \
  -d '{"api_key":"soup_demoa001_1f8c2b6e4a9d4f7c8b3e5a1d6f9c2b7e4a8d1f3c"}'

curl -b cookies.txt -X POST http://localhost:3000/api/keys/rotate
```

The old key stops working immediately, and the session minted from it dies with
it. The new raw key is returned once and never stored.

## Tests

```bash
docker compose up -d db
npm test                     # 31 backend tests, separate soup_test database
cd e2e && npm install && npm test   # 2 Playwright tests (Chrome required)
```

Raw output is committed in `docs/test-output/`.

| Check | Result |
|---|---|
| Backend | 31 tests: ingestion, ordering, idempotency, isolation, rotation, SSE, cache, backpressure |
| End-to-end | 2 Playwright scenarios, including a socket-level network cut |
| Load | 15 000 events at 500 events/sec: 15 000 stored, p95 89 ms, 0 errors |

Load test (500 events/sec target):

```bash
node scripts/load.mjs
BATCH=1 DURATION=10 node scripts/load.mjs
```

## Development

```bash
npm install
cp .env.example .env
docker compose up -d db
npm run migrate && npm run seed
npm run dev                  # API on :3000

cd web && npm install && npm run dev   # UI on :5173, /api proxied
```

`docker compose stop api` before `npm run dev` if the container is already
holding port 3000.

## Layout

```
src/            API, auth, ingestion transaction, SSE tail
src/db/         pool, schema.sql, migrate, demo seed
tests/          Vitest: ingestion, HTTP, isolation, SSE
web/            React SPA (run list, live run page, client-side fold)
e2e/            Playwright: consistency under a real socket cut
scripts/        load test and live demo
docs/           design.md, note.md, ai-usage.md, modern-web-audit.md, raw output
```

## Documents

- [Design](docs/design.md) — event model, ordering, idempotency, catch-up, isolation.
- [Engineering note](docs/note.md) — architecture, evidence, verdict, limitations.
- [AI usage](docs/ai-usage.md) — where AI helped and what was rejected.
- [Modern web audit](docs/modern-web-audit.md) — the Chrome/Edge/Firefox/MDN
  scanner finding and the one change it produced.

## Known limitations

Single Postgres, no HA. Cookies are not `Secure` (localhost demo). The run page
loads the full history. No rate limiting. The viewer side (many open SSE
connections) is not load-tested. See `docs/note.md` §9.
