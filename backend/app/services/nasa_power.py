"""Business logic for NASA POWER lookback ingestion and persistence."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

try:
    from app.nasa_parameters import (
        DATASET_COLUMNS,
        NON_NASA_COLUMNS,
        SUPPORTED_DATASETS,
        TARGET_FEATURE_BY_DATASET,
        WEATHER_EXOGENOUS_COLUMNS,
    )
except ModuleNotFoundError:
    from backend.app.nasa_parameters import (
        DATASET_COLUMNS,
        NON_NASA_COLUMNS,
        SUPPORTED_DATASETS,
        TARGET_FEATURE_BY_DATASET,
        WEATHER_EXOGENOUS_COLUMNS,
    )

NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/hourly/point"
SUPPORTED_COMMUNITIES = {"RE", "AG", "SB"}
SUPPORTED_TIMEZONES = {"UTC", "LST"}
WEATHER_EXOGENOUS_DATASET = "weather"
NASA_POWER_MAX_PARAMETERS_PER_REQUEST = 12


class NASAServiceError(RuntimeError):
    """Raised when NASA POWER data acquisition or parsing fails."""


def _normalize_forecast_start(forecast_start: datetime) -> datetime:
    if forecast_start.tzinfo is None:
        forecast_start = forecast_start.replace(tzinfo=UTC)
    else:
        forecast_start = forecast_start.astimezone(UTC)

    if forecast_start.second != 0 or forecast_start.microsecond != 0:
        raise ValueError("forecast_start must not include seconds or microseconds")
    if forecast_start.minute % 5 != 0:
        raise ValueError("forecast_start must be aligned to a 5-minute boundary")

    return forecast_start


def _compute_window(forecast_start: datetime, lookback_days: int) -> tuple[datetime, datetime, int]:
    if lookback_days <= 0:
        raise ValueError("lookback_days must be greater than 0")

    lookback_start = forecast_start - timedelta(days=lookback_days)
    lookback_end = forecast_start - timedelta(minutes=5)
    expected_points = lookback_days * 24 * 12
    return lookback_start, lookback_end, expected_points


def _normalize_coordinate(value: float) -> float:
    return round(float(value), 6)


def _dataset_nasa_columns(dataset: str) -> list[str]:
    return [column for column in DATASET_COLUMNS[dataset] if column not in NON_NASA_COLUMNS]


def _chunk_columns(columns: list[str], chunk_size: int) -> list[list[str]]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than 0")
    return [columns[index : index + chunk_size] for index in range(0, len(columns), chunk_size)]


def _ensure_nasa_power_table(connection: psycopg2.extensions.connection) -> None:
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS "NASAPower" (
        exog_id BIGSERIAL PRIMARY KEY,
        dataset TEXT NOT NULL DEFAULT 'weather',
        timestamp TIMESTAMPTZ NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        source TEXT NOT NULL DEFAULT 'NASA POWER',
        community TEXT NOT NULL DEFAULT 'RE',
        time_standard TEXT NOT NULL DEFAULT 'UTC',
        target_feature TEXT,
        features JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (dataset, timestamp, latitude, longitude)
    );

    CREATE INDEX IF NOT EXISTS idx_nasa_power_dataset_timestamp
        ON "NASAPower" (dataset, timestamp);

    CREATE INDEX IF NOT EXISTS idx_nasa_power_lookup
        ON "NASAPower" (dataset, latitude, longitude, timestamp);
    """

    with connection.cursor() as cursor:
        cursor.execute(create_table_sql)
        cursor.execute('ALTER TABLE "NASAPower" ALTER COLUMN features DROP NOT NULL;')
        for column in WEATHER_EXOGENOUS_COLUMNS:
            cursor.execute(
                f'ALTER TABLE "NASAPower" ADD COLUMN IF NOT EXISTS "{column}" DOUBLE PRECISION;'
            )
    connection.commit()


def _coverage_stats(
    connection: psycopg2.extensions.connection,
    latitude: float,
    longitude: float,
    lookback_start: datetime,
    lookback_end: datetime,
    required_columns: list[str],
) -> tuple[int, int]:
    required_not_null = " AND ".join(f'w."{column}" IS NOT NULL' for column in required_columns)
    required_any_null = " OR ".join(f'w."{column}" IS NULL' for column in required_columns)

    existing_query = """
    SELECT COUNT(*)::int
    FROM "NASAPower" w
    WHERE dataset = %s
      AND latitude = %s
      AND longitude = %s
      AND timestamp BETWEEN %s AND %s
      AND {required_not_null}
    """.format(required_not_null=required_not_null)

    missing_query = """
    SELECT COUNT(*)::int
    FROM generate_series(%s::timestamptz, %s::timestamptz, interval '5 minutes') AS gs(ts)
    LEFT JOIN "NASAPower" w
      ON w.dataset = %s
     AND w.latitude = %s
     AND w.longitude = %s
     AND w.timestamp = gs.ts
    WHERE w.exog_id IS NULL OR ({required_any_null})
    """.format(required_any_null=required_any_null)

    with connection.cursor() as cursor:
        cursor.execute(
            existing_query,
            (WEATHER_EXOGENOUS_DATASET, latitude, longitude, lookback_start, lookback_end),
        )
        existing_points = cursor.fetchone()[0]

        cursor.execute(
            missing_query,
            (lookback_start, lookback_end, WEATHER_EXOGENOUS_DATASET, latitude, longitude),
        )
        missing_points = cursor.fetchone()[0]

    return int(existing_points), int(missing_points)


def _fetch_hourly_frame(
    dataset: str,
    latitude: float,
    longitude: float,
    request_start: datetime,
    request_end: datetime,
    community: str,
    timezone: str,
    timeout: int,
) -> pd.DataFrame:
    nasa_columns = list(WEATHER_EXOGENOUS_COLUMNS)
    series_by_column: dict[str, pd.Series] = {}

    for chunk in _chunk_columns(nasa_columns, NASA_POWER_MAX_PARAMETERS_PER_REQUEST):
        query = {
            "parameters": ",".join(chunk),
            "community": community,
            "longitude": longitude,
            "latitude": latitude,
            "start": request_start.strftime("%Y%m%d"),
            "end": request_end.strftime("%Y%m%d"),
            "format": "JSON",
            "time-standard": timezone,
        }
        request_url = f"{NASA_POWER_URL}?{urlencode(query)}"

        try:
            with urlopen(request_url, timeout=timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise NASAServiceError(
                f"NASA POWER request failed with status {exc.code}"
            ) from exc
        except URLError as exc:
            raise NASAServiceError(f"NASA POWER request failed: {exc}") from exc

        parameter_values = payload.get("properties", {}).get("parameter", {})
        if not isinstance(parameter_values, dict):
            raise NASAServiceError("NASA POWER response did not contain parameter data")

        for column in chunk:
            raw_values = parameter_values.get(column, {})
            if not isinstance(raw_values, dict):
                raw_values = {}

            series = pd.Series(raw_values, name=column)
            if series.empty:
                series_by_column[column] = pd.Series(dtype="float64")
                continue

            parsed_index = pd.to_datetime(series.index, format="%Y%m%d%H", errors="coerce", utc=True)
            series = pd.to_numeric(series, errors="coerce")
            series.index = parsed_index
            series = series[~series.index.isna()]

            # NASA POWER uses <= -900 as missing-value sentinels.
            series = series.mask(series <= -900)
            series_by_column[column] = series

    if not series_by_column:
        return pd.DataFrame()

    frame = pd.DataFrame(series_by_column).sort_index()
    frame.index.name = "timestamp"
    return frame


def _interpolate_to_five_min(
    hourly_frame: pd.DataFrame,
    lookback_start: datetime,
    forecast_start: datetime,
) -> pd.DataFrame:
    hourly_start = pd.Timestamp(lookback_start).floor("h")
    hourly_end = pd.Timestamp(forecast_start).ceil("h")
    hourly_index = pd.date_range(start=hourly_start, end=hourly_end, freq="h", tz=UTC)

    if hourly_frame.empty:
        aligned = pd.DataFrame(index=hourly_index)
    else:
        aligned = hourly_frame.reindex(hourly_index)

    full_index = pd.date_range(
        start=pd.Timestamp(lookback_start),
        end=pd.Timestamp(forecast_start),
        freq="5min",
        tz=UTC,
    )

    if aligned.shape[1] == 0:
        interpolated = pd.DataFrame(index=full_index)
        interpolated.index.name = "timestamp"
        return interpolated

    merged_index = aligned.index.union(full_index)
    interpolated = aligned.reindex(merged_index).sort_index()
    interpolated = interpolated.interpolate(method="time").ffill().bfill()
    interpolated = interpolated.reindex(full_index)
    interpolated.index.name = "timestamp"
    return interpolated


def _build_rows_for_upsert(
    frame: pd.DataFrame,
    latitude: float,
    longitude: float,
    community: str,
    timezone: str,
) -> list[tuple[Any, ...]]:
    rows: list[tuple[Any, ...]] = []
    for timestamp, values in frame.iterrows():
        rows.append(
            (
                WEATHER_EXOGENOUS_DATASET,
                timestamp.to_pydatetime(),
                latitude,
                longitude,
                community,
                timezone,
                None,
                None,
                *[
                    float(values[column]) if column in values.index and pd.notna(values[column]) else None
                    for column in WEATHER_EXOGENOUS_COLUMNS
                ],
            )
        )

    return rows


def _upsert_weather_rows(
    connection: psycopg2.extensions.connection,
    rows: list[tuple[Any, ...]],
) -> int:
    if not rows:
        return 0

    feature_column_names = ",\n        ".join(f'"{column}"' for column in WEATHER_EXOGENOUS_COLUMNS)
    feature_assignments = ",\n        ".join(
        f'"{column}" = EXCLUDED."{column}"' for column in WEATHER_EXOGENOUS_COLUMNS
    )

    upsert_query = """
    INSERT INTO "NASAPower" (
        dataset,
        timestamp,
        latitude,
        longitude,
        community,
        time_standard,
        target_feature,
        features,
        {feature_columns}
    )
    VALUES %s
    ON CONFLICT (dataset, timestamp, latitude, longitude)
    DO UPDATE SET
        community = EXCLUDED.community,
        time_standard = EXCLUDED.time_standard,
        target_feature = EXCLUDED.target_feature,
        features = EXCLUDED.features,
        {feature_assignments},
        updated_at = NOW()
    """

    with connection.cursor() as cursor:
        execute_values(
            cursor,
            upsert_query.format(
                feature_columns=feature_column_names,
                feature_assignments=feature_assignments,
            ),
            rows,
            page_size=500,
        )
    connection.commit()
    return len(rows)


def ensure_dataset_lookback(
    *,
    database_url: str,
    dataset: str,
    forecast_start: datetime,
    latitude: float,
    longitude: float,
    lookback_days: int = 7,
    community: str = "RE",
    timezone: str = "UTC",
    timeout: int = 120,
) -> dict[str, Any]:
    if dataset not in SUPPORTED_DATASETS:
        raise ValueError(f"Unsupported dataset: {dataset}")
    if community not in SUPPORTED_COMMUNITIES:
        raise ValueError(f"Unsupported NASA community: {community}")
    if timezone not in SUPPORTED_TIMEZONES:
        raise ValueError(f"Unsupported NASA time standard: {timezone}")

    forecast_start = _normalize_forecast_start(forecast_start)
    lookback_start, lookback_end, expected_points = _compute_window(
        forecast_start=forecast_start,
        lookback_days=lookback_days,
    )

    latitude = _normalize_coordinate(latitude)
    longitude = _normalize_coordinate(longitude)

    with psycopg2.connect(database_url, connect_timeout=5) as connection:
        _ensure_nasa_power_table(connection)
        required_columns = _dataset_nasa_columns(dataset)

        existing_points, missing_points = _coverage_stats(
            connection=connection,
            latitude=latitude,
            longitude=longitude,
            lookback_start=lookback_start,
            lookback_end=lookback_end,
            required_columns=required_columns,
        )

        if missing_points == 0 and existing_points >= expected_points:
            return {
                "dataset": dataset,
                "target_feature": TARGET_FEATURE_BY_DATASET.get(dataset),
                "lookback_start": lookback_start,
                "lookback_end": lookback_end,
                "expected_points": expected_points,
                "existing_points": existing_points,
                "missing_points": 0,
                "fetched": False,
                "upserted_rows": 0,
            }

        hourly_frame = _fetch_hourly_frame(
            dataset=dataset,
            latitude=latitude,
            longitude=longitude,
            request_start=lookback_start,
            request_end=forecast_start,
            community=community,
            timezone=timezone,
            timeout=timeout,
        )

        interpolated = _interpolate_to_five_min(
            hourly_frame=hourly_frame,
            lookback_start=lookback_start,
            forecast_start=forecast_start,
        )

        store_window = interpolated[
            (interpolated.index >= pd.Timestamp(lookback_start))
            & (interpolated.index <= pd.Timestamp(lookback_end))
        ]

        rows = _build_rows_for_upsert(
            frame=store_window,
            latitude=latitude,
            longitude=longitude,
            community=community,
            timezone=timezone,
        )
        upserted_rows = _upsert_weather_rows(connection=connection, rows=rows)

        final_existing, final_missing = _coverage_stats(
            connection=connection,
            latitude=latitude,
            longitude=longitude,
            lookback_start=lookback_start,
            lookback_end=lookback_end,
            required_columns=required_columns,
        )

    return {
        "dataset": dataset,
        "target_feature": TARGET_FEATURE_BY_DATASET.get(dataset),
        "lookback_start": lookback_start,
        "lookback_end": lookback_end,
        "expected_points": expected_points,
        "existing_points": final_existing,
        "missing_points": final_missing,
        "fetched": True,
        "upserted_rows": upserted_rows,
    }
