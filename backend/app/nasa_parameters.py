"""Dataset parameter mappings for NASA POWER-backed forecasting inputs."""

from __future__ import annotations

from typing import Final

DATASET_COLUMNS: Final[dict[str, list[str]]] = {
    "demand": [
        "DATETIME",
        "TOTAL",
        "T2MWET",
        "T2M",
        "TS",
        "QV2M",
        "T2MDEW",
        "CLRSKY_SFC_LW_DWN",
        "QV10M",
        "PS",
        "ALLSKY_SFC_LW_DWN",
        "PW",
    ],
    "price": [
        "DATETIME",
        "RTD_LMP_SMP",
        "T2M",
        "TS",
        "ALLSKY_SFC_UV_INDEX",
        "ALLSKY_SFC_UVB",
        "RH2M",
        "ALLSKY_SFC_UVA",
        "T2MWET",
        "ALLSKY_SFC_PAR_TOT",
        "ALLSKY_SFC_SW_DWN",
        "PRECTOTCORR",
    ],
    "solar": [
        "DATETIME",
        "ALLSKY_SFC_SW_DWN",
        "ALLSKY_SFC_PAR_TOT",
        "ALLSKY_SFC_UVA",
        "ALLSKY_SFC_UVB",
        "ALLSKY_SFC_UV_INDEX",
        "ALLSKY_KT",
        "ALLSKY_SFC_SW_DNI",
        "ALLSKY_NKT",
        "CLRSKY_SFC_SW_DWN",
        "CLRSKY_SFC_PAR_TOT",
        "CLRSKY_SFC_SW_DNI",
    ],
    "wind": [
        "DATETIME",
        "WS50M",
        "WS10M",
        "WS2M",
        "U2M",
        "U50M",
        "U10M",
        "T2M",
        "TS",
        "T2MWET",
        "CLRSKY_SFC_LW_DWN",
        "V50M",
    ],
    "temperature": [
        "DATETIME",
        "T2M",
        "TS",
        "T2MWET",
        "CLRSKY_SFC_LW_DWN",
        "RH2M",
        "ALLSKY_SFC_LW_DWN",
        "WS2M",
        "WS50M",
        "WS10M",
        "V50M",
        "QV2M",
    ],
}

TARGET_FEATURE_BY_DATASET: Final[dict[str, str]] = {
    "demand": "TOTAL",
    "price": "RTD_LMP_SMP",
    "solar": "ALLSKY_SFC_SW_DWN",
    "wind": "WS50M",
    "temperature": "T2M",
}

NON_NASA_COLUMNS: Final[set[str]] = {"DATETIME", "TOTAL", "RTD_LMP_SMP"}
SUPPORTED_DATASETS: Final[tuple[str, ...]] = tuple(DATASET_COLUMNS.keys())
