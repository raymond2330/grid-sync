"""Shared pytest behavior for backend tests."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime

import pytest


TEST_LOGGER = logging.getLogger("grid_sync.tests")
FLOW_LOGGER = logging.getLogger("grid_sync.tests.flow")


@pytest.fixture(autouse=True)
def log_test_lifecycle(request: pytest.FixtureRequest):
    """Emit explicit lifecycle messages so test runs show active progress."""
    TEST_LOGGER.info("START %s", request.node.nodeid)
    yield
    TEST_LOGGER.info("END %s", request.node.nodeid)


def _json_default(value: object) -> object:
    if isinstance(value, datetime):
        return value.isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:  # noqa: BLE001
            return str(value)
    return str(value)


@pytest.fixture
def flow_trace():
    """Emit structured, test-only data-flow snapshots to pytest output."""

    def _flow_trace(step: str, **payload: object) -> None:
        FLOW_LOGGER.info(
            "FLOW_TRACE %s\n%s",
            step,
            json.dumps(payload, indent=2, sort_keys=True, default=_json_default),
        )

    return _flow_trace