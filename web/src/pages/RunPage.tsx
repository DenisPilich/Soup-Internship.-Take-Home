import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { UnauthorizedError, api } from '../api';
import Chart from '../components/Chart';
import { Shell } from '../components/Shell';
import { formatNumber, formatRelative } from '../format';
import { RunStore } from '../runStore';
import type { MetricEvent, StreamStatus } from '../runStore';

type Run = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

type Tab = 'overview' | 'metrics' | 'events';

const STATUS_LABEL: Record<StreamStatus, string> = {
  connecting: 'connecting',
  live: 'live',
  reconnecting: 'reconnecting',
  expired: 'session expired',
  not_found: 'not found',
};

const PALETTE = ['#5b8cff', '#3ddc97', '#b07cff', '#ffb454', '#ff6b8a'];

export default function RunPage() {
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

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

  const colors = useMemo(() => {
    const map = new Map<string, string>();
    let index = 0;
    for (const name of series.keys()) {
      map.set(name, PALETTE[index % PALETTE.length]!);
      index += 1;
    }
    return map;
  }, [series]);

  const recent = useMemo(
    () => state.events.toSorted((a, b) => b.seq - a.seq).slice(0, 20),
    [state.events],
  );

  const aside = (
    <div className="run-aside">
      <span className="eyebrow">Run</span>
      <p className="aside-title">{run?.name ?? '…'}</p>

      <dl className="meta">
        <div>
          <dt>status</dt>
          <dd>
            <i className={`dot stream-${state.status}`} />
            {STATUS_LABEL[state.status]}
          </dd>
        </div>
        <div>
          <dt>created</dt>
          <dd>{run ? formatRelative(run.created_at) : '—'}</dd>
        </div>
        <div>
          <dt>run id</dt>
          <dd className="mono">{runId.slice(0, 8)}</dd>
        </div>
        <div>
          <dt>events</dt>
          <dd className="mono">{state.events.length}</dd>
        </div>
        <div>
          <dt>cursor</dt>
          <dd className="mono">{state.cursor}</dd>
        </div>
      </dl>

      <span className="eyebrow">Metrics</span>
      <ul className="metric-list">
        {[...series.entries()].map(([name, points]) => (
          <li key={name}>
            <i style={{ background: colors.get(name) }} />
            <span>{name}</span>
            <b>{formatNumber(points[points.length - 1]!.value)}</b>
          </li>
        ))}
        {series.size === 0 && <li className="muted">none yet</li>}
      </ul>
    </div>
  );

  return (
    <Shell aside={aside}>
      <main
        className="run-page"
        data-run-id={runId}
        data-stream-state={state.status}
        data-event-count={state.events.length}
        data-cursor={state.cursor}
      >
        <header className="page-head">
          <div>
            <div className="breadcrumb">
              <Link to="/">Runs</Link>
              <span>/</span>
              <span className="muted">{run?.name ?? 'run'}</span>
            </div>
            <h1>{run?.name ?? 'Run'}</h1>
          </div>

          <div className="head-actions">
            <span className={`pill stream-${state.status}`}>
              <i className="dot" />
              {STATUS_LABEL[state.status]}
            </span>
          </div>
        </header>

        {error && <p className="notice error">{error}</p>}

        <nav className="tabs" aria-label="Run views">
          {(['overview', 'metrics', 'events'] as const).map((value) => (
            <button
              key={value}
              className={tab === value ? 'tab active' : 'tab'}
              onClick={() => setTab(value)}
            >
              {value}
            </button>
          ))}
        </nav>

        {tab !== 'events' && (
          <section className="stats">
            <div className="stat">
              <span className="eyebrow">Events</span>
              <span className="stat-value">{state.events.length}</span>
              <span className="stat-sub">applied to the page</span>
            </div>
            <div className="stat">
              <span className="eyebrow">Cursor</span>
              <span className="stat-value">{state.cursor}</span>
              <span className="stat-sub">last contiguous seq</span>
            </div>
            <div className="stat">
              <span className="eyebrow">Metrics</span>
              <span className="stat-value">{series.size}</span>
              <span className="stat-sub">series</span>
            </div>
            <div className="stat">
              <span className="eyebrow">Stream</span>
              <span className="stat-value status-value">{STATUS_LABEL[state.status]}</span>
              <span className="stat-sub">server-sent events</span>
            </div>
          </section>
        )}

        {tab !== 'events' && (
          <section className="charts">
            {[...series.entries()].map(([name, points]) => (
              <Chart
                key={name}
                name={name}
                points={points}
                color={colors.get(name) ?? PALETTE[0]!}
              />
            ))}
            {series.size === 0 && <div className="empty-card">Waiting for metrics…</div>}
          </section>
        )}

        {tab !== 'metrics' && (
          <section className="panel">
            <header className="panel-head">
              <h2>Recent events</h2>
              <span className="muted small">latest 20 by seq</span>
            </header>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>seq</th>
                    <th>name</th>
                    <th>value</th>
                    <th>timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((event) => (
                    <tr key={event.seq}>
                      <td className="mono dim">{event.seq}</td>
                      <td>{event.name}</td>
                      <td className="mono">{formatNumber(event.value)}</td>
                      <td className="mono muted">{new Date(event.ts).toISOString()}</td>
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
            </div>
          </section>
        )}
      </main>
    </Shell>
  );
}
