# 📓 1Moby Analytics — Google Colab Notebooks (World SOTA Edition)

โฟลเดอร์นี้รวบรวม **Jupyter Notebooks ทั้ง 3 โมเดลหลัก** ของระบบ Moby Analytics ที่ถูกยกระดับสู่ **มาตรฐานระดับโลก (World State-of-the-Art / SOTA)** สามารถอัปโหลดขึ้น **Google Colab** แล้วรันได้ทันที จบในตัว พร้อมชุดกราฟวินิจฉัยครบเครื่อง 6 มิติระดับ Executive

---

## 🗂️ รายการ Notebooks ในโฟลเดอร์นี้

| ลำดับ | ชื่อไฟล์ Notebook | วัตถุประสงค์ / โมเดล | อัลกอริทึมระดับโลก (World SOTA) | ชุดกราฟวินิจฉัยระดับสากล (6-Panel Dashboard) |
|---|---|---|---|---|
| **01** | [`01_churn_prediction.ipynb`](file:///Users/aphsx/Documents/GitHub/demo-predict/notebooks/01_churn_prediction.ipynb) | **Customer Churn Risk** (ทำนายความเสี่ยงเลิกใช้บริการใน 180 วัน) | **Tri-GBDT Stacking Meta-Ensemble** (LightGBM + CatBoost + XGBoost) + Isotonic Calibration + $F_2$ Cost Curve | 1. Multi-Model PR Overlay<br>2. Multi-Model ROC Overlay<br>3. Reliability Calibration Diagram<br>4. Cumulative Gains Chart<br>5. Cost-Benefit Confusion Matrix<br>6. Revenue at Risk Distribution |
| **02** | [`02_clv_prediction.ipynb`](file:///Users/aphsx/Documents/GitHub/demo-predict/notebooks/02_clv_prediction.ipynb) | **Customer Lifetime Value (CLV)** (พยากรณ์มูลค่าลูกค้า 6 เดือน และสุขภาพลูกค้า) | **Two-Part CatBoost Tweedie** (Compound Poisson-Gamma) + **BG/NBD** ($p_{\text{alive}}$) + Magnitude Calibration | 1. Lorenz Revenue Capture Curve<br>2. Actual vs Pred Log Scatter<br>3. Quintile Revenue Calibration<br>4. Residual Normal Q-Q Plot<br>5. Customer Health vs Value Matrix<br>6. Whale Portfolio Distribution |
| **03** | [`03_credit_forecast.ipynb`](file:///Users/aphsx/Documents/GitHub/demo-predict/notebooks/03_credit_forecast.ipynb) | **Credit Usage & Top-up Timing** (พยากรณ์การใช้เครดิต 30/90 วัน และวันเติมเงิน) | **Anchored Quantile Regression** ($p10–p90$) + **Non-crossing CQR+ Coverage** + **XGBoost AFT (Survival)** | 1. Fan/Ribbon Uncertainty Chart<br>2. Nominal vs Empirical Coverage<br>3. MAE Baseline Comparison<br>4. Kaplan-Meier vs AFT Survival<br>5. Urgent Top-up PR Curve<br>6. Lead-Time Error Distribution |

---

## 🚀 วิธีนำไปรันบน Google Colab (Step-by-Step)

### ขั้นตอนที่ 1: เตรียมไฟล์
1. เข้าไปที่ Google Drive หรือเปิด [Google Colab](https://colab.research.google.com/)
2. กดปุ่ม **Upload notebook** แล้วเลือกไฟล์ `.ipynb` ที่ต้องการรันจากโฟลเดอร์ `notebooks/` นี้
3. เตรียมไฟล์ Excel ข้อมูลดิบ: [`data/[1Moby] Data_example for Bangkok university.xlsx`](file:///Users/aphsx/Documents/GitHub/demo-predict/data/[1Moby]%20Data_example%20for%20Bangkok%20university.xlsx)

### ขั้นตอนที่ 2: อัปโหลดข้อมูลเข้า Colab
- เมื่อเปิด Notebook ขึ้นมา ให้กดรันเซลล์ตามลำดับ
- ใน **Step 2 (Load Excel Data)** หากรันบน Colab แล้วยังไม่พบไฟล์ ระบบจะเปิดหน้าต่าง `files.upload()` ให้เลือกอัปโหลดไฟล์ Excel เข้าเครื่อง Colab โดยอัตโนมัติ

### ขั้นตอนที่ 3: สั่ง Run All
- ไปที่เมนู **Runtime** $\rightarrow$ **Run all** (หรือกด `Ctrl + F9` / `Cmd + F9`)
- โน้ตบุ๊กจะติดตั้ง Dependencies (LightGBM, XGBoost, CatBoost, Lifetimes, Optuna, SHAP), สกัด 60+ SOTA Features, เทรนโมเดลแบบ Stacking, พลอตกราฟ 6 มิติ และ Export ตารางผลลัพธ์ CSV ให้อัตโนมัติ

---

## 💡 นวัตกรรมทางสถาปัตยกรรมระดับ World SOTA

1. **SOTA Feature Store (60+ Dynamic Signals):**
   - คำนวณความเร่งพฤติกรรม (2nd-order Acceleration), Multi-scale EWMA (30d/90d), Burstiness (Fano Factor), และ Shannon Entropies ของช่องทางสื่อสาร
2. **Tri-GBDT Out-of-Fold Stacking (Super Learner):**
   - รวมจุดแข็งของ 3 อัลกอริทึมต้นแบบ (Leaf-wise LightGBM + Symmetric Tree CatBoost + Regularized XGBoost) ผ่าน Meta-Classifier
3. **CatBoost Tweedie Compound Poisson-Gamma Loss (CLV):**
   - จัดการปัญหา Extreme Fat-Tail (Top 1% ครองยอด 63% ของเงิน 815 ล้านบาท) ไม่ทำให้ยอดของลูกค้ารายใหญ่ถูกบิดเบือน
4. **Conformalized Quantile Regression (CQR+) & Non-Crossing Clamp:**
   - รับประกันทางสถิติว่า 80% Uncertainty Band ครอบคลุมยอดใช้งานจริง โดยไม่มีปัญหาช่วงความไม่แน่นอนกลับด้าน
5. **คู่มือสำหรับพอร์ตขึ้น Web Production:**
   - มีเอกสาร [`docs/SOTA-UPGRADE-GUIDE.md`](file:///Users/aphsx/Documents/GitHub/demo-predict/docs/SOTA-UPGRADE-GUIDE.md) กำกับพิมพ์เขียวสถาปัตยกรรมสำหรับนำเข้าสู่ระบบจริงบน Next.js / FastAPI / PostgreSQL
