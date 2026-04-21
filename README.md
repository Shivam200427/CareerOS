# CareerOS / JobAgent

Milestone D baseline for the JobAgent platform.

## Milestone status

- Milestone A: complete
- Milestone B (Resume Vault): complete
- Milestone C (Manual Job Intake + Queue): complete
- Milestone D (Human Approval Gate + Apply Execution): in progress

## What is included

- Monorepo with npm workspaces
- Frontend shell in `apps/web` (React + Vite)
- API service in `apps/api` (Express + JWT demo auth)
- Worker service in `apps/worker` (BullMQ + Redis)
- Resume Vault in `apps/api` with upload, parsing, versioning, and pinning
- Manual Job Intake in `apps/api` with URL parsing, queueing, and status tracking
- Shared package scaffold in `packages/shared`
- Environment template in `.env.example`

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Copy environment file:

```bash
copy .env.example .env
```

3. Update `JWT_SECRET` in `.env` to a secure value.

4. (Optional) adjust local storage and queue settings:

```env
JOB_QUEUE_NAME=job-apply-queue
JOB_DB_FILE=data/jobs/store.json
RESUME_STORAGE_DIR=data/resumes/files
RESUME_DB_FILE=data/resumes/store.json
```

5. Start all services:

```bash
npm run dev
```

- Web app: http://localhost:5173
- API health: http://localhost:4000/health

## API endpoints in Milestone A

- `GET /health`
- `POST /api/auth/demo`
- `GET /api/auth/me`
- `GET /api/auth/google` (placeholder)
- `GET /api/auth/google/callback` (placeholder)

## API endpoints in Milestone B

- `GET /api/resumes` (auth required)
- `POST /api/resumes/upload` (auth required, multipart field `resume`)
- `POST /api/resumes/:resumeId/pin` (auth required)

## API endpoints in Milestone C

- `GET /api/jobs` (auth required)
- `POST /api/jobs/manual` (auth required, JSON body: `{ "url": "..." }`)
- `GET /api/jobs/discover` (auth required, placeholder)

## API endpoints in Milestone D

- `POST /api/jobs/:jobId/approve` (auth required)
- `POST /api/jobs/:jobId/execute` (auth required)
- `POST /api/jobs/:jobId/skip` (auth required)

Resume upload supports `.pdf`, `.doc`, `.docx`, and `.txt` files up to 5 MB.
Parsed metadata is persisted locally in `data/resumes/store.json` for development.
Manual job intake stores parsed entries and processing status in `data/jobs/store.json`.
Approval-gate statuses now include `awaiting_approval`, `approved`, `skipped`, and `completed`.
When a job is approved, the worker runs a submit-stage agent:

- Simulated mode by default (writes JSON artifact)
- Playwright mode when enabled (captures page title, discovered fields, fill attempts, and screenshot)

Current submit behavior is intentionally safe:

- Approval and execution are two separate actions
- The agent discovers and fills common text/select fields
- Final submit click is still blocked in this phase
- Execution steps are persisted and shown in the dashboard for auditability

## Scripts

- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run lint`

## Next milestone

Milestone D next step is controlled form submission behind an explicit final-confirm action.

## Playwright notes

Set these variables in `.env`:

```env
PLAYWRIGHT_ENABLED=true
AGENT_ARTIFACTS_DIR=data/agent-runs
```

Install browsers if needed:

```bash
npx playwright install chromium
```
