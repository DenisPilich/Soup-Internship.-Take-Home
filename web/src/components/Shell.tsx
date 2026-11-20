import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { UnauthorizedError, api } from '../api';
import { formatRelative } from '../format';

type Project = { id: string; name: string };

type Run = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="status-item status-time">
      {now.toLocaleTimeString([], { hour12: false })}
    </span>
  );
}

export function Shell({
  children,
  activeRunId,
  status,
}: {
  children: ReactNode;
  activeRunId?: string;
  status?: ReactNode;
}) {
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([api<{ project: Project }>('/api/auth/me'), api<{ runs: Run[] }>('/api/runs')])
      .then(([me, list]) => {
        if (cancelled) return;
        setProject(me.project);
        setRuns(list.runs);
      })
      .catch((error: unknown) => {
        if (!cancelled && error instanceof UnauthorizedError) navigate('/login');
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return runs;
    return runs.filter((run) => run.name.toLowerCase().includes(needle));
  }, [runs, query]);

  async function signOut() {
    await api('/api/auth/session', { method: 'DELETE' }).catch(() => undefined);
    navigate('/login');
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-name">soup</span>
          <span className="brand-slash">//</span>
          <span className="brand-sub">tracker</span>
        </Link>

        <nav className="topnav">
          <NavLink to="/" end className={({ isActive }) => `topnav-link${isActive ? ' active' : ''}`}>
            [ runs ]
          </NavLink>
        </nav>

        <div className="topbar-right">
          {project && <span className="topbar-project">[{project.name}]</span>}
          <button className="topbar-button" onClick={signOut}>
            [ sign out ]
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-head">
            <span className="side-title"># runs</span>
            <span className="side-count">{runs.length}</span>
          </div>

          <input
            className="side-search"
            placeholder="filter..."
            aria-label="Search runs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <ul className="side-runs">
            {filtered.map((run) => (
              <li key={run.id}>
                <Link
                  to={`/runs/${run.id}`}
                  className={`side-run${activeRunId === run.id ? ' active' : ''}`}
                >
                  <span className="side-prompt">&gt;</span>
                  <i className={`dot ${run.status}`} />
                  <span className="side-run-name">{run.name}</span>
                  <span className="side-run-time">{formatRelative(run.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>

          {ready && runs.length === 0 && <p className="side-empty">no runs yet</p>}
        </aside>

        <div className="content">{children}</div>
      </div>

      <footer className="statusbar">
        <span className="status-item">
          <i className="dot live" /> {project?.name ?? '...'}
        </span>
        <span className="status-item">runs:{runs.length}</span>
        {status}
        <span className="status-spacer" />
        <Clock />
      </footer>
    </div>
  );
}
