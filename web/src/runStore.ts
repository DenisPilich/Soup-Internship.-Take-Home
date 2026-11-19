export type MetricEvent = {
  seq: number;
  event_id: string;
  name: string;
  value: number;
  ts: string;
};

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'expired';

export type RunState = {
  events: MetricEvent[];
  cursor: number;
  status: StreamStatus;
};

const PAGE = 1000;
const RECONCILE_MS = 30_000;

/**
 * The page state is a pure fold over the event set. `seq` is the transport
 * cursor, `ts` is the domain order; the component sorts for display.
 *
 * Invariants:
 *  - an event is stored at most once (keyed by seq, which is unique per run);
 *  - the cursor only moves through contiguous seqs, so a gap is visible;
 *  - a visible gap triggers a fetch from the cursor, never a silent skip.
 */
export class RunStore {
  private bySeq = new Map<number, MetricEvent>();
  private cursor = 0;
  private status: StreamStatus = 'connecting';
  private source: EventSource | null = null;
  private runId = '';
  private stopped = true;
  private gapInFlight = false;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private cached: RunState | null = null;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): RunState => {
    if (!this.cached) {
      const events = [...this.bySeq.values()].sort((a, b) => a.seq - b.seq);
      this.cached = { events, cursor: this.cursor, status: this.status };
    }
    return this.cached;
  };

  async start(runId: string): Promise<void> {
    this.stop();

    this.runId = runId;
    this.stopped = false;
    this.bySeq.clear();
    this.cursor = 0;
    this.setStatus('connecting');

    await this.loadFrom(0);
    if (this.stopped || this.status === 'expired') return;

    this.openStream();
    this.reconcileTimer = setInterval(() => {
      void this.fillGap();
    }, RECONCILE_MS);

    document.addEventListener('visibilitychange', this.onVisible);
  }

  stop(): void {
    this.stopped = true;
    this.source?.close();
    this.source = null;

    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }

    document.removeEventListener('visibilitychange', this.onVisible);
  }

  private onVisible = (): void => {
    if (document.visibilityState === 'visible') void this.fillGap();
  };

  private emit(): void {
    this.cached = null;
    for (const listener of this.listeners) listener();
  }

  private setStatus(status: StreamStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit();
  }

  private async loadFrom(after: number): Promise<void> {
    let cursor = after;

    for (;;) {
      const response = await fetch(
        `/api/runs/${this.runId}/events?after_seq=${cursor}&limit=${PAGE}`,
        { credentials: 'same-origin' },
      );

      if (response.status === 401) {
        this.setStatus('expired');
        return;
      }
      if (!response.ok) {
        this.setStatus('reconnecting');
        return;
      }

      const body = (await response.json()) as { events: MetricEvent[]; last_seq: number };
      this.apply(body.events);

      if (body.events.length < PAGE) return;
      cursor = body.events[body.events.length - 1]!.seq;
    }
  }

  private openStream(): void {
    // after_seq is used on the first connect; the browser sends Last-Event-ID
    // by itself on every reconnect, and the server prefers that header.
    const source = new EventSource(`/api/runs/${this.runId}/stream?after_seq=${this.cursor}`);
    this.source = source;

    source.onopen = () => this.setStatus('live');

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) this.setStatus('expired');
      else this.setStatus('reconnecting');
    };

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as MetricEvent;
        this.apply([event]);
        if (event.seq > this.cursor + 1) void this.fillGap();
      } catch {
        // A malformed frame is ignored; the next reconcile repairs the state.
      }
    };
  }

  private apply(events: MetricEvent[]): void {
    let changed = false;

    for (const event of events) {
      if (event.seq <= this.cursor) continue;
      if (this.bySeq.has(event.seq)) continue;
      this.bySeq.set(event.seq, event);
      changed = true;
    }

    while (this.bySeq.has(this.cursor + 1)) {
      this.cursor += 1;
      changed = true;
    }

    if (changed) this.emit();
  }

  private async fillGap(): Promise<void> {
    if (this.gapInFlight || this.stopped) return;
    this.gapInFlight = true;
    try {
      await this.loadFrom(this.cursor);
    } finally {
      this.gapInFlight = false;
    }
  }
}
