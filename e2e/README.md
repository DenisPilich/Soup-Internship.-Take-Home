# End-to-end tests

Prerequisites:

1. The stack is running: `docker compose up -d --build` from the repository root.
2. Dependencies installed: `npm install` inside `e2e/`.
3. A local Chrome or Edge (the config uses `channel: 'chrome'` by default).

Run:

```bash
npm test
```

The `webServer` entry starts `proxy.mjs`, a TCP-level proxy on port 4100. It
lets a test cut every browser connection (`POST /__offline`) and restore it
(`POST /__online`), so "the network died" is deterministic.

Environment overrides:

| Variable | Default |
|---|---|
| `E2E_BASE_URL` | `http://127.0.0.1:4100` |
| `E2E_API_URL` | `http://127.0.0.1:3000` |
| `E2E_DATABASE_URL` | `postgres://soup:soup@localhost:5432/soup` |
| `E2E_CHANNEL` | `chrome` (set to `chromium` after `npx playwright install chromium`) |
