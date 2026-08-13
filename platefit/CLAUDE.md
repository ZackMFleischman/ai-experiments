# CLAUDE.md — platefit

Python CLI that automates a bioanalytical plate-analysis workflow (standard
curve → back-calculation → precision/accuracy) currently done by hand in
SoftMax Pro + JMP. Unrelated to the parlor/minimalist-apps workspaces: no pnpm,
no shared platform.

Read `README.md` first — it documents the formats, the models and the variance
decomposition. This file covers only what you need to work *on* the code.

## Ground rules

- **Internal research, not GxP.** No validation package is expected. But numbers
  get reconciled against SoftMax/JMP, so correctness and traceability are the
  point: every reported statistic ships with the quantities it was derived from
  (fit params, mean squares, `n_effective`, `anova_source`).
- **Keep functions pure.** Frames in, frames out. File access lives in `io.py`
  and nowhere else; `cli.py` orchestrates and prints. That is what makes each
  stage independently checkable against the incumbent tools.
- **Don't swap a definition silently.** %CV, recovery, `n_eff` and the variance
  components are written the way the reference workflow computes them. If a
  formula must change, change it deliberately, update the hand-derived tests,
  and note it here.
- **Edge cases report NaN plus a `notes` entry**, never a number that merely
  looks meaningful. A truncated negative variance component says so.

## Working here

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest                       # 110 tests, ~3s
python examples/make_synthetic.py   # regenerate the demo plates (fixed seed)
```

`tests/test_stats.py` carries the ANOVA worked out on paper in comments — those
constants are the specification. If a change moves them, the change is wrong
until proven otherwise.

## Shape of the code

| module | holds |
| --- | --- |
| `model.py` | `Well`/`Plate`, well-reference parsing and range expansion, blank subtraction, template→values join |
| `io.py` | raw CSV (grid + long), template YAML, result writers, reference loader |
| `curve.py` | model table (`MODEL_SPECS`), weighting, fitting, closed-form inversion, range flagging |
| `stats.py` | `precision_recovery`, `intermediate_precision`, `accuracy_vs_reference` |
| `cli.py` | argparse subcommands, orchestration, console tables |

Adding a curve model means adding one `ModelSpec` (forward, inverse, whether it
needs positive concentrations) plus initial guesses in `_initial_guess` — the
rest of the pipeline is model-agnostic. Adding a subcommand means one
`add_parser` block and a `cmd_*` function.

## Things that look like bugs but aren't

- **The top standard back-calculates poorly at high noise.** Near the asymptote
  the curve is flat, so small signal noise becomes large concentration error.
  Real behaviour; it is why the per-standard recovery table exists.
- **`semilog` fits the synthetic data badly.** The data is sigmoidal; a straight
  line through log10(conc) only suits the linear portion. The model is offered,
  not recommended.
- **Between-run variance truncating to 0.** When a plate effect shifts standards
  and samples alike, that plate's own curve calibrates it away — which is the
  point of a per-plate calibrator. Genuine between-run variance comes from
  handling the standards never see (the synthetic generator models this as
  `sample_bias`).
