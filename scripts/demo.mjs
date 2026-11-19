// Sends a live metric stream to the demo run so the page can be watched
// updating. Ctrl+C to stop.
import { randomUUID } from 'node:crypto';

const API = process.env.API_URL ?? 'http://127.0.0.1:3000';
const KEY =
  process.env.API_KEY ?? 'soup_demoa001_1f8c2b6e4a9d4f7c8b3e5a1d6f9c2b7e4a8d1f3c';
const RUN_ID = process.env.RUN_ID ?? '00000000-0000-4000-8000-0000000000c1';

let tick = 0;

for (;;) {
  tick += 1;
  const events = [
    {
      event_id: randomUUID(),
      name: 'loss',
      value: Number((0.9 * Math.exp(-tick / 20) + 0.04 + Math.random() * 0.02).toFixed(4)),
      ts: new Date().toISOString(),
    },
    {
      event_id: randomUUID(),
      name: 'accuracy',
      value: Number((0.55 + 0.4 * (1 - Math.exp(-tick / 20)) + Math.random() * 0.01).toFixed(4)),
      ts: new Date().toISOString(),
    },
  ];

  try {
    const response = await fetch(`${API}/runs/${RUN_ID}/metrics`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({ events }),
    });

    const body = await response.text();
    console.log(`[demo] ${response.status} ${body}`);
  } catch (error) {
    console.log(`[demo] failed: ${String(error)}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
}
