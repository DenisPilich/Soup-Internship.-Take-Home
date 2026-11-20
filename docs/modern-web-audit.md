# Modern web audit

Ran Google's [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance)
1.0 scanner — the project stewarded by the Chrome, Edge, Firefox and MDN teams.
It is a deterministic local scan (AST/DOM/CSS parsers, no LLM calls) over the
guides that have reliable legacy-pattern rules.

```bash
npx modern-web-guidance@latest legacy-scan web
```

Result: **1 finding** across 38 scanned rules (~20% of the guidance corpus).

## Finding and change

| | |
|---|---|
| Guide | shallow-copy sorting → `toSorted()` / `toReversed()` / `findLast()` |
| Location | `web/src/pages/RunPage.tsx`, the "recent events" memo |
| Before | `[...state.events].sort((a, b) => b.seq - a.seq).slice(0, 15)` |
| After | `state.events.toSorted((a, b) => b.seq - a.seq).slice(0, 15)` |

Verification against the tool's Keep/Drop criteria: `state.events` is a plain
`Array` (not a `Set`, `Map`, `NodeList` or other iterable), so the "keep"
condition holds and the "drop" condition does not. `toSorted` returns a new
array, so the state is not mutated and the memo still has a stable input.

Browser baseline: `toSorted` is Baseline 2023 (Chrome 110, Firefox 115,
Safari 16). The app already requires a modern browser (React 19, ES2022), so no
fallback is needed. `web/tsconfig.json` was moved to the ES2023 lib for the
type.

## What was checked and left alone

- No legacy CSS patterns were flagged: no `scrollHeight` auto-resize hooks, no
  `max-height: 9999px` accordion tricks, no imperative dialog/popover listeners.
- The sign-in form intentionally uses `autocomplete="off"` on the API-key field:
  it is a secret token, not a username or password, so the autofill guide does
  not apply.
- No external CDN scripts, so there is no missing subresource integrity.

The scanner is static and provisional by design; this note records the check
rather than claiming the whole frontend is "modern".
