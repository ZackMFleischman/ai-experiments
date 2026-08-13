"""Standard-curve fitting and back-calculation.

STAGE 1 STUB -- signatures and plumbing only, so the pipeline runs end-to-end on
the synthetic data. The real fits land in the next stage.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

MODELS = ("4pl", "5pl", "semilog")
WEIGHTINGS = ("none", "1/y", "1/y2")


class CurveFitError(RuntimeError):
    """Raised when a standard curve cannot be fitted."""


@dataclass
class CurveFit:
    model: str
    weighting: str
    params: dict[str, float]
    r_squared: float
    residuals: np.ndarray
    conc_range: tuple[float, float]
    signal_range: tuple[float, float]
    n_standards: int
    converged: bool = False
    standards_table: pd.DataFrame = field(default_factory=pd.DataFrame)


def fit_standard_curve(standards_df: pd.DataFrame, model: str = "4pl", weighting: str = "1/y2") -> CurveFit:
    """STUB: returns an unfitted placeholder spanning the standards."""
    concentrations = standards_df["nominal"].to_numpy(dtype=float)
    signals = standards_df["signal"].to_numpy(dtype=float)
    return CurveFit(
        model=model,
        weighting=weighting,
        params={},
        r_squared=float("nan"),
        residuals=np.zeros_like(signals),
        conc_range=(float(np.min(concentrations)), float(np.max(concentrations))),
        signal_range=(float(np.min(signals)), float(np.max(signals))),
        n_standards=int(signals.size),
        converged=False,
        standards_table=standards_df.copy(),
    )


def back_calculate(fit: CurveFit, samples_df: pd.DataFrame) -> pd.DataFrame:
    """STUB: emits the result columns with NaN concentrations."""
    out = samples_df.copy()
    out["concentration"] = np.nan
    out["status"] = "in_range"
    out["inversion"] = "stub"
    return out
