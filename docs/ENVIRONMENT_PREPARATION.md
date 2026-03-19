# Environment Preparation Guide

This guide prepares a Docker-based local environment for the full Grid-Sync stack:

- Frontend: Next.js
- Backend: FastAPI
- Data/ML: Python (Pandas, scikit-learn, etc.)
- Database: PostgreSQL
- Background jobs: Celery + Redis

## 1) Prerequisites

Install these tools first:

- Git 2.40+
- Docker Engine 24+
- Docker Compose plugin 2.20+

Check installed versions:

```bash
git --version
docker --version
docker compose version
```

## 2) Clone and Prepare Project Structure

```bash
git clone <your-repo-url> grid-sync
cd grid-sync
mkdir -p backend frontend
```

If the repository already contains these directories, skip the mkdir step.

## 3) Environment Files

From project root, copy templates once:

```bash
cp .env.example .env 2>/dev/null || true
cp backend/.env.example backend/.env 2>/dev/null || true
cp frontend/.env.local.example frontend/.env.local 2>/dev/null || true
```

Root `.env` controls PostgreSQL container defaults:

```dotenv
POSTGRES_USER=grid_sync
POSTGRES_PASSWORD=grid_sync
POSTGRES_DB=grid_sync
```

Backend `backend/.env` should use docker service hosts:

```dotenv
APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8000

DATABASE_URL=postgresql://grid_sync:grid_sync@postgres:5432/grid_sync
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1
```

Frontend `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
NEXT_TELEMETRY_DISABLED=1
```

Root `.env` also controls host port mappings:

```dotenv
POSTGRES_HOST_PORT=5432
REDIS_HOST_PORT=6379
BACKEND_HOST_PORT=8001
FRONTEND_HOST_PORT=3000
```

## 4) Start the Full Stack

Build and run all services:

```bash
docker compose up --build
```

Run in background mode:

```bash
docker compose up --build -d
```

Services started:

- `postgres` (PostgreSQL)
- `redis` (Redis)
- `backend` (FastAPI)
- `worker` (Celery worker)
- `beat` (Celery beat)
- `frontend` (Next.js)

## 5) Verify Services

```bash
docker compose ps
curl -i http://localhost:8001/health
curl -i http://localhost:3000
```

Expected:

- Backend health endpoint returns status 200.
- Frontend returns status 200.

## 6) Useful Docker Operations

View logs for all services:

```bash
docker compose logs -f
```

View one service log:

```bash
docker compose logs -f backend
docker compose logs -f worker
```

Restart one service:

```bash
docker compose restart backend
```

Stop all services:

```bash
docker compose down
```

Stop and remove volumes (full reset):

```bash
docker compose down -v
```

## 7) Port Plan

Default local ports:

- Frontend: 3000
- Backend: 8001
- PostgreSQL: 5433
- Redis: 6379

## 8) Common Issues

- Docker permission errors:

  Run with sudo or add your user to the docker group.
- Frontend or backend not rebuilding:

  Use `docker compose up --build`.
- Postgres auth issues:

  Ensure `.env` and `backend/.env` credentials match.
- Celery cannot connect to Redis:

  Verify Redis container is healthy with `docker compose ps`.

## 9) Optional Local (Non-Docker) Mode

If you later need host-native development, keep this guide as the Docker baseline and document local-only steps separately.
