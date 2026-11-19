# SSE lab (about 30 minutes)

Not part of the deliverable. This is a warm-up: feel what SSE actually does before we build the real stream.

The event log lives in memory **on purpose**. By the end you should be able to say why that is not enough.

## Run

```bash
node labs/sse/server.mjs
```

Open http://localhost:3001. Keep the server console visible.

## Steps

1. Watch one event per second. The `id:` field is the cursor.
2. Press `Ctrl+C`. The page shows `error (readyState=0)`. `EventSource` retries by itself — there is no reconnect code in the page.
3. Leave the page open and restart the server.
4. Look at the server console: which `Last-Event-ID` did the browser send? How many events were replayed?
5. The in-memory log died with the process. The new events start again from `1`, below the client's cursor. What should a real client do with an `id` that is lower than what it has already applied?

## Questions (answer in your own words — I will ask them)

- Why did the browser reconnect with no client code?
- Who sets `Last-Event-ID`, and what exactly does it mean?
- Why is an in-memory log not enough for "no lost events"?
- What single change makes this lab correct?
- Open two tabs. Do they share a cursor? What does that tell you about where state must live?
