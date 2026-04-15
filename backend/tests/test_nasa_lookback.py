from datetime import UTC, datetime, timedelta
from pathlib import Path
import sys

from fastapi.testclient import TestClient


repo_root = Path(__file__).resolve().parents[2]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

import backend.main as main
import backend.app.routers.nasa as nasa_router_module


client = TestClient(main.app)


def _fake_result(dataset: str, forecast_start: datetime) -> dict:
    lookback_start = forecast_start - timedelta(days=7)
    lookback_end = forecast_start - timedelta(minutes=5)
    return {
        "dataset": dataset,
        "target_feature": "ALLSKY_SFC_SW_DWN" if dataset == "solar" else "WS50M",
        "lookback_start": lookback_start,
        "lookback_end": lookback_end,
        "expected_points": 2016,
        "existing_points": 2016,
        "missing_points": 0,
        "fetched": False,
        "upserted_rows": 0,
    }


def test_ensure_lookback_success(monkeypatch):
    calls: list[str] = []

    def _fake_service(**kwargs):
        calls.append(kwargs["dataset"])
        return _fake_result(kwargs["dataset"], kwargs["forecast_start"])

    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
    monkeypatch.setattr(nasa_router_module, "ensure_dataset_lookback", _fake_service)

    response = client.post(
        "/api/v1/nasa/ensure-lookback",
        json={
            "forecast_start": "2026-04-16T00:00:00Z",
            "latitude": 14.5995,
            "longitude": 120.9842,
            "datasets": ["solar", "wind"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["datasets"]) == 2
    assert calls == ["solar", "wind"]


def test_ensure_lookback_requires_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    response = client.post(
        "/api/v1/nasa/ensure-lookback",
        json={
            "forecast_start": "2026-04-16T00:00:00Z",
            "latitude": 14.5995,
            "longitude": 120.9842,
            "datasets": ["solar"],
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "DATABASE_URL is missing"


def test_ensure_lookback_value_error_maps_to_422(monkeypatch):
    def _raise_value_error(**kwargs):
        raise ValueError("forecast_start must be aligned to a 5-minute boundary")

    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
    monkeypatch.setattr(nasa_router_module, "ensure_dataset_lookback", _raise_value_error)

    response = client.post(
        "/api/v1/nasa/ensure-lookback",
        json={
            "forecast_start": "2026-04-16T00:00:00Z",
            "latitude": 14.5995,
            "longitude": 120.9842,
            "datasets": ["solar"],
        },
    )

    assert response.status_code == 422
