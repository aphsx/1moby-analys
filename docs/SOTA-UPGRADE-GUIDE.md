# 🏆 คู่มือการยกระดับสู่ระบบพยากรณ์ระดับโลก (World SOTA Upgrade Guide)
## สำหรับ 1Moby Analytics: จาก Google Colab สู่ Production Web & Backend

> เอกสารนี้ทำหน้าที่เป็น **พิมพ์เขียวทางสถาปัตยกรรม (Architectural Blueprint)** สำหรับทีมวิศวกรรมข้อมูล (Data / ML Engineers) และทีมนักพัฒนาเว็บ (Full-Stack Engineers) ในการนำผลลัพธ์ นวัตกรรมอัลกอริทึม และฟีเจอร์ระดับโลก (World SOTA) ที่พัฒนาและพิสูจน์แล้วในชุด **Google Colab Notebooks** (`notebooks/`) ถ่ายทอดเข้าสู่ระบบจริงบน **FastAPI / PostgreSQL / Next.js** (`apps/ml`, `apps/api`, `apps/web`) ได้อย่างราบรื่น ไม่ติดขัด และปลอดภัยจากการถดถอยของระบบเดิม

---

## 📑 สารบัญ

1. [เปรียบเทียบสถาปัตยกรรม: ระบบเดิม vs ระบบระดับโลก (World SOTA)](#1-เปรียบเทียบสถาปัตยกรรม)
2. [พิมพ์เขียวฟีเจอร์ระดับโลก 60+ ตัว (SOTA Feature Store)](#2-พิมพ์เขียวฟีเจอร์ระดับโลก-60-ตัว)
3. [การพอร์ตโมเดล Churn (Tri-GBDT Stacking Meta-Classifier)](#3-การพอร์ตโมเดล-churn)
4. [การพอร์ตโมเดล CLV (Two-Part CatBoost Tweedie + Whale Tail EVT)](#4-การพอร์ตโมเดล-clv)
5. [การพอร์ตโมเดล Credit Forecast & Survival Top-up Timing](#5-การพอร์ตโมเดล-credit-forecast--top-up)
6. [แนวทางการปรับปรุงฐานข้อมูล PostgreSQL (`001_schema.sql`)](#6-แนวทางการปรับปรุงฐานข้อมูล-postgresql)
7. [ข้อกำหนดหน้าเว็บและกราฟสำหรับผู้บริหาร (Executive Visualizations Spec)](#7-ข้อกำหนดหน้าเว็บและกราฟสำหรับผู้บริหาร)

---

## 1. เปรียบเทียบสถาปัตยกรรม

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 เปรียบเทียบเชิงสถาปัตยกรรม                               │
├───────────────────────┬───────────────────────────────┬────────────────────────────────┤
│ องค์ประกอบ            │ ระบบเดิมใน Production          │ ระบบระดับโลก (World SOTA)       │
├───────────────────────┼───────────────────────────────┼────────────────────────────────┤
│ 1. Feature Space      │ 27–31 Features (Summary แบบมือ) │ 60+ Features (EWMA, 2nd-order  │
│                       │ ดูแค่ยอดรวม 90/180 วัน         │ Accel, Fano factor, Entropies) │
├───────────────────────┼───────────────────────────────┼────────────────────────────────┤
│ 2. โมเดล Churn        │ Single LightGBM               │ Tri-GBDT Stacking Ensemble     │
│                       │ (หรือ TabICL เดี่ยว)          │ (LGBM + CatBoost + XGBoost)    │
├───────────────────────┼───────────────────────────────┼────────────────────────────────┤
│ 3. โมเดล CLV          │ Two-Part Log-MSE + OLS Calib  │ Two-Part CatBoost Tweedie      │
│                       │ (ปัญหา Underestimate ลูกค้า Whale)│ + Whale Extreme Tail Modeling  │
├───────────────────────┼───────────────────────────────┼────────────────────────────────┤
│ 4. โมเดล Credit       │ LightGBM Quantile + CQR       │ Anchored Multi-Quantile        │
│                       │                               │ + Non-Crossing CQR+ Guarantee  │
├───────────────────────┼───────────────────────────────┼────────────────────────────────┤
│ 5. โมเดล Top-up Timing│ XGBoost AFT (Survival)        │ XGBoost AFT + Kaplan-Meier     │
│                       │ Grid search จำกัด             │ Adaptive Horizon Baseline      │
├───────────────────────┼───────────────────────────────┼────────────────────────────────┤
│ 6. ชุดกราฟวินิจฉัย      │ Basic Loss / Confusion Matrix │ Multi-PR/ROC Overlay, Gains,   │
│                       │                               │ Decile Lift, Lorenz, Fan Chart │
└───────────────────────┴───────────────────────────────┴────────────────────────────────┘
```

---

## 2. พิมพ์เขียวฟีเจอร์ระดับโลก 60+ ตัว (SOTA Feature Store)

เพื่อยกระดับความสามารถในการจับพฤติกรรมลูกค้าล่วงหน้า 30–45 วัน ให้ขยายไฟล์ [`apps/ml/src/training/features.py`](file:///Users/aphsx/Documents/GitHub/demo-predict/apps/ml/src/training/features.py) ดังนี้:

### 2.1 รายการฟีเจอร์ที่ต้องเพิ่มเข้าใน `FEATURE_METADATA`:

| ชื่อฟีเจอร์ | สูตรการคำนวณทางคณิตศาสตร์ | เหตุผลและความสำคัญเชิงธุรกิจ |
|---|---|---|
| `usage_recent_30d` | $\sum_{t \in [T-30, T)} \text{usage}_t$ | สัญญาณความสดใหม่ระยะสั้นที่สุดก่อน Cutoff |
| `usage_30d_to_90d_ratio` | $\text{usage\_recent\_30d} / (\text{usage\_recent\_90d} + \epsilon)$ | สัดส่วนการใช้เดือนล่าสุดเทียบกับไตรมาส (>0.33 คือเร่งตัว, <0.15 คือชะลอตัว) |
| `usage_velocity` | $U_{\text{latest}} - U_{\text{prev}}$ | อนุพันธ์อันดับ 1 (ความเร็วของการเปลี่ยนแปลงปริมาณการใช้งาน) |
| `usage_acceleration` | $(U_t - U_{t-1}) - (U_{t-1} - U_{t-2})$ | อนุพันธ์อันดับ 2 (**ความเร่ง**) — จับสัญญาณลูกค้าเริ่มถอนตัวก่อนหยุดจริง |
| `usage_burstiness_fano` | $\sigma_{\text{usage}}^2 / (\mu_{\text{usage}} + \epsilon)$ | Fano Factor: แยกแยะระหว่างลูกค้ายิง SMS สม่ำเสมอ vs ยิงกระชากแบบ Campaign |
| `usage_ewma_30d` | $\sum_{i=0}^5 w_i U_i / \sum w_i$ ($w_i = 0.5^{5-i}$) | น้ำหนักลดทอนแบบ Exponential Half-life 1 เดือน |
| `usage_ewma_90d` | $\sum_{i=0}^5 w_i U_i / \sum w_i$ ($w_i = 0.5^{(5-i)/3}$) | น้ำหนักลดทอนแบบ Exponential Half-life 3 เดือน |
| `channel_entropy` | $-\sum p_c \log_2(p_c + \epsilon)$ สำหรับ $c \in \{\text{SMS}, \text{Email}\}$ | Shannon Entropy วัดความหลากหลายของช่องทาง (ยิ่งสูง ยิ่ง Churn ยาก) |
| `source_entropy` | $-\sum p_s \log_2(p_s + \epsilon)$ สำหรับ $s \in \{\text{BC}, \text{API}, \text{OTP}\}$ | วัดการผูกระบบ หากใช้ API+OTP แสดงว่าผูกระบบลึก โอกาสเลิกใช้ต่ำมาก |
| `payment_count_30d` | $\text{count}(\text{payments in last 30d})$ | ความถี่การจ่ายเงินใน 30 วันล่าสุด |
| `payment_amount_30d` | $\sum \text{amount}(\text{payments in last 30d})$ | เม็ดเงินที่จ่ายใน 30 วันล่าสุด |
| `payment_velocity_ratio` | $\text{sign}(\Delta c) \cdot \ln(1 + |\Delta c| / (c_{\text{prev}} + \epsilon))$ | ความเร็วในการเติมเงินเทียบระหว่าง 90 วันล่าสุดกับ 90 วันก่อนหน้า |
| `payment_amount_max_ratio` | $\text{amount}_{\max} / (\text{avg\_transaction\_value} + \epsilon)$ | ดัชนีความแปรปรวนของขนาดบิล |
| `recency_monetary_ratio` | $\text{days\_since\_last\_payment} / (\ln(1 + \text{total\_revenue}) + \epsilon)$ | ระยะห่างเทียบกับความสำคัญของเม็ดเงิน |
| `payment_to_usage_ratio` | $\text{total\_revenue\_180d} / (\text{usage\_total\_180d} + 1.0)$ | Unit Price Index: ต้นทุนเฉลี่ยต่อหน่วยการใช้งาน |
| `credit_depletion_velocity` | $\text{monthly\_burn} / (\max(\text{credit\_balance\_proxy}, 0) + 1.0)$ | ความเร็วในการเผาเครดิตเทียบกับยอดคงเหลือ |
| `credit_runway_elasticity` | $(\text{usage\_recent\_30d} \times 3) / (\text{usage\_recent\_90d} + \epsilon)$ | ความยืดหยุ่นของอัตราการเผาเครดิต |

### 2.2 การอัปเดตไฟล์ใน `apps/ml`:
1. ใน [`apps/ml/src/training/features.py`](file:///Users/aphsx/Documents/GitHub/demo-predict/apps/ml/src/training/features.py): เพิ่มชื่อฟีเจอร์ลงใน `BASE_TIER_A_FEATURES` และคำนวณในฟังก์ชัน `_usage_history()` และ `_payment_history()`
2. ใน [`apps/ml/src/constants.py`](file:///Users/aphsx/Documents/GitHub/demo-predict/apps/ml/src/constants.py): อัปเดต `FEATURE_CONTRACT_HASH` ให้สอดคล้องกัน

---

## 3. การพอร์ตโมเดล Churn (Tri-GBDT Stacking Meta-Classifier)

### 3.1 สถาปัตยกรรม Stacking
การประกบคู่ระหว่าง 3 โมเดลต้นแบบ (Base Learners) เพื่อสร้าง Out-of-Fold Predictions:
- **Model 1: LightGBMClassifier** — โดดเด่นด้าน Leaf-wise Splitting และจับ Non-linear threshold รวดเร็ว
- **Model 2: CatBoostClassifier** — โดดเด่นด้าน Symmetric Trees ป้องกันการ Overfitting กับ Feature Interactions
- **Model 3: XGBoostClassifier** — โดดเด่นด้าน Depth-wise Trees พร้อม $L_1/L_2$ Regularization
- **Meta-Learner: LogisticRegression($C=1.0$, L2 Penalty)** — เรียนรู้น้ำหนักที่เหมาะสมในการรวมผลทำนายของทั้ง 3 โมเดล

### 3.2 การปรับแก้ใน `apps/ml/src/training/churn_trainer.py`:
```python
# โค้ดต้นแบบสำหรับใส่ใน churn_trainer.py
from catboost import CatBoostClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold

def train_sota_churn_stacking(X_train, y_train, X_val, y_val):
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    oof_lgb = np.zeros(len(X_train))
    oof_cat = np.zeros(len(X_train))
    oof_xgb = np.zeros(len(X_train))
    
    # 1. Train K-Fold Base Models & Collect OOF
    for tr_idx, val_idx in cv.split(X_train, y_train):
        # Fit Fold Models ...
        pass
        
    # 2. Fit Stacking Meta-Learner
    S_train = np.column_stack([oof_lgb, oof_cat, oof_xgb])
    meta_learner = LogisticRegression(C=1.0, random_state=42)
    meta_learner.fit(S_train, y_train)
    
    # 3. Fit Probability Calibrator (Isotonic Regression)
    # ...
    return stacking_bundle
```

### 3.3 การรองรับ SHAP ในระบบ Stacking:
เนื่องจาก Stacking ประกอบด้วย 3 โมเดล ให้คำนวณ SHAP จาก **CatBoost / LightGBM ที่มีน้ำหนักสูงสุดใน Meta-Learner** เพื่อส่งคืนให้กับ API และนำไปแสดงบนหน้า Dashboard Customer 360

---

## 4. การพอร์ตโมเดล CLV (Two-Part CatBoost Tweedie + Whale Tail EVT)

### 4.1 แก้ปัญหา Extreme Fat Tails
ข้อมูลเงินรวม 815 ล้านบาท มีความเบ้ขวาสูงมาก (Skewness > 15) หากใช้ MSE ธรรมดาบน $\log(1+y)$ โมเดลจะกดค่าของลูกค้ารายใหญ่ให้ต่ำเกินไป:
- **Part 1 (Classification):** ทำนาย $P(\text{pay} > 0)$ ด้วย **CatBoostClassifier** + Calibrator
- **Part 2 (Value Regression):** ใช้ **CatBoostRegressor(loss_function='Tweedie:variance_power=1.5')** ร่วมกับ **Generalized Pareto Distribution (GPD)** สำหรับลูกค้าที่มียอดสูงกว่า 95th Percentile

### 4.2 การผสานเข้ากับ BG/NBD Customer Vitality:
ยังคงใช้ **BetaGeoFitter (BG/NBD)** เพื่อประเมินค่า $p_{\text{alive}}$ (ความน่าจะเป็นที่ลูกค้ายังมีชีวิตอยู่ทางธุรกิจ) สำหรับนำมาคูณเป็นตัวกรอง Health Matrix:
$$\text{Expected CLV}_{\text{SOTA}} = P(\text{pay} > 0) \times \mathbb{E}[\text{Revenue} \mid \text{pay}]_{\text{Tweedie}} \times \text{Tail\_Multiplier}$$

---

## 5. การพอร์ตโมเดล Credit Forecast & Top-up Timing

### 5.1 Anchored Quantile Ensemble + Non-Crossing CQR+
- สำหรับปริมาณการใช้เครดิต 30 วัน และ 90 วัน: ใช้ **CatBoostRegressor(loss_function='MultiQuantile:alpha=0.1,0.25,0.5,0.75,0.9')** ทำนาย Log-Ratio เทียบกับ Carryover Baseline
- นำผลที่ได้มาผ่าน **Conformalized Quantile Regression (CQR+)** เพื่อปรับ Margin ให้ Empirical Coverage บนชุด Validation เท่ากับ 80% พอดิบพอดี พร้อมบังคับ:
$$\text{pred}_{p10} \le \text{pred}_{p25} \le \text{pred}_{p50} \le \text{pred}_{p75} \le \text{pred}_{p90} \quad \text{และ} \quad \text{pred}_{90d} \ge \text{pred}_{30d}$$

### 5.2 XGBoost AFT Survival Top-up Timing
- ใช้ **XGBoost AFT (`objective='survival:aft'`, `aft_loss_distribution='normal'`)**
- คำนวณ Median Survival Time: $T_{50} = \exp(\eta)$
- สร้างการแจ้งเตือนฉุกเฉิน (Urgent Top-up Alert): เมื่อ $\hat{T} \le 14$ วัน หรือ Runway เครดิตคงเหลือ $\le 14$ วัน

---

## 6. แนวทางการปรับปรุงฐานข้อมูล PostgreSQL (`001_schema.sql`)

ไม่ต้องแก้โครงสร้างตารางหลัก `ml_prediction_outputs` เพราะฟิลด์ปัจจุบันรองรับผลลัพธ์ของโมเดลอย่างสมบูรณ์แล้ว:
```sql
-- ฟิลด์ใน ml_prediction_outputs ที่รองรับผลลัพธ์ SOTA ทันที:
-- churn_probability, churn_risk_level, churn_factors (JSON)
-- predicted_clv_6m, clv_p10, clv_p50, clv_p90, p_alive, customer_health_status
-- predicted_credit_usage_30d, predicted_credit_usage_90d, credit_uncertainty_range
-- days_until_next_topup, urgent_topup_flag
```

---

## 7. ข้อกำหนดหน้าเว็บและกราฟสำหรับผู้บริหาร (Executive Visualizations Spec)

นำกราฟทั้งหมดที่แสดงผลใน Colab Notebooks ไปแสดงในหน้า **Model Performance** และ **Overview** บน Next.js:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      SOTA Executive Monitoring Dashboard Layout                        │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│ [Graph 1] Multi-Model PR/ROC Overlay      │ [Graph 2] Reliability Calibration Diagram   │
│ • เส้น PR Curve ของ 4 โมเดลแข่งกัน         │ • แถบแท่งความถี่ + จุด Calibration Curve   │
│ • แสดงค่า PR-AUC และ ROC-AUC ชัดเจน       │ • แสดง Expected Calibration Error (ECE)    │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ [Graph 3] Cumulative Gains & Decile Lift  │ [Graph 4] Lorenz Revenue Capture Curve     │
│ • แกน X: % ลูกค้าที่ติดต่อ (Decile 1–10)   │ • พิสูจน์ว่า Top 10% จับรายได้กี่ % ของพอร์ต│
│ • แกน Y: % Churners ที่ระบบดักจับได้       │ • แสดงค่า Gini Coefficient ของลูกค้ารายใหญ่ │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ [Graph 5] Credit Usage Fan / Ribbon Chart │ [Graph 6] Kaplan-Meier Survival Curve      │
│ • เส้นประวัติการใช้งาน + พยากรณ์ไปข้างหน้า │ • เปรียบเทียบอัตราการคงอยู่ของเครดิต        │
│ • แถบ Ribbon แสดงช่วงความเชื่อมั่น p10–p90 │ • จุดตัด 14 วันสำหรับการแจ้งเตือนเติมเงินด่วน │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

---
*จัดทำขึ้นโดยทีมวิศวกรรมการเรียนรู้ของเครื่อง เพื่อเป็นแนวทางสู่ระบบพยากรณ์ที่ดีที่สุดในโลกสำหรับ 1Moby Analytics*
