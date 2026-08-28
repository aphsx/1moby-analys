# Documentation map

Every doc in this repo and what it answers. Start at the top.

## Start here

| Doc | What it covers | Language |
|---|---|---|
| [`../README.md`](../README.md) | Project intro, stack, how to run, ports, data flow | EN |
| [`../claude.md`](../claude.md) | **Architecture source of truth** — schema, routes, conventions, what-not-to-change | EN |
| [`PROJECT-REPORT-TH.md`](PROJECT-REPORT-TH.md) | **รายงานโครงงานฉบับสมบูรณ์ 5 บท** — ที่มา, เทคโนโลยี, ออกแบบ, workflow, ผลการทดสอบ, สรุป | TH |
| [`HOW-IT-WORKS.md`](HOW-IT-WORKS.md) | **Plain-English end-to-end walkthrough** — services, import, features, training/prediction run, output row, web, AI, ops | EN |
| [`ML-CALCULATIONS-TH.md`](ML-CALCULATIONS-TH.md) | **สูตร/metric/threshold/ค่าคงที่ ML ทุกตัว** (อ้างอิงบรรทัดโค้ด) — เลขทางการยึดไฟล์นี้ | TH |
| [`MODEL-DEEP-DIVE-EN.md`](MODEL-DEEP-DIVE-EN.md) | Churn + CLV + Credit design rationale & worked example (EN narrative; formulas → `ML-CALCULATIONS-TH.md`) | EN |

## ML v2 (canonical design specs — follow over any legacy code)

| Doc | What it covers | Language |
|---|---|---|
| [`ML-V2-OVERVIEW.md`](ML-V2-OVERVIEW.md) | System overview, scope, build phases, current status | TH |
| [`ML-V2-DASHBOARD-SPEC.md`](ML-V2-DASHBOARD-SPEC.md) | Every web page/widget, field-by-field, value provenance | TH |
| [`ML-V2-OUTPUT-CONTRACT.md`](ML-V2-OUTPUT-CONTRACT.md) | `ml_prediction_outputs` field contract + derived-field formulas | TH |
| [`ML-V2-TRAINING-PIPELINE.md`](ML-V2-TRAINING-PIPELINE.md) | Training pipeline, anti-leakage suite, metrics, promotion gate, retraining | TH |

## Features & workflow

| Doc | What it covers | Language |
|---|---|---|
| [`CUSTOMER-SEGMENTS.md`](CUSTOMER-SEGMENTS.md) | CS/sales segments on top of ML outputs (`segment`, `priority_rank`) | EN |
| [`AI-ASSISTANT.md`](AI-ASSISTANT.md) | AI chat assistant — architecture, governance, build plan & status | EN |
| [`WEB-DEV-WORKFLOW.md`](WEB-DEV-WORKFLOW.md) | How to run / rebuild the `apps/web` frontend during dev | TH |

## Data preparation (Excel import → clean tables)

| Doc | What it covers | Language |
|---|---|---|
| [`../moby-data-prep/README.md`](../moby-data-prep/README.md) | Data-prep overview + train-raw quick start | EN |
| [`../moby-data-prep/docs/naming-convention.md`](../moby-data-prep/docs/naming-convention.md) | Table naming: train / predict × raw / clean | EN |
| [`../moby-data-prep/docs/excel-import-contract.md`](../moby-data-prep/docs/excel-import-contract.md) | The 8-sheet Excel contract → raw tables | EN |
| [`../moby-data-prep/docs/import-fidelity-rules.md`](../moby-data-prep/docs/import-fidelity-rules.md) | What the importer does vs defers to clean | EN |
| [`../moby-data-prep/docs/raw-data-schema.md`](../moby-data-prep/docs/raw-data-schema.md) | Train raw table schema detail | EN |
| [`../moby-data-prep/docs/train-clean-schema.md`](../moby-data-prep/docs/train-clean-schema.md) | Train clean typed tables | EN |
| [`../moby-data-prep/docs/predict-clean-schema.md`](../moby-data-prep/docs/predict-clean-schema.md) | Predict clean typed tables | EN |

## Conventions

- The live database schema is **always** `db/init/001_schema.sql` — there is no migration framework.
- ML v2 specs + the Thai report/calculations are written in Thai by design; infrastructure/English deep-dive docs are in English.
- If a doc disagrees with the code, the code wins — fix the doc.
- `HOW-IT-WORKS.md` + `MODEL-DEEP-DIVE-EN.md` are the current explanation of the running system; the ML-V2 specs are the design contract. If a number drifted, trust `ML-CALCULATIONS-TH.md` and the code.
