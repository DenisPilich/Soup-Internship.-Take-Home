# Soup internship — mini experiment tracker

Work in progress. The design lives in [docs/design.md](docs/design.md); this
README will grow into the run instructions for the submission.

## Quick start

```bash
docker compose up --build
```

Open http://localhost:3000 — the API is up; the UI is the next milestone.

Demo credentials are seeded on startup (development only, not secrets):

| Project | API key |
|---|---|
| Project A | `soup_demoa001_1f8c2b6e4a9d4f7c8b3e5a1d6f9c2b7e4a8d1f3c` |
| Project B | `soup_demob002_7c4e1a9f3b6d2e8a5c1f7b4d9e2a6c3f8b5d1e7a` |

## Local development

```bash
npm install
cp .env.example .env
docker compose up -d db
npm run migrate
npm run seed
npm run dev            # http://localhost:3000
```

## Tests

Integration tests talk to the Postgres from `docker compose up -d db`.

```bash
npm test
```

## Layout

```
src/            HTTP app, database access, ingestion, auth helpers
src/db/         pool, schema.sql, migrate, demo seed
tests/          Vitest suites (unit + integration)
labs/           learning experiments, not part of the deliverable
docs/           design and (later) the engineering note
```
