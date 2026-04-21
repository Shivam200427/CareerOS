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

type JobRecord = {
  id: string;
  url: string;
  status:
    | "queued"
    | "processing"
    | "awaiting_approval"
    | "approved"
    | "completed"
    | "skipped"
    | "failed";
  title: string;
  company: string;
  summary: string;
  parsedSkills: string[];
  matchScore: number;
  retries: number;
  lastError?: string;
  agentResult?: {
    mode: "playwright" | "simulated";
    title?: string;
    screenshotPath?: string;
    discoveredFields?: Array<{
      selector: string;
      label: string;
      type: string;
      placeholder?: string;
    }>;
    filledCount?: number;
    steps?: Array<{
      action: string;
      target?: string;
      value?: string;
      outcome: "ok" | "skipped" | "failed";
      note?: string;
    }>;
  };
  updatedAt: string;
};

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function App() {
  const [auth, setAuth] = useState<AuthPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("Not connected");
  const [error, setError] = useState<string>("");
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [jobsBusy, setJobsBusy] = useState(false);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [manualJobUrl, setManualJobUrl] = useState("");

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

  async function fetchJobs() {
    if (!headers) {
      setError("Sign in first to view job queue.");
      return;
    }

    setJobsBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/jobs`, { headers });
      if (!response.ok) {
        throw new Error("Unable to load jobs");
      }

      const data = (await response.json()) as { jobs: JobRecord[] };
      setJobs(data.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setJobsBusy(false);
    }
  }

  async function submitManualJob() {
    if (!headers) {
      setError("Sign in first to submit job URLs.");
      return;
    }

    if (!manualJobUrl.trim()) {
      setError("Enter a valid job URL first.");
      return;
    }

    setJobsBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/jobs/manual`, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: manualJobUrl.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to enqueue manual job URL");
      }

      const result = (await response.json()) as { queued?: boolean; message?: string };
      setStatus(
        result.queued
          ? "Manual job added to queue"
          : result.message ?? "Job already exists in queue/history",
      );

      setManualJobUrl("");
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setJobsBusy(false);
    }
  }

  async function approveJob(jobId: string) {
    if (!headers) {
      setError("Sign in first to approve queued jobs.");
      return;
    }

    setJobsBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/jobs/${jobId}/approve`, {
        method: "POST",
        headers,
      });

      if (!response.ok) {
        throw new Error("Unable to approve this job");
      }

      setStatus("Job approved and queued for submission stage");
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setJobsBusy(false);
    }
  }

  async function skipJob(jobId: string) {
    if (!headers) {
      setError("Sign in first to skip queued jobs.");
      return;
    }

    setJobsBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/jobs/${jobId}/skip`, {
        method: "POST",
        headers,
      });

      if (!response.ok) {
        throw new Error("Unable to skip this job");
      }

      setStatus("Job skipped from approval queue");
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setJobsBusy(false);
    }
  }

  async function executeJob(jobId: string) {
    if (!headers) {
      setError("Sign in first to execute approved jobs.");
      return;
    }

    setJobsBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/jobs/${jobId}/execute`, {
        method: "POST",
        headers,
      });

      if (!response.ok) {
        throw new Error("Unable to start submit stage");
      }

      setStatus("Submit stage started for approved job");
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setJobsBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="tag">CareerOS / Milestone D</p>
        <h1>JobAgent control room</h1>
        <p className="subtitle">
          Auth, Resume Vault, and manual URL queueing are live for the autonomous application
          workflow.
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
            <li>Express API with auth, Resume Vault, and manual job intake</li>
            <li>BullMQ worker consumes queue and updates job status</li>
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
          <h2>Manual Job Intake</h2>
          <p>
            Submit a job link to parse title, summary, and skills; each job is scored against your
            pinned resume and queued for processing.
          </p>
          <div className="actions">
            <input
              className="url-input"
              type="url"
              placeholder="https://company.com/careers/software-engineer"
              value={manualJobUrl}
              onChange={(event) => setManualJobUrl(event.target.value)}
              disabled={!auth || jobsBusy}
            />
            <button onClick={submitManualJob} disabled={!auth || jobsBusy || !manualJobUrl.trim()}>
              {jobsBusy ? "Submitting..." : "Add Manual URL"}
            </button>
            <button onClick={fetchJobs} className="secondary" disabled={!auth || jobsBusy}>
              Refresh Queue
            </button>
          </div>
          <div className="job-list">
            {jobs.length === 0 ? (
              <p>No queued jobs yet.</p>
            ) : (
              jobs.map((job) => (
                <article className="job-item" key={job.id}>
                  <div className="resume-row">
                    <strong>{job.title}</strong>
                    <span className={`badge badge-${job.status}`}>{job.status}</span>
                  </div>
                  <p>
                    {job.company} - Match score: {job.matchScore}
                  </p>
                  <p className="summary">{job.summary || "No summary available."}</p>
                  <p>Skills: {job.parsedSkills.length > 0 ? job.parsedSkills.join(", ") : "n/a"}</p>
                  <p>
                    Updated: {new Date(job.updatedAt).toLocaleString()} | Retries: {job.retries}
                  </p>
                  {job.agentResult ? (
                    <p>
                      Agent mode: {job.agentResult.mode}
                      {job.agentResult.title ? ` | Page: ${job.agentResult.title}` : ""}
                      {typeof job.agentResult.filledCount === "number"
                        ? ` | Fields filled: ${job.agentResult.filledCount}`
                        : ""}
                    </p>
                  ) : null}
                  {job.status === "awaiting_approval" ? (
                    <div className="actions">
                      <button disabled={jobsBusy} onClick={() => approveJob(job.id)}>
                        Approve Submit
                      </button>
                      <button className="secondary" disabled={jobsBusy} onClick={() => skipJob(job.id)}>
                        Skip
                      </button>
                    </div>
                  ) : null}
                  {job.status === "approved" ? (
                    <div className="actions">
                      <button disabled={jobsBusy} onClick={() => executeJob(job.id)}>
                        Execute Submit Stage
                      </button>
                    </div>
                  ) : null}
                  {job.lastError ? <p className="error">Last error: {job.lastError}</p> : null}
                  {job.agentResult?.screenshotPath ? (
                    <p>Artifact: {job.agentResult.screenshotPath}</p>
                  ) : null}
                  {job.agentResult?.discoveredFields?.length ? (
                    <p>
                      Fields: {job.agentResult.discoveredFields.slice(0, 4).map((field) => field.label).join(", ")}
                      {job.agentResult.discoveredFields.length > 4 ? " ..." : ""}
                    </p>
                  ) : null}
                  {job.agentResult?.steps?.length ? (
                    <ul className="step-list">
                      {job.agentResult.steps.slice(0, 5).map((step, index) => (
                        <li key={`${job.id}-step-${index}`}>
                          <strong>{step.action}</strong> [{step.outcome}]
                          {step.note ? ` - ${step.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <a href={job.url} target="_blank" rel="noreferrer" className="job-link">
                    Open listing
                  </a>
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
              <p>Completed: manual URL queue, JD parsing, status tracking, match scoring.</p>
            </div>
            <div>
              <h3>Milestone D</h3>
              <p>In progress: human approval gate before submit is live in queue workflow.</p>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

export default App;
