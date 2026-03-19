# Setup and Access Guide

Use this guide after Docker has been prepared.

Related preparation guide: [ENVIRONMENT_PREPARATION.md](ENVIRONMENT_PREPARATION.md)

## 1) One-Time Onboarding for Teammates

1. Clone repository:

```bash
git clone <your-repo-url> grid-sync
cd grid-sync
```

1. Copy environment files:

```bash
cp .env.example .env 2>/dev/null || true
cp backend/.env.example backend/.env 2>/dev/null || true
cp frontend/.env.local.example frontend/.env.local 2>/dev/null || true
```

1. Build and start full stack:

```bash
docker compose up --build -d
```

1. Verify status:

```bash
docker compose ps
```

## 2) Start All Services

Run all services in one command:

```bash
docker compose up --build
```

Run in detached mode:

```bash
docker compose up --build -d
```

Services included:

- `frontend` (Next.js)
- `backend` (FastAPI)
- `worker` (Celery worker)
- `beat` (Celery beat)
- `postgres` (PostgreSQL)
- `redis` (Redis)

## 3) Access Points for Team Members

Use these default URLs:

- Frontend app: <http://localhost:3000>
- Backend API root: <http://localhost:8001>
- OpenAPI docs (Swagger UI): <http://localhost:8001/docs>
- ReDoc docs: <http://localhost:8001/redoc>

## 4) API Access Pattern for Frontend

In `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
```

Inside Docker network, backend resolves `postgres` and `redis` by service name.

## 5) Database and Queue Access

- PostgreSQL DSN (container-to-container):
  `postgresql://grid_sync:grid_sync@postgres:5432/grid_sync`
- PostgreSQL from host machine:
  `postgresql://grid_sync:grid_sync@localhost:5433/grid_sync`
- Redis (container-to-container):
  `redis://redis:6379/0`
- Redis from host machine:
  `redis://localhost:6379/0`

## 6) Health and Readiness Checks

Quick checks teammates can run:

```bash
docker compose ps
curl -i http://localhost:8001/health
curl -i http://localhost:8001/docs
curl -i http://localhost:3000
```

## 7) Daily Team Workflow

1. Pull latest changes:

```bash
git pull
```

1. Rebuild and restart services after dependency changes:

```bash
docker compose up --build -d
```

1. Tail logs when investigating problems:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f worker
```

## 8) Sharing with Non-Local Users

For remote access in a shared network/dev server:

- Expose ports 3000 and 8000 only if needed.
- Keep PostgreSQL/Redis private whenever possible.
- Update `frontend/.env.local` with the reachable backend URL.
- Add reverse proxy/TLS if this will be internet-facing.

## 9) Troubleshooting

- Containers exit immediately:

  Use `docker compose logs <service>` to inspect the crash reason.
- Frontend loads but API calls fail:

  Check `NEXT_PUBLIC_API_BASE_URL` and backend CORS.
- Backend fails DB connection:

  Confirm `DATABASE_URL` in `backend/.env` uses host `postgres`.
- Celery cannot connect:

  Confirm `CELERY_BROKER_URL=redis://redis:6379/0`.
- Need clean reset:

  Run `docker compose down -v` and then `docker compose up --build`.
