"""Regenerate the synthetic demo plates.

Three plates are simulated from a known 4PL truth with a small run-to-run shift
in top asymptote and EC50, so `platefit compare` has real between-run variance to
find. Deterministic (fixed seed) -- committed outputs are reproducible with:

    python examples/make_synthetic.py

Plates A and B are written as SoftMax-style grids; plate C is written in the
long well/value form, so both readers stay exercised.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import yaml

HERE = Path(__file__).parent
TEMPLATE = HERE / "template_96.yaml"

# 4PL truth: signal = d + (a - d) / (1 + (conc / c) ** b)
TRUTH = {"a": 0.040, "d": 3.10, "c": 42.0, "b": 1.10}
BLANK_OFFSET = 0.045
PROPORTIONAL_CV = 0.025
ADDITIVE_SD = 0.008

# Per-plate multipliers on top asymptote and EC50 (the run-to-run effect).
PLATES = {
    "PLATE-A": {"d": 1.000, "c": 1.00},
    "PLATE-B": {"d": 1.030, "c": 0.94},
    "PLATE-C": {"d": 0.970, "c": 1.08},
}

# True concentrations behind the unknown groups.
UNKNOWN_TRUTH = {"UNK-001": 420.0, "UNK-002": 58.0, "UNK-003": 6.2, "UNK-004": 130.0}

ROWS = "ABCDEFGH"
COLS = range(1, 13)


def four_pl(conc: np.ndarray, a: float, d: float, c: float, b: float) -> np.ndarray:
    conc = np.asarray(conc, dtype=float)
    return d + (a - d) / (1.0 + np.power(np.divide(conc, c, out=np.zeros_like(conc), where=conc > 0), b))


def well_truth(template: dict) -> dict[str, float]:
    """Map every assigned well to the concentration it really holds."""
    truth: dict[str, float] = {}
    for level in template["standards"]:
        for well in level["wells"]:
            truth[well] = float(level["nominal"])
    for group in template["samples"]:
        nominal = group.get("nominal")
        value = UNKNOWN_TRUTH.get(group["group"], nominal)
        if value is None:
            raise SystemExit(f"no truth concentration for sample group {group['group']}")
        for well in group["wells"]:
            truth[well] = float(value)
    return truth


def simulate(plate_id: str, truth: dict[str, float], rng: np.random.Generator) -> dict[str, float]:
    shift = PLATES[plate_id]
    params = {**TRUTH, "d": TRUTH["d"] * shift["d"], "c": TRUTH["c"] * shift["c"]}
    values: dict[str, float] = {}
    for row in ROWS:
        for col in COLS:
            well = f"{row}{col}"
            conc = truth.get(well, 0.0)  # unassigned + blank wells sit at zero
            signal = BLANK_OFFSET + four_pl(np.array([conc]), **params)[0]
            noisy = signal * (1.0 + rng.normal(0.0, PROPORTIONAL_CV)) + rng.normal(0.0, ADDITIVE_SD)
            values[well] = round(float(max(noisy, 0.0)), 4)
    return values


def write_grid(path: Path, values: dict[str, float]) -> None:
    lines = ["," + ",".join(str(c) for c in COLS)]
    lines += [row + "," + ",".join(f"{values[f'{row}{c}']:.4f}" for c in COLS) for row in ROWS]
    path.write_text("\n".join(lines) + "\n")


def write_long(path: Path, values: dict[str, float]) -> None:
    lines = ["well,value"]
    lines += [f"{row}{c},{values[f'{row}{c}']:.4f}" for row in ROWS for c in COLS]
    path.write_text("\n".join(lines) + "\n")


def main() -> None:
    template = yaml.safe_load(TEMPLATE.read_text())
    # Ranges aren't used in the demo template, so the raw lists are already wells.
    truth = well_truth(template)
    rng = np.random.default_rng(20260813)

    for plate_id in PLATES:
        values = simulate(plate_id, truth, rng)
        stem = plate_id.lower().replace("-", "_")
        if plate_id == "PLATE-C":
            write_long(HERE / f"{stem}.csv", values)
        else:
            write_grid(HERE / f"{stem}.csv", values)
        print(f"wrote {stem}.csv")

    reference = ["group,nominal"]
    for group in template["samples"]:
        nominal = group.get("nominal")
        if nominal is not None:
            reference.append(f"{group['group']},{nominal}")
    (HERE / "reference_qc.csv").write_text("\n".join(reference) + "\n")
    print("wrote reference_qc.csv")


if __name__ == "__main__":
    main()
