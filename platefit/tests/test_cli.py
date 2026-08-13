"""End-to-end tests over the committed synthetic plates."""

import json
from pathlib import Path

import pandas as pd
import pytest

from platefit.cli import main

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"
TEMPLATE = EXAMPLES / "template_96.yaml"
PLATES = {"PLATE-A": "plate_a.csv", "PLATE-B": "plate_b.csv", "PLATE-C": "plate_c.csv"}


def run_plate(plate_id, output, *extra):
    code = main(
        [
            "run",
            "--data", str(EXAMPLES / PLATES[plate_id]),
            "--template", str(TEMPLATE),
            "--output", str(output),
            "--plate-id", plate_id,
            "--quiet",
            *extra,
        ]
    )
    assert code == 0
    return json.loads((Path(output) / f"{plate_id}_results.json").read_text())


def test_run_writes_every_output(tmp_path):
    run_plate("PLATE-A", tmp_path)
    written = sorted(p.name for p in tmp_path.iterdir())
    assert written == [
        "PLATE-A_levels.csv",
        "PLATE-A_results.json",
        "PLATE-A_standards.csv",
        "PLATE-A_wells.csv",
    ]


def test_run_fits_the_curve_and_recovers_the_qc_levels(tmp_path):
    payload = run_plate("PLATE-A", tmp_path)
    fit = payload["fit"]
    assert fit["model"] == "4pl" and fit["weighting"] == "1/y2"
    assert fit["converged"] is True
    assert fit["r_squared"] > 0.999
    assert fit["conc_range"] == [1.5625, 200.0]

    levels = pd.DataFrame(payload["levels"]).set_index("group")
    for group in ("QC-HIGH", "QC-MID", "QC-LOW"):
        assert levels.loc[group, "recovery_percent"] == pytest.approx(100, abs=10)
        assert levels.loc[group, "cv_percent"] < 10


def test_run_flags_the_deliberately_out_of_range_qcs(tmp_path):
    payload = run_plate("PLATE-A", tmp_path)
    wells = pd.DataFrame(payload["wells"])
    assert set(wells.loc[wells["group"] == "QC-ABOVE", "status"]) == {"above_range"}
    assert set(wells.loc[wells["group"] == "QC-BELOW", "status"]) == {"below_range"}
    assert set(wells.loc[wells["role"] == "standard", "status"]) == {"in_range"}
    assert set(wells.loc[wells["group"] == "QC-HIGH", "status"]) == {"in_range"}


def test_unknown_groups_recover_their_true_concentrations(tmp_path):
    """The synthetic generator put known truths behind the unknowns."""
    payload = run_plate("PLATE-A", tmp_path)
    levels = pd.DataFrame(payload["levels"]).set_index("group")
    for group, truth in {"UNK-001": 120.0, "UNK-002": 22.0, "UNK-003": 4.5, "UNK-004": 60.0}.items():
        assert levels.loc[group, "mean"] == pytest.approx(truth, rel=0.10)


def test_blank_handling_is_recorded_and_overridable(tmp_path):
    payload = run_plate("PLATE-A", tmp_path)
    assert payload["plate"]["blank_handling"] == "subtract_mean"
    assert payload["plate"]["blanks"]["n"] == 2

    other = tmp_path / "raw"
    payload = run_plate("PLATE-A", other, "--blank-handling", "none")
    assert payload["plate"]["blank_handling"] == "none"
    wells = pd.DataFrame(payload["wells"])
    assert (wells["blank_offset"] == 0).all()


@pytest.mark.parametrize("model", ["4pl", "5pl", "semilog"])
@pytest.mark.parametrize("weighting", ["none", "1/y", "1/y2"])
def test_every_model_and_weighting_combination_runs(tmp_path, model, weighting):
    payload = run_plate("PLATE-A", tmp_path / f"{model}-{weighting}", "--curve-model", model,
                        "--weighting", weighting)
    assert payload["fit"]["converged"] is True
    assert payload["fit"]["model"] == model
    assert payload["fit"]["weighting"] == weighting


def test_compare_decomposes_variance_across_plates(tmp_path):
    results = tmp_path / "results"
    for plate_id in PLATES:
        run_plate(plate_id, results)

    output = tmp_path / "compare"
    assert main(["compare", str(results), "--reference", str(EXAMPLES / "reference_qc.csv"),
                 "--output", str(output), "--quiet"]) == 0

    payload = json.loads((output / "compare_results.json").read_text())
    assert payload["plates"] == ["PLATE-A", "PLATE-B", "PLATE-C"]

    ip = pd.DataFrame(payload["intermediate_precision"]).set_index("group")
    for group in ("QC-HIGH", "QC-MID", "QC-LOW"):
        row = ip.loc[group]
        assert row["n_plates"] == 3
        assert row["anova_source"] == "statsmodels_anova_lm_typ2"
        # The generator applies a per-run handling bias, so between-run variance is real.
        assert row["between_run_cv_percent"] > 0
        assert row["intermediate_precision_cv_percent"] == pytest.approx(
            (row["repeatability_cv_percent"] ** 2 + row["between_run_cv_percent"] ** 2) ** 0.5
        )

    accuracy = pd.DataFrame(payload["accuracy"]).set_index("group")
    for group in ("QC-HIGH", "QC-MID", "QC-LOW"):
        assert accuracy.loc[group, "reference_source"] == "nominal"
        assert accuracy.loc[group, "recovery_percent"] == pytest.approx(100, abs=10)


def test_compare_accepts_explicit_files_and_excludes_out_of_range(tmp_path):
    results = tmp_path / "results"
    for plate_id in PLATES:
        run_plate(plate_id, results)
    files = [str(results / f"{plate_id}_wells.csv") for plate_id in PLATES]

    output = tmp_path / "compare"
    assert main(["compare", *files, "--output", str(output), "--quiet"]) == 0
    payload = json.loads((output / "compare_results.json").read_text())
    assert payload["sample_wells"] == 60
    assert payload["excluded_wells"] == 12  # QC-ABOVE and QC-BELOW, 4 wells x 3 plates
    assert payload["include_out_of_range"] is False

    kept = tmp_path / "compare-all"
    assert main(["compare", *files, "--output", str(kept), "--include-out-of-range", "--quiet"]) == 0
    payload = json.loads((kept / "compare_results.json").read_text())
    assert payload["excluded_wells"] == 0
    groups = {row["group"] for row in payload["intermediate_precision"]}
    assert {"QC-ABOVE", "QC-BELOW"} <= groups


def test_missing_input_exits_nonzero_with_a_message(tmp_path, capsys):
    code = main(["run", "--data", str(tmp_path / "nope.csv"), "--template", str(TEMPLATE),
                 "--output", str(tmp_path)])
    assert code == 1
    assert "data file not found" in capsys.readouterr().err


def test_help_lists_both_subcommands(capsys):
    with pytest.raises(SystemExit):
        main(["--help"])
    out = capsys.readouterr().out
    assert "run" in out and "compare" in out
