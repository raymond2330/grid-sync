from datetime import UTC, datetime, timedelta
from pathlib import Path
import sys
import re
from typing import Any

import numpy as np
import pandas as pd


repo_root = Path(__file__).resolve().parents[2]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

import backend.app.services.forecasting as forecasting_service


def _to_iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _series_full(series: pd.Series) -> list[dict[str, Any]]:
    full: list[dict[str, Any]] = []
    for timestamp, value in series.items():
        full.append(
            {
                "timestamp": _to_iso(timestamp.to_pydatetime()),
                "value": float(value),
            }
        )
    return full


def _prediction_full(predictions: list[Any]) -> list[dict[str, Any]]:
    full: list[dict[str, Any]] = []
    for point in predictions:
        if isinstance(point, tuple):
            timestamp, value = point
        else:
            timestamp = point["timestamp"]
            value = point["value"]
        if isinstance(timestamp, pd.Timestamp):
            timestamp = timestamp.to_pydatetime()
        if isinstance(timestamp, datetime):
            timestamp = _to_iso(timestamp)
        full.append({"timestamp": timestamp, "value": float(value)})
    return full


class _FakeConnectionContext:
    def __enter__(self):
        return object()

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeScaler:
    def inverse_transform(self, values):
        return values


class _FakeConfig:
    window_size = 2016
    horizon = 2
    n_features = 11


class _FakeLoadedTransformer:
    config = _FakeConfig()


class _WeatherFrameCursor:
    def __init__(self, row: tuple[Any, ...]) -> None:
        self._row = row

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, query, params):
        self.query = query
        self.params = params

    def fetchall(self):
        return [self._row]


class _WeatherFrameConnection:
    def __init__(self, row: tuple[Any, ...]) -> None:
        self._row = row

    def cursor(self):
        return _WeatherFrameCursor(self._row)


def _weather_row_for_query(query: str, base_timestamp: datetime) -> tuple[Any, ...]:
    match = re.search(r"SELECT\s+timestamp,\s*(.+?)\s+FROM", query, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        raise AssertionError("Unable to parse selected weather columns from query")

    raw_columns = [column.strip().strip('"') for column in match.group(1).split(",")]
    row: list[Any] = [base_timestamp]
    for index, _column in enumerate(raw_columns, start=1):
        row.append(float(index))

    return tuple(row)


def test_demand_upload_is_upserted_and_reloaded_from_database(monkeypatch, flow_trace):
    forecast_start = datetime(2026, 4, 16, 0, 0, tzinfo=UTC)
    demand_csv_bytes = b"DATETIME,TOTAL\n2026-04-09T00:00:00Z,100\n"
    expected_index = pd.date_range(
        end=forecast_start - timedelta(minutes=5),
        periods=2016,
        freq="5min",
        tz=UTC,
    )

    uploaded_frame = pd.DataFrame(
        {"TOTAL": np.linspace(100.0, 200.0, num=len(expected_index), dtype=np.float64)},
        index=expected_index,
    )
    db_frame = uploaded_frame.copy()
    db_frame.iloc[0, 0] = 321.0

    flow_trace(
        "user.uploaded_data",
        forecast_start=_to_iso(forecast_start),
        latitude=14.5995,
        longitude=120.9842,
        lookback_points=len(expected_index),
        upload_bytes=len(demand_csv_bytes),
        uploaded_data_rows=len(uploaded_frame),
        uploaded_data_full=_series_full(uploaded_frame["TOTAL"]),
    )

    captures: dict[str, object] = {}

    monkeypatch.setattr(
        forecasting_service.psycopg2,
        "connect",
        lambda *args, **kwargs: _FakeConnectionContext(),
    )
    monkeypatch.setattr(
        forecasting_service,
        "_load_transformer",
        lambda dataset, model_family: _FakeLoadedTransformer(),
    )
    monkeypatch.setattr(
        forecasting_service,
        "_lookback_bounds",
        lambda forecast_start, window_size: (
            expected_index[0].to_pydatetime(),
            expected_index[-1].to_pydatetime(),
            expected_index,
        ),
    )
    monkeypatch.setattr(
        forecasting_service,
        "_parse_demand_csv",
        lambda csv_bytes, expected_index: uploaded_frame,
    )
    monkeypatch.setattr(forecasting_service, "_ensure_forecast_tables", lambda connection: None)
    monkeypatch.setattr(forecasting_service, "_ensure_demand_series_table", lambda connection: None)

    def _fake_upsert(connection, *, latitude, longitude, demand_frame):
        captures["upsert_frame"] = demand_frame.copy()
        flow_trace(
            "db.save_demandseries_upsert",
            latitude=latitude,
            longitude=longitude,
            upserted_rows=len(demand_frame),
            save_payload_full=_series_full(demand_frame["TOTAL"]),
        )
        return len(demand_frame)

    monkeypatch.setattr(forecasting_service, "_upsert_demand_series", _fake_upsert)

    def _fake_fetch_demand(connection, *, latitude, longitude, expected_index):
        captures["fetched_from_db"] = True
        flow_trace(
            "demand.loaded_from_db_for_forecast",
            latitude=latitude,
            longitude=longitude,
            db_rows=len(db_frame),
            db_series_full=_series_full(db_frame["TOTAL"]),
        )
        return db_frame.copy()

    monkeypatch.setattr(forecasting_service, "_fetch_demand_series", _fake_fetch_demand)

    weather_columns = [
        column for column in forecasting_service.DATASET_COLUMNS["demand"] if column != "DATETIME"
    ]
    weather_frame = pd.DataFrame(index=expected_index)
    for column in weather_columns:
        weather_frame[column] = 1.0

    monkeypatch.setattr(
        forecasting_service,
        "_fetch_weather_frame",
        lambda **kwargs: weather_frame,
    )

    def _fake_build_input_matrix(dataset, weather_frame, target_override):
        captures["target_override"] = target_override.copy()
        flow_trace(
            "demand.model_input_built",
            dataset=dataset,
            model_input_shape=[2016, 11],
            target_override_full=_series_full(target_override),
        )
        return np.ones((2016, 11), dtype=np.float32), _FakeScaler()

    monkeypatch.setattr(forecasting_service, "_build_input_matrix", _fake_build_input_matrix)
    def _fake_run_model(loaded, model_input):
        flow_trace(
            "model.forecast_output",
            model_input_shape=list(model_input.shape),
            forecast_horizon=loaded.config.horizon,
            forecast_values_preview=[1.0, 2.0],
        )
        return np.array([[1.0], [2.0]], dtype=np.float32)

    monkeypatch.setattr(forecasting_service, "_run_model", _fake_run_model)

    prediction_index = pd.date_range(start=forecast_start, periods=2, freq="5min", tz=UTC)
    monkeypatch.setattr(
        forecasting_service,
        "_prediction_timestamps",
        lambda forecast_start, horizon: prediction_index,
    )
    def _fake_persist_forecast(**kwargs):
        captures["persist_predictions"] = kwargs["predictions"]
        flow_trace(
            "db.save_forecast_predictions",
            run_id=77,
            dataset=kwargs["dataset"],
            target_feature=kwargs["target_feature"],
            horizon=len(kwargs["predictions"]),
            save_payload_full=_prediction_full(kwargs["predictions"]),
        )
        return 77

    monkeypatch.setattr(forecasting_service, "_persist_forecast", _fake_persist_forecast)

    result = forecasting_service.forecast_demand_with_upload(
        database_url="postgresql://fake",
        forecast_start=forecast_start,
        latitude=14.5995,
        longitude=120.9842,
        demand_csv_bytes=demand_csv_bytes,
        model_family="transformer",
    )

    flow_trace(
        "pipeline.summary",
        run_id=result["run_id"],
        horizon=result["horizon"],
        uploaded_data_full=_series_full(uploaded_frame["TOTAL"]),
        response_predictions_full=_prediction_full(result["predictions"]),
        saved_predictions_full=_prediction_full(captures["persist_predictions"]),
    )

    assert captures.get("fetched_from_db") is True
    assert captures["upsert_frame"].equals(uploaded_frame)
    assert float(captures["target_override"].iloc[0]) == float(db_frame.iloc[0, 0])
    assert len(captures["persist_predictions"]) == 2
    assert result["run_id"] == 77
    assert len(result["predictions"]) == 2


def test_fetch_weather_frame_includes_target_columns_for_supported_datasets():
    forecast_start = datetime(2026, 4, 16, 0, 0, tzinfo=UTC)
    expected_index = pd.date_range(start=forecast_start, periods=1, freq="5min", tz=UTC)

    cases = [
        ("temperature", "T2M"),
        ("solar", "ALLSKY_SFC_SW_DWN"),
        ("wind", "WS50M"),
    ]

    for dataset, target_column in cases:
        selected_columns = forecasting_service._dataset_exogenous_columns(dataset) + [target_column]
        query_probe = "SELECT timestamp, " + ", ".join(f'"{column}"' for column in selected_columns) + ' FROM "NASAPower"'
        row = _weather_row_for_query(query_probe, forecast_start)
        connection = _WeatherFrameConnection(row)

        frame = forecasting_service._fetch_weather_frame(
            connection=connection,
            dataset=dataset,
            latitude=14.5995,
            longitude=120.9842,
            expected_index=expected_index,
        )

        assert target_column in frame.columns
    assert float(frame[target_column].iloc[0]) == float(len(selected_columns))


def test_price_forecast_requires_price_target_history():
    forecast_start = datetime(2026, 4, 16, 0, 0, tzinfo=UTC)
    expected_index = pd.date_range(start=forecast_start - timedelta(days=7), periods=2016, freq="5min", tz=UTC)

    weather_frame = pd.DataFrame(index=expected_index)
    for column in forecasting_service._dataset_exogenous_columns("price"):
        weather_frame[column] = 1.0

    try:
        forecasting_service._build_input_matrix("price", weather_frame, None)
    except forecasting_service.ForecastServiceError as exc:
        assert "RTD_LMP_SMP" in str(exc)
    else:
        raise AssertionError("Price forecasting should require RTD_LMP_SMP history")
