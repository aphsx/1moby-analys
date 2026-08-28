# รายงานโครงงานระบบ Moby Analytics
## แพลตฟอร์มวิเคราะห์ลูกค้าและทำนายพฤติกรรมด้วย Machine Learning สำหรับธุรกิจ SMS/Email (1Moby)

> เอกสารฉบับนี้เป็นรายงานโครงงานฉบับสมบูรณ์ (5 บท) อธิบายระบบตั้งแต่ต้นจนจบ:
> ที่มา, เทคโนโลยีที่ใช้ทั้งหมด, การออกแบบ, ขั้นตอนการทำงาน (workflow), ความต้องการของระบบ,
> การพัฒนา/ผลการทดสอบจริง และสรุปผล ทุกส่วนอ้างอิงจากโค้ดจริงในรีโพ
> รายละเอียด **สูตรการคำนวณ ML เชิงลึก** อยู่ในเอกสารคู่กัน `docs/ML-CALCULATIONS-TH.md`

**สารบัญ**
- [บทที่ 1 บทนำ](#บทที่-1-บทนำ)
- [บทที่ 2 ทฤษฎีและเทคโนโลยีที่เกี่ยวข้อง](#บทที่-2-ทฤษฎีและเทคโนโลยีที่เกี่ยวข้อง)
- [บทที่ 3 การวิเคราะห์และออกแบบระบบ](#บทที่-3-การวิเคราะห์และออกแบบระบบ)
- [บทที่ 4 การพัฒนาระบบและผลการดำเนินงาน](#บทที่-4-การพัฒนาระบบและผลการดำเนินงาน)
- [บทที่ 5 สรุปผล ปัญหา และข้อเสนอแนะ](#บทที่-5-สรุปผล-ปัญหา-และข้อเสนอแนะ)

---

# บทที่ 1 บทนำ

## 1.1 ที่มาและความสำคัญของปัญหา

1Moby เป็นผู้ให้บริการส่งข้อความ SMS และ Email แบบ B2B (ลูกค้าซื้อ "เครดิต" มาใช้ส่งข้อความ)
ปัญหาเชิงธุรกิจที่พบคือทีมงานภายในมีข้อมูลการใช้งานและการจ่ายเงินของลูกค้าจำนวนมากในไฟล์ Excel
แต่ **ไม่สามารถตอบคำถามสำคัญได้ทันเวลา** เช่น

- ลูกค้ารายไหน "กำลังจะเลิกใช้ (churn)" และควรรีบรักษาไว้ก่อน
- ลูกค้าแต่ละรายมี "มูลค่า (CLV)" ในอีก 6 เดือนข้างหน้าเท่าไร ควรทุ่มทรัพยากรกับใคร
- ลูกค้าจะใช้เครดิตหมดเมื่อไร ควรกระตุ้นให้เติมเงิน (top-up) ตอนไหน

เดิมการวิเคราะห์เหล่านี้ทำด้วยมือ ใช้เวลานาน ไม่สม่ำเสมอ และไม่มีการวัดความแม่นยำ
โครงงานนี้จึงพัฒนา **แพลตฟอร์มวิเคราะห์ภายใน (internal analytics platform)** ที่รับไฟล์ Excel
รูปแบบมาตรฐาน แล้วประมวลผลด้วย Machine Learning เพื่อทำนาย churn, แบ่งกลุ่มมูลค่าลูกค้า (CLV/value tier)
และพยากรณ์การใช้เครดิต พร้อมแดชบอร์ดที่ทุกตัวเลข **ตรวจสอบย้อนกลับไปยังข้อมูลจริงได้** (ไม่มีข้อมูลปลอม)

## 1.2 วัตถุประสงค์ของโครงงาน

1. รับเข้าข้อมูล Excel รูปแบบตายตัว (8 ชีต) แล้วแปลงเป็นข้อมูลสะอาด (clean) ที่พร้อมวิเคราะห์
2. เทรนโมเดล ML 3 ตัว (churn / CLV / credit) แบบกันข้อมูลรั่ว (point-in-time) และวัดผลได้จริง
3. ทำนายผลลูกค้าทุกคนในไฟล์ พร้อมค่าต่อยอด (revenue at risk, priority, segment)
4. แสดงผลผ่านแดชบอร์ดสำหรับผู้ใช้ภายใน และมีผู้ช่วย AI ตอบคำถามข้อมูลแบบมีการกำกับ (governed)
5. ควบคุมสิทธิ์การเข้าถึง (admin/member) และเก็บประวัติ/เวอร์ชันโมเดลเพื่อตรวจสอบได้

## 1.3 ขอบเขตของโครงงาน

**อยู่ในขอบเขต:**
- โมเดล 3 ตัว: **Churn** (โอกาสเลิกใช้), **CLV** (มูลค่า 6 เดือน + p_alive), **Credit forecast** (การใช้เครดิต 30/90 วัน + วันจนต้องเติม)
- การแบ่งสถานะลูกค้าแบบกฎ (Lifecycle: Ghost / Churned / Active Paid / Active Free)
- ผู้ช่วย AI: ถาม-ตอบความรู้บริษัท + Text-to-SQL บนข้อมูลทำนาย (อ่านอย่างเดียว)
- ผู้ใช้ภายในราว 5–50 คน (2 บทบาท: admin / member)

**อยู่นอกขอบเขต (ตัดออกถาวร):** โมเดล win-back และ conversion (`comeback_probability`, `conversion_probability`)
รวมถึงระบบอนุมัติ/เวิร์กโฟลว์การติดต่อลูกค้า และการ deploy production จริง (ยัง "local Docker first")

## 1.4 ประโยชน์ที่คาดว่าจะได้รับ

- ทีมงานเห็นรายการลูกค้าเสี่ยง churn เรียงตาม "เงินที่จะเสียจริง" (revenue at risk) ทำงานเชิงรุกได้
- ตัดสินใจด้วยตัวเลขที่วัดความแม่นยำได้ (PR-AUC, F1, coverage ฯลฯ) แทนการเดา
- ลดเวลาวิเคราะห์จากทำมือเป็นอัตโนมัติ และตรวจสอบย้อนกลับได้ทุกตัวเลข

## 1.5 นิยามศัพท์เฉพาะ

| คำ | ความหมาย |
|---|---|
| **Churn** | ลูกค้าที่เคยจ่ายเงินและใช้งาน แต่หยุดไปหลังจุดตัดเวลา (cutoff) |
| **CLV** | Customer Lifetime Value — มูลค่ารายได้คาดการณ์ 6 เดือนข้างหน้า |
| **p_alive** | ความน่าจะเป็นที่ลูกค้ายัง "มีชีวิต/active" (จากโมเดล BG/NBD) |
| **Lifecycle stage** | สถานะลูกค้าแบบกฎ ไม่ใช่คำทำนาย (Ghost/Churned/Active Paid/Active Free) |
| **cutoff** | จุดตัดเวลา "ปัจจุบันจำลอง"; feature ใช้ข้อมูลก่อน cutoff, label ใช้ข้อมูลหลัง cutoff |
| **Point-in-time** | หลักการกันข้อมูลอนาคตรั่วเข้ามาในการเทรน |
| **Calibration** | การปรับคะแนนโมเดลให้เป็นความน่าจะเป็นจริง (Platt/Isotonic) |
| **Champion / Baseline** | โมเดลที่ถูกเลือกใช้จริง / ตัวเทียบขั้นต่ำที่ต้องเอาชนะ |
| **Revenue at risk** | `churn_probability × predicted_clv_6m` — เงินคาดว่าจะเสียถ้าลูกค้า churn |

## 1.6 ผู้ใช้งานและบทบาท (Access model — org-shared)

ข้อมูล/รัน/แดชบอร์ดทั้งหมด "เห็นร่วมกันทั้งองค์กร" (org-wide reads) มี 2 บทบาทบน `user.role`:

| บทบาท | ทำอะไรได้ |
|---|---|
| **admin** | นำเข้าข้อมูลเทรน, สั่งเทรน, ปักธง champion, ลบเวอร์ชันโมเดล, สั่ง backfill; + ทุกอย่างของ member |
| **member** | ดูทุกอย่าง, นำเข้าข้อมูลทำนาย, สร้าง prediction run, ใช้ AI chat |

การลบเป็นแบบ "ผู้สร้างหรือแอดมิน" (creator-or-admin); บทสนทนา AI เป็นส่วนตัวรายคน
แอดมินเริ่มต้น (local dev): `admin@example.com` / `123` (พิมพ์ `admin` ในฟอร์มล็อกอินได้)

---

# บทที่ 2 ทฤษฎีและเทคโนโลยีที่เกี่ยวข้อง

## 2.1 ภาพรวมสถาปัตยกรรม (Monorepo หลายบริการ)

ระบบเป็น **Monorepo** จัดการด้วย **Turborepo + Bun workspaces** ประกอบด้วย 5 บริการที่รันแยกกันแต่ทำงานร่วมกัน:

| บริการ | เทคโนโลยี | หน้าที่ | พอร์ต (ภายใน/ภายนอก) |
|---|---|---|---|
| `web` | Next.js 16 | เว็บแดชบอร์ด + พร็อกซี `/api/*` | 3000 / 3000 |
| `api` | Elysia.js (Bun) | REST + Auth + SSE + orchestrate import/train/predict | 3001 / 3001 |
| `ml` | Python 3.11 + FastAPI | เทรน/ทำนาย ML (ภายในเท่านั้น) | 8000 / 8001 |
| `db` | PostgreSQL 15 + pgvector | ฐานข้อมูลหลัก | 5432 / 5433 |
| `redis` | Redis 7 | คิว/ความคืบหน้า (progress streams) | 6379 / — |

โครงสร้างโฟลเดอร์: `apps/web`, `apps/api`, `apps/ml`, `packages/types` (TypeScript types ที่ใช้ร่วม),
`db/init` (schema bootstrap), `moby-data-prep` (สัญญาการนำเข้า Excel)

## 2.2 เทคโนโลยีฝั่ง Frontend (`apps/web`)

- **Next.js 16 (App Router)** + **React 18** + **TypeScript** (strict, ห้าม `any`)
- **Tailwind CSS** จัดสไตล์, ฟอนต์ Sarabun (รองรับภาษาไทย)
- **recharts** สำหรับกราฟ (รายได้รายเดือน, usage/credit trend, payment timeline)
- **gsap** สำหรับอนิเมชันหน้า intro
- **zustand** สำหรับ state ส่วนกลาง (run store, chat store, dialog store)
- **Better Auth (client)** สำหรับล็อกอิน/เซสชัน
- เรียก API ผ่าน fetch wrapper (`lib/ml-api.ts`, `lib/api.ts`) — ไม่มี Next API route; ใช้ rewrite `/api/*` ไปยัง Elysia

## 2.3 เทคโนโลยีฝั่ง Backend/API (`apps/api`)

- **Elysia.js** รันบน **Bun** — เป็นเจ้าของ REST + Auth + SSE ทั้งหมด
- **Better Auth** (email/password + Google OAuth; ปิดการ sign-up; เซสชัน 7 วัน)
- **Drizzle ORM** โหมด **introspect-only** (สะท้อน schema จาก `db/init/001_schema.sql` เท่านั้น ห้าม generate/push)
- **ioredis** สำหรับ Redis Streams (ความคืบหน้าการ import)
- ไลบรารีอ่าน Excel: `xlsx`

## 2.4 เทคโนโลยีฝั่ง Machine Learning (`apps/ml`)

- **Python 3.11 + FastAPI** — บริการภายใน (`/health` + `/internal/*` job triggers) ตัวเทรน/ทำนายรันเป็น CLI
- อัลกอริทึม/ไลบรารีที่ใช้ (สรุป — รายละเอียดใน `ML-CALCULATIONS-TH.md`):
  - **LightGBM** — churn classifier, CLV Tweedie/hurdle, credit quantile regression
  - **XGBoost** — CLV Tweedie (opt-in), credit quantile (opt-in), และ **AFT (survival)** สำหรับวันจน top-up
  - **scikit-learn** — Logistic Regression, Isotonic Regression, Linear Regression (OLS calibration)
  - **lifetimes** — BG/NBD (`BetaGeoFitter`) + Gamma-Gamma (`GammaGammaFitter`) สำหรับ CLV และ p_alive
  - **TabICL** — tabular foundation model (churn candidate; ต้องมี torch)
  - **Optuna** — จูน hyperparameter
  - **SHAP** — อธิบายปัจจัย (churn factors)

## 2.5 ฐานข้อมูลและคิวงาน

- **PostgreSQL 15** (อิมเมจ `pgvector/pgvector:pg15` — เปิดใช้ extension `vector` สำหรับ RAG ของ AI)
- schema มาจากไฟล์เดียว `db/init/001_schema.sql` (bootstrap ตอนสร้าง volume ใหม่)
- **Redis** — Redis Streams สำหรับความคืบหน้าการ import (และรองรับ Arq queue)

## 2.6 DevOps / เครื่องมือพัฒนา

- **Docker Compose** รันครบทั้ง 5 บริการในคำสั่งเดียว (`docker compose up --build`)
- **Turborepo** จัดการ build/dev/lint/typecheck ข้าม workspace
- **Bun** เป็น package manager + runtime (`packageManager: bun@1.0.0`)

## 2.7 ทฤษฎี ML ที่ใช้ (สรุปหลักการ)

- **Churn = Binary classification** วัดด้วย PR-AUC (average precision), F1, ROC-AUC, Brier/BSS, ECE/MCE
  เลือก threshold ที่ทำให้ **F2 สูงสุด** (เน้น recall) แล้วแตกเป็นระดับ low/medium/high/critical
- **Calibration** — ปรับคะแนนดิบให้เป็นความน่าจะเป็นจริงด้วย Platt (logistic) หรือ Isotonic
- **CLV = BG/NBD + Gamma-Gamma** (โมเดลพฤติกรรมซื้อ) แข่งกับ **LightGBM Tweedie / hurdle** เลือกด้วย Spearman
- **Credit = Quantile regression** (p10–p90) วัดด้วย pinball loss + interval coverage; ปรับช่วงด้วย **CQR** ให้ครอบคลุม ~80%
- **Top-up timing = AFT survival model** (จัดการข้อมูลถูกตัดปลาย/censored)
- **SHAP** อธิบายว่าปัจจัยใดผลักดันคะแนน churn ของลูกค้าแต่ละราย
- **AI Assistant** — RAG ด้วย pgvector (cosine) + **Text-to-SQL** ที่ผ่านตัวตรวจ (validator) ก่อนรันจริงเท่านั้น

---

# บทที่ 3 การวิเคราะห์และออกแบบระบบ

## 3.1 ความต้องการของระบบ (Requirements)

### 3.1.1 ความต้องการเชิงหน้าที่ (Functional)

| รหัส | ความต้องการ | บทบาท |
|---|---|---|
| FR-1 | นำเข้าไฟล์ Excel 8 ชีต (เทรน) แปลงเป็น raw + clean | admin |
| FR-2 | นำเข้าไฟล์ Excel (ทำนาย) และสร้าง prediction run อัตโนมัติ | member+ |
| FR-3 | สั่งเทรนโมเดล (เลือก cutoff/horizon) + คัด champion อัตโนมัติ | admin |
| FR-4 | ทำนายลูกค้าทุกคน เขียน `ml_prediction_outputs` 1 แถว/คน/run | ระบบ |
| FR-5 | แดชบอร์ดภาพรวม + ตารางลูกค้า + Customer 360 | member+ |
| FR-6 | หน้าวัดผลโมเดล (champion metrics + candidate competition) | member+ |
| FR-7 | จัดการเวอร์ชันโมเดล (activate/delete) | admin |
| FR-8 | ผู้ช่วย AI ถาม-ตอบข้อมูล (Text-to-SQL อ่านอย่างเดียว) + ความรู้บริษัท | member+ |
| FR-9 | วัดผลจริงย้อนหลัง (realized outcome) เมื่อครบ horizon | admin สั่ง |

### 3.1.2 ความต้องการที่ไม่ใช่หน้าที่ (Non-functional)

- **Point-in-time correctness** — ห้าม feature เห็นข้อมูลหลัง cutoff (มี Gate ตรวจ + leakage suite)
- **Observed ≠ Predicted** — lifecycle (กฎ) ต้องไม่ปนกับคำทำนาย (โมเดล) บนหน้าเว็บ
- **ตรวจสอบย้อนได้** — ทุกตัวเลขบนเว็บ trace กลับไปยัง field ในฐานข้อมูล; ห้าม mock ใน production
- **ความปลอดภัย** — สิทธิ์บังคับที่ backend ไม่ใช่แค่ UI; AI ห้ามรันคำสั่งเขียน DB; ไม่ล็อก PII ลง log
- **Auditability** — เก็บ `model_versions_json` ทุกแถว, ประวัติ activation, evidence ของ AI

## 3.2 สถาปัตยกรรมและการไหลของข้อมูล (Traffic flow)

```
Browser → Next.js :3000
   /api/auth/*  → Elysia /api/auth/*        (Better Auth)
   /api/*       → Elysia :3001              (พร็อกซีตัด /api ออก)

Elysia :3001
   → PostgreSQL (Drizzle / pg)
   → Redis (progress streams การ import)
   → FastAPI :8000/internal/* (token-gated) → spawn Python: train / predict / backfill
   → Ollama Cloud (AI chat / insight)

FastAPI :8000  ← Elysia เรียกภายในเท่านั้น (ไม่เปิดสู่เบราว์เซอร์)
Python runners → เขียนผลลง PostgreSQL (ตาราง ml_*)
```

**หลักการสำคัญ:** Elysia เป็นเจ้าของ REST/auth/SSE ทั้งหมด; FastAPI เป็นบริการภายใน (internal-only)
ที่ถูกกันด้วย `INTERNAL_SERVICE_TOKEN`; งานหนัก ML รันเป็น CLI ที่ spawn จาก FastAPI

## 3.3 การออกแบบฐานข้อมูล (`db/init/001_schema.sql`)

ตระกูลตาราง:

| ตระกูล | ตาราง (ย่อ) |
|---|---|
| **Auth (Better Auth)** | `user`, `session`, `account`, `verification` |
| **Train raw/clean** | `train_data_sources`, `train_raw_sheet_*` (8 ชีต), `train_clean_{customers,payments,usage}` |
| **Predict raw/clean** | `predict_data_sources`, `predict_raw_sheet_*` (8 ชีต), `predict_clean_*` |
| **ML runtime** | `ml_training_runs`, `ml_prediction_runs`, `ml_prediction_outputs` (1 แถว/คน/run), `ml_model_versions`, `ml_model_aliases`, `ml_model_activation_history`, `ml_model_evaluations`, `ml_feature_sets`, `ml_data_validation_reports` |
| **AI chat** | `ai_conversations`, `ai_messages` (+ `ai_knowledge_documents/chunks` ที่วางแผนสำหรับ RAG) |

การตัดสินใจออกแบบสำคัญ:
- raw/clean ผูกกับ `source_id` (FK CASCADE) — อัปโหลดซ้ำ = ล้างแล้วใส่ใหม่
- ผล ML ทั้งหมดรวมในตารางเดียว `ml_prediction_outputs` (ไม่แยกตามชนิดโมเดล)
- เลือก champion ผ่าน `ml_model_aliases` (alias `production` หนึ่งตัวต่อชนิดโมเดล)
- Drizzle สะท้อน schema เท่านั้น — schema เปลี่ยนที่ SQL ไฟล์เดียว ไม่มี migration framework

## 3.4 สัญญาการนำเข้าข้อมูล (Excel Import Contract)

ไฟล์ Excel มี **8 ชีตตายตัว**:

| ชีต | เนื้อหา |
|---|---|
| `Users+User_profile` | acc_id, สถานะ (SMS/Email), เครดิต, วันหมดอายุ, join_date, last_access, last_send |
| `Backend_payment` | uid, payment_date, acc_id, credit_add, amount, credit_type |
| `SMS_usage (BC/API/OTP)` | year, month, acc_id, usage (3 ชีต) |
| `Email_usage (BC/API/OTP)` | year, month, acc_id, usage (3 ชีต) |

ขั้นตอน: อัปโหลด → parse 8 ชีต → เขียน `*_raw_sheet_*` (เก็บ payload ต่อแถว) → ทำความสะอาด (typed columns, ตัดแถวเสีย) → `*_clean_*` + เก็บ `sheet_manifest`/`clean_manifest`
(batch insert ครั้งละ 500 แถว; train import มี progress ผ่าน Redis; predict import เป็น synchronous)

## 3.5 การออกแบบ ML Pipeline (สรุป)

**เทรน (Training):**
```
train_clean_* → Quality Gates 1–5 → labels + features (Tier A) → temporal split (60/20/20)
→ preprocess (fit เฉพาะ train) → baselines → candidate models + Optuna → calibration
→ evaluation (validation/test/backtest) → promotion gate → artifacts + ml_model_versions (alias production)
```

**ทำนาย (Prediction):**
```
predict_clean_* → Gates → features (contract เดียวกับเทรน) → lifecycle rules
→ champion models (churn/clv/credit) → SHAP (churn) → derived fields
→ ml_prediction_outputs (1 แถว/ลูกค้า/run)
```

โมเดลที่ใช้ (นับรวม): ~10 ตระกูลอัลกอริทึม, champion 3 ตัวขึ้น production ต่อ run + lifecycle(กฎ) + BG/NBD(p_alive) + top-up AFT, baseline 7 ตัว
(รายละเอียดสูตร/threshold/metric ทั้งหมดอยู่ใน `docs/ML-CALCULATIONS-TH.md`)

## 3.6 การออกแบบ API (Route map — Elysia)

```
Auth              /api/auth/*                     Better Auth
Health            GET  /health

Prediction runs   GET/POST /prediction-runs
                  GET  /prediction-runs/:id            (+ progress)
                  POST /prediction-runs/:id/retry      (creator/admin)
                  DELETE /prediction-runs/:id          (creator/admin)
                  GET  /prediction-runs/:id/summary    (แดชบอร์ด aggregates)
                  GET  /prediction-runs/:id/outputs     (ตารางลูกค้า sort/filter/paginate)
                  GET  /prediction-runs/:id/outputs/:acc_id           (Customer 360)
                  GET  /prediction-runs/:id/customers/:acc_id/usage-monthly | payments
                  GET  /prediction-runs/:id/realized-outcomes
                  GET/POST /prediction-runs/:id/insight               (AI run summary)
                  POST /prediction-runs/:id/outputs/:acc_id/ai-explanation

Data sources      POST /predict-data-sources/import   (auto prediction run)
                  POST /train-data-sources/import[/async]   [admin]
                  GET  /{train,predict}-data-sources[/...]  (list/detail/progress/suggested-cutoff)
                  DELETE /{train,predict}-data-sources/:id  (creator/admin)

Training/models   POST /training-runs   [admin]      GET /training-runs[/:id]
                  GET  /model-performance             GET /model-performance/:type/versions
                  POST /model-performance/:type/activate            [admin]
                  DELETE /model-performance/:type/versions/:id      [admin]
                  POST /outcome-backfill              [admin]

AI chat           GET  /ai-chat/config
                  GET/POST/PATCH/DELETE /ai-chat/conversations[/:id]
                  POST /ai-chat/conversations/:id/messages          (SSE token stream)
```

ทุก route อยู่หลัง `requireUser`; การเขียนที่กระทบสถานะร่วม (train import, training, activate, backfill) อยู่หลัง `requireAdmin`

## 3.7 การออกแบบส่วนติดต่อผู้ใช้ (หน้าเว็บ)

| หน้า | เส้นทาง | ทำอะไร |
|---|---|---|
| Login | `/login` | อีเมล/รหัส (`admin`/`123`) หรือ Google OAuth |
| Dashboard | `/` | ภาพรวม run ที่เลือก: KPI, lifecycle mix, รายได้รายเดือน, value×risk matrix, top priority, AI summary |
| Customers | `/customers` | ตารางลูกค้า filter/sort/paginate ที่ฝั่ง server, ค้นหา, export CSV, Gen AI รายคน |
| Customer 360 | `/customers/[id]` | รายละเอียดลูกค้า: churn/CLV/credit, profile snapshot, กราฟ usage/payment, churn factors |
| Runs | `/runs` | นำเข้าไฟล์ทำนาย, สร้าง run, ตารางรัน (สถานะ/retry/delete), เปิดผลบนแดชบอร์ด |
| Training | `/training` | อัปโหลด/เลือก dataset, สั่งเทรน, การ์ดสถานะโมเดล (activate/delete), ประวัติเทรน |
| Model Performance | `/model-performance` | เมตริก champion ต่อชนิดโมเดล + candidate competition (อ่านอย่างเดียว) |
| AI Chat | `/ai-chat` | แชตกับ Moby AI (sidebar, สตรีมคำตอบ, evidence panel SQL) |
| Profile | `/profile` | แก้ชื่อ/อวาตาร์, ดูข้อมูล Google, ลบบัญชี |

การป้องกันเส้นทาง: `proxy.ts` ตรวจเซสชัน (ยกเว้น `/login`) redirect ไป `/login?redirect=...` เมื่อยังไม่ล็อกอิน;
สิทธิ์ admin ซ่อน/ปิดปุ่มที่เป็น mutation (พร้อม tooltip) และบังคับซ้ำที่ backend

## 3.8 การออกแบบความปลอดภัยและสิทธิ์

- **Better Auth** — email/password (ปิด sign-up) + Google OAuth; เซสชัน 7 วัน
- **Middleware** — `userPlugin` derive `{userId, userRole, isAdmin}`; `requireUser` (401), `requireAdmin` (401/403)
- **Admin bootstrap** — `ADMIN_EMAILS` และ `SEED_LOCAL_ADMIN` (seed `admin@example.com`)
- **Access control** — reads เปิดทั้งองค์กร; delete/retry = creator-or-admin; บทสนทนา AI = เจ้าของเท่านั้น
- **Internal token** — Elysia→FastAPI กันด้วย `x-internal-token`

## 3.9 การออกแบบผู้ช่วย AI (Governed)

- **LLM:** Ollama Cloud (`qwen3.5:397b-cloud`) สำหรับแชต + embedding model สำหรับ RAG
- **3 ความสามารถ:** (1) Text-to-SQL บนข้อมูลทำนาย, (2) เจาะรายลูกค้า, (3) ถาม-ตอบความรู้บริษัท/ML
- **การกำกับ:** LLM ไม่คุย DB ตรง; orchestrator เรียก tool → semantic layer → **SQL validator** (อนุญาต SELECT เดียว, บล็อก write/`SELECT *`, บังคับ LIMIT, รันด้วย read-only) → ผลเป็น "evidence"
- **RAG:** chunk เอกสาร → embed → ค้นด้วย cosine (`pgvector`) → อ้างอิงแหล่งกลับให้ผู้ใช้
- **Streaming:** SSE (events: thinking/token/evidence/done/error) และเก็บ evidence ทุกข้อความเพื่อ audit

---

# บทที่ 4 การพัฒนาระบบและผลการดำเนินงาน

## 4.1 สภาพแวดล้อมและการติดตั้ง (Deployment)

ระบบรันครบด้วย Docker Compose (แนะนำ):

```bash
cp .env.example .env          # ใส่ค่าลับ (secret, OAuth ฯลฯ)
docker compose up --build     # db, redis, ml, api, web
```

- Postgres จะ bootstrap schema จาก `db/init/001_schema.sql` อัตโนมัติเมื่อสร้าง volume ใหม่
- ตัวแปรแวดล้อมสำคัญ: `DATABASE_URL`, `REDIS_HOST`, `INTERNAL_SERVICE_TOKEN`, `BETTER_AUTH_SECRET`,
  `ELYSIA_URL`, `ML_INTERNAL_URL`, `ADMIN_EMAILS`, `SEED_LOCAL_ADMIN`, `LLM_*`/`OLLAMA_*`
- สำหรับ Cloud Agent/นักพัฒนา มีสคริปต์ตั้งค่าอัตโนมัติใน `.cursor/` (ดูหมายเหตุการรันใน `docs/WEB-DEV-WORKFLOW.md`)

> **ผลการติดตั้งจริง (ทดสอบในเซสชันนี้):** ทั้ง 5 บริการขึ้นครบและ healthy — `api /health` ตอบ `db:connected`,
> Elysia→FastAPI (`ml:8000/health`) ตอบ 200, เว็บ redirect ไป `/login` ตามคาด

## 4.2 ขั้นตอนการทำงานจริง (Workflow ตั้งแต่ต้นจนจบ)

### 4.2.1 เข้าสู่ระบบ
ผู้ใช้เปิด `http://localhost:3000` → ถูก redirect ไป `/login` → ล็อกอิน (`admin`/`123` หรือ Google)
→ Better Auth ออก session cookie → เข้าถึงหน้าอื่นได้ (member เห็นทุกอย่าง, admin เห็นปุ่ม mutation เพิ่ม)

### 4.2.2 นำเข้าข้อมูลเทรน + เทรนโมเดล (admin)
1. ไปหน้า **Training** → อัปโหลด Excel 8 ชีต → ระบบ parse → `train_raw_*` → clean → `train_clean_*`
   (progress สตรีมผ่าน Redis)
2. เลือก cutoff (ต้องเป็นวันที่ 1 ของเดือน) แล้วสั่งเทรน → Elysia ตรวจ Gate 3 (ช่วงเวลา/label พอไหม)
   → เรียก FastAPI `/internal/training-runs` → spawn `train_v2.py`
3. Pipeline: Gates 1–5 → labels+features → split → baselines → candidates (Optuna) → calibration
   → evaluation → **promotion gate** → ถ้าผ่านจะปักธง `production`
4. การ์ดสถานะโมเดลอัปเดตเป็น champion ใหม่ (มีปุ่ม activate/delete เวอร์ชันสำหรับ admin)

### 4.2.3 นำเข้าข้อมูลทำนาย + สร้าง prediction run
1. ไปหน้า **Runs** → นำเข้า Excel ทำนาย → clean → **auto prediction run** (ปิดได้ด้วย `auto_run=false`)
2. Elysia เรียก FastAPI `/internal/prediction-runs` → spawn `predict_v2.py`
3. Pipeline: Gates → features → lifecycle → champion models → SHAP (churn) → derived fields
   → batch insert `ml_prediction_outputs` (1 แถว/ลูกค้า) → post-check → สถานะ `completed`

### 4.2.4 ดูผลบนแดชบอร์ด
- **Dashboard (`/`)** — เลือก run แล้วเห็น KPI (ลูกค้า, revenue at risk, high-risk ฯลฯ), lifecycle mix, กราฟรายได้, value×risk matrix, top priority + AI summary
- **Customers (`/customers`)** — ตารางลูกค้า filter/sort/paginate ที่ server, export CSV, ปุ่ม Gen AI
- **Customer 360 (`/customers/[id]`)** — churn %/risk, CLV/p_alive, credit + วันจน top-up, profile snapshot, กราฟ usage/payment, และ **churn factors (SHAP)** ตอบ "ทำไมคนนี้เสี่ยง"

### 4.2.5 Model Performance
หน้า `/model-performance` แสดง champion ต่อชนิดโมเดล: primary metric, การแยกตาม split, และ candidate competition (ตัวไหนแพ้/ชนะ)

### 4.2.6 AI Assistant
หน้า `/ai-chat` (หรือ widget ลอย) ถามภาษาไทยได้ เช่น "ลูกค้าเสี่ยงสูงที่ CLV เกิน 10,000 มีใครบ้าง"
→ orchestrator เลือก tool → Text-to-SQL ผ่าน validator → รัน read-only → ตอบพร้อม evidence (SQL + จำนวนแถว + แหล่งอ้างอิง) แบบสตรีม

### 4.2.7 Realized outcome / retrain
เมื่อ horizon ของ run ครบและมีข้อมูลใหม่มายืนยัน admin สั่ง `POST /outcome-backfill`
→ สร้าง label จริง → วัดด้วยฟังก์ชัน metric ตัวเดียวกับตอนเทรน → เก็บเป็น `ml_model_evaluations` (production_holdout)

## 4.3 ผลการทดสอบจริง (End-to-end บนชุดข้อมูลตัวอย่าง)

ทดสอบด้วยไฟล์ `data/[1Moby] Data_example for Bangkok university.xlsx`:

**การนำเข้า (train):** customers 25,093 | payments 13,882 | usage 76,255 แถว (import_status = ready)

**การเทรน (cutoff 2025-07-01):** เทรนครบและปักธง production ทั้ง 3 โมเดล พร้อมเมตริกจริง

| โมเดล | อัลกอริทึมที่ชนะ | เมตริกหลัก | baseline |
|---|---|---|---|
| Churn | tabicl | PR-AUC **0.761** | logistic 0.740 |
| CLV | lgbm_tweedie | Spearman **0.535–0.546** | 0.365 |
| Credit | LightGBM quantile | coverage p10–p90 **0.864** | — |

**การทำนาย (cutoff 2026-01-01):** เขียน `ml_prediction_outputs` = **30,697 แถว** (1 แถว/ลูกค้า)

การแบ่ง lifecycle: Ghost 19,273 | Churned 7,174 | Active Paid 2,572 | Active Free 1,678
สรุประดับ run: revenue at risk (expected) ≈ **54.2M฿**, high-risk exposure ≈ 21.1M฿

> ผลข้างต้นยืนยันว่าทั้ง pipeline (import → train → 3 champion → predict → outputs → dashboard) ทำงานครบวงจรจริง และตัวเลขทุกตัวมาจากการคำนวณจริง ไม่ใช่ mock

## 4.4 การจัดการความคืบหน้าและความผิดพลาด

- **ความคืบหน้า:** train import ใช้ Redis Streams; ความคืบหน้าของ run เก็บใน `progress_json` (เว็บ poll)
- **สถานะรัน:** `pending → in_progress → completed/failed`; ทุก exception ต้องจบที่ `failed` + `error_message`
- **Stale reaper:** รันที่ค้างเกิน `STALE_RUN_TIMEOUT_MINUTES` (ค่าเริ่ม 120) ถูกทำเป็น failed ตอนบูตและทุก 5 นาที
- **Post-check ตอนทำนาย:** จำนวนแถว = จำนวนลูกค้า, ค่าคะแนนอยู่ในช่วง [0,1], null ในกลุ่ม eligible ≈ 0

---

# บทที่ 5 สรุปผล ปัญหา และข้อเสนอแนะ

## 5.1 สรุปผลการดำเนินงาน

โครงงานพัฒนาแพลตฟอร์มวิเคราะห์ลูกค้าครบวงจรได้สำเร็จตามวัตถุประสงค์:
- นำเข้าและทำความสะอาดข้อมูล Excel 8 ชีต (train/predict แยกกัน) ได้จริง
- เทรนโมเดล 3 ตัว (churn/CLV/credit) แบบ point-in-time พร้อมคัด champion ที่ชนะ baseline และวัดผลได้จริง
- ทำนายลูกค้าทุกคนพร้อมค่าต่อยอด (revenue at risk, segment, priority) และอธิบายด้วย SHAP
- แดชบอร์ด + Customer 360 + Model Performance + ผู้ช่วย AI (governed Text-to-SQL + RAG)
- ควบคุมสิทธิ์ (admin/member) และเก็บเวอร์ชัน/ประวัติเพื่อตรวจสอบได้
- ทดสอบ end-to-end บนชุดตัวอย่างได้ผลจริง (30,697 outputs, churn PR-AUC 0.76)

## 5.2 ปัญหาและอุปสรรค

- **ML บน CPU ช้า** — โมเดลบางตัว (เช่น TabICL/Optuna) ใช้เวลานานเมื่อไม่มี GPU
- **การรันแบบ container ซ้อน (Cloud Agent)** — Docker ในเครื่องแบบซ้อนต้องปรับ storage driver เป็น `fuse-overlayfs` และใช้ legacy iptables จึงจะสื่อสารระหว่าง container ได้ (แก้ไว้ในสคริปต์ตั้งค่า)
- **การ bind IPv6 ของ FastAPI** — ค่า default `::` เป็น IPv6-only บนบางเครือข่าย ต้องตั้ง `ML_HOST=0.0.0.0`
- **คุณภาพข้อมูล** — ต้องมีประวัติยาวพอ (Gate 3/4) ไม่งั้นเทรนไม่ได้; ลูกค้าใหม่ < 90 วันจะถูกงดประเมิน churn

## 5.3 ข้อจำกัดของระบบ

- ยังเป็น "local Docker first" ยังไม่มี production จริง (HTTPS, backup, scaling)
- RAG ของ AI (ตาราง knowledge/vector) อยู่ระหว่างพัฒนา; AI explanation (`ai_*`) เป็นโครงรองรับ Phase 2
- schema แก้ที่ไฟล์เดียว ไม่มี migration framework — เหมาะกับทีมเล็ก แต่ต้องระวังตอนแก้ production
- โมเดลจำกัดที่ 3 ตัว + lifecycle (ตัด win-back/conversion ออกถาวร)

## 5.4 ข้อเสนอแนะและงานในอนาคต

1. **AI Chat RAG** — เปิด extension `vector` + ingest เอกสาร + retrieval จริง
2. **R2/S3 storage** — เก็บ artifact โมเดล (`.pkl`) บน object storage แทน local volume
3. **CLV log-space retrain** — แก้การทำนายรายใหญ่ต่ำไปให้สมบูรณ์
4. **Deployment จริง** — server + HTTPS + Postgres backup ตามจำนวนผู้ใช้ 10–50 คน
5. **แจ้งเตือนอีเมล** เมื่อ pipeline เสร็จ และ **AI explanation** อัตโนมัติต่อรายลูกค้า
6. **รองรับ GPU** เพื่อลดเวลาเทรน และตั้ง retrain policy อัตโนมัติเมื่อ realized outcome ต่ำกว่าเกณฑ์

## 5.5 บทสรุป

ระบบ Moby Analytics แสดงให้เห็นการนำ Machine Learning มาใช้กับปัญหาธุรกิจจริงแบบครบวงจร
ตั้งแต่การนำเข้าข้อมูล การเทรนที่กันข้อมูลรั่วและวัดผลได้ ไปจนถึงการนำเสนอผลที่ตรวจสอบย้อนกลับได้
และผู้ช่วย AI ที่มีการกำกับ โดยยึดหลัก 3 ข้อ (point-in-time, observed≠predicted, ทุกตัวเลข trace ได้)
ทำให้ผลลัพธ์น่าเชื่อถือและพร้อมต่อยอดสู่การใช้งานจริงในอนาคต

---

## ภาคผนวก: เอกสารอ้างอิงภายในโปรเจกต์

| เอกสาร | เนื้อหา |
|---|---|
| `docs/ML-CALCULATIONS-TH.md` | สูตรการคำนวณ ML เชิงลึกทุกตัว (churn/CLV/credit/metric/threshold) |
| `claude.md` | สถาปัตยกรรม, schema, conventions (source of truth) |
| `docs/ML-V2-OVERVIEW.md` | ภาพรวม ML v2 + roadmap |
| `docs/ML-V2-OUTPUT-CONTRACT.md` | สัญญา field ของ `ml_prediction_outputs` |
| `docs/ML-V2-TRAINING-PIPELINE.md` | รายละเอียด pipeline การเทรน |
| `docs/ML-V2-DASHBOARD-SPEC.md` | สเปกหน้าเว็บแต่ละ widget |
| `docs/AI-ASSISTANT.md` | สถาปัตยกรรมผู้ช่วย AI |
| `moby-data-prep/docs/*` | สัญญาการนำเข้า Excel + schema raw/clean |
