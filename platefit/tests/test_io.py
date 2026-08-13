import json

import pandas as pd
import pytest

from platefit.io import (
    jsonable,
    load_plate_csv,
    load_reference,
    load_template,
    read_results_frames,
    write_results,
)
from platefit.model import PlateError

GRID = """,1,2,3
A,0.10,0.20,0.30
B,0.40,0.50,0.60
"""

LONG = """well,value
A1,0.10
A2,0.20
A3,0.30
B1,0.40
B2,0.50
B3,0.60
"""

TEMPLATE = """
plate:
  id: P1
  format: 96
  units: ng/mL
standards:
  - level: STD1
    nominal: 100
    wells: [A1, A2]
  - level: STD2
    nominal: 10
    wells: B1-B2
samples:
  - group: QC
    nominal: 50
    wells: [C1]
  - group: UNK
    wells: [D1, D2]
blanks:
  wells: [H11, H12]
"""


def write(tmp_path, name, text):
    path = tmp_path / name
    path.write_text(text)
    return path


def test_grid_and_long_formats_agree(tmp_path):
    from_grid = load_plate_csv(write(tmp_path, "grid.csv", GRID))
    from_long = load_plate_csv(write(tmp_path, "long.csv", LONG))
    assert from_grid == from_long
    assert from_grid["A1"] == pytest.approx(0.10)
    assert from_grid["B3"] == pytest.approx(0.60)
    assert len(from_grid) == 6


def test_grid_respects_the_header_column_numbers(tmp_path):
    """A partial export starting at column 5 must not be read as columns 1-3."""
    path = write(tmp_path, "offset.csv", ",5,6\nA,1.5,1.6\n")
    assert load_plate_csv(path) == {"A5": 1.5, "A6": 1.6}


def test_long_format_accepts_alternative_column_names(tmp_path):
    path = write(tmp_path, "alt.csv", "position,od\na01,0.25\nH12,0.05\n")
    assert load_plate_csv(path) == {"A1": 0.25, "H12": 0.05}


def test_blank_cells_are_skipped_and_non_numeric_is_an_error(tmp_path):
    assert load_plate_csv(write(tmp_path, "gap.csv", ",1,2\nA,0.1,\n")) == {"A1": 0.1}
    with pytest.raises(PlateError, match="non-numeric signal"):
        load_plate_csv(write(tmp_path, "bad.csv", ",1,2\nA,0.1,abc\n"))


def test_duplicate_wells_are_rejected(tmp_path):
    path = write(tmp_path, "dupe.csv", "well,value\nA1,0.1\nA1,0.2\n")
    with pytest.raises(PlateError, match="appears twice"):
        load_plate_csv(path)


def test_missing_file_is_a_clear_error(tmp_path):
    with pytest.raises(PlateError, match="data file not found"):
        load_plate_csv(tmp_path / "nope.csv")


def test_unreadable_shape_is_a_clear_error(tmp_path):
    with pytest.raises(PlateError, match="could not read a plate grid"):
        load_plate_csv(write(tmp_path, "junk.csv", "foo,bar\n1,2\n"))


def test_template_is_parsed_and_normalized(tmp_path):
    template = load_template(write(tmp_path, "t.yaml", TEMPLATE))
    assert template["plate_id"] == "P1"
    assert template["units"] == "ng/mL"
    assert template["standards"][0] == {"level": "STD1", "nominal": 100.0, "wells": ["A1", "A2"]}
    assert template["standards"][1]["wells"] == ["B1", "B2"]  # range expanded
    assert template["samples"][0]["nominal"] == 50.0
    assert template["samples"][1]["nominal"] is None  # unknowns have none
    assert template["blanks"] == ["H11", "H12"]


@pytest.mark.parametrize(
    "text,message",
    [
        ("standards: []\n", "declares no standards"),
        ("standards:\n  - level: S1\n    wells: [A1]\n", "missing 'nominal'"),
        ("standards:\n  - level: S1\n    nominal: 1\n", "missing 'wells'"),
        ("standards:\n  - level: S1\n    nominal: -5\n    wells: [A1]\n", "non-negative"),
        (
            "standards:\n  - level: S1\n    nominal: 1\n    wells: [A1]\n"
            "  - level: S1\n    nominal: 2\n    wells: [A2]\n",
            "duplicate standard level",
        ),
        (
            "standards:\n  - level: S1\n    nominal: 1\n    wells: [A1]\nsamples:\n  - wells: [B1]\n",
            "missing 'group'",
        ),
        ("plate:\n  format: 97\nstandards: []\n", "unsupported plate format"),
    ],
)
def test_template_validation_errors(tmp_path, text, message):
    with pytest.raises(PlateError, match=message):
        load_template(write(tmp_path, "bad.yaml", text))


def test_write_results_writes_csvs_and_json(tmp_path):
    table = pd.DataFrame({"group": ["QC"], "mean": [1.5]})
    written = write_results(tmp_path / "out", "P1", {"levels": table}, {"fit": {"r_squared": 0.99}})
    assert written["levels"].name == "P1_levels.csv"
    assert pd.read_csv(written["levels"]).equals(table)
    assert json.loads(written["json"].read_text())["fit"]["r_squared"] == 0.99


def test_jsonable_handles_frames_and_non_finite_numbers():
    payload = jsonable(
        {"frame": pd.DataFrame({"a": [1, 2]}), "nan": float("nan"), "inf": float("inf")}
    )
    assert payload["frame"] == [{"a": 1}, {"a": 2}]
    assert payload["nan"] is None and payload["inf"] is None
    json.dumps(payload)  # must be serialisable


def test_read_results_frames_from_files_and_directories(tmp_path):
    for plate in ("P1", "P2"):
        frame = pd.DataFrame({"plate_id": [plate], "group": ["QC"], "concentration": [1.0]})
        write_results(tmp_path, plate, {"wells": frame})
    combined = read_results_frames([tmp_path])
    assert sorted(combined["plate_id"]) == ["P1", "P2"]
    assert "source_file" in combined.columns
    assert read_results_frames([tmp_path / "P1_wells.csv"]).shape[0] == 1


def test_read_results_frames_prefers_json_and_reads_its_wells(tmp_path):
    write_results(tmp_path, "P1", {"wells": pd.DataFrame({"x": [1]})},
                  {"plate": {"plate_id": "P1"}, "wells": [{"group": "QC", "concentration": 2.0}]})
    combined = read_results_frames([tmp_path])
    assert list(combined["concentration"]) == [2.0]
    assert list(combined["plate_id"]) == ["P1"]


def test_read_results_frames_rejects_an_empty_directory(tmp_path):
    with pytest.raises(PlateError, match="no \\*_results.json"):
        read_results_frames([tmp_path])


def test_load_reference_from_nominal_or_measured(tmp_path):
    nominal = load_reference(write(tmp_path, "n.csv", "group,nominal\nQC,10\n"))
    assert nominal.iloc[0].to_dict() == {
        "group": "QC",
        "reference_value": 10.0,
        "reference_source": "nominal",
    }
    measured = load_reference(write(tmp_path, "m.csv", "level,concentration\nQC,9\nQC,11\n"))
    assert measured.iloc[0]["reference_value"] == pytest.approx(10.0)
    assert measured.iloc[0]["reference_source"] == "measured"


def test_load_reference_needs_a_usable_column(tmp_path):
    with pytest.raises(PlateError, match="needs a 'group'"):
        load_reference(write(tmp_path, "r.csv", "thing,nominal\nQC,10\n"))
    with pytest.raises(PlateError, match="needs a 'nominal' or 'concentration'"):
        load_reference(write(tmp_path, "r2.csv", "group,other\nQC,10\n"))
