"""Precision and accuracy statistics.

Within-run precision is a plain %CV over replicate wells. Across runs, a one-way
random-effects model is fitted per concentration level with ``plate_id`` as the
grouping factor, and the ANOVA table is used to **extract variance components**
rather than to test whether the plate means differ:

.. code-block:: text

    repeatability (within-run) variance = MS_within
    between-run variance                = max((MS_between - MS_within) / n_eff, 0)
    intermediate precision              = sqrt(within + between)

with, for unbalanced designs (unequal replicates per plate),

.. code-block:: text

    n_eff = (N - sum(n_i^2) / N) / (k - 1)

which collapses to the common replicate count when the design is balanced.
statsmodels produces the ANOVA table; the components are computed here from the
mean squares so the partitioning is explicit and reconcilable against JMP's
Variance Components report. A negative between-run estimate (MS_between below
MS_within, which happens when the true between-run effect is near zero) is
truncated at zero and flagged in ``notes``.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf

#: Well statuses treated as usable measurements.
IN_RANGE = "in_range"

PRECISION_COLUMNS = [
    "group",
    "nominal",
    "n",
    "n_wells",
    "mean",
    "sd",
    "cv_percent",
    "recovery_percent",
    "bias_percent",
    "min",
    "max",
    "notes",
]

INTERMEDIATE_COLUMNS = [
    "group",
    "nominal",
    "n_plates",
    "n_total",
    "n_effective",
    "grand_mean",
    "recovery_percent",
    "df_between",
    "df_within",
    "ms_between",
    "ms_within",
    "var_within",
    "var_between",
    "var_total",
    "repeatability_sd",
    "repeatability_cv_percent",
    "between_run_sd",
    "between_run_cv_percent",
    "intermediate_precision_sd",
    "intermediate_precision_cv_percent",
    "percent_variance_between",
    "anova_source",
    "notes",
]

ACCURACY_COLUMNS = [
    "group",
    "reference_value",
    "reference_source",
    "n_plates",
    "n_total",
    "grand_mean",
    "sd",
    "cv_percent",
    "recovery_percent",
    "bias_percent",
    "notes",
]


def usable_wells(frame: pd.DataFrame, include_out_of_range: bool = False) -> pd.DataFrame:
    """Rows with a finite concentration, optionally keeping out-of-range wells."""
    out = frame.copy()
    if "concentration" not in out.columns:
        raise ValueError("results frame is missing the 'concentration' column")
    out["concentration"] = pd.to_numeric(out["concentration"], errors="coerce")
    if not include_out_of_range and "status" in out.columns:
        out = out[out["status"] == IN_RANGE]
    return out[np.isfinite(out["concentration"])]


def _first_nominal(frame: pd.DataFrame) -> float:
    if "nominal" not in frame.columns:
        return float("nan")
    values = pd.to_numeric(frame["nominal"], errors="coerce").dropna()
    return float(values.iloc[0]) if not values.empty else float("nan")


def _percent(numerator: float, denominator: float) -> float:
    """100 * numerator / denominator, or NaN when the denominator is unusable."""
    if not np.isfinite(numerator) or not np.isfinite(denominator) or denominator == 0:
        return float("nan")
    return 100.0 * numerator / denominator


def _sort_by_level(frame: pd.DataFrame) -> pd.DataFrame:
    """Highest nominal first, unknowns (no nominal) last, then alphabetical."""
    if frame.empty:
        return frame
    out = frame.copy()
    out["_has_nominal"] = out["nominal"].notna() if "nominal" in out.columns else False
    sort_columns = ["_has_nominal", "nominal", "group"] if "nominal" in out.columns else ["group"]
    ascending = [False, False, True] if "nominal" in out.columns else [True]
    out = out.sort_values(sort_columns, ascending=ascending, kind="stable")
    return out.drop(columns="_has_nominal").reset_index(drop=True)


def precision_recovery(
    results_df: pd.DataFrame, include_out_of_range: bool = False
) -> pd.DataFrame:
    """Within-run precision and recovery, one row per replicate group.

    Groups sample wells by ``group`` (replicates of one nominal level) and
    returns mean, SD, %CV (``100 * SD / mean``), % recovery
    (``100 * mean / nominal``) and n. Out-of-range wells are excluded from the
    statistics by default but still counted in ``n_wells``, so a level that lost
    replicates is visible.
    """
    if results_df is None or results_df.empty:
        return pd.DataFrame(columns=PRECISION_COLUMNS)
    if "group" not in results_df.columns:
        raise ValueError("results frame is missing the 'group' column")

    usable = usable_wells(results_df, include_out_of_range)
    rows = []
    for group, frame in results_df.groupby("group", sort=False):
        values = usable.loc[usable["group"] == group, "concentration"]
        nominal = _first_nominal(frame)
        n = int(values.size)
        mean = float(values.mean()) if n else float("nan")
        sd = float(values.std(ddof=1)) if n > 1 else float("nan")
        notes = []
        if n < len(frame):
            notes.append(f"{len(frame) - n} of {len(frame)} well(s) excluded (out of range or no value)")
        if n == 1:
            notes.append("single usable replicate: no SD or %CV")
        rows.append(
            {
                "group": group,
                "nominal": nominal,
                "n": n,
                "n_wells": int(len(frame)),
                "mean": mean,
                "sd": sd,
                "cv_percent": _percent(sd, mean),
                "recovery_percent": _percent(mean, nominal),
                "bias_percent": _percent(mean - nominal, nominal),
                "min": float(values.min()) if n else float("nan"),
                "max": float(values.max()) if n else float("nan"),
                "notes": "; ".join(notes),
            }
        )
    return _sort_by_level(pd.DataFrame(rows, columns=PRECISION_COLUMNS))


def _mean_squares(frame: pd.DataFrame) -> dict[str, float | str]:
    """One-way ANOVA mean squares for concentration by plate_id.

    statsmodels builds the table whenever it has residual degrees of freedom;
    the explicit sums-of-squares fallback covers designs it cannot fit (a single
    plate, or one replicate per plate). Both paths compute the same quantities --
    the fallback exists so the caller always gets numbers, not an exception.
    """
    values = frame["concentration"].to_numpy(dtype=float)
    plates = frame["plate_id"].astype(str).to_numpy()
    counts = pd.Series(values).groupby(plates).size().to_numpy(dtype=float)
    k = int(counts.size)
    n_total = int(values.size)
    df_between = k - 1
    df_within = n_total - k

    grand_mean = float(values.mean())
    plate_means = pd.Series(values).groupby(plates).mean()
    ss_between = float(np.sum(counts * (plate_means.to_numpy(dtype=float) - grand_mean) ** 2))
    ss_within = float(np.sum((values - pd.Series(values).groupby(plates).transform("mean").to_numpy()) ** 2))

    source = "explicit_sums_of_squares"
    if df_between >= 1 and df_within >= 1:
        model = smf.ols("concentration ~ C(plate_id)", data=frame.assign(plate_id=plates)).fit()
        table = sm.stats.anova_lm(model, typ=2)
        ss_between = float(table.loc["C(plate_id)", "sum_sq"])
        ss_within = float(table.loc["Residual", "sum_sq"])
        df_between = int(table.loc["C(plate_id)", "df"])
        df_within = int(table.loc["Residual", "df"])
        source = "statsmodels_anova_lm_typ2"

    return {
        "k": k,
        "n_total": n_total,
        "counts": counts,
        "grand_mean": grand_mean,
        "df_between": df_between,
        "df_within": df_within,
        "ms_between": ss_between / df_between if df_between >= 1 else float("nan"),
        "ms_within": ss_within / df_within if df_within >= 1 else float("nan"),
        "anova_source": source,
    }


def intermediate_precision(all_plates_df: pd.DataFrame, include_out_of_range: bool = False) -> pd.DataFrame:
    """Variance components across plates, one row per concentration level.

    ``all_plates_df`` spans several plates at the same levels and needs
    ``plate_id``, ``group`` and ``concentration`` columns (``nominal`` optional).
    Returns repeatability, between-run and intermediate precision as SDs and as
    %CV of the grand mean, alongside the mean squares and effective n they came
    from, so every number can be traced back to the ANOVA table.
    """
    if all_plates_df is None or all_plates_df.empty:
        return pd.DataFrame(columns=INTERMEDIATE_COLUMNS)
    for column in ("plate_id", "group"):
        if column not in all_plates_df.columns:
            raise ValueError(f"results frame is missing the {column!r} column")

    usable = usable_wells(all_plates_df, include_out_of_range)
    rows = []
    for group, frame in usable.groupby("group", sort=False):
        nominal = _first_nominal(frame)
        notes: list[str] = []
        anova = _mean_squares(frame)
        k, n_total = int(anova["k"]), int(anova["n_total"])
        counts = np.asarray(anova["counts"], dtype=float)
        grand_mean = float(anova["grand_mean"])
        ms_between, ms_within = float(anova["ms_between"]), float(anova["ms_within"])

        # Effective replicates per plate; equals n when the design is balanced.
        n_effective = float("nan")
        if k >= 2:
            n_effective = (n_total - float(np.sum(counts**2)) / n_total) / (k - 1)
        if k < 2:
            notes.append("only one plate at this level: between-run variance is not estimable")
        if not np.isfinite(ms_within):
            notes.append("no within-plate replicates: repeatability is not estimable")
        if len(set(counts.tolist())) > 1:
            notes.append(f"unbalanced design (n per plate: {', '.join(str(int(c)) for c in counts)})")

        var_within = ms_within
        var_between = float("nan")
        if k >= 2 and np.isfinite(ms_between) and np.isfinite(ms_within) and n_effective > 0:
            raw_between = (ms_between - ms_within) / n_effective
            var_between = max(raw_between, 0.0)
            if raw_between < 0:
                notes.append(
                    "MS_between < MS_within: negative between-run variance truncated to 0"
                )
        var_total = var_within + var_between if np.isfinite(var_within) and np.isfinite(var_between) else float("nan")

        repeatability_sd = float(np.sqrt(var_within)) if np.isfinite(var_within) else float("nan")
        between_sd = float(np.sqrt(var_between)) if np.isfinite(var_between) else float("nan")
        ip_sd = float(np.sqrt(var_total)) if np.isfinite(var_total) else float("nan")

        rows.append(
            {
                "group": group,
                "nominal": nominal,
                "n_plates": k,
                "n_total": n_total,
                "n_effective": n_effective,
                "grand_mean": grand_mean,
                "recovery_percent": _percent(grand_mean, nominal),
                "df_between": anova["df_between"],
                "df_within": anova["df_within"],
                "ms_between": ms_between,
                "ms_within": ms_within,
                "var_within": var_within,
                "var_between": var_between,
                "var_total": var_total,
                "repeatability_sd": repeatability_sd,
                "repeatability_cv_percent": _percent(repeatability_sd, grand_mean),
                "between_run_sd": between_sd,
                "between_run_cv_percent": _percent(between_sd, grand_mean),
                "intermediate_precision_sd": ip_sd,
                "intermediate_precision_cv_percent": _percent(ip_sd, grand_mean),
                "percent_variance_between": _percent(var_between, var_total),
                "anova_source": anova["anova_source"],
                "notes": "; ".join(notes),
            }
        )
    return _sort_by_level(pd.DataFrame(rows, columns=INTERMEDIATE_COLUMNS))


def accuracy_vs_reference(
    all_plates_df: pd.DataFrame,
    reference: pd.DataFrame | None = None,
    include_out_of_range: bool = False,
) -> pd.DataFrame:
    """Pooled accuracy per level against a reference or nominal value.

    ``reference`` is an optional frame of ``group`` / ``reference_value`` /
    ``reference_source`` (see :func:`platefit.io.load_reference`). Levels absent
    from it fall back to the nominal concentration carried in the results.
    """
    if all_plates_df is None or all_plates_df.empty:
        return pd.DataFrame(columns=ACCURACY_COLUMNS)
    if "group" not in all_plates_df.columns:
        raise ValueError("results frame is missing the 'group' column")

    lookup: dict[str, tuple[float, str]] = {}
    if reference is not None and not reference.empty:
        for record in reference.to_dict(orient="records"):
            lookup[str(record["group"])] = (
                float(record["reference_value"]),
                str(record.get("reference_source", "reference")),
            )

    usable = usable_wells(all_plates_df, include_out_of_range)
    rows = []
    for group, frame in usable.groupby("group", sort=False):
        nominal = _first_nominal(frame)
        value, source = lookup.get(str(group), (nominal, "nominal"))
        notes = []
        if str(group) not in lookup and reference is not None and not reference.empty:
            notes.append("not in the reference set: compared against the template nominal")
        if not np.isfinite(value):
            notes.append("no reference or nominal value: recovery not computed")
        values = frame["concentration"]
        mean = float(values.mean())
        sd = float(values.std(ddof=1)) if values.size > 1 else float("nan")
        rows.append(
            {
                "group": group,
                "reference_value": value,
                "reference_source": source,
                "n_plates": int(frame["plate_id"].nunique()) if "plate_id" in frame.columns else 1,
                "n_total": int(values.size),
                "grand_mean": mean,
                "sd": sd,
                "cv_percent": _percent(sd, mean),
                "recovery_percent": _percent(mean, value),
                "bias_percent": _percent(mean - value, value),
                "notes": "; ".join(notes),
            }
        )
    out = pd.DataFrame(rows, columns=ACCURACY_COLUMNS)
    out["nominal"] = out["reference_value"]
    out = _sort_by_level(out)
    return out.drop(columns="nominal")
