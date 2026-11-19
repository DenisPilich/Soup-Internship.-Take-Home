// SSE lab — 30 minutes, deliberately not part of the deliverable.
// The event log lives in memory on purpose: the lab is about seeing why that is not enough.

import http from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = 3001;
const TICK_MS = 1000;
const MAX_LOG = 10_000;

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

let seq = 0;
const log = [];
const clients = new Set();

setInterval(() => {
  seq += 1;
  const event = {
    seq,
    at: new Date().toISOString(),
    value: Math.round(Math.random() * 100),
  };

  log.push(event);
  if (log.length > MAX_LOG) log.shift();

  const frame = `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    if (res.destroyed) {
      clients.delete(res);
      continue;
    }
    res.write(frame);
  }
}, TICK_MS);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page);
    return;
  }

  if (url.pathname !== '/stream') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }

  const headerLast = req.headers['last-event-id'];
  const queryLast = url.searchParams.get('after');
  const cursor = Number(headerLast ?? queryLast ?? 0);

  console.log(
    `[stream] connect cursor=${cursor} ` +
      `(Last-Event-ID=${headerLast ?? 'none'}, after=${queryLast ?? 'none'}) ` +
      `log=[${log[0]?.seq ?? '-'}..${log.at(-1)?.seq ?? '-'}]`,
  );

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write('retry: 1500\n\n');

  const backlog = log.filter((event) => event.seq > cursor);
  console.log(`[stream] replay ${backlog.length} event(s)`);
  for (const event of backlog) {
    res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
    console.log('[stream] closed');
  });
});

server.listen(PORT, () => {
  console.log(`SSE lab: http://localhost:${PORT}`);
  console.log('Kill the server with Ctrl+C, then start it again to watch the client recover.');
});
