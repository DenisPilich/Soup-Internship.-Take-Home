import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import gifenc from 'gifenc';
import { chromium } from '@playwright/test';
import pngjs from 'pngjs';

const { GIFEncoder, applyPalette, quantize } = gifenc;
const { PNG } = pngjs;

const API = process.env.API_URL ?? 'http://127.0.0.1:3000';
const KEY = 'soup_demoa001_1f8c2b6e4a9d4f7c8b3e5a1d6f9c2b7e4a8d1f3c';

const VIEWPORT = { width: 1280, height: 820 };
const CLIP = { x: 0, y: 0, width: 1280, height: 790 };
const TARGET_WIDTH = 960;
const FRAMES = 26;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resize(png, width) {
  const scale = width / png.width;
  const height = Math.round(png.height * scale);
  const out = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(png.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(png.width - 1, Math.floor(x / scale));
      const source = (sourceY * png.width + sourceX) * 4;
      const target = (y * width + x) * 4;
      out[target] = png.data[source];
      out[target + 1] = png.data[source + 1];
      out[target + 2] = png.data[source + 2];
      out[target + 3] = 255;
    }
  }

  return { data: out, width, height };
}

function sampleValues(tick) {
  const noise = () => (Math.random() - 0.5) * 0.012;
  return [
    {
      event_id: randomUUID(),
      name: 'loss',
      value: Number((0.38 + 0.58 * Math.exp(-tick / 9) + noise()).toFixed(4)),
      ts: new Date().toISOString(),
    },
    {
      event_id: randomUUID(),
      name: 'accuracy',
      value: Number((0.55 + 0.33 * (1 - Math.exp(-tick / 9)) + noise() / 2).toFixed(4)),
      ts: new Date().toISOString(),
    },
  ];
}

async function ingest(runId, events) {
  await fetch(`${API}/runs/${runId}/metrics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ events }),
  }).catch(() => undefined);
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

await page.goto(`${API}/login`);
await page.getByLabel('API key').fill(KEY);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('heading', { name: 'Runs', exact: true }).waitFor();

// A fresh run keeps the chart free of earlier demo timestamps.
const created = await page.request.post(`${API}/api/runs`, {
  data: { name: 'resnet18-cifar10' },
});
const { run } = await created.json();

// A little history so the first frame already has two curves.
const history = [];
for (let tick = 1; tick <= 25; tick += 1) {
  const events = sampleValues(tick);
  const ts = new Date(Date.now() - (25 - tick) * 2000).toISOString();
  for (const event of events) event.ts = ts;
  history.push(...events);
}
await ingest(run.id, history);

await page.goto(`${API}/runs/${run.id}`);
await page.locator('main[data-stream-state="live"]').waitFor();
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(800);

let tick = 25;
let sending = true;

const sender = (async () => {
  while (sending) {
    tick += 1;
    await ingest(run.id, sampleValues(tick));
    await sleep(600);
  }
})();

const frames = [];
const captureStarted = Date.now();

for (let index = 0; index < FRAMES; index += 1) {
  const startedAt = Date.now();
  const buffer = await page.screenshot({ clip: CLIP });
  frames.push(PNG.sync.read(buffer));

  const elapsed = Date.now() - startedAt;
  if (elapsed < 300) await sleep(300 - elapsed);
}

sending = false;
await sender;
await browser.close();

const frameDelay = Math.min(600, Math.max(150, Math.round((Date.now() - captureStarted) / frames.length)));

const first = resize(frames[0], TARGET_WIDTH);
const palette = quantize(first.data, 96);
const gif = GIFEncoder();

for (const frame of frames) {
  const resized = resize(frame, TARGET_WIDTH);
  const index = applyPalette(resized.data, palette);
  gif.writeFrame(index, resized.width, resized.height, { palette, delay: frameDelay });
}

gif.finish();
const bytes = gif.bytes();
writeFileSync('../docs/live.gif', bytes);

console.log(
  `saved docs/live.gif (${(bytes.length / 1024 / 1024).toFixed(2)} MB, ${frames.length} frames, ${frameDelay} ms/frame, run ${run.id})`,
);
