import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!key.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ api_key: key.trim() }),
      });
      navigate('/');
    } catch {
      setError('That key was not accepted.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="login-card">
        <div className="login-brand">
          <span className="login-logo">
            soup<span>.</span>
          </span>
          <span className="login-sub">experiment tracker</span>
        </div>

        <h1>Sign in</h1>
        <p className="login-hint">
          Use a project API key. It is exchanged for an HttpOnly session cookie and never stored
          in the browser.
        </p>

        <form onSubmit={submit} className="login-form">
          <label htmlFor="api-key">API key</label>
          <input
            id="api-key"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="soup_xxxxxxxx_..."
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {error && <p className="notice error">{error}</p>}
        </form>

        <details className="demo-keys">
          <summary>Demo keys (development only)</summary>
          <p>
            <strong>Project A</strong>
            <code>soup_demoa001_1f8c2b6e4a9d4f7c8b3e5a1d6f9c2b7e4a8d1f3c</code>
          </p>
          <p>
            <strong>Project B</strong>
            <code>soup_demob002_7c4e1a9f3b6d2e8a5c1f7b4d9e2a6c3f8b5d1e7a</code>
          </p>
        </details>
      </section>

      <p className="login-foot">Postgres as the source of truth · SSE tail · per-project isolation</p>
    </main>
  );
}
