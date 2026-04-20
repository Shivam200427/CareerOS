# CareerOS / JobAgent

Milestone B baseline for the JobAgent platform.

## Milestone status

- Milestone A: complete
- Milestone B (Resume Vault): complete
- Milestone C: next

## What is included

- Monorepo with npm workspaces
- Frontend shell in `apps/web` (React + Vite)
- API service in `apps/api` (Express + JWT demo auth)
- Worker service in `apps/worker` (BullMQ + Redis)
- Resume Vault in `apps/api` with upload, parsing, versioning, and pinning
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

4. (Optional) adjust Resume Vault local storage paths:

```env
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

Resume upload supports `.pdf`, `.doc`, `.docx`, and `.txt` files up to 5 MB.
Parsed metadata is persisted locally in `data/resumes/store.json` for development.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run lint`

## Next milestone

Milestone C will add manual job URL intake, JD parsing, and queueing.
