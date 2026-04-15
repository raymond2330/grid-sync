#!/usr/bin/env python3
"""CLI helper to ensure NASA POWER lookback coverage in PostgreSQL."""

from __future__ import annotations

import argparse
import os
from datetime import UTC, datetime

try:
    from app.nasa_parameters import SUPPORTED_DATASETS
    from app.services.nasa_power import NASAServiceError, ensure_dataset_lookback
except ModuleNotFoundError:
    from backend.app.nasa_parameters import SUPPORTED_DATASETS
    from backend.app.services.nasa_power import NASAServiceError, ensure_dataset_lookback


def _parse_forecast_start(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "forecast-start must be ISO-8601, e.g. 2026-04-16T00:00:00Z"
        ) from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Ensure NASA POWER lookback data exists in PostgreSQL and fetch only missing coverage."
        )
    )
    parser.add_argument("--forecast-start", type=_parse_forecast_start, required=True)
    parser.add_argument("--latitude", type=float, required=True)
    parser.add_argument("--longitude", type=float, required=True)
    parser.add_argument("--lookback-days", type=int, default=7)
    parser.add_argument(
        "--datasets",
        nargs="+",
        choices=SUPPORTED_DATASETS,
        default=list(SUPPORTED_DATASETS),
    )
    parser.add_argument("--community", choices=["RE", "AG", "SB"], default="RE")
    parser.add_argument("--timezone", choices=["UTC", "LST"], default="UTC")
    parser.add_argument("--timeout-seconds", type=int, default=120)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        print("[error] DATABASE_URL is missing")
        return 1

    has_failure = False
    for dataset in args.datasets:
        try:
            result = ensure_dataset_lookback(
                database_url=database_url,
                dataset=dataset,
                forecast_start=args.forecast_start,
                latitude=args.latitude,
                longitude=args.longitude,
                lookback_days=args.lookback_days,
                community=args.community,
                timezone=args.timezone,
                timeout=args.timeout_seconds,
            )
        except (NASAServiceError, ValueError) as exc:
            has_failure = True
            print(f"[error] {dataset}: {exc}")
            continue

        print(
            "[ok] "
            f"{dataset}: fetched={result['fetched']} "
            f"existing={result['existing_points']} "
            f"missing={result['missing_points']} "
            f"upserted={result['upserted_rows']}"
        )

    return 1 if has_failure else 0


if __name__ == "__main__":
    raise SystemExit(main())
