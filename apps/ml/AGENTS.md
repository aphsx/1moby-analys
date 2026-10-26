# apps/ml

ML service (Python 3.11). Run inside the container or a venv with `requirements.txt` installed.
Root `AGENTS.md` still applies (change rules, run-status rules).

## Commands

```bash
cd apps/ml
uvicorn api.main:app --port 8000 --reload          # FastAPI health + internal job triggers / model-alias ops only
python -m src.cli.train   --help                   # training CLI  (src/training/runner.py)
python -m src.cli.predict --help                   # prediction CLI (src/prediction/runner.py)
```

## Verification

No pytest. ML correctness is checked by the `scripts/verify_*.py` "contract" scripts — run them
against a populated DB after changing the matching pipeline module:

```bash
python scripts/verify_clean_data_access.py     # train_clean_* / predict_clean_* loaders
python scripts/verify_feature_builder.py       # model-specific feature contracts + feature_code_hash
python scripts/verify_preprocessing.py         # fit-on-train-only preprocessing artifact
python scripts/verify_promotion_policy.py      # champion promotion policy (no DB needed)
python scripts/verify_realized_outcomes.py     # outcome backfill (src/outcomes/)
python scripts/verify_constants_sync.py        # src/constants.py ↔ apps/api/src/lib/constants.ts enum strings
python scripts/verify_model_versioning.py      # version numbers / artifact folders never reused (no DB needed)
python scripts/profile_training_dataset.py     # dataset profiling / label viability
```

### Golden run (gate for any change under `apps/ml/` or the import pipeline)

End-to-end check: rebuilds a scratch database `moby_golden`, imports `data/sample-1moby-workbook.xlsx`,
trains (without tabicl and XGBoost, to stay fast), predicts, and dumps the Prediction Outputs. About
17 minutes; two runs on the same commit match exactly.

```bash
apps/ml/scripts/golden_run.sh golden/before.csv     # on the base commit (or keep a saved baseline)
apps/ml/scripts/golden_run.sh golden/after.csv      # on your change
python3 apps/ml/scripts/golden_run.py compare apps/ml/golden/before.csv apps/ml/golden/after.csv
```

A change that is meant to alter model output records a new baseline and says so in its PR.

## Python style

- Type hints on every function signature.
- One module per concern (`features.py`, `labels.py`, `{churn,clv,credit}_trainer.py`). No god files.
- Feature engineering separated from training/inference.
- `api/main.py` stays tiny — health, internal job triggers, model-alias ops. No user-facing logic.
