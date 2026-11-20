import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UnauthorizedError, api } from '../api';
import { Shell } from '../components/Shell';
import { formatRelative } from '../format';

type Run = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

export default function RunListPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const list = await api<{ runs: Run[] }>('/api/runs');
      setRuns(list.runs);
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) navigate('/login');
      else setError('Could not load runs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createRun(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    await api('/api/runs', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
    setName('');
    await load();
  }

  return (
    <Shell>
      <header className="page-head">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Runs</h1>
        </div>

        <form className="new-run" onSubmit={createRun}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="new run name"
            aria-label="new run name"
          />
          <button className="primary" type="submit">
            Create run
          </button>
        </form>
      </header>

      {error && <p className="notice error">{error}</p>}

      <section className="panel">
        <header className="panel-head">
          <h2>All runs</h2>
          <span className="muted small">{runs.length} total</span>
        </header>

        <div className="table-scroll">
          <table className="data-table runs-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Created</th>
                <th>ID</th>
                <th aria-label="open" />
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link to={`/runs/${run.id}`} className="run-link">
                      {run.name}
                    </Link>
                  </td>
                  <td>
                    <span className={`status ${run.status}`}>
                      <i className="dot" />
                      {run.status}
                    </span>
                  </td>
                  <td
                    className="mono muted"
                    title={new Date(run.created_at).toLocaleString()}
                  >
                    {formatRelative(run.created_at)}
                  </td>
                  <td className="mono dim">{run.id.slice(0, 8)}</td>
                  <td className="cell-action">
                    <Link to={`/runs/${run.id}`} className="row-open">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {loading && <div className="empty-card">Loading…</div>}
          {!loading && runs.length === 0 && (
            <div className="empty-card">No runs yet. Create the first one above.</div>
          )}
        </div>
      </section>
    </Shell>
  );
}
