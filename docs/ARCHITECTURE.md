# Grid-Sync Website Architecture

This document is the single reference for:

- how the website is structured across services,
- how data moves through the system,
- and how implementation progress is tracked over time.

## 1) High-Level Service Architecture

```text
                     +---------------------------+
                     |         Browser           |
                     |      (User requests)      |
                     +-------------+-------------+
                                   |
                                   v
                     +---------------------------+
                     |  Frontend (Next.js, 3000) |
                     |  UI + API client layer    |
                     +-------------+-------------+
                                   |
                                   | NEXT_PUBLIC_API_BASE_URL
                                   v
                     +---------------------------+
                     |  Backend (FastAPI, 8001)  |
                     |  Auth + API endpoints      |
                     +------+------+--------------+
                            |      |
                 sync reads/writes  | enqueue async jobs
                            |      v
                            |  +------------------------+
                            |  | Redis (6379)           |
                            |  | Celery broker/backend  |
                            |  +-----------+------------+
                            |              |
                            v              v
                     +----------------+  +----------------+
                     | PostgreSQL     |  | Celery Worker  |
                     | persistent DB  |  | job execution  |
                     +----------------+  +-------+--------+
                                                ^
                                                |
                                         +------+------+
                                         | Celery Beat |
                                         | scheduler   |
                                         +-------------+
```

## 2) Request and Processing Flow

```text
[1] User opens app in browser
     -> Frontend renders page

[2] Frontend sends API request
     -> Backend validates request

[3a] Sync path (immediate response)
     Backend <-> PostgreSQL
     Backend -> Frontend -> Browser

[3b] Async path (background processing)
     Backend -> Redis queue -> Celery Worker
     Celery Worker <-> PostgreSQL
     Celery Beat -> Redis queue (periodic jobs)
```

## 3) Responsibility Map

| Layer | Main Responsibility | Key Files |
|---|---|---|
| Frontend | UI, user interaction, API calls | `frontend/src/app/page.tsx`, `frontend/src/app/layout.tsx` |
| Backend API | Request validation, auth, health checks | `backend/main.py` |
| Async Worker | Long-running/background tasks | `backend/app/tasks.py`, `backend/app/celery_app.py` |
| Data | Persistent relational storage | PostgreSQL service in `docker-compose.yml` |
| Queue/Broker | Job transport + result backend | Redis service in `docker-compose.yml` |

## 4) Delivery Tracker (Current System and Next Work)

Update this section during each sprint review.

### 4.1 Current System (Implemented)

- [x] Docker Compose stack is running with `frontend`, `backend`, `worker`, `beat`, `postgres`, and `redis`.
- [x] Backend has health and dependency checks at `GET /health` (PostgreSQL + Redis readiness).
- [x] Authentication endpoints are implemented: `POST /auth/signup` and `POST /auth/signin`.
- [x] Auth logic includes email validation/normalization, bcrypt password hashing, and JWT issuance.
- [x] User persistence exists with automatic `User` table creation and email uniqueness handling.
- [x] Celery app is configured and worker task discovery is active.
- [x] Baseline Celery task exists (`grid_sync.ping`).
- [x] Backend auth test suite exists for signup/signin success and failure paths.
- [x] Backend NASA lookback endpoint is implemented at `POST /api/v1/nasa/ensure-lookback`.
- [x] NASA lookback ingestion persists data in PostgreSQL table `WeatherExogenous` with upsert behavior.
- [x] NASA fetch is conditional and runs only when lookback coverage is missing (default 7 days at 5-minute resolution).
- [x] Frontend app boots successfully (currently scaffold/default UI).
- [x] Baseline transformer forecasting endpoints are implemented at `POST /api/v1/forecast/demand` and `POST /api/v1/forecast/weather`.
- [ ] Unit commitment logic, cost function, and optimization algorithm are not yet implemented in runtime code.

### 4.2 Next Work (Detailed Implementation Backlog)

#### A) Frontend and Auth UX

- [ ] Build sign up page and sign in page connected to backend auth endpoints.
- [ ] Add token handling strategy (store, attach auth header, logout behavior).
- [ ] Add authenticated dashboard shell and route protection.

#### B) Forecasting Data Contracts (Must Implement)

##### Electricity Demand Forecasting

- [x] Accept user CSV upload containing exactly the past 7 days of electricity demand data.
- [x] Validate time resolution is 5 minutes and enforce the required lookback window (7 x 24 x 12 = 2,016 expected points).
- [x] Preprocess demand series for inference (MinMax feature/target scaling aligned with transformer runtime input contract).
- [x] Pull NASA POWER-derived weather features from the canonical `WeatherExogenous` table for the same timeline.
- [x] Align demand target and NASA exogenous features into one inference dataset.

##### Electricity Price Forecasting

- [ ] Scrape IEMOP/WESM price data with 7-day lookback at 5-minute resolution.
- [ ] Treat scraped electricity price as the target series.
- [ ] Preprocess price series (algorithm/logic to be provided later).
- [ ] Pull NASA POWER data and use it as exogenous variables.
- [ ] Align target and exogenous features by timestamp before forecasting.

##### Wind Speed Forecasting

- [x] Source data from NASA POWER-ingested records in `WeatherExogenous`.
- [x] Consume NASA data already transformed to 5-minute resolution by the ingestion pipeline.
- [x] Preprocess transformed series for inference with MinMax scaling.
- [x] Use `WS50M` as the forecasting target variable.

##### Solar Irradiance Forecasting

- [x] Source data from NASA POWER-ingested records in `WeatherExogenous`.
- [x] Consume NASA data already transformed to 5-minute resolution by the ingestion pipeline.
- [x] Preprocess transformed series for inference with MinMax scaling.
- [x] Use `ALLSKY_SFC_SW_DWN` as the forecasting target variable.

##### Temperature Forecasting

- [x] Source data from NASA POWER-ingested records in `WeatherExogenous`.
- [x] Consume NASA data already transformed to 5-minute resolution by the ingestion pipeline.
- [x] Preprocess transformed series for inference with MinMax scaling.
- [x] Use `T2M` as the forecasting target variable.

#### C) Data Ingestion, Persistence, and Overlap Rules

- [ ] Save raw data (before forecasting) in PostgreSQL.
- [x] Save forecasted data in PostgreSQL (`ForecastRun`, `ForecastPrediction`).
- [ ] Save unit commitment inputs/outputs in PostgreSQL.
- [ ] Handle overlapping historical windows with a latest-wins canonical record policy (upsert by series key + timestamp).
- [ ] Keep ingestion history/audit records so each run is still traceable even when canonical rows are overwritten.

#### D) Forecast Readiness Checks (Before Running Any Forecast)

- [x] When user selects a forecast day, check if raw data coverage exists for required lookback window.
- [x] Require at least 7 days of history at 5-minute resolution before allowing forecast execution (minimum 2,016 points per required target series).
- [x] If data is insufficient, block run and return clear instruction to upload/fetch missing range first.
- [x] If data is sufficient, continue directly to preprocessing and forecast generation.

#### E) Unit Commitment and Optimization

- [ ] Implement unit commitment run creation with toggles and configuration.
- [ ] Add placeholders/interfaces for logic, algorithm, and cost function (to be provided later).
- [ ] Persist run configuration in `UnitCommitmentRun`.
- [ ] Generate and persist dispatch outputs in `UnitCommitmentDispatch`.
- [ ] Compute and persist interval totals and run statistics (`UnitCommitmentIntervalSummary`, `UnitCommitmentRunStats`).

#### F) Async Orchestration and Reliability

- [ ] Add Celery tasks for ingestion, forecasting, and unit commitment jobs.
- [ ] Add job status/result endpoints so frontend can poll progress.
- [ ] Add retry policy, timeout handling, and idempotency safeguards.

#### G) Testing and Observability

- [x] Expand backend tests beyond auth (NASA lookback and forecasting route coverage).
- [ ] Add integration tests for PostgreSQL, Redis, and Celery-backed workflows.
- [ ] Add structured logging and request/job correlation IDs.
- [ ] Add dashboards/alerts for worker failures and queue backlog.

Current top blocker: _finalize production-grade target data sourcing for price forecasting and settle canonical preprocessing for cross-model benchmarking_.

