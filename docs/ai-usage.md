# AI usage disclosure (draft — finish after the code review)

This project was built with AI assistance. The rule I followed: every generated
piece must be run, read, and explainable; anything I cannot explain does not go
in.

## Log

| # | Area | What the AI suggested | Decision | What I verified | What I changed |
|---|---|---|---|---|---|
| 1 | Stack | Python + FastAPI | **Rejected after new context** | Ran the Node toolchain end to end | Switched to TypeScript/Node: my JS is far stronger and the deadline was fixed |
| 2 | Transport | SSE instead of WebSocket | Accepted | Streaming tests, browser E2E with a real reconnect | Nothing |
| 3 | Architecture | Database as the event log; the stream is a tail; no Redis | Accepted | E2E cut the network and the page converged; load test stored = accepted | Nothing |
| 4 | Ordering | Per-run row lock (`FOR UPDATE`) instead of a global sequence | Accepted | 10 concurrent writers keep seq gap-free; design doc §4 | Nothing |
| 5 | Idempotency | `unique(run_id, event_id)`, dedupe before seq assignment | Accepted | Resend test, duplicate-in-batch test, E2E duplicate batch | Nothing |
| 6 | Errors | 404 for foreign and missing resources | Accepted | Isolation test compares both bodies byte for byte | Nothing |
| 7 | Cache | Small in-process TTL cache keyed by project | Accepted | Invalidation test; cross-project list test | Marked in the note as “not needed for performance, kept to prove cache isolation” |
| 8 | UI state | Pure fold over the event set, keyed by seq | Accepted | E2E compares the client set with a SQL projection | Nothing |
| 9 | Load numbers | Run a real closed-loop load test, do not invent numbers | Accepted | `docs/test-output/load*.txt` | Added a second run with batch=1 to isolate request overhead |

## What the AI got wrong

- It first recommended Python without knowing that my Python is one vibe-coded
  project and my JavaScript is far stronger. New information reversed the
  recommendation; the lesson is that a recommendation without context is noise.
- Its first implementation brief assumed I could write the SQL transaction from
  a seven-step description. I could not; that step had to be replaced by a
  reference implementation that I then read and verified.

## What I verified myself

- Ran `npm test`, `npx playwright test`, and the load test; outputs are in
  `docs/test-output/`.
- Ran `docker compose up --build` from a clean state and used the UI.
- Walked the four core files (`src/ingest.ts`, `src/routes/stream.ts`,
  `src/auth/session.ts`, `web/src/runStore.ts`) and can explain every branch.

## What I changed or redid myself

- (to fill in after the review: at minimum, list the parts I rewrote or the
  tests I added by hand, and the AI suggestions I rejected after checking)

## What I outright rejected

- Redis/Redis Streams and a message broker: another source of truth, another
  failure mode, no measured need at 500 events/sec.
- WebSocket: bidirectionality we do not use, manual reconnect and replay.
- A global `bigserial` as the cursor: commit order can differ from id order, so
  a reader can skip a late commit permanently.
- 403 for foreign resources: it leaks existence.
