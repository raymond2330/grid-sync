"""HTTP routes for NASA POWER lookback ingestion."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

try:
    from app.nasa_parameters import SUPPORTED_DATASETS
    from app.services.nasa_power import NASAServiceError, ensure_dataset_lookback
except ModuleNotFoundError:
    from backend.app.nasa_parameters import SUPPORTED_DATASETS
    from backend.app.services.nasa_power import NASAServiceError, ensure_dataset_lookback

DatasetName = Literal["demand", "price", "solar", "wind", "temperature"]

router = APIRouter(prefix="/api/v1/nasa", tags=["nasa"])


class EnsureLookbackRequest(BaseModel):
    forecast_start: datetime
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    lookback_days: int = Field(default=7, ge=1, le=30)
    datasets: list[DatasetName] = Field(default_factory=lambda: list(SUPPORTED_DATASETS))
    community: Literal["RE", "AG", "SB"] = "RE"
    timezone: Literal["UTC", "LST"] = "UTC"
    timeout_seconds: int = Field(default=120, ge=10, le=300)

    @field_validator("datasets")
    @classmethod
    def _deduplicate_datasets(cls, value: list[DatasetName]) -> list[DatasetName]:
        if not value:
            raise ValueError("datasets must contain at least one dataset")

        seen: set[str] = set()
        deduplicated: list[DatasetName] = []
        for dataset in value:
            if dataset in seen:
                continue
            seen.add(dataset)
            deduplicated.append(dataset)

        return deduplicated


class DatasetEnsureLookbackResult(BaseModel):
    dataset: DatasetName
    target_feature: str
    lookback_start: datetime
    lookback_end: datetime
    expected_points: int
    existing_points: int
    missing_points: int
    fetched: bool
    upserted_rows: int


class EnsureLookbackResponse(BaseModel):
    forecast_start: datetime
    lookback_days: int
    latitude: float
    longitude: float
    datasets: list[DatasetEnsureLookbackResult]


@router.post("/ensure-lookback", response_model=EnsureLookbackResponse)
def ensure_lookback(payload: EnsureLookbackRequest) -> EnsureLookbackResponse:
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL is missing")

    results: list[DatasetEnsureLookbackResult] = []
    for dataset in payload.datasets:
        try:
            result = ensure_dataset_lookback(
                database_url=database_url,
                dataset=dataset,
                forecast_start=payload.forecast_start,
                latitude=payload.latitude,
                longitude=payload.longitude,
                lookback_days=payload.lookback_days,
                community=payload.community,
                timezone=payload.timezone,
                timeout=payload.timeout_seconds,
            )
        except NASAServiceError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=500,
                detail=f"Failed to ensure lookback for dataset '{dataset}': {exc}",
            ) from exc

        results.append(DatasetEnsureLookbackResult(**result))

    return EnsureLookbackResponse(
        forecast_start=payload.forecast_start,
        lookback_days=payload.lookback_days,
        latitude=payload.latitude,
        longitude=payload.longitude,
        datasets=results,
    )
