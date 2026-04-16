"""HTTP routes for transformer-based forecasting endpoints."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

try:
    from app.services.forecasting import (
        ForecastServiceError,
        forecast_demand_with_upload,
        forecast_weather_dataset,
    )
except ModuleNotFoundError:
    from backend.app.services.forecasting import (
        ForecastServiceError,
        forecast_demand_with_upload,
        forecast_weather_dataset,
    )

DatasetName = Literal["demand", "price", "solar", "wind", "temperature"]
WeatherDatasetName = Literal["price", "solar", "wind", "temperature"]
ModelFamily = Literal["transformer"]

router = APIRouter(prefix="/api/v1/forecast", tags=["forecast"])


class ForecastPoint(BaseModel):
    timestamp: datetime
    value: float


class ForecastResponse(BaseModel):
    run_id: int
    dataset: DatasetName
    model_family: ModelFamily
    target_feature: str
    forecast_start: datetime
    lookback_start: datetime
    lookback_end: datetime
    horizon: int
    predictions: list[ForecastPoint]


class WeatherForecastRequest(BaseModel):
    dataset: WeatherDatasetName
    forecast_start: datetime
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    model_family: ModelFamily = "transformer"


@router.post("/weather", response_model=ForecastResponse)
def forecast_weather(payload: WeatherForecastRequest) -> ForecastResponse:
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL is missing")

    try:
        result = forecast_weather_dataset(
            database_url=database_url,
            dataset=payload.dataset,
            forecast_start=payload.forecast_start,
            latitude=payload.latitude,
            longitude=payload.longitude,
            model_family=payload.model_family,
        )
    except ForecastServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Forecast failed: {exc}") from exc

    return ForecastResponse(**result)


@router.post("/demand", response_model=ForecastResponse)
def forecast_demand(
    forecast_start: datetime = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    model_family: ModelFamily = Form("transformer"),
    demand_csv: UploadFile = File(...),
) -> ForecastResponse:
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL is missing")

    if not demand_csv.filename:
        raise HTTPException(status_code=422, detail="Demand CSV filename is missing")

    try:
        demand_csv_bytes = demand_csv.file.read()
        result = forecast_demand_with_upload(
            database_url=database_url,
            forecast_start=forecast_start,
            latitude=latitude,
            longitude=longitude,
            demand_csv_bytes=demand_csv_bytes,
            model_family=model_family,
        )
    except ForecastServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Demand forecast failed: {exc}") from exc

    return ForecastResponse(**result)
