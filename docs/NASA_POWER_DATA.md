# NASA POWER Ingestion (Backend + PostgreSQL)

This project fetches NASA POWER weather data as forecasting inputs and stores it in PostgreSQL.

## Design Intent

- Data is fetched from NASA POWER for demand, price, solar, wind, and temperature datasets.
- Data is persisted in PostgreSQL table `WeatherExogenous`.
- The backend does **not** fetch NASA data in real time for every request.
- The backend fetches only when data coverage is insufficient for the configured lookback window (default 7 days at 5-minute resolution).

## API Endpoint

`POST /api/v1/nasa/ensure-lookback`

Request body fields:

- `forecast_start`: Forecast start timestamp (must be aligned to 5 minutes).
- `latitude`: Site latitude.
- `longitude`: Site longitude.
- `lookback_days`: Number of lookback days. Default is `7`.
- `datasets`: Any subset of `demand`, `price`, `solar`, `wind`, `temperature`.
- `community`: NASA POWER community (`RE`, `AG`, `SB`).
- `timezone`: NASA POWER time standard (`UTC`, `LST`).
- `timeout_seconds`: Request timeout for NASA API calls.

Example:

```bash
curl -X POST http://localhost:8001/api/v1/nasa/ensure-lookback \
  -H 'Content-Type: application/json' \
  -d '{
    "forecast_start": "2026-04-16T00:00:00Z",
    "latitude": 14.5995,
    "longitude": 120.9842,
    "lookback_days": 7,
    "datasets": ["demand", "price", "solar", "wind", "temperature"],
    "community": "RE",
    "timezone": "UTC"
  }'
```

## Persistence Model

Table: `WeatherExogenous`

Stored per row:

- `dataset`
- `timestamp`
- `latitude`
- `longitude`
- `community`
- `time_standard`
- `target_feature`
- `features` (JSON payload of requested variables)

Upsert key:

- `(dataset, timestamp, latitude, longitude)`

## Coverage Rule

For each dataset, coverage is checked for:

- `lookback_start = forecast_start - lookback_days`
- `lookback_end = forecast_start - 5 minutes`

Expected data points:

- `lookback_days * 24 * 12`

If missing points are detected, the backend fetches NASA hourly data for the required period, resamples to 5-minute resolution with time interpolation, and upserts the missing/overlapping rows.
