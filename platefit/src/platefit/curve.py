"""Standard-curve fitting and back-calculation.

Three models, each with a closed-form inverse so back-calculation is exact
rather than iterative (a numeric solve is kept only as a fallback):

===========  ===========================================  ==========================================
model        signal from concentration                    concentration from signal
===========  ===========================================  ==========================================
``4pl``      ``d + (a - d) / (1 + (x/c)**b)``             ``c * ((a - d)/(y - d) - 1) ** (1/b)``
``5pl``      ``d + (a - d) / (1 + (x/c)**b) ** g``        ``c * (((a - d)/(y - d))**(1/g) - 1)**(1/b)``
``semilog``  ``intercept + slope * log10(x)``             ``10 ** ((y - intercept) / slope)``
===========  ===========================================  ==========================================

``a`` is the response as concentration goes to zero and ``d`` the response as it
goes to infinity, so the same parameterisation covers rising and falling curves
(``b > 0`` throughout); ``c`` is the inflection concentration (EC50) and ``g``
the 5PL asymmetry factor.

Weighting is applied to the **observed** response, matching SoftMax Pro: the
objective is ``sum(w_i * (y_i - f(x_i))**2)`` with ``w = 1``, ``1/y`` or
``1/y**2``. ``1/y2`` is the default because that is what the instrument software
commonly defaults to.
"""

from __future__ import annotations

import math
import warnings
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd
from scipy.optimize import brentq, curve_fit

MODELS = ("4pl", "5pl", "semilog")
WEIGHTINGS = ("none", "1/y", "1/y2")

#: Relative slack around the calibrated range before a well is called out-of-range.
RANGE_TOLERANCE = 1e-9


class CurveFitError(RuntimeError):
    """Raised when a standard curve cannot be fitted."""


# --------------------------------------------------------------------------- models


def _four_pl(x: np.ndarray, a: float, d: float, c: float, b: float) -> np.ndarray:
    x = np.asarray(x, dtype=float)
    ratio = np.divide(x, c, out=np.zeros_like(x, dtype=float), where=x > 0)
    return d + (a - d) / (1.0 + np.power(ratio, b))


def _four_pl_inverse(y: np.ndarray, a: float, d: float, c: float, b: float) -> np.ndarray:
    y = np.asarray(y, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = (a - d) / (y - d)
        inner = ratio - 1.0
        out = c * np.power(inner, 1.0 / b)
    return np.where(np.isfinite(out) & (inner > 0), out, np.nan)


def _five_pl(x: np.ndarray, a: float, d: float, c: float, b: float, g: float) -> np.ndarray:
    x = np.asarray(x, dtype=float)
    ratio = np.divide(x, c, out=np.zeros_like(x, dtype=float), where=x > 0)
    return d + (a - d) / np.power(1.0 + np.power(ratio, b), g)


def _five_pl_inverse(y: np.ndarray, a: float, d: float, c: float, b: float, g: float) -> np.ndarray:
    y = np.asarray(y, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = (a - d) / (y - d)
        inner = np.power(np.where(ratio > 0, ratio, np.nan), 1.0 / g) - 1.0
        out = c * np.power(inner, 1.0 / b)
    return np.where(np.isfinite(out) & (inner > 0), out, np.nan)


def _semilog(x: np.ndarray, intercept: float, slope: float) -> np.ndarray:
    x = np.asarray(x, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        logx = np.where(x > 0, np.log10(np.where(x > 0, x, 1.0)), np.nan)
    return intercept + slope * logx


def _semilog_inverse(y: np.ndarray, intercept: float, slope: float) -> np.ndarray:
    y = np.asarray(y, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore", over="ignore"):
        out = np.power(10.0, (y - intercept) / slope)
    return np.where(np.isfinite(out), out, np.nan)


@dataclass(frozen=True)
class ModelSpec:
    name: str
    param_names: tuple[str, ...]
    fn: Callable[..., np.ndarray]
    inverse: Callable[..., np.ndarray]
    positive_conc_only: bool


MODEL_SPECS: dict[str, ModelSpec] = {
    "4pl": ModelSpec("4pl", ("a", "d", "c", "b"), _four_pl, _four_pl_inverse, False),
    "5pl": ModelSpec("5pl", ("a", "d", "c", "b", "g"), _five_pl, _five_pl_inverse, False),
    "semilog": ModelSpec("semilog", ("intercept", "slope"), _semilog, _semilog_inverse, True),
}


# --------------------------------------------------------------------------- fit object


@dataclass
class CurveFit:
    """The fitted standard curve plus everything needed to judge it."""

    model: str
    weighting: str
    params: dict[str, float]
    r_squared: float
    r_squared_weighted: float
    residuals: np.ndarray
    conc_range: tuple[float, float]
    signal_range: tuple[float, float]
    fitted_signal_range: tuple[float, float]
    n_standards: int
    converged: bool
    rmse: float
    weighted_sse: float
    weight_floor: float
    standards_table: pd.DataFrame = field(default_factory=pd.DataFrame)
    excluded_standards: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def spec(self) -> ModelSpec:
        return MODEL_SPECS[self.model]

    @property
    def param_values(self) -> tuple[float, ...]:
        return tuple(self.params[name] for name in self.spec.param_names)

    def predict(self, concentration) -> np.ndarray:
        """Signal expected at one or more concentrations."""
        return self.spec.fn(np.atleast_1d(np.asarray(concentration, dtype=float)), *self.param_values)

    def invert(self, signal) -> np.ndarray:
        """Closed-form concentration for one or more signals (NaN where undefined)."""
        return self.spec.inverse(np.atleast_1d(np.asarray(signal, dtype=float)), *self.param_values)

    @property
    def increasing(self) -> bool:
        """True when signal rises with concentration across the calibrated range."""
        lo, hi = self.predict([self.conc_range[0], self.conc_range[1]])
        return bool(hi >= lo)


# --------------------------------------------------------------------------- weighting


def weights_for(signals: np.ndarray, weighting: str) -> tuple[np.ndarray, float]:
    """Least-squares weights on the observed response, plus the magnitude floor used.

    Zero or near-zero responses would give unbounded ``1/y`` weights, so the
    magnitude is floored at the smallest strictly positive ``|y|`` in the set --
    a near-zero standard then carries the same weight as the smallest real one,
    instead of swamping the fit.
    """
    if weighting not in WEIGHTINGS:
        raise CurveFitError(f"unknown weighting {weighting!r} (choose from {', '.join(WEIGHTINGS)})")
    magnitude = np.abs(np.asarray(signals, dtype=float))
    positive = magnitude[magnitude > 0]
    floor = float(positive.min()) if positive.size else 1.0
    if weighting == "none":
        return np.ones_like(magnitude), floor
    clamped = np.maximum(magnitude, floor)
    if weighting == "1/y":
        return 1.0 / clamped, floor
    return 1.0 / np.square(clamped), floor


# --------------------------------------------------------------------------- fitting


def _initial_guess(spec: ModelSpec, conc: np.ndarray, signal: np.ndarray) -> list[float]:
    """Robust starting values derived from the data (min/max signal, midpoint)."""
    order = np.argsort(conc)
    conc_sorted, signal_sorted = conc[order], signal[order]
    low_signal = float(signal_sorted[0])
    high_signal = float(signal_sorted[-1])

    if spec.name == "semilog":
        return [low_signal, (high_signal - low_signal) or 1.0]

    midpoint = 0.5 * (low_signal + high_signal)
    positive = conc_sorted > 0
    c0 = float(np.exp(np.mean(np.log(conc_sorted[positive])))) if positive.any() else 1.0
    if positive.sum() >= 2:
        # Interpolate the concentration whose signal sits halfway up the curve.
        log_conc = np.log10(conc_sorted[positive])
        sig = signal_sorted[positive]
        ascending = np.argsort(sig)
        interpolated = np.interp(midpoint, sig[ascending], log_conc[ascending])
        if math.isfinite(interpolated):
            c0 = float(10.0**interpolated)
    guess = [low_signal, high_signal, max(c0, 1e-12), 1.0]
    if spec.name == "5pl":
        guess.append(1.0)
    return guess


def _bounds(spec: ModelSpec) -> tuple[list[float], list[float]]:
    if spec.name == "semilog":
        return [-np.inf, -np.inf], [np.inf, np.inf]
    lower = [-np.inf, -np.inf, 1e-12, 1e-6]
    upper = [np.inf, np.inf, np.inf, 1e6]
    if spec.name == "5pl":
        lower.append(1e-6)
        upper.append(1e6)
    return lower, upper


def _fit_semilog(conc: np.ndarray, signal: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Weighted linear least squares of signal on log10(conc) -- exact, no iteration."""
    design = np.column_stack([np.ones_like(conc), np.log10(conc)])
    root_w = np.sqrt(weights)[:, None]
    solution, *_ = np.linalg.lstsq(design * root_w, signal * root_w[:, 0], rcond=None)
    return solution


def fit_standard_curve(
    standards_df: pd.DataFrame,
    model: str = "4pl",
    weighting: str = "1/y2",
) -> CurveFit:
    """Fit a standard curve to the standard wells.

    ``standards_df`` needs a ``nominal`` column (known concentration) and a
    ``signal`` column (blank-corrected response); ``well`` and ``group`` are
    carried through to the diagnostics table when present. The function is pure
    -- it neither reads nor writes files.
    """
    if model not in MODEL_SPECS:
        raise CurveFitError(f"unknown curve model {model!r} (choose from {', '.join(MODELS)})")
    spec = MODEL_SPECS[model]
    for column in ("nominal", "signal"):
        if column not in standards_df.columns:
            raise CurveFitError(f"standards frame is missing the {column!r} column")

    frame = standards_df.copy().reset_index(drop=True)
    frame["nominal"] = pd.to_numeric(frame["nominal"], errors="coerce")
    frame["signal"] = pd.to_numeric(frame["signal"], errors="coerce")

    usable = frame["nominal"].notna() & frame["signal"].notna() & np.isfinite(frame["signal"])
    notes: list[str] = []
    if spec.positive_conc_only:
        zero_conc = usable & ~(frame["nominal"] > 0)
        if zero_conc.any():
            notes.append(
                f"{int(zero_conc.sum())} standard well(s) at concentration 0 excluded: "
                f"log10(0) is undefined for the semilog model"
            )
            usable &= frame["nominal"] > 0
    excluded = [str(w) for w in frame.loc[~usable, "well"]] if "well" in frame.columns else []

    fit_frame = frame.loc[usable]
    conc = fit_frame["nominal"].to_numpy(dtype=float)
    signal = fit_frame["signal"].to_numpy(dtype=float)
    n_params = len(spec.param_names)
    if conc.size < n_params:
        raise CurveFitError(
            f"{model} needs at least {n_params} usable standard wells, got {conc.size}"
        )
    if conc.size == n_params:
        notes.append(f"exactly {n_params} usable standards: the fit has zero degrees of freedom")
    if np.unique(conc).size < 2:
        raise CurveFitError("standards span a single concentration; a curve cannot be fitted")

    weights, weight_floor = weights_for(signal, weighting)

    converged = True
    if spec.name == "semilog":
        params = _fit_semilog(conc, signal, weights)
        if not np.isfinite(params).all() or abs(params[1]) < 1e-12:
            raise CurveFitError("semilog fit is degenerate: the fitted slope is ~0")
    else:
        params = _fit_nonlinear(spec, conc, signal, weights, model, weighting)

    predicted = spec.fn(conc, *params)
    residuals = signal - predicted
    ss_res = float(np.sum(residuals**2))
    ss_tot = float(np.sum((signal - signal.mean()) ** 2))
    weighted_sse = float(np.sum(weights * residuals**2))
    weighted_mean = float(np.sum(weights * signal) / np.sum(weights))
    weighted_sst = float(np.sum(weights * (signal - weighted_mean) ** 2))

    conc_range = (float(conc.min()), float(conc.max()))
    endpoints = spec.fn(np.array(conc_range), *params)
    # Out-of-range flagging is judged against the signals the standards actually
    # produced, so a noisy top or bottom standard can never fall outside the range
    # it defines. The fitted endpoints are kept separately as a fit diagnostic.
    signal_range = (float(signal.min()), float(signal.max()))
    fitted_signal_range = (float(np.min(endpoints)), float(np.max(endpoints)))

    fit = CurveFit(
        model=model,
        weighting=weighting,
        params={name: float(value) for name, value in zip(spec.param_names, params)},
        r_squared=float("nan") if ss_tot == 0 else 1.0 - ss_res / ss_tot,
        r_squared_weighted=float("nan") if weighted_sst == 0 else 1.0 - weighted_sse / weighted_sst,
        residuals=residuals,
        conc_range=conc_range,
        signal_range=signal_range,
        fitted_signal_range=fitted_signal_range,
        n_standards=int(conc.size),
        converged=converged,
        rmse=float(np.sqrt(ss_res / conc.size)),
        weighted_sse=weighted_sse,
        weight_floor=weight_floor,
        excluded_standards=excluded,
        notes=notes,
    )

    # Per-standard back-calculation: the most direct read on curve quality.
    table = back_calculate(fit, frame)
    table["weight"] = pd.Series(weights, index=fit_frame.index).reindex(table.index)
    table["fitted_signal"] = spec.fn(table["nominal"].to_numpy(dtype=float), *params)
    table["residual"] = table["signal"] - table["fitted_signal"]
    table["used_in_fit"] = usable.reindex(table.index, fill_value=False)
    fit.standards_table = table
    return fit


def _fit_nonlinear(
    spec: ModelSpec,
    conc: np.ndarray,
    signal: np.ndarray,
    weights: np.ndarray,
    model: str,
    weighting: str,
) -> np.ndarray:
    """curve_fit with weights expressed as sigma = 1/sqrt(w), with retries."""
    sigma = 1.0 / np.sqrt(weights)
    lower, upper = _bounds(spec)
    attempts: list[list[float]] = [_initial_guess(spec, conc, signal)]

    # Fallback starts: a wider EC50 sweep across the calibrated range.
    positive = conc[conc > 0]
    if positive.size:
        for factor in (0.1, 1.0, 10.0):
            alternative = list(attempts[0])
            alternative[2] = float(np.exp(np.mean(np.log(positive)))) * factor
            attempts.append(alternative)

    last_error: Exception | None = None
    for p0 in attempts:
        clipped = [min(max(v, lo), hi) for v, lo, hi in zip(p0, lower, upper)]
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                params, _ = curve_fit(
                    spec.fn,
                    conc,
                    signal,
                    p0=clipped,
                    sigma=sigma,
                    absolute_sigma=True,
                    bounds=(lower, upper),
                    maxfev=50000,
                )
            if np.isfinite(params).all():
                return np.asarray(params, dtype=float)
            last_error = RuntimeError("fit produced non-finite parameters")
        except (RuntimeError, ValueError, TypeError) as exc:  # pragma: no cover - solver-dependent
            last_error = exc
    raise CurveFitError(
        f"{model} fit did not converge with weighting {weighting} "
        f"({last_error}). Try --curve-model semilog, --weighting none, or check the standards."
    )


# --------------------------------------------------------------------------- back-calculation


def _numeric_invert(fit: CurveFit, target: float) -> float:
    """Bracketed solve on log10(concentration); the fallback when algebra fails."""
    lo = math.log10(max(fit.conc_range[0], 1e-12)) - 3.0
    hi = math.log10(max(fit.conc_range[1], 1e-11)) + 3.0
    values = fit.spec.fn
    params = fit.param_values

    def objective(log_conc: float) -> float:
        return float(values(np.array([10.0**log_conc]), *params)[0]) - target

    try:
        if objective(lo) * objective(hi) > 0:
            return float("nan")
        return float(10.0 ** brentq(objective, lo, hi, xtol=1e-10, rtol=1e-12, maxiter=200))
    except (ValueError, RuntimeError):  # pragma: no cover - bracketing failure
        return float("nan")


def back_calculate(fit: CurveFit, samples_df: pd.DataFrame) -> pd.DataFrame:
    """Invert the curve for each well and flag it against the calibrated range.

    Adds four columns:

    ``concentration``
        back-calculated concentration (NaN where the signal sits beyond a model
        asymptote and no concentration exists).
    ``status``
        ``in_range`` / ``below_range`` / ``above_range``, decided by the signal
        against the fitted response at the lowest and highest standard --
        SoftMax-style out-of-range flagging.
    ``inversion``
        ``closed_form`` / ``numeric`` / ``undefined``, so a fallback solve is visible.
    ``recovery_percent``
        ``100 * concentration / nominal`` where a nominal exists.
    """
    out = samples_df.copy().reset_index(drop=True)
    if "signal" not in out.columns:
        raise CurveFitError("samples frame is missing the 'signal' column")
    signals = pd.to_numeric(out["signal"], errors="coerce").to_numpy(dtype=float)

    concentrations = fit.invert(signals)
    inversion = np.where(np.isfinite(concentrations), "closed_form", "undefined").astype(object)

    # Numeric fallback only where the algebra came up empty but a root can exist,
    # i.e. the signal lies between the curve's own endpoints.
    fitted_low, fitted_high = fit.fitted_signal_range
    for i, (value, signal) in enumerate(zip(concentrations, signals)):
        if np.isfinite(value) or not np.isfinite(signal):
            continue
        if fitted_low <= signal <= fitted_high:
            solved = _numeric_invert(fit, float(signal))
            if np.isfinite(solved):
                concentrations[i] = solved
                inversion[i] = "numeric"

    low, high = fit.signal_range
    tolerance = RANGE_TOLERANCE * max(abs(low), abs(high), 1.0)
    if fit.increasing:
        below = signals < low - tolerance
        above = signals > high + tolerance
    else:
        below = signals > high + tolerance
        above = signals < low - tolerance

    status = np.full(signals.shape, "in_range", dtype=object)
    status[below] = "below_range"
    status[above] = "above_range"
    status[~np.isfinite(signals)] = "no_signal"

    out["concentration"] = concentrations
    out["status"] = status
    out["inversion"] = inversion
    if "nominal" in out.columns:
        nominal = pd.to_numeric(out["nominal"], errors="coerce")
        with np.errstate(divide="ignore", invalid="ignore"):
            out["recovery_percent"] = np.where(
                nominal.to_numpy(dtype=float) > 0,
                100.0 * out["concentration"] / nominal,
                np.nan,
            )
    else:
        out["recovery_percent"] = np.nan
    return out
