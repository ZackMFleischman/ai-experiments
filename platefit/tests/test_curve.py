import numpy as np
import pandas as pd
import pytest

from platefit.curve import (
    MODEL_SPECS,
    CurveFitError,
    _numeric_invert,
    back_calculate,
    fit_standard_curve,
    weights_for,
)

TRUE_4PL = {"a": 0.05, "d": 3.0, "c": 25.0, "b": 1.2}
TRUE_5PL = {**TRUE_4PL, "g": 0.85}
LEVELS = [200.0, 100.0, 50.0, 25.0, 12.5, 6.25, 3.125, 1.5625]


def standards(model="4pl", params=None, levels=LEVELS, replicates=2, noise=0.0, seed=1):
    """Noiseless (or lightly noised) standards generated from a known truth."""
    spec = MODEL_SPECS[model]
    params = params or (TRUE_4PL if model == "4pl" else TRUE_5PL)
    rng = np.random.default_rng(seed)
    rows = []
    for level in levels:
        signal = float(spec.fn(np.array([level]), *[params[p] for p in spec.param_names])[0])
        for replicate in range(replicates):
            value = signal * (1 + rng.normal(0, noise)) if noise else signal
            rows.append(
                {
                    "well": f"W{len(rows) + 1}",
                    "group": f"STD-{level}",
                    "nominal": level,
                    "signal": value,
                }
            )
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------- weighting


def test_weightings_are_what_they_say():
    signals = np.array([0.5, 2.0, 4.0])
    assert weights_for(signals, "none")[0] == pytest.approx([1, 1, 1])
    assert weights_for(signals, "1/y")[0] == pytest.approx(1 / signals)
    assert weights_for(signals, "1/y2")[0] == pytest.approx(1 / signals**2)


def test_zero_signal_weight_is_floored_not_infinite():
    weights, floor = weights_for(np.array([0.0, 0.5, 2.0]), "1/y2")
    assert floor == pytest.approx(0.5)
    assert np.isfinite(weights).all()
    assert weights[0] == pytest.approx(weights[1])  # the zero gets the smallest real weight


def test_unknown_weighting_is_rejected():
    with pytest.raises(CurveFitError, match="unknown weighting"):
        weights_for(np.array([1.0]), "1/x")


# --------------------------------------------------------------------------- fitting


@pytest.mark.parametrize("weighting", ["none", "1/y", "1/y2"])
def test_4pl_recovers_the_generating_parameters(weighting):
    fit = fit_standard_curve(standards("4pl"), model="4pl", weighting=weighting)
    for name, expected in TRUE_4PL.items():
        assert fit.params[name] == pytest.approx(expected, rel=1e-4)
    assert fit.r_squared == pytest.approx(1.0, abs=1e-9)
    assert fit.conc_range == (1.5625, 200.0)
    assert fit.n_standards == 16


def test_5pl_recovers_the_generating_parameters():
    fit = fit_standard_curve(standards("5pl"), model="5pl")
    for name, expected in TRUE_5PL.items():
        assert fit.params[name] == pytest.approx(expected, rel=1e-3)


def test_semilog_is_an_exact_weighted_linear_fit():
    frame = pd.DataFrame(
        {
            "well": ["A1", "B1", "C1", "D1"],
            "group": ["S1", "S2", "S3", "S4"],
            "nominal": [1.0, 10.0, 100.0, 1000.0],
            "signal": [2.0, 5.0, 8.0, 11.0],  # exactly 2 + 3*log10(x)
        }
    )
    fit = fit_standard_curve(frame, model="semilog", weighting="1/y2")
    assert fit.params["intercept"] == pytest.approx(2.0)
    assert fit.params["slope"] == pytest.approx(3.0)
    assert fit.r_squared == pytest.approx(1.0)


def test_weighted_semilog_matches_independent_wls():
    frame = pd.DataFrame(
        {
            "nominal": [1.0, 10.0, 100.0, 1000.0],
            "signal": [2.1, 4.8, 8.3, 10.9],  # noisy, so weighting actually matters
        }
    )
    fit = fit_standard_curve(frame, model="semilog", weighting="1/y2")

    x = np.log10(frame["nominal"].to_numpy())
    y = frame["signal"].to_numpy()
    w = 1 / y**2
    design = np.column_stack([np.ones_like(x), x])
    expected = np.linalg.solve(design.T @ (w[:, None] * design), design.T @ (w * y))
    assert fit.params["intercept"] == pytest.approx(expected[0])
    assert fit.params["slope"] == pytest.approx(expected[1])


def test_semilog_excludes_zero_concentration_standards():
    frame = standards("4pl")
    frame.loc[len(frame)] = {"well": "Z1", "group": "STD-0", "nominal": 0.0, "signal": 0.05}
    fit = fit_standard_curve(frame, model="semilog")
    assert fit.n_standards == 16
    assert any("log10(0)" in note for note in fit.notes)
    assert "Z1" in fit.excluded_standards


def test_decreasing_curve_fits_and_inverts():
    """Inhibition assays run the other way: signal falls as concentration rises."""
    inhibition = {"a": 3.0, "d": 0.1, "c": 20.0, "b": 1.4}
    fit = fit_standard_curve(standards("4pl", params=inhibition), model="4pl")
    assert not fit.increasing
    for name, expected in inhibition.items():
        assert fit.params[name] == pytest.approx(expected, rel=1e-4)
    result = back_calculate(fit, pd.DataFrame({"signal": fit.predict([40.0])}))
    assert result["concentration"].iloc[0] == pytest.approx(40.0)
    assert result["status"].iloc[0] == "in_range"


def test_too_few_standards_is_a_clear_error():
    frame = standards("4pl", levels=[10.0, 100.0], replicates=1)
    with pytest.raises(CurveFitError, match="at least 4 usable standard wells"):
        fit_standard_curve(frame, model="4pl")


def test_single_concentration_is_a_clear_error():
    frame = standards("4pl", levels=[10.0], replicates=6)
    with pytest.raises(CurveFitError, match="single concentration"):
        fit_standard_curve(frame, model="4pl")


def test_unknown_model_is_rejected():
    with pytest.raises(CurveFitError, match="unknown curve model"):
        fit_standard_curve(standards(), model="6pl")


def test_missing_column_is_rejected():
    with pytest.raises(CurveFitError, match="missing the 'signal' column"):
        fit_standard_curve(pd.DataFrame({"nominal": [1.0, 2.0]}))


# --------------------------------------------------------------------------- inversion


@pytest.mark.parametrize("model", ["4pl", "5pl", "semilog"])
def test_inverse_is_the_exact_inverse_of_the_forward_model(model):
    fit = fit_standard_curve(standards("4pl"), model=model)
    concentrations = np.array([2.0, 7.5, 30.0, 150.0])
    assert fit.invert(fit.predict(concentrations)) == pytest.approx(concentrations, rel=1e-6)


def test_back_calculation_recovers_known_concentrations():
    fit = fit_standard_curve(standards("4pl"), model="4pl")
    truth = np.array([3.0, 18.0, 140.0])
    samples = pd.DataFrame(
        {"group": ["QC-LOW", "QC-MID", "QC-HIGH"], "nominal": truth, "signal": fit.predict(truth)}
    )
    result = back_calculate(fit, samples)
    assert result["concentration"].to_numpy() == pytest.approx(truth, rel=1e-6)
    assert result["recovery_percent"].to_numpy() == pytest.approx([100.0, 100.0, 100.0], rel=1e-6)
    assert list(result["status"]) == ["in_range"] * 3
    assert list(result["inversion"]) == ["closed_form"] * 3


def test_out_of_range_flagging():
    fit = fit_standard_curve(standards("4pl"), model="4pl")
    low, high = fit.signal_range
    samples = pd.DataFrame({"signal": [low - 0.01, low, (low + high) / 2, high, high + 0.01]})
    result = back_calculate(fit, samples)
    assert list(result["status"]) == [
        "below_range",
        "in_range",
        "in_range",
        "in_range",
        "above_range",
    ]


def test_signal_beyond_an_asymptote_has_no_concentration():
    fit = fit_standard_curve(standards("4pl"), model="4pl")
    beyond_top = TRUE_4PL["d"] + 0.5
    result = back_calculate(fit, pd.DataFrame({"signal": [beyond_top]}))
    assert np.isnan(result["concentration"].iloc[0])
    assert result["status"].iloc[0] == "above_range"
    assert result["inversion"].iloc[0] == "undefined"


def test_extreme_standards_are_never_flagged_out_of_range():
    """The standards define the range, so their own noise must not push them out."""
    fit = fit_standard_curve(standards("4pl", noise=0.02, seed=7), model="4pl")
    assert set(fit.standards_table["status"]) == {"in_range"}


@pytest.mark.parametrize("model", ["4pl", "5pl", "semilog"])
def test_numeric_fallback_agrees_with_the_closed_form(model):
    fit = fit_standard_curve(standards("4pl"), model=model)
    for concentration in (2.5, 20.0, 175.0):
        target = float(fit.predict([concentration])[0])
        assert _numeric_invert(fit, target) == pytest.approx(concentration, rel=1e-6)


def test_standards_table_reports_recovery_and_weights():
    fit = fit_standard_curve(standards("4pl", noise=0.01, seed=3), model="4pl", weighting="1/y2")
    table = fit.standards_table
    assert set(["concentration", "recovery_percent", "weight", "residual", "used_in_fit"]) <= set(table.columns)
    assert table["used_in_fit"].all()
    assert table["weight"].to_numpy() == pytest.approx(1 / table["signal"].to_numpy() ** 2)
    # Away from the top asymptote the curve is steep, so recovery tracks closely.
    # The top standard sits where the curve is flat and 1% signal noise turns into
    # tens of percent in concentration -- real behaviour, and exactly why this
    # table is worth eyeballing.
    interior = table[table["nominal"] <= 100.0]
    assert interior["recovery_percent"].between(90, 110).all()
    assert table["recovery_percent"].between(50, 150).all()
