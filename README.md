# CareerOS / JobAgent

Milestone A foundation for the JobAgent platform.

## What is included

- Monorepo with npm workspaces
- Frontend shell in `apps/web` (React + Vite)
- API service in `apps/api` (Express + JWT demo auth)
- Worker service in `apps/worker` (BullMQ + Redis)
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

4. Start all services:

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

## Scripts

- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run lint`

## Next milestone

Milestone B will add Resume Vault upload, parsing, and version tracking.
