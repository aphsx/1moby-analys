# สารบัญและโครงสร้างรายงานวิจัยฉบับสมบูรณ์ (Master Table of Contents)
## โครงการพัฒนาระบบการเรียนรู้ของเครื่องเพื่อการวิเคราะห์และพยากรณ์พฤติกรรมลูกค้าเชิงลึก (Churn, CLV, และ Credit Forecast) บนแพลตฟอร์ม B2B Prepaid

> **เอกสารอ้างอิงและซอร์สโค้ด:** ข้อมูลทั้งหมดในรายงานฉบับนี้สกัดตรงจากซอร์สโค้ด `notebooks/01_churn_prediction.ipynb`, `notebooks/02_clv_prediction.ipynb`, `notebooks/03_credit_forecast.ipynb`, โค้ดใน `apps/ml/` และฐานข้อมูลการประเมินผลจริงบน PostgreSQL (`ml_model_versions`, `ml_prediction_outputs`)

---

## 📚 สารบัญเล่มรายงาน 5 บท

### [บทที่ 1: บทนำและบริบทของระบบ (Introduction & Domain Reality)](./CHAPTER_01_INTRODUCTION.md)
* 1.1 ความเป็นมาและความสำคัญของปัญหา (Business Background)
* 1.2 การสำรวจพฤติกรรมของข้อมูลและธรรมชาติของระบบ (Exploratory Data & Domain Realities)
  * พฤติกรรม Prepaid: เงินบาท vs เครดิตข้อความ (กรณีศึกษาลูกค้า 264612)
  * การกระจายตัวแบบหางยาวขวาสุดโต่ง (Whales vs Ghost Accounts)
  * ปัญหาการเลิกใช้งานแบบไม่แจ้งล่วงหน้า (Non-contractual Silent Churn)
* 1.3 ความท้าทายหลัก 3 ประการของโครงการ (Core Research Challenges)
* 1.4 วัตถุประสงค์ของโครงการ (Research Objectives)
* 1.5 ขอบเขตของการวิจัยและประชากรเป้าหมาย (Scope of Study & Cohorts)
* 1.6 นิยามศัพท์เฉพาะ (Operational Definitions)
* 1.7 ประโยชน์ที่คาดว่าจะได้รับ (Expected Benefits)

---

### [บทที่ 2: ทฤษฎีและงานวิจัยที่เกี่ยวข้อง (Literature Review & Theory)](./CHAPTER_02_LITERATURE_REVIEW.md)
* 2.1 สถาปัตยกรรมต้นไม้ตัดสินใจแบบกลุ่ม (Gradient Boosted Decision Trees: GBDT)
  * LightGBM (Histogram-based & Leaf-wise Growth)
  * CatBoost (Ordered Boosting & Categorical Handling)
  * Dual-GBDT Ensemble (การผสานพลัง 50:50 Blend)
* 2.2 การจัดการปัญหาข้อมูลไม่สมดุลและการปรับเทียบความน่าจะเป็น (Imbalance & Calibration)
  * ข้อจำกัดของ Accuracy และ ROC-AUC ในข้อมูล Churn
  * เกณฑ์ตัดสินใจด้วยฟังก์ชัน $F_2\text{-Score}$ (Optimal Threshold Tuning)
  * ทฤษฎีการปรับเทียบความน่าจะเป็นด้วย Isotonic Regression, ECE และ Brier Score
* 2.3 การสร้างโมเดลยอดเงินที่มีความเบ้สูงและศูนย์หนาแน่น (Two-Part Hurdle Model)
  * ข้อจำกัดของโมเดลถดถอยแบบเดี่ยว (Single Regression Failure)
  * สถาปัตยกรรม Two-Part Hurdle Model (Classifier + Log-Space Regressor)
  * การชดเชย Portfolio Multiplier (Jensen's Inequality Bias Correction)
* 2.4 ทฤษฎีการพยากรณ์แบบช่วงด้วยการถดถอยควอนไทล์ (Quantile Regression & Pinball Loss)
  * ฟังก์ชันวัตถุประสงค์ Pinball Loss ($\alpha \in \{0.10, 0.50, 0.90\}$)
  * กรอบช่วงความเชื่อมั่น $[\text{p10}, \text{p90}]$ และ Coverage Probability
* 2.5 การอธิบายโมเดลด้วยเกมทฤษฎี (Explainable AI: Shapley Values & TreeSHAP)

---

### [บทที่ 3: ระเบียบวิธีวิจัยและสถาปัตยกรรมข้อมูล (Methodology & Feature Pipeline)](./CHAPTER_03_METHODOLOGY.md)
* 3.1 แหล่งข้อมูลและการสกัดข้อมูล (Data Lineage & Pipeline Architecture)
* 3.2 การทำความสะอาดและการกรองข้อมูล (Data Cleansing & Preprocessing)
* 3.3 สถาปัตยกรรมจุดตัดเวลาเพื่อป้องกันข้อมูลรั่วไหล (Point-in-Time Cutoff: 2025-07-01)
* 3.4 การจำแนกประชากรเป้าหมาย (Cohort A: Active Paid vs Cohort B: Active 180d)
* 3.5 ตารางตัวแปรฟีเจอร์อย่างละเอียดตามซอร์สโค้ดจริง (14-15 Tier A Features พร้อมสูตรโค้ดจริง)
* 3.6 สถาปัตยกรรมโมเดลและขั้นตอนการฝึกฝนจริง (Model Training Pipelines)
  * Model 01: Churn Prediction Pipeline (Dual-GBDT + Isotonic + Max-F2)
  * Model 02: CLV Prediction Pipeline (Two-Part Hurdle + Portfolio Multiplier 1.0522)
  * Model 03: Credit Forecast & Depletion Runway Pipeline (Quantile + 60/40 Anchor Blend + Noise Gate)

---

### [บทที่ 4: ผลการทดลองและการวิเคราะห์ผล (Experimental Results & Discussion)](./CHAPTER_04_EXPERIMENTS_RESULTS.md)
* 4.1 สภาพแวดล้อมและการแบ่งชุดข้อมูลทดสอบ (Experimental Setup: $N_{\text{test}} = 478$ และ $808$)
* 4.2 ผลการทดสอบเปรียบเทียบ Model 01: Churn Prediction Benchmark
  * PR-AUC = 0.7130, ROC-AUC = 0.8732, Max-F2 = 0.7924, Recall = 86.58%, ECE = 0.0449
* 4.3 ผลการทดสอบเปรียบเทียบ Model 02: CLV Prediction Benchmark
  * ยอดเงินทำนายรวม ฿21,211,529.65 เทียบจริง ฿20,158,931.00 (Portfolio Bias = $+5.22\%$)
  * Top Decile Value Capture = 77.09%, Spearman (Payers) = 0.6875
* 4.4 ผลการทดสอบเปรียบเทียบ Model 03: Credit Forecast & Depletion Runway Benchmark
  * คำอธิบายเชิงลึกเรื่อง [p10-p90] และความสำเร็จของ Coverage 88.61%
  * ความแม่นยำในการตรวจจับเครดิตหมดฉุกเฉิน (Urgent Top-up F1 = 0.8758, Precision 88.12%, Recall 87.04%)
* 4.5 การวิเคราะห์ความสำคัญของตัวแปรด้วย SHAP (Feature Importance Insights)
* 4.6 การวิเคราะห์ข้อผิดพลาดและกรณีศึกษาพิเศษ (Whale 264612 & Micro-senders)

---

### [บทที่ 5: สรุปผลการวิจัยและข้อเสนอแนะ (Conclusion & Future Work)](./CHAPTER_05_CONCLUSION.md)
* 5.1 สรุปผลสัมฤทธิ์ของการวิจัย (Research Conclusion)
* 5.2 การนำไปประยุกต์ใช้งานในระบบสนับสนุนการตัดสินใจ (Decision Support Integration)
* 5.3 ข้อจำกัดของงานวิจัย (Limitations)
* 5.4 ข้อเสนอแนะสำหรับการวิจัยและพัฒนาต่อยอด (Future Recommendations)

---

### 📄 รวมเล่มฉบับสมบูรณ์ (Single File Edition)
สำหรับผู้ที่ต้องการนำเนื้อหาทั้งหมด 5 บทไปคัดลอกลงใน Microsoft Word หรือ Google Docs รวดเดียว สามารถเปิดได้ที่:
* **[ML_PROJECT_REPORT_5_CHAPTERS.md](../models/ML_PROJECT_REPORT_5_CHAPTERS.md)**

