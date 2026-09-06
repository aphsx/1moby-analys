# Documentation map

Every doc in this repo and what it answers. Start at the top.

## ส่งอาจารย์ / สอบ

| Doc | What it covers | Language |
|---|---|---|
| [`FINAL-REPORT-FULL-TH.docx`](FINAL-REPORT-FULL-TH.docx) | **เล่มรายงานโครงงานฉบับส่ง** (Word) — 5 บท + บทคัดย่อ/Abstract + สารบัญตาราง/ภาพ + คำนิยาม + เอกสารอ้างอิง + ภาคผนวก | TH |
| [`FINAL-REPORT-FULL-TH.md`](FINAL-REPORT-FULL-TH.md) | ต้นฉบับ Markdown ของเล่มรายงาน (แก้ที่นี่แล้ว regenerate docx ได้) | TH |
| [`PRESENTATION-SCRIPT-TH.md`](PRESENTATION-SCRIPT-TH.md) | สคริปต์นำเสนอสอบ: ลำดับพูด, ตัวเลขที่ต้องรู้, คำตอบคำถามที่น่าจะถูกถาม | TH |
| [`generate-report-docx.js`](generate-report-docx.js) | สคริปต์แปลง FINAL-REPORT-FULL-TH.md → .docx (รัน `node docs/generate-report-docx.js` จาก root) | — |

## Engineering references (ถูกโค้ด/agent อ้างถึง — อย่าลบ)

| Doc | What it covers | Language |
|---|---|---|
| [`../README.md`](../README.md) | Project intro, stack, how to run, ports, data flow | EN |
| [`../claude.md`](../claude.md) | **Architecture source of truth** — schema, routes, conventions, what-not-to-change | EN |
| [`ML-CALCULATIONS-TH.md`](ML-CALCULATIONS-TH.md) | **เอกสาร ML canonical (TH)** — สูตร/metric/threshold/ค่าคงที่ ทุกตัว (อิงบรรทัดโค้ด) + output contract ของ `ml_prediction_outputs` (§13) + design contract/policy ของการเทรน (§12) | TH |
| [`ML-V2-DASHBOARD-SPEC.md`](ML-V2-DASHBOARD-SPEC.md) | Every web page/widget, field-by-field, value provenance | TH |
| [`AI-ASSISTANT.md`](AI-ASSISTANT.md) | AI chat assistant (Text-to-SQL) — architecture, governance, build plan & status | EN |
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
- ML v2 specs + the final report are written in Thai by design; infrastructure/English docs are in English.
- If a doc disagrees with the code, the code wins — fix the doc.
- `ML-CALCULATIONS-TH.md` is the canonical ML reference; the final report (`FINAL-REPORT-FULL-TH.*`) is the explanation of the running system for submission.

## Removed docs (2026-09-06)

`PROJECT-REPORT-TH.md`, `MODEL-DEEP-DIVE-EN.md`, `HOW-IT-WORKS.md`, `RESEARCH-CLV-CREDIT-ALTERNATIVES-TH.md`, `CUSTOMER-SEGMENTS.md`, `FINAL-REPORT-5CHAPTER-TH.*`, `generate-report-v1.js` — superseded by the final report above; recoverable from git history.
