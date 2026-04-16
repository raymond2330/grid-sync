from datetime import UTC, datetime, timedelta
from pathlib import Path
import io
import sys
from typing import Any

from fastapi.testclient import TestClient


repo_root = Path(__file__).resolve().parents[2]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

import backend.main as main
import backend.app.routers.forecast as forecast_router_module


client = TestClient(main.app)


def _to_iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _prediction_full(predictions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    full: list[dict[str, Any]] = []
    for point in predictions:
        timestamp = point["timestamp"]
        if isinstance(timestamp, datetime):
            timestamp = _to_iso(timestamp)
        full.append({"timestamp": timestamp, "value": float(point["value"])})
    return full


def _forecast_payload(dataset: str, forecast_start: datetime) -> dict:
    lookback_start = forecast_start - timedelta(days=7)
    lookback_end = forecast_start - timedelta(minutes=5)
    return {
        "run_id": 123,
        "dataset": dataset,
        "model_family": "transformer",
        "target_feature": "TOTAL" if dataset == "demand" else "WS50M",
        "forecast_start": forecast_start,
        "lookback_start": lookback_start,
        "lookback_end": lookback_end,
        "horizon": 2,
        "predictions": [
            {"timestamp": forecast_start, "value": 1.23},
            {"timestamp": forecast_start + timedelta(minutes=5), "value": 1.25},
        ],
    }


def test_forecast_weather_success(monkeypatch, flow_trace):
    forecast_start = datetime(2026, 4, 16, 0, 0, tzinfo=UTC)
    request_payload = {
        "dataset": "wind",
        "forecast_start": "2026-04-16T00:00:00Z",
        "latitude": 14.5995,
        "longitude": 120.9842,
        "model_family": "transformer",
    }

    def _fake_service(**kwargs):
        assert kwargs["dataset"] == "wind"
        flow_trace(
            "weather.route_to_service",
            service_payload={
                "dataset": kwargs["dataset"],
                "forecast_start": _to_iso(kwargs["forecast_start"]),
                "latitude": kwargs["latitude"],
                "longitude": kwargs["longitude"],
                "model_family": kwargs["model_family"],
            },
        )
        result = _forecast_payload("wind", kwargs["forecast_start"])
        flow_trace(
            "weather.forecasted_output",
            horizon=result["horizon"],
            target_feature=result["target_feature"],
            predictions_full=_prediction_full(result["predictions"]),
        )
        return result

    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
    monkeypatch.setattr(forecast_router_module, "forecast_weather_dataset", _fake_service)

    flow_trace("weather.request_in", request_payload=request_payload)

    response = client.post(
        "/api/v1/forecast/weather",
        json=request_payload,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset"] == "wind"
    assert payload["horizon"] == 2
    flow_trace(
        "weather.response_out",
        status_code=response.status_code,
        dataset=payload["dataset"],
        horizon=payload["horizon"],
        predictions_full=_prediction_full(payload["predictions"]),
    )


def test_forecast_demand_requires_database_url(monkeypatch, flow_trace):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    csv_payload = b"DATETIME,TOTAL\n2026-04-09T00:00:00Z,100\n"
    request_form = {
        "forecast_start": "2026-04-16T00:00:00Z",
        "latitude": "14.5995",
        "longitude": "120.9842",
        "model_family": "transformer",
    }
    flow_trace(
        "demand.request_in_missing_db_url",
        form_data=request_form,
        upload_csv_preview=csv_payload.decode("utf-8").splitlines(),
    )

    response = client.post(
        "/api/v1/forecast/demand",
        data=request_form,
        files={"demand_csv": ("demand.csv", io.BytesIO(csv_payload), "text/csv")},
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "DATABASE_URL is missing"
    flow_trace(
        "demand.response_out_missing_db_url",
        status_code=response.status_code,
        detail=response.json()["detail"],
    )


def test_forecast_demand_success_shows_uploaded_and_forecast_data(monkeypatch, flow_trace):
    forecast_start = datetime(2026, 4, 16, 0, 0, tzinfo=UTC)
    csv_payload = b"DATETIME,TOTAL\n2026-04-09T00:00:00Z,100\n2026-04-09T00:05:00Z,101\n"
    request_form = {
        "forecast_start": "2026-04-16T00:00:00Z",
        "latitude": "14.5995",
        "longitude": "120.9842",
        "model_family": "transformer",
    }

    def _fake_service(**kwargs):
        flow_trace(
            "user.uploaded_data",
            upload_bytes=len(kwargs["demand_csv_bytes"]),
            upload_csv_full=kwargs["demand_csv_bytes"].decode("utf-8").splitlines(),
            service_payload={
                "forecast_start": _to_iso(kwargs["forecast_start"]),
                "latitude": kwargs["latitude"],
                "longitude": kwargs["longitude"],
                "model_family": kwargs["model_family"],
            },
        )
        result = _forecast_payload("demand", kwargs["forecast_start"])
        flow_trace(
            "model.forecast_output",
            horizon=result["horizon"],
            predictions_full=_prediction_full(result["predictions"]),
            target_feature=result["target_feature"],
        )
        flow_trace(
            "db.save_forecast_payload",
            run_id=result["run_id"],
            dataset=result["dataset"],
            save_predictions_full=_prediction_full(result["predictions"]),
        )
        return result

    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
    monkeypatch.setattr(forecast_router_module, "forecast_demand_with_upload", _fake_service)

    flow_trace(
        "demand.request_in_success",
        form_data=request_form,
        upload_csv_full=csv_payload.decode("utf-8").splitlines(),
    )

    response = client.post(
        "/api/v1/forecast/demand",
        data=request_form,
        files={"demand_csv": ("demand.csv", io.BytesIO(csv_payload), "text/csv")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset"] == "demand"
    assert payload["horizon"] == 2
    flow_trace(
        "demand.response_out_success",
        status_code=response.status_code,
        run_id=payload["run_id"],
        predictions_full=_prediction_full(payload["predictions"]),
    )


def test_forecast_demand_service_error_maps_to_422(monkeypatch, flow_trace):
    def _raise_service_error(**kwargs):
        flow_trace(
            "demand.route_to_service_error",
            service_payload={
                "forecast_start": _to_iso(kwargs["forecast_start"]),
                "latitude": kwargs["latitude"],
                "longitude": kwargs["longitude"],
                "model_family": kwargs["model_family"],
                "upload_bytes": len(kwargs["demand_csv_bytes"]),
            },
            raised_error="bad csv",
        )
        raise forecast_router_module.ForecastServiceError("bad csv")

    monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
    monkeypatch.setattr(forecast_router_module, "forecast_demand_with_upload", _raise_service_error)

    csv_payload = b"DATETIME,TOTAL\n2026-04-09T00:00:00Z,100\n"
    request_form = {
        "forecast_start": "2026-04-16T00:00:00Z",
        "latitude": "14.5995",
        "longitude": "120.9842",
        "model_family": "transformer",
    }
    flow_trace(
        "demand.request_in_service_error",
        form_data=request_form,
        upload_csv_preview=csv_payload.decode("utf-8").splitlines(),
    )

    response = client.post(
        "/api/v1/forecast/demand",
        data=request_form,
        files={"demand_csv": ("demand.csv", io.BytesIO(csv_payload), "text/csv")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "bad csv"
    flow_trace(
        "demand.response_out_service_error",
        status_code=response.status_code,
        detail=response.json()["detail"],
    )
