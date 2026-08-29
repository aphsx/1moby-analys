# รายงานโครงงานระบบ Moby Analytics
## แพลตฟอร์มวิเคราะห์ลูกค้าและทำนายพฤติกรรมด้วย Machine Learning สำหรับธุรกิจ SMS/Email (1Moby)

> **เอกสารฉบับสมบูรณ์ในตัวเอง (self-contained)** — รวมทุกอย่างของระบบไว้ครบในไฟล์เดียว ตั้งแต่ที่มา,
> เทคโนโลยีทั้งหมด, การออกแบบ, ฐานข้อมูลทุกตาราง, การนำเข้าข้อมูล, สูตรการคำนวณ ML ทุกตัว (churn/CLV/credit),
> feature ทุกตัว, metric ทุกตัว, ทุกหน้าเว็บ, API ทุก endpoint, ผู้ช่วย AI, workflow การทำงาน, ผลการทดสอบจริง,
> ตัวอย่างการคำนวณรายลูกค้า (worked example) และสรุปผล — อ่านจบเล่มนี้เข้าใจทั้งระบบโดยไม่ต้องเปิดไฟล์อื่น
> ทุกสูตร/เกณฑ์อ้างอิงจากโค้ดจริงในรีโพ (ถ้าเอกสารขัดกับโค้ด ให้เชื่อโค้ด)

**สารบัญ**
- [บทที่ 1 บทนำ](#บทที่-1-บทนำ)
- [บทที่ 2 ทฤษฎีและเทคโนโลยีที่เกี่ยวข้อง](#บทที่-2-ทฤษฎีและเทคโนโลยีที่เกี่ยวข้อง)
- [บทที่ 3 การวิเคราะห์และออกแบบระบบ](#บทที่-3-การวิเคราะห์และออกแบบระบบ)
- [บทที่ 4 การพัฒนาระบบและรายละเอียดการคำนวณทั้งหมด](#บทที่-4-การพัฒนาระบบและรายละเอียดการคำนวณทั้งหมด)
- [บทที่ 5 สรุปผล ปัญหา และข้อเสนอแนะ](#บทที่-5-สรุปผล-ปัญหา-และข้อเสนอแนะ)

---

# บทที่ 1 บทนำ

## 1.1 ที่มาและความสำคัญของปัญหา

1Moby เป็นผู้ให้บริการส่งข้อความ SMS และ Email แบบ B2B (ลูกค้าซื้อ "เครดิต" มาใช้ส่งข้อความ — เป็นธุรกิจ
แบบ **prepaid** ไม่มีปุ่ม "ยกเลิกบริการ" ลูกค้าเลิกใช้เงียบๆ โดยหยุดจ่าย/หยุดส่ง) ปัญหาเชิงธุรกิจคือทีมงานภายใน
มีข้อมูลการใช้งานและการจ่ายเงินของลูกค้าจำนวนมากในไฟล์ Excel แต่ **ไม่สามารถตอบคำถามสำคัญได้ทันเวลา** เช่น

- ลูกค้ารายไหน "กำลังจะเลิกใช้ (churn)" และควรรีบรักษาไว้ก่อน
- ลูกค้าแต่ละรายมี "มูลค่า (CLV)" ในอีก 6 เดือนข้างหน้าเท่าไร ควรทุ่มทรัพยากรกับใคร
- ลูกค้าจะใช้เครดิตหมดเมื่อไร ควรกระตุ้นให้เติมเงิน (top-up) ตอนไหน

เดิมการวิเคราะห์ทำด้วยมือ ใช้เวลานาน ไม่สม่ำเสมอ ไม่มีการวัดความแม่นยำ โครงงานนี้จึงพัฒนา
**แพลตฟอร์มวิเคราะห์ภายใน** ที่รับไฟล์ Excel รูปแบบมาตรฐาน แล้วประมวลผลด้วย Machine Learning เพื่อทำนาย churn,
แบ่งกลุ่มมูลค่าลูกค้า และพยากรณ์การใช้เครดิต พร้อมแดชบอร์ดที่ทุกตัวเลข **ตรวจสอบย้อนกลับไปยังข้อมูลจริงได้**

## 1.2 วัตถุประสงค์ของโครงงาน

1. รับเข้าข้อมูล Excel รูปแบบตายตัว (8 ชีต) แล้วแปลงเป็นข้อมูลสะอาด (clean) ที่พร้อมวิเคราะห์
2. เทรนโมเดล ML 3 ตัว (churn / CLV / credit) แบบกันข้อมูลรั่ว (point-in-time) และวัดผลได้จริง
3. ทำนายผลลูกค้าทุกคนในไฟล์ พร้อมค่าต่อยอด (revenue at risk, priority, segment)
4. แสดงผลผ่านแดชบอร์ดสำหรับผู้ใช้ภายใน และมีผู้ช่วย AI ตอบคำถามข้อมูลแบบมีการกำกับ (governed)
5. ควบคุมการเข้าถึงด้วยการล็อกอิน (org-shared: ผู้ที่ล็อกอินทุกคนมีสิทธิ์เท่ากัน) และเก็บประวัติ/เวอร์ชันโมเดลเพื่อตรวจสอบได้

## 1.3 ขอบเขตของโครงงาน

**อยู่ในขอบเขต:**
- โมเดล 3 ตัว: **Churn** (โอกาสเลิกใช้), **CLV** (มูลค่า 6 เดือน + p_alive), **Credit forecast** (การใช้เครดิต 30/90 วัน + วันจนต้องเติม)
- การแบ่งสถานะลูกค้าแบบกฎ (Lifecycle: Ghost / Churned / Active Paid / Active Free)
- ผู้ช่วย AI: ถาม-ตอบความรู้บริษัท + Text-to-SQL บนข้อมูลทำนาย (อ่านอย่างเดียว)
- ผู้ใช้ภายในราว 5–50 คน (org-shared: ล็อกอินด้วย Google แล้วมีสิทธิ์เท่ากันทุกคน — ไม่มีการแยกบทบาท admin/member)

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
| **Point-in-time (PIT)** | หลักการกันข้อมูลอนาคตรั่วเข้ามาในการเทรน |
| **Calibration** | การปรับคะแนนโมเดลให้เป็นความน่าจะเป็นจริง (Platt/Isotonic) |
| **Champion / Baseline** | โมเดลที่ถูกเลือกใช้จริง / ตัวเทียบขั้นต่ำที่ต้องเอาชนะ |
| **Revenue at risk** | `churn_probability × predicted_clv_6m` — เงินคาดว่าจะเสียถ้าลูกค้า churn |
| **SHAP** | วิธีคำนวณว่าปัจจัย (feature) ใดผลักดันคะแนนของลูกค้าแต่ละราย |
| **Horizon** | ช่วงเวลาอนาคตที่ใช้สร้าง label (churn/CLV = 180 วัน, credit = 30/90 วัน) |

## 1.6 ผู้ใช้งานและบทบาท (Access model — org-shared)

ข้อมูล/รัน/แดชบอร์ดทั้งหมด "เห็นร่วมกันทั้งองค์กร" (org-wide reads) **ไม่มีการแยกบทบาท admin/member** —
ผู้ที่ล็อกอิน (ด้วย Google OAuth) ทุกคนทำได้ทุกอย่างเท่ากัน (นำเข้าเทรน/ทำนาย, สั่งเทรน, ปักธง champion, ลบ, สั่ง backfill)
ยกเว้นบทสนทนากับผู้ช่วย AI ที่เป็นส่วนตัวรายบุคคล (เห็นเฉพาะเจ้าของ)

---

# บทที่ 2 ทฤษฎีและเทคโนโลยีที่เกี่ยวข้อง

## 2.1 ภาพรวมสถาปัตยกรรม (Monorepo หลายบริการ)

ระบบเป็น **Monorepo** จัดการด้วย **Turborepo + Bun workspaces** ประกอบด้วย 5 บริการที่ทำงานร่วมกัน:

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
- **Better Auth** (Google OAuth; ปิด email/password; เซสชัน 7 วัน)
- **Drizzle ORM** โหมด **introspect-only** (สะท้อน schema จาก `db/init/001_schema.sql` เท่านั้น ห้าม generate/push)
- **ioredis** สำหรับ Redis Streams (ความคืบหน้าการ import)
- ไลบรารีอ่าน Excel: `xlsx`

## 2.4 เทคโนโลยีฝั่ง Machine Learning (`apps/ml`)

- **Python 3.11 + FastAPI** — บริการภายใน (`/health` + `/internal/*` job triggers); ตัวเทรน/ทำนายรันเป็น CLI ที่ถูก spawn
- อัลกอริทึม/ไลบรารีที่ใช้ (รวม ~10 ตระกูล):
  - **LightGBM** — churn classifier, CLV Tweedie/hurdle, credit quantile regression
  - **XGBoost** — CLV Tweedie (opt-in), credit quantile (opt-in), **AFT (survival)** สำหรับวันจน top-up
  - **scikit-learn** — Logistic Regression, Isotonic Regression, Linear Regression (OLS calibration)
  - **lifetimes** — BG/NBD (`BetaGeoFitter`) + Gamma-Gamma (`GammaGammaFitter`) สำหรับ CLV และ p_alive
  - **TabICL** — tabular foundation model (churn candidate; ต้องมี torch)
  - **Optuna** — จูน hyperparameter · **SHAP** — อธิบายปัจจัย (churn factors)

## 2.5 ฐานข้อมูลและคิวงาน

- **PostgreSQL 15** (อิมเมจ `pgvector/pgvector:pg15` — เปิด extension `vector` สำหรับ RAG ของ AI)
- schema มาจากไฟล์เดียว `db/init/001_schema.sql` (bootstrap ตอนสร้าง volume ใหม่; ไม่มี migration framework)
- **Redis** — Redis Streams สำหรับความคืบหน้าการ import (รองรับ Arq queue)

## 2.6 DevOps / เครื่องมือพัฒนา

- **Docker Compose** รันครบทั้ง 5 บริการในคำสั่งเดียว (`docker compose up --build`)
- **Turborepo** จัดการ build/dev/lint/typecheck ข้าม workspace · **Bun** เป็น package manager + runtime

## 2.7 ทฤษฎี Machine Learning ที่ใช้ (อธิบายหลักการ)

### 2.7.1 Churn = Binary classification
ทำนายความน่าจะเป็นที่ลูกค้าจะเลิกใช้ (0–1) วัดด้วย:
- **PR-AUC** (Precision-Recall AUC) — เหมาะกับข้อมูล class เอียง (churner เป็นส่วนน้อย) เป็น metric หลัก
- **Calibration** — โมเดล gradient boosting ให้คะแนน "เรียงถูก" แต่ค่าความน่าจะเป็นดิบเพี้ยน ต้องปรับด้วย **Platt scaling** (logistic บนคะแนนดิบ) หรือ **Isotonic regression** ให้ตรงอัตราจริง เพราะ downstream เอาไปคูณเงิน
- **SHAP** — แยกว่าปัจจัยใดผลักคะแนน churn ของลูกค้าแต่ละรายขึ้น/ลง

### 2.7.2 CLV = โมเดลพฤติกรรมซื้อ + regression
- **BG/NBD (Beta-Geometric/NBD)** — โมเดลความน่าจะเป็นการซื้อซ้ำจาก RFM (frequency/recency/T) ให้ทั้งจำนวนครั้งซื้อคาดการณ์และ **p_alive**
- **Gamma-Gamma** — ประเมินมูลค่าเฉลี่ยต่อการซื้อ
- แข่งกับ **LightGBM Tweedie** (regression ที่ target มีศูนย์เยอะ) และ **Hurdle** (P(ซื้อ)×E[ยอด|ซื้อ]) ตัดสินด้วย **Spearman rank correlation** (งานจริงคือจัดอันดับมูลค่า)

### 2.7.3 Credit = Quantile regression
- ทำนายเป็น "ช่วง" ไม่ใช่ค่าเดียว: เทรน **LightGBM quantile** ที่ควอนไทล์ p10/p25/p50/p75/p90 (p50=median เป็นค่าหลัก)
- วัดด้วย **pinball loss** และ **interval coverage** (ค่าจริงตกในช่วง p10–p90 กี่ %) ปรับช่วงด้วย **CQR (Conformalized Quantile Regression)** ให้ครอบคลุม ~80%
- วันจนต้องเติม (top-up) ใช้ **AFT survival model** (จัดการข้อมูลถูกตัดปลาย/censored เมื่อยังไม่ top-up)

### 2.7.4 AI Assistant
- **Text-to-SQL** ที่ผ่านตัวตรวจ (validator) ก่อนรันจริง — ป้องกันคำสั่งเขียน/คำสั่งอันตราย (ส่วนที่ทำงานจริงตอนนี้)
- **RAG (Retrieval-Augmented Generation)** ด้วย **pgvector** (cosine similarity) สำหรับความรู้บริษัท — **อยู่ระหว่างพัฒนา (planned)** ยังไม่มีตาราง vector ใน schema จริง

---

# บทที่ 3 การวิเคราะห์และออกแบบระบบ

## 3.1 ความต้องการของระบบ (Requirements)

### 3.1.1 ความต้องการเชิงหน้าที่ (Functional)

> โมเดลสิทธิ์เป็นแบบ **org-shared** — ผู้ที่ล็อกอิน (Google) ทุกคนทำได้ทุกอย่างเท่ากัน

| รหัส | ความต้องการ | ผู้ทำ |
|---|---|---|
| FR-1 | นำเข้าไฟล์ Excel 8 ชีต (เทรน) แปลงเป็น raw + clean | ผู้ล็อกอิน |
| FR-2 | นำเข้าไฟล์ Excel (ทำนาย) และสร้าง prediction run อัตโนมัติ | ผู้ล็อกอิน |
| FR-3 | สั่งเทรนโมเดล (เลือก cutoff/horizon) + คัด champion อัตโนมัติ | ผู้ล็อกอิน |
| FR-4 | ทำนายลูกค้าทุกคน เขียน `ml_prediction_outputs` 1 แถว/คน/run | ระบบ |
| FR-5 | แดชบอร์ดภาพรวม + ตารางลูกค้า + Customer 360 | ผู้ล็อกอิน |
| FR-6 | หน้าวัดผลโมเดล (champion metrics + candidate competition) | ผู้ล็อกอิน |
| FR-7 | จัดการเวอร์ชันโมเดล (activate/delete) | ผู้ล็อกอิน |
| FR-8 | ผู้ช่วย AI ถาม-ตอบข้อมูล (Text-to-SQL อ่านอย่างเดียว) + ความรู้บริษัท | ผู้ล็อกอิน |
| FR-9 | วัดผลจริงย้อนหลัง (realized outcome) เมื่อครบ horizon | ผู้ล็อกอิน สั่ง |

### 3.1.2 ความต้องการที่ไม่ใช่หน้าที่ (Non-functional)

- **Point-in-time correctness** — ห้าม feature เห็นข้อมูลหลัง cutoff (มี Gate ตรวจ + leakage suite)
- **Observed ≠ Predicted** — lifecycle (กฎ) ต้องไม่ปนกับคำทำนาย (โมเดล) บนหน้าเว็บ
- **ตรวจสอบย้อนได้** — ทุกตัวเลขบนเว็บ trace กลับไปยัง field ในฐานข้อมูล; ห้าม mock ใน production
- **ความปลอดภัย** — สิทธิ์บังคับที่ backend; AI ห้ามรันคำสั่งเขียน DB; ไม่ log PII
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

### 3.2.1 การเชื่อมต่อบริการจริง (ตรวจจากโค้ด)

- **Elysia (`apps/api/src/index.ts`)** — ประกอบแอปด้วย `.mount(auth.handler)` (Better Auth คุม `/api/auth/*`) + 7 route groups (train-data, predict-data, ai-chat, prediction-runs, training-runs, model-performance, outcome-backfill) + `GET /health`; ตอน boot รัน `releaseStaleTrainImports/Predict()` (ปล่อย import ค้าง), `ensureImportSchemaCompat()` (idempotent — สั่ง `ALTER TABLE "user" DROP COLUMN IF EXISTS role` ทำให้เป็น org-shared), และ `startStaleRunReaper()`; `listen` ที่ `hostname:"::"` (dual-stack), `maxRequestBodySize` ใหญ่พอสำหรับ `.xlsx`, `idleTimeout:0`
- **FastAPI (`apps/ml/api/main.py`) เป็น internal-only** — กันด้วย header `x-internal-token` เทียบแบบ `hmac.compare_digest` กับ `INTERNAL_SERVICE_TOKEN`
  - `/internal/training-runs`, `/internal/prediction-runs`, `/internal/outcome-backfill` — **spawn subprocess แบบ detached** (`subprocess.Popen([python, "-m", "src.cli.train|predict|backfill_outcomes", "--...-id", id], start_new_session=True)`) แล้ว **คืนค่าทันที** (fire-and-forget); ตัว runner ที่ถูก spawn เป็นผู้ปรับ status/progress บนแถว run เอง (แถว run ถูกสร้างโดย Elysia ก่อน = pending)
  - `/internal/model-activate`, `/internal/model-delete` — **synchronous** เรียก `src.training.registry` ตรงๆ (ปรับ alias + activation history ในทรานแซกชันเดียว)
- **CLI (`src/cli/train.py` / `predict.py`)** — บางมาก: argparse → `import runner` → `run_training(id)` / `run_prediction(id)`

สรุป: Elysia เป็นเจ้าของ REST/auth/SSE ทั้งหมด; FastAPI ไม่รัน ML แบบ inline แต่ **แตกกระบวนการลูก** ให้ทำงานเบื้องหลัง จึงตอบ HTTP กลับได้ทันทีและ debug ผ่าน `docker compose logs ml` ได้ (subprocess inherit stdout/stderr)

## 3.3 การออกแบบฐานข้อมูล (`db/init/001_schema.sql`)

ตระกูลตารางทั้งหมด (schema จริงมี **39 ตาราง** ใน `001_schema.sql`; ไม่มี migration framework):

**(1) Auth (Better Auth):** `user` (id, name, email, image, role*, givenName, familyName, locale), `session`, `account`, `verification`
(* คอลัมน์ `role` ถูกยกเลิกแล้วในโมเดล org-shared)

**(2) Train raw/clean:**
- `train_data_sources` — แคตาล็อกไฟล์เทรน: `id`, `name`, `client_label`, `original_filename`, `file_checksum_sha256` (UNIQUE — กันอัปโหลดซ้ำ), `file_size_bytes`, `import_status` (pending/importing/cleaning/ready/failed), `sheet_manifest` (jsonb นับแถวต่อชีต), `clean_manifest`, `imported_at`, `cleaned_at`, `notes`, `error_message`
- `train_raw_sheet_*` (8 ตาราง 1 ต่อ 1 ชีต) — `id` (bigserial), `source_id` (FK CASCADE), `excel_row`, `row_payload` (jsonb เก็บเซลล์ตาม header), `imported_at`
- `train_clean_customers` / `train_clean_payments` / `train_clean_usage` — typed tables (มี `excel_row`, `raw_row_id` lineage); usage มี `channel` (sms/email) + `usage_source` (bc/api/otp)

**(3) Predict raw/clean:** `predict_data_sources` (คล้าย train แต่ไม่มี checksum unique + มี `prediction_run_id`), `predict_raw_sheet_*` (8), `predict_clean_customers/payments/usage`

**(4) ML runtime (`ml_*`) — คอลัมน์จริงจาก schema:**
- `ml_training_runs` — `id`, `source_id`, `run_type` (default `initial_train`), `status`, `cutoff_date`, `horizon_days`, `training_config_json`, `progress_json`, `results_json`, `parent_training_run_id` (สำหรับ retrain lineage), `notes`, `error_message`, `created_by`, timestamps
- `ml_prediction_runs` — `id`, `name`, `predict_source_id`, `status`, `cutoff_date`, `total_customers`, `progress_json`, `model_versions_json`, `cohort_insight_json` (AI run summary), `model_overrides_json` (override เวอร์ชันต่อ model_type), `error_message`, `created_by`, timestamps
- `ml_prediction_outputs` — **1 แถว/ลูกค้า/run** (UNIQUE(prediction_run_id, acc_id)) คอลัมน์จริง: `lifecycle_stage`, `sub_stage`, `churn_probability(5,4)`, `churn_risk_level`, `churn_factors_json`, `predicted_clv_6m(14,2)`, `p_alive(5,4)`, `customer_value_tier`, `revenue_at_risk(14,2)`, `predicted_credit_usage_30d/90d(14,2)`, `credit_forecast_interval_json` (p10/p90×30/90), `estimated_days_until_topup`, `credit_urgency_level`, `usage_trend`, `days_since_last_activity`, `n_purchases`, `total_revenue`, `avg_transaction_value`, `ever_paid`, `priority_score(5,2)`, `segment`, `priority_rank`, `needs_review`, `ai_explanation`/`ai_reasoning_json`/`ai_generated_at`/`ai_model`/`ai_status` (Phase 2), `output_status`, `output_notes`, `model_eligibility_json`, `model_versions_json`, `profile_snapshot_json`
- `ml_model_versions` (status candidate/production/archived), `ml_model_aliases` (`production` 1 ตัวต่อ model_type — unique index), `ml_model_activation_history`, `ml_model_evaluations` (holdout/backtest/production_holdout + cutoff_date, baseline_name, calibration_json), `ml_feature_sets` (feature_code_hash), `ml_data_validation_reports` (gate/leakage)

**(5) AI chat (`ai_*`) — สถานะจริง:** มีเฉพาะ `ai_conversations` (user-scoped, optional `run_id`) และ `ai_messages` (role user/assistant, `evidence_json`) ที่ **live ใน schema จริง**; ตาราง knowledge/vector (`ai_knowledge_documents`, `ai_knowledge_chunks` + `embedding vector(768)`) สำหรับ RAG **ยังเป็น planned — ยังไม่มีใน `001_schema.sql`**

หลักการออกแบบ: raw/clean ผูก `source_id` (CASCADE) อัปโหลดซ้ำ=ล้างแล้วใส่ใหม่; ผล ML รวมตารางเดียว; champion เลือกผ่าน alias; Drizzle สะท้อน schema เท่านั้น

## 3.4 การนำเข้าข้อมูล (Excel Import Contract) — ละเอียด

### 3.4.1 ไฟล์ Excel 8 ชีตตายตัว

| ชีต | เนื้อหา/คอลัมน์สำคัญ | ตาราง raw |
|---|---|---|
| `Users+User_profile` | acc_id, status(SMS/Email), credit, credit_email, expire, expire_email, join_date, last_access, last_send | `*_raw_sheet_users_user_profile` |
| `Backend_payment` | uid, payment_date, acc_id, credit_add, amount, credit_type | `*_raw_sheet_backend_payment` |
| `SMS_usage (BC/API/OTP)` | year, month, acc_id, usage | `*_raw_sheet_sms_usage_{bc,api,otp}` |
| `Email_usage (BC/API/OTP)` | year, month, acc_id, usage | `*_raw_sheet_email_usage_{bc,api,otp}` |

### 3.4.2 ขั้นตอน import → clean
1. อัปโหลด → ตรวจ `.xlsx` + คำนวณ SHA256 (train: ซ้ำ → 409 DUPLICATE_FILE; predict: ไม่กันซ้ำ ถือเป็น snapshot ใหม่)
2. Parse 8 ชีต → เขียน `*_raw_sheet_*` (เก็บ `row_payload` ต่อแถว, batch ครั้งละ 500)
3. Clean ETL: typed columns, ตัดแถวเสีย (เช่น payment ไม่มี `payment_date`), รวม 6 ชีต usage เป็น `*_clean_usage` (มี channel+usage_source) → เขียน `clean_manifest {raw, clean:{customers,payments,usage}, skipped, warnings}`
4. อัปเดต `import_status='ready'`
- **Train:** ความคืบหน้าสตรีมผ่าน Redis Stream `train-import:{source_id}` (raw 5–45% → clean 45–100%); เว็บ poll `GET /train-data-sources/:id/import/progress`
- **Predict:** เป็น synchronous; เมื่อสำเร็จ **สร้าง auto prediction run** อัตโนมัติ (ปิดด้วย `auto_run=false`)

## 3.5 การออกแบบ ML Pipeline (ภาพรวม — รายละเอียดสูตรอยู่บทที่ 4)

**เทรน:** `train_clean_*` → Gates 1–5 → labels + features (Tier A) → temporal split (60/20/20) → preprocess (fit เฉพาะ train) → baselines → candidates + Optuna → calibration → evaluation (val/test/backtest) → promotion gate → artifacts + `ml_model_versions` (alias `production`)

**ทำนาย:** `predict_clean_*` → Gates → features → lifecycle rules → champion models (churn/clv/credit) → SHAP (churn) → derived fields → `ml_prediction_outputs` (1 แถว/ลูกค้า)

## 3.6 การออกแบบ API (Route map — Elysia) ครบทุก endpoint

ทุก route อยู่หลัง `requireUser` (401 ถ้าไม่ล็อกอิน); reads/writes เปิดทั้งองค์กร; บทสนทนา AI = เจ้าของเท่านั้น

```
Auth              /api/auth/*                          Better Auth (Google OAuth)
Health            GET  /health                         public

Prediction runs   GET  /prediction-runs                list ทั้งหมด
                  POST /prediction-runs                สร้าง run { predict_source_id, cutoff_date?, model_overrides? } → trigger ML
                  GET  /prediction-runs/:id            รายละเอียด + progress
                  POST /prediction-runs/:id/retry      รันซ้ำที่ล้มเหลว
                  DELETE /prediction-runs/:id          ลบ (cascade)
                  GET  /prediction-runs/:id/summary    aggregates แดชบอร์ด
                  GET  /prediction-runs/:id/outputs    ตารางลูกค้า (sort/filter/paginate)
                  GET  /prediction-runs/:id/outputs/:acc_id            Customer 360 (1 คน)
                  GET  /prediction-runs/:id/customers/:acc_id/usage-monthly | payments
                  GET  /prediction-runs/:id/realized-outcomes          ผลจริงหลังครบ horizon
                  GET/POST /prediction-runs/:id/insight                AI run summary (อ่าน/สร้าง)
                  POST /prediction-runs/:id/outputs/:acc_id/ai-explanation   AI อธิบายรายคน

Data sources      GET  /predict-data-sources           list
                  GET  /predict-data-sources/:id       detail
                  GET  /predict-data-sources/:id/suggested-cutoff
                  POST /predict-data-sources/import    import predict + auto prediction run
                  GET  /train-data-sources[/:id]       list/detail
                  GET  /train-data-sources/:id/import/progress          poll progress (Redis+DB)
                  GET  /train-data-sources/:id/suggested-cutoff
                  POST /train-data-sources/import[/async]                import (sync/async)
                  DELETE /{train,predict}-data-sources/:id               ลบ (cascade)

Training/models   GET  /training-runs[/:id]            list/detail
                  POST /training-runs                  สั่งเทรน { train_source_id, cutoff_date?, horizon_days? } → trigger ML
                  DELETE /training-runs/:id            ลบเฉพาะรันที่ failed
                  GET  /model-performance              champion ต่อ model_type + lifecycle
                  GET  /model-performance/:type/versions                รายการเวอร์ชัน (override picker)
                  POST /model-performance/:type/activate                ปักธง production
                  DELETE /model-performance/:type/versions/:id          ลบเวอร์ชันที่ไม่ใช่ production
                  POST /outcome-backfill               สั่งวัดผลจริงย้อนหลัง { prediction_run_id?, force? }

AI chat           GET  /ai-chat/config                 provider/model + configured
                  GET/POST /ai-chat/conversations      list/create
                  GET/PATCH/DELETE /ai-chat/conversations/:id           get/rename-archive/delete
                  POST /ai-chat/conversations/:id/messages              SSE token stream
```

**Startup ของ Elysia:** ปล่อย import ที่ค้าง (>15 นาที), start stale-run reaper (ทำรันค้าง >120 นาทีเป็น failed ตอนบูตและทุก 5 นาที), mount Better Auth, ตั้ง CORS จาก `ALLOWED_ORIGINS`

**สะพานสู่ ML (`ml-internal.ts`):** `triggerMlJob(path, payload)` — POST ไป `ML_INTERNAL_URL` + header `x-internal-token`, timeout `ML_INTERNAL_TIMEOUT_MS` (30s); เรียก `/internal/training-runs`, `/internal/prediction-runs`, `/internal/model-activate`, `/internal/model-delete`, `/internal/outcome-backfill`

## 3.7 การออกแบบส่วนติดต่อผู้ใช้ (หน้าเว็บทั้ง 9) ละเอียด

| หน้า | เส้นทาง | แสดง/ทำอะไร | API ที่เรียก |
|---|---|---|---|
| Login | `/login` | Google OAuth (รองรับ `?redirect=`) | Better Auth `/api/auth/*` |
| Dashboard | `/` | ภาพรวม run: KPI cards, lifecycle mix, กราฟรายได้รายเดือน (recharts), risk/value/credit cards, **value×risk matrix**, top-priority table, AI run summary; มี run selector บน header | `/prediction-runs`, `/prediction-runs/:id/summary`, `/prediction-runs/:id/insight` |
| Customers | `/customers` | ตารางลูกค้า filter/sort/paginate **ที่ฝั่ง server**, ค้นหา, presets, export CSV, ปุ่ม Gen AI รายคน (filter อยู่ใน URL) | `/prediction-runs/:id/outputs?...`, `.../ai-explanation` |
| Customer 360 | `/customers/[id]` | churn %/risk, CLV/p_alive, credit + วันจน top-up, profile snapshot (เครดิต SMS/Email), กราฟ usage/credit + payment (recharts), **churn factors (SHAP)** ตอบ "ทำไมคนนี้เสี่ยง" | `.../outputs/:acc_id`, `.../usage-monthly`, `.../payments` |
| Runs | `/runs` | นำเข้าไฟล์ทำนาย, สร้าง run (auto cutoff, override เวอร์ชันโมเดลได้), ตารางรัน (สถานะ/progress/retry/delete), เปิดผลบนแดชบอร์ด; poll ระหว่างรัน | `/predict-data-sources[/import]`, `/prediction-runs[...]`, `/model-performance/:type/versions` |
| Training | `/training` | อัปโหลด/เลือก dataset (XHR+progress), สั่งเทรน (cutoff/horizon), การ์ดสถานะโมเดล (activate/delete เวอร์ชัน), ประวัติเทรน; poll รันที่กำลังเทรน | `/train-data-sources[/import/async]`, `/training-runs`, `/model-performance/...` |
| Model Performance | `/model-performance` | เมตริก champion ต่อ model_type: primary metric, แยกตาม split, **candidate competition** (ตัวไหนแพ้/ชนะ), churn diagnostics (อ่านอย่างเดียว) | `/model-performance` |
| AI Chat | `/ai-chat` | แชตกับ Moby AI: sidebar (สร้าง/เปลี่ยนชื่อ/archive/ลบ), ผูก run scope, สตรีมคำตอบ + evidence panel (SQL), quick prompts | `/ai-chat/*` |
| Profile | `/profile` | แก้ชื่อ/อวาตาร์, ดูข้อมูล Google, ลบบัญชี | Better Auth |

**การป้องกันเส้นทาง:** `proxy.ts` (Next.js 16) ตรวจเซสชันทุกหน้า (ยกเว้น `/login`) → redirect `/login?redirect=<path>` เมื่อยังไม่ล็อกอิน;
**mock toggle:** `NEXT_PUBLIC_ML_USE_MOCK=1` สลับใช้ข้อมูลจำลอง (`mocks/ml.ts`) สำหรับ dev/demo

## 3.8 การออกแบบความปลอดภัยและสิทธิ์

- **Better Auth** — Google OAuth เท่านั้น (ปิด email/password), เซสชัน 7 วัน, self-delete บัญชีได้
- **Middleware** — `userPlugin` derive `{userId}`; `requireUser` (401 ถ้าไม่มีเซสชัน)
- **Access control** (`access-control.ts`) — org-shared: ผู้ล็อกอินอ่าน/แก้ได้ทุกอย่าง, guard เช็คแค่ record มีอยู่ (404); บทสนทนา AI = เจ้าของ
- **Internal token** — Elysia→FastAPI กันด้วย `x-internal-token`

## 3.9 การออกแบบผู้ช่วย AI (Governed) — สถานะจริงจากโค้ด

โครงจริงอยู่ที่ `apps/api/src/lib/ai/*` และ route `POST /ai-chat/conversations/:id/messages` (SSE)

- **LLM:** Ollama Cloud (`qwen3.5:397b-cloud`) — `llm-client.ts` (`complete`/`stream`), config ใน `llm-config.ts`
- **Orchestrator (`orchestrator.ts`) — เป็น async generator ของ SSE:** safety check (`safety.ts`) → โหลด/จำกัดประวัติ → บันทึกข้อความผู้ใช้ → **self-correcting Text-to-SQL agent** (`sql-agent.ts`) → สตรีมคำตอบที่ grounded บน evidence → บันทึกข้อความ assistant + evidence → (เทิร์นแรก) ตั้งชื่อบทสนทนา; conversation ที่ผูก run จะถูก hard-scope เฉพาะ run นั้น
- **โหมดคำตอบจริง:** `text_to_sql` (มี SQL) หรือ `direct` (ตอบจากบริบท) — ทุกคำตอบใช้ evidence เท่านั้น
- **Text-to-SQL guardrails:** `semantic-layer.ts` (นิยาม table/column/metric/role ที่อนุญาต), `sql-guard.ts` (validator deterministic: `SELECT` เดียว; บล็อก `INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/COPY/EXECUTE/CALL` และ `SELECT *`; เฉพาะตาราง/คอลัมน์ที่ modeled; บังคับ `LIMIT`), `scope.ts` (จำกัดแถวตามสิทธิ์), `sql-executor.ts` (รัน read-only)
- **นอกจากแชต:** ยังมี AI อธิบายรายลูกค้า (`customer-explanation.ts` → `ai_explanation`) และสรุประดับ run (`run-insight.ts` → `cohort_insight_json`)
- **Streaming (SSE, `constants.ts`):** events `thinking / token / evidence / title / done / error`; เก็บ evidence (SQL, row_count, columns, warnings, sources) ทุกข้อความเพื่อ audit
- **RAG (pgvector) = planned:** ยังไม่มีตาราง knowledge/vector ใน schema จริง (มีแค่ ai_conversations/ai_messages); เมื่อเปิดจะ chunk→embed→ค้น cosine (`embedding <=> query`) + อ้างอิงแหล่ง

---

# บทที่ 4 การพัฒนาระบบและรายละเอียดการคำนวณทั้งหมด

> บทนี้คือหัวใจ — อธิบายว่า **ทุกค่าที่ระบบแสดงคำนวณมาจากอะไรจริงๆ** ไม่ใช่เสกขึ้น ทุกสูตรอ้างอิงโค้ดใน `apps/ml/src`

## 4.1 หลักการเวลา (Point-in-time)

ทุกอย่างคิด ณ **cutoff**: feature ใช้ข้อมูลก่อน cutoff เท่านั้น (`payment_date < cutoff`, usage `period < cutoff`),
label ใช้ข้อมูลหลัง cutoff ภายใน horizon; cutoff ต้องเป็น **วันที่ 1 ของเดือน** (usage รายเดือน)
ค่ามาตรฐาน: `horizon_days=180` (churn/CLV), `active_window_days=180`, credit horizon = 30 และ 90 วัน

## 4.2 Lifecycle Segmentation (กฎล้วน ไม่ใช่ ML)

คำนวณจากธง 3 ตัว (`build_lifecycle_outputs()` ใน `features.py`):
- `has_activity_history` = มีกิจกรรมใดๆ ก่อน cutoff (payment หรือ usage>0) อย่างน้อย 1
- `active_in_window` = มีกิจกรรมในช่วง `[cutoff−180, cutoff)`
- `ever_paid` = เคยจ่ายเงินก่อน cutoff

กฎ (ตัดสินตามลำดับ):
```
ถ้า not has_activity_history → "Ghost"       (ไม่เคยมีกิจกรรมเลย)
ถ้า not active_in_window     → "Churned"     (เคยใช้ แต่เงียบ >180 วัน)
ถ้า ever_paid               → "Active Paid"  (ยัง active + เคยจ่าย)
มิฉะนั้น                    → "Active Free"  (ยัง active แต่ไม่เคยจ่าย)
```
sub_stage: Ghost / Churned Paid (ever_paid) / Churned Free / Active Free / Active Paid

## 4.3 Model Eligibility + การงดประเมิน churn

ตอนทำนาย (`prediction/runner.py`): `el_churn` = Active Paid เท่านั้น; `el_clv` = `el_credit` = Active (Paid+Free)
- **Abstention:** แม้เป็น Active Paid แต่ถ้า `customer_age_days < 90` (`CHURN_ABSTAIN_MIN_TENURE_DAYS`) → งดให้คะแนน churn (churn_probability/risk/factors = null, status `insufficient_data`) เพราะ feature ยังถูกเติมศูนย์ ไม่มีสัญญาณจริง

## 4.4 Feature ทั้งหมด (Tier A) — 27 (churn/CLV) + 4 (credit) = 31 ตัว พร้อมสูตร

ทุก feature คิด ณ cutoff จากข้อมูลก่อน cutoff (`FEATURE_METADATA` ใน `features.py`); `signed_log1p(x)=sign(x)·log(1+|x|)`

**พฤติกรรมการจ่ายเงิน:**
| feature | สูตร |
|---|---|
| `customer_age_days` | `cutoff − join_date` |
| `days_since_last_payment` | `cutoff − max(payment_date)` |
| `payment_count_all` / `payment_count_180d` | นับ payment ทั้งหมด / ใน 180 วัน |
| `total_revenue_all` / `total_revenue_180d` | `Σ amount` ทั้งหมด / 180 วัน |
| `avg_transaction_value` | `mean(amount)` |
| `payment_interval_mean_days` | ค่าเฉลี่ยระยะห่างวันจ่ายติดกัน |
| `payment_overdue_ratio` | `days_since_last_payment / payment_interval_mean_days` |
| `payment_amount_cv` | `std(amount)/mean(amount)` (แยกจ่ายสม่ำเสมอ vs กระชาก) |

**พฤติกรรมการใช้งาน:**
| feature | สูตร |
|---|---|
| `days_since_last_activity` / `days_since_last_usage` | `cutoff − max(activity/usage>0)` |
| `usage_total_180d` / `usage_recent_90d` / `usage_prev_90d` | `Σ usage` 180d / 90d ล่าสุด / 90–180 วันก่อน |
| `usage_change_90d_pct` | `signed_log1p((recent90−prev90)/prev90)` (โมเมนตัม) |
| `usage_decay_ratio` | `signed_log1p(recent90/prev90)` |
| `usage_slope_6m` | ความชันเชิงเส้นของ usage รายเดือน 6 เดือน |
| `usage_active_months_180d` / `usage_consistency_ratio` | จำนวนเดือนที่ usage>0 / หารด้วย 6 |

**สัดส่วนช่องทาง:**
| feature | สูตร |
|---|---|
| `sms/email/bc/api/otp_usage_share` | usage แต่ละช่องทาง/แหล่ง ÷ usage รวม |
| `channel_hhi` | `sms_share² + email_share²` (Herfindahl; 1=ช่องทางเดียว) |
| `multichannel_flag` | 1 ถ้าใช้ทั้ง SMS และ Email |

**เครดิต (เฉพาะโมเดล credit):**
| feature | สูตร |
|---|---|
| `credit_added_180d` | `Σ credit_add ใน 180 วัน` |
| `credit_balance_proxy` | `Σ credit_add − Σ usage` ก่อน cutoff (PIT-safe; ไม่ใช้ snapshot credit_*) |
| `credit_runway_months` | `credit_balance_proxy / (usage_recent_90d/3)` clip `[0,24]` |
| `credit_usage_decel` | `signed_log1p` ของการเปลี่ยนอัตราเผาต่อเดือน |

การเติมค่าว่าง: กลุ่มนับ/ผลรวม/share/credit → 0; กลุ่มอัตรา/ระยะเวลา (age, days_since_*, avg_transaction_value, interval, overdue, cv) → nullable แล้ว preprocessor เติมด้วย median จาก train เท่านั้น

## 4.5 โมเดล Churn (รายละเอียดเต็ม)

**Label (`labels.py`):** ประชากร = Active Paid (active ใน 180 วัน + เคยจ่าย); `churn_label=1` ถ้าไม่มี payment และไม่มี usage>0 เลยในช่วง `[cutoff, cutoff+180)`

**Candidate + การเลือก (`churn_trainer.py`):** `DEFAULT_CANDIDATES = [logistic_regression, lightgbm, tabicl]` (RandomForest/XGBoost opt-in) → เลือกผู้ชนะด้วย **5-fold CV PR-AUC** สูงสุด

**churn_probability (ตอนทำนาย):**
```
raw = model.predict_proba(x)[:,1]
churn_probability = clip(calibrator.transform(raw), 0, 1)   # เฉพาะ el_churn
```
**Calibration:** เลือก **Platt** (LogisticRegression) หรือ **Isotonic** โดย fit บน OOF 5-fold — ใช้ Isotonic ก็ต่อเมื่อ positive ≥ 200 และ (ลด ECE เกิน `ECE_IMPROVEMENT_MARGIN=0.005` หรือ ECE เท่าๆ กันแต่ Brier ดีกว่าเกิน `ISOTONIC_BRIER_MARGIN=0.02`)

**churn_risk_level:** เทียบ threshold จาก `thresholds.json` (ถ้าไม่มี → run ล้ม ไม่ยอมเดา):
```
p ≥ critical → "critical"; p ≥ high → "high"; p ≥ medium → "medium"; else → "low"
```
ที่มา threshold (ตอนเทรน): หา high ที่ทำให้ **F2 สูงสุด** แล้ว
```
high = clip(f2_threshold, 0.35, 0.85)      # HIGH_THRESHOLD_BAND
medium = round(high × 0.5, 2)
critical = round(high + 0.6 × (1 − high), 2)
```
ตัวอย่าง high=0.50 → medium=0.25, critical=0.80

**churn_factors (SHAP top-5):** linear → `x·coef`; tree(lightgbm) → `TreeExplainer`; tabicl(opaque) → `null`; รูปแบบ `{feature, value, direction:up/down, impact=|SHAP|}`

## 4.6 โมเดล CLV (รายละเอียดเต็ม)

**Label:** `future_revenue_6m` = `Σ amount` ของ payment ในช่วง `[cutoff, cutoff+180)` (ศูนย์ได้)

**Candidate + การเลือก (`clv_trainer.py`):** `bgnbd_gamma_gamma`, `lgbm_tweedie`, `hurdle` (+ `xgb_tweedie` opt-in) → เลือกด้วย **validation Spearman** สูงสุด

**BG/NBD + Gamma-Gamma (และที่มา p_alive):** RFM คิดจาก payment ก่อน cutoff — `frequency`=(จำนวนวันซื้อไม่ซ้ำ)−1, `recency`=(วันซื้อล่าสุด−วันแรก), `T`=(cutoff−วันแรก), `monetary`=เฉลี่ยเงินต่อวันซื้อซ้ำ
```
n_purchases = BG/NBD.expected_purchases(180, freq, recency, T)
p_alive     = BG/NBD.conditional_probability_alive(freq, recency, T)   # clip[0,1] — ใช้เสมอ
E[profit|ซื้อ] = Gamma-Gamma.expected_average_profit(freq, monetary)   # ต้องมีลูกค้าซื้อซ้ำ ≥ 50
predicted_clv = max(0, n_purchases × E[profit|ซื้อ])
```
**Hurdle:** `CLV = P(รายได้>0) × E[รายได้|รายได้>0]`
**OLS magnitude calibration:** `pred = max(0, slope×raw + intercept)` (slope clip [0.01, 20], default 1.0/0.0)
**Hybrid tail blend (รายใหญ่):** top 10% (`CLV_TAIL_QUANTILE=0.90`, freq≥2.0, ประชากร≥50) → `blended = max(tweedie, bg_clv)` (ใช้กับ tweedie/xgb ไม่ใช้ hurdle)

## 4.7 โมเดล Credit Forecast (รายละเอียดเต็ม)

**Label:** `Σ usage` ในช่วง `[cutoff, cutoff+30)` และ `[cutoff, cutoff+90)`

**โมเดล (`credit_trainer.py`):** LightGBM quantile `QUANTILES=[0.10,0.25,0.50,0.75,0.90]` × 2 horizon = 10 โมเดลย่อย; **ค่าที่แสดง = p50**; Optuna จูนด้วย pinball loss ที่ α=0.50
- **Log-ratio anchor:** เทรนบน `log1p(y) − log1p(carryover)` (carryover = usage เฉลี่ยต่อเดือน×(horizon/30))
- **ถอดกลับ + shrinkage λ + clip:** `expm1(clip(correction+(λ−1)·corr_p50, −1.5, +1.5)+anchor)`, `CORRECTION_CLIP=1.5`, λ∈{0..1}
- **บังคับเรียง quantile ไม่ไขว้** + **90d ≥ 30d เสมอ** (cumulative)
- **CQR:** ขยาย p10/p90 ให้ coverage ≈ **80%** (`TARGET_COVERAGE=0.80`)

**วันจน top-up + urgency:**
- หลัก: **XGBoost AFT** (`survival:aft`) ทำนายวันจน (จูนด้วย F2 ของ alert "≤14 วัน"), ปัดขึ้น, cap `TOPUP_CAP_DAYS=365`
- fallback: `days = min(ceil(credit_balance_total / (p50_30d/30)), 365)`
- urgency (เฉพาะ credit-eligible): ≤14→critical, ≤30→warning, ≤90→monitor, อื่นๆ→stable

## 4.8 Derived business fields

| field | สูตร |
|---|---|
| `revenue_at_risk` | `round(churn_probability × predicted_clv_6m, 2)` |
| `customer_value_tier` | percentile ของ CLV ในกลุ่ม active ที่ CLV>0: ≥0.90→high, ≥0.50→mid, มิฉะนั้น low; ไม่ active/CLV≤0→none |
| `usage_trend` | จาก `usage_change_90d_pct`: >+10%→increasing, <−10%→declining, no usage→no_usage, อื่นๆ→stable |
| `priority_score` | min-max ของ `log1p(revenue_at_risk)` สเกล 0–100 (จัดอันดับด้วย revenue_at_risk) |
| `needs_review` | `(churn∈{high,critical}) OR (valuable AND p_alive<at_risk_cut AND usage_change<−0.10)` และ active |
| `segment` | ตามลำดับ: Ghost / (Churned+เคยจ่าย)=Lapsed / Churned=Dormant / valuable&at_risk=High-Value At-Risk / valuable&watch=Mid-Value At-Risk / valuable=High-Value Stable / at_risk=Low-Value At-Risk / watch=Low-Value Watch / growing=Emerging / อื่นๆ=Stable |

โดย `valuable`=tier∈{high,mid}; `at_risk`=churn∈{high,critical} หรือ p_alive<at_risk_cut; `watch`=churn=medium หรือ p_alive<watch_cut; `growing`=usage_change>0.10
**p_alive cuts (จากตอนเทรน CLV):** at_risk = clip(quantile(p_alive,0.15),0.10,0.30) fallback 0.20; watch = clip(quantile(p_alive,0.40),0.35,0.60) fallback 0.50

**ตัวเลขระดับ run (SQL `run-aggregates.ts`):** `expected_at_risk` = Σ revenue_at_risk (เฉพาะ Active Paid); `high_risk_exposure` = Σ predicted_clv_6m (churn∈{high,critical})

**Descriptive/Meta fields:** `n_purchases`, `total_revenue`, `avg_transaction_value`, `credit_balance_total`, `profile_snapshot` (join_date, status, credit, expire, last_access/send, shares), `output_status` (predicted/partial/insufficient_data), `model_eligibility_json`, `model_versions_json`

## 4.9 Training Pipeline — Gates, split, baseline, leakage, promotion

**Gates 1–5 (`validation.py`; fail = หยุด run):**
| Gate | ตรวจ | เกณฑ์ blocker |
|---|---|---|
| 1 readiness | ข้อมูลพร้อม | import_status=ready; customers/payments/usage ไม่ว่าง |
| 2 schema | คุณภาพ | วันที่ parse ไม่ได้ ≤0.5%; acc_id ไม่ null; usage≥0; ไม่มี customer ซ้ำ |
| 3 cutoff | ช่วงเวลา | มีประวัติก่อน cutoff−180; มีข้อมูลถึง cutoff+180 |
| 4 label viability | label พอ | churn eligible≥500/pos≥100/neg≥100/rate 0.05–0.80; CLV eligible≥500/nonzero≥100; credit nonzero≥500; variance>0 |
| 5 leakage | ไม่มีอนาคต | feature ทุกตัว date<cutoff; ชื่อ feature ตรง contract; ห้าม snapshot field |

**Temporal split:** 60/20/20 (train/val/test) stratified, grouped ตาม acc_id, `RANDOM_SEED=42`; backtest ถอยทีละ 2 เดือน สูงสุด 6 (ต้องมีประวัติ≥365 วัน + label ครบ)

**Baselines (7):** churn: recency_rule_90d, rfm_quartile, logistic_regression; clv: segment_mean, revenue_180d_carryover; credit: last_30d_carryover, moving_avg_90d

**Leakage suite (หลังเทรน; fail=block):** single-feature AUC>0.90, shuffle-label AUC≈0.5(±0.07), suspect-drop 0.30, time-travel consistency, split contamination, score sanity>0.97 (warn)

**Promotion gate (2 stage; ต่อ model):**
- Stage 1 (ต้องผ่านทุกข้อ): ผ่าน leakage + artifact load; ชนะ baseline บน val/test/**ทุก backtest**; ชนะ champion เดิมเกิน margin (churn/clv 1% rel, credit 0.5%); เสถียร (drop ≤ churn/clv 30%, credit 25%); calibration (churn ECE≤0.10; credit coverage≤0.90 เกิน 0.001)
- Stage 2: composite = mean(metric test+backtest) − penalty(ECE); credit เพิ่ม MAE ≤ 1.10× baseline
- เกณฑ์หลัก: churn=`pr_auc`, clv=`spearman`, credit=`coverage_p10_p90`; ถ้าไม่ผ่าน → คง champion เดิม

## 4.10 Metrics — สูตรทุกตัว (`metrics.py`)

**Churn:** `pr_auc`=average_precision; `roc_auc`; `f1`=2PR/(P+R) ที่ threshold; `precision`=TP/(TP+FP); `recall`=TP/(TP+FN); `recall@k`/`lift@k` (top 5/10/20%); `brier`=MSE ของ prob; `bss`=1−brier/(base·(1−base)); `ece` (10 bins เฉลี่ยถ่วง |จริง−ทำนาย|); `mce` (bin แย่สุด); `log_loss`
- เลือก threshold: max **Fβ (β=2)** = `(1+β²)PR/(β²P+R)` เน้น recall
**CLV:** `spearman`; `mae`; `rmse`; `rmsle`=√mean((log1p ŷ−log1p y)²); `smape`; `top_decile_capture`
**Credit:** `coverage_p10_p90`; `pinball`; `winkler`; `mae/smape` ต่อ horizon
**Realized outcome:** ใช้ฟังก์ชัน metric ตัวเดียวกัน จับคู่ label จริงหลังครบ horizon (ต้อง≥20 ราย) → `ml_model_evaluations (production_holdout)`

## 4.11 Design contract & policy (หลักการ/นโยบาย)

1. **PIT** 2. **Temporal split เท่านั้น** 3. **ต้องชนะ baseline** 4. **Probability ต้อง calibrated** 5. **reproducible** (fix seed) 6. **หลักฐานลง DB**
- **Class imbalance:** ใช้ scale_pos_weight; ห้าม SMOTE; วัดด้วย PR-AUC
- **Feature tiers:** A=event history (ใช้เทรน), B=snapshot (ห้ามเทรน แสดงได้), C=last_access/send (ห้าม)
- **Retrain:** dataset ใหม่ / ~90 วัน / drift PSI>0.2 / performance decay → เทรนใหม่หมดทุกครั้ง
- **Artifacts:** `models/{type}/{version}/`: model.pkl, calibrator.pkl, preprocessor.json, feature_names.json, thresholds.json, metrics.json, model_card

## 4.12 ตารางค่าคงที่ (`constants.py`)

| ค่า | ค่า | ใช้ |
|---|---|---|
| active_window_days / horizon_days | 180 / 180 | lifecycle/label |
| credit horizons | 30, 90 | credit label |
| CHURN_ABSTAIN_MIN_TENURE_DAYS | 90 | งดประเมิน churn |
| HIGH_THRESHOLD_BAND / F-beta | (0.35,0.85) / 2.0 | threshold churn |
| ECE margin / Isotonic Brier margin / isotonic min pos | 0.005 / 0.02 / 200 | calibration |
| VALUE_TIER_HIGH/MID_PCT | 0.90 / 0.50 | value tier |
| MOMENTUM_BAND | 0.10 | trend |
| URGENCY CRITICAL/WARNING/MONITOR | 14/30/90 | credit urgency |
| P_ALIVE atrisk/watch rate | 0.15 / 0.40 | p_alive cuts |
| CLV tail q/minpop/minfreq | 0.90/50/2.0 | blend รายใหญ่ |
| credit QUANTILES / point | p10–p90 / p50 | quantile |
| CORRECTION_CLIP / TARGET_COVERAGE | 1.5 / 0.80 | decode + CQR |
| TOPUP_CAP_DAYS | 365 | cap วันจน top-up |
| split / seed | 60/20/20 / 42 | train/val/test |
| Gate4 churn eligible/pos/neg / rate | 500/100/100 / 0.05–0.80 | label viability |
| promote margin churn/clv/credit | 1%/1%/0.5% | ชนะ champion |
| stability drop churn/clv/credit | 30%/30%/25% | เสถียร |
| churn ECE ceiling/target | 0.10/0.05 | calibration gate |
| CREDIT_MAE_TOLERANCE | 1.10 | credit MAE |

## 4.13 สภาพแวดล้อมและการติดตั้ง (Deployment)

```bash
cp .env.example .env          # ใส่ค่าลับ (secret, Google OAuth ฯลฯ)
docker compose up --build     # db, redis, ml, api, web
```
Postgres bootstrap schema จาก `db/init/001_schema.sql` อัตโนมัติ; ตัวแปรสำคัญ: `DATABASE_URL`, `REDIS_HOST`, `INTERNAL_SERVICE_TOKEN`, `BETTER_AUTH_SECRET`, `ELYSIA_URL`, `ML_INTERNAL_URL`, `LLM_*`/`OLLAMA_*`

## 4.14 Workflow การทำงานจริง (ตั้งแต่ต้นจนจบ)

1. **ล็อกอิน** — เปิด `localhost:3000` → redirect `/login` → Google OAuth → session cookie
2. **นำเข้าเทรน + เทรน** — หน้า Training อัปโหลด Excel → raw→clean (Redis progress) → เลือก cutoff (ต้นเดือน) → Elysia ตรวจ Gate 3 → FastAPI `/internal/training-runs` → spawn `train_v2.py` → Gates→features→split→baselines→candidates(Optuna)→calibration→evaluation→**promotion gate**→ปักธง production
3. **นำเข้าทำนาย + สร้าง run** — หน้า Runs นำเข้า Excel → clean → auto prediction run → FastAPI `/internal/prediction-runs` → spawn `predict_v2.py` → features→lifecycle→champion→SHAP→derived→batch insert `ml_prediction_outputs`→post-check→completed
4. **ดูผล** — Dashboard/Customers/Customer 360/Model Performance
5. **AI Assistant** — ถามภาษาไทย → tool → Text-to-SQL ผ่าน validator → ตอบพร้อม evidence (สตรีม)
6. **Realized outcome** — ครบ horizon → `POST /outcome-backfill` → วัดผลจริง

## 4.15 ผลการทดสอบจริง (End-to-end บนชุดตัวอย่าง)

ทดสอบด้วย `data/[1Moby] Data_example for Bangkok university.xlsx`:
- **นำเข้า (train):** customers 25,093 | payments 13,882 | usage 76,255 แถว
- **เทรน (cutoff 2025-07-01):** ปักธง production ครบ 3 โมเดล

| โมเดล | ผู้ชนะ | เมตริกหลัก | baseline |
|---|---|---|---|
| Churn | tabicl | PR-AUC **0.761** | logistic 0.740 |
| CLV | lgbm_tweedie | Spearman **0.535–0.546** | 0.365 |
| Credit | LightGBM quantile | coverage p10–p90 **0.864** | — |

- **ทำนาย (cutoff 2026-01-01):** `ml_prediction_outputs` = **30,697 แถว**; lifecycle: Ghost 19,273 / Churned 7,174 / Active Paid 2,572 / Active Free 1,678; revenue at risk (expected) ≈ **54.2M฿**, high-risk exposure ≈ 21.1M฿

## 4.16 ตัวอย่างการคำนวณรายลูกค้า (Worked example)

สมมติลูกค้า Active Paid อายุ 400 วัน (>90 → ไม่ abstain):
1. **Feature** สร้างจากประวัติก่อน cutoff (payment RFM, usage 90/180 วัน, shares ฯลฯ)
2. **Churn:** โมเดลผู้ชนะให้ raw=0.62 → calibrator → churn_probability=0.58; threshold high=0.50 → 0.58≥0.50 แต่ <critical(0.80) → **risk=high**; SHAP top-5 เช่น `days_since_last_payment↑`, `usage_change_90d_pct↓`
3. **CLV:** BG/NBD+Gamma-Gamma/tweedie → predicted_clv_6m=90,000฿; p_alive=0.72
4. **Derived:** revenue_at_risk = 0.58×90,000 = **52,200฿**; value_tier ตาม percentile ของ run; segment = High-Value At-Risk (valuable+at_risk); priority_score = สเกล log1p(52,200) → 0–100
5. **Credit:** p50_30d=8,000 credits; วันจน top-up ≈ balance/(8000/30); urgency ตามวัน

---

# บทที่ 5 สรุปผล ปัญหา และข้อเสนอแนะ

## 5.1 สรุปผลการดำเนินงาน

พัฒนาแพลตฟอร์มวิเคราะห์ลูกค้าครบวงจรได้สำเร็จ: นำเข้า/ทำความสะอาด Excel 8 ชีต, เทรน 3 โมเดล (churn/CLV/credit)
แบบ point-in-time พร้อมคัด champion ที่ชนะ baseline และวัดผลได้, ทำนายลูกค้าทุกคนพร้อมค่าต่อยอด + SHAP,
แดชบอร์ด + Customer 360 + Model Performance + ผู้ช่วย AI (governed), ควบคุมการเข้าถึงด้วยการล็อกอิน (org-shared)
และเก็บเวอร์ชัน/ประวัติ; ทดสอบ end-to-end ได้ผลจริง (30,697 outputs, churn PR-AUC 0.76)

## 5.2 ปัญหาและอุปสรรค

- ML บน CPU ช้า (TabICL/Optuna) เมื่อไม่มี GPU
- การรัน Docker แบบ container ซ้อน (Cloud Agent) ต้องใช้ `fuse-overlayfs` + legacy iptables จึงสื่อสารข้าม container ได้
- FastAPI bind `::` เป็น IPv6-only บางเครือข่าย ต้องตั้ง `ML_HOST=0.0.0.0`
- คุณภาพข้อมูล: ต้องมีประวัติยาวพอ (Gate 3/4); ลูกค้าใหม่ <90 วันถูกงดประเมิน churn

## 5.3 ข้อจำกัดของระบบ

- ยัง "local Docker first" ไม่มี production จริง (HTTPS/backup/scaling)
- RAG ของ AI (ตาราง knowledge/vector) อยู่ระหว่างพัฒนา; AI explanation เป็นโครง Phase 2
- schema แก้ที่ไฟล์เดียว ไม่มี migration framework
- โมเดลจำกัด 3 ตัว + lifecycle (ตัด win-back/conversion ถาวร)

## 5.4 ข้อเสนอแนะและงานในอนาคต

1. เปิด RAG จริง (vector extension + ingest เอกสาร + retrieval)
2. R2/S3 storage เก็บ artifact โมเดล
3. CLV log-space retrain (แก้ทำนายรายใหญ่ต่ำไปให้สมบูรณ์)
4. Deployment จริง + HTTPS + Postgres backup
5. แจ้งเตือนอีเมลเมื่อ pipeline เสร็จ + AI explanation อัตโนมัติ
6. รองรับ GPU ลดเวลาเทรน + retrain policy อัตโนมัติเมื่อ realized outcome ต่ำกว่าเกณฑ์

## 5.5 บทสรุป

ระบบ Moby Analytics แสดงการนำ Machine Learning มาใช้กับปัญหาธุรกิจจริงแบบครบวงจร ตั้งแต่การนำเข้าข้อมูล
การเทรนที่กันข้อมูลรั่วและวัดผลได้ ไปจนถึงการนำเสนอผลที่ตรวจสอบย้อนกลับได้ และผู้ช่วย AI ที่มีการกำกับ
โดยยึดหลัก 3 ข้อ (point-in-time, observed≠predicted, ทุกตัวเลข trace ได้) ทำให้ผลลัพธ์น่าเชื่อถือและพร้อมต่อยอด

---

## ภาคผนวก: เอกสารประกอบสำหรับนักพัฒนา (ไม่จำเป็นต่อการอ่านรายงานฉบับนี้)

รายงานฉบับนี้ครบในตัวเองแล้ว เอกสารด้านล่างเป็นข้อมูลเสริมเชิงลึกสำหรับผู้พัฒนาเท่านั้น:

| เอกสาร | เนื้อหาเสริม |
|---|---|
| `docs/ML-CALCULATIONS-TH.md` | สูตร ML แบบอ้างอิงบรรทัดโค้ด (สำหรับ dev) |
| `docs/HOW-IT-WORKS.md` | walkthrough ระบบ (EN) |
| `docs/MODEL-DEEP-DIVE-EN.md` | เชิงลึกโมเดล + worked example (EN) |
| `docs/ML-V2-DASHBOARD-SPEC.md` | สเปกหน้าเว็บต่อ widget |
| `docs/AI-ASSISTANT.md` | สถาปัตยกรรมผู้ช่วย AI |
| `claude.md` | architecture source of truth (EN) |
| `moby-data-prep/docs/*` | schema raw/clean + naming convention |
