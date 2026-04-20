import { useMemo, useState, type ChangeEvent } from "react";
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

type ResumeRecord = {
  id: string;
  version: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isPinned: boolean;
  uploadedAt: string;
  parsedData: {
    summary: string;
    skills: string[];
    keywords: string[];
    experienceYears: number | null;
  };
};

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function App() {
  const [auth, setAuth] = useState<AuthPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("Not connected");
  const [error, setError] = useState<string>("");
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);

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

  async function fetchResumes() {
    if (!headers) {
      setError("Sign in first to view resumes.");
      return;
    }

    setResumeBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/resumes`, { headers });
      if (!response.ok) {
        throw new Error("Unable to load resume versions");
      }

      const data = (await response.json()) as { resumes: ResumeRecord[] };
      setResumes(data.resumes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setResumeBusy(false);
    }
  }

  async function uploadResume(event: ChangeEvent<HTMLInputElement>) {
    if (!headers) {
      setError("Sign in first to upload resumes.");
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.set("resume", file);

    setResumeBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/resumes/upload`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Resume upload failed");
      }

      setStatus(`Uploaded ${file.name} successfully`);
      await fetchResumes();
      event.target.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setResumeBusy(false);
    }
  }

  async function pinResume(resumeId: string) {
    if (!headers) {
      setError("Sign in first to pin resumes.");
      return;
    }

    setResumeBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/resumes/${resumeId}/pin`, {
        method: "POST",
        headers,
      });

      if (!response.ok) {
        throw new Error("Unable to pin selected resume");
      }

      await fetchResumes();
      setStatus("Pinned resume version updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setResumeBusy(false);
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
            <li>Express API with auth and Resume Vault endpoints</li>
            <li>BullMQ worker connected to Redis queue</li>
            <li>Monorepo workspace for web, api, worker, and shared</li>
            <li>Environment schema validation and local persistence defaults</li>
          </ul>
        </article>

        <article className="panel panel-wide">
          <h2>Resume Vault</h2>
          <p>Upload a PDF/DOCX/TXT resume, track versions, and pin your active application resume.</p>
          <div className="actions">
            <label className="file-input">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={uploadResume}
                disabled={!auth || resumeBusy}
              />
              Upload Resume
            </label>
            <button onClick={fetchResumes} disabled={!auth || resumeBusy} className="secondary">
              {resumeBusy ? "Loading..." : "Refresh Versions"}
            </button>
          </div>
          <div className="resume-list">
            {resumes.length === 0 ? (
              <p>No resumes uploaded yet.</p>
            ) : (
              resumes.map((resume) => (
                <article key={resume.id} className="resume-item">
                  <div className="resume-row">
                    <div>
                      <strong>v{resume.version}</strong> - {resume.fileName}
                    </div>
                    <button
                      className="secondary"
                      disabled={resumeBusy || resume.isPinned}
                      onClick={() => pinResume(resume.id)}
                    >
                      {resume.isPinned ? "Pinned" : "Pin version"}
                    </button>
                  </div>
                  <p>
                    {new Date(resume.uploadedAt).toLocaleString()} - {(resume.sizeBytes / 1024).toFixed(1)}
                    KB
                  </p>
                  <p className="summary">{resume.parsedData.summary || "No text extracted yet."}</p>
                  <p>
                    Skills: {resume.parsedData.skills.length > 0 ? resume.parsedData.skills.join(", ") : "n/a"}
                  </p>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="panel panel-wide">
          <h2>Next build targets</h2>
          <div className="columns">
            <div>
              <h3>Milestone B</h3>
              <p>Completed: upload, parsing pipeline, pinning, and version history.</p>
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
