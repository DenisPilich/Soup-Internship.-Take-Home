# Engineering note — mini experiment tracker

## 1. Architecture

One Express process serves the React SPA and the API; Postgres is the only
stateful component. The API holds no session or stream state (apart from a
2-second run-list cache), so extra processes are safe. There is no Redis, no
broker and no server-side aggregate: every added component would be another
place where "what the user sees" and "what is stored" can diverge.

```
client ── POST /runs/{id}/metrics ──► API ──► Postgres (seq-ordered log)
browser ◄── SSE tail (seq > cursor) ◄── API ◄──┘
   └── GET /api/runs/{id}/events?after_seq=N
```

## 2. Event model and ordering

`POST /runs/{id}/metrics` takes `{batch_id?, events: [{event_id, name, value, ts}]}`.
`event_id` is the client-generated identity and the idempotency key; `seq` is
server-assigned; `run_id` and `project_id` come from the path and the credential,
never from the body. A batch is at most 500 events and 1 MiB, and is
all-or-nothing (422 on any invalid event).

Each run has a gap-free `seq` from 1 to N, assigned inside the ingestion
transaction while holding `SELECT … FROM runs WHERE id=$1 AND project_id=$2 FOR
UPDATE`. The lock is held until commit, so **commit order equals seq order**: a
reader cannot see `k+1` while `k` is uncommitted. `seq` is transport order
(cursor, dedupe, gap detection); `ts` is domain order (chart axis, latest value).
The UI sorts by `(ts, seq)`: a late event gets the next seq and is drawn at its
timestamp. Timestamps 10, 30, 20 arrive in that order, get seq 1, 2, 3, and are
drawn 10, 20, 30.

## 3. Idempotency

`UNIQUE (run_id, event_id)`. Duplicates inside a batch are collapsed and
already-stored events are filtered out **before** seq assignment, so a retry
cannot create holes. Retrying an applied batch returns `accepted=0, duplicates=N`;
the body may differ, the effect may not. A failure halfway rolls back and leaves
zero rows.

## 4. Live updates and catch-up

SSE at `GET /api/runs/{id}/stream`, cookie-authenticated. The handler repeats
`select … where seq > cursor order by seq limit 500`, polls every 300 ms when
idle and sends a heartbeat every 15 s. The cursor comes from `Last-Event-ID` or
`?after_seq=`.

Delivery is at-least-once. The client stores events by `seq`, advances only
through contiguous seqs, ignores anything at or below the cursor, and on a gap
fetches `/events?after_seq=cursor`. It reconciles on tab focus and every 30 s. A
crash after commit loses nothing: the row is in the log and the next connection
replays it. A slow client is handled by awaiting `drain`; there is no per-client
queue, so the failure mode is lag, not memory growth.

## 5. Isolation

`project_id` comes from the credential only — never from the URL or body. Every
operation resolves the run with `WHERE id=$1 AND project_id=$2`; events are
reachable only through that run. Foreign and missing produce the same 404 body,
so the API is not an existence oracle. SSE authorizes before the first byte. The
run-list cache is keyed by project, authorization runs before the lookup, and the
payload carries and revalidates its project id. Keys and session tokens are
stored hashed; a session is bound to its key and dies on rotation. Logs contain
method, path, status and duration only; no keys, tokens or bodies. Foreign and
missing take the same query path; no statistical timing test was run, so a timing
side channel is not ruled out.

## 6. Evidence

- 31 backend tests (`npm test`): ingestion invariants, HTTP validation,
  isolation, rotation, SSE replay and authorization, cache and backpressure.
  Raw output: `docs/test-output/backend-tests.txt`.
- 2 Playwright tests: out-of-order, duplicate batch, late event, socket-level
  cut and reconnect; cross-project page access. Raw output:
  `docs/test-output/e2e.txt`.
- The E2E compares the rendered attributes, the client's applied event set
  (`window.__getRunState`), and a projection computed from SQL. The database is
  the oracle, not the API's own view.
- It proves, for this scenario, set equality, no duplicates, the same order and
  values, and a cursor equal to the row count.
- It does **not** prove: other interleavings; transport reliability; behaviour
  with multiple API instances; rendering beyond the asserted nodes; performance;
  security against a targeted attacker; durability; or that the projection
  specification itself is right (client and SQL oracle could share a mistake).

## 7. Silent failures

| Failure | How it was checked | Result |
|---|---|---|
| Lost events after reconnect | E2E cuts every socket, ingests while offline, reconnects | converged, no loss |
| Duplicate batch | backend test + E2E resend | `accepted=0`, one row per event |
| Out-of-order arrival | E2E sends seq 1,2 then 3 then a late event | displayed by `ts`, cursor by `seq` |
| Late event (older timestamp) | E2E sends `ts=5` after `ts=30` | next `seq`, drawn at its timestamp |
| Partial write | fault injection: one event violates a DB check | zero rows |
| Old key after rotation | API test: old key and its session | 401, new key 200 |
| Slow client / queue overflow | unit test: writer waits for `drain`; no per-client queue | mechanism proven, kernel buffer not filled |
| Stale cache | invalidation test after create; 2 s TTL | new run visible immediately |
| Unauthorized subscription / ingestion | tests against a foreign run | 404, no bytes, no rows |

## 8. Performance verdict

Measured on a laptop running Docker Desktop (16 logical cores), one API
container, one Postgres 16 container, closed-loop clients:

| Scenario | Requests | Accepted | Stored | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|---|---|
| 50 runs × 10 ev/s, batch 5 (30 s) | 3000 | 15000 | 15000 | 58 ms | 89 ms | 177 ms | 0 |
| 50 runs × 10 ev/s, batch 1 (10 s) | 5000 | 5000 | 5000 | 95 ms | 129 ms | 146 ms | 0 |

**SHIP** for the stated workload. Ingestion at 500 events/sec with a batching
client leaves Postgres far from saturated, and accepted events always equal
stored events. Latency is dominated by request overhead and Docker networking,
not the write path: batching five events per request cuts requests fivefold and
p50 by roughly 40%.

Bottlenecks, in order: (1) per-connection SSE polling is `O(viewers)` queries per
interval and is **not** load-tested; (2) a single API process and a single
Postgres mean no redundancy; (3) many runs per project make the run list and the
full-history page expensive. First changes for 10×: batch on the client; replace
per-connection polling with one tailer per run (or `LISTEN/NOTIFY` as an
optimisation with poll fallback); add downsampling and read replicas.
Multi-instance fan-out needs a shared log (Redis Streams) or accepting
per-instance polling.

## 9. Limitations

Single Postgres, no HA or backups. Cookies are not `Secure` because the demo runs
over http://localhost. The cache is per process, so worst-case staleness is 2 s.
The run page loads the full history; 10^5+ events need snapshots and downsampling.
No rate limiting. Client clocks are trusted for `ts`. No retention policy.
Multi-worker SSE is correct (each connection polls independently) but multiplies
queries.

## 10. What surprised me, and what still concerns me

I expected the hard part to be SSE. It was the boundary between the commit and
the delivery: once the stream became a tail of the log and the client could
always re-read by cursor, most of the "live updates" complexity disappeared, and
the page became a pure function of the event set. The second surprise was how
much of idempotency is ordering — filtering duplicates before assigning `seq` is
the difference between a cursor that means something and one that occasionally
lies. What still concerns me is the viewer side: I proved 500 events/sec into the
database, but not what fifty open streams do when each polls every 300 ms, and
that is the first benchmark I would run. The slow-client path is unit-tested (the
writer waits for `drain`), but I never filled a real socket buffer. And the E2E is
one scenario: strong evidence, not a proof.
