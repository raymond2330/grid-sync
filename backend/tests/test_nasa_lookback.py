from datetime import UTC, datetime, timedelta
from pathlib import Path
import sys
import json
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient


repo_root = Path(__file__).resolve().parents[2]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

import backend.main as main
import backend.app.routers.nasa as nasa_router_module
import backend.app.services.nasa_power as nasa_power_service


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


def test_fetch_hourly_frame_requests_full_weather_parameter_set(monkeypatch):
    captured = {}

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            parameter_payload = {
                column: {"2026041500": 1.0}
                for column in nasa_power_service.WEATHER_EXOGENOUS_COLUMNS
            }
            return json.dumps({"properties": {"parameter": parameter_payload}}).encode("utf-8")

    captured_urls: list[str] = []

    def _fake_urlopen(request_url, timeout):
        captured_urls.append(request_url)
        captured["timeout"] = timeout
        return _FakeResponse()

    monkeypatch.setattr(nasa_power_service, "urlopen", _fake_urlopen)

    frame = nasa_power_service._fetch_hourly_frame(
        dataset="demand",
        latitude=14.5995,
        longitude=120.9842,
        request_start=datetime(2026, 4, 9, 0, 0, tzinfo=UTC),
        request_end=datetime(2026, 4, 16, 0, 0, tzinfo=UTC),
        community="RE",
        timezone="UTC",
        timeout=120,
    )

    requested_columns: list[str] = []
    for request_url in captured_urls:
        parsed_url = urlparse(request_url)
        params = parse_qs(parsed_url.query)
        chunk_columns = params["parameters"][0].split(",")
        assert len(chunk_columns) <= nasa_power_service.NASA_POWER_MAX_PARAMETERS_PER_REQUEST
        requested_columns.extend(chunk_columns)

    assert set(requested_columns) == set(nasa_power_service.WEATHER_EXOGENOUS_COLUMNS)
    assert len(requested_columns) == len(set(requested_columns))
    assert list(frame.columns) == list(nasa_power_service.WEATHER_EXOGENOUS_COLUMNS)
