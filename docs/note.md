# Engineering note — mini experiment tracker

## 1. Architecture

One Express process serves the React SPA and the API; Postgres is the only
stateful component. The API keeps no session or stream state in memory (apart
from a 2-second run-list cache), so additional processes are safe.

```
experiment client ── POST /runs/{id}/metrics ──► API ──► Postgres (event log)
                                                          │
browser ◄── SSE tail (seq > cursor) ◄── API ◄────────────┘
   ▲
   └── GET /api/runs/{id}/events?after_seq=N  (snapshot / gap repair)
```

No Redis, no broker, no server-side aggregates. Every added component would be
another place where "what the user sees" and "what is stored" can diverge. The
stream is a replayable tail of the log, not a publisher of truth.

## 2. Event model and ordering

`POST /runs/{id}/metrics` takes `{batch_id?, events: [{event_id, name, value, ts}]}`.
`event_id` is the client-generated identity and the idempotency key. `seq` is
server-assigned; a client-sent sequence would fight ordering. `run_id` and
`project_id` come from the path and the credential, never from the body. Batches
are capped at 500 events and 1 MiB, and are all-or-nothing (422 on any invalid
event).

Each run has a gap-free `seq` from 1 to N, assigned inside the ingestion
transaction while holding `SELECT … FROM runs WHERE id=$1 AND project_id=$2 FOR
UPDATE`. The lock is held until commit, so **commit order equals seq order**: a
reader cannot see `seq = k+1` while `k` is still uncommitted. That is what makes
"everything after my cursor" safe without a message broker.

`seq` is transport order (cursor, dedupe, gap detection); `ts` is domain order
(chart axis, "latest value"). The UI sorts points by `(ts, seq)`. A late event
gets the next `seq` and is displayed at its timestamp, never appended blindly.
Example: timestamps 10, 30, 20 arrive in that order, get seq 1, 2, 3, and are
drawn 10, 20, 30.

## 3. Idempotency

`UNIQUE (run_id, event_id)` is the idempotency key. Duplicates inside a batch
are collapsed before insertion, and events already in the database are filtered
out **before** seq is assigned, so a retry cannot create holes in the sequence.
Retrying an applied batch returns `accepted = 0, duplicates = N`; the response
body may differ from the first call, the effect may not. A failure halfway
through a batch rolls back the transaction, leaving zero rows.

## 4. Reconnect and replay

Transport is SSE (`GET /api/runs/{id}/stream`), cookie-authenticated. The handler
repeats `select … where seq > cursor order by seq limit 500`, sends `id: <seq>`
frames, polls every 300 ms while idle and sends a heartbeat every 15 s. The
cursor comes from `Last-Event-ID` (set by the browser on every reconnect) or
`?after_seq=`.

Delivery is at-least-once. The client stores events by `seq` (unique per run),
advances its cursor only through contiguous seqs, ignores anything at or below
the cursor, and on a gap fetches `GET /events?after_seq=cursor`. It reconciles
on tab focus and every 30 s. A crash after commit and before the SSE write
loses nothing: the row is in the log and the next connection replays it.

A slow client is handled with backpressure: the writer awaits `drain` when the
socket buffer is full. The server never builds a per-client queue, so the
failure mode is lag, not memory growth.

## 5. Isolation

`project_id` is derived from the credential (API key or session cookie) and is
never read from the URL or body. Every operation resolves the run with
`WHERE id = $1 AND project_id = $2`; events are only reachable through that run.
A foreign run and a nonexistent one produce the same 404 body, so the API is not
an existence oracle. SSE authorizes before the first byte. The run-list cache is
keyed by project id, authorization happens before the lookup, and the cached
payload carries its project id and is revalidated.

API keys are stored as `sha256(secret)` with a plaintext lookup prefix; sessions
store only `sha256(token)` and are bound to the key that minted them. Rotation
revokes every active key and, through a join on `api_keys.revoked_at`, every
session minted from it. Logs never contain keys, tokens or session ids; error
bodies never echo resource data. Foreign and missing ids take the same query
path and return the same body; no statistical timing test was run, so a timing
side channel is not ruled out.

## 6. Test evidence

- 25 backend tests (`npm test`): ingestion invariants, HTTP validation,
  isolation, rotation, SSE replay and authorization. Raw output:
  `docs/test-output/backend-tests.txt`.
- 2 Playwright tests (`e2e/`): the consistency scenario (out-of-order, duplicate
  batch, late event, socket-level disconnect, reconnect) and a cross-project
  page access check. Raw output: `docs/test-output/e2e.txt`.
- The E2E compares three things: the page's rendered attributes, the client's
  applied event set (`window.__getRunState`), and a projection computed directly
  from SQL. The DB is the oracle; the API's own view is not trusted.

What the E2E proves: for this scenario, the set of events in the database equals
the set the UI applied, with no duplicates, the same order and the same values;
the cursor equals the row count.

What it does **not** prove: other interleavings; transport reliability; correct
behaviour with multiple API instances; rendering beyond the asserted nodes;
performance; security against a targeted attacker; durability under host
failure; or that the projection specification itself is right (the client and
the SQL oracle could share a misunderstanding).

## 7. Silent failures

| Failure | How it was checked | Result |
|---|---|---|
| Lost events after reconnect | E2E cuts every socket, ingests while offline, reconnects | converged, no loss |
| Duplicate batch | backend test + E2E resend | `accepted=0`, one row per event |
| Out-of-order arrival | E2E sends seq 1,2 then 3 then a late event | displayed by `ts`, cursor by `seq` |
| Partial write | fault injection: one event violates a DB check | zero rows |
| Old key after rotation | API test: old key and its session | 401, new key 200 |
| Slow client / queue overflow | not automated; backpressure by design, no per-client queue | known gap |
| Stale cache | invalidation test after create; TTL 2 s | new run visible immediately |
| Unauthorized subscription / ingestion | tests against a foreign run | 404, no bytes, no rows |
| Unauthorized read of a run list | test with two projects | only own runs |

## 8. Performance verdict

Measured on a laptop running Docker Desktop (16 logical cores), one API
container, one Postgres 16 container, closed-loop clients:

| Scenario | Requests | Accepted | Stored | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|---|---|
| 50 runs × 10 ev/s, batch 5 (30 s) | 3000 | 15000 | 15000 | 58 ms | 89 ms | 177 ms | 0 |
| 50 runs × 10 ev/s, batch 1 (10 s) | 5000 | 5000 | 5000 | 95 ms | 129 ms | 146 ms | 0 |

**SHIP** for the stated workload. Ingestion at 500 events/sec with a batching
client leaves the database far from saturated, and accepted events always equal
stored events. Absolute latency is dominated by request overhead and Docker
networking, not by the write path: batching five events per request cuts
requests fivefold and p50 latency by roughly 40%.

Bottlenecks, in order: (1) per-connection SSE polling is `O(viewers)` queries per
interval and is **not** load-tested; (2) a single API process and a single
Postgres mean no redundancy, so this is a demo-grade deployment; (3) many runs
per project would make the run list and full-history page expensive. First
changes for 10× traffic: batch on the client, replace per-connection polling with
one tailer per run (or `LISTEN/NOTIFY` as an optimisation, keeping the poll as
fallback), then add read replicas/downsampling; multi-instance fan-out needs a
shared log (Redis Streams) or accepting per-instance polling.

## 9. Known limitations

Single Postgres, no HA or backups. Cookies are not `Secure` because the demo runs
over http://localhost. The cache is per process, so worst-case staleness is 2 s.
The run page loads the full history; 10^5+ events need snapshots and downsampling.
No rate limiting. Client clocks are trusted for `ts`. No retention policy.
Multi-worker SSE is correct (each connection polls independently) but multiplies
queries.

## 10. What surprised me

I expected the hard part to be SSE. It was not: the hard part was the boundary
between the commit and the delivery. Once the stream became a tail of the log and
the client could always re-read by cursor, most of the "live updates" complexity
disappeared — the transport became an optimisation, and the page could be a pure
function of the event set. The second surprise was how much of idempotency is
just ordering: filtering duplicates before assigning `seq` was the difference
between a cursor that means something and one that occasionally lies.

## 11. What still concerns me

The viewer side is not measured. I proved 500 events/sec into the database, but
not what happens to fifty open streams when each connection polls every 300 ms —
that is the first thing I would benchmark before calling this production-ready.
I also do not have a test for a genuinely slow client: the design removes the
per-client queue, but I verified that by reading the code, not by pushing a
stalled socket until the buffer fills. And the E2E is one scenario; it is strong
evidence, not a proof.
