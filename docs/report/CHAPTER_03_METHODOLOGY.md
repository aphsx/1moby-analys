# บทที่ 3: ระเบียบวิธีวิจัยและสถาปัตยกรรมข้อมูล (Methodology & Feature Pipeline)

---

## 3.1 แหล่งข้อมูลและการสกัดข้อมูล (Data Lineage & Pipeline Architecture)
ระบบทำงานบนฐานข้อมูลการดำเนินงานจริงของแพลตฟอร์ม 1Moby ซึ่งประกอบด้วยตารางข้อมูลดิบและตารางที่ผ่านการคลีนนิ่งแล้ว ดังนี้:

```
                  ผังการไหลของข้อมูล (Data Lineage Architecture)
                  
[ ข้อมูลดิบจากระบบงานจริง ]
├── Users+User_profile (25,093 แถว)       ──┐
├── backend_payment (13,882 ธุรกรรม)      ──┼──> [ ETL & Data Cleaning ]
├── sms_usage_history (API/BC/OTP)         ──┤    ├── กำจัดชีตซ้ำซ้อน (Deduplication)
└── email_usage_history (API/BC/OTP)       ──┘    ├── คัดแยก Ghost Accounts (19,273 บัญชี)
                                                  └── แปลงประเภทข้อมูลเป็น UTC Timestamp
                                                            │
                                                            ▼
                                        [ Point-in-Time Cutoff Window ]
                                        (CUTOFF_DATE = 2025-07-01)
                                        ├── อดีต 180 วัน: สกัด Features
                                        └── อนาคต 180 วัน: คำนวณ Targets
                                                            │
                                  ┌─────────────────────────┴─────────────────────────┐
                                  ▼                                                   ▼
                    [ Cohort A: Active Paid ]                           [ Cohort B: Active 180d ]
                       (N = 2,388 บัญชี)                                   (N = 4,038 บัญชี)
                                  │                                                   │
                                  ▼                                                   ▼
                    [ Model 01: Churn Model ]                           [ Model 02 & Model 03 ]
```

### รายละเอียดโครงสร้างตารางข้อมูล:
1. **`predict_clean_user_profile` (25,093 แถว):**
   * `acc_id` (Integer): รหัสประจำตัวบัญชีลูกค้า (Primary Key)
   * `join_date` (Date/Timestamp): วันที่เปิดใช้งานบัญชี
   * `account_type` (String): ประเภทลูกค้า (นิติบุคคล หรือ บุคคลธรรมดา)
2. **`predict_clean_payment` (13,882 ธุรกรรม):**
   * `acc_id` (Integer): รหัสลูกค้า
   * `payment_date` (Timestamp): วันที่และเวลาที่ชำระเงินสำเร็จ
   * `amount` (Numeric): ยอดเงินที่ชำระ (บาท)
   * `credit_add` (Numeric): ปริมาณเครดิตที่ได้รับ
   * `credit_type` (String): ประเภทเครดิต (`sms` หรือ `email`)
   * `status` (String): สถานะธุรกรรม (`SUCCESS`)
3. **`sms_usage_history_*` และ `email_usage_history_*` (52,529 รายการ):**
   * `acc_id` (Integer): รหัสลูกค้า
   * `period` (Timestamp/Month): เดือนที่บันทึกการส่งข้อความ
   * `usage` (Numeric): ปริมาณข้อความที่ส่งสำเร็จ (ข้อความ/ฉบับ)
   * `channel_type` (String): ช่องทางการส่ง (`API`, `BC`, `OTP`)

---

## 3.2 การทำความสะอาดและการกรองข้อมูล (Data Cleansing & Preprocessing)
1. **การตรวจสอบชีตซ้ำซ้อน (Deduplication):**
   จากการตรวจสอบไฟล์ Workbook ดิบ พบว่าชีต `SMS_usage (OTP)` มีข้อมูลเหมือนกับ `SMS_usage (API)` แบบแถวต่อแถว ($100\%$ Duplicate) โค้ด ETL จึงทำการรวมและตัดข้อมูลซ้ำ เพื่อป้องกันไม่ให้ยอดการส่ง SMS สูงเกินจริงถึง $23\%$
2. **การคัดแยกบัญชีผี (Ghost Accounts Exclusion):**
   บัญชีลูกค้าจำนวน **19,273 บัญชี** ที่สมัครเปิดบัญชีเพื่อรับเครดิตทดลองใช้ฟรี แต่ไม่เคยมีการเติมเงิน และไม่มีกิจกรรมการส่งข้อความเลยตลอดประวัติศาสตร์ ถูกคัดแยกออกจากการเทรน เพื่อป้องกันไม่ให้โมเดลจำกัดการเรียนรู้อยู่แต่กับข้อมูลที่ไม่มีการเคลื่อนไหว
3. **การจัดการค่าผิดปกติ (Outliers):**
   กรองยอดเงินชำระและยอดการส่งข้อความที่มีค่าติดลบหรือผิดปกติออกจากชุดข้อมูล

---

## 3.3 สถาปัตยกรรมจุดตัดเวลาเพื่อป้องกันข้อมูลรั่วไหล (Point-in-Time Cutoff Architecture)
เพื่อป้องกันปัญหาข้อมูลรั่วไหลจากอนาคต (Data Leakage) ระบบกำหนดจุดตัดเวลาเสมือน:
$$\text{CUTOFF\_DATE} = \text{2025-07-01}$$
* **Observation Window (ช่วงสังเกตการณ์ในอดีต 180 วัน):** `[2025-01-01 ถึง 2025-07-01]` เป็นช่วงเวลาเดียวที่อนุญาตให้โค้ดดึงข้อมูลมาสร้างตัวแปรฟีเจอร์
* **Prediction Window (ช่วงผลลัพธ์ในอนาคต 180 วัน):** `[2025-07-01 ถึง 2025-12-28]` ใช้สำหรับคำนวณ Ground Truth Label ของชุดข้อมูล Train, Validation และ Test

---

## 3.4 การจำแนกประชากรเป้าหมาย (Cohort Definitions)
1. **Cohort A: Active Paid Cohort ($N = 2,388$ บัญชี ณ จุดตัด):**
   * *เงื่อนไข:* เคยชำระเงินสำเร็จอย่างน้อย 1 ครั้งตลอดประวัติศาสตร์ **และ** มีกิจกรรมการส่งข้อความหรือเติมเงินภายใน 180 วันก่อนจุดตัด
   * *การใช้งาน:* ใช้สำหรับพัฒนา **Model 01 (Churn Prediction)**
2. **Cohort B: Active 180-Day Cohort ($N = 4,038$ บัญชี ณ จุดตัด):**
   * *เงื่อนไข:* มีกิจกรรมการส่งข้อความ ($Usage > 0$) หรือชำระเงินภายใน 180 วันก่อนจุดตัด (รวมทั้งลูกค้าที่ชำระเงินและลูกค้า Free-tier)
   * *การใช้งาน:* ใช้สำหรับพัฒนา **Model 02 (CLV)** และ **Model 03 (Credit Forecast)**

---

## 3.5 ตารางตัวแปรฟีเจอร์อย่างละเอียดตามซอร์สโค้ดจริง (Feature Engineering Specification)

ตารางแสดงตัวแปร Tier A Features ทั้งหมด พร้อมสูตรคณิตศาสตร์และโค้ด Python ที่ใช้สร้างจริง:

| ลำดับ | ชื่อฟีเจอร์ในโค้ด | หมวดหมู่ | โค้ดและสูตรการคำนวณจริง (Code Implementation) | ความหมายทางสถิติและพฤติกรรม | โมเดลที่ใช้ |
| :---: | :--- | :--- | :--- | :--- | :---: |
| 1 | `customer_age_days` | Profile | `(cutoff - join_date).days.clip(lower=0)` | อายุบัญชีลูกค้านับจากวันสมัครเปิดใช้งาน (วัน) | Churn, CLV |
| 2 | `days_since_last_payment` | Recency | `(cutoff - p_last).dt.days.fillna(999.0)` | จำนวนวันนับจากการชำระเงินครั้งสุดท้าย | ทุกโมเดล |
| 3 | `days_since_last_usage` | Recency | `(cutoff - u_last).dt.days.fillna(999.0)` | จำนวนวันนับจากการส่งข้อความครั้งสุดท้าย | ทุกโมเดล |
| 4 | `days_since_last_activity` | Recency | `min(days_since_last_payment, days_since_last_usage)` | ความสดใหม่ของกิจกรรมล่าสุดในระบบ (วัน) | ทุกโมเดล |
| 5 | `payment_count_all` | Frequency | `hist_pay.groupby("acc_id")["payment_date"].count()` | ความถี่ในการเติมเงินสะสมตลอดประวัติศาสตร์ | ทุกโมเดล |
| 6 | `payment_count_180d` | Frequency | `hist_pay[pay_date >= w180_start].count()` | ความถี่ในการเติมเงินในรอบ 6 เดือนล่าสุด | ทุกโมเดล |
| 7 | `total_revenue_all` | Monetary | `hist_pay.groupby("acc_id")["amount"].sum()` | ยอดเงินชำระสะสมตลอดชีพ (บาท) | Churn, CLV |
| 8 | `total_revenue_180d` | Monetary | `hist_pay[pay_date >= w180_start]["amount"].sum()` | ยอดเงินชำระในรอบ 6 เดือนล่าสุด (บาท) | Churn, CLV |
| 9 | `avg_transaction_val` | Monetary | `np.where(payment_count_all > 0, total_revenue_all / payment_count_all, 0.0)` | ยอดเติมเงินเฉลี่ยต่อบิล (Basket Size) | CLV |
| 10 | `usage_total_180d` | Volume | `hist_use[period >= w180_start]["usage"].sum()` | ปริมาณการส่งข้อความรวม 6 เดือน (ข้อความ) | ทุกโมเดล |
| 11 | `usage_recent_90d` | Volume | `hist_use[period >= w90_start]["usage"].sum()` | ปริมาณการส่งข้อความในรอบ 3 เดือนล่าสุด | ทุกโมเดล |
| 12 | `usage_recent_30d` | Volume | `hist_use[period >= w30_start]["usage"].sum()` | ปริมาณการส่งข้อความในรอบ 1 เดือนล่าสุด | ทุกโมเดล |
| 13 | `usage_active_months_180d` | Consistency | `use_pos[period >= w180_start].groupby("acc_id")["period"].nunique()` | จำนวนเดือนที่มีการส่งข้อความ (0 ถึง 6 เดือน) | ทุกโมเดล |
| 14 | `usage_trend_pct` | Velocity | `(usage_recent_30d * 3.0 - usage_recent_90d) / (usage_recent_90d + 1.0)` | โมเมนตัมการส่งข้อความเติบโตหรือชะลอตัว | ทุกโมเดล |
| 15 | `payment_to_usage_ratio` | Efficiency | `total_revenue_180d / (usage_total_180d + 1.0)` | สัดส่วนเม็ดเงินต่อปริมาณการใช้งาน | Churn, CLV |
| 16 | `credit_added_180d` | Credit | `hist_pay_sms[pay_date >= w180_start]["credit_add"].sum()` | ปริมาณเครดิต SMS ที่เติมเพิ่มใน 6 เดือน | Credit |
| 17 | `current_sms_balance` | Balance | `(sum(SMS credit_add) - sum(SMS usage)).clip(lower=0.0)` | ประมาณการเครดิต SMS คงเหลือในระบบ | Credit |
| 18 | `anchor_30d` | Anchor | `usage_recent_30d` | ฐานยอดส่งข้อความ 30 วันล่าสุด | Credit |

---

## 3.6 สถาปัตยกรรมโมเดลและขั้นตอนการฝึกฝนจริง (Model Training Pipelines)

### 🔹 Model 01: Churn Prediction Pipeline
* **Target Label ($Y$):**
  $$Y = \begin{cases} 1 & \text{ถ้า } (\text{acc\_id} \notin \text{fut\_pay\_ids}) \land (\text{acc\_id} \notin \text{fut\_use\_ids}) \\ 0 & \text{กรณีอื่น} \end{cases}$$
* **การแบ่งชุดข้อมูล:** Train ($60\%$), Validation ($20\%$), Test ($20\%$) โดยทำการ Stratified Split
* **สถาปัตยกรรม Dual-GBDT:**
  * `LightGBM Classifier`: `n_estimators=120`, `learning_rate=0.04`, `max_depth=5`, `subsample=0.8`, `colsample_bytree=0.8`, `random_state=42`
  * `CatBoost Classifier`: `iterations=150`, `learning_rate=0.04`, `depth=5`, `random_seed=42`
  * รวมผลแบบ Blend: $P_{\text{raw}} = 0.5 \times P_{\text{LGBM}} + 0.5 \times P_{\text{CatBoost}}$
* **การปรับเทียบและการหาเกณฑ์ตัดสินใจ:**
  * นำ $P_{\text{raw}}$ เข้าผ่าน `IsotonicRegression(out_of_bounds="clip")`
  * สแกนหาจุดตัด $\theta^*$ ที่ให้ค่า $F_2\text{-Score}$ สูงสุดผ่าน 71 จุดตัด: $\theta \in [0.10, 0.80]$ ผลลัพธ์ได้เกณฑ์ที่ $\theta^* = 0.350$

### 🔹 Model 02: CLV Prediction Pipeline
* **Target Label ($Y$):** ยอดชำระเงินจริงสะสมในอีก 180 วันข้างหน้า ($Y \ge 0$ บาท)
* **สถาปัตยกรรม Two-Part Hurdle Model:**
  * **Part 1 Classifier:** LightGBM Binary Classifier (`n_estimators=100`, `learning_rate=0.04`, `max_depth=5`) ทำนายโอกาสที่จะจ่ายเงิน ($p_{\text{pay}} = P(Y > 0 | X)$)
  * **Part 2 Regressor:** CatBoost Regressor (`iterations=250`, `learning_rate=0.04`, `depth=5`) เทรนบน $\log(1 + Y)$ เฉพาะกลุ่มที่จ่ายเงินจริง
* **การปรับเทียบระดับพอร์ตโฟลิโอ:**
  คำนวณตัวคูณชดเชย $M$ บน Validation Set:
  $$M = \frac{\sum_{i \in \text{val}} Y_i}{\sum_{i \in \text{val}} (p_{\text{pay}, i} \times \hat{Y}_{\text{cond}, i})} = 1.0522$$
  $$\hat{Y}_{\text{final}} = p_{\text{pay}} \times \hat{Y}_{\text{cond}} \times 1.0522$$
* **Value Tier Classification:**
  * `Whale (Enterprise)`: $\hat{Y}_{\text{final}} \ge 100,000$ บาท
  * `Core Tier`: $10,000 \le \hat{Y}_{\text{final}} < 100,000$ บาท
  * `Standard Tier`: $1,000 \le \hat{Y}_{\text{final}} < 10,000$ บาท
  * `Low Tier`: $\hat{Y}_{\text{final}} < 1,000$ บาท

### 🔹 Model 03: Credit Forecast & Depletion Runway Pipeline
* **Target Label ($Y$):** ปริมาณข้อความจริงที่ส่งในอีก 30 วันข้างหน้า ($U_{30\text{d}}$)
* **สถาปัตยกรรม Quantile Regression:**
  * เทรน LightGBM Regressors 3 ตัว ด้วย Pinball Loss ที่ $\alpha \in \{0.10, 0.50, 0.90\}$ บนเป้าหมาย $\log(1 + Y)$ (`n_estimators=100`, `learning_rate=0.05`, `max_depth=5`)
* **Monotonic Constraint & Anchor Blending:**
  $$\hat{y}_{p50} = \max(\hat{y}_{p50}, \hat{y}_{p10}), \quad \hat{y}_{p90} = \max(\hat{y}_{p90}, \hat{y}_{p50})$$
  $$\hat{U}_{\text{blend}} = 0.60 \times \hat{y}_{p50} + 0.40 \times \text{anchor\_30d}$$
* **Depletion Runway with Micro-Noise Gate:**
  $$\text{daily\_burn} = \begin{cases} \frac{\hat{U}_{\text{blend}}}{30} & \text{ถ้า } \hat{U}_{\text{blend}} \ge 10.0 \text{ SMS/เดือน} \\ 0.0 & \text{ถ้า } \hat{U}_{\text{blend}} < 10.0 \text{ (ไม่นำมาคิดอัตราเผาผลาญ)} \end{cases}$$
  $$\text{runway\_days} = \begin{cases} 999 & \text{ถ้า } \text{daily\_burn} \le 0 \\ \min\left(999, \left\lceil \frac{\text{current\_sms\_balance}}{\text{daily\_burn}} \right\rceil\right) & \text{กรณีอื่น} \end{cases}$$
  กำหนดให้ลูกค้าที่มี $\text{runway\_days} \le 14$ วัน เป็นกลุ่ม **Urgent Top-up Alert**

