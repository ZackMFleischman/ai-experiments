"""argparse wiring and orchestration for the ``platefit`` CLI."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from platefit import __version__, io as plate_io, stats
from platefit.curve import MODELS, WEIGHTINGS, CurveFitError, back_calculate, fit_standard_curve
from platefit.model import BlankHandling, PlateError, build_plate, corrected_frame

WELL_COLUMNS = [
    "plate_id",
    "well",
    "row",
    "col",
    "role",
    "group",
    "nominal",
    "raw_value",
    "blank_offset",
    "signal",
    "concentration",
    "status",
    "inversion",
    "recovery_percent",
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="platefit",
        description=(
            "Bioanalytical plate analysis: fit a standard curve, back-calculate sample "
            "concentrations, and summarise precision and accuracy."
        ),
    )
    parser.add_argument("--version", action="version", version=f"platefit {__version__}")
    subparsers = parser.add_subparsers(dest="command", metavar="{run,compare}", required=True)

    run = subparsers.add_parser(
        "run",
        help="full single-plate pipeline (curve fit -> back-calculation -> precision/recovery)",
        description="Run the full single-plate pipeline and write per-well, per-level and fit results.",
    )
    run.add_argument("--data", required=True, type=Path, help="raw signal CSV (plate grid or well/value table)")
    run.add_argument("--template", required=True, type=Path, help="plate template YAML defining well roles")
    run.add_argument("--output", type=Path, default=Path("."), help="output directory (default: .)")
    run.add_argument(
        "--curve-model",
        choices=MODELS,
        default="4pl",
        help="standard curve model (default: 4pl)",
    )
    run.add_argument(
        "--weighting",
        choices=WEIGHTINGS,
        default="1/y2",
        help="least-squares weighting on the response (default: 1/y2, as SoftMax Pro commonly defaults)",
    )
    run.add_argument(
        "--plate-id",
        default=None,
        help="plate label carried into the results and used by 'compare' (default: template id, else the data filename)",
    )
    run.add_argument(
        "--blank-handling",
        choices=[str(b) for b in BlankHandling],
        default=None,
        help="override the template: subtract the blank mean from every well, or use raw signal",
    )
    run.add_argument("--quiet", action="store_true", help="write files without printing a summary")
    run.set_defaults(func=cmd_run)

    compare = subparsers.add_parser(
        "compare",
        help="cross-plate intermediate precision and accuracy vs a reference set",
        description=(
            "Combine per-well results from several 'run' invocations, decompose within- and "
            "between-run variance, and score accuracy against nominal or reference values."
        ),
    )
    compare.add_argument(
        "plates",
        nargs="+",
        type=Path,
        metavar="RESULTS",
        help="plate result files (*_results.json or *_wells.csv) and/or directories containing them",
    )
    compare.add_argument(
        "--reference",
        type=Path,
        default=None,
        help="CSV of reference values per group (columns: group + nominal, or group + concentration)",
    )
    compare.add_argument("--output", type=Path, default=Path("."), help="output directory (default: .)")
    compare.add_argument(
        "--include-out-of-range",
        action="store_true",
        help="include wells flagged below/above the curve range (excluded by default)",
    )
    compare.add_argument("--quiet", action="store_true", help="write files without printing a summary")
    compare.set_defaults(func=cmd_compare)

    return parser


def cmd_run(args: argparse.Namespace) -> int:
    template = plate_io.load_template(args.template)
    values = plate_io.load_plate_csv(args.data, template["plate_format"])
    plate_id = args.plate_id or template["plate_id"] or Path(args.data).stem
    plate = build_plate(
        template,
        values,
        plate_id=plate_id,
        blank_handling=args.blank_handling,
        source=str(args.data),
    )

    frame = corrected_frame(plate)
    standards = frame[frame["role"] == "standard"].reset_index(drop=True)
    samples = frame[frame["role"] == "sample"].reset_index(drop=True)
    blanks = frame[frame["role"] == "blank"].reset_index(drop=True)

    fit = fit_standard_curve(standards, model=args.curve_model, weighting=args.weighting)
    sample_results = back_calculate(fit, samples)
    standard_results = fit.standards_table
    levels = stats.precision_recovery(sample_results)

    wells = pd.concat([standard_results, sample_results, blanks], ignore_index=True)
    wells = wells.reindex(columns=WELL_COLUMNS)
    wells = wells.sort_values(["role", "col", "row"], kind="stable").reset_index(drop=True)

    payload = {
        "platefit_version": __version__,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "plate": {
            "plate_id": plate.plate_id,
            "assay": template["assay"],
            "units": template["units"],
            "format": plate.plate_format,
            "data_file": plate.source,
            "template_file": str(args.template),
            "blank_handling": str(plate.blank_handling),
            "blanks": plate.blank_stats(),
            "wells_assigned": len(plate.wells),
            "wells_unassigned": plate.unassigned_wells,
        },
        "fit": fit_summary(fit),
        "levels": levels,
        "wells": wells,
    }

    written = plate_io.write_results(
        args.output,
        plate.plate_id,
        tables={"wells": wells, "levels": levels, "standards": standard_results},
        payload=payload,
    )

    if not args.quiet:
        print(f"plate {plate.plate_id}  ({len(plate.wells)} assigned wells, {plate.unassigned_wells} ignored)")
        print(f"  blank handling : {plate.blank_handling} (blank mean {_fmt(plate.blank_stats()['mean'])})")
        print(f"  curve          : {fit.model}, weighting {fit.weighting}, "
              f"R2 {_fmt(fit.r_squared)}, n={fit.n_standards}, converged={fit.converged}")
        if fit.params:
            print("  params         : " + ", ".join(f"{k}={_fmt(v)}" for k, v in fit.params.items()))
        print(f"  calibrated range: {_fmt(fit.conc_range[0])} - {_fmt(fit.conc_range[1])}")
        _print_frame("\nStandards (back-calculated)", standard_results, STANDARD_VIEW)
        _print_frame("\nLevels", levels, LEVEL_VIEW)
        _print_status_counts(sample_results)
        _print_written(written)
    return 0


def cmd_compare(args: argparse.Namespace) -> int:
    wells = plate_io.read_results_frames(args.plates)
    if "role" in wells.columns:
        wells = wells[wells["role"] == "sample"]
    wells = wells.reset_index(drop=True)
    if "plate_id" not in wells.columns:
        raise PlateError("plate results have no 'plate_id' column; re-run 'platefit run' to regenerate them")

    include = args.include_out_of_range
    reference = plate_io.load_reference(args.reference) if args.reference else None

    # The status/finiteness filter lives in stats, so every summary applies it
    # identically; here we only count what it will drop, for the summary line.
    usable = stats.usable_wells(wells, include)
    ip = stats.intermediate_precision(wells, include_out_of_range=include)
    accuracy = stats.accuracy_vs_reference(wells, reference, include_out_of_range=include)
    per_plate = (
        pd.concat(
            [
                stats.precision_recovery(frame, include_out_of_range=include).assign(plate_id=plate_id)
                for plate_id, frame in wells.groupby("plate_id", sort=True)
            ],
            ignore_index=True,
        )
        if not wells.empty
        else pd.DataFrame()
    )
    if not per_plate.empty:
        per_plate = per_plate[["plate_id"] + [c for c in per_plate.columns if c != "plate_id"]]

    payload = {
        "platefit_version": __version__,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "inputs": sorted(set(wells["source_file"])) if "source_file" in wells.columns else [],
        "plates": sorted(set(wells["plate_id"].astype(str))) if not wells.empty else [],
        "reference_file": str(args.reference) if args.reference else None,
        "include_out_of_range": include,
        "sample_wells": int(len(wells)),
        "excluded_wells": int(len(wells) - len(usable)),
        "intermediate_precision": ip,
        "accuracy": accuracy,
        "per_plate_levels": per_plate,
    }
    written = plate_io.write_results(
        args.output,
        "compare",
        tables={"intermediate_precision": ip, "accuracy": accuracy, "per_plate_levels": per_plate},
        payload=payload,
    )

    if not args.quiet:
        plates = payload["plates"]
        print(f"compared {len(plates)} plate(s): {', '.join(plates) if plates else '-'}")
        print(f"  sample wells   : {payload['sample_wells']} ({payload['excluded_wells']} excluded"
              + (" -- none, --include-out-of-range is set" if include else " as out-of-range or missing")
              + ")")
        _print_frame("\nIntermediate precision (%CV of the grand mean)", ip, INTERMEDIATE_VIEW)
        _print_frame("\nAccuracy vs reference", accuracy, ACCURACY_VIEW)
        _print_written(written)
    return 0


STANDARD_VIEW = ["well", "group", "nominal", "signal", "concentration", "recovery_percent", "status"]
LEVEL_VIEW = ["group", "nominal", "n", "n_wells", "mean", "sd", "cv_percent", "recovery_percent"]
INTERMEDIATE_VIEW = [
    "group",
    "nominal",
    "n_plates",
    "n_total",
    "n_effective",
    "grand_mean",
    "recovery_percent",
    "repeatability_cv_percent",
    "between_run_cv_percent",
    "intermediate_precision_cv_percent",
]
ACCURACY_VIEW = [
    "group",
    "reference_value",
    "reference_source",
    "n_total",
    "grand_mean",
    "cv_percent",
    "recovery_percent",
    "bias_percent",
]


def fit_summary(fit) -> dict:
    return {
        "model": fit.model,
        "weighting": fit.weighting,
        "params": fit.params,
        "r_squared": fit.r_squared,
        "converged": fit.converged,
        "n_standards": fit.n_standards,
        "conc_range": list(fit.conc_range),
        "signal_range": list(fit.signal_range),
        "fitted_signal_range": list(fit.fitted_signal_range),
        "r_squared_weighted": fit.r_squared_weighted,
        "rmse": fit.rmse,
        "weighted_sse": fit.weighted_sse,
        "weight_floor": fit.weight_floor,
        "excluded_standards": fit.excluded_standards,
        "notes": fit.notes,
        "residuals": list(fit.residuals),
        "standards": fit.standards_table,
    }


def _fmt(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return "n/a"
    if isinstance(value, float):
        return f"{value:,.6g}"
    return str(value)


def _print_frame(title: str, frame: pd.DataFrame, columns: list[str] | None) -> None:
    if frame is None or frame.empty:
        print(f"{title}: (none)")
        return
    view = frame
    if columns:
        view = frame.reindex(columns=[c for c in columns if c in frame.columns])
    print(title)
    print(view.to_string(index=False, float_format=lambda v: f"{v:,.6g}", na_rep="n/a"))


def _print_status_counts(results: pd.DataFrame) -> None:
    if results.empty or "status" not in results.columns:
        return
    counts = results["status"].value_counts()
    print("\nSample well status: " + ", ".join(f"{k}={v}" for k, v in counts.items()))


def _print_written(written: dict[str, Path]) -> None:
    print("\nWrote:")
    for path in written.values():
        print(f"  {path}")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (PlateError, CurveFitError) as exc:
        print(f"platefit: error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
