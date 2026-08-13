"""Reading raw plate data and templates; writing results.

Two raw-CSV shapes are accepted, auto-detected:

* **grid** -- a SoftMax-Pro-style matrix, row labels A..H down the first column
  and column numbers 1..12 across the header.
* **long** -- one row per well, with a well column (``well``/``position``/``wells``)
  and a value column (``value``/``signal``/``raw``/``od``/``rfu``/``result``).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Mapping

import numpy as np
import pandas as pd
import yaml

from platefit.model import (
    DEFAULT_FORMAT,
    BlankHandling,
    PlateError,
    expand_wells,
    normalize_well,
    plate_dims,
)

_WELL_COLUMNS = ("well", "wells", "position", "well_id", "well_position")
_VALUE_COLUMNS = ("value", "signal", "raw", "raw_value", "od", "rfu", "response", "result", "reading")


def load_plate_csv(path: str | Path, plate_format: int = DEFAULT_FORMAT) -> dict[str, float]:
    """Read a raw-signal CSV into ``{well position: value}``.

    Returns a plain dict rather than a frame so the template -- not the data
    file -- stays the single source of truth for what each well means.
    """
    path = Path(path)
    if not path.exists():
        raise PlateError(f"data file not found: {path}")
    raw = pd.read_csv(path, header=None, dtype=str, keep_default_na=False)
    if raw.empty:
        raise PlateError(f"data file is empty: {path}")

    header = [str(c).strip().lower() for c in raw.iloc[0].tolist()]
    well_col = next((i for i, name in enumerate(header) if name in _WELL_COLUMNS), None)
    value_col = next((i for i, name in enumerate(header) if name in _VALUE_COLUMNS), None)
    if well_col is not None and value_col is not None:
        return _read_long(raw, well_col, value_col, plate_format, path)
    return _read_grid(raw, plate_format, path)


def _to_float(text: Any, where: str) -> float:
    text = str(text).strip()
    if text == "" or text.lower() in {"na", "nan", "none", "-", "#sat", "sat"}:
        return math.nan
    try:
        return float(text.replace(",", ""))
    except ValueError:
        raise PlateError(f"non-numeric signal {text!r} at {where}") from None


def _read_long(
    raw: pd.DataFrame, well_col: int, value_col: int, plate_format: int, path: Path
) -> dict[str, float]:
    values: dict[str, float] = {}
    for line, row in enumerate(raw.iloc[1:].itertuples(index=False), start=2):
        cells = list(row)
        well_text = str(cells[well_col]).strip()
        if not well_text:
            continue
        well = normalize_well(well_text, plate_format)
        if well in values:
            raise PlateError(f"{path}: well {well} appears twice (line {line})")
        values[well] = _to_float(cells[value_col], f"{path} line {line}")
    if not values:
        raise PlateError(f"{path}: no well rows found in long-format file")
    return values


def _read_grid(raw: pd.DataFrame, plate_format: int, path: Path) -> dict[str, float]:
    n_rows, n_cols = plate_dims(plate_format)
    letters = {chr(ord("A") + i) for i in range(n_rows)}
    values: dict[str, float] = {}
    header: list[int] | None = None
    for line, row in enumerate(raw.itertuples(index=False), start=1):
        cells = [str(c).strip() for c in row]
        label = cells[0].upper()
        if label not in letters:
            # Header row: remember which spreadsheet column holds which plate column.
            numbers = [(i, c) for i, c in enumerate(cells) if c.isdigit()]
            if len(numbers) >= 2:
                header = [-1] * len(cells)
                for i, c in numbers:
                    header[i] = int(c)
            continue
        for i, cell in enumerate(cells[1:], start=1):
            column = header[i] if header is not None and i < len(header) else i
            if column is None or column < 1 or column > n_cols:
                continue
            if cell == "":
                continue
            well = f"{label}{column}"
            if well in values:
                raise PlateError(f"{path}: well {well} appears twice (line {line})")
            values[well] = _to_float(cell, f"{path} line {line} well {well}")
    if not values:
        raise PlateError(
            f"{path}: could not read a plate grid or a well/value table. Expected either row "
            f"labels A-{chr(ord('A') + n_rows - 1)} in the first column, or headers "
            f"'{_WELL_COLUMNS[0]}' and '{_VALUE_COLUMNS[0]}'."
        )
    return values


def load_template(path: str | Path) -> dict[str, Any]:
    """Parse and validate a plate template YAML.

    Returns a normalized dict with keys ``plate_format``, ``plate_id``,
    ``blank_handling``, ``standards`` (``level``/``nominal``/``wells``),
    ``samples`` (``group``/``nominal``/``wells``) and ``blanks`` (positions).
    """
    path = Path(path)
    if not path.exists():
        raise PlateError(f"template not found: {path}")
    doc = yaml.safe_load(path.read_text()) or {}
    if not isinstance(doc, dict):
        raise PlateError(f"{path}: template must be a YAML mapping")

    plate_section = doc.get("plate") or {}
    if not isinstance(plate_section, dict):
        raise PlateError(f"{path}: 'plate' must be a mapping")
    plate_format = int(plate_section.get("format", DEFAULT_FORMAT))
    plate_dims(plate_format)  # validates

    blank_handling = plate_section.get("blank_handling", doc.get("blank_handling"))
    if blank_handling is not None:
        try:
            blank_handling = str(BlankHandling(str(blank_handling)))
        except ValueError:
            choices = ", ".join(str(b) for b in BlankHandling)
            raise PlateError(f"{path}: blank_handling must be one of {choices}") from None

    standards = []
    for i, entry in enumerate(doc.get("standards") or [], start=1):
        if not isinstance(entry, dict):
            raise PlateError(f"{path}: standards[{i}] must be a mapping")
        if "nominal" not in entry:
            raise PlateError(f"{path}: standards[{i}] is missing 'nominal'")
        if "wells" not in entry:
            raise PlateError(f"{path}: standards[{i}] is missing 'wells'")
        nominal = _positive_or_zero(entry["nominal"], f"{path}: standards[{i}].nominal")
        standards.append(
            {
                "level": str(entry.get("level") or entry.get("name") or f"STD{i}"),
                "nominal": nominal,
                "wells": expand_wells(entry["wells"], plate_format),
            }
        )
    if not standards:
        raise PlateError(f"{path}: template declares no standards")

    samples = []
    for i, entry in enumerate(doc.get("samples") or [], start=1):
        if not isinstance(entry, dict):
            raise PlateError(f"{path}: samples[{i}] must be a mapping")
        if "wells" not in entry:
            raise PlateError(f"{path}: samples[{i}] is missing 'wells'")
        group = entry.get("group") or entry.get("id") or entry.get("name")
        if not group:
            raise PlateError(f"{path}: samples[{i}] is missing 'group'")
        nominal = entry.get("nominal")
        samples.append(
            {
                "group": str(group),
                "nominal": None
                if nominal is None
                else _positive_or_zero(nominal, f"{path}: samples[{i}].nominal"),
                "wells": expand_wells(entry["wells"], plate_format),
            }
        )

    blanks_section = doc.get("blanks") or []
    if isinstance(blanks_section, dict):
        blanks_section = blanks_section.get("wells") or []
    blanks = expand_wells(blanks_section, plate_format) if blanks_section else []

    duplicate_levels = _duplicates([s["level"] for s in standards])
    if duplicate_levels:
        raise PlateError(f"{path}: duplicate standard level id(s): {', '.join(duplicate_levels)}")
    duplicate_groups = _duplicates([s["group"] for s in samples])
    if duplicate_groups:
        raise PlateError(f"{path}: duplicate sample group id(s): {', '.join(duplicate_groups)}")

    return {
        "plate_format": plate_format,
        "plate_id": plate_section.get("id") or doc.get("plate_id"),
        "assay": plate_section.get("assay") or doc.get("assay"),
        "units": plate_section.get("units") or doc.get("units"),
        "blank_handling": blank_handling,
        "standards": standards,
        "samples": samples,
        "blanks": blanks,
    }


def _positive_or_zero(value: Any, where: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise PlateError(f"{where} must be numeric, got {value!r}") from None
    if number < 0 or not math.isfinite(number):
        raise PlateError(f"{where} must be a finite non-negative concentration, got {value!r}")
    return number


def _duplicates(items: list[str]) -> list[str]:
    seen: set[str] = set()
    dupes: list[str] = []
    for item in items:
        if item in seen and item not in dupes:
            dupes.append(item)
        seen.add(item)
    return dupes


def write_results(
    output_dir: str | Path,
    basename: str,
    tables: Mapping[str, pd.DataFrame] | None = None,
    payload: Mapping[str, Any] | None = None,
) -> dict[str, Path]:
    """Write ``{name: frame}`` as ``<basename>_<name>.csv`` plus an optional JSON.

    Returns ``{name: path}`` (the JSON, if written, is keyed ``"json"``).
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}
    for name, frame in (tables or {}).items():
        path = output_dir / f"{basename}_{name}.csv"
        frame.to_csv(path, index=False)
        written[name] = path
    if payload is not None:
        path = output_dir / f"{basename}_results.json"
        path.write_text(json.dumps(jsonable(payload), indent=2, sort_keys=False) + "\n")
        written["json"] = path
    return written


def jsonable(value: Any) -> Any:
    """Recursively convert numpy/pandas scalars and frames into JSON-safe values."""
    if isinstance(value, pd.DataFrame):
        return [jsonable(record) for record in value.to_dict(orient="records")]
    if isinstance(value, pd.Series):
        return jsonable(value.to_dict())
    if isinstance(value, Mapping):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(v) for v in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        number = float(value)
        return None if not math.isfinite(number) else number
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, Path):
        return str(value)
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if pd.isna(value):
        return None
    return str(value)


def read_results_frames(paths: list[Path]) -> pd.DataFrame:
    """Concatenate per-well result tables written by ``platefit run``.

    Accepts ``*_wells.csv`` / ``*_results.json`` files or directories containing them.
    """
    resolved = _resolve_result_paths(paths)
    frames: list[pd.DataFrame] = []
    for path in resolved:
        if path.suffix == ".json":
            payload = json.loads(path.read_text())
            wells = payload.get("wells")
            if wells is None:
                raise PlateError(f"{path}: results JSON has no 'wells' section")
            frame = pd.DataFrame(wells)
            if "plate_id" not in frame.columns:
                frame["plate_id"] = payload.get("plate", {}).get("plate_id", path.stem)
        else:
            frame = pd.read_csv(path)
        frame["source_file"] = str(path)
        frames.append(frame)
    if not frames:
        raise PlateError("no plate result files found (looked for *_results.json and *_wells.csv)")
    return pd.concat(frames, ignore_index=True)


def _resolve_result_paths(paths: list[Path]) -> list[Path]:
    resolved: list[Path] = []
    for path in paths:
        path = Path(path)
        if path.is_dir():
            found = sorted(path.glob("*_results.json")) or sorted(path.glob("*_wells.csv"))
            if not found:
                raise PlateError(f"{path}: directory contains no *_results.json or *_wells.csv")
            resolved.extend(found)
        elif path.exists():
            resolved.append(path)
        else:
            raise PlateError(f"result file not found: {path}")
    # De-duplicate while preserving order (a dir plus one of its files, say).
    seen: set[Path] = set()
    unique = []
    for path in resolved:
        key = path.resolve()
        if key not in seen:
            seen.add(key)
            unique.append(path)
    return unique


def load_reference(path: str | Path) -> pd.DataFrame:
    """Load a reference/nominal dataset for ``platefit compare``.

    Accepts a CSV with a group column (``group``/``level``/``sample``) plus either
    ``nominal`` (declared truth) or ``concentration`` (measured values, averaged
    per group to form the reference).
    """
    path = Path(path)
    if not path.exists():
        raise PlateError(f"reference file not found: {path}")
    frame = pd.read_csv(path)
    columns = {str(c).strip().lower(): c for c in frame.columns}
    group_col = next((columns[c] for c in ("group", "level", "sample", "sample_id") if c in columns), None)
    if group_col is None:
        raise PlateError(f"{path}: reference needs a 'group' (or 'level') column")
    if "nominal" in columns:
        out = frame[[group_col, columns["nominal"]]].copy()
        out.columns = ["group", "reference_value"]
        out["reference_source"] = "nominal"
        out = out.groupby(["group", "reference_source"], as_index=False)["reference_value"].first()
    elif "concentration" in columns:
        out = frame[[group_col, columns["concentration"]]].copy()
        out.columns = ["group", "reference_value"]
        out = out.groupby("group", as_index=False)["reference_value"].mean()
        out["reference_source"] = "measured"
    else:
        raise PlateError(f"{path}: reference needs a 'nominal' or 'concentration' column")
    out["group"] = out["group"].astype(str)
    return out[["group", "reference_value", "reference_source"]]
