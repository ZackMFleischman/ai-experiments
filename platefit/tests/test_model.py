import pandas as pd
import pytest

from platefit.model import (
    BlankHandling,
    PlateError,
    WellRole,
    build_plate,
    corrected_frame,
    expand_wells,
    normalize_well,
)


def template(**overrides):
    base = {
        "plate_format": 96,
        "standards": [{"level": "STD1", "nominal": 10.0, "wells": ["A1", "A2"]}],
        "samples": [{"group": "QC", "nominal": 5.0, "wells": ["B1"]}],
        "blanks": ["H12"],
    }
    base.update(overrides)
    return base


@pytest.mark.parametrize(
    "raw,expected",
    [("A1", "A1"), ("a01", "A1"), (" h12 ", "H12"), ("B09", "B9"), ("C 3", "C3")],
)
def test_normalize_well(raw, expected):
    assert normalize_well(raw) == expected


@pytest.mark.parametrize("raw", ["I1", "A13", "A0", "1A", "", "AA1"])
def test_normalize_well_rejects_off_plate(raw):
    with pytest.raises(PlateError):
        normalize_well(raw)


def test_normalize_well_respects_format():
    assert normalize_well("P24", plate_format=384) == "P24"
    with pytest.raises(PlateError):
        normalize_well("P24", plate_format=96)


def test_expand_wells_rectangular_range():
    assert expand_wells("A1-B3") == ["A1", "A2", "A3", "B1", "B2", "B3"]
    assert expand_wells("B3:A1") == expand_wells("A1-B3")
    assert expand_wells(["A1", "C5-C6"]) == ["A1", "C5", "C6"]


def test_expand_wells_rejects_duplicates():
    with pytest.raises(PlateError, match="listed twice"):
        expand_wells(["A1", "a01"])


def test_build_plate_assigns_roles_and_values():
    values = {"A1": 1.0, "A2": 1.1, "B1": 0.5, "H12": 0.05, "D4": 9.9}
    plate = build_plate(template(), values, plate_id="P1")
    by_position = {w.position: w for w in plate.wells}
    assert by_position["A1"].role is WellRole.STANDARD
    assert by_position["A1"].nominal == 10.0
    assert by_position["B1"].role is WellRole.SAMPLE
    assert by_position["B1"].group == "QC"
    assert by_position["H12"].role is WellRole.BLANK
    assert plate.unassigned_wells == 1  # D4 is not in the template


def test_build_plate_rejects_double_assignment():
    doubled = template(samples=[{"group": "QC", "nominal": 5.0, "wells": ["A1"]}])
    with pytest.raises(PlateError, match="more than once"):
        build_plate(doubled, {"A1": 1.0, "A2": 1.0, "H12": 0.1})


def test_build_plate_reports_missing_values():
    with pytest.raises(PlateError, match="no value in the data file"):
        build_plate(template(), {"A1": 1.0, "A2": 1.0, "H12": 0.1})  # B1 missing


def test_build_plate_rejects_nan_values():
    with pytest.raises(PlateError, match="no value in the data file"):
        build_plate(template(), {"A1": 1.0, "A2": 1.0, "B1": float("nan"), "H12": 0.1})


def test_blank_subtraction_uses_the_blank_mean():
    values = {"A1": 1.0, "A2": 1.2, "B1": 0.6, "H12": 0.1}
    plate = build_plate(template(), values)
    frame = corrected_frame(plate)
    assert plate.blank_handling is BlankHandling.SUBTRACT_MEAN
    assert frame.loc[frame["well"] == "A1", "signal"].iloc[0] == pytest.approx(0.9)
    assert frame.loc[frame["well"] == "B1", "signal"].iloc[0] == pytest.approx(0.5)


def test_blank_handling_none_leaves_raw_signal():
    values = {"A1": 1.0, "A2": 1.2, "B1": 0.6, "H12": 0.1}
    plate = build_plate(template(), values, blank_handling="none")
    frame = corrected_frame(plate)
    assert frame.loc[frame["well"] == "A1", "signal"].iloc[0] == pytest.approx(1.0)


def test_default_blank_handling_adapts_when_no_blanks_declared():
    no_blanks = template(blanks=[])
    plate = build_plate(no_blanks, {"A1": 1.0, "A2": 1.2, "B1": 0.6})
    assert plate.blank_handling is BlankHandling.NONE
    assert corrected_frame(plate)["signal"].iloc[0] == pytest.approx(1.0)


def test_explicit_blank_subtraction_without_blanks_is_an_error():
    no_blanks = template(blanks=[])
    plate = build_plate(no_blanks, {"A1": 1.0, "A2": 1.2, "B1": 0.6}, blank_handling="subtract_mean")
    with pytest.raises(PlateError, match="declares no blank wells"):
        corrected_frame(plate)


def test_frame_is_tidy_and_sorted():
    values = {"A1": 1.0, "A2": 1.2, "B1": 0.6, "H12": 0.1}
    frame = build_plate(template(), values).frame()
    assert isinstance(frame, pd.DataFrame)
    assert list(frame["well"]) == ["A1", "B1", "A2", "H12"]  # column-major
