"""Statistics tests, checked against values worked out by hand.

The point of these is reconciliation: every variance component below is derived
on paper in the comments, so a disagreement with JMP can be traced to a
definition rather than to an implementation detail.
"""

import numpy as np
import pandas as pd
import pytest

from platefit.stats import (
    _mean_squares,
    accuracy_vs_reference,
    intermediate_precision,
    precision_recovery,
)


def wells(records):
    """Build a results frame from (plate_id, group, nominal, concentration) tuples."""
    frame = pd.DataFrame(records, columns=["plate_id", "group", "nominal", "concentration"])
    frame["status"] = "in_range"
    return frame


# --------------------------------------------------------------------------- precision_recovery


def test_precision_recovery_matches_hand_calculation():
    # values 98, 102, 100 -> mean 100, SD = sqrt((4+4+0)/2) = 2, %CV = 2, recovery 100%
    frame = wells(
        [("P1", "QC", 100.0, 98.0), ("P1", "QC", 100.0, 102.0), ("P1", "QC", 100.0, 100.0)]
    )
    row = precision_recovery(frame).iloc[0]
    assert row["n"] == 3
    assert row["mean"] == pytest.approx(100.0)
    assert row["sd"] == pytest.approx(2.0)
    assert row["cv_percent"] == pytest.approx(2.0)
    assert row["recovery_percent"] == pytest.approx(100.0)
    assert row["bias_percent"] == pytest.approx(0.0)


def test_recovery_is_relative_to_nominal():
    frame = wells([("P1", "QC", 50.0, 45.0), ("P1", "QC", 50.0, 55.0)])
    row = precision_recovery(frame).iloc[0]
    assert row["recovery_percent"] == pytest.approx(100.0)
    frame = wells([("P1", "QC", 50.0, 40.0), ("P1", "QC", 50.0, 50.0)])
    row = precision_recovery(frame).iloc[0]
    assert row["recovery_percent"] == pytest.approx(90.0)
    assert row["bias_percent"] == pytest.approx(-10.0)


def test_unknowns_get_precision_but_no_recovery():
    frame = wells([("P1", "UNK", np.nan, 10.0), ("P1", "UNK", np.nan, 12.0)])
    row = precision_recovery(frame).iloc[0]
    assert row["cv_percent"] == pytest.approx(100 * np.sqrt(2) / 11.0)
    assert np.isnan(row["recovery_percent"])


def test_out_of_range_wells_are_excluded_but_counted():
    frame = wells([("P1", "QC", 10.0, 9.0), ("P1", "QC", 10.0, 11.0), ("P1", "QC", 10.0, 900.0)])
    frame.loc[2, "status"] = "above_range"
    row = precision_recovery(frame).iloc[0]
    assert (row["n"], row["n_wells"]) == (2, 3)
    assert row["mean"] == pytest.approx(10.0)
    assert "1 of 3 well(s) excluded" in row["notes"]

    kept = precision_recovery(frame, include_out_of_range=True).iloc[0]
    assert kept["n"] == 3


def test_single_replicate_has_no_cv():
    row = precision_recovery(wells([("P1", "QC", 10.0, 9.0)])).iloc[0]
    assert np.isnan(row["sd"]) and np.isnan(row["cv_percent"])
    assert "single usable replicate" in row["notes"]


def test_levels_are_ordered_high_to_low_with_unknowns_last():
    frame = wells(
        [
            ("P1", "LOW", 1.0, 1.0),
            ("P1", "UNK", np.nan, 5.0),
            ("P1", "HIGH", 100.0, 100.0),
            ("P1", "MID", 10.0, 10.0),
        ]
    )
    assert list(precision_recovery(frame)["group"]) == ["HIGH", "MID", "LOW", "UNK"]


# --------------------------------------------------------------------------- ANOVA components


BALANCED = wells(
    [
        ("P1", "QC", 21.0, 10.0),
        ("P1", "QC", 21.0, 12.0),
        ("P2", "QC", 21.0, 20.0),
        ("P2", "QC", 21.0, 22.0),
        ("P3", "QC", 21.0, 30.0),
        ("P3", "QC", 21.0, 32.0),
    ]
)
# Plate means 11, 21, 31; grand mean 21; n = 2, k = 3, N = 6.
# SS_between = 2 * ((11-21)^2 + 0 + (31-21)^2) = 400, df 2 -> MS_between = 200
# SS_within  = 3 * ((10-11)^2 + (12-11)^2)     = 6,   df 3 -> MS_within  = 2
# var_within = 2;  var_between = (200 - 2) / 2 = 99;  var_total = 101


def test_balanced_variance_components_match_hand_calculation():
    row = intermediate_precision(BALANCED).iloc[0]
    assert row["n_plates"] == 3
    assert row["n_total"] == 6
    assert row["n_effective"] == pytest.approx(2.0)
    assert row["grand_mean"] == pytest.approx(21.0)
    assert (row["df_between"], row["df_within"]) == (2, 3)
    assert row["ms_between"] == pytest.approx(200.0)
    assert row["ms_within"] == pytest.approx(2.0)
    assert row["var_within"] == pytest.approx(2.0)
    assert row["var_between"] == pytest.approx(99.0)
    assert row["var_total"] == pytest.approx(101.0)
    assert row["repeatability_sd"] == pytest.approx(np.sqrt(2.0))
    assert row["between_run_sd"] == pytest.approx(np.sqrt(99.0))
    assert row["intermediate_precision_sd"] == pytest.approx(np.sqrt(101.0))
    assert row["repeatability_cv_percent"] == pytest.approx(100 * np.sqrt(2.0) / 21.0)
    assert row["between_run_cv_percent"] == pytest.approx(100 * np.sqrt(99.0) / 21.0)
    assert row["intermediate_precision_cv_percent"] == pytest.approx(100 * np.sqrt(101.0) / 21.0)
    assert row["percent_variance_between"] == pytest.approx(100 * 99.0 / 101.0)
    assert row["anova_source"] == "statsmodels_anova_lm_typ2"


def test_intermediate_precision_is_the_quadrature_sum():
    row = intermediate_precision(BALANCED).iloc[0]
    total = row["repeatability_sd"] ** 2 + row["between_run_sd"] ** 2
    assert row["intermediate_precision_sd"] == pytest.approx(np.sqrt(total))


def test_unbalanced_design_uses_effective_n():
    # P1: 10, 12, 14 (n=3, mean 12); P2: 20, 22 (n=2, mean 21); N=5, k=2, grand 15.6
    # n_eff = (5 - (9 + 4)/5) / 1 = 2.4
    # SS_between = 3*(12-15.6)^2 + 2*(21-15.6)^2 = 97.2, df 1 -> MS_between = 97.2
    # SS_within  = (4+0+4) + (1+1) = 10,           df 3 -> MS_within  = 10/3
    # var_between = (97.2 - 10/3) / 2.4 = 39.1111
    frame = wells(
        [
            ("P1", "QC", 15.0, 10.0),
            ("P1", "QC", 15.0, 12.0),
            ("P1", "QC", 15.0, 14.0),
            ("P2", "QC", 15.0, 20.0),
            ("P2", "QC", 15.0, 22.0),
        ]
    )
    row = intermediate_precision(frame).iloc[0]
    assert row["n_effective"] == pytest.approx(2.4)
    assert row["ms_between"] == pytest.approx(97.2)
    assert row["ms_within"] == pytest.approx(10.0 / 3.0)
    assert row["var_between"] == pytest.approx((97.2 - 10.0 / 3.0) / 2.4)
    assert row["var_total"] == pytest.approx(10.0 / 3.0 + (97.2 - 10.0 / 3.0) / 2.4)
    assert "unbalanced design (n per plate: 3, 2)" in row["notes"]


def test_effective_n_collapses_to_n_when_balanced():
    assert intermediate_precision(BALANCED).iloc[0]["n_effective"] == pytest.approx(2.0)


def test_negative_between_run_variance_is_truncated_to_zero():
    # Both plates have mean 15, so MS_between = 0 while MS_within = 34.
    frame = wells(
        [
            ("P1", "QC", 15.0, 10.0),
            ("P1", "QC", 15.0, 20.0),
            ("P2", "QC", 15.0, 12.0),
            ("P2", "QC", 15.0, 18.0),
        ]
    )
    row = intermediate_precision(frame).iloc[0]
    assert row["ms_between"] == pytest.approx(0.0)
    assert row["ms_within"] == pytest.approx(34.0)
    assert row["var_between"] == 0.0
    assert row["intermediate_precision_sd"] == pytest.approx(np.sqrt(34.0))
    assert "truncated to 0" in row["notes"]


def test_single_plate_cannot_estimate_between_run_variance():
    frame = wells([("P1", "QC", 10.0, 9.0), ("P1", "QC", 10.0, 11.0)])
    row = intermediate_precision(frame).iloc[0]
    assert row["n_plates"] == 1
    assert row["ms_within"] == pytest.approx(2.0)
    assert row["repeatability_sd"] == pytest.approx(np.sqrt(2.0))
    assert np.isnan(row["var_between"])
    assert np.isnan(row["intermediate_precision_sd"])
    assert "between-run variance is not estimable" in row["notes"]
    assert row["anova_source"] == "explicit_sums_of_squares"


def test_one_replicate_per_plate_cannot_estimate_repeatability():
    frame = wells([("P1", "QC", 10.0, 9.0), ("P2", "QC", 10.0, 11.0)])
    row = intermediate_precision(frame).iloc[0]
    assert np.isnan(row["ms_within"])
    assert np.isnan(row["intermediate_precision_sd"])
    assert "repeatability is not estimable" in row["notes"]


def test_statsmodels_and_explicit_sums_of_squares_agree():
    """The fallback path must not partition differently from the ANOVA table."""
    rng = np.random.default_rng(11)
    records = [
        (f"P{plate}", "QC", 10.0, float(10 + plate + rng.normal(0, 0.5)))
        for plate in range(1, 5)
        for _ in range(3)
    ]
    frame = wells(records)

    from_statsmodels = _mean_squares(frame)
    assert from_statsmodels["anova_source"] == "statsmodels_anova_lm_typ2"

    values = frame["concentration"].to_numpy()
    plates = frame["plate_id"].to_numpy()
    grand = values.mean()
    means = pd.Series(values).groupby(plates).transform("mean").to_numpy()
    counts = pd.Series(values).groupby(plates).size().to_numpy()
    ss_between = float(np.sum(counts * (pd.Series(values).groupby(plates).mean().to_numpy() - grand) ** 2))
    ss_within = float(np.sum((values - means) ** 2))

    assert from_statsmodels["ms_between"] == pytest.approx(ss_between / 3)
    assert from_statsmodels["ms_within"] == pytest.approx(ss_within / 8)


def test_each_level_is_decomposed_separately():
    frame = pd.concat([BALANCED, BALANCED.assign(group="QC2", nominal=5.0)], ignore_index=True)
    out = intermediate_precision(frame)
    assert set(out["group"]) == {"QC", "QC2"}
    assert out["var_between"].nunique() == 1  # same data, same decomposition


# --------------------------------------------------------------------------- accuracy


def test_accuracy_falls_back_to_nominal_without_a_reference():
    row = accuracy_vs_reference(BALANCED).iloc[0]
    assert row["reference_value"] == pytest.approx(21.0)
    assert row["reference_source"] == "nominal"
    assert row["grand_mean"] == pytest.approx(21.0)
    assert row["recovery_percent"] == pytest.approx(100.0)
    assert row["n_plates"] == 3


def test_accuracy_uses_the_reference_set_when_given():
    reference = pd.DataFrame(
        {"group": ["QC"], "reference_value": [20.0], "reference_source": ["measured"]}
    )
    row = accuracy_vs_reference(BALANCED, reference).iloc[0]
    assert row["reference_value"] == pytest.approx(20.0)
    assert row["reference_source"] == "measured"
    assert row["recovery_percent"] == pytest.approx(105.0)
    assert row["bias_percent"] == pytest.approx(5.0)


def test_levels_missing_from_the_reference_fall_back_and_say_so():
    reference = pd.DataFrame(
        {"group": ["OTHER"], "reference_value": [1.0], "reference_source": ["nominal"]}
    )
    row = accuracy_vs_reference(BALANCED, reference).iloc[0]
    assert row["reference_value"] == pytest.approx(21.0)
    assert "not in the reference set" in row["notes"]


# --------------------------------------------------------------------------- empty inputs


@pytest.mark.parametrize("function", [precision_recovery, intermediate_precision, accuracy_vs_reference])
def test_empty_input_returns_an_empty_frame_not_an_error(function):
    out = function(pd.DataFrame())
    assert out.empty
    assert "group" in out.columns
