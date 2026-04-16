# Testing Guide

This document describes how to run backend tests for Grid-Sync.

## Current Automated Coverage

Current backend tests are:

- Auth API tests in [backend/tests/test_auth.py](../backend/tests/test_auth.py)
- NASA lookback API tests in [backend/tests/test_nasa_lookback.py](../backend/tests/test_nasa_lookback.py)
- Forecast API tests in [backend/tests/test_forecast.py](../backend/tests/test_forecast.py)
- Forecast service tests in [backend/tests/test_forecasting_service.py](../backend/tests/test_forecasting_service.py)

The currently used focused backend regression command runs these suites.

## Prerequisites

- Python virtual environment exists at `backend/venv`.
- Dependencies are installed from `backend/requirements.txt`.

If dependencies are missing, install them:

```bash
cd backend
./venv/bin/pip install -r requirements.txt
```

Note: `python-multipart` is required for file-upload route tests (for example `/api/v1/forecast/demand`) and is already declared in `backend/requirements.txt`.

## Verbose Test Output

Tests now run with verbose output and live INFO logs by default via `pytest.ini`, including explicit per-test lifecycle messages (`START ...` / `END ...`).

Forecast tests now also emit structured `FLOW_TRACE ...` JSON blocks in pytest output to show:

- incoming request/form payloads and full upload content,
- full forecasted output payloads,
- full persistence payloads (for example demand-series upsert rows and forecast-prediction rows in service-level tests).

Look for explicit steps such as `user.uploaded_data`, `model.forecast_output`, and `db.save_forecast_payload` / `db.save_forecast_predictions`.

If you still want minimal output, add `-q` explicitly to any command.

## Run All Backend Tests

From the `backend` directory:

```bash
./venv/bin/python -m pytest
```

From the repository root:

```bash
backend/venv/bin/python -m pytest backend/tests
```

## Run Focused Regression Suite

From the repository root:

```bash
backend/venv/bin/python -m pytest backend/tests/test_auth.py backend/tests/test_nasa_lookback.py backend/tests/test_forecast.py
```

To include service-level demand upload DB-flow checks:

```bash
backend/venv/bin/python -m pytest backend/tests/test_auth.py backend/tests/test_nasa_lookback.py backend/tests/test_forecast.py backend/tests/test_forecasting_service.py
```

## Run a Single Test File

```bash
cd backend
./venv/bin/python -m pytest tests/test_auth.py
```

Examples for newer suites:

```bash
cd backend
./venv/bin/python -m pytest tests/test_nasa_lookback.py
./venv/bin/python -m pytest tests/test_forecast.py
./venv/bin/python -m pytest tests/test_forecasting_service.py
```

## Run a Single Test Case

```bash
cd backend
./venv/bin/python -m pytest tests/test_auth.py::test_signup_success
```

## What Is Tested

### Auth API (`tests/test_auth.py`)

- Sign up succeeds for a new user.
- Sign up returns conflict for duplicate email.
- Sign in succeeds with valid credentials.
- Sign in fails for invalid password.
- Sign in fails for unknown user.

### NASA Lookback API (`tests/test_nasa_lookback.py`)

- `/api/v1/nasa/ensure-lookback` success path for multiple datasets.
- Missing `DATABASE_URL` maps to HTTP 500.
- Service `ValueError` maps to HTTP 422.

### Forecast API (`tests/test_forecast.py`)

- `/api/v1/forecast/weather` success path with valid request payload.
- `/api/v1/forecast/demand` returns HTTP 500 when `DATABASE_URL` is missing.
- Forecast service domain error (`ForecastServiceError`) maps to HTTP 422 on demand route.

### Forecast Service (`tests/test_forecasting_service.py`)

- Demand upload is upserted into DB canonical series first.
- Demand lookback consumed by inference is reloaded from DB after upsert.

## Current Gaps (Not Yet Covered)

- No integration tests yet for PostgreSQL persistence paths (`WeatherExogenous`, `ForecastRun`, `ForecastPrediction`).
- No Celery/Redis worker integration tests yet.
- No end-to-end model-inference tests that load real transformer artifacts with torch.
- No frontend-to-backend forecasting flow tests yet.

## Notes About Virtual Environments

Some shells in this repo use `backend/venv` instead of `backend/.venv`.

If `source backend/.venv/bin/activate` fails, use:

```bash
source backend/venv/bin/activate
```

## Docker Workflow

If backend dependencies or tests change and you want runtime parity, rebuild services:

```bash
docker compose up --build -d
```

Testing itself is currently run through the Python virtual environment rather than inside a Docker test service.
