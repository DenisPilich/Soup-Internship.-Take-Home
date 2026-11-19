import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRunListCache, getRunList, setRunList } from '../src/cache/runList.js';

const run = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'run-1',
  status: 'running',
  created_at: '2026-01-01T00:00:00.000Z',
};

afterEach(() => {
  clearRunListCache();
  vi.useRealTimers();
});

describe('run list cache', () => {
  it('never serves one project through another key', () => {
    setRunList('project-a', [run]);

    expect(getRunList('project-b')).toBeNull();
    expect(getRunList('project-a')).toEqual([run]);
  });

  it('expires after the ttl', () => {
    vi.useFakeTimers();
    setRunList('project-a', [run]);

    vi.advanceTimersByTime(1999);
    expect(getRunList('project-a')).not.toBeNull();

    vi.advanceTimersByTime(2);
    expect(getRunList('project-a')).toBeNull();
  });

  it('is invalidated explicitly', () => {
    setRunList('project-a', [run]);
    clearRunListCache();

    expect(getRunList('project-a')).toBeNull();
  });
});
