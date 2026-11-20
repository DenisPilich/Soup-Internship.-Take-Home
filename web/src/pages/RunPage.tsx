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

const PALETTE = ['#7c3aed', '#0f9d76', '#0891b2', '#db2777', '#d97706'];

export default function RunPage() {
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

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

  const visibleSeries = useMemo(
    () => [...series.entries()].filter(([name]) => !hidden.has(name)),
    [series, hidden],
  );

  const recent = useMemo(
    () => state.events.toSorted((a, b) => b.seq - a.seq).slice(0, 20),
    [state.events],
  );

  function toggleMetric(name: string) {
    setHidden((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const status = (
    <>
      <span className="status-item">events:{state.events.length}</span>
      <span className="status-item">cursor:{state.cursor}</span>
      <span className="status-item">
        <i className={`dot ${state.status}`} /> {STATUS_LABEL[state.status]}
      </span>
    </>
  );

  return (
    <Shell activeRunId={runId} status={status}>
      <main
        className="run-page"
        data-run-id={runId}
        data-stream-state={state.status}
        data-event-count={state.events.length}
        data-cursor={state.cursor}
      >
        <header className="page-head">
          <div>
            <p className="eyebrow">// run</p>
            <div className="breadcrumb">
              <span>~</span>
              <span>/</span>
              <Link to="/">runs</Link>
              <span>/</span>
              <span>{run?.name ?? 'run'}</span>
            </div>
            <div className="title-line">
              <h1>{run?.name ?? 'Run'}</h1>
              <span className={`status ${state.status}`}>
                <i className="dot" />
                {STATUS_LABEL[state.status]}
              </span>
            </div>
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

        <div className="run-layout">
          <aside className="run-controls panel">
            <div className="control-section">
              <span className="control-label"># run.info</span>
              <dl className="kv">
                <div>
                  <dt>status</dt>
                  <dd>
                    <span className={`status ${state.status}`}>
                      <i className="dot" />
                      {STATUS_LABEL[state.status]}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>created</dt>
                  <dd>{run ? formatRelative(run.created_at) : '-'}</dd>
                </div>
                <div>
                  <dt>run_id</dt>
                  <dd className="mono run-id" title={runId}>
                    {runId.slice(0, 8)}
                  </dd>
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
            </div>

            <div className="control-section">
              <span className="control-label"># metrics</span>
              <div className="metric-toggles">
                {[...series.keys()].map((name) => (
                  <label key={name} className="metric-toggle">
                    <input
                      type="checkbox"
                      checked={!hidden.has(name)}
                      onChange={() => toggleMetric(name)}
                    />
                    <i style={{ background: colors.get(name) }} />
                    <span>{name}</span>
                  </label>
                ))}
                {series.size === 0 && <span className="muted small">none yet</span>}
              </div>
            </div>
          </aside>

          <div className="run-main">
            {tab !== 'events' && (
              <section className="charts">
                {visibleSeries.map(([name, points]) => (
                  <Chart
                    key={name}
                    name={name}
                    points={points}
                    color={colors.get(name) ?? PALETTE[0]!}
                  />
                ))}
                {visibleSeries.length === 0 && (
                  <div className="empty-card panel">
                    {series.size === 0 ? 'waiting for metrics...' : 'all metrics hidden'}
                  </div>
                )}
              </section>
            )}

            {tab !== 'metrics' && (
              <section className="panel">
                <header className="panel-head">
                  <h2># recent events</h2>
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
                            no events yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </Shell>
  );
}
