import { useMemo, useState } from "react";
import "./App.css";

type User = {
  id: string;
  email: string;
  name: string;
};

type AuthPayload = {
  token: string;
  user: User;
};

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function App() {
  const [auth, setAuth] = useState<AuthPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("Not connected");
  const [error, setError] = useState<string>("");

  const headers = useMemo(
    () => (auth ? { Authorization: `Bearer ${auth.token}` } : undefined),
    [auth],
  );

  async function signInDemo() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/auth/demo`, { method: "POST" });
      if (!response.ok) {
        throw new Error("Unable to authenticate with API");
      }
      const payload = (await response.json()) as AuthPayload;
      setAuth(payload);
      setStatus(`Authenticated as ${payload.user.email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  async function checkSession() {
    if (!headers) {
      setError("Sign in first to validate token.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, { headers });
      if (!response.ok) {
        throw new Error("Session is not valid");
      }
      setStatus("Session token validated against API");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="tag">CareerOS / Milestone A</p>
        <h1>JobAgent control room</h1>
        <p className="subtitle">
          Foundation is live: auth-ready API, queue worker skeleton, and frontend shell for the
          autonomous application workflow.
        </p>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h2>Authentication</h2>
          <p>Google OAuth endpoints are stubbed; demo auth is available for local development.</p>
          <div className="actions">
            <button onClick={signInDemo} disabled={busy}>
              {busy ? "Please wait..." : "Sign in with Demo User"}
            </button>
            <button onClick={checkSession} disabled={busy || !auth} className="secondary">
              Validate Session
            </button>
          </div>
          <p className="status">{status}</p>
          {error ? <p className="error">{error}</p> : null}
        </article>

        <article className="panel">
          <h2>Current baseline</h2>
          <ul>
            <li>Express API with auth endpoints and health checks</li>
            <li>BullMQ worker connected to Redis queue</li>
            <li>Monorepo workspace for web, api, worker, and shared</li>
            <li>Environment schema validation and secure defaults</li>
          </ul>
        </article>

        <article className="panel panel-wide">
          <h2>Next build targets</h2>
          <div className="columns">
            <div>
              <h3>Milestone B</h3>
              <p>Resume Vault with upload, parsing pipeline, and version history.</p>
            </div>
            <div>
              <h3>Milestone C</h3>
              <p>Manual job URL queue, JD parser, and scoring entry point.</p>
            </div>
            <div>
              <h3>Milestone D</h3>
              <p>Human-in-loop Playwright apply flow with approval gate.</p>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

export default App;
