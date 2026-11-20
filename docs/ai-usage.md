# AI usage disclosure

I used AI extensively during this task, including for implementation, test development, debugging, and documentation. I treated the generated code as untrusted output rather than as a source of truth: I reviewed the proposed design, made the key architectural decisions, ran the verification scenarios, and used the results to identify and address issues.

This note is intentionally transparent about where AI contributed and where my own engineering judgment was involved.

## How AI was used

- The initial backend, React frontend, automated tests, Docker setup, and first drafts of the design note were generated with assistance from AI.

- I provided the requirements, constraints, and architectural direction, then reviewed and tested the resulting implementation.

- AI was also used to generate the load-test harness and the Playwright network-interruption setup used to reproduce connection failures.

- I independently evaluated the test results and used them to decide which behaviors were acceptable, which required changes, and which limitations had to remain documented.

## Decisions that were mine

| Decision | Alternatives considered | Why |
|---|---|---|
| TypeScript/Node instead of Python | Python + FastAPI | My JavaScript is far stronger; the deadline was fixed and the assignment allows any stack. I rejected the assistant's first Python recommendation after it learned my actual background. |
| SSE instead of WebSocket | WebSocket | One-way traffic; reconnect and `Last-Event-ID` are built in. |
| Postgres as the event log, no Redis/Kafka | Redis Pub/Sub, Redis Streams, a broker | One source of truth. The assignment is about consistency, and every extra component is another place to diverge. |
| 404 for foreign and missing resources | 403 | 403 confirms existence; 404 makes the API useless as an ID oracle. |
| Keep the small run-list cache | No cache | The assignment explicitly asks to prove cache isolation; the cache is 40 lines and its failure mode is testable. |
| Keep the known gaps in the note | Hide them | A clear negative result is better than a hidden failure. |
| Run the Modern Web Guidance audit | Skip it | One deterministic finding, cheap to verify; evidence, not a badge. |

## What was verified

- `npm test`: 31 backend tests, all passing. Raw output in
  `docs/test-output/backend-tests.txt`.
- `npx playwright test`: 2 end-to-end tests, including a real socket cut. Raw
  output in `docs/test-output/e2e.txt`.
- `docker compose down -v && docker compose up --build`: schema, seed, login,
  run list and ingestion from a clean volume.
- `node scripts/load.mjs`: 15 000 events accepted and 15 000 stored at
  500 events/sec, zero errors. Raw output in `docs/test-output/load.txt`.
- A second load run with `BATCH=1` to separate request overhead from write
  throughput (`docs/test-output/load-batch1.txt`).
- Modern Web Guidance 1.0 scanned the frontend; its single finding was verified
  and applied (`docs/modern-web-audit.md`).

## What the AI got wrong

- Its first draft of the SSE design leaned on an in-memory broadcast, which
  loses events on restart and with more than one process. That was rejected in
  favour of a database tail.

## What I rejected outright

- Redis/Redis Streams and a message broker: another source of truth, another
  failure mode, no measured need at this scale.
- WebSocket: bidirectionality we do not use, plus manual reconnect and replay.
- A global `bigserial` as the cursor: commit order can differ from id order, so
  a reader can skip a late commit permanently.
- 403 for foreign resources: it leaks existence.
- Storing API keys or session tokens in plaintext.

## What I changed or redid myself

My main contribution was not typing every line of the implementation, but making and validating the engineering decisions around it.
I reviewed the proposed architecture, rejected alternatives where they added unnecessary complexity or weakened the consistency model, and verified the important failure scenarios through targeted tests.
I paid particular attention to the SSE replay path because it connects the persisted event history with the live client state. I reviewed how reconnects, missed events, event IDs, and ordering interact there and verified the behavior using connection-interruption tests.
Where the implementation did not match the intended behavior, I changed the implementation or the tests rather than accepting the generated result.
