import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { UnauthorizedError, api } from '../api';

type Project = { id: string; name: string };

function RunsIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 3H4v14h4" />
      <path d="M12 6l4 4-4 4" />
      <path d="M16 10H8" />
    </svg>
  );
}

export function Shell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    let cancelled = false;

    api<{ project: Project }>('/api/auth/me')
      .then((body) => {
        if (!cancelled) setProject(body.project);
      })
      .catch((error: unknown) => {
        if (!cancelled && error instanceof UnauthorizedError) navigate('/login');
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function signOut() {
    await api('/api/auth/session', { method: 'DELETE' }).catch(() => undefined);
    navigate('/login');
  }

  return (
    <div className="app">
      <aside className="rail">
        <div className="rail-logo" aria-hidden="true">
          S
        </div>
        <NavLink
          to="/"
          end
          className={({ isActive }) => `rail-link${isActive ? ' active' : ''}`}
          aria-label="Runs"
          title="Runs"
        >
          <RunsIcon />
        </NavLink>
        <button className="rail-link rail-bottom" onClick={signOut} aria-label="Sign out" title="Sign out">
          <LogoutIcon />
        </button>
      </aside>

      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">soup</span>
          <span className="brand-sub">experiment tracker</span>
        </div>

        <div className="project">
          <span className="eyebrow">Project</span>
          <span className="project-name">{project?.name ?? '—'}</span>
        </div>

        <nav className="side-nav">
          <NavLink to="/" end className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
            <span className="side-dot" />
            Runs
          </NavLink>
        </nav>

        {aside && <div className="side-extra">{aside}</div>}

        <div className="side-footer">
          <button className="ghost-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="content">{children}</div>
    </div>
  );
}
