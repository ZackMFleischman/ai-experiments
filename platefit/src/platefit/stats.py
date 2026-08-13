"""Precision and accuracy statistics.

STAGE 1 STUB -- signatures and plumbing only. Real %CV / recovery and the
variance-component ANOVA land in the final stage.
"""

from __future__ import annotations

import pandas as pd


def precision_recovery(results_df: pd.DataFrame) -> pd.DataFrame:
    """STUB: one row per sample group, statistics left blank."""
    columns = ["group", "nominal", "n", "mean", "sd", "cv_percent", "recovery_percent"]
    if results_df.empty:
        return pd.DataFrame(columns=columns)
    rows = [
        {"group": group, "nominal": frame["nominal"].iloc[0], "n": len(frame)}
        for group, frame in results_df.groupby("group", sort=False)
    ]
    return pd.DataFrame(rows).reindex(columns=columns)


def accuracy_vs_reference(
    all_plates_df: pd.DataFrame, reference: pd.DataFrame | None = None
) -> pd.DataFrame:
    """STUB: one row per level, accuracy left blank."""
    columns = ["group", "reference_value", "reference_source", "n_total", "grand_mean", "recovery_percent"]
    if all_plates_df.empty:
        return pd.DataFrame(columns=columns)
    rows = [{"group": group, "n_total": len(frame)} for group, frame in all_plates_df.groupby("group", sort=False)]
    return pd.DataFrame(rows).reindex(columns=columns)


def intermediate_precision(all_plates_df: pd.DataFrame) -> pd.DataFrame:
    """STUB: one row per concentration level, variance components left blank."""
    columns = [
        "group",
        "nominal",
        "n_plates",
        "n_total",
        "grand_mean",
        "repeatability_cv_percent",
        "between_run_cv_percent",
        "intermediate_precision_cv_percent",
    ]
    if all_plates_df.empty:
        return pd.DataFrame(columns=columns)
    rows = [
        {
            "group": group,
            "nominal": frame["nominal"].iloc[0],
            "n_plates": frame["plate_id"].nunique(),
            "n_total": len(frame),
        }
        for group, frame in all_plates_df.groupby("group", sort=False)
    ]
    return pd.DataFrame(rows).reindex(columns=columns)
