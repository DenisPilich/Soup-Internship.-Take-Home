import { chromium } from '@playwright/test';

const API = process.env.API_URL ?? 'http://127.0.0.1:3000';
const KEY = 'soup_demoa001_1f8c2b6e4a9d4f7c8b3e5a1d6f9c2b7e4a8d1f3c';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });

await page.goto(`${API}/login`);
await page.getByLabel('API key').fill(KEY);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('heading', { name: 'Runs' }).waitFor();

// A fresh run keeps the screenshot free of earlier demo timestamps.
const created = await page.request.post(`${API}/api/runs`, {
  data: { name: 'loss-curve' },
});
const { run } = await created.json();

const events = Array.from({ length: 24 }, (_, index) => ({
  event_id: crypto.randomUUID(),
  name: 'loss',
  value: Number((0.9 * Math.exp(-index / 9) + 0.08 + Math.random() * 0.03).toFixed(3)),
  ts: new Date(Date.now() - (24 - index) * 2000).toISOString(),
}));

const ingest = await fetch(`${API}/runs/${run.id}/metrics`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ events }),
});
console.log('ingest', ingest.status, await ingest.text());

await page.goto(`${API}/runs/${run.id}`);
await page.locator('main[data-stream-state="live"]').waitFor();
await page.waitForTimeout(800);

await page.screenshot({ path: '../docs/run-page.png', fullPage: true });
console.log('saved docs/run-page.png');
await browser.close();
