"""In-memory plate representation: well position -> role, nominal concentration, group, raw value.

The data model is deliberately dumb and pure: it knows how to name wells, how to
join a template to a raw-signal grid, and how to hand out tidy frames. All of the
numerics live in :mod:`platefit.curve` and :mod:`platefit.stats`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum

import pandas as pd

#: Supported plate formats, keyed by well count -> (n_rows, n_cols).
PLATE_FORMATS: dict[int, tuple[int, int]] = {6: (2, 3), 24: (4, 6), 96: (8, 12), 384: (16, 24)}

DEFAULT_FORMAT = 96

_WELL_RE = re.compile(r"^\s*([A-Za-z])\s*0*(\d{1,2})\s*$")
_RANGE_RE = re.compile(r"^\s*([A-Za-z]\s*0*\d{1,2})\s*[-:]\s*([A-Za-z]\s*0*\d{1,2})\s*$")


class PlateError(ValueError):
    """Raised for malformed plate data, templates, or well references."""


class WellRole(str, Enum):
    """What a well is for. QC wells are samples that carry a nominal concentration."""

    STANDARD = "standard"
    SAMPLE = "sample"
    BLANK = "blank"

    def __str__(self) -> str:  # keeps DataFrame columns as plain strings
        return self.value


class BlankHandling(str, Enum):
    """How declared blank wells feed into the analysed signal."""

    SUBTRACT_MEAN = "subtract_mean"
    NONE = "none"

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class Well:
    """One well of the plate.

    ``nominal`` is the known concentration for standards and for QC-style sample
    groups; it is ``None`` for unknowns. ``group`` is the replicate-group id used
    to aggregate precision (standards use their level id).
    """

    position: str
    role: WellRole
    group: str
    raw_value: float | None = None
    nominal: float | None = None


@dataclass
class Plate:
    """A template-assigned plate, optionally carrying raw signal values."""

    plate_id: str
    wells: list[Well] = field(default_factory=list)
    plate_format: int = DEFAULT_FORMAT
    blank_handling: BlankHandling = BlankHandling.SUBTRACT_MEAN
    source: str | None = None
    unassigned_wells: int = 0

    def frame(self) -> pd.DataFrame:
        """Tidy one-row-per-assigned-well frame, sorted by column then row."""
        rows = [
            {
                "plate_id": self.plate_id,
                "well": w.position,
                "row": w.position[0],
                "col": int(w.position[1:]),
                "role": str(w.role),
                "group": w.group,
                "nominal": w.nominal,
                "raw_value": w.raw_value,
            }
            for w in self.wells
        ]
        columns = ["plate_id", "well", "row", "col", "role", "group", "nominal", "raw_value"]
        df = pd.DataFrame(rows, columns=columns)
        if df.empty:
            return df
        return df.sort_values(["col", "row"], kind="stable").reset_index(drop=True)

    @property
    def blank_wells(self) -> list[Well]:
        return [w for w in self.wells if w.role is WellRole.BLANK]

    def blank_stats(self) -> dict[str, float | int | None]:
        """Mean/SD/n of the blank wells (``None`` mean when there are no blanks)."""
        values = pd.Series([w.raw_value for w in self.blank_wells], dtype="float64").dropna()
        if values.empty:
            return {"n": 0, "mean": None, "sd": None}
        return {
            "n": int(values.size),
            "mean": float(values.mean()),
            "sd": float(values.std(ddof=1)) if values.size > 1 else None,
        }


def row_letters(plate_format: int = DEFAULT_FORMAT) -> list[str]:
    n_rows, _ = plate_dims(plate_format)
    return [chr(ord("A") + i) for i in range(n_rows)]


def plate_dims(plate_format: int = DEFAULT_FORMAT) -> tuple[int, int]:
    try:
        return PLATE_FORMATS[int(plate_format)]
    except (KeyError, TypeError, ValueError):
        known = ", ".join(str(k) for k in sorted(PLATE_FORMATS))
        raise PlateError(f"unsupported plate format {plate_format!r} (known: {known})") from None


def normalize_well(raw: str, plate_format: int = DEFAULT_FORMAT) -> str:
    """``'a01'`` -> ``'A1'``, validated against the plate's dimensions."""
    match = _WELL_RE.match(str(raw))
    if not match:
        raise PlateError(f"malformed well reference {raw!r} (expected e.g. 'A1' or 'H12')")
    letter, digits = match.group(1).upper(), int(match.group(2))
    n_rows, n_cols = plate_dims(plate_format)
    row_index = ord(letter) - ord("A")
    if not 0 <= row_index < n_rows:
        raise PlateError(
            f"well {raw!r} row {letter!r} is outside a {plate_format}-well plate "
            f"(rows A-{chr(ord('A') + n_rows - 1)})"
        )
    if not 1 <= digits <= n_cols:
        raise PlateError(
            f"well {raw!r} column {digits} is outside a {plate_format}-well plate (columns 1-{n_cols})"
        )
    return f"{letter}{digits}"


def expand_wells(spec: str | list | tuple, plate_format: int = DEFAULT_FORMAT) -> list[str]:
    """Expand a template well spec into normalized positions.

    Accepts a single well (``A1``), a rectangular range (``A1-B6`` or ``A1:B6``,
    inclusive of both corners), or a list mixing the two. Order is preserved and
    duplicates within one spec are rejected.
    """
    items = spec if isinstance(spec, (list, tuple)) else [spec]
    out: list[str] = []
    for item in items:
        if isinstance(item, (list, tuple)):
            out.extend(expand_wells(list(item), plate_format))
            continue
        text = str(item)
        match = _RANGE_RE.match(text)
        if match:
            start = normalize_well(match.group(1), plate_format)
            end = normalize_well(match.group(2), plate_format)
            r0, r1 = sorted((ord(start[0]), ord(end[0])))
            c0, c1 = sorted((int(start[1:]), int(end[1:])))
            out.extend(
                f"{chr(r)}{c}" for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)
            )
        else:
            out.append(normalize_well(text, plate_format))
    seen: set[str] = set()
    for well in out:
        if well in seen:
            raise PlateError(f"well {well} listed twice in the same spec {spec!r}")
        seen.add(well)
    return out


def corrected_frame(plate: Plate, blank_handling: BlankHandling | str | None = None) -> pd.DataFrame:
    """Plate frame plus the ``signal`` column that every downstream stage reads.

    ``signal`` is ``raw_value`` minus the blank mean under
    :attr:`BlankHandling.SUBTRACT_MEAN`, and ``raw_value`` verbatim otherwise.
    Blank wells themselves are kept in the frame (corrected alongside) so the
    subtraction is auditable, but they carry no nominal and are never fitted.
    """
    mode = BlankHandling(str(blank_handling)) if blank_handling is not None else plate.blank_handling
    df = plate.frame()
    if df.empty:
        df["signal"] = pd.Series(dtype="float64")
        df["blank_offset"] = pd.Series(dtype="float64")
        return df
    stats = plate.blank_stats()
    offset = 0.0
    if mode is BlankHandling.SUBTRACT_MEAN:
        if stats["mean"] is None:
            raise PlateError(
                "blank_handling='subtract_mean' but the template declares no blank wells "
                "(add blanks, or set blank_handling: none)"
            )
        offset = float(stats["mean"])
    df["blank_offset"] = offset
    df["signal"] = df["raw_value"].astype("float64") - offset
    return df


def build_plate(
    template: dict,
    values: dict[str, float],
    plate_id: str | None = None,
    blank_handling: BlankHandling | str | None = None,
    source: str | None = None,
) -> Plate:
    """Join a parsed template (see :func:`platefit.io.load_template`) to raw values."""
    plate_format = int(template.get("plate_format", DEFAULT_FORMAT))
    wells: list[Well] = []
    assigned: set[str] = set()

    def claim(position: str, role: WellRole, group: str, nominal: float | None) -> None:
        if position in assigned:
            raise PlateError(f"well {position} is assigned more than once in the template")
        assigned.add(position)
        wells.append(
            Well(
                position=position,
                role=role,
                group=group,
                raw_value=values.get(position),
                nominal=nominal,
            )
        )

    for level in template["standards"]:
        for position in level["wells"]:
            claim(position, WellRole.STANDARD, level["level"], float(level["nominal"]))
    for group in template["samples"]:
        nominal = group.get("nominal")
        for position in group["wells"]:
            claim(position, WellRole.SAMPLE, group["group"], None if nominal is None else float(nominal))
    for position in template["blanks"]:
        claim(position, WellRole.BLANK, "BLANK", None)

    missing = sorted(w.position for w in wells if w.raw_value is None or pd.isna(w.raw_value))
    if missing:
        raise PlateError(
            f"{len(missing)} template well(s) have no value in the data file: {', '.join(missing[:8])}"
            + (" ..." if len(missing) > 8 else "")
        )

    # An explicit choice (CLI flag or template key) is honoured as written -- and
    # will fail loudly in corrected_frame if it asks to subtract absent blanks.
    # Only the unstated default adapts to whether blanks exist.
    explicit = blank_handling if blank_handling is not None else template.get("blank_handling")
    if explicit is not None:
        mode = BlankHandling(str(explicit))
    else:
        mode = BlankHandling.SUBTRACT_MEAN if template["blanks"] else BlankHandling.NONE

    return Plate(
        plate_id=plate_id or template.get("plate_id") or "plate",
        wells=wells,
        plate_format=plate_format,
        blank_handling=mode,
        source=source,
        unassigned_wells=len(set(values) - assigned),
    )
