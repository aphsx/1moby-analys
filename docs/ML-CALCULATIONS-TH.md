# ML Calculations — คู่มือการคำนวณระบบทำนายโดยละเอียด

> เอกสารนี้อธิบายว่า **ทุกค่าที่ระบบแสดง** (churn %, lifecycle stage เช่น Ghost, factors,
> value tier, revenue at risk, ตลอดจน metric ความแม่นยำอย่าง F1 / PR-AUC / ECE ฯลฯ)
> **คำนวณมาจากอะไรจริงๆ ในโค้ด** — ไม่ใช่ค่าที่เสกขึ้นมา ทุกสูตร/ทุกเกณฑ์ในเอกสารนี้
> อ้างอิงไฟล์และฟังก์ชันในโค้ดจริง (ระบุ path ท้ายแต่ละหัวข้อ) ถ้าข้อความในเอกสารขัดกับโค้ด
> ให้ยึด **โค้ดเป็นหลัก** แล้วมาแก้เอกสาร (ตามหลักใน `claude.md`)

โค้ดหลักที่เอกสารนี้อ้างอิง:

| ส่วน | ไฟล์ |
|---|---|
| ค่าคงที่/threshold ทั้งหมด | `apps/ml/src/constants.py` |
| Label (คำตอบที่ใช้เทรน) | `apps/ml/src/training/labels.py` |
| Lifecycle + Feature | `apps/ml/src/training/features.py` |
| เทรน Churn | `apps/ml/src/training/churn_trainer.py` |
| เทรน CLV | `apps/ml/src/training/clv_trainer.py` |
| เทรน Credit | `apps/ml/src/training/credit_trainer.py` |
| Baseline | `apps/ml/src/training/baselines.py` |
| Metric ทุกตัว | `apps/ml/src/training/metrics.py` |
| Gate ตรวจข้อมูล | `apps/ml/src/training/validation.py` |
| แบ่งข้อมูล/temporal split | `apps/ml/src/training/datasets.py` |
| ตรวจ leakage | `apps/ml/src/training/leakage.py` |
| เกณฑ์ promote โมเดล | `apps/ml/src/training/promotion.py` |
| orchestrate การเทรน | `apps/ml/src/training/runner.py` |
| **การทำนายจริง + derived fields** | `apps/ml/src/prediction/runner.py` |
| realized-outcome (วัดผลจริงย้อนหลัง) | `apps/ml/src/outcomes/` |

---

## สารบัญ

0. [สรุปโมเดล/อัลกอริทึมทั้งหมด (Inventory) — ใช้อะไรทำนาย เทรนด้วยอะไรบ้าง กี่ตัว](#0-สรุปโมเดลอัลกอริทึมทั้งหมด-inventory)
1. [หลักการเวลา (Point-in-time), cutoff และหน้าต่างเวลา](#1-หลักการเวลา)
2. [Lifecycle Segmentation — Ghost / Churned / Active Paid / Active Free](#2-lifecycle-segmentation)
3. [Model Eligibility — ใครได้ทำนายอะไร + การงดประเมิน churn (abstain)](#3-model-eligibility)
3A. [Feature ทั้งหมด (Tier A) ที่ป้อนเข้าโมเดล](#3a-feature-ทั้งหมด-tier-a-ที่ป้อนเข้าโมเดล)
4. [Churn — % ความเสี่ยงเลิกใช้ มาจากอะไร](#4-churn)
5. [CLV — มูลค่าลูกค้า 6 เดือน และ p_alive](#5-clv)
6. [Credit Forecast — ทำนายการใช้เครดิต 30/90 วัน และวันจนต้องเติม](#6-credit-forecast)
7. [Derived Business Fields — revenue at risk, value tier, segment, score](#7-derived-business-fields)
8. [Training Pipeline — Gate, การแบ่งข้อมูล, baseline, การกันข้อมูลรั่ว](#8-training-pipeline)
9. [Metrics — F1 / PR-AUC / ECE / Spearman / coverage คำนวณอย่างไร](#9-metrics)
   - [9.0 มาตรฐานการวัด (Industry standard)](#90-มาตรฐานการวัด-industry-standard)
10. [Promotion Gate — โมเดลใหม่จะขึ้น production ได้ต้องผ่านอะไรบ้าง](#10-promotion-gate)
11. [ภาคผนวก: ตารางค่าคงที่ทั้งหมด](#11-ภาคผนวก-ตารางค่าคงที่)
12. [Design contract & policy (หลักการ/นโยบาย/เหตุผล)](#12-design-contract--policy-สัญญาการออกแบบ--นโยบาย)
13. [Output contract (สัญญา field ของ ml_prediction_outputs)](#13-output-contract-สัญญา-field-ของ-ml_prediction_outputs)

---

## 0. สรุปโมเดล/อัลกอริทึมทั้งหมด (Inventory)

> ตอบตรงๆ: "เราใช้อะไรทำนาย และเทรนด้วยโมเดล/อัลกอริทึมอะไรบ้าง กี่ตัว"

### 0.1 ระบบทำนายมี 5 ส่วน (ต่อ 1 prediction run)

| # | ส่วน | ทำนายอะไร | วิธี/อัลกอริทึม |
|---|---|---|---|
| 1 | **Lifecycle** | Ghost/Churned/Active Paid/Active Free | **กฎ (rule-based) ไม่ใช่ ML** |
| 2 | **Churn** | `churn_probability`, risk level, factors | ML champion 1 ตัว + calibrator + SHAP |
| 3 | **CLV** | `predicted_clv_6m` | ML/สถิติ champion 1 ตัว + OLS calibration |
| 3b | **p_alive** | โอกาสยัง active | **BG/NBD เสมอ** (ไม่ว่า CLV champion เป็นตัวไหน) |
| 4 | **Credit usage** | ใช้เครดิต 30/90 วัน (p10–p90) | LightGBM quantile regression |
| 5 | **Top-up timing** | วันจนต้องเติมเครดิต | XGBoost AFT (survival) |

### 0.2 อัลกอริทึมที่ "แข่งกันตอนเทรน" (candidate) แล้วคัดตัวชนะ

**Churn — 3 ตัว default** (`DEFAULT_CANDIDATES`, `churn_trainer.py`) เลือกด้วย **5-fold CV PR-AUC**:
1. `logistic_regression` — `sklearn.LogisticRegression`
2. `lightgbm` — `lightgbm.LGBMClassifier`
3. `tabicl` — TabICL v2 (tabular foundation model, ต้องมี torch)
   *(มี `RandomForestClassifier` เป็นตัวเลือกเสริมได้ผ่าน env `CHURN_CANDIDATES`)*

**CLV — two-part revenue forecast** (`clv_trainer.py`) + **BG/NBD สำหรับ p_alive เท่านั้น**:
1. `twopart` — `P(รายได้>0) × E[รายได้|จ่าย]` (LightGBM classifier + quantile value model) — **champion รายได้**
2. `bgnbd_gamma_gamma` — fit ตอนเทรนทุกครั้งเพื่อ `p_alive` และ health cuts (ไม่ใช่ revenue champion)

**Credit usage** (`credit_trainer.py`) — **LightGBM quantile regression** (default):
`LGBMRegressor(objective="quantile")` **5 quantile (p10/p25/p50/p75/p90) × 2 horizon (30/90 วัน) = 10 โมเดลย่อย**
*(XGBoost quantile `reg:quantileerror` แข่ง LGBM ต่อ horizon โดย default; ปิดด้วย `ENABLE_XGB_CREDIT=0`)*

**Top-up timing** — `xgboost` AFT (`objective="survival:aft"`) 1 โมเดล

### 0.3 องค์ประกอบเสริม (ไม่ใช่ตัวทำนายหลัก แต่เป็น "โมเดล/อัลกอริทึม" ที่ใช้จริง)

- **Calibration ของ churn:** `LogisticRegression` (Platt) **หรือ** `IsotonicRegression` — เลือก 1
- **Magnitude calibration ของ CLV:** `LinearRegression` (OLS)
- **คำอธิบาย factor:** SHAP `TreeExplainer` (tree) / coef เชิงเส้น (linear)
- **จูน hyperparameter:** Optuna (ใช้กับ lgbm/xgb/hurdle/credit/top-up)
- **CQR:** conformal calibration ขยายช่วง p10/p90 ให้ coverage ~80%

### 0.4 Baseline (ตัวเทียบขั้นต่ำที่ candidate ต้องชนะก่อน promote) — รวม 7 ตัว

- churn (3): `recency_rule_90d`, `rfm_quartile`, `logistic_regression`
- clv (2): `segment_mean`, `revenue_180d_carryover`
- credit (3): `last_30d_carryover`, `moving_avg_90d`, `runway_depletion`

### 0.5 นับรวม "กี่ตัว"

| มุมมอง | จำนวน |
|---|---|
| **ตระกูลอัลกอริทึม ML/สถิติที่ระบบใช้** | **~10**: LightGBM, XGBoost, Logistic Regression, Isotonic Regression, Linear Regression (OLS), Random Forest (opt), BG/NBD, Gamma-Gamma, TabICL, XGBoost-AFT |
| **candidate ที่แข่งตอนเทรน (default)** | churn 3 + clv 1 (twopart) + credit LGBM↔XGB/horizon + top-up 1 |
| **โมเดลที่ "ขึ้น production" ต่อ run** | 3 champion (churn/clv/credit) + lifecycle(กฎ) + BG/NBD(p_alive) + top-up AFT |
| **baseline** | 8 |
| **ไลบรารีหลัก** | `lightgbm`, `xgboost`, `scikit-learn`, `lifetimes`, `tabicl`(+`torch`), `optuna`, `shap` |

> รายละเอียดสูตร/เกณฑ์คัดตัวชนะของแต่ละตัวอยู่ในหัวข้อ [4](#4-churn) (churn), [5](#5-clv) (CLV), [6](#6-credit-forecast) (credit) และเกณฑ์ promote ในหัวข้อ [10](#10-promotion-gate)

---

## 1. หลักการเวลา

ทุกอย่างคำนวณ ณ วันที่เรียกว่า **cutoff** (`cutoff_date`) — เส้นแบ่งเวลา "ปัจจุบันจำลอง":

- **Feature (ตัวแปรต้นทาง)** ใช้ได้เฉพาะข้อมูล **ก่อน cutoff** เท่านั้น (`payment_date < cutoff`, usage `period < cutoff`) เพื่อไม่ให้เห็นอนาคต (point-in-time / กัน data leakage)
  → `_payment_history()` / `_usage_history()` ใน `features.py`
- **Label (คำตอบตอนเทรน)** คือสิ่งที่เกิด **หลัง cutoff** ภายในกรอบเวลา `horizon_days`
- cutoff ต้องเป็น **วันที่ 1 ของเดือน** เท่านั้น ไม่งั้น run ล้มเลย เพราะ usage เก็บเป็นรายเดือน — cutoff กลางเดือนจะทำให้ label 30 วันของ credit คร่อมเดือนไม่ครบ
  → `runner.py` `month_start()` check

ค่าหน้าต่างเวลามาตรฐาน (`LabelConfig` ใน `labels.py`):

| พารามิเตอร์ | ค่า default | ความหมาย |
|---|---|---|
| `horizon_days` | **180 วัน** (≈6 เดือน) | ช่วงอนาคตที่ใช้สร้าง label churn/CLV |
| `active_window_days` | **180 วัน** | ช่วงย้อนหลังที่ใช้นิยาม "ยัง active อยู่" |
| credit horizon | **30 และ 90 วัน** | ช่วงอนาคตของ label การใช้เครดิต (`CREDIT_HORIZONS`) |

---

## 2. Lifecycle Segmentation

**สำคัญ: Lifecycle ไม่ใช่โมเดล ML — เป็นกฎ (rule-based) ล้วนๆ** คำนวณจากกิจกรรมก่อน cutoff
มันคือ "สถานะลูกค้า" ที่ตัดสินว่าลูกค้าคนนั้นจะได้ทำนายโมเดลตัวไหนบ้าง
→ ฟังก์ชัน `build_lifecycle_outputs()` และ `_lifecycle_stage()` ใน `features.py`

### 2.1 ธงพื้นฐาน 3 ตัว (คำนวณต่อ acc_id)

| ธง | นิยามในโค้ด |
|---|---|
| `has_activity_history` | มีกิจกรรม **ใดๆ ก่อน cutoff** อย่างน้อย 1 ครั้ง = มีการจ่ายเงิน **หรือ** มี usage ที่ `usage > 0` |
| `active_in_window` | มีกิจกรรมในช่วง **`[cutoff − 180 วัน, cutoff)`** อย่างน้อย 1 ครั้ง |
| `ever_paid` | เคยมีการจ่ายเงิน (payment) ก่อน cutoff อย่างน้อย 1 ครั้ง |

"กิจกรรม (activity)" = payment ทุกแถว + usage ที่ `usage > 0` เท่านั้น (usage = 0 ไม่นับเป็นกิจกรรม)
→ `features.py` บรรทัด ~847–866

### 2.2 กฎการจัดสถานะ (ตัดสินตามลำดับ เจอเงื่อนไขแรกที่จริงก่อน)

```
def _lifecycle_stage(row):
    if not has_activity_history:  return "Ghost"      # ไม่มีประวัติเลย
    if not active_in_window:      return "Churned"    # มีประวัติ แต่เงียบไป >180 วัน
    if ever_paid:                 return "Active Paid" # ยัง active + เคยจ่ายเงิน
    return "Active Free"                               # ยัง active แต่ไม่เคยจ่าย
```

| Lifecycle Stage | เงื่อนไข (ต้องจริงทั้งหมด) | ความหมายเชิงธุรกิจ |
|---|---|---|
| **Ghost** | `has_activity_history = False` | มีแค่ในไฟล์ profile แต่ไม่เคยมีกิจกรรม (จ่าย/ส่ง) เลย |
| **Churned** | `has_activity_history = True` **และ** `active_in_window = False` | เคยใช้งาน แต่เงียบไปเกิน 180 วัน = เลิกไปแล้ว |
| **Active Paid** | `active_in_window = True` **และ** `ever_paid = True` | ยังใช้งานใน 180 วัน + เคยจ่ายเงิน (ลูกค้าจริง) |
| **Active Free** | `active_in_window = True` **และ** `ever_paid = False` | ยังใช้งาน แต่ไม่เคยจ่าย (ฟรี/ทดลอง) |

> **ตัวอย่าง "ทำไมคนนี้ถึงเป็น Ghost":** เพราะไม่มี payment เลย และไม่มี usage แถวไหนที่ `usage > 0`
> ก่อน cutoff → `has_activity_history = False` → เข้าเงื่อนไขแรกทันที
> **"ทำไมเป็น Churned":** มีประวัติจ่าย/ใช้ก่อน cutoff แต่ 180 วันล่าสุดก่อน cutoff ไม่มีกิจกรรมเลย

### 2.3 Sub-stage (แยกละเอียด)
→ `_lifecycle_sub_stage()` ใน `features.py`

- `Ghost` → **Ghost**
- `Churned` + `ever_paid=True` → **Churned Paid** (เคยเป็นลูกค้าจ่ายเงินแล้วหาย — สำคัญสุดในการดึงกลับ)
- `Churned` + `ever_paid=False` → **Churned Free**
- `Active Free` → **Active Free**, `Active Paid` → **Active Paid**

---

## 3. Model Eligibility

ตอนทำนายจริง ระบบ **override** ธง eligibility ให้ชัดตาม lifecycle (OUTPUT-CONTRACT §2)
→ `prediction/runner.py` บรรทัด ~287–292

| โมเดล | ทำนายให้ใคร (`el_*`) |
|---|---|
| **Churn** (`el_churn`) | เฉพาะ **Active Paid** เท่านั้น |
| **CLV** (`el_clv`) | **Active Paid + Active Free** (ทั้งกลุ่ม ACTIVE) |
| **Credit** (`el_credit`) | **Active Paid + Active Free** |

เหตุผล: churn นิยามบน "ลูกค้าที่จ่ายเงินแล้วหยุด" เท่านั้น — คนที่ไม่เคยจ่าย (Active Free)
หรือหายไปแล้ว (Churned) หรือไม่มีประวัติ (Ghost) จึง **ไม่เข้านิยาม churn**
ข้อความเหตุผลที่แสดงต่อผู้ใช้อยู่ใน `_eligibility_json()` (`runner.py` ~1063–1110)

### 3.1 การงดประเมิน churn (Abstention) — ลูกค้าใหม่เกินไป
→ ค่าคงที่ `CHURN_ABSTAIN_MIN_TENURE_DAYS = 90` (`constants.py`); ใช้ใน `runner.py` `_apply_derived()` ~766–785

แม้เป็น Active Paid แต่ถ้า **อายุลูกค้า (`customer_age_days`) < 90 วัน** ระบบจะ **งด** ให้คะแนน churn:

```
abstain = el_churn AND (customer_age_days < 90)
→ churn_probability = null, churn_risk_level = null, churn_factors = null
→ output status = "insufficient_data"
```

- `customer_age_days = (cutoff − join_date).days` (`features.py` `build_profile_features()`)
- เหตุผล: feature ของ churn หลายตัว (usage 90 วันล่าสุด, ความชัน 6 เดือน) จะถูกเติมศูนย์เพราะยังไม่มีประวัติพอ ทำให้คะแนนออกมาจาก "ค่า default" ไม่ใช่พฤติกรรมจริง → ยอมงดดีกว่าเดาให้เซลส์

---

## 3A. Feature ทั้งหมด (Tier A) ที่ป้อนเข้าโมเดล

โมเดล churn/CLV/credit ทั้งหมดใช้ feature ชุด "Tier A" เดียวกัน (คำนวณ ณ cutoff จากข้อมูลก่อน cutoff เท่านั้น)
โดย **churn และ CLV ใช้ 27 ตัวแรก (`BASE_TIER_A_FEATURES`)**, **credit ใช้ทั้ง 31 ตัว (`CREDIT_TIER_A_FEATURES`)**
สูตรทุกตัวมาจาก `FEATURE_METADATA` ใน `features.py` — ชื่อ feature เหล่านี้คือสิ่งที่โผล่ใน `churn_factors` (SHAP) ด้วย

### พฤติกรรมการจ่ายเงิน (payment)

| feature | สูตร | หน้าต่าง |
|---|---|---|
| `customer_age_days` | `cutoff − join_date` | static |
| `days_since_last_payment` | `cutoff − max(payment_date)` | all history |
| `payment_count_all` | `count(payments)` | all history |
| `payment_count_180d` | `count(payments ใน 180 วัน)` | 180d |
| `total_revenue_all` | `Σ amount` | all history |
| `total_revenue_180d` | `Σ amount ใน 180 วัน` | 180d |
| `avg_transaction_value` | `mean(amount)` | all history |
| `payment_interval_mean_days` | `mean(ระยะห่างวันจ่ายติดกัน)` | all history |
| `payment_overdue_ratio` | `days_since_last_payment / payment_interval_mean_days` (เกินรอบจ่ายปกติแค่ไหน) | all history |
| `payment_amount_cv` | `std(amount) / mean(amount)` (แยกคนจ่ายสม่ำเสมอ vs จ่ายกระชาก) | all history |

### พฤติกรรมการใช้งาน (usage)

| feature | สูตร | หน้าต่าง |
|---|---|---|
| `days_since_last_activity` | `cutoff − max(activity)` (activity = จ่าย หรือ usage>0) | all history |
| `days_since_last_usage` | `cutoff − max(period ที่ usage>0)` | all history |
| `usage_total_180d` | `Σ usage` | 180d |
| `usage_recent_90d` | `Σ usage` | 90d ล่าสุด |
| `usage_prev_90d` | `Σ usage` | 90–180 วันก่อน |
| `usage_change_90d_pct` | `signed_log1p((recent90 − prev90)/prev90)` (โมเมนตัม) | 180d |
| `usage_decay_ratio` | `signed_log1p(recent90 / prev90)` | 180d |
| `usage_slope_6m` | ความชันเชิงเส้นของ usage รายเดือน 6 เดือน | 6 เดือน |
| `usage_active_months_180d` | `count(เดือนที่ usage>0)` | 180d |
| `usage_consistency_ratio` | `usage_active_months_180d / 6` | 180d |

### สัดส่วนช่องทาง (channel mix)

| feature | สูตร |
|---|---|
| `sms_usage_share` / `email_usage_share` | usage แต่ละช่องทาง ÷ usage รวม |
| `bc_usage_share` / `api_usage_share` / `otp_usage_share` | usage แต่ละแหล่ง (Broadcast/API/OTP) ÷ usage รวม |
| `channel_hhi` | `sms_share² + email_share²` (Herfindahl; 1.0 = ช่องทางเดียว, ~0.5 = สมดุล) |
| `multichannel_flag` | 1 ถ้าใช้ทั้ง SMS และ Email (>0), ไม่งั้น 0 |

### เครดิต (เฉพาะโมเดล credit — 4 ตัวเสริม)

| feature | สูตร |
|---|---|
| `credit_added_180d` | `Σ credit_add ใน 180 วัน` |
| `credit_balance_proxy` | `Σ credit_add − Σ usage` (ก่อน cutoff; **ไม่ใช้** snapshot credit_sms/credit_email เพราะสะท้อนเวลา export ไม่ใช่ ณ cutoff → กัน leakage) |
| `credit_runway_months` | `credit_balance_proxy / (usage_recent_90d / 3)`, clip `[0, 24]` |
| `credit_usage_decel` | `signed_log1p` ของการเปลี่ยนอัตราเผาต่อเดือน (เร่ง/ชะลอการใช้) |

> **การเติมค่าว่าง (imputation):** feature กลุ่มนับ/ผลรวม (payment_count, usage_*, share, credit_*) ถ้าไม่มีข้อมูล = **0** (`ZERO_DEFAULT_FEATURES`); กลุ่มที่เป็นอัตรา/ระยะเวลา (age, days_since_*, avg_transaction_value, interval, overdue, cv) เป็น **null ได้** แล้ว preprocessor เติมด้วย median ที่ fit จาก train เท่านั้น (`NULLABLE_CONTRACT_FEATURES`)
> `signed_log1p(x) = sign(x)·log(1+|x|)` — บีบค่าหางยาวโดยคงเครื่องหมาย

---

## 4. Churn

**ผลลัพธ์:** `churn_probability` (0–1), `churn_risk_level` (low/medium/high/critical), `churn_factors` (เหตุผลราย feature)

### 4.1 โมเดลที่แข่งกัน (candidate)
→ `churn_trainer.py`: `DEFAULT_CANDIDATES = ["logistic_regression", "lightgbm", "tabicl"]`

- **logistic_regression** — เชิงเส้น อธิบายได้ (มี `coef_`)
- **lightgbm** — gradient boosting อธิบายได้ด้วย SHAP
- **tabicl** — tabular foundation model (แม่นแต่ **อธิบายรายคนไม่ได้** → ถ้าตัวนี้ชนะ `churn_factors` จะเป็น null)

**เกณฑ์เลือกผู้ชนะ:** **5-fold Cross-Validation PR-AUC** สูงสุด บน train∪validation
→ `churn_trainer.py` `_cv_oof()` ~315–345 (จัดอันดับด้วย `competition[name]`)

### 4.2 churn_probability คำนวณอย่างไร (ตอนทำนาย)
→ `prediction/runner.py` ~315–326

```
raw_scores       = model.predict_proba(x)[:, 1]          # คะแนนดิบจากโมเดลผู้ชนะ
churn_probability = clip( calibrator.transform(raw_scores), 0, 1 )   # ปรับ calibration
```

เฉพาะแถวที่ `el_churn = True` เท่านั้นที่ได้ค่า ที่เหลือเป็น `NaN`

### 4.3 Calibration — ทำไมต้องปรับ และปรับยังไง
คะแนนดิบของโมเดลไม่ได้แปลว่าเป็น "ความน่าจะเป็นจริง" เสมอไป จึงต้องปรับให้ตรงกับอัตราการเกิดจริง
→ `churn_trainer.py` `_fit_calibrator()` ~779–814 (fit บนคะแนน **out-of-fold 5-fold**)

เลือกระหว่าง 2 วิธี:
- **Platt scaling** (LogisticRegression บนคะแนนดิบ) — เป็น default
- **Isotonic regression** — จะเลือกก็ต่อเมื่อ:
  - มี positive ≥ **200** ตัวอย่าง **และ**
  - isotonic ลด **ECE** ได้มากกว่า Platt เกิน `ECE_IMPROVEMENT_MARGIN = 0.005` **หรือ** ECE เท่าๆ กันแต่ Brier ดีกว่าเกิน `ISOTONIC_BRIER_MARGIN = 0.02`

`FittedCalibrator.transform()` = `predict_proba` (Platt) หรือ `clip(predict, 0, 1)` (isotonic)

### 4.4 churn_risk_level — จาก % เป็นระดับความเสี่ยง
→ `prediction/runner.py` `_risk_level()` ~407–418 (เทียบจากมากไปน้อย เจอเงื่อนไขแรกที่ผ่าน)

```
if p >= thresholds["critical"]: "critical"
elif p >= thresholds["high"]:   "high"
elif p >= thresholds["medium"]: "medium"
else:                           "low"
```

threshold ทั้ง 3 ค่า **ไม่ได้ fix** แต่ **คำนวณตอนเทรน** แล้วเก็บใน `thresholds.json` ติดไปกับโมเดล
(ถ้าโมเดลไม่มีไฟล์นี้ ระบบจะ **ล้ม run** ทันที ไม่ยอมเดา — `runner.py` ~307–314)

**ที่มาของ threshold (ตอนเทรน):** → `churn_trainer.py` ~377–380 + `metrics.py` ~428–455

1. หา **"high" ที่ทำให้ F2 สูงสุด** จากการกวาด threshold (F-beta, β=2 เน้น recall)
   `f2_threshold = select_threshold_max_fbeta(y, calibrated_oof, beta=2.0)`
2. บีบให้อยู่ในช่วง `HIGH_THRESHOLD_BAND = (0.35, 0.85)` → ได้ `high`
3. แตกเป็น 3 ระดับ (`risk_thresholds_from_high`):
   ```
   high     = clip(f2_threshold, 0.35, 0.85)   # แล้ว clip [0.05,0.95] อีกชั้น
   medium   = round(high × 0.5, 2)
   critical = round(high + 0.6 × (1 − high), 2)
   ```
   **ตัวอย่าง:** `high=0.50` → `medium=0.25`, `critical=0.80`

### 4.5 churn_factors — "% churn มาจากปัจจัยอะไร" (คำอธิบายรายคน)
→ `prediction/runner.py` `_churn_shap_factors()` ~421–481

ใช้ **SHAP** ดึง **5 feature ที่ผลักดันคะแนนมากสุด** ต่อ 1 ลูกค้า:
- โมเดลเชิงเส้น (logistic): SHAP = `x_standardized × coef_` (ตรงตามนิยาม SHAP ของโมเดลเชิงเส้น)
- โมเดล tree (lightgbm): `shap.TreeExplainer(model).shap_values(x)` เลือก class positive
- โมเดล opaque (tabicl): ไม่มี `coef_`/`feature_importances_` → **`churn_factors = null`** (ทำนาย % ได้ แต่บอกเหตุผลรายคนไม่ได้)

รูปแบบผลลัพธ์ต่อ factor: เลือก top-5 จาก `|SHAP|` มากสุด
```json
{ "feature": ชื่อฟีเจอร์, "value": ค่าจริงของลูกค้า,
  "direction": "up"|"down"(ดันให้ churn ขึ้น/ลง), "impact": round(|SHAP|, 4) }
```
> ลูกค้าที่ถูก abstain (อายุ < 90 วัน) จะถูกล้าง `churn_factors` เป็น null หลังคำนวณ

### 4.6 นิยาม Label churn (สิ่งที่โมเดลเรียนรู้ตอนเทรน)
→ `labels.py` `build_churn_labels()`

- ประชากรที่นับ (eligible): มีกิจกรรมในช่วง `[cutoff−180, cutoff)` **และ** เคยจ่ายก่อน cutoff
- `churn_label = 1` ถ้า **ไม่มี** payment และ **ไม่มี** usage ในช่วง `[cutoff, cutoff+180)` (เงียบสนิทหลัง cutoff = churn)
- `churn_label = 0` ถ้ายังมีกิจกรรมหลัง cutoff

---

## 5. CLV

**ผลลัพธ์:** `predicted_clv_6m` (รายได้คาดการณ์ 6 เดือนข้างหน้า, บาท), `p_alive` (โอกาสยัง active, 0–1)

### 5.1 Label ที่เทรน
`future_revenue_6m` = ผลรวม `amount` ของ payment ในช่วง `[cutoff, cutoff+180)` (ถ้าไม่มี = 0)
→ `labels.py` `build_clv_labels()`

### 5.2 โมเดลรายได้ (two-part) + เกณฑ์ promote
→ `clv_trainer.py`; revenue champion = **`twopart`** เท่านั้น; **promote ด้วย `clv_composite` บน test** (หัวข้อ 9.2, 10)

```
predicted_clv = magnitude_slope × P(รายได้>0) × E[รายได้ | รายได้>0] + magnitude_intercept
```

- **P(รายได้>0):** LightGBM binary classifier
- **E[รายได้|จ่าย]:** LightGBM quantile regression (log-space) — ให้ทั้ง point และช่วง p10–p90 สำหรับ payer
- **`magnitude_slope` / `magnitude_intercept`:** OLS affine calibration บน validation (`fit_clv_magnitude_calibration`) — คง ranking ไว้; whale-tail blend กับ BG/NBD ที่ serve time สำหรับ top decile
- **ไม่มี Optuna / candidate competition** — โครงสร้าง two-part ตรงกับ target ที่มีศูนย์เยอะ + whale

### 5.3 BG/NBD + Gamma-Gamma (p_alive เท่านั้น — ไม่ใช่ revenue champion)
→ `clv_trainer.py` ~91–108, RFM input ~172–180

อินพุต RFM (คิด ณ cutoff จาก payment ก่อน cutoff):
- `frequency` = (จำนวนวันที่มี payment ไม่ซ้ำ) − 1, ต่ำสุด 0
- `recency` = (วันจ่ายล่าสุด − วันจ่ายแรก) เป็นวัน
- `T` = (cutoff − วันจ่ายแรก) เป็นวัน
- `monetary_value` = ค่าเฉลี่ยเงินต่อครั้งของวันที่ซื้อซ้ำ

สูตร:
```
n_purchases = BG/NBD.conditional_expected_number_of_purchases_up_to_time(180, freq, recency, T)
p_alive     = BG/NBD.conditional_probability_alive(freq, recency, T)        # clip [0,1]
E[profit|ซื้อ] = Gamma-Gamma.conditional_expected_average_profit(freq, monetary)
predicted_clv = max(0, n_purchases × E[profit|ซื้อ])
```
Gamma-Gamma จะ fit ต่อเมื่อมีลูกค้าซื้อซ้ำ (มี monetary>0) ≥ **50** ราย ไม่งั้น fallback

**p_alive มาจาก BG/NBD เสมอ** ไม่ว่าโมเดลรายได้ผู้ชนะจะเป็นตัวไหน (`p_alive_source = "bgnbd"`)

### 5.4 Value tier & p_alive health cuts
→ ดูหัวข้อ [7.2](#72-customer_value_tier--value-tier) และ [7.4](#74-segment)

---

## 6. Credit Forecast

**ผลลัพธ์:** `predicted_credit_usage_30d`, `predicted_credit_usage_90d`, ช่วง p10–p90,
`estimated_days_until_topup`, `credit_urgency_level`

### 6.1 Label
ผลรวม usage ในช่วง `[cutoff, cutoff+30)` และ `[cutoff, cutoff+90)` → `labels.py` `build_credit_usage_labels()`

### 6.2 โมเดล: LightGBM Quantile Regression
→ `credit_trainer.py`; `QUANTILES = [0.10, 0.25, 0.50, 0.75, 0.90]`, `HORIZONS = {30, 90}`

- เทรน 1 โมเดลต่อ 1 quantile ต่อ 1 horizon (`LGBMRegressor(objective="quantile", alpha=q)`)
- **ค่าที่แสดงเป็นตัวเลขหลัก = p50 (median)** → `runner.py` ~639–645
- Optuna จูนโดย **minimize pinball loss ที่ α=0.50**

**เทคนิคเพิ่มความแม่น** (ทั้งหมดอยู่ใน `credit_trainer.py`):
- **Log-ratio anchor:** เทรนบน `log1p(y) − log1p(carryover)` โดย carryover = usage เฉลี่ยต่อเดือน × (horizon/30)
  → `credit_anchor_log()`, `baselines.credit_last_30d_carryover()`
- **ถอดกลับ + shrinkage λ + clip:** `expm1(clip(correction + (λ−1)×correction_p50, −1.5, +1.5) + anchor_log)`;
  `CORRECTION_CLIP=1.5`, λ เลือกจาก 11 ค่า (0.0–1.0) ที่ MAE p50 ต่ำสุด
- **บังคับเรียง quantile ไม่ให้ไขว้** (p10≤p25≤p50≤p75≤p90) และ **90d ≥ 30d เสมอ** (cumulative)
  → `_enforce_cross_horizon_monotonicity()` และ `runner.py` ~643–649
- **CQR (Conformalized Quantile Regression):** ขยายช่วง p10/p90 ให้ครอบคลุมจริง ~**80%** (`TARGET_COVERAGE=0.80`)

### 6.3 วันจนต้องเติมเครดิต (`estimated_days_until_topup`) + urgency
→ `credit_trainer.py` (โมเดล AFT) + `prediction/runner.py` ~654–657, ~810–832

**หลัก:** โมเดล **XGBoost AFT (survival:aft)** ทำนายวันจน top-up (จูนด้วย F2 ของ alert "ต้องเติมภายใน ≤14 วัน")
→ ผลลัพธ์ปัดขึ้นและ cap ที่ `TOPUP_CAP_DAYS = 365`

**Fallback (ถ้าไม่มีโมเดล AFT):** heuristic จากยอดคงเหลือ ÷ อัตราการเผา
```
daily_burn   = predicted_credit_usage_30d / 30
days         = min( ceil( credit_balance_total / daily_burn ), 365 )   # NaN ถ้า burn = 0
```

**ระดับ urgency** (เฉพาะ credit-eligible; กฎหลังทับกฎก่อน) → ค่าคงที่ใน `constants.py`:

| ระดับ | เงื่อนไข (วันจน top-up) |
|---|---|
| `stable` | default (ไม่มีค่า หรือ > 90 วัน) |
| `monitor` | ≤ `URGENCY_MONITOR_DAYS = 90` |
| `warning` | ≤ `URGENCY_WARNING_DAYS = 30` |
| `critical` | ≤ `URGENCY_CRITICAL_DAYS = 14` |

---

## 7. Derived Business Fields

ฟิลด์ที่ "ต่อยอด" จากผลโมเดล คำนวณใน `prediction/runner.py` `_apply_derived()` / `_apply_segments()`

### 7.1 revenue_at_risk (รายได้ที่เสี่ยงหลุด ต่อคน)
→ `runner.py` ~801–805
```
revenue_at_risk = round( churn_probability × predicted_clv_6m , 2 )   # เฉพาะเมื่อมีทั้งสองค่า
```

### 7.2 customer_value_tier (value tier)
→ `runner.py` ~787–799; ค่าคงที่ `VALUE_TIER_HIGH_PCT=0.90`, `VALUE_TIER_MID_PCT=0.50`

จัดอันดับ **เปอร์เซ็นไทล์ของ `predicted_clv_6m`** เฉพาะกลุ่ม **active ที่ CLV > 0** ของ run นั้นๆ:

| tier | เงื่อนไข (percentile rank) |
|---|---|
| `high` | rank ≥ 0.90 (top decile) |
| `mid` | rank ≥ 0.50 (ครึ่งบน) |
| `low` | CLV > 0 แต่ต่ำกว่าครึ่ง |
| `none` | ไม่ active หรือ CLV ≤ 0 |

(เป็นเปอร์เซ็นไทล์ → เส้นแบ่งเงินบาทปรับตามข้อมูลแต่ละ run เอง)

### 7.3 usage_trend / momentum
→ feature `usage_change_90d_pct` (`features.py` ~572, `_safe_pct_change`); ตัดสินใน `runner.py` ~689–693
ใช้แถบ `MOMENTUM_BAND = 0.10` (±10%):
- `> +0.10` → **increasing**, `< −0.10` → **declining**, ระหว่างนั้น → **stable**, ไม่มี usage → **no_usage**

### 7.4 segment
→ `runner.py` `_apply_segments()` ~893–915; ใช้ p_alive cuts จาก CLV artifact (หรือ fallback 0.20/0.50)

ตัวช่วย:
- `valuable` = value_tier ∈ {high, mid}
- `at_risk` = churn ∈ {high, critical} **หรือ** `p_alive < p_alive_at_risk`
- `watch` = ไม่ at_risk และ (churn = medium **หรือ** `p_alive < p_alive_watch`)
- `growing` = `usage_change_90d_pct > 0.10`

จัด segment (ตามลำดับเงื่อนไข):

| เงื่อนไข | segment |
|---|---|
| Ghost | Ghost |
| Churned + เคยจ่าย | Lapsed (ดึงกลับ) |
| Churned อื่นๆ | Dormant |
| valuable + at_risk | **High-Value At-Risk** (สำคัญสุด) |
| valuable + watch | Mid-Value At-Risk |
| valuable | High-Value Stable |
| at_risk | Low-Value At-Risk |
| watch | Low-Value Watch |
| growing | Emerging |
| อื่นๆ | Stable |

**p_alive cuts มาจากไหน:** คำนวณตอนเทรน CLV จากการกระจาย p_alive บน validation
→ `clv_trainer.py` `derive_p_alive_thresholds()` ~33–60
```
p_alive_at_risk = clip( quantile(p_alive, 0.15), 0.10, 0.30 )   # fallback 0.20
p_alive_watch   = clip( quantile(p_alive, 0.40), 0.35, 0.60 )   # fallback 0.50, บังคับ > at_risk
```

### 7.5 priority_score (คะแนน 0–100) + priority_rank
→ `runner.py` `_display_score()` ~933–943
- **จัดอันดับ** ด้วย `revenue_at_risk` (สำหรับ segment retention) มิฉะนั้นด้วย `predicted_clv_6m`
- **คะแนนที่แสดง** = min-max ของ `log1p(revenue_at_risk)` สเกลเป็น 0–100 (เป็นค่าโชว์เชิงเปรียบเทียบภายใน run, monotonic กับ revenue_at_risk)

### 7.6 needs_review
→ `runner.py` ~856–861
```
needs_review = ( churn ∈ {high,critical}
              OR (valuable AND p_alive < p_alive_at_risk AND usage_change_90d_pct < −0.10) )
              AND active
```

### 7.8 Descriptive fields (ข้อเท็จจริงลูกค้า — ไม่ใช่คำทำนาย)
→ `runner.py` `_apply_descriptive()` ~661–756 (คิดจาก payment ก่อน cutoff)

| field | สูตร |
|---|---|
| `n_purchases` | `count(payments ทั้งหมดก่อน cutoff)` (ไม่มี = 0) |
| `total_revenue` | `Σ amount ทั้งหมดก่อน cutoff` |
| `avg_transaction_value` | `total_revenue / n_purchases` (null ถ้าไม่เคยจ่าย) |
| `usage_trend` | จาก `usage_change_90d_pct`: no_usage / increasing(>+10%) / declining(<−10%) / stable |
| `credit_balance_total` | `credit_sms + credit_email` จาก snapshot profile (ใช้เป็นตัวหารใน heuristic วันจน top-up) |
| `profile_snapshot` | snapshot โปรไฟล์ ณ cutoff: `{join_date, customer_age_days, status_sms, status_email, credit_sms, credit_email, expire_sms, expire_email, last_access, last_send, sms/email/bc/api/otp_usage_share, usage_total_180d}` — ให้ Customer 360 แสดงได้โดยไม่ต้อง join ตารางอื่น |

### 7.9 Meta fields (audit / อธิบาย null)

| field | ค่า |
|---|---|
| `output_status` | `predicted` (ครบ) / `partial` (บางโมเดล null) / `insufficient_data` |
| `output_notes` | ข้อความอธิบายเพิ่มเมื่อบางโมเดลไม่ได้ค่า |
| `model_eligibility_json` | `{churn:{eligible,status,reason}, clv:{...}, credit:{...}}` — status ∈ predicted/not_eligible/insufficient_data/failed (นี่คือที่มาของข้อความ "ทำไมคนนี้ไม่มีคะแนน") |
| `model_versions_json` | `{churn:<version>, clv:<version>, credit:<version>}` — รู้เสมอว่าตัวเลขมาจากโมเดลเวอร์ชันไหน |

### 7.7 ตัวเลขระดับ run (Dashboard) — คำนวณด้วย SQL ไม่ใช่ Python
→ `apps/api/src/lib/run-aggregates.ts`
- `expected_at_risk` = Σ `revenue_at_risk` เฉพาะ **Active Paid**
- `high_risk_exposure` = Σ `predicted_clv_6m` เฉพาะที่ `churn_risk_level ∈ {high, critical}`

---

## 8. Training Pipeline

### 8.1 Quality Gates (ต้องผ่านก่อนเทรน — `status=failed` = หยุด run)
→ `runner.py` ~197–210 เรียก 5 gate จาก `validation.py`

| Gate | ตรวจอะไร | เกณฑ์สำคัญ (blocker) |
|---|---|---|
| 1 source readiness | ข้อมูลนำเข้าพร้อม | import_status=ready; customers/payments/usage ไม่ว่าง |
| 2 schema quality | คุณภาพข้อมูล | วันที่ parse ไม่ได้ ≤ 0.5% (`INVALID_DATE_RATE_THRESHOLD`); acc_id ไม่ null; usage ≥ 0; ไม่มี customer ซ้ำ |
| 3 cutoff feasibility | ช่วงเวลาพอไหม | มีประวัติก่อน `cutoff−180`; มีข้อมูลถึง `cutoff+180` (ครบ label); cutoff/horizon > 0 |
| 4 label viability | label พอเทรนไหม | churn eligible ≥ 500, positive ≥ 100, negative ≥ 100, positive rate 0.05–0.80; CLV eligible ≥ 500, nonzero ≥ 100; credit nonzero ≥ 500; variance > 0 |
| 5 feature leakage | ไม่มีข้อมูลอนาคต | feature ทุกตัว date < cutoff; ชื่อ feature ตรง `CREDIT_TIER_A_FEATURES` เป๊ะ; ห้ามมี snapshot field (last_access/credit_sms ฯลฯ) |

(warning ที่ไม่หยุด run เช่น history < 365 วัน, orphan activity > 1%, null rate > 50%)

### 8.2 การแบ่งข้อมูล (Temporal split)
→ `datasets.py`
- **60 / 20 / 20** = train / validation / test (`HOLDOUT_FRACTION=0.40`, `TEST_WITHIN_HOLDOUT=0.50`), stratified, `RANDOM_SEED=42`
- แบ่งต่อ **acc_id** (1 คน 1 แถว) กัน leakage; ถ้า < 25 แถวใส่ train ทั้งหมด
- **Backtest หลาย cutoff:** ถอยทีละ `step_months=2`, สูงสุด `MAX_BACKTESTS=6`, ต้องมีประวัติ ≥ 365 วัน และมี label ครบหลัง cutoff; นำเฉพาะ **train rows ของ cutoff เก่า** มาเสริม train (val/test อยู่ที่ cutoff ล่าสุดเสมอ)

### 8.3 Baseline (ตัวเทียบขั้นต่ำที่โมเดลต้องชนะ)
→ `baselines.py`

| โมเดล | baseline |
|---|---|
| churn | `recency_rule_90d` (days_since_last/180), `rfm_quartile`, `logistic_regression` |
| clv | `segment_mean` (ค่าเฉลี่ยตาม quartile), `revenue_180d_carryover` (ใช้รายได้ 180 วันล่าสุดเป็นคำตอบ) |
| credit | `last_30d_carryover`, `moving_avg_90d` |

### 8.4 Leakage suite (รันหลังเทรน, กันโมเดลโกง)
→ `leakage.py`; churn จะ hard-fail ถ้า: single-feature AUC > 0.90, shuffle-label AUC เกิน 0.5 มาก, drop feature recency แล้ว AUC ตกเกิน 0.30 ฯลฯ

---

## 9. Metrics

ทุก metric คำนวณจริงใน `apps/ml/src/training/metrics.py` (ใช้ scikit-learn/scipy เป็นแกน)
**นี่คือส่วนที่ยืนยันว่า "ความแม่นยำไม่ได้เสกมา"** — ทุกตัวมีสูตรตรงไปตรงมา

### 9.0 มาตรฐานการวัด (Industry standard)

ระบบนี้ **ไม่ได้คิด metric เอง** — ใช้แนวทางเดียวกับ churn analytics / CLV literature / forecasting ทั่วไป:

| ขั้นตอน | ที่มา / มาตรฐาน | เราทำอย่างไร |
|---|---|---|
| แบ่งข้อมูล | ML textbook — train/val/test holdout | 60/20/20 ต่อ `acc_id` ที่ cutoff หลัก (§8) |
| Label | backtest / point-in-time evaluation | ผลจริงหลัง cutoff ภายใน horizon จาก payment/usage |
| Churn metric | sklearn `average_precision_score`; marketing lift charts | PR-AUC + recall/lift@top-k + ECE (§9.1) |
| CLV metric | Spearman ranking + top-decile capture (CLV papers) | Spearman + composite promote (§9.2) |
| Credit metric | quantile regression + interval coverage (Hyndman FPP) | coverage p10–p90 + pinball (§9.3) |
| หลัง deploy | production monitoring / holdout จริง | realized-outcome loop (§9.4) |

**ตัวเลขหลักที่โชว์บนหน้า Model Performance = test holdout** — split ที่โมเดลไม่เคยใช้ตัดสินใจอะไรเลย
CV / validation ใช้เลือก candidate ตอนเทรนเท่านั้น ไม่ใช่ headline accuracy

**สิ่งที่เป็น design ของ product (ไม่ใช่สูตรสากล):** `clv_composite` รวมหลาย metric เป็นคะแนน promote, promotion gate 2 stage, การจัดหน้า UI

### 9.1 Churn (binary classification) — `churn_metrics()`

คำนวณบน **test set** โดย:
- ความน่าจะเป็นที่ผ่าน calibration ใช้กับ Brier/ECE/threshold
- คะแนนดิบ (ranking_scores) ใช้กับ PR-AUC/ROC-AUC/lift (เพราะ isotonic ทำให้เกิดค่าเท่ากันเป็นกลุ่ม กด PR-AUC ลงผิดจริง)

| Metric | สูตร / ที่มา |
|---|---|
| `pr_auc` | `average_precision_score(y_true, ranking)` — พื้นที่ใต้ Precision-Recall (เหมาะ imbalanced) |
| `roc_auc` | `roc_auc_score` (ถ้ามี ≥2 class) |
| `f1` | `f1_score(y_true, y_pred)` โดย `y_pred = (prob ≥ threshold)` = ค่าเฉลี่ยฮาร์มอนิกของ precision/recall |
| `precision` | `precision_score` = TP/(TP+FP) |
| `recall` | `recall_score` = TP/(TP+FN) |
| `threshold` | จุดตัดที่เลือก (F2-optimal, ดู 4.4) |
| `recall_at_top{5,10,20}pct` | สัดส่วน churner จริงที่จับได้ใน top-k% ของคะแนน |
| `lift_at_top{5,10,20}pct` | ความหนาแน่น positive ใน top-k% ÷ base rate |
| `brier` | `brier_score_loss` = MSE ของความน่าจะเป็น (ต่ำ = ดี) |
| `bss` | Brier Skill Score = `1 − brier / (base_rate×(1−base_rate))` (>0 = ชนะเดามั่ว) |
| `ece` | Expected Calibration Error — 10 bin เท่ากัน, เฉลี่ยถ่วงน้ำหนัก `|จริง − ทำนาย|` ต่อ bin |
| `mce` | Maximum Calibration Error — bin ที่แย่สุด |
| `log_loss` | binary cross-entropy |
| `n`, `positive_rate` | ขนาด test, อัตรา churn จริง |

**F1 คำนวณละเอียด:** `y_pred = 1 ถ้า churn_probability ≥ threshold`, แล้ว
`F1 = 2·precision·recall / (precision + recall)` ผ่าน `sklearn.f1_score`
→ threshold ที่ใช้คือ threshold "high" (F2-optimal) เดียวกับที่แบ่ง risk level

**การเลือก threshold (F-beta):** → `select_threshold_max_fbeta()`
กวาด threshold = quantile ของ prob 97 จุด (0.02–0.98) เลือกจุดที่
`Fβ = (1+β²)·P·R / (β²·P + R)` สูงสุด, β=2 (เน้นจับ churner ให้ครบ = recall สำคัญกว่า)

เสริม: `hosmer_lemeshow_test` (chi-square goodness-of-fit ของ calibration),
`bootstrap_ci` (95% CI แบบ percentile bootstrap 1000 รอบ) — `metrics.py` ~160–261

### 9.2 CLV (regression + ranking) — `clv_metrics()`

| Metric | สูตร |
|---|---|
| `spearman` | `spearmanr(y_true, y_pred)` — สหสัมพันธ์เชิงอันดับ (องค์ประกอบของ `clv_composite`) |
| `clv_composite` | คะแนนรวม: Spearman + top-decile + portfolio bias + range coverage + p_pay ECE (**เกณฑ์ promote**) |
| `mae` | `mean_absolute_error` |
| `rmse` | `sqrt(mean((y−ŷ)²))` |
| `rmsle` | `sqrt(mean((log1p(ŷ) − log1p(y))²))` (scale-invariant) |
| `smape` | `mean( 2·|ŷ−y| / (|y|+|ŷ|) )` |
| `top_decile_capture` | สัดส่วนรายได้จริงทั้งหมดที่กระจุกอยู่ใน top 10% ที่โมเดลจัดอันดับ |

### 9.3 Credit (quantile) — `credit_metrics()`

| Metric | สูตร |
|---|---|
| `mae_30d` / `mae_90d` | MAE ของ p50 เทียบ label |
| `smape_30d` / `_90d` | SMAPE ของ p50 |
| `coverage_p10_p90` | สัดส่วน label จริงที่ตกในช่วง [p10, p90] เฉลี่ย 2 horizon (**เกณฑ์ promote**, เป้า 80%) |
| `pinball_p50_*` | pinball loss ที่ α=0.5 |
| `winkler_p10_p90_*` | Winkler interval score (รางวัลช่วงแคบที่ยังครอบคลุมจริง) |
| `pinball_composite_*` | เฉลี่ย pinball 5 quantile |

### 9.4 Realized outcome — วัด "ความแม่นจริง" หลังเวลาผ่านไป
→ `apps/ml/src/outcomes/metrics.py` + `runner.py` (สั่งด้วย `POST /outcome-backfill`)

metric ตอนเทรน (ข้อ 9.1–9.3) วัดบน **test/backtest** ในอดีต ส่วนอันนี้วัดกับ **ผลจริงที่เกิดขึ้นแล้ว**
เมื่อ horizon ของ run นั้นครบ (มี predict data ใหม่กว่ามายืนยัน):

- **สร้าง label จริง** ด้วย label builder ชุดเดียวกับตอนเทรน (`labels.py`) แล้วจับคู่กับค่าที่เคยทำนายไว้
- **ใช้ฟังก์ชัน metric ตัวเดียวกันเป๊ะ** (import จาก `training/metrics.py` ไม่ได้เขียนใหม่) → realized PR-AUC/Spearman/coverage เทียบกับ test ตอนเทรนได้ตรงๆ
  - churn: `churn_metrics` ที่ **threshold ที่ใช้จริงตอน serve** + confusion matrix + calibration + lift table
  - clv: `clv_metrics` (Spearman/MAE/top-decile) ระหว่างรายได้จริง vs `predicted_clv_6m`
  - credit: MAE/SMAPE/pinball ของ p50 และ coverage p10–p90 ต่อ horizon
- ต้องจับคู่ได้ ≥ `MIN_SAMPLES = 20` ราย ไม่งั้นถือเป็น noise ไม่รายงาน
- เก็บเป็น `ml_model_evaluations` (`evaluation_type='production_holdout'`) อ่านผ่าน `GET /prediction-runs/:id/realized-outcomes`

---

## 10. Promotion Gate

โมเดลใหม่จะขึ้นเป็น **"production"** ได้ต้องผ่าน **2 ด่าน** → `promotion.py` + config ใน `runner.py` ~70–114

**Stage 1 — Safety (ต้องผ่านทุกข้อ):**
1. ผ่าน leakage test และ artifact โหลดได้จริง
2. **ชนะ baseline** บน validation, test **และทุก backtest cutoff** (metric หลักของแต่ละโมเดล)
3. **ชนะ champion เดิม** เกิน margin: churn/clv ≥ **1%** relative, credit ≥ **0.5%**
4. **เสถียร (stability):** cutoff ที่แย่สุดตกจาก median ไม่เกิน churn/clv **30%**, credit **25%**
5. **calibration:** churn `ECE ≤ 0.10` (ceiling); credit coverage ต้องไม่เกิน 0.90 เกิน 0.001

**Stage 2 — Composite:** เลือกผู้ชนะจากคะแนนรวม
`composite = mean(metric หลัก บน test + backtests) − penalty_calibration`
(churn penalty = `max(0, ECE − 0.05)`)

**Credit มีด่านเสริม:** `mae_30d` และ `mae_90d` ต้อง ≤ **1.10×** baseline ที่ดีที่สุด (`CREDIT_MAE_TOLERANCE`)

**ถ้าไม่ผ่าน:** ไม่เรียก `promote_model_version` → **alias production ตัวเดิมคงอยู่** แต่ version ใหม่ยังถูกบันทึก
(artifact/metrics เก็บไว้ให้ตรวจได้) สรุปจะขึ้นว่า "ไม่มี candidate ผ่าน safety gate — คง champion เดิมไว้"

**เกณฑ์หลักต่อโมเดล:** churn = `pr_auc`, clv = `clv_composite`, credit = `coverage_p10_p90`
(`ECE_LIMIT=0.05`, `COVERAGE_RANGE=(0.75, 0.90)`)

---

## 11. ภาคผนวก: ตารางค่าคงที่

ค่าทั้งหมดจาก `apps/ml/src/constants.py` และไฟล์ trainer (ระบุในวงเล็บ)

| ค่าคงที่ | ค่า | ใช้ทำอะไร |
|---|---|---|
| `active_window_days` | 180 | หน้าต่าง "ยัง active" (lifecycle/label) |
| `horizon_days` | 180 | หน้าต่างอนาคต churn/CLV |
| credit horizons | 30, 90 | หน้าต่างอนาคต credit |
| `CHURN_ABSTAIN_MIN_TENURE_DAYS` | 90 | อายุขั้นต่ำก่อนให้คะแนน churn |
| `HIGH_THRESHOLD_BAND` (churn_trainer) | (0.35, 0.85) | ช่วง clip ของ threshold "high" |
| F-beta β (churn_trainer) | 2.0 | เลือก threshold เน้น recall |
| medium / critical (metrics) | `high×0.5` / `high+0.6(1−high)` | แตกระดับความเสี่ยง |
| `ECE_IMPROVEMENT_MARGIN` / `ISOTONIC_BRIER_MARGIN` | 0.005 / 0.02 | เลือก isotonic vs Platt |
| isotonic min positives | 200 | เงื่อนไขใช้ isotonic |
| top SHAP factors | 5 | จำนวน factor churn ต่อคน |
| `VALUE_TIER_HIGH_PCT` / `MID_PCT` | 0.90 / 0.50 | เส้นแบ่ง value tier |
| `MOMENTUM_BAND` | 0.10 | แถบ ±10% ตัดสิน trend |
| `URGENCY_CRITICAL/WARNING/MONITOR_DAYS` | 14 / 30 / 90 | ระดับ urgency เครดิต |
| `P_ALIVE_ATRISK_RATE` / clamp | 0.15 / [0.10,0.30] | derive p_alive at-risk cut |
| `P_ALIVE_WATCH_RATE` / clamp | 0.40 / [0.35,0.60] | derive p_alive watch cut |
| `P_ALIVE_*_FALLBACK` | 0.20 / 0.50 | fallback เมื่อ artifact เก่า |
| CLV tail (runner) | q=0.90, min pop=50, min freq=2.0 | blend รายใหญ่ |
| CLV magnitude slope clip | [0.01, 20.0] | ปรับสเกล CLV |
| credit `QUANTILES` | 0.10/0.25/0.50/0.75/0.90 | quantile regression |
| credit point | p50 | ตัวเลขหลักที่แสดง |
| `CORRECTION_CLIP` / `TARGET_COVERAGE` | 1.5 / 0.80 | decode + CQR |
| `TOPUP_CAP_DAYS` | 365 | cap วันจน top-up |
| split 60/20/20, `RANDOM_SEED` | 42 | train/val/test |
| Gate 4 churn eligible/pos/neg | 500 / 100 / 100 | label viability |
| churn positive rate | 0.05–0.80 | label viability |
| promote margin churn/clv/credit | 1% / 1% / 0.5% | ชนะ champion เดิม |
| stability drop churn/clv/credit | 30% / 30% / 25% | ความเสถียร backtest |
| churn ECE ceiling / target | 0.10 / 0.05 | calibration gate |
| `CREDIT_MAE_TOLERANCE` | 1.10 | credit ต้อง MAE ≤ 1.1× baseline |

---

### สรุปเชิงหลักการ

- **Lifecycle (Ghost/Churned/Active) = กฎล้วน** จากกิจกรรมก่อน cutoff (ไม่ใช่ ML)
- **Churn %** = โมเดลผู้ชนะ (CV PR-AUC) → calibrate → clip[0,1]; **risk level** จาก threshold ที่ derive จาก F2-optimal; **เหตุผล** จาก SHAP top-5
- **CLV** = two-part revenue forecast → promote ด้วย **`clv_composite` บน test**; **p_alive** จาก BG/NBD เสมอ
- **Credit** = quantile regression (p50), ช่วงคุมด้วย CQR 80%
- **Metric ทุกตัว** คำนวณด้วยสูตรมาตรฐานใน `metrics.py` บน test/backtest จริง และต้อง **ชนะ baseline + champion เดิม** ถึงจะขึ้น production — ทั้งหมดตรวจสอบย้อนได้จากโค้ดที่อ้างอิงไว้

---

## 12. Design contract & policy (สัญญาการออกแบบ + นโยบาย)

> ยุบมาจาก `ML-V2-TRAINING-PIPELINE.md` เดิม — ส่วนที่เป็น "หลักการ/นโยบาย/เหตุผล"
> (ตัวเลข/สูตรที่เป็นทางการดูหัวข้อ 1–11 ด้านบน ซึ่งอิงโค้ดจริง; ถ้าขัดกันให้เชื่อโค้ด)

### 12.1 หลักการที่ห้ามละเมิด

1. **Point-in-time (PIT):** feature เห็นได้เฉพาะข้อมูลก่อน cutoff, label มาจากข้อมูลหลัง cutoff ภายใน horizon เท่านั้น
2. **Temporal split เท่านั้น** — ห้าม random split (ข้อมูลเป็น time-series พฤติกรรม; random split = ให้โมเดลแอบเห็นอนาคต)
3. **โมเดลต้องชนะ baseline** ถึงจะ promote — ถ้าไม่ชนะกฎง่ายๆ แปลว่ายังไม่ควรใช้ ML
4. **Probability ต้อง calibrated** — เพราะ downstream คูณเงิน (`revenue_at_risk = p × CLV`)
5. **Reproducible** — fix seed, บันทึก config + `feature_code_hash` + เวอร์ชัน library ใน `ml_training_runs.training_config_json`
6. **หลักฐานทุกอย่างลง DB** — metric → `ml_model_evaluations`, gate/leakage → `ml_data_validation_reports` (หน้าเว็บ/การ promote อ่านจาก DB ไม่ใช่ log)

### 12.2 Class imbalance

- churn rate จริง ~5–40% ของ active paid → ใช้ `scale_pos_weight`/`class_weight`
- **ห้าม SMOTE/oversampling** (บิด distribution → calibration พังทั้งระบบ ขัดข้อ 12.1(4))
- วัดด้วย **PR-AUC** เป็นหลัก ไม่ใช่ accuracy (accuracy โกหกเมื่อ class เอียง)

### 12.3 เหตุผลการเลือกโมเดล (ทำไมตัวนี้)

- **Churn:** LightGBM เป็นตัวเต็ง (tabular ~10⁴ แถว, กิน missing ได้ตรงๆ, เทรนเร็วพอทำ Optuna + backtest หลาย cutoff, มี SHAP); TabICL แข่งใน default set; LR เป็น ML baseline. **ยังไม่ทำ ensemble** — ที่ข้อมูลขนาดนี้กำไร ~1–2% ไม่คุ้มความซับซ้อน (artifact ×2, calibration/SHAP ยากขึ้น)
- **CLV:** revenue = **two-part** (P จ่าย × มูลค่าถ้าจ่าย) + quantile value; **p_alive** จาก BG/NBD เสมอ; promote ด้วย **`clv_composite`** (Spearman + decile + portfolio bias + coverage + p_pay ECE)
- **Credit:** LightGBM quantile (p10–p90) + anchor บน carryover (log-ratio) + shrinkage λ + CQR — ออกแบบให้ "ไม่แพ้ baseline เชิงโครงสร้าง" (λ=0 = carryover เป๊ะ)

### 12.4 Feature tiers (ทำไมใช้แค่ Tier A)

- **Tier A** — สร้างจาก event history (payments/usage) ย้อนเวลาได้ → PIT-safe เสมอ → **ใช้เทรน**
- **Tier B** — snapshot (`credit_*`, `status_*`, `expire_*`) = ค่า "ตอน export" ไม่ใช่ ณ cutoff → เทรน = leak อนาคต → **ห้ามเทรน** (แสดงใน `profile_snapshot` ได้)
- **Tier C** — `last_access`, `last_send` = ใกล้ label เกินไป → **ห้าม**
- เพิ่ม feature ใหม่ได้เมื่อผ่าน PIT review + อัปเดต `feature_schema_json` + `feature_code_hash` เปลี่ยน + เทรนเป็น feature set version ใหม่

### 12.5 Retraining policy

Trigger ให้ retrain: (1) มี dataset ใหม่ import สำเร็จ, (2) ตามรอบ ~90 วัน (มี label สดครบ horizon), (3) feature drift PSI > 0.2, (4) performance decay จาก realized outcome
- **เทรนใหม่หมดทุกครั้ง** ที่ cutoff ใหม่ (ไม่มี incremental — data ขนาดนี้เทรนไม่กี่นาที, reproducible สำคัญกว่า) → challenger เทียบ champion ผ่าน promotion gate (หัวข้อ 10)
- **Realized-outcome loop:** ครบ horizon + มีข้อมูลใหม่ → คำนวณ label จริง → วัดเทียบที่เคยทำนาย → เก็บ `ml_model_evaluations` (`evaluation_type='production_holdout'`) = ตัวเลขที่ซื่อสัตย์ที่สุด

### 12.6 Artifacts + Model card

เก็บที่ `models/{model_type}/{version}/`: `model.pkl`, `calibrator.pkl` (churn), `preprocessor.json`, `feature_names.json`, `thresholds.json`, `metrics.json`, `model_card.json/.md`, `training_log.txt`
**Model card ต้องมี:** version, วันที่/cutoff/horizon, dataset (source_id/แถว/positive rate), feature set (ชื่อ+version+hash), algorithm+params, ผลทุก split + baseline + backtest, calibration+ECE, thresholds, leakage results, ข้อจำกัด, ผู้เทรน — path+checksum ลง `ml_model_versions`

### 12.7 Definition of Done (ระบบเทรน)

- รัน training run จบจาก CLI/API เดียว: gates → train → eval → promote → artifacts ครบ
- `ml_model_evaluations` มีแถว baseline + candidate ทุก split ทุก cutoff
- leakage suite รันอัตโนมัติ และเคย "จับ leak จริง" ได้ (ทดสอบโดยจงใจใส่ leak แล้วต้อง fail)
- champion มี alias `production` + model card + artifact load test ผ่าน
- หน้า Model Performance แสดงค่าจาก DB ล้วน (ไม่มี mock)
- prediction runner ใช้ champion + preprocessor + calibrator ชุดเดียวกับที่เทรน (`feature_code_hash` ตรง)

---

## 13. Output contract (สัญญา field ของ `ml_prediction_outputs`)

> ยุบมาจาก `ML-V2-OUTPUT-CONTRACT.md` เดิม — รายการ field แบบเต็มดูหัวข้อ 2, 3, 7 ด้านบน (lifecycle, churn/CLV/credit, derived, descriptive, meta)

กติกาหลัก:
1. **1 แถวต่อลูกค้าต่อ run** — `UNIQUE(prediction_run_id, acc_id)`
2. **ลูกค้าทุกคนต้องมีแถว** แม้ทำนายไม่ได้ — field ที่ทำนายไม่ได้เป็น `null` พร้อมเหตุผลใน `model_eligibility_json`
3. output เก็บ **scalar ต่อลูกค้า** เท่านั้น — time-series (กราฟ usage/payment) อ่านจาก `predict_clean_*` ตรง
4. ทุกแถวเก็บ `model_versions_json` — รู้เสมอว่าตัวเลขมาจากโมเดลเวอร์ชันไหน (audit)

ลำดับการเขียนของ prediction runner: (1) สร้าง `ml_prediction_runs` (in_progress) → (2) โหลด `predict_clean_*` → gates → features → (3) lifecycle + eligibility ทุกคน → (4) รัน champion เฉพาะ eligible + SHAP (churn) → (5) derived fields → (6) **batch insert** ทุกคน → (7) post-check (Gate 15: จำนวนแถว=ลูกค้า, คะแนนอยู่ใน [0,1], null ในกลุ่ม eligible ≈ 0) → (8) `completed`/`failed` (+`error_message` เสมอ)
