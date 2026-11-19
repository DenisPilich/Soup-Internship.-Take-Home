// A tiny TCP-level proxy used to cut the browser's connections on demand.
// It makes "the network died" a deterministic event instead of a hope.
import http from 'node:http';

const TARGET_HOST = process.env.API_HOST ?? '127.0.0.1';
const TARGET_PORT = Number(process.env.API_PORT ?? 3000);
const PORT = Number(process.env.PROXY_PORT ?? 4100);

const sockets = new Set();
let offline = false;

function destroyAll() {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
}

const server = http.createServer((req, res) => {
  if (req.url === '/__offline' && req.method === 'POST') {
    offline = true;
    // Keep the socket that carries this control request alive, otherwise the
    // client never receives the confirmation.
    sockets.delete(req.socket);
    destroyAll();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"offline":true}');
    return;
  }

  if (req.url === '/__online' && req.method === 'POST') {
    offline = false;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"offline":false}');
    return;
  }

  if (offline) {
    // Accepted, then killed: the browser sees a network error and retries.
    req.socket.destroy();
    return;
  }

  const proxy = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
    },
    (upstream) => {
      res.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(res);
    },
  );

  proxy.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end('{"error":"upstream"}');
  });

  res.on('close', () => proxy.destroy());
  req.pipe(proxy);
});

server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});

server.listen(PORT, () => {
  console.log(`e2e proxy: http://127.0.0.1:${PORT} -> http://${TARGET_HOST}:${TARGET_PORT}`);
});
