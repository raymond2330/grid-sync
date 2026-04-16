# Grid-Sync

## Tech Stack

- Frontend → Next.js
- Backend → FastAPI
- Data/ML → Python (Pandas, sklearn, etc.)
- Database → PostgreSQL
- Background jobs → Celery + Redis

## Setup Guides

- Environment preparation: [docs/ENVIRONMENT_PREPARATION.md](docs/ENVIRONMENT_PREPARATION.md)
- Team access and onboarding: [docs/SETUP_AND_ACCESS.md](docs/SETUP_AND_ACCESS.md)
- Testing guide: [docs/TESTING.md](docs/TESTING.md)
- NASA POWER data fetch/resampling guide: [docs/NASA_POWER_DATA.md](docs/NASA_POWER_DATA.md)
- Forecasting runtime guide: [docs/FORECASTING.md](docs/FORECASTING.md)
- Architecture and progress tracker: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Quick Start

1. Prepare Docker and Docker Compose using [docs/ENVIRONMENT_PREPARATION.md](docs/ENVIRONMENT_PREPARATION.md).
2. Start the full stack with `docker compose up --build`.
3. Share app/API endpoints with teammates using [docs/SETUP_AND_ACCESS.md](docs/SETUP_AND_ACCESS.md).

## Core Endpoints (Recommended Defaults)

- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:8001>
- FastAPI docs: <http://localhost:8001/docs>
- PostgreSQL: localhost:5433
- Redis: localhost:6379

## Docker Commands

Start all services:

```bash
docker compose up --build
```

Run in background:

```bash
docker compose up --build -d
```

Stop all services:

```bash
docker compose down
```

Stop and remove volumes:

```bash
docker compose down -v
```
