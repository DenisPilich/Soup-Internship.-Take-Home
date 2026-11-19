import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { writeChunk } from '../src/routes/stream.js';

type FakeResponse = {
  writableEnded: boolean;
  destroyed: boolean;
  write: () => boolean;
  once: (event: string, handler: () => void) => void;
  off: (event: string, handler: () => void) => void;
};

function fakeResponse(writeResult: boolean) {
  let drain: (() => void) | null = null;

  const response: FakeResponse = {
    writableEnded: false,
    destroyed: false,
    write: () => writeResult,
    once: (event, handler) => {
      if (event === 'drain') drain = handler;
    },
    off: () => undefined,
  };

  return { response: response as unknown as Response, drain: () => drain?.() };
}

describe('sse backpressure', () => {
  it('does not resolve while the socket buffer is full', async () => {
    const { response } = fakeResponse(false);
    let settled = false;

    void writeChunk(response, 'id: 1\n\n').then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);
  });

  it('resumes when the socket drains', async () => {
    const { response, drain } = fakeResponse(false);
    let settled = false;

    const pending = writeChunk(response, 'id: 1\n\n').then(() => {
      settled = true;
    });

    drain();
    await pending;
    expect(settled).toBe(true);
  });

  it('resolves immediately when the buffer accepts the chunk', async () => {
    const { response } = fakeResponse(true);
    await expect(writeChunk(response, 'id: 1\n\n')).resolves.toBeUndefined();
  });
});
