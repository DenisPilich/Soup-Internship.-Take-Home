import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { UnauthorizedError, api } from '../api';
import Chart from '../components/Chart';
import { RunStore } from '../runStore';
import type { MetricEvent, StreamStatus } from '../runStore';

type Run = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

const STATUS_LABEL: Record<StreamStatus, string> = {
  connecting: 'connecting',
  live: 'live',
  reconnecting: 'reconnecting',
  expired: 'session expired',
  not_found: 'not found',
};

export default function RunPage() {
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  const storeRef = useRef<RunStore | null>(null);
  if (!storeRef.current) storeRef.current = new RunStore();
  const store = storeRef.current;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    let cancelled = false;

    api<{ run: Run }>(`/api/runs/${runId}`)
      .then((body) => {
        if (!cancelled) setRun(body.run);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) navigate('/login');
        else setError('Run not found');
      });

    return () => {
      cancelled = true;
    };
  }, [runId, navigate]);

  useEffect(() => {
    void store.start(runId);
    window.__getRunState = () => store.getSnapshot();

    return () => {
      store.stop();
      delete window.__getRunState;
    };
  }, [runId, store]);

  useEffect(() => {
    if (state.status === 'expired') navigate('/login');
  }, [state.status, navigate]);

  const series = useMemo(() => {
    const map = new Map<string, MetricEvent[]>();

    for (const event of state.events) {
      const list = map.get(event.name);
      if (list) list.push(event);
      else map.set(event.name, [event]);
    }

    for (const list of map.values()) {
      list.sort((a, b) => (a.ts === b.ts ? a.seq - b.seq : a.ts.localeCompare(b.ts)));
    }

    return map;
  }, [state.events]);

  const recent = useMemo(
    () => [...state.events].sort((a, b) => b.seq - a.seq).slice(0, 15),
    [state.events],
  );

  return (
    <main
      className="page"
      data-run-id={runId}
      data-stream-state={state.status}
      data-event-count={state.events.length}
      data-cursor={state.cursor}
    >
      <header className="topbar">
        <div>
          <Link to="/" className="back">
            ← Runs
          </Link>
          <h1>{run?.name ?? 'Run'}</h1>
        </div>
        <span className={`pill stream-${state.status}`}>{STATUS_LABEL[state.status]}</span>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="stats">
        <div className="stat">
          <span className="label">events</span>
          <span className="value">{state.events.length}</span>
        </div>
        <div className="stat">
          <span className="label">cursor</span>
          <span className="value">{state.cursor}</span>
        </div>
        <div className="stat">
          <span className="label">metrics</span>
          <span className="value">{series.size}</span>
        </div>
      </section>

      <section className="charts">
        {[...series.entries()].map(([name, points]) => (
          <Chart key={name} name={name} points={points} />
        ))}
        {series.size === 0 && <p className="empty">Waiting for metrics…</p>}
      </section>

      <section className="card">
        <h2>Recent events</h2>
        <table>
          <thead>
            <tr>
              <th>seq</th>
              <th>name</th>
              <th>value</th>
              <th>ts</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((event) => (
              <tr key={event.seq}>
                <td>{event.seq}</td>
                <td>{event.name}</td>
                <td>{event.value}</td>
                <td>{new Date(event.ts).toISOString()}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
