import { chromium } from '@playwright/test';

const API = process.env.API_URL ?? 'http://127.0.0.1:3000';
const KEY = 'soup_demoa001_1f8c2b6e4a9d4f7c8b3e5a1d6f9c2b7e4a8d1f3c';
const RUN_ID = '00000000-0000-4000-8000-0000000000c1';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });

await page.goto(`${API}/login`);
await page.getByLabel('API key').fill(KEY);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('heading', { name: 'Runs' }).waitFor();

await page.goto(`${API}/runs/${RUN_ID}`);
await page.locator('main[data-stream-state="live"]').waitFor();
await page.waitForTimeout(800);

await page.screenshot({ path: '../docs/run-page.png', fullPage: true });
console.log('saved docs/run-page.png');
await browser.close();
