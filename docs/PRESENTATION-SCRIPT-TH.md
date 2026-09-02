# สคริปต์นำเสนอ Senior Project — Moby Analytics

> เอกสารนี้รวมทุกอย่างที่ต้องใช้นำเสนออาจารย์: โปรเจกต์คืออะไร, โมเดลมาจากไหน, แต่ละตัวเลขคำนวณยังไง, ลำดับการพูด, และคำตอบคำถามที่อาจถูกถาม
>
> อ้างอิงจาก `docs/HOW-IT-WORKS.md`, `docs/ML-CALCULATIONS-TH.md`, และโค้ดจริงใน `apps/ml/`

---

## สารบัญ

1. [โครงสร้างการนำเสนอ (15–20 นาที)](#1-โครงสร้างการนำเสนอ-1520-นาที)
2. [สคริปต์เปิดการนำเสนอ](#2-สคริปต์เปิดการนำเสนอ)
3. [โปรเจกต์คืออะไร — อธิบายให้คนไม่รู้ ML เข้าใจ](#3-โปรเจกต์คืออะไร)
4. [ภาพรวมระบบและ Tech Stack](#4-ภาพรวมระบบและ-tech-stack)
5. [ข้อมูลเข้า — Excel 8 Sheet](#5-ข้อมูลเข้า--excel-8-sheet)
6. [โมเดลคืออะไร มาจากไหน](#6-โมเดลคืออะไร-มาจากไหน)
7. [Lifecycle — สถานะลูกค้า (ไม่ใช่ ML)](#7-lifecycle--สถานะลูกค้า)
8. [การคำนวณทีละขั้น — ตัวอย่างลูกค้า 1 คน](#8-การคำนวณทีละขั้น--ตัวอย่างลูกค้า-1-คน)
9. [โมเดล 3 ตัว — อธิบายละเอียด](#9-โมเดล-3-ตัว--อธิบายละเอียด)
10. [ตัวเลขธุรกิจที่คำนวณต่อจากโมเดล](#10-ตัวเลขธุรกิจที่คำนวณต่อจากโมเดล)
11. [Training Pipeline — โมเดลถูกสอนยังไง](#11-training-pipeline)
12. [ลำดับ Demo สด](#12-ลำดับ-demo-สด)
13. [คำถามที่อาจารย์มักถาม + คำตอบ](#13-คำถามที่อาจารย์มักถาม)
14. [Cheat Sheet — จำก่อนเข้าห้อง](#14-cheat-sheet)

---

## 1. โครงสร้างการนำเสนอ (15–20 นาที)

| ลำดับ | หัวข้อ | เวลา | พูดอะไร / ทำอะไร |
|---|---|---|---|
| 1 | เปิด + ปัญหา | 2 นาที | โปรเจกต์คืออะไร ทำไมต้องทำ |
| 2 | ภาพรวมระบบ | 2 นาที | architecture + flow ข้อมูล |
| 3 | ข้อมูลเข้า | 2 นาที | Excel 8 sheet → clean tables |
| 4 | โมเดล 3 ตัว + การคำนวณ | 6 นาที | **หัวใจ** — ไล่ตัวอย่างลูกค้า 1 คน |
| 5 | ตัวเลขบน Dashboard | 2 นาที | revenue at risk, segment, priority |
| 6 | Demo สด | 3 นาที | เปิดหน้าเว็บ walkthrough |
| 7 | สรุป + Q&A | 2 นาที | metric, limitation, future work |

---

## 2. สคริปต์เปิดการนำเสนอ

> **"สวัสดีครับ/ค่ะ วันนี้ขอนำเสนอโปรเจกต์ Moby Analytics — แพลตฟอร์มวิเคราะห์ลูกค้าสำหรับธุรกิจ SMS/Email ของบริษัท 1Moby"**

**โปรเจกต์นี้คืออะไร (1 ประโยค):**

> ระบบที่รับไฟล์ Excel ข้อมูลลูกค้า → วิเคราะห์พฤติกรรม → ทำนายว่าลูกค้าจะเลิกใช้ (churn), มีมูลค่าเท่าไร (CLV), และต้องเติมเครดิตเมื่อไหร่ — แล้วแสดงผลบน Dashboard ให้ทีมขาย/บริการลูกค้าใช้ตัดสินใจ

**ปัญหาธุรกิจที่แก้:**

- 1Moby ขายเครดิต SMS/Email แบบ **pre-pay** — ลูกค้าซื้อเครดิตแล้วค่อยใช้ ไม่มีปุ่ม "ยกเลิก subscription"
- ดังนั้น **churn วัดไม่ได้จากสถานะบัญชี** ต้อง infer จาก "ความเงียบ" — ไม่จ่าย + ไม่ส่งข้อความ
- ทีมขายมีลูกค้าหลายพันคน ไม่มีเวลาไล่ดูทีละคน → ต้องมีระบบจัดลำดับความสำคัญอัตโนมัติ

**ทำไมถึงเป็น Senior Project ที่น่าสนใจ:**

- ไม่ใช่แค่ train model แล้วจบ — มี **end-to-end pipeline** ตั้งแต่ import Excel → clean → train → predict → dashboard
- มี **data leakage prevention** (point-in-time) ซึ่งเป็นหัวใจของ ML ใน production
- มี **model registry + promotion gate** — โมเดลใหม่ต้องชนะโมเดลเก่าก่อนขึ้น production

---

## 3. โปรเจกต์คืออะไร

### ระบบตอบ 4 คำถามต่อลูกค้า 1 คน

| คำถามธุรกิจ | ค่าที่แสดง | วิธีตอบ |
|---|---|---|
| ลูกค้าอยู่สถานะอะไร? | lifecycle_stage | กฎ (rule-based) ไม่ใช่ ML |
| จะเลิกใช้ไหม? | churn_probability (%) | โมเดล ML classifier |
| มูลค่า 6 เดือนข้างหน้า? | predicted_clv_6m (บาท) | โมเดล ML regression |
| ต้องเติมเครดิตเมื่อไหร่? | predicted_credit_usage + วันจนเติม | โมเดล quantile + survival |

### โมเดลคืออะไร (ภาษาคน)

**โมเดล = โปรแกรมที่ "จำรูปแบบจากอดีต" แล้วเอามาเดาในอนาคต**

เปรียบเทียบ:

> คุณเคยเห็นลูกค้าหลายพันคนในอดีต — บางคนหายไป บางคนยังจ่าย บางคนใช้เครดิตเยอะ
> โมเดลคือการให้คอมพิวเตอร์ "อ่านประวัติเหล่านั้น" แล้วเรียนรู้ว่า **คนที่มีพฤติกรรมแบบนี้ มักจะเกิดอะไรต่อ**

มันไม่ใช่กฎที่เราเขียนเองทีละข้อ แต่เป็นการให้เครื่องหาความสัมพันธ์เองจากข้อมูลจริง

---

## 4. ภาพรวมระบบและ Tech Stack

### Architecture

```
Browser (Next.js :3000)
    ↓ /api/* proxy
Elysia API (:3001) — Auth, REST, Excel import, orchestration
    ├── PostgreSQL — ข้อมูลทั้งหมด (raw, clean, ML outputs)
    ├── Redis — progress streaming ตอน import
    └── FastAPI (:8000) — INTERNAL ONLY
            └── spawn Python: train / predict
                    └── เขียนผลกลับ PostgreSQL
```

### Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | Next.js 16 + React + Tailwind + Recharts |
| API | Elysia.js (Bun) + Better Auth (Google OAuth) |
| ML | Python — LightGBM, XGBoost, SHAP, lifetimes (BG-NBD) |
| Database | PostgreSQL 15 |
| Queue | Redis (progress events) |

### Flow ข้อมูลทั้งระบบ

```
Excel ข้อมูลลูกค้า
  → แปลงเป็นตาราง + สรุปพฤติกรรม (27–31 ตัวเลข)
  → แยกว่าใคร active / หายไปแล้ว (Lifecycle)
  → โมเดล 3 ตัวทำนาย (churn / มูลค่า / เครดิต)
  → คำนวณต่อเป็นคะแนนธุรกิจ (เงินเสี่ยงหลุด, segment, priority)
  → แสดง Dashboard ให้ทีมขายตัดสินใจ
```

---

## 5. ข้อมูลเข้า — Excel 8 Sheet

### Sheet ที่ต้องมี (ตายตัว)

| Sheet | กลายเป็นตาราง | ข้อมูลสำคัญ |
|---|---|---|
| `Users+User_profile` | customers | acc_id, join_date, status, credit, expire |
| `Backend_payment` | payments | acc_id, payment_date, amount, credit_add |
| SMS usage (BC/API/OTP) × 3 | usage (channel=sms) | year, month, acc_id, usage |
| Email usage (BC/API/OTP) × 3 | usage (channel=email) | year, month, acc_id, usage |

### Flow การ Import

1. User อัปโหลด `.xlsx` ผ่านหน้า `/runs`
2. ระบบ validate 8 sheet + header
3. Insert raw tables (เก็บ Excel ต้นฉบับ)
4. Clean → 3 ตาราง: `customers`, `payments`, `usage`
5. หลัง import predict data สำเร็จ → **auto prediction run** ทันที

### หลักการสำคัญ — Cutoff Date

> ทุกอย่างคำนวณ ณ วันที่เรียกว่า **cutoff** — เส้นแบ่ง "ปัจจุบันจำลอง"

- **Feature** (ตัวเลขที่ป้อนโมเดล) ใช้ได้เฉพาะข้อมูล **ก่อน cutoff**
- **Label** (คำตอบตอนเทรน) ดูข้อมูล **หลัง cutoff**
- Cutoff ต้องเป็นวันที่ **1 ของเดือน** เสมอ เพราะ usage เก็บรายเดือน

**ทำไมต้องแยก train / predict tables:**

> ป้องกัน data leakage — ข้อมูลเทรนต้องมี "อนาคต" เพื่อสร้าง label ส่วนข้อมูล predict เป็น snapshot ล่าสุดไม่มีอนาคต

---

## 6. โมเดลคืออะไร มาจากไหน

### ขั้นตอนการได้โมเดล

```
ขั้น 1: มีข้อมูล Excel (payment + usage + profile)
        ↓
ขั้น 2: สรุปพฤติกรรมแต่ละคน (27–31 ตัวเลข)
        ↓
ขั้น 3: สอนโมเดล (Training) — ย้อนเวลา ดูว่าคนที่มีพฤติกรรมแบบนี้ เกิดอะไรต่อ
        ↓
ขั้น 4: ได้โมเดลที่ "จำรูปแบบ" แล้วเก็บเป็นไฟล์ .pkl
        ↓
ขั้น 5: เอาโมเดลมาใช้ทำนาย (Prediction) — ข้อมูลใหม่ที่ไม่มีอนาคต
```

### ตอนเทรน vs ตอนทำนาย

| | ตอนเทรน | ตอนทำนาย |
|---|---|---|
| ข้อมูล | มีอนาคต (รู้ว่าเกิดอะไร) | ไม่มีอนาคต |
| ทำอะไร | สอนโมเดลว่า "พฤติกรรมแบบนี้ → ผลแบบนี้" | ใช้โมเดลที่สอนแล้วเดา |
| ตัวอย่าง churn | รู้แล้วว่าหาย/ไม่หาย → สอนโมเดล | ไม่รู้ → โมเดลเดา เช่น 71% |

### ทำไมมี 3 โมเดล ไม่ใช่ตัวเดียว

| โมเดล | ถามอะไร | ตอบอะไร |
|---|---|---|
| **Churn** | เขาจะหายไปไหม? | ความน่าจะเป็น % |
| **CLV** | เขามีมูลค่าเท่าไร? | เงินที่คาดว่าจะจ่าย 6 เดือน |
| **Credit** | เขาจะใช้เครดิตเท่าไร / เหลือนานแค่ไหน? | ใช้ 30/90 วัน + วันจนเติม |

1 โมเดลตอบทุกอย่างพร้อมกันไม่ได้ดีเท่าแยก 3 ตัว

### สรุปจำนวนโมเดล/อัลกอริทึมในระบบ

| มุมมอง | จำนวน |
|---|---|
| โมเดลที่ขึ้น production ต่อ run | 3 champion (churn / clv / credit) + lifecycle (กฎ) + BG/NBD (p_alive) + top-up AFT |
| Candidate ที่แข่งตอนเทรน (churn) | 3 ตัว: Logistic Regression, LightGBM, TabICL |
| ไลบรารีหลัก | LightGBM, XGBoost, scikit-learn, lifetimes, SHAP, Optuna |

---

## 7. Lifecycle — สถานะลูกค้า

**อันนี้ไม่ใช่โมเดล ML — เป็นกฎง่ายๆ**

| สถานะ | เงื่อนไข | ความหมาย |
|---|---|---|
| **Ghost** | ไม่มีประวัติจ่าย/ใช้เลย | มีแค่ใน profile |
| **Churned** | มีประวัติ แต่เงียบ >180 วัน | เลิกไปแล้ว |
| **Active Paid** | active ใน 180 วัน + เคยจ่าย | ลูกค้าจริง |
| **Active Free** | active แต่ไม่เคยจ่าย | ทดลอง/ฟรี |

**ใครได้ทำนายอะไร:**

| โมเดล | Eligible |
|---|---|
| Churn | เฉพาะ **Active Paid** |
| CLV | Active Paid + Active Free |
| Credit | Active Paid + Active Free |

Ghost/Churned ยังได้ output row แต่ค่า ML เป็น null พร้อมเหตุผล

---

## 8. การคำนวณทีละขั้น — ตัวอย่างลูกค้า 1 คน

> ใช้ส่วนนี้เป็นหัวใจตอนนำเสนอ — ไล่ทีละขั้นให้อาจารย์เห็นว่า "เอาอะไรมาคำนวณ ได้อะไรออกมา"

### ลูกค้าตัวอย่าง: คุณสมชาย (acc_id = 12345)

**Cutoff = 1 เมษายน 2025**

**ข้อมูลดิบจาก Excel (ก่อน cutoff เท่านั้น):**

| ข้อมูล | ค่า |
|---|---|
| สมัคร | 1 ม.ค. 2024 |
| จ่ายเงิน | 3 ครั้ง — 5,000 / 10,000 / 8,000 บาท (ครั้งล่าสุด 1 ก.พ. 2025) |
| ส่ง SMS | 90 วันล่าสุด = 15,000 เครดิต, 90 วันก่อนหน้า = 25,000 เครดิต |
| เครดิตคงเหลือ (ใน profile) | 12,000 |

---

### ขั้นที่ 0 — สรุปพฤติกรรม (ก่อนเข้าโมเดล)

จากตาราง payment + usage ระบบคำนวณ:

```
อายุลูกค้า        = cutoff − วันสมัคร
                  = 1 เม.ย. 2025 − 1 ม.ค. 2024 = 455 วัน

ไม่จ่ายมาแล้ว     = cutoff − วันจ่ายล่าสุด
                  = 1 เม.ย. 2025 − 1 ก.พ. 2025 = 59 วัน

จ่ายทั้งหมด       = 5,000 + 10,000 + 8,000 = 23,000 บาท
จำนวนครั้งที่จ่าย  = 3 ครั้ง

ใช้งาน 90 วันล่าสุด  = 15,000
ใช้งาน 90 วันก่อนหน้า = 25,000
การใช้งานลดลง      = (15,000 − 25,000) / 25,000 = −40%

ไม่มีกิจกรรมล่าสุด   = 59 วัน
```

ตัวเลขพวกนี้คือ **input ของโมเดล** — ยังไม่ใช่ผลทำนาย (รวม 27 ตัวสำหรับ churn/CLV, 31 ตัวสำหรับ credit)

---

### ขั้นที่ 1 — Lifecycle

```
มีประวัติจ่าย/ใช้?      → ใช่
180 วันล่าสุดยัง active? → ใช่
เคยจ่ายเงิน?            → ใช่

→ lifecycle = "Active Paid"
→ เข้าโมเดล Churn, CLV, Credit ได้ทั้ง 3 ตัว
```

---

### ขั้นที่ 2 — Churn 71%

```
ป้อนเข้าโมเดล: 27 ตัวเลขพฤติกรรม (ไม่จ่าย 59 วัน, ใช้ลด 40%, จ่าย 3 ครั้ง ฯลฯ)
        ↓
โมเดล LightGBM (ที่เทรนไว้) → คะแนนดิบ = 0.65
        ↓
Calibrator ปรับให้ตรงความเป็นจริง → 0.71
        ↓
churn_probability = 71%
        ↓
เทียบ threshold (จากตอนเทรน): 71% ≥ 50% → churn_risk_level = "high"
        ↓
SHAP บอกเหตุผล: ไม่มีกิจกรรม 59 วัน, ใช้งานลด 40%, จ่ายช้ากว่าปกติ
```

**71% หมายความว่า:** จากคนในอดีตที่มีพฤติกรรมคล้ายกัน ประมาณ 71% หายไปภายใน 180 วัน

---

### ขั้นที่ 3 — CLV 50,000 บาท + p_alive 72%

**predicted_clv_6m (เงิน):**

```
โมเดลถาม "จะจ่ายต่อไหม?"     → P(จ่าย) = 0.85
โมเดลถาม "ถ้าจ่าย จ่ายเท่าไร?" → E[รายได้|จ่าย] = 55,000 บาท
        ↓
raw = 0.85 × 55,000 = 46,750
        ↓
ปรับ calibration → predicted_clv_6m ≈ 50,000 บาท
```

**p_alive (ยัง active ไหม) — สูตร BG/NBD แยกต่างหาก:**

```
frequency = จำนวนวันที่จ่ายไม่ซ้ำ − 1 = 2
recency   = วันจ่ายล่าสุด − วันจ่ายแรก = 365 วัน
T         = cutoff − วันจ่ายแรก = 455 วัน
        ↓
สูตร BG/NBD → p_alive = 72%
```

---

### ขั้นที่ 4 — Credit

```
โมเดล quantile ทำนาย:
  ใช้ 30 วัน (median) = 4,800 เครดิต
  ใช้ 90 วัน (median) = 13,500 เครดิต

วันจนเติมเครดิต:
  โมเดล AFT → 75 วัน (หรือ heuristic: 12,000 ÷ (4,800/30) = 75 วัน)
  → credit_urgency_level = "stable" (เพราะ > 90 วัน)
```

---

### ขั้นที่ 5 — ตัวเลขธุรกิจ (คำนวณต่อจากโมเดล)

```
revenue_at_risk = churn_probability × predicted_clv_6m
                = 0.71 × 50,000 = 35,500 บาท

customer_value_tier = เปรียบ CLV กับลูกค้าทั้ง run → "mid" (top 15%)

segment = valuable (mid) + at_risk (churn high) → "Mid-Value At-Risk"

priority_score = จัดอันดับจาก revenue_at_risk → 78/100

needs_review = churn high → true (ต้องให้คนดู)
```

---

### ภาพรวม 1 หน้า

```
Excel (payment + usage + profile)
        │
        ▼
┌─────────────────────────────────┐
│ สรุปพฤติกรรม (27–31 ตัวเลข)      │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Lifecycle: Active Paid          │
└─────────────────────────────────┘
        │
   ┌────┴────┬────────────┐
   ▼         ▼            ▼
 Churn     CLV         Credit
 71%      50,000฿     4,800/30d
 high     p_alive=72%  75 วันจนเติม
   │         │            │
   └────┬────┴────────────┘
        ▼
┌─────────────────────────────────┐
│ revenue_at_risk = 35,500 บาท    │
│ segment = Mid-Value At-Risk     │
│ priority = 78/100               │
└─────────────────────────────────┘
        │
        ▼
   แสดงบนหน้าจอ
```

---

## 9. โมเดล 3 ตัว — อธิบายละเอียด

### โมเดลที่ 1: Churn

**นิยาม churn ในธุรกิจนี้:**

> ลูกค้า Active Paid ณ cutoff แล้ว **เงียบสนิท 180 วันข้างหน้า** — ไม่จ่ายเงิน **และ** ไม่ส่งข้อความเลย

**Label ตอนเทรน (คำตอบที่สอนโมเดล):**

```
ถ้า 180 วันหลัง cutoff ไม่จ่าย + ไม่ส่งเลย → churn_label = 1 (หาย)
ถ้ายังมีกิจกรรม → churn_label = 0 (ยังอยู่)
```

**Candidate ที่แข่งตอนเทรน:**

1. Logistic Regression — เชิงเส้น อธิบายได้
2. LightGBM — gradient boosting แม่น + SHAP อธิบายได้
3. TabICL — foundation model แม่น แต่อธิบายรายคนไม่ได้

เลือกตัวชนะด้วย 5-fold CV **PR-AUC** สูงสุด

**สูตรตอนทำนาย:**

```
raw_score = model.predict_proba(x)[:, 1]
churn_probability = clip(calibrator.transform(raw_score), 0, 1)
```

**ข้อยกเว้น:** ลูกค้าใหม่ < 90 วัน → abstain ไม่ให้คะแนน churn (feature ยังไม่พอ)

---

### โมเดลที่ 2: CLV

**ทำนาย:** รายได้ที่คาดว่าลูกค้าจะจ่ายใน 6 เดือนข้างหน้า (บาท)

**Label ตอนเทรน:**

```
future_revenue_6m = ผลรวม payment.amount ในช่วง [cutoff, cutoff+180 วัน]
```

**สูตร Two-part model:**

```
predicted_clv = magnitude_slope × P(รายได้>0) × E[รายได้|จ่าย] + magnitude_intercept
```

- P(รายได้>0): LightGBM classifier
- E[รายได้|จ่าย]: LightGBM quantile regression
- magnitude calibration: OLS บน validation

**p_alive — แยกจาก CLV, ใช้ BG/NBD เสมอ:**

```
p_alive = BG/NBD.conditional_probability_alive(frequency, recency, T)
```

**ทำไมต้องมีทั้ง CLV และ p_alive:**

- CLV บอก **เงิน**
- p_alive บอก **ยังมีชีวิตไหม**
- มีลูกค้า CLV สูง แต่ p_alive ต่ำ = ลูกค้าใหญ่ที่กำลังจะหาย → อันตราย

---

### โมเดลที่ 3: Credit

**ทำนาย:**

- ใช้เครดิต 30 วัน / 90 วันข้างหน้า
- วันจนต้องเติมเครดิต

**Label ตอนเทรน:**

```
future_credit_usage_30d = ผลรวม usage ในช่วง [cutoff, cutoff+30 วัน]
future_credit_usage_90d = ผลรวม usage ในช่วง [cutoff, cutoff+90 วัน]
```

**โมเดล:** LightGBM Quantile Regression

- 5 quantile (p10–p90) × 2 horizon = 10 โมเดลย่อย
- ค่าที่แสดงหลัก = **p50 (median)**

**วันจนเติม:**

- หลัก: XGBoost AFT survival model
- สำรอง: `เครดิตคงเหลือ ÷ (predicted_usage_30d / 30)`

**Feature เพิ่ม 4 ตัว (เฉพาะ credit):** credit_added_180d, credit_balance_proxy, credit_runway_months, credit_usage_decel

---

## 10. ตัวเลขธุรกิจที่คำนวณต่อจากโมเดล

| ค่าที่เห็น | สูตร | ความหมาย |
|---|---|---|
| **revenue_at_risk** | churn_probability × predicted_clv_6m | เงินที่เสี่ยงหลุดต่อคน |
| **customer_value_tier** | percentile ของ CLV ใน run (top 10%=high, 50%=mid) | มูลค่าลูกค้า |
| **usage_trend** | จาก usage ลด/เพิ่ม >10% | increasing / declining / stable |
| **segment** | value × health × lifecycle | กลุ่มลูกค้า เช่น High-Value At-Risk |
| **priority_score** | min-max ของ log(revenue_at_risk) → 0–100 | คะแนนจัดลำดับ |
| **needs_review** | churn high/critical OR (valuable + p_alive ต่ำ + usage ลด) | ต้องให้คนดู |

**Segment สำคัญสุด:**

> **High-Value At-Risk** = ลูกค้ามูลค่าสูง + ความเสี่ยง churn สูง → รายชื่อที่ทีมขายต้องโทรก่อน

**ตัวเลขระดับ Dashboard:**

```
expected_at_risk = Σ revenue_at_risk ของ Active Paid ทั้งหมดใน run
```

---

## 11. Training Pipeline

### 5 Quality Gates ก่อนเทรน

| Gate | ตรวจอะไร |
|---|---|
| 1 Source readiness | ข้อมูลพร้อมไหม |
| 2 Schema quality | วันที่ parse ได้, ไม่มี duplicate |
| 3 Cutoff feasibility | มีประวัติพอ + มีอนาคตพอสร้าง label |
| 4 Label viability | churn eligible ≥500, positive ≥100 |
| 5 Feature leakage | ไม่มีข้อมูลอนาคตรั่วเข้า feature |

### แบ่งข้อมูล

- 60/20/20 train/val/test, stratified ต่อ acc_id
- Multi-cutoff pooling: เอาข้อมูล cutoff เก่ามาเสริม train เพิ่มคุณภาพ

### Promotion Gate (โมเดลใหม่ขึ้น production)

- Stage 1 Safety: ชนะ baseline ทุก split + ชนะ champion เก่า ≥1% + ผ่าน leakage suite
- Stage 2 Quality: composite score สูงสุด
- ไม่ผ่าน → champion เก่ายังอยู่

### Metrics ที่วัด

| โมเดล | Metric หลัก |
|---|---|
| Churn | PR-AUC, F1, ECE (calibration), lift@top-k |
| CLV | Spearman (ranking), MAE, top-decile capture |
| Credit | Pinball loss, coverage p10–p90 |

### Realized Outcome Loop

> หลัง horizon ผ่านไป ระบบวัดว่าทำนายถูกแค่ไหนกับความจริง — ใช้ label builder เดียวกับตอนเทรน

---

## 12. ลำดับ Demo สด

1. **`/` Dashboard** — ภาพรวม run ล่าสุด: lifecycle mix, risk buckets, expected_at_risk
2. **`/customers`** — ตารางลูกค้า sort ตาม priority_score
3. **คลิกลูกค้า 1 คน** (`/customers/:acc_id`) — Customer 360:
   - churn % + risk level + SHAP factors
   - usage chart + payment history
   - CLV + p_alive + value tier
4. **`/model-performance`** — champion model, metrics vs baseline, calibration curve
5. **`/runs`** — แสดงว่า import Excel → auto run ได้จริง

---

## 13. คำถามที่อาจารย์มักถาม

**Q: โมเดลคืออะไร?**

> โปรแกรมที่เรียนรู้จากลูกค้าในอดีต ว่าพฤติกรรมแบบไหน มักตามด้วยอะไร แล้วเอามาเดาลูกค้าใหม่

**Q: ทำไมต้องเทรน?**

> เพราะแต่ละบริษัท ลูกค้าไม่เหมือนกัน ต้องสอนจากข้อมูลจริงของ 1Moby ไม่ใช่ใช้สูตรสำเร็จรูป

**Q: churn 71% มาจากไหน?**

> สรุปพฤติกรรม 27 ตัว → ป้อนโมเดล → ได้คะแนนดิบ → calibrator ปรับ → 71% จากคนในอดีตที่คล้ายกัน 71% หายไป

**Q: CLV 50,000 มาจากไหน?**

> P(จ่าย) × E[จ่ายเท่าไร] × calibration = ประมาณ 50,000 บาทใน 6 เดือน

**Q: ทำไมไม่ใช้ accuracy?**

> Churn เป็น imbalanced (คนส่วนใหญ่ไม่ churn) — accuracy สูงได้แม้ทำนายว่าทุกคนไม่ churn PR-AUC เหมาะกว่า

**Q: Feature 27 ตัวมาจากไหน?**

> คำนวณจาก payment + usage ก่อน cutoff — ไม่ได้ดึงจาก Excel ตรงๆ แต่ derive เช่น ไม่จ่ายกี่วัน, ใช้งานลดกี่%

**Q: ทำไม cutoff ต้องวันที่ 1?**

> Usage เก็บรายเดือน ถ้า cutoff กลางเดือน จะเห็น usage ทั้งเดือนที่ยังไม่เกิดขึ้น → data leakage

**Q: มีกี่โมเดลจริงๆ?**

> 3 champion (churn/clv/credit) + lifecycle (กฎ) + BG/NBD (p_alive) + top-up AFT

**Q: ถ้าโมเดลใหม่แย่กว่าเก่า?**

> Promotion gate ไม่ promote — champion เก่ายังอยู่

**Q: ทำไมไม่ใช้ Excel คำนวณเอง?**

> ความสัมพันธ์ซับซ้อน เช่น "จ่ายช้า + ใช้ลด + ใช้แค่ช่องทางเดียว" รวมกันแล้วเสี่ยงสูง โมเดลดูหลายสัญญาณพร้อมกันได้

**Q: Limitation อะไรบ้าง?**

> - ข้อมูล monthly ไม่ใช่ real-time
> - ลูกค้าใหม่ <90 วัน ไม่ได้คะแนน churn
> - TabICL ชนะแล้วอธิบาย factor ไม่ได้
> - ยัง deploy local Docker ยังไม่ production

---

## 14. Cheat Sheet — จำก่อนเข้าห้อง

### 3 บรรทัดสำคัญ

1. **โมเดล = เรียนรู้จากอดีต → เดาอนาคต** ไม่ใช่กฎที่เราเขียนเอง
2. **มี 3 โมเดล** เพราะถาม 3 คำถาม: หายไหม / มีมูลค่าเท่าไร / ใช้เครดิตเท่าไร
3. **ตัวเลขบนจอ** = ผลจากโมเดล + การจัดกลุ่มให้ทีมขายใช้งาน

### ตารางสรุปการคำนวณ

| ค่าที่เห็น | เอาอะไรมาคำนวณ | ได้ยังไง |
|---|---|---|
| churn 71% | 27 ตัวเลขพฤติกรรม | โมเดล → calibrator → % |
| CLV 50,000 | 27 ตัวเลขพฤติกรรม | P(จ่าย) × E[จ่ายเท่าไร] × calibration |
| p_alive 72% | ประวัติการจ่าย (RFM) | สูตร BG/NBD |
| ใช้เครดิต 30d | 31 ตัวเลข (+เครดิต) | โมเดล quantile → median |
| เงินเสี่ยงหลุด | churn × CLV | คูณกันตรงๆ |
| segment | tier + churn + p_alive | กฎ if-else |
| priority | revenue_at_risk ทุกคน | จัดอันดับแล้วสเกล 0–100 |

### สคริปต์ปิดการนำเสนอ

> **"สรุปครับ/ค่ะ โปรเจกต์นี้สร้าง end-to-end analytics platform ที่:**
> 1. รับ Excel → clean → ทำนายอัตโนมัติ
> 2. มี 3 โมเดล ML (churn, CLV, credit) + lifecycle rules
> 3. ทุกค่าที่แสดงมีสูตรชัดเจนในโค้ด ไม่ใช่ค่าเสก
> 4. มี quality gate + promotion policy ป้องกันโมเดลแย่ขึ้น production
> 5. มี realized-outcome loop วัดความแม่นยำหลัง deploy จริง
>
> ขอบคุณครับ/ค่ะ พร้อมรับคำถาม"

---

*เอกสารนี้สร้างสำหรับการนำเสนอ Senior Project — อัปเดตตามโค้ดและ docs ใน repo ณ ก.ย. 2025*
