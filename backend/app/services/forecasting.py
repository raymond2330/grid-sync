"""Forecasting service that loads baseline transformer artifacts and runs inference."""

from __future__ import annotations

import io
import importlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import Json, execute_values
from sklearn.preprocessing import MinMaxScaler

try:
    from app.nasa_parameters import DATASET_COLUMNS, TARGET_FEATURE_BY_DATASET, WEATHER_EXOGENOUS_COLUMNS
except ModuleNotFoundError:
    from backend.app.nasa_parameters import DATASET_COLUMNS, TARGET_FEATURE_BY_DATASET, WEATHER_EXOGENOUS_COLUMNS

SUPPORTED_MODEL_FAMILIES = {"transformer"}
FORECAST_STEP = timedelta(minutes=5)


class ForecastServiceError(RuntimeError):
    """Raised when forecast input data or model loading fails."""


@dataclass(frozen=True)
class TransformerConfig:
    dataset: str
    target_column: str
    window_size: int
    horizon: int
    n_features: int
    d_model: int
    nhead: int
    num_layers: int
    dim_feedforward: int
    dropout: float


@dataclass
class LoadedTransformer:
    config: TransformerConfig
    model: Any
    torch: Any


_MODEL_CACHE: dict[tuple[str, str], LoadedTransformer] = {}


def _artifact_root() -> Path:
    return Path(__file__).resolve().parents[1] / "model_artifacts"


def _normalize_model_family(model_family: str) -> str:
    normalized = model_family.strip().lower()
    if normalized not in SUPPORTED_MODEL_FAMILIES:
        supported = ", ".join(sorted(SUPPORTED_MODEL_FAMILIES))
        raise ForecastServiceError(f"Unsupported model family: {model_family}. Supported: {supported}")
    return normalized


def _normalize_coordinate(value: float) -> float:
    return round(float(value), 6)


def _normalize_forecast_start(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    else:
        value = value.astimezone(UTC)

    if value.second != 0 or value.microsecond != 0:
        raise ForecastServiceError("forecast_start must not include seconds or microseconds")
    if value.minute % 5 != 0:
        raise ForecastServiceError("forecast_start must be aligned to a 5-minute boundary")

    return value


def _lookback_bounds(forecast_start: datetime, window_size: int) -> tuple[datetime, datetime, pd.DatetimeIndex]:
    lookback_start = forecast_start - FORECAST_STEP * window_size
    lookback_end = forecast_start - FORECAST_STEP
    index = pd.date_range(start=lookback_start, end=lookback_end, freq="5min", tz=UTC)
    if len(index) != window_size:
        raise ForecastServiceError(
            f"Window construction mismatch: expected {window_size} points, got {len(index)}"
        )
    return lookback_start, lookback_end, index


def _dataset_target(dataset: str) -> str:
    if dataset not in TARGET_FEATURE_BY_DATASET:
        raise ForecastServiceError(f"Unsupported dataset: {dataset}")
    return TARGET_FEATURE_BY_DATASET[dataset]


def _dataset_exogenous_columns(dataset: str) -> list[str]:
    target_column = _dataset_target(dataset)
    columns = DATASET_COLUMNS[dataset]
    return [
        column
        for column in columns
        if column not in {"DATETIME", target_column, "TOTAL"}
    ]


def _load_torch_modules() -> tuple[Any, Any]:
    try:
        torch = importlib.import_module("torch")
        nn = importlib.import_module("torch.nn")
    except ModuleNotFoundError as exc:
        raise ForecastServiceError(
            "PyTorch is required for transformer inference. Install CPU wheels first, "
            "for example: pip install --extra-index-url https://download.pytorch.org/whl/cpu torch"
        ) from exc

    return torch, nn


def _build_transformer_model(config: TransformerConfig) -> LoadedTransformer:
    torch, nn = _load_torch_modules()

    class PositionalEncoding(nn.Module):
        def __init__(self, d_model: int, max_len: int, dropout: float) -> None:
            super().__init__()
            self.dropout = nn.Dropout(dropout)
            pe = torch.zeros(max_len, d_model)
            position = torch.arange(0, max_len, dtype=torch.float32).unsqueeze(1)
            div_term = torch.exp(
                torch.arange(0, d_model, 2, dtype=torch.float32)
                * (-np.log(10000.0) / d_model)
            )
            pe[:, 0::2] = torch.sin(position * div_term)
            pe[:, 1::2] = torch.cos(position * div_term)
            self.register_buffer("pe", pe.unsqueeze(0), persistent=False)

        def forward(self, x: Any) -> Any:
            x = x + self.pe[:, : x.size(1), :]
            return self.dropout(x)

    class TransformerForecaster(nn.Module):
        def __init__(
            self,
            n_features: int,
            window_size: int,
            horizon: int,
            d_model: int,
            nhead: int,
            num_layers: int,
            dim_feedforward: int,
            dropout: float,
        ) -> None:
            super().__init__()
            self.input_proj = nn.Linear(n_features, d_model)
            self.pos_enc = PositionalEncoding(d_model=d_model, max_len=window_size, dropout=dropout)
            encoder_layer = nn.TransformerEncoderLayer(
                d_model=d_model,
                nhead=nhead,
                dim_feedforward=dim_feedforward,
                dropout=dropout,
                batch_first=True,
                activation="gelu",
                norm_first=True,
            )
            self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
            self.enc_ln = nn.LayerNorm(d_model)
            concat_dim = d_model + n_features
            self.head = nn.Sequential(
                nn.Linear(concat_dim, 2 * d_model),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(2 * d_model, horizon),
            )

        def forward(self, x: Any) -> Any:
            h = self.input_proj(x)
            h = self.pos_enc(h)
            h = self.encoder(h)
            h = self.enc_ln(h)
            h_pool = h.mean(dim=1)
            z = torch.cat([h_pool, x[:, -1, :]], dim=1)
            return self.head(z).unsqueeze(-1)

    model = TransformerForecaster(
        n_features=config.n_features,
        window_size=config.window_size,
        horizon=config.horizon,
        d_model=config.d_model,
        nhead=config.nhead,
        num_layers=config.num_layers,
        dim_feedforward=config.dim_feedforward,
        dropout=config.dropout,
    )

    return LoadedTransformer(config=config, model=model, torch=torch)


def _load_transformer_config(dataset: str, model_family: str) -> tuple[TransformerConfig, Path]:
    config_path = _artifact_root() / dataset / model_family / "Transformer_config.json"
    if not config_path.exists():
        raise ForecastServiceError(f"Missing model config for dataset '{dataset}': {config_path}")

    with config_path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)

    model_params = raw.get("model_params") or {}

    config = TransformerConfig(
        dataset=dataset,
        target_column=raw.get("target_column") or _dataset_target(dataset),
        window_size=int(raw.get("window_size", 2016)),
        horizon=int(raw.get("horizon", 288)),
        n_features=int(raw.get("n_features", 11)),
        d_model=int(model_params.get("d_model", 128)),
        nhead=int(model_params.get("nhead", 8)),
        num_layers=int(model_params.get("num_layers", 4)),
        dim_feedforward=int(model_params.get("dim_feedforward", 256)),
        dropout=float(model_params.get("dropout", 0.1)),
    )

    model_path = _artifact_root() / dataset / model_family / "Transformer.pt"
    if not model_path.exists():
        raise ForecastServiceError(f"Missing model checkpoint for dataset '{dataset}': {model_path}")

    return config, model_path


def _load_transformer(dataset: str, model_family: str) -> LoadedTransformer:
    cache_key = (dataset, model_family)
    if cache_key in _MODEL_CACHE:
        return _MODEL_CACHE[cache_key]

    config, model_path = _load_transformer_config(dataset=dataset, model_family=model_family)
    loaded = _build_transformer_model(config)

    state = loaded.torch.load(model_path, map_location="cpu")
    if isinstance(state, dict) and "state_dict" in state and isinstance(state["state_dict"], dict):
        state = state["state_dict"]

    loaded.model.load_state_dict(state)
    loaded.model.eval()

    _MODEL_CACHE[cache_key] = loaded
    return loaded


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        coerced = float(value)
    except (TypeError, ValueError):
        return None
    if np.isnan(coerced):
        return None
    return coerced


def _fetch_weather_frame(
    connection: psycopg2.extensions.connection,
    dataset: str,
    latitude: float,
    longitude: float,
    expected_index: pd.DatetimeIndex,
) -> pd.DataFrame:
    feature_columns = _dataset_exogenous_columns(dataset)
    target_column = _dataset_target(dataset)

    selected_columns = list(feature_columns)
    if target_column in WEATHER_EXOGENOUS_COLUMNS and target_column not in selected_columns:
        selected_columns.append(target_column)

    if not selected_columns:
        raise ForecastServiceError(f"No weather columns configured for dataset '{dataset}'")

    select_columns = ", ".join(f'"{column}"' for column in selected_columns)
    query = """
SELECT timestamp, {select_columns}
FROM "NASAPower"
WHERE dataset = %s
      AND latitude = %s
      AND longitude = %s
      AND timestamp BETWEEN %s AND %s
    ORDER BY timestamp ASC
    """.format(select_columns=select_columns)

    start = expected_index[0].to_pydatetime()
    end = expected_index[-1].to_pydatetime()

    with connection.cursor() as cursor:
        cursor.execute(query, ("weather", latitude, longitude, start, end))
        rows = cursor.fetchall()

    records: list[dict[str, Any]] = []
    for row_values in rows:
        timestamp = row_values[0]
        ts = timestamp.replace(tzinfo=UTC) if timestamp.tzinfo is None else timestamp.astimezone(UTC)

        row: dict[str, Any] = {"timestamp": ts}
        for index, column in enumerate(selected_columns, start=1):
            row[column] = _coerce_float(row_values[index])
        records.append(row)

    frame = pd.DataFrame.from_records(records)
    if frame.empty:
        frame = pd.DataFrame(index=expected_index)
        for column in selected_columns:
            frame[column] = np.nan
        return frame

    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
    frame = frame.set_index("timestamp").sort_index()
    frame = frame[~frame.index.duplicated(keep="last")]

    for column in selected_columns:
        if column not in frame.columns:
            frame[column] = np.nan

    frame = frame.reindex(expected_index)
    return frame[selected_columns]


def _parse_demand_csv(csv_bytes: bytes, expected_index: pd.DatetimeIndex) -> pd.DataFrame:
    if not csv_bytes:
        raise ForecastServiceError("Demand CSV file is empty")

    try:
        frame = pd.read_csv(io.BytesIO(csv_bytes))
    except Exception as exc:  # noqa: BLE001
        raise ForecastServiceError(f"Unable to parse demand CSV: {exc}") from exc

    expected_columns = {"DATETIME", "TOTAL"}
    if not expected_columns.issubset(frame.columns):
        raise ForecastServiceError("Demand CSV must contain DATETIME and TOTAL columns")

    frame = frame[["DATETIME", "TOTAL"]].copy()
    frame["DATETIME"] = pd.to_datetime(frame["DATETIME"], errors="coerce", utc=True)
    if frame["DATETIME"].isna().any():
        raise ForecastServiceError("Demand CSV contains invalid DATETIME values")

    frame["TOTAL"] = pd.to_numeric(frame["TOTAL"], errors="coerce")
    if frame["TOTAL"].isna().any():
        raise ForecastServiceError("Demand CSV contains non-numeric TOTAL values")

    frame = frame.set_index("DATETIME").sort_index()
    if frame.index.duplicated().any():
        raise ForecastServiceError("Demand CSV contains duplicate timestamps")

    frame = frame.reindex(expected_index)
    if frame["TOTAL"].isna().any():
        raise ForecastServiceError(
            "Demand CSV must contain complete 5-minute coverage for the full lookback window"
        )

    return frame


def _validate_no_missing(frame: pd.DataFrame, columns: list[str], context: str) -> None:
    if frame.empty:
        raise ForecastServiceError(f"No data available for {context}")

    missing_counts = frame[columns].isna().sum()
    missing_columns = [column for column, count in missing_counts.items() if int(count) > 0]
    if missing_columns:
        sample = ", ".join(missing_columns[:5])
        raise ForecastServiceError(
            f"Missing values in {context} for columns: {sample}. "
            "Ensure the 7-day lookback is fully ingested before forecasting."
        )


def _build_input_matrix(
    dataset: str,
    weather_frame: pd.DataFrame,
    target_override: pd.Series | None,
) -> tuple[np.ndarray, MinMaxScaler]:
    target_column = _dataset_target(dataset)
    feature_columns = _dataset_exogenous_columns(dataset)

    if target_override is None:
        if target_column not in weather_frame.columns:
            if dataset == "price":
                raise ForecastServiceError(
                    "Price target column RTD_LMP_SMP is unavailable in NASAPower. "
                    "Ingest price target history before running price forecasts."
                )
            raise ForecastServiceError(
                f"Missing target column '{target_column}' in weather lookback for dataset '{dataset}'."
            )
        target_series = weather_frame[target_column]
    else:
        target_series = target_override.reindex(weather_frame.index)

    working = weather_frame.copy()
    working[target_column] = target_series

    required_columns = feature_columns + [target_column]
    _validate_no_missing(working, required_columns, context=f"dataset '{dataset}'")

    feature_values = working[feature_columns].values.astype(np.float32)
    target_values = working[[target_column]].values.astype(np.float32)

    feature_scaler = MinMaxScaler()
    target_scaler = MinMaxScaler()

    feature_scaled = feature_scaler.fit_transform(feature_values)
    target_scaled = target_scaler.fit_transform(target_values)

    model_input = np.concatenate([feature_scaled, target_scaled], axis=1).astype(np.float32)
    return model_input, target_scaler


def _run_model(loaded: LoadedTransformer, model_input: np.ndarray) -> np.ndarray:
    if model_input.shape[0] != loaded.config.window_size:
        raise ForecastServiceError(
            f"Model window mismatch: expected {loaded.config.window_size}, got {model_input.shape[0]}"
        )
    if model_input.shape[1] != loaded.config.n_features:
        raise ForecastServiceError(
            f"Model feature mismatch: expected {loaded.config.n_features}, got {model_input.shape[1]}"
        )

    tensor = loaded.torch.from_numpy(model_input).unsqueeze(0)
    with loaded.torch.no_grad():
        prediction = loaded.model(tensor)

    prediction_array = prediction.detach().cpu().numpy().reshape(-1, 1)
    if prediction_array.shape[0] != loaded.config.horizon:
        raise ForecastServiceError(
            f"Model horizon mismatch: expected {loaded.config.horizon}, got {prediction_array.shape[0]}"
        )

    return prediction_array


def _ensure_forecast_tables(connection: psycopg2.extensions.connection) -> None:
    ddl = """
    CREATE TABLE IF NOT EXISTS "ForecastRun" (
        run_id BIGSERIAL PRIMARY KEY,
        dataset TEXT NOT NULL,
        model_family TEXT NOT NULL,
        forecast_start TIMESTAMPTZ NOT NULL,
        lookback_start TIMESTAMPTZ NOT NULL,
        lookback_end TIMESTAMPTZ NOT NULL,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "ForecastPrediction" (
        prediction_id BIGSERIAL PRIMARY KEY,
        run_id BIGINT NOT NULL REFERENCES "ForecastRun" (run_id) ON DELETE CASCADE,
        timestamp TIMESTAMPTZ NOT NULL,
        value DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (run_id, timestamp)
    );

    CREATE INDEX IF NOT EXISTS idx_forecast_run_dataset_created
        ON "ForecastRun" (dataset, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_forecast_prediction_run_timestamp
        ON "ForecastPrediction" (run_id, timestamp);
    """

    with connection.cursor() as cursor:
        cursor.execute(ddl)
    connection.commit()


def _ensure_demand_series_table(connection: psycopg2.extensions.connection) -> None:
    ddl = """
    CREATE TABLE IF NOT EXISTS "DemandSeries" (
        demand_id BIGSERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        total DOUBLE PRECISION NOT NULL,
        source TEXT NOT NULL DEFAULT 'user-upload',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (timestamp, latitude, longitude)
    );

    CREATE INDEX IF NOT EXISTS idx_demand_series_lookup
        ON "DemandSeries" (latitude, longitude, timestamp);
    """

    with connection.cursor() as cursor:
        cursor.execute(ddl)
    connection.commit()


def _upsert_demand_series(
    connection: psycopg2.extensions.connection,
    *,
    latitude: float,
    longitude: float,
    demand_frame: pd.DataFrame,
) -> int:
    if demand_frame.empty:
        raise ForecastServiceError("Demand upload is empty after validation")

    rows: list[tuple[Any, ...]] = []
    for timestamp, values in demand_frame.iterrows():
        total_value = _coerce_float(values.get("TOTAL"))
        if total_value is None:
            raise ForecastServiceError("Demand upload contains invalid TOTAL values")

        rows.append(
            (
                timestamp.to_pydatetime(),
                latitude,
                longitude,
                total_value,
                "user-upload",
            )
        )

    upsert_query = """
    INSERT INTO "DemandSeries" (timestamp, latitude, longitude, total, source)
    VALUES %s
    ON CONFLICT (timestamp, latitude, longitude)
    DO UPDATE SET
        total = EXCLUDED.total,
        source = EXCLUDED.source,
        updated_at = NOW()
    """

    with connection.cursor() as cursor:
        execute_values(cursor, upsert_query, rows, page_size=500)
    connection.commit()
    return len(rows)


def _fetch_demand_series(
    connection: psycopg2.extensions.connection,
    *,
    latitude: float,
    longitude: float,
    expected_index: pd.DatetimeIndex,
) -> pd.DataFrame:
    query = """
    SELECT timestamp, total
    FROM "DemandSeries"
    WHERE latitude = %s
      AND longitude = %s
      AND timestamp BETWEEN %s AND %s
    ORDER BY timestamp ASC
    """

    start = expected_index[0].to_pydatetime()
    end = expected_index[-1].to_pydatetime()

    with connection.cursor() as cursor:
        cursor.execute(query, (latitude, longitude, start, end))
        rows = cursor.fetchall()

    frame = pd.DataFrame.from_records(rows, columns=["timestamp", "TOTAL"])
    if frame.empty:
        frame = pd.DataFrame(index=expected_index)
        frame["TOTAL"] = np.nan
        return frame

    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
    frame["TOTAL"] = pd.to_numeric(frame["TOTAL"], errors="coerce")
    frame = frame.set_index("timestamp").sort_index()
    frame = frame[~frame.index.duplicated(keep="last")]
    frame = frame.reindex(expected_index)
    return frame[["TOTAL"]]


def _persist_forecast(
    connection: psycopg2.extensions.connection,
    *,
    dataset: str,
    model_family: str,
    forecast_start: datetime,
    lookback_start: datetime,
    lookback_end: datetime,
    latitude: float | None,
    longitude: float | None,
    target_feature: str,
    predictions: list[tuple[datetime, float]],
) -> int:
    insert_run = """
    INSERT INTO "ForecastRun" (
        dataset,
        model_family,
        forecast_start,
        lookback_start,
        lookback_end,
        latitude,
        longitude,
        metadata
    )
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    RETURNING run_id
    """

    upsert_predictions = """
    INSERT INTO "ForecastPrediction" (run_id, timestamp, value)
    VALUES %s
    ON CONFLICT (run_id, timestamp)
    DO UPDATE SET
        value = EXCLUDED.value,
        created_at = NOW()
    """

    metadata = Json({"target_feature": target_feature, "horizon": len(predictions)})

    with connection.cursor() as cursor:
        cursor.execute(
            insert_run,
            (
                dataset,
                model_family,
                forecast_start,
                lookback_start,
                lookback_end,
                latitude,
                longitude,
                metadata,
            ),
        )
        run_id = int(cursor.fetchone()[0])

        rows = [(run_id, timestamp, value) for timestamp, value in predictions]
        execute_values(cursor, upsert_predictions, rows, page_size=500)

    connection.commit()
    return run_id


def _prediction_timestamps(forecast_start: datetime, horizon: int) -> pd.DatetimeIndex:
    return pd.date_range(start=forecast_start, periods=horizon, freq="5min", tz=UTC)


def _build_response(
    *,
    run_id: int,
    dataset: str,
    model_family: str,
    target_feature: str,
    forecast_start: datetime,
    lookback_start: datetime,
    lookback_end: datetime,
    predictions: list[tuple[datetime, float]],
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "dataset": dataset,
        "model_family": model_family,
        "target_feature": target_feature,
        "forecast_start": forecast_start,
        "lookback_start": lookback_start,
        "lookback_end": lookback_end,
        "horizon": len(predictions),
        "predictions": [
            {"timestamp": timestamp, "value": float(value)}
            for timestamp, value in predictions
        ],
    }


def forecast_weather_dataset(
    *,
    database_url: str,
    dataset: str,
    forecast_start: datetime,
    latitude: float,
    longitude: float,
    model_family: str = "transformer",
) -> dict[str, Any]:
    if dataset not in {"price", "solar", "wind", "temperature"}:
        raise ForecastServiceError(
            "Weather forecast dataset must be one of: price, solar, wind, temperature"
        )

    model_family = _normalize_model_family(model_family)
    forecast_start = _normalize_forecast_start(forecast_start)
    latitude = _normalize_coordinate(latitude)
    longitude = _normalize_coordinate(longitude)

    loaded = _load_transformer(dataset=dataset, model_family=model_family)
    lookback_start, lookback_end, expected_index = _lookback_bounds(
        forecast_start=forecast_start,
        window_size=loaded.config.window_size,
    )

    with psycopg2.connect(database_url, connect_timeout=5) as connection:
        _ensure_forecast_tables(connection)
        weather_frame = _fetch_weather_frame(
            connection=connection,
            dataset=dataset,
            latitude=latitude,
            longitude=longitude,
            expected_index=expected_index,
        )

        model_input, target_scaler = _build_input_matrix(
            dataset=dataset,
            weather_frame=weather_frame,
            target_override=None,
        )

        prediction_scaled = _run_model(loaded=loaded, model_input=model_input)
        prediction_values = target_scaler.inverse_transform(prediction_scaled).reshape(-1)

        prediction_index = _prediction_timestamps(
            forecast_start=forecast_start,
            horizon=loaded.config.horizon,
        )
        prediction_points = list(zip(prediction_index.to_pydatetime(), prediction_values.tolist(), strict=True))

        run_id = _persist_forecast(
            connection=connection,
            dataset=dataset,
            model_family=model_family,
            forecast_start=forecast_start,
            lookback_start=lookback_start,
            lookback_end=lookback_end,
            latitude=latitude,
            longitude=longitude,
            target_feature=_dataset_target(dataset),
            predictions=prediction_points,
        )

    return _build_response(
        run_id=run_id,
        dataset=dataset,
        model_family=model_family,
        target_feature=_dataset_target(dataset),
        forecast_start=forecast_start,
        lookback_start=lookback_start,
        lookback_end=lookback_end,
        predictions=prediction_points,
    )


def forecast_demand_with_upload(
    *,
    database_url: str,
    forecast_start: datetime,
    latitude: float,
    longitude: float,
    demand_csv_bytes: bytes,
    model_family: str = "transformer",
) -> dict[str, Any]:
    dataset = "demand"
    model_family = _normalize_model_family(model_family)
    forecast_start = _normalize_forecast_start(forecast_start)
    latitude = _normalize_coordinate(latitude)
    longitude = _normalize_coordinate(longitude)

    loaded = _load_transformer(dataset=dataset, model_family=model_family)
    lookback_start, lookback_end, expected_index = _lookback_bounds(
        forecast_start=forecast_start,
        window_size=loaded.config.window_size,
    )

    demand_frame = _parse_demand_csv(demand_csv_bytes, expected_index=expected_index)

    with psycopg2.connect(database_url, connect_timeout=5) as connection:
        _ensure_forecast_tables(connection)
        _ensure_demand_series_table(connection)
        _upsert_demand_series(
            connection=connection,
            latitude=latitude,
            longitude=longitude,
            demand_frame=demand_frame,
        )
        demand_from_db = _fetch_demand_series(
            connection=connection,
            latitude=latitude,
            longitude=longitude,
            expected_index=expected_index,
        )
        _validate_no_missing(
            demand_from_db,
            ["TOTAL"],
            context="demand target series from database",
        )

        weather_frame = _fetch_weather_frame(
            connection=connection,
            dataset=dataset,
            latitude=latitude,
            longitude=longitude,
            expected_index=expected_index,
        )

        model_input, target_scaler = _build_input_matrix(
            dataset=dataset,
            weather_frame=weather_frame,
            target_override=demand_from_db["TOTAL"],
        )

        prediction_scaled = _run_model(loaded=loaded, model_input=model_input)
        prediction_values = target_scaler.inverse_transform(prediction_scaled).reshape(-1)

        prediction_index = _prediction_timestamps(
            forecast_start=forecast_start,
            horizon=loaded.config.horizon,
        )
        prediction_points = list(zip(prediction_index.to_pydatetime(), prediction_values.tolist(), strict=True))

        run_id = _persist_forecast(
            connection=connection,
            dataset=dataset,
            model_family=model_family,
            forecast_start=forecast_start,
            lookback_start=lookback_start,
            lookback_end=lookback_end,
            latitude=latitude,
            longitude=longitude,
            target_feature=_dataset_target(dataset),
            predictions=prediction_points,
        )

    return _build_response(
        run_id=run_id,
        dataset=dataset,
        model_family=model_family,
        target_feature=_dataset_target(dataset),
        forecast_start=forecast_start,
        lookback_start=lookback_start,
        lookback_end=lookback_end,
        predictions=prediction_points,
    )
