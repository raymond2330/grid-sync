# Forecasting Runtime Guide

This document describes the currently integrated runtime forecasting path in the backend.

## Scope

- Model family enabled in runtime: `transformer`
- Datasets integrated: `demand`, `price`, `solar`, `wind`, `temperature`
- Forecast horizon: 1 day at 5-minute resolution (`288` points)
- Lookback window: 7 days at 5-minute resolution (`2016` points)

Model artifacts are now kept under backend-owned paths:

- `backend/app/model_artifacts/demand/transformer/`
- `backend/app/model_artifacts/price/transformer/`
- `backend/app/model_artifacts/solar/transformer/`
- `backend/app/model_artifacts/wind/transformer/`
- `backend/app/model_artifacts/temperature/transformer/`

## Endpoints

### 1) Demand Forecast (CSV upload)

`POST /api/v1/forecast/demand`

Form fields:

- `forecast_start`: ISO timestamp aligned to 5 minutes
- `latitude`: site latitude
- `longitude`: site longitude
- `model_family`: currently `transformer`
- `demand_csv`: CSV file with columns `DATETIME`, `TOTAL`

Rules:

- CSV must contain complete 7-day 5-minute history ending at `forecast_start - 5 minutes`.
- Uploaded demand history is upserted into canonical table `DemandSeries` (latest upload wins on the same timestamp/site).
- Demand target lookback used by the model is read back from `DemandSeries` after upsert.
- Weather exogenous features are read from `WeatherExogenous` for the same site/time range.

### 2) Weather/Price Forecast

`POST /api/v1/forecast/weather`

JSON body:

```json
{
  "dataset": "wind",
  "forecast_start": "2026-04-16T00:00:00Z",
  "latitude": 14.5995,
  "longitude": 120.9842,
  "model_family": "transformer"
}
```

`dataset` must be one of: `price`, `solar`, `wind`, `temperature`.

## Persistence

Forecast outputs are saved in PostgreSQL:

- `DemandSeries` (raw demand target lookback from user uploads)
- `ForecastRun`
- `ForecastPrediction`

Each request persists a run record and 288 timestamped forecast values.

## Notes

- Price forecasting still depends on having target history (`RTD_LMP_SMP`) available in canonical storage for the lookback window.
- The code is structured so additional model families (for example hybrid quantum-classical models) can be added by extending the model registry and loader.
