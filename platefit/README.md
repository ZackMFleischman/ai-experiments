# platefit

Bioanalytical plate analysis from the command line: fit a standard curve,
back-calculate sample concentrations, and summarise precision and accuracy —
the SoftMax Pro + JMP workflow, scripted.

Internal research tool, not GxP: there is no validation package here. What there
is instead is numerical transparency — every reported number comes with the
quantities it was derived from (fit parameters, mean squares, effective n), so
outputs can be reconciled against the existing tools rather than taken on faith.

```
raw CSV ─┐
         ├─→ plate (well → role, nominal, group, value) ─→ standard curve ─→ back-calculation ─→ %CV / % recovery ─→ CSV + JSON
template ┘                                                                                            │
                                                                       several plates ────────────────┴─→ variance components
```

## Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e .            # or: pip install -r requirements.txt
```

Python 3.11+, with numpy, scipy, pandas, statsmodels and pyyaml.

## Try it on the synthetic data

Three synthetic plates ship in `examples/`, generated from a known 4PL truth
with a deliberate run-to-run handling bias, so both subcommands have something
real to find:

```bash
platefit run --data examples/plate_a.csv --template examples/template_96.yaml \
             --output results --plate-id PLATE-A
platefit run --data examples/plate_b.csv --template examples/template_96.yaml \
             --output results --plate-id PLATE-B
platefit run --data examples/plate_c.csv --template examples/template_96.yaml \
             --output results --plate-id PLATE-C

platefit compare results --reference examples/reference_qc.csv --output compare
```

`examples/make_synthetic.py` regenerates the plates (fixed seed — the committed
files are reproducible), and documents the truth the pipeline is expected to
recover: QC levels come back at 99–101% recovery, the deliberately out-of-range
QCs flag as `above_range` / `below_range`, and `compare` recovers the ~4%
between-run bias the generator injected.

## Commands

### `platefit run` — single plate

| flag | meaning |
| --- | --- |
| `--data` | raw signal CSV |
| `--template` | plate template YAML (below) |
| `--output` | output directory |
| `--curve-model` | `4pl` (default), `5pl`, `semilog` |
| `--weighting` | `none`, `1/y`, `1/y2` (default) |
| `--plate-id` | label carried into the results and used by `compare` |
| `--blank-handling` | `subtract_mean` / `none`, overriding the template |

Writes `<plate-id>_wells.csv` (every analysed well), `_levels.csv` (per-group
precision and recovery), `_standards.csv` (per-standard back-calculation) and
`_results.json` (all of it, plus the fit object and plate metadata).

### `platefit compare` — across plates

Takes any mix of result files and directories from `run`:

```bash
platefit compare results/ --reference nominals.csv --output compare
platefit compare results/PLATE-A_results.json results/PLATE-B_results.json --output compare
```

Writes `compare_intermediate_precision.csv`, `compare_accuracy.csv`,
`compare_per_plate_levels.csv` and `compare_results.json`. Wells flagged
out-of-range are excluded unless `--include-out-of-range` is passed.

The reference CSV needs a `group` (or `level`) column plus either `nominal`
(declared truth) or `concentration` (measured values, averaged per group).
Levels missing from it fall back to the template nominal, and say so in `notes`.

## Raw data formats

Both are auto-detected:

```csv
,1,2,3          | well,value
A,0.10,0.20,... | A1,0.10
B,0.40,0.50,... | A2,0.20
```

The grid form honours the column numbers in its header, so a partial export
starting at column 5 is read as columns 5+. The long form accepts
`well`/`position` and `value`/`signal`/`od`/`rfu`/… as column names. Wells the
template does not mention are ignored and counted in the summary.

## Plate template

A 96-well layout can't live on the command line, so well roles are declared in
YAML and joined to the raw file by position. `wells` accepts single wells,
inclusive rectangular ranges (`A5-D6`), or a list mixing both.

```yaml
plate:
  id: PLATE-A
  format: 96                      # 6 / 24 / 96 / 384
  units: ng/mL
  blank_handling: subtract_mean   # subtract_mean | none

standards:
  - level: STD1
    nominal: 200.0
    wells: [A1, A2]

samples:
  - group: QC-HIGH                # a nominal makes it a QC: it gets % recovery
    nominal: 150.0
    wells: [A3, B3, C3]
  - group: UNK-001                # no nominal: %CV only
    wells: [A5, A6]

blanks:
  wells: [H11, H12]
```

Blanks are subtracted as a mean by default when declared, and the blank mean, SD
and n are recorded in the results either way.

## The numbers

### Standard curve (`curve.py`)

| model | signal from concentration | concentration from signal |
| --- | --- | --- |
| `4pl` | `d + (a - d) / (1 + (x/c)^b)` | `c * ((a - d)/(y - d) - 1)^(1/b)` |
| `5pl` | `d + (a - d) / (1 + (x/c)^b)^g` | `c * (((a - d)/(y - d))^(1/g) - 1)^(1/b)` |
| `semilog` | `intercept + slope * log10(x)` | `10^((y - intercept) / slope)` |

`a` is the response as concentration → 0 and `d` the response as it → ∞, so
rising and falling (inhibition) curves share one parameterisation with `b > 0`.
Back-calculation uses the closed-form inverse; a bracketed numeric solve is the
fallback, and which one was used is reported per well in `inversion`.

Weighting applies to the **observed** response, as SoftMax Pro does — the
objective is `Σ w·(y − f(x))²` with `w` = 1, `1/y` or `1/y²`, default `1/y2`.
Near-zero responses are floored at the smallest strictly positive standard
signal, so a blank-level standard cannot take an unbounded weight. 4PL/5PL are
fitted with `scipy.optimize.curve_fit` from data-derived starting values (low and
high signal, midpoint concentration interpolated in log space) with an EC50 sweep
as retry starts; semilog is solved exactly as weighted linear least squares.

**Out-of-range flagging** compares each well's signal to the span the standards
actually produced. So the extreme standards can never be flagged against the
range they themselves define, and a sample past a model asymptote — where no
concentration exists — is flagged with a NaN concentration rather than a
fabricated one.

### Precision and accuracy (`stats.py`)

Within a run, per replicate group: mean, SD, `%CV = 100·SD/mean`,
`% recovery = 100·mean/nominal`, n. Out-of-range wells drop out of the statistics
but stay in `n_wells`, so a level that lost replicates is visible.

Across runs, per concentration level, a one-way random-effects model with
`plate_id` as the grouping factor. statsmodels builds the ANOVA table; the
variance components are computed here from the mean squares, explicitly, because
the goal is to reconcile against JMP's Variance Components report rather than to
trust a canned partitioning:

```
repeatability (within-run) variance = MS_within
between-run variance                = max((MS_between - MS_within) / n_eff, 0)
intermediate precision              = sqrt(within + between)
n_eff                               = (N - Σn_i²/N) / (k - 1)
```

`n_eff` handles unbalanced designs and collapses to the replicate count when the
design is balanced. Each component is reported as an SD and as a %CV of the grand
mean, alongside `ms_between`, `ms_within`, `df_*`, `n_effective` and
`anova_source` — enough to re-derive every figure by hand.

Edge cases report `NaN` and a `notes` entry rather than a number that looks
meaningful: one plate (between-run not estimable), one replicate per plate
(repeatability not estimable), and a negative between-run estimate, which is
truncated to zero and flagged.

## Tests

```bash
pip install -e ".[dev]" && pytest
```

110 tests. The statistics are checked against values worked out by hand in the
test comments (`tests/test_stats.py`), the curve models against round-trips
through a known truth, and both subcommands end-to-end over the committed
synthetic plates.

## Layout

```
src/platefit/
  model.py   plate data model: well → role, nominal, group, value; blank handling
  io.py      load_plate_csv(), load_template(), write_results(), load_reference()
  curve.py   fit_standard_curve(), back_calculate()
  stats.py   precision_recovery(), intermediate_precision(), accuracy_vs_reference()
  cli.py     argparse wiring + orchestration
```

Every function is pure — frames in, frames out, no file access outside `io.py` —
so each stage can be reconciled against SoftMax/JMP on its own.
