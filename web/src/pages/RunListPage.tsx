import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UnauthorizedError, api } from '../api';

type Run = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

type Project = { id: string; name: string };

export default function RunListPage() {
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [me, list] = await Promise.all([
        api<{ project: Project }>('/api/auth/me'),
        api<{ runs: Run[] }>('/api/runs'),
      ]);
      setProject(me.project);
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

  async function logout() {
    await api('/api/auth/session', { method: 'DELETE' });
    navigate('/login');
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <h1>Runs</h1>
          {project && <p className="muted">{project.name}</p>}
        </div>
        <button className="ghost" onClick={logout}>
          Sign out
        </button>
      </header>

      <form className="card row" onSubmit={createRun}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="new run name"
          aria-label="new run name"
        />
        <button type="submit">Create run</button>
      </form>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && runs.length === 0 && <p className="empty">No runs yet. Create the first one.</p>}

      <ul className="run-list">
        {runs.map((run) => (
          <li key={run.id}>
            <Link to={`/runs/${run.id}`} className="run-row">
              <span className="run-name">{run.name}</span>
              <span className="run-meta">
                <span className={`pill ${run.status}`}>{run.status}</span>
                <time dateTime={run.created_at}>{new Date(run.created_at).toLocaleString()}</time>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
