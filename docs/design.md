# Design — Mini Experiment Tracker

**Status:** v1, 2026-11-19. Locked decisions: SSE, database-as-log, in-process cache.

## 1. Scope

Projects own runs. An experiment client appends metric batches with an API key. A viewer sees a run list and a live run page. Postgres is the only stateful component; the API is stateless and can run as N replicas.

Not built, on purpose: user accounts and memberships (the project is the tenant; membership is the extension point), Redis or any broker, server-side aggregates, WebSocket. Every extra component is another place where "what the user sees" and "what is stored" can diverge.

## 2. Actors and credentials

- **Experiment client** — `Authorization: Bearer <api_key>`. Appends events to runs of its own project. Retries blindly.
- **Viewer** — exchanges an API key for an HttpOnly, SameSite=Lax session cookie; the key itself is never stored in the browser.
- **Postgres** — source of truth; stores keys and sessions only as hashes.

## 3. Event format

`POST /runs/{run_id}/metrics`

```json
{
  "batch_id": "optional",
  "events": [
    { "event_id": "uuid", "name": "loss", "value": 0.42, "ts": "2026-11-19T15:00:00Z" }
  ]
}
```

| Field | Required | Why it exists |
|---|---|---|
| `event_id` | yes | identity of a measurement; makes retries, replays and duplicate deliveries idempotent |
| `name`, `value` | yes | the measurement; `value` must be finite |
| `ts` | yes | when it happened, by the client clock; domain time for display |
| `batch_id` | no | diagnostics only; no server-side batch table |

Not sent, on purpose: `seq` (server-assigned; a client value would fight ordering), `run_id` / `project_id` (path and credential; body values are ignored to prevent mass-assignment), `client_id` (not needed for identity or ordering).

One transaction per batch: at most 500 events and 1 MiB; any invalid event rejects the whole batch with 422. Response: `{"accepted": n, "duplicates": m, "last_seq": s}`.

## 4. Ordering

Each run has a gap-free `seq` from 1 to N, assigned inside the ingestion transaction while holding the run row:

```sql
SELECT id FROM runs WHERE id = $1 AND project_id = $2 FOR UPDATE;
-- filter out event_ids that already exist, then
INSERT INTO metric_events (run_id, seq, event_id, name, value, ts) ...;
```

The lock is held until commit, so **commit order equals seq order**: a reader cannot see `seq = k+1` while `k` is still uncommitted. That is what makes "read everything after my cursor" safe.

Two orders, two jobs:

- `seq` — transport order: cursor, dedupe, gap detection.
- `ts` — domain order: the chart's x-axis and "latest value".

Arrival order is whatever the network produced; insertion order equals `seq`. The UI sorts by `(ts, seq)` and reads the latest value at max `(ts, seq)`. A late event gets the next `seq` but is displayed at its `ts` position — the page never appends blindly. Example: timestamps 1, 3, 2 arrive in that order, get `seq` 1, 2, 3, and are displayed as 1, 2, 3.

## 5. Retries and duplicates

- `UNIQUE (run_id, event_id)` is the idempotency key. It is per event, which is the granularity that matters; a separate idempotency-key table would duplicate it.
- A duplicate inside a batch, or a resent batch, inserts nothing.
- Retrying an applied batch returns `accepted = 0, duplicates = N`. The response body may differ from the first call; **the effect may not**. Any 2xx means "applied".
- A failure halfway through a batch leaves zero rows; there is no partial batch to reconcile.

## 6. Live updates and catch-up

Transport: SSE, `GET /api/runs/{run_id}/stream`, cookie-authenticated.

The stream is a tail of the database log, not a publisher of truth:

1. `SELECT ... WHERE run_id = $1 AND seq > $2 ORDER BY seq LIMIT 500`; send each as `id: <seq>`; repeat while the page is full.
2. When empty, poll every 300 ms; heartbeat every 15 s.
3. The cursor comes from `?after_seq=` or the `Last-Event-ID` header.

Delivery is at-least-once. The client applies events idempotently:

- `seq <= cursor` — duplicate, ignore.
- `seq == cursor + 1` — apply, advance.
- `seq > cursor + 1` — delivery gap, not a write gap: fetch `GET /events?after_seq=cursor`, then continue.

Every 30 s, and whenever the tab regains focus, the client reconciles with the server and refetches on mismatch. There is no per-client queue: a slow client lags behind the log and cannot overflow server memory. If the process dies after commit and before sending, the row is in the log; the next connection replays it.

## 7. What "UI == DB" means

UI state is a pure fold over the event set: `Map<event_id, event>` → points sorted by `(ts, seq)` → aggregates. The E2E oracle recomputes the projection directly from SQL and compares it with the client's applied state and with rendered DOM values. For the exercised scenario this proves set equality and projection equality; it does not prove it for all schedules.

A snapshot merges into the state, never replaces it: `cursor = max(cursor, snapshot.last_seq)`.

## 8. Isolation

`project_id` comes from the credential only — never from the URL, body or headers. Every operation first resolves the run with `WHERE id = $1 AND project_id = $2`; events are only reachable through that run.

Foreign and nonexistent are indistinguishable: 404, identical body. No existence oracle. SSE authorizes before the first byte. Error bodies never echo resource data; logs never contain keys, tokens or session ids. UUIDs are not a security control: authorization must hold when the ID is known.

**Cache.** A small in-process TTL cache (2 s) fronts `GET /api/runs`. It is not needed for throughput; it exists because a cache is a real isolation failure surface and the assignment asks to prove it. The key includes `project_id`; authorization runs before the lookup; the cached payload carries `project_id` and is revalidated on read; writes invalidate. With several replicas each process has its own cache, so worst-case staleness is the TTL; correctness never depends on it.

## 9. Deliberate simplifications

Single Postgres, no HA. The tail polls per connection, `O(viewers)` queries per interval. The run page loads the full history; at 10^5+ events it needs snapshots and downsampling. Client clocks are trusted for `ts`; a skewed clock is visible in `received_at` but not corrected. No rate limiting. Rotation revokes sessions by join — deliberate, no grace window.
