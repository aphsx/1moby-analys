# รายงานโครงงานวิศวกรรมคอมพิวเตอร์

# ระบบวิเคราะห์และพยากรณ์มูลค่าลูกค้าและความเสี่ยงการเลิกใช้บริการ สำหรับธุรกิจเครดิตเติมแบบเหมาจ่าย

## (moby-analytics — 1Moby Analytics Platform)

> หมายเหตุ: เอกสารฉบับนี้จัดทำโดยอ้างอิงจาก **ซอร์สโค้ดจริงทั้งหมดในโปรเจกต์** (code-grounded) — ทุกสถาปัตยกรรม ทุกตารางฐานข้อมูล ทุก endpoint ทุกไฮเปอร์พารามิเตอร์ และทุกตัวเลขผลทดสอบ มาจากไฟล์โค้ดและไฟล์ artifact ของโมเดลจริง โดยมีตารางระบุไฟล์อ้างอิงกำกับในแต่ละหัวข้อและในภาคผนวก

---

# บทคัดย่อ

โครงงานนี้พัฒนาระบบวิเคราะห์ข้อมูลลูกค้าองค์กรสำหรับธุรกิจแพลตฟอร์มส่งข้อความ (SMS / Email / OTP) ที่ขายเครดิตแบบเหมาจ่าย (prepaid credit) ระบบนำเข้าข้อมูล Excel 8 แผ่นงาน (ข้อมูลลูกค้า การชำระเงิน และการใช้งานรายเดือนแยกตามช่องทาง) เก็บข้อมูลดิบแบบรักษาความถูกต้อง 100% แล้วทำความสะอาดเข้าสู่ตารางมาตรฐาน จากนั้นสร้างฟีเจอร์เชิงพฤติกรรม 31 ตัวแบบ point-in-time เพื่อป้องกัน data leakage และฝึกชุดโมเดล Machine Learning 3 กลุ่ม (7 โมเดลย่อย) ได้แก่ (1) โมเดลพยากรณ์การเลิกใช้บริการ 180 วัน (Churn) เลือกจากผู้สมัคร 3 อัลกอริทึม ได้ค่า PR-AUC สูงสุด 0.7614 (2) โมเดลพยากรณ์รายได้ 6 เดือน (CLV) แบบสองส่วน คูณความน่าจะเป็นที่จะจ่าย (p_pay, ROC-AUC 0.8923) กับมูลค่าเชิงควอนไทล์ ได้ค่า Spearman 0.5106 บนชุดทดสอบ และเลือกลูกค้า 10% บนสุดได้ครอบคลุมรายได้จริง 78.59% และ (3) โมเดลพยากรณ์การใช้เครดิต 30/90 วันแบบ quantile regression พร้อม conformal calibration ได้ค่า Coverage p10–p90 = 0.8639 อยู่ในเกณฑ์เป้าหมาย (0.75–0.90) และโมเดลเสริม XGBoost AFT ทำนายจำนวนวันก่อนเติมเงินครั้งถัดไป ระบบบริหารโมเดลด้วยกระบวนการ MLOps ครบวงจร: ประตูตรวจคุณภาพข้อมูล 5 ด่าน, ชุดตรวจ leakage 5 รายการ, backtest หลายช่วงเวลาอัตโนมัติ, การคัดเลือก champion–challenger แบบสองขั้น, การตรวจ drift ด้วย PSI ขณะให้บริการ และการวัดผลย้อนหลังจากผลจริง (production holdout) ผลลัพธ์ทั้งหมดแสดงผ่าน Dashboard (Next.js) ที่แปลงเป็นข้อเสนอเชิงธุรกิจ เช่น รายได้ที่มีความเสี่ยง (revenue_at_risk) คะแนนลำดับความสำคัญ (priority_score 0–100) ระดับความเร่งด่วนการเติมเครดิต และกลุ่มลูกค้า 10 กลุ่ม พร้อมคำอธิบายรายบุคคลด้วย Generative AI และแชทถาม-ตอบข้อมูลแบบ Text-to-SQL

**คำสำคัญ:** การพยากรณ์มูลค่าลูกค้า (CLV), การพยากรณ์การเลิกใช้บริการ (Churn), Quantile Regression, LightGBM, MLOps, Champion–Challenger, Data Leakage Prevention

# Abstract

This project develops a customer analytics system for a B2B messaging platform (SMS/Email/OTP) that sells prepaid credit. The system imports an eight-sheet Excel workbook (customers, payments, and monthly usage per channel), preserves the raw data with full fidelity, and cleans it into typed tables. It then builds 31 point-in-time behavioral features to prevent data leakage and trains three model families (seven sub-models): (1) a 180-day churn classifier selected among three candidate algorithms, achieving PR-AUC of 0.7614; (2) a two-part Customer Lifetime Value model that multiplies the payment probability (p_pay, ROC-AUC 0.8923) by quantile-based value estimates, achieving a test Spearman of 0.5106 and capturing 78.59% of actual revenue within the top decile; and (3) a 30/90-day credit-usage quantile regression with conformal calibration, achieving p10-p90 coverage of 0.8639 within the target band, plus an XGBoost AFT model that predicts days until the next top-up under censoring. The platform implements full MLOps: five data-quality gates, a five-check leakage suite, multi-cutoff backtesting, a two-stage champion-challenger promotion gate, PSI drift monitoring at serving time, and realized-outcome backfill against actual results. All outputs are presented on a Next.js dashboard as business actions: revenue at risk, a 0-100 priority score, credit urgency levels, ten customer segments, per-customer generative-AI explanations, and a grounded Text-to-SQL chat.

**Keywords:** Customer Lifetime Value, Churn Prediction, Quantile Regression, LightGBM, MLOps, Champion-Challenger, Data Leakage Prevention

# กิตติกรรมประกาศ

ขอขอบคุณอาจารย์ที่ปรึกษาโครงงาน 【ชื่ออาจารย์ที่ปรึกษา】 ซึ่งให้คำแนะนำอันเป็นประโยชน์ตลอดการทำโครงงาน ขอขอบคุณอาจารย์และคณะกรรมการผู้ให้ข้อเสนอแนะเพื่อปรับปรุงงาน ขอขอบคุณทีมงานและผู้เกี่ยวข้องที่ให้ข้อมูลตัวอย่างและสภาพแวดล้อมสำหรับทดสอบระบบ และขอขอบคุณครอบครัวและเพื่อนร่วมชั้นที่ให้กำลังใจจนโครงงานสำเร็จลุล่วง

# สารบัญตาราง

| หมายเลข | ชื่อตาราง | อยู่ใน |
|---|---|---|
| ตารางที่ 1-1 | ผู้ใช้งานและบทบาทในระบบ | บทที่ 1, 1.5 |
| ตารางที่ 1-2 | เครื่องมือและเทคโนโลยีที่ใช้ในโครงงาน | บทที่ 1, 1.6 |
| ตารางที่ 2-1 | ตัวชี้วัดโมเดลการจำแนกแบบทวิภาค | บทที่ 2, 2.9 |
| ตารางที่ 2-2 | ตัวชี้วัดโมเดลการถดถอยและช่วงพยากรณ์ | บทที่ 2, 2.9 |
| ตารางที่ 2-3 | ตัวชี้วัดตรวจความเสถียรขณะให้บริการ | บทที่ 2, 2.9 |
| ตารางที่ 3-1 | บริการย่อยของระบบและเทคโนโลยีที่ใช้ | บทที่ 3, 3.2.2 |
| ตารางที่ 3-2 | ภาพรวมตารางทั้ง 39 ตารางในฐานข้อมูล | บทที่ 3, 3.4.1 |
| ตารางที่ 3-3 | รายการ endpoint ทั้งหมดฝั่ง api | บทที่ 3, 3.5.2 |
| ตารางที่ 3-4 | internal ML endpoints | บทที่ 3, 3.5.3 |
| ตารางที่ 3-5 | ภาพรวมชุดโมเดล 3 กลุ่ม 7 โมเดลย่อย | บทที่ 3, 3.6.1 |
| ตารางที่ 3-6 | การนิยาม label ทั้งสี่ตัว | บทที่ 3, 3.6.2 |
| ตารางที่ 3-7 | ชุดฟีเจอร์ (feature contract) สามระดับ | บทที่ 3, 3.6.3 |
| ตารางที่ 3-8 – 3-12 | ฟีเจอร์กลุ่ม A–E รายตัวพร้อมสูตร | บทที่ 3, 3.6.3 |
| ตารางที่ 3-13 – 3-15 | ผู้สมัครโมเดลและพารามิเตอร์ (churn/CLV/credit) | บทที่ 3, 3.6.7 |
| ตารางที่ 3-16 | ชุดตรวจ data leakage ห้ารายการ | บทที่ 3, 3.6.8 |
| ตารางที่ 3-17 | เกณฑ์ประตูคัดเลือก champion | บทที่ 3, 3.6.10 |
| ตารางที่ 3-18 | ไฟล์ artifact ต่อหนึ่งเวอร์ชันโมเดล | บทที่ 3, 3.6.11 |
| ตารางที่ 3-19 | ฟีเจอร์ AI สามส่วนของระบบ | บทที่ 3, 3.9 |
| ตารางที่ 3-20 | หน้าจอ Dashboard ทั้ง 9 หน้า | บทที่ 3, 3.8.1 |
| ตารางที่ 4-1 | สคริปต์ตรวจสอบความถูกต้อง | บทที่ 4, 4.1 |
| ตารางที่ 4-2 | ชุดข้อมูลที่ใช้เทรนแต่ละโมเดล | บทที่ 4, 4.3 |
| ตารางที่ 4-3 – 4-5 | ผลการทดสอบโมเดล churn/CLV/credit | บทที่ 4, 4.4–4.6 |
| ตารางที่ ก-1 | รายการตารางฐานข้อมูลทั้ง 39 ตาราง | ภาคผนวก ก |
| ตารางที่ ค-1 | แผนที่โค้ดสำคัญของโปรเจกต์ | ภาคผนวก ค |

# สารบัญภาพ

| หมายเลข | ชื่อภาพ | อยู่ใน |
|---|---|---|
| รูปที่ 3-1 | กระแสงานหลัก (workflow) ของระบบ | บทที่ 3, 3.1 |
| รูปที่ 3-2 | สถาปัตยกรรมระบบ moby-analytics | บทที่ 3, 3.2.1 |
| รูปที่ 3-3 | กระแสข้อมูลตั้งแต่ไฟล์ต้นฉบับจนถึงการวัดผลจริง | บทที่ 3, 3.3 |
| รูปที่ 3-4 | ขั้นตอนการเทรนและประตูตรวจสอบคุณภาพ | บทที่ 3, 3.6.6 |
| รูปที่ 3-5 | ความคืบหน้าของงานพยากรณ์ 10 ขั้น | บทที่ 3, 3.6.12 |

# คำนิยามและคำย่อ

| คำย่อ/คำศัพท์ | ความหมายเต็มและความหมายในระบบ |
|---|---|
| acc_id | Account ID — รหัสบัญชีลูกค้าองค์กรหนึ่งราย |
| AFT | Accelerated Failure Time — โมเดล regression สำหรับข้อมูล censored (วันเติมเงิน) |
| Backtest | การทดสอบย้อนหลังหลายช่วงเวลาเพื่อวัดความเสถียรของโมเดล |
| Baseline | โมเดลหรือกฎอย่างง่ายที่ใช้เทียบว่าโมเดลจริงดีกว่าแค่ไหน |
| Brier score | ค่าความคลาดเคลื่อนกำลังสองของความน่าจะเป็นที่ทำนาย |
| Calibration | การปรับความน่าจะเป็นให้ตรงกับความจริง (Platt / Isotonic) |
| Champion–Challenger | รูปแบบการคัดเลือก: โมเดลใหม่ต้องชนะโมเดลเดิมจึงขึ้น production |
| CLV | Customer Lifetime Value — มูลค่าลูกค้าในอนาคต (ระบบนี้คือรายได้ 6 เดือน) |
| Censored data | ข้อมูลที่สังเกตไม่ครบ เช่น ลูกค้ายังไม่เติมเงินภายในหน้าต่างสังเกต |
| CQR | Conformalized Quantile Regression — การขยายช่วงพยากรณ์ให้มีการรับประกันทางสถิติ |
| Cutoff | วันที่ตัดยอด — เส้นแบ่งข้อมูลอดีต (ฟีเจอร์) กับอนาคต (label) |
| Drift / PSI | การเลื่อนของการกระจายข้อมูลจากตอนเทรน วัดด้วย Population Stability Index |
| ECE | Expected Calibration Error — ค่าคลาดเคลื่อน calibration (10 bins) |
| Feature contract | ข้อกำหนดรายชื่อฟีเจอร์และสูตรของแต่ละโมเดล (tier_a_24/27/31) |
| Leakage | Data leakage — ข้อมูลอนาคตรั่วเข้าฟีเจอร์ ทำให้ผลทดสอบสูงเกินจริง |
| LightGBM / XGBoost | ไลบรารี Gradient Boosting ที่ใช้เทรนโมเดลหลัก |
| p_alive | ความน่าจะเป็นที่ลูกค้ายังใช้งานอยู่ จากโมเดล BG-NBD |
| p10–p90 | ช่วงพยากรณ์ที่ค่าจริงคาดว่าจะตกอยู่ (เปอร์เซ็นไทล์ 10–90) |
| Point-in-time (PIT) | การคำนวณฟีเจอร์จากข้อมูลก่อน cutoff เท่านั้น เพื่อกัน leakage |
| PR-AUC | พื้นที่ใต้เส้น Precision–Recall เมตริกหลักของ churn |
| SHAP | Shapley Additive Explanations — วิธีอธิบายผลโมเดลรายตัว |
| SMAPE / MAE / RMSE | ตัวชี้วัดความคลาดเคลื่อนของการถดถอย |
| Spearman | สหสัมพันธ์เชิงอันดับ เมตริกธุรกิจหลักของ CLV |
| Top-decile capture | สัดส่วนรายได้จริงที่จับได้เมื่อเลือกลูกค้า 10% บนสุด |
| Two-part model | สถาปัตยกรรม CLV: p_pay × value แยกการจ่ายออกจากมูลค่า |
| Winkler score | ตัวชี้วัดคุณภาพของช่วงพยากรณ์ (ครอบคลุม + ความกว้าง) |


---

# บทที่ 1 บทนำ

## 1.1 ความเป็นมาและความสำคัญของปัญหา

โครงงานนี้พัฒนาขึ้นสำหรับธุรกิจแพลตฟอร์มส่งข้อความแบบ B2B (SMS / Email / OTP) ลักษณะการค้าของธุรกิจคือ ลูกค้าองค์กร (ระบุด้วยรหัสบัญชี `acc_id`) จะ **เติมเครดิตแบบเหมาจ่าย (prepaid credit)** เข้าระบบครั้งล่องหนจำนวนมาก แล้วค่อย ๆ ใช้เครดิตไปเรื่อย ๆ เป็นระยะเวลาหลายเดือน ก่อนจะเติมใหม่เมื่อใกล้หมด ข้อมูลตัวอย่างของโปรเจกต์คือชุดข้อมูลของลูกค้ามหาวิทยาลัยแห่งหนึ่งในกรุงเทพฯ (`data/[1Moby] Data_example for Bangkok university.xlsx`)

ลักษณะธุรกิจแบบนี้ก่อให้เกิดปัญหาการบริหารสามข้อที่มองด้วยตาเปล่าหรือรายงานย้อนหลังแบบเดิมไม่เห็น:

**ปัญหาที่ 1 — ไม่รู้ว่าลูกค้ารายใดกำลังจะหายไป (Churn):** ลูกค้าที่เลิกใช้บริการไม่ได้แจ้งยกเลิก แต่จะค่อย ๆ ลดการใช้งานลับ ๆ จนเงียบหายไปเอง เมื่อทีมขายรู้ตัว รายได้รายเดือนจากลูกค้ารายนั้นก็หายไปแล้ว

**ปัญหาที่ 2 — ไม่รู้ว่าลูกค้ารายใดคุ้มค่าที่จะลงทุนดูแล (CLV):** การกระจายรายได้ของธุรกิจนี้เอียงอย่างรุนแรง จากการวิเคราะห์ข้อมูลจริงซึ่งบันทึกไว้ใน docstring ของ `apps/ml/src/training/clv_trainer.py` พบว่า **ราว 77% ของลูกค้าที่ยังใช้งานอยู่จะไม่สร้างรายได้เลยในอีก 6 เดือนข้างหน้า และลูกค้าเพียง 1% บนสุดสร้างรายได้ราว 63% ของทั้งหมด (สัมประสิทธิ์จีนี ≈ 0.96)** การทำนาย "รายได้อนาคตเป็นตัวเลขเดียว" จึงไม่มีความหมายในทางปฏิบัติ

**ปัญหาที่ 3 — ไม่รู้ว่าลูกค้ารายใดจะเติมเครดิตเมื่อใด (Credit Forecast):** ถ้าทำนายปริมาณการใช้เครดิตและวันเวลาที่จะเติมเงินครั้งถัดไปได้ล่วงหน้า ทีมขายจะเข้าหาลูกค้าได้ "ตรงจังหวะก่อนเงินหมด" พอดี ซึ่งเป็นจังหวะที่ลูกค้ามีแนวโน้มตัดสินใจเติมเงินสูงสุด

ระบบ **moby-analytics** จึงถูกออกแบบให้อ่านประวัติการชำระเงินและการใช้งานย้อนหลังของลูกค้าทุกราย แล้วสรุปเป็นผลลัพธ์ที่มนุษย์ใช้ตัดสินใจได้ทันที: คะแนนความเสี่ยงเลิกใช้ มูลค่าอนาคตพร้อมช่วงความไม่แน่นอน ระดับความเร่งด่วนของการเติมเครดิต คะแนนลำดับความสำคัญ และกลุ่มลูกค้า โดยแสดงผลบน Dashboard ที่ทีมธุรกิจใช้เองได้โดยไม่ต้องเขียนโปรแกรม

## 1.2 วัตถุประสงค์ของโครงงาน

1. เพื่อพยากรณ์ความน่าจะเป็นที่ลูกค้าจะเลิกใช้บริการภายใน 180 วันข้างหน้า (churn prediction)
2. เพื่อพยากรณ์รายได้รวมของลูกค้าในอีก 6 เดือนข้างหน้า (CLV) พร้อมช่วงความไม่แน่นอน p10–p90
3. เพื่อพยากรณ์ปริมาณการใช้เครดิตใน 30 และ 90 วันข้างหน้า พร้อมจำนวนวันโดยประมาณก่อนเติมเงินครั้งถัดไป
4. เพื่อแปลงผลพยากรณ์เป็นข้อเสนอเชิงธุรกิจที่มนุษย์อ่านเข้าใจได้ (revenue_at_risk, priority_score, credit urgency, segment)
5. เพื่อสร้างกระบวนการ MLOps ที่ตรวจสอบย้อนกลับได้ (reproducible): กัน data leakage, ทดสอบหลายช่วงเวลา, คัดเลือกโมเดลที่ดีที่สุดอัตโนมัติ และวัดผลจริงหลังใช้งาน

## 1.3 ขอบเขตของโครงงาน

**อยู่ในขอบเขต (in scope):**

- นำเข้าไฟล์ Excel 8 แผ่นงาน (2 แผ่นบังคับ, 6 แผ่นเสริม) ผ่านระบบ import 2 ช่องทาง (Python CLI และ API ผ่านหน้าเว็บแบบ sync/async พร้อม progress)
- เก็บข้อมูลดิบแบบ fidelity (ห้าม dedupe/แปลงข้อมูล ณ ตอน import) และทำ clean แยกชั้น
- พัฒนา ML pipeline ครบวงจร: label → ฟีเจอร์ point-in-time → split → baselines → ผู้สมัครหลายอัลกอริทึม (Optuna) → calibration → ตรวจ leakage → backtest → promotion → ลงทะเบียนโมเดล
- ชุดโมเดล 3 กลุ่ม 7 ส่วน: Churn 180 วัน, CLV two-part (p_pay + value quantile p10/p50/p90) + BG-NBD p_alive, Credit quantile 30d/90d (5 ควอนไทล์) + XGBoost AFT วันเติมเงิน
- Prediction runner ที่ตรวจ drift (PSI) รองรับ model override ต่อ run และคำนวณ derived fields เชิงธุรกิจ 10 กลุ่มลูกค้า
- REST API (Elysia) ครบทุกเส้นทาง + Better Auth (Google OAuth) + AI features (คำอธิบายรายคน, run insight, แชท Text-to-SQL แบบสตรีม)
- Dashboard Next.js 9 หน้า + ระบบวัดผลย้อนหลัง (realized outcome backfill)

**อยู่นอกขอบเขต (out of scope):**

- ระบบส่งข้อความจริง (SMS gateway) — ระบบนี้วิเคราะห์ข้อมูลเท่านั้น
- การทำนายระยะยาวเกิน 180 วัน และการแนะนำราคา/โปรโมชัน
- การ A/B test กับทีมขายจริง (เป็นงานต่อยอด)

## 1.4 ประโยชน์ที่คาดว่าจะได้รับ

- ทีมขาย/ทีมดูแลลูกค้ารู้ว่าควรติดต่อลูกค้ารายใดก่อน (priority_score 0–100 เรียงด้วย priority_rank) และควรทำอะไร (เตือนก่อนเครดิตหมด, กู้วิกฤตลูกค้ามูลค่าสูงที่กำลังจะหาย)
- ผู้บริหารเห็นภาพพอร์ตลูกค้าทั้งหมดแบบเรียลไทม์: สัดส่วนวงจรชีวิต, รายได้ที่มีความเสี่ยงรวม, ความต้องการเติมเครดิต 30 วันข้างหน้า
- ลดรายได้ที่รั่วไหลจาก churn โดยไม่ต้องรอให้ลูกค้าหายตัวก่อน
- องค์ความรู้ด้าน ML pipeline ที่กัน leakage และวัดผลอย่างซื่อสัตย์ ใช้ต่อยอดกับโจทย์อื่นได้

## 1.5 ผู้ใช้งานและบทบาท (Actors)

**ตารางที่ 1-1** ผู้ใช้งานและบทบาทในระบบ
| ผู้ใช้ | บทบาทหลัก | สิ่งที่ทำได้ในระบบ |
|---|---|---|
| นักวิเคราะห์ข้อมูล | จัดการข้อมูลและโมเดล | import Excel, เทรนโมเดล, ตั้ง champion, ลบเวอร์ชัน, backfill ผลจริง |
| ทีมขาย/CS | ใช้ผลพยากรณ์ | ดู Dashboard, ค้น/กรองลูกค้า, ดู Customer 360, export CSV, ขอคำอธิบาย AI |
| ผู้บริหาร | ตัดสินใจระดับพอร์ต | ดูภาพรวม, run insight, แชทถามข้อมูลกับ AI |

ระบบใช้โมเดลสิทธิ์แบบ **org-shared**: ผู้ใช้ที่ล็อกอินด้วย Google ทุกคนในองค์กรอ่านและจัดการข้อมูล/run/โมเดลทุกอย่างได้ (ไม่มี role) ยกเว้นบทสนทนา AI ซึ่งเป็นส่วนตัวต่อผู้ใช้ (ที่มา: `claude.md`, `apps/api/src/lib/access-control.ts`)

## 1.6 เครื่องมือและเทคโนโลยีที่ใช้

**ตารางที่ 1-2** เครื่องมือและเทคโนโลยีที่ใช้ในโครงงาน
| หมวด | เทคโนโลยี | ใช้ทำอะไร |
|---|---|---|
| Monorepo | Bun workspaces + Turborepo | รวม apps/* packages/* ไว้ในที่เดียว, build/dev/lint/typecheck/test ผ่าน turbo |
| Frontend | Next.js 16 (App Router), React 18, TypeScript, Tailwind CSS, Zustand, Recharts | Dashboard ทั้งหมด |
| Backend | Bun + Elysia 1.2, TypeBox validation | REST API |
| ORM/DB | Drizzle ORM, PostgreSQL 15 (image pgvector/pgvector:pg15) | 39 ตาราง |
| Cache/Queue | Redis 7 (ioredis) | progress stream ของ import, ระบบ async job |
| Auth | Better Auth + Google OAuth | ล็อกอิน, session 7 วัน |
| ML (Python 3.11+) | LightGBM, XGBoost, scikit-learn, Optuna, lifetimes, TabICL, SHAP, pandas/numpy, dill, SQLAlchemy, FastAPI, asyncpg | เทรนและพยากรณ์ |
| Data prep | openpyxl, PyYAML, psycopg 3 | import Excel ฝั่ง CLI |
| AI/LLM | OpenAI-compatible API หรือ Ollama (qwen3.5:397b-cloud default) | คำอธิบายลูกค้า, run insight, แชท Text-to-SQL |
| Infra | Docker Compose 5 services, GitHub Actions CI + Railway deploy | รันและ deploy |
| เอกสาร | docx (Node) | สร้างเล่มรายงานนี้ |

## 1.7 โครงสร้างของรายงาน

บทที่ 2 นำเสนอทฤษฎีและเทคนิคที่เกี่ยวข้อง บทที่ 3 นำเสนอการวิเคราะห์และออกแบบระบบทั้งหมด (สถาปัตยกรรม, ฐานข้อมูล, API, การออกแบบโมเดล, workflow) บทที่ 4 นำเสนอการพัฒนา วิธีการทดสอบ และผลการทดสอบจริง และบทที่ 5 สรุปผล ข้อจำกัด และแนวทางพัฒนาต่อ

---

# บทที่ 2 ทฤษฎีและเทคนิคที่เกี่ยวข้อง

## 2.1 การเรียนรู้ของเครื่องแบบมีผู้สอนบนข้อมูลตาราง

โจทย์ของระบบคือการเรียนรู้แบบมีผู้สอน (supervised learning) บนข้อมูลตาราง (tabular data) โดยมี label สามแบบ: การจำแนกแบบทวิภาค (churn), การถดถอยแบบมีเงื่อนไข (CLV), และการถดถอยเชิงควอนไทล์ (credit) โมเดลตระกูล Gradient Boosting เป็นมาตรฐานที่แข็งแกร่งที่สุดสำหรับข้อมูลตารางขนาดกลาง ระบบจึงใช้ LightGBM เป็นหลัก โดยมี XGBoost, Logistic Regression, Random Forest และ TabICL เป็นผู้สมัครแข่งขัน

## 2.2 Gradient Boosting: LightGBM และ XGBoost

**LightGBM** เป็น gradient boosting แบบ leaf-wise ที่โตแผนภาพไปทางใบที่ลด loss ได้มากที่สุดก่อน ทำให้เร็วและประหยัดหน่วยความจำกว่าแบบ level-wise เหมาะกับจำนวนฟีเจอร์ปานกลาง (27–31 ฟีเจอร์ในระบบนี้) รองรับ objective หลากหลาย เช่น binary (สำหรับ p_pay), quantile (สำหรับช่วงพยากรณ์) และรองรับ early stopping ด้วยชุด validation

**XGBoost** เป็นอีกหนึ่งตระกูล boosting ที่ใช้เป็นผู้สมัครแข่ง (objective `aucpr` สำหรับ churn, `reg:quantileerror` สำหรับ credit, `survival:aft` สำหรับโมเดลวันเติมเงิน) ทั้งสองตระกูลถูกหาพารามิเตอร์ด้วย **Optuna** (TPE sampler, MedianPruner) ซึ่งเป็นการค้นหาแบบ Bayesian ที่เรียนรู้จากรอบที่ผ่านมา

## 2.3 Quantile Regression และ Conformal Prediction (CQR)

การถดถอยค่าเฉลี่ยบอกแค่ "ค่ากลาง" แต่การตัดสินใจทางธุรกิจต้องการ "ช่วง" **Quantile regression** ฝึกโมเดลให้ทำนายเส้นแบ่งเปอร์เซ็นไทล์โดยตรงด้วย pinball loss เช่น p10/p25/p50/p75/p90 ทำให้ได้ช่วงพยากรณ์ (prediction interval) ที่สะท้อนความไม่แน่นอนจริง

ระบบเสริมความน่าเชื่อถือของช่วงด้วย **Conformalized Quantile Regression (CQR)**: คำนวณ conformity score `sᵢ = max(q10ᵢ − yᵢ, yᵢ − q90ᵢ)` จากชุด calibration แล้วหา `q̂ = quantile(s, (1−α)(1+1/n))` ที่ α = 0.20 แล้วขยายช่วงเป็น [p10 − q̂, p90 + q̂] ซึ่งให้การรับประกันแบบ distribution-free ว่าค่าจริงจะตกในช่วงประมาณ 80% ของเคส

อีกเทคนิคสำคัญคือการทำนายบน **log1p** แล้วแปลงกลับด้วย expm1 เพื่อจัดการการกระจายรายได้/การใช้เครดิตที่เอียงขวามาก (long tail) และการใช้ **log-ratio anchor** (ทำนายผลต่างเชิงลอการิทึมจากค่า carryover ของเดิม) เพื่อให้โมเดลเรียนรู้ "ส่วนเปลี่ยนแปลง" แทนค่าสัมบูรณ์

## 2.4 Two-Part Model สำหรับ CLV

เมื่อ label เป็นศูนย์เกือบทั้งชุด (77% ของลูกค้า active ไม่จ่ายใน 6 เดือนข้างหน้า) การถดถอยตรงจะถูกดึงไปที่ศูนย์และทำนายอะไรไม่ได้ Two-part model แยกปัญหาเป็น:

```
Expected CLV = p_pay × value_p50
```

- **ส่วนที่ 1 p_pay** = P(รายได้ 6 เดือนข้างหน้า > 0) — การจำแนกแบบทวิภาคด้วย LightGBM
- **ส่วนที่ 2 value|pay** = ถ้าจ่ายจะจ่ายเท่าไร — quantile regression บน log1p(รายได้) ฝึกเฉพาะแถวที่จ่ายจริง ที่ q = 0.10 / 0.50 / 0.90 ได้ทั้งค่ากลางและช่วงความไม่แน่นอน
- **ปรับขนาดด้วย OLS calibration**: ฟิตสมการเส้นตรง (slope, intercept) ของค่าจริงกับค่าทำนายบน validation แล้วปรับ `pred ← clip(slope × pred + intercept, 0, ∞)` เพื่อแก้ bias เชิงขนาด

## 2.5 BG-NBD และ Gamma-Gamma (โมเดลคลาสสิกของ CLV)

**BG-NBD (Beta-Geometric / Negative Binomial Distribution)** จำลองพฤติกรรม "ซื้อสลับกับเลิกซื้อ" ของลูกค้าจากสามค่า RFM: frequency (จำนวนวันจ่าย − 1), recency (ระยะห่างวันจ่ายแรกถึงวันจ่ายล่าสุด), T (อายุตั้งแต่วันจ่ายแรก) และให้ค่า **p_alive** = ความน่าจะเป็นที่ลูกค้ายัง "มีชีวิต" อยู่ **Gamma-Gamma** ประมาณมูลค่าเฉลี่ยต่อธุรกรรมจากมูลค่าเฉลี่ยที่เคยจ่าย

ในระบบนี้คู่โมเดลนี้ถูกใช้เพื่อ **สัญญาณสุขภาพ (p_alive)** และ **blend กลุ่มลูกค้ามูลค่าสูงสุด ("วาฬ")** เท่านั้น ไม่ใช้ทำนายรายได้ตรง ๆ เพราะผลทดสอบพบว่าคู่คลาสสิกทำนายลำดับมูลค่าได้แย่บนข้อมูลนี้ (Spearman เพียง 0.042 ในการแข่งขันผู้สมัครของรุ่น clv-2026.06.4 เทียบ LightGBM Tweedie 0.5295) การ fit ใช้ไลบรารี `lifetimes` โดย sweep penalizer 9 ค่าบน logspace(−4, 0) และเลือกด้วย Spearman บน validation

## 2.6 Survival Analysis และ XGBoost AFT

โจทย์ "อีกกี่วันจะเติมเงิน" มีลักษณะพิเศษ: ลูกค้าจำนวนมาก (ราว 70% ของข้อมูล) **ยังไม่เติมเงินถึงสิ้นหน้าต่างสังเกต** ข้อมูลพวกนี้เป็น "censored" — เรารู้แค่ว่าจำนวนวันจริงมากกว่าค่าที่เห็น แต่ไม่รู้ค่าจริง การเอาไปคำนวณเป็น regression ปกติจะผิด **Accelerated Failure Time (AFT)** จัดการเคสนี้ได้ถูกต้อง: แถวที่สังเกตใช้ lower = upper = จำนวนวันจริง (clip ขั้นต่ำ 0.5 วัน) ส่วนแถว censored ใช้ lower = 180 (ความยาวหน้าต่าง) และ upper = ∞ โดย XGBoost มี objective `survival:aft` พร้อม `aft-nloglik` สำหรับฝึกโมเดลลักษณะนี้โดยตรง

## 2.7 TabICL (In-Context Learning สำหรับตาราง)

TabICL เป็นโมเดล transformer ที่ทำการจำแนกแบบ in-context learning บนข้อมูลตาราง — เรียนรู้จากตัวอย่างใน context โดยไม่ต้อง gradient descent เหมาะกับชุดข้อมูลเล็ก-กลาง ระบบใช้ TabICLClassifier เป็นหนึ่งในผู้สมัคร churn (จำกัด 2000 แถวต่อการ fit ด้วยการสุ่มแบบ stratified) และเนื่องจากอธิบายผลไม่ได้โดยตรง ระบบจึงใช้ permutation importance แทน SHAP

## 2.8 การหาพารามิเตอร์ที่ดีที่สุดด้วย Optuna

Optuna ค้นหาพารามิเตอร์แบบ Bayesian ด้วย TPE (Tree-structured Parzen Estimator) sampler ระบบตั้ง seed 42 ทุกการค้นหา ใช้ MedianPruner (ตัดรอบที่แย่กว่า median ของรอบก่อน ๆ ตั้งแต่ step ที่ 10) และ optimize ตามเมตริกของแต่ละโมเดล เช่น churn: maximize validation PR-AUC 40 trials สำหรับ LightGBM

## 2.9 ตัวชี้วัดการประเมินโมเดล (ทั้งหมดที่ระบบใช้)

**การจำแนก (churn และ p_pay):**

**ตารางที่ 2-1** ตัวชี้วัดโมเดลการจำแนกแบบทวิภาค
| ตัวชี้วัด | นิยามและความหมาย |
|---|---|
| PR-AUC (Average Precision) | พื้นที่ใต้เส้น Precision–Recall เหมาะกับข้อมูลไม่สมดุล เป็นเมตริกหลักของ churn |
| ROC-AUC | ความสามารถจัดอันดับทวิภาคโดยรวม |
| Precision / Recall / F1 | ความแม่นของการ flag ที่ threshold ที่เลือก |
| recall_at_top10pct / lift_at_top10pct | จับ churner ได้กี่ % เมื่อ flag แค่ 10% บนสุด และ lift เทียบการสุ่ม |
| Brier score | ค่าความคลาดเคลื่อนกำลังสองของความน่าจะเป็น |
| BSS (Brier Skill Score) | = 1 − Brier/(p(1−p)) เทียบกับการทายด้วยอัตราฐาน |
| ECE / MCE | ความคลาดเคลื่อนของ calibration (10 bins) — เพดานระบบ 0.05–0.10 |
| Hosmer–Lemeshow | ทดสอบ goodness-of-fit ของ calibration 10 กลุ่ม (p > 0.05 = ผ่าน) |

**การถดถอย (CLV และ credit):**

**ตารางที่ 2-2** ตัวชี้วัดโมเดลการถดถอยและช่วงพยากรณ์
| ตัวชี้วัด | ความหมาย |
|---|---|
| Spearman correlation | ลำดับถูกไหม — เมตริกธุรกิจสำคัญที่สุดของ CLV เพราะใช้ "จัดอันดับว่าใครควรดูแลก่อน" |
| MAE / RMSE / RMSLE / SMAPE | คลาดเคลื่อนเฉลี่ยเป็นบาท (RMSLE/SMAPE เหมาะกับค่าสเกลใหญ่ต่างกันมาก) |
| top_decile_capture | เลือก 10% บนสุดตามโมเดล จับได้กี่ % ของรายได้จริงทั้งหมด |
| revenue_bias_ratio | = total_predicted / total_actual — โมเดลพอร์ตต้องไม่ฟอกเงินรวมเกินจริง |
| range_coverage | สัดส่วนแถวที่ค่าจริงตกในช่วง [p10, p90] |
| pinball loss (ต่อควอนไทล์) | loss ของ quantile regression |
| Winkler score (α = 0.20) | คุณภาพช่วง p10–p90 รวมทั้งความกว้างและการครอบคลุม |
| coverage_p10_p90 | ค่าจริงตกในช่วงกี่ % (เป้าหมาย 0.75–0.90) |

**การตรวจข้อมูลขณะให้บริการ:**

**ตารางที่ 2-3** ตัวชี้วัดตรวจความเสถียรขณะให้บริการ
| ตัวชี้วัด | ความหมาย |
|---|---|
| PSI (Population Stability Index) | วัดการเลื่อนของการกระจายฟีเจอร์จากตอนเทรน: ≥ 0.10 เล็กน้อย, ≥ 0.25 รุนแรง (10 bins + Laplace ε=1e-6) |

## 2.10 การปรับ Calibration ของความน่าจะเป็น

โมเดล boosting มักให้ความน่าจะเป็นที่ไม่ "ซื่อสัตย์" (ค่า 0.7 ไม่ได้แปลว่าจะเกิดจริง 70%) ระบบจึงปรับด้วยสองวิธีแล้วเลือกอัตโนมัติ: **Platt scaling** (LogisticRegression บนคะแนนดิบ — ค่า default) และ **Isotonic regression** (เส้นโค้งอิสระแบบ monotonic — ใช้ได้เมื่อมี positive ≥ 200 ตัวอย่างบน OOF และดีกว่าด้วย ECE > 0.005 หรือเท่ากันแต่ Brier ดีขึ้น ≥ 2%)

## 2.11 Point-in-Time Correctness และ Data Leakage

**Leakage** คือการที่ข้อมูลอนาคตหลุดเข้าไปในฟีเจอร์ ทำให้คะแนนทดสอบสูงลม ๆ แต่ใช้จริงพัง ระบบป้องกัน 3 ชั้น: (1) ฟีเจอร์ทุกตัวคำนวณจากข้อมูล **ก่อน cutoff เท่านั้น** และห้ามใช้ snapshot fields (เช่น credit_sms คงเหลือตอน export) (2) **split แบบระดับบัญชี** — ลูกค้าหนึ่งคนต้องอยู่ฝั่งเดียว (train/val/test) เท่านั้น (3) **leakage suite 5 รายการ** รันตรวจทุกการเทรน (รายละเอียดใน 3.6.8)

## 2.12 Champion–Challenger และ Model Registry

ทุกการเทรนคือ challenger ที่ต้อง "ชนะ" champion ปัจจุบันจึงจะขึ้น production — หลักการนี้ทำให้ production ไม่มีวันแย่ลงโดยไม่รู้ตัว ระบบเก็บทุกเวอร์ชันในตาราง registry (model versions, aliases, activation history) มี unique constraint ให้แต่ละ model_type มี champion active ได้แค่ตัวเดียว ใช้ PostgreSQL advisory lock กัน race ในการ promote และบันทึก audit trail ทุกการเปลี่ยน

## 2.13 Generative AI แบบมีหลักฐาน (Grounded Generation)

ระบบใช้ LLM สามจุด ทุกจุดผ่าน "หลักฐานดีเทอร์มินิสติก" ไม่ปล่อยให้ LLM เดา: (1) **คำอธิบายรายลูกค้า** — ป้อนสัญญาณคำนวณแล้ว + SHAP factors + ผลโมเดล ให้ LLM เรียบเรียง (temperature 0.2, prompt ภาษาไทย, ตรวจว่าห้ามออกปีพุทธศักราช) (2) **Run insight** — ป้อนสรุปสถิติรวมของ run (3) **แชท Text-to-SQL** — agent แปลงคำถามเป็น SQL รันบนฐานจริง (จำกัด 3 ครั้งแก้ตัวเอง, อนุญาตเฉพาะตารางที่กำหนด) แล้วตอบโดยอ้าง evidence

## 2.14 เทคโนโลยีสแตกของระบบเว็บ

Next.js App Router (Server Components + Client Components), Elysia (เว็บเฟรมเวิร์กบน Bun runtime ที่เร็วมาก พร้อม TypeBox validation), Drizzle ORM (type-safe SQL), Redis Stream (progress แบบ event), Better Auth (ไลบรารี auth ที่เป็นเจ้าของ schema เอง), Turborepo (build orchestration แบบ cache), Docker Compose (orchestration 5 services)

---

# บทที่ 3 การวิเคราะห์และออกแบบระบบ

## 3.1 ภาพรวมระบบและกระแสงานหลัก

ระบบมี 4 กระแสงานหลัก (workflow) ดังแสดงในรูปที่ 3-1:

```
งานที่ 1: นำเข้าข้อมูล   Excel 8 sheets ──▶ import (raw) ──▶ clean ──▶ ready (source)
งานที่ 2: เทรนโมเดล     train source ready ──▶ gates ──▶ เทรน 3 กลุ่มโมเดล ──▶ backtest
                        ──▶ promotion gate ──▶ ลง registry ──▶ champion (production)
งานที่ 3: พยากรณ์        predict source ready ──▶ auto-run ──▶ drift check ──▶ โหลด champion
                        ──▶ พยากรณ์ 3 กลุ่ม ──▶ derived fields ──▶ เก็บ outputs ──▶ Dashboard
งานที่ 4 (ต่อเนื่อง): วัดผลจริง  run ที่ผ่าน horizon ──▶ backfill ผลจริง ──▶ production_holdout
```
**รูปที่ 3-1** กระแสงานหลัก (workflow) ของระบบ

## 3.2 สถาปัตยกรรมระบบ

### 3.2.1 แผนภาพสถาปัตยกรรม

สถาปัตยกรรมทางกายภาพของระบบแสดงดังรูปที่ 3-2

```
┌──────────────────┐    /api/* (Next proxy)   ┌──────────────────┐   SQL    ┌────────────────────┐
│  web :3000       │ ───────────────────────▶ │  api :3001       │ ───────▶ │  db                │
│  Next.js 16      │                          │  Bun + Elysia    │          │  PostgreSQL 15     │
│  Dashboard       │ ◀── SSE (AI chat) ────── │  Drizzle + Redis │          │  (image pgvector)  │
└──────────────────┘                          └────────┬─────────┘          │  port 5433         │
                                                       │ POST /internal/*   └────────────────────┘
                                                       │ header x-internal-token
                                                       ▼
                                              ┌──────────────────┐   spawn    ┌─────────────────────┐
                                              │  ml :8001→8000   │ ─────────▶ │ subprocess          │
                                              │  FastAPI v6.0    │            │ python -m src.cli.* │
                                              │  (internal only) │            └─────────────────────┘
                                              └────────┬─────────┘
                                                       │ อ่าน/เขียน
                                                       ▼
                                          ┌───────────────────────────────┐
                                          │  /models volume (shared)      │
                                          │  models/{type}/{version}/*    │
                                          └───────────────────────────────┘
```
**รูปที่ 3-2** สถาปัตยกรรมระบบ moby-analytics

### 3.2.2 บริการย่อยแต่ละตัว

**ตารางที่ 3-1** บริการย่อยของระบบและเทคโนโลยีที่ใช้
| บริการ | เทคโนโลยี | พอร์ต | หน้าที่ |
|---|---|---|---|
| web | Next.js 16, React 18, Tailwind, Zustand, Recharts, Better Auth client | 3000 | Dashboard 9 หน้า, proxy /api/* ไป api |
| api | Bun + Elysia 1.2, Drizzle, ioredis, better-auth, SheetJS | 3001 | REST API, import Excel, จุดชนวน ML job, AI orchestrator |
| ml | Python 3.11+, FastAPI v6.0, LightGBM/XGBoost/Optuna/lifetimes/TabICL/SHAP | 8000 (map 8001) | internal API + เทรน/พยากรณ์ผ่าน subprocess |
| db | pgvector/pgvector:pg15 | 5433 | 39 ตาราง, bootstrap จาก db/init/001_schema.sql |
| redis | redis:7-alpine | (internal) | progress stream ของ import |

ทุกบริการมี healthcheck (db: `pg_isready`, redis: `redis-cli ping`, ml: GET /health ทุก 5 วินาที) และใช้ env รวมจากไฟล์ .env (ที่มา: `docker-compose.yml`)

### 3.2.3 รูปแบบการสั่งงาน ML (Job Trigger Pattern)

API **ไม่เทรน/ไม่พยากรณ์เอง** ขั้นตอนคือ: (1) API insert แถว run ลง Postgres สถานะ `pending` (2) API ยิง `POST /internal/training-runs` หรือ `/internal/prediction-runs` ไปที่ ML พร้อม header `x-internal-token` (เทียบด้วย `hmac.compare_digest`, timeout 30 วินาที) (3) ML spawn **detached subprocess** (`start_new_session=True`) รัน `python -m src.cli.train --training-run-id <uuid>` (4) subprocess ตัวนี้อัปเดตสถานะ/progress ลงตาราง run เองทุกขั้น และเขียน artifact ลง `/models` ซึ่งเป็น volume ที่ api กับ ml mount ร่วมกัน (5) ถ้า ML trigger ล้ม จะ mark run เป็น `failed` ทันที

มี **Stale Run Reaper** ทำงานทุก 5 นาที: run ที่ค้าง `pending`/`in_progress` เกิน 120 นาที (STALE_RUN_TIMEOUT_MINUTES) จะถูก mark `failed` อัตโนมัติ (ที่มา: `apps/api/src/lib/run-reaper.ts`)

## 3.3 กระแสข้อมูลจากต้นจนจบ (End-to-End Data Flow)

กระแสข้อมูลทั้งหมดตั้งแต่ไฟล์ต้นฉบับจนถึงการวัดผลจริงแสดงดังรูปที่ 3-3

```
ไฟล์ Excel 8 sheets (ลูกค้า, การจ่าย, การใช้ 6 ช่องทาง)
  ▼ 1. Import (raw): เก็บทุกแถวเป็น JSONB ตาม excel_row + checksum SHA-256
{train|predict}_raw_sheet_*  (8 ตารางต่อฝั่ง)
  ▼ 2. Clean: แปลงชนิดข้อมูล, แยก channel/usage_source, drop payment ที่ไม่มีวันที่
{train|predict}_clean_customers / _payments / _usage
  ▼ 3. Gate ตรวจคุณภาพ 5 ด่าน (readiness, schema, cutoff feasibility, label viability, PIT leakage)
  ▼ 4. Label + Features: สร้าง label จากอนาคต + ฟีเจอร์ 31 ตัวแบบ point-in-time ณ cutoff
  ▼ 5. เทรน: split 60/20/20 → baselines → ผู้สมัคร (Optuna) → calibration → leakage suite
      → adaptive multi-cutoff backtest → promotion two-stage → artifact + registry
  ▼ 6. ให้บริการ: predict source → ฟีเจอร์ชุดเดียวกัน → PSI drift → champion (หรือ override)
      → พยากรณ์ 3 กลุ่ม → derived fields → ml_prediction_outputs (1 แถว/ลูกค้า)
  ▼ 7. Dashboard: summary + outputs + Customer 360 + AI explanation
  ▼ 8. วัดผลจริง: backfill_outcomes เมื่อ horizon ผ่านไป → ml_model_evaluations (production_holdout)
```
**รูปที่ 3-3** กระแสข้อมูลตั้งแต่ไฟล์ต้นฉบับจนถึงการวัดผลจริง

## 3.4 การออกแบบฐานข้อมูล

### 3.4.1 ภาพรวม 39 ตาราง

**ตารางที่ 3-2** ภาพรวมตารางทั้ง 39 ตารางในฐานข้อมูล
| กลุ่ม | ตาราง | จำนวน |
|---|---|---|
| ยืนยันตัวตน (Better Auth) | `user`, `account`, `session`, `verification` | 4 |
| นำเข้าข้อมูลฝั่ง train | `train_data_sources` + `train_raw_sheet_*` ×8 + `train_clean_customers/payments/usage` | 12 |
| นำเข้าข้อมูลฝั่ง predict | `predict_data_sources` + `predict_raw_sheet_*` ×8 + `predict_clean_customers/payments/usage` | 12 |
| งาน (runs) | `ml_training_runs`, `ml_prediction_runs` | 2 |
| ผลลัพธ์ | `ml_prediction_outputs` | 1 |
| รีจิสทรีโมเดล | `ml_model_versions`, `ml_feature_sets`, `ml_model_aliases`, `ml_model_activation_history`, `ml_model_evaluations` | 5 |
| AI chat | `ai_conversations`, `ai_messages` | 2 |
| อื่น ๆ | `ml_data_validation_reports` | 1 |

ข้อสังเกตสำคัญจากสคีมาจริง: ทั้ง 39 ตารางมี PK; มี unique constraint 9 จุด รวมถึง **partial unique index** `uq_ml_model_versions_one_active_per_type` (UNIQUE(model_type) WHERE is_active = true) ซึ่งบังคับที่ database level ว่าแต่ละชนิดโมเดลมี champion ได้ตัวเดียว; FK ทั้งหมด 35 เส้น; ดัชนี btree เพิ่มเติม 76 ตัว; **ไม่มี enum type** — ใช้ text + CHECK (เช่น import_status ∈ pending/importing/cleaning/ready/failed); `ai_messages.role` มี CHECK user/assistant

### 3.4.2 กลุ่มตารางนำเข้าข้อมูล (raw + clean แยกฝั่ง train/predict)

หลักการตั้งชื่อ: `{purpose}_{layer}_{entity}` เช่น `train_raw_sheet_sms_usage_bc` ห้ามแชร์ตาราง raw ระหว่าง train กับ predict เด็ดขาด (ที่มา: `moby-data-prep/docs/naming-convention.md`)

**ตาราง catalog — `train_data_sources` / `predict_data_sources` (คอลัมน์เหมือนกัน):** `id` (uuid PK), `name`, `client_label`, `original_filename`, `file_checksum_sha256` (SHA-256 ของไฟล์), `file_size_bytes`, `import_status` (CHECK 5 ค่า), `imported_at`, `sheet_manifest` (jsonb — จำนวนแถวต่อ sheet), `notes`, `error_message`, `imported_by`, `created_at`, `clean_manifest` (jsonb — `{raw, clean:{customers,payments,usage}, skipped, warnings}`), `cleaned_at`

**ตาราง raw — `*_raw_sheet_*` ทั้ง 16 ตารางมีโครงเดียวกัน:** `id` (bigserial PK), `source_id` (FK CASCADE ไป catalog), `excel_row` (เลขแถวจริงใน Excel, แถวแรกของข้อมูล = 2), `row_payload` (jsonb — เซลล์ทั้งแถว key ด้วยชื่อหัวคอลัมน์ที่ trim แล้ว), `imported_at` — วันที่เก็บเป็น `{"_excel": "datetime", "iso": "...", "serial": 46055.31}` เพื่อเก็บทั้งค่ามนุษย์อ่านได้และ serial ดิบ

**ตาราง clean — `*_clean_customers`:** `acc_id`, `status_sms`, `credit_sms` (numeric), `credit_email`, `expire_sms` (date), `expire_email`, `status_email`, `join_date`, `last_access`, `last_send` + lineage (`excel_row`, `raw_row_id`)

**`*_clean_payments`:** `acc_id`, `payment_uid`, `payment_date` (NOT NULL — แถวไม่มีวันที่ถูก drop ตอน clean), `amount`, `credit_add`, `credit_type` + lineage

**`*_clean_usage`:** `acc_id`, `year`, `month`, `usage`, `channel` (sms/email, NOT NULL), `usage_source` (bc/api/otp, NOT NULL) + lineage — รวม 6 sheet การใช้งานเข้าตารางเดียว

### 3.4.3 ตารางงานและผลลัพธ์

**`ml_training_runs`:** `id`, `source_id`, `run_type` (default initial_train), `status` (pending/in_progress/completed/failed), `started_at`, `finished_at`, `cutoff_date` (NOT NULL), `horizon_days` (NOT NULL), `training_config_json` (cutoff, seed 42, รายการ backtest cutoffs ฯลฯ), `progress_json` ({phase, pct}), `results_json` (ผลต่อโมเดล 3 แถว), `parent_training_run_id` (self-FK — สายพันธุ์การ retrain), `notes`, `error_message`, `created_by` (FK user)

**`ml_prediction_runs`:** `id`, `name`, `predict_source_id`, `status`, `cutoff_date`, `started_at/finished_at`, `total_customers`, `progress_json`, `model_versions_json` (เวอร์ชันที่ใช้จริง), `cohort_insight_json` (cached AI insight ของ run), `model_overrides_json` (override champion ต่อ run: `{"churn": "<version_id>", ...}`), `error_message`, `created_by`

**`ml_prediction_outputs` (ผลต่อลูกค้า 1 ราย — 40 คอลัมน์, UNIQUE(prediction_run_id, acc_id)):** ข้อมูลพยากรณ์ churn (`churn_probability` numeric(5,4), `churn_risk_level`, `churn_factors_json` — SHAP top-5), CLV (`predicted_clv_6m` numeric(14,2), `clv_pay_probability`, `clv_forecast_interval_json` {p10,p50,p90}, `p_alive`), มูลค่า (`customer_value_tier`, `revenue_at_risk`), เครดิต (`predicted_credit_usage_30d/90d`, `credit_forecast_interval_json` {p10_30d,p90_30d,p10_90d,p90_90d}, `estimated_days_until_topup`, `credit_urgency_level`), พฤติกรรม (`lifecycle_stage`, `sub_stage`, `usage_trend`, `days_since_last_activity`, `n_purchases`, `total_revenue`, `avg_transaction_value`, `ever_paid`), การคัดลำดับ (`priority_score`, `priority_rank`, `segment`, `needs_review`), AI (`ai_explanation`, `ai_reasoning_json`, `ai_model`, `ai_generated_at`, `ai_status`), ความถูกต้อง (`output_status` predicted/partial/insufficient_data, `output_notes`, `model_eligibility_json`, `model_versions_json`, `profile_snapshot_json`) — มีดัชนีแยกทุกฟิลด์ที่ใช้กรอง/เรียง (churn_risk_level, lifecycle_stage, priority_score, segment, value_tier, urgency, needs_review)

### 3.4.4 ตารางรีจิสทรีโมเดล

**`ml_model_versions`:** `model_type` (churn/clv/credit), `version` (รูปแบบ `{type}-YYYY.MM.{seq}`), UNIQUE(model_type, version), `status` (default candidate), `artifact_path` (เก็บแบบ relative กับ MODEL_DIR จึง resolve ข้าม container ได้), `artifact_checksum` (SHA-256 ของ model.pkl), `metrics_json`, `validation_metrics_json`, `test_metrics_json`, `feature_names_json`, `label_definition_json`, `training_data_snapshot_json`, `model_card_json`, `is_active`, `activated_at`, `deactivated_at`, FK ไป training_run และ feature_set

**`ml_feature_sets`:** ชื่อ+เวอร์ชัน+model_type (UNIQUE ร่วม), `feature_names_json`, `feature_schema_json`, `transform_config_json`, `feature_code_hash` — เป็นแหล่งความจริงของ contract ฟีเจอร์

**`ml_model_aliases`:** UNIQUE(model_type, alias) — alias `production` ชี้ champion ปัจจุบัน **`ml_model_activation_history`:** audit log action ∈ promote/manual_override/delete/clear_production/auto_promote/auto_repoint **`ml_model_evaluations`:** เก็บ metrics ทุกชนิด (holdout validation/test, per-cutoff backtest, baselines, production_holdout) พร้อม `confusion_matrix_json`, `calibration_json`, `lift_table_json`, `feature_importance_json`, `error_analysis_json`, `business_metrics_json`

**`ml_data_validation_reports`:** รายงานตรวจทุกชนิด (validation_type = leakage/drift/realized_outcome/output_postcheck/readiness/schema/cutoff/label) เก็บ `stats_json`, `anomalies_json`, `drift_json` โยงไป run/source ได้

### 3.4.5 ตาราง AI

`ai_conversations` (ต่อ user, ผูก run ได้, title, archived) และ `ai_messages` (role CHECK user/assistant, content, `evidence_json` — หลักฐาน SQL/แถวที่ใช้ตอบ, model) — หมายเหตุ: Docker image เป็น pgvector แต่สคีมาปัจจุบันยังไม่ใช้คอลัมน์ embedding; AI ทำงานแบบ Text-to-SQL ดึงข้อมูลจริงจากตาราง ไม่ใช่ RAG เวกเตอร์

## 3.5 การออกแบบ API (REST ครบทุกเส้นทาง)

### 3.5.1 ข้อตกลงทั่วไป

- Base: Elysia บน Bun, พอร์ต 3001, CORS ตาม `ALLOWED_ORIGINS`, ขนาดไฟล์อัปโหลดสูงสุด 1 GiB, idle timeout ไม่จำกัด (รอ import ยาว)
- Auth: Better Auth session cookie (`credentials: include`) — ทุกเส้นทางต้องล็อกอิน (`requireUser` → 401) ยกเว้น `/health`
- Validation: TypeBox ทุก body/param/query + regex UUID และ YYYY-MM-DD
- รูปแบบ error: `401` ไม่ล็อกอิน, `400` validation/เงื่อนไข, `404` ไม่พบ, `409` conflict (พร้อม error_code เช่น `model_in_use_by_predictions`), `413` ไฟล์เกิน, `504 IMPORT_TIMEOUT` (10 นาที), `502` ML upstream fail, `503` LLM ยังไม่ตั้งค่า

### 3.5.2 ตาราง endpoint ทั้งหมด (ฝั่ง api)

**ตารางที่ 3-3** รายการ endpoint ทั้งหมดฝั่ง api
| Method + Path | หน้าที่ | หมายเหตุสำคัญ |
|---|---|---|
| GET /health | ตรวจระบบ (public) | — |
| GET /train-data-sources/ | รายการ train source | เรียก releaseStaleImports ก่อน |
| GET /train-data-sources/:id | ดู source เดียว | — |
| GET /train-data-sources/:id/import/progress | progress import async | อ่าน Redis stream `train-import:{id}`; DB state ชนะ Redis |
| GET /train-data-sources/:id/suggested-cutoff | เสนอ cutoff เทรน | = จุดตัดเดือน ที่ MAX(activity) − 180 วัน |
| DELETE /train-data-sources/:id | ลบ source | cascade ลบ raw+clean |
| POST /train-data-sources/import | import แบบ sync | multipart file+name; import raw → clean ในงานเดียว |
| POST /train-data-sources/import/async | import แบบ async | คืนทันที, progress ผ่าน Redis, TTL 1 ชม. |
| GET /predict-data-sources/ , /:id | รายการ predict source | — |
| GET /predict-data-sources/:id/suggested-cutoff | เสนอ cutoff พยากรณ์ | = จุดตัดเดือน ของ latest activity + 1 วัน |
| POST /predict-data-sources/import | import predict | มี `auto_run` — default สร้าง prediction run อัตโนมัติทันที |
| GET /training-runs/ , /:id | ดูงานเทรน | — |
| POST /training-runs/ | สร้าง+จุดชนวนเทรน | body: train_source_id, cutoff_date?, horizon_days?=180; ตรวจ Gate 3 (history ≥ cutoff−180d และ label ครบถึง cutoff+horizon); cutoff ต้องลงท้าย -01 |
| DELETE /training-runs/:id | ลบงานเทรน | ห้ามถ้ากำลังรัน (409); เรียก ML repoint-production / model-delete ก่อนลบเพื่อไม่ทิศ orphan |
| GET /prediction-runs/ , /:id | ดูงานพยากรณ์ | — |
| POST /prediction-runs/ | สร้าง+จุดชนวนพยากรณ์ | body: predict_source_id, name, cutoff_date?, model_overrides? {churn,clv,credit} |
| POST /prediction-runs/:id/retry | รันซ้ำ | เฉพาะ run ที่ failed |
| DELETE /prediction-runs/:id | ลบ run | — |
| GET /prediction-runs/:id/outputs | รายการลูกค้า | pagination + filter 9 ชนิด + sort whitelist + search acc_id |
| GET /prediction-runs/:id/outputs/:acc_id | ลูกค้า 1 ราย | — |
| GET /prediction-runs/:id/summary | สรุปสำหรับ Dashboard | lifecycle mix, by_risk, revenue (expected_at_risk, monthly_actual 12 เดือน), value_risk_matrix, credit demand, top 10 priority, เวอร์ชันโมเดลที่ใช้ |
| GET /prediction-runs/:id/customers/:acc_id/usage-monthly | การใช้งานรายเดือนรายคน | sms/email × bc/api/otp |
| GET /prediction-runs/:id/customers/:acc_id/payments | ประวัติจ่ายรายคน | — |
| POST .../outputs/:acc_id/ai-explanation | สร้างคำอธิบาย AI รายคน | 409 ถ้ามีอยู่แล้วไม่ force; LLM temp 0.2 + guardrail |
| GET /prediction-runs/:id/insight | อ่าน insight cached | — |
| POST /prediction-runs/:id/insight | สร้าง run insight | ต้อง completed; cache ลง cohort_insight_json |
| GET /prediction-runs/:id/realized-outcomes | ผลจริงย้อนหลัง | จาก ml_model_evaluations (production_holdout) |
| GET /model-performance/ | การ์ดโมเดลทุกชนิด | method, algorithm, primary_metric + baseline, splits, competition, thresholds, calibration, confusion, lift, realized |
| GET /model-performance/:type/versions | เวอร์ชันทั้งหมดของชนิด | สำหรับ picker/override |
| POST /model-performance/:type/activate | ตั้ง champion เอง | proxy → ML /internal/model-activate (action manual_override) |
| DELETE /model-performance/:type/versions/:id | ลบเวอร์ชัน | 409 ถ้าเป็น champion หรือถูก run อ้างอิง |
| POST /outcome-backfill/ | จุดชนวนวัดผลจริง | body: prediction_run_id?, force? |
| GET /ai-chat/config | สถานะ LLM | {configured, provider: openai|ollama, model} |
| GET/POST /ai-chat/conversations , GET/PATCH/DELETE /:id | จัดการบทสนทนา | เฉพาะของผู้ใช้ตัวเอง |
| POST /ai-chat/conversations/:id/messages | ส่งข้อความ | ตอบแบบ **SSE stream**: thinking → token → evidence → title → done/error |

### 3.5.3 Internal ML endpoints (FastAPI v6.0, ป้องกันด้วย x-internal-token)

**ตารางที่ 3-4** internal ML endpoints (ป้องกันด้วย x-internal-token)
| Endpoint | ทำอะไร |
|---|---|
| GET /health | ตรวจ DB (SELECT 1) + models_dir |
| POST /internal/training-runs | spawn `src.cli.train --training-run-id` |
| POST /internal/prediction-runs | spawn `src.cli.predict --prediction-run-id` |
| POST /internal/outcome-backfill | spawn `src.cli.backfill_outcomes` (หนึ่ง run หรือทั้งหมด) |
| POST /internal/model-activate | เปลี่ยน champion แบบ synchronous (action manual_override) |
| POST /internal/repoint-production-for-training-run | ย้าย champion ที่ผูกกับ run ที่กำลังจะลบ ไปเวอร์ชันก่อนหน้าอัตโนมัติ |
| POST /internal/model-delete | ลบ artifact บนดิสก์ + registry แถวเดียวใน transaction |

## 3.6 การออกแบบระบบ Machine Learning

### 3.6.1 ภาพรวมชุดโมเดล — 3 กลุ่ม, 7 โมเดลย่อย

**ตารางที่ 3-5** ภาพรวมชุดโมเดลทั้ง 3 กลุ่ม 7 โมเดลย่อย
| # | โมเดล | ชนิด | ทำนายอะไร | อัลกอริทึม | เมตริกชนะ |
|---|---|---|---|---|---|
| 1 | Churn 180 วัน | จำแนกทวิภาค | โอกาสเงียบหาย 180 วัน | เลือกจาก Logistic Regression / LightGBM / TabICL (+XGBoost, RandomForest ตั้งค่าเพิ่มได้) | PR-AUC |
| 2 | CLV ส่วน p_pay | จำแนกทวิภาค | โอกาสจะมีรายได้ 6 เดือน > 0 | LightGBM binary | (องค์ประกอบ clv_composite) |
| 3 | CLV ส่วน value | quantile regression | ถ้าจ่ายจะจ่ายเท่าไร (p10/p50/p90) | LightGBM quantile บน log1p | (องค์ประกอบ clv_composite) |
| 4 | p_alive (สุขภาพลูกค้า) | โมเดลสถิติ | ความน่าจะเป็นลูกค้ายังอยู่ | BG-NBD + Gamma-Gamma (lifetimes) | validation Spearman (เลือก penalizer) |
| 5 | Credit 30 วัน | quantile regression | การใช้เครดิต 30 วัน p10–p90 | LightGBM quantile (XGBoost แข่งได้) | coverage_p10_p90 |
| 6 | Credit 90 วัน | quantile regression | การใช้เครดิต 90 วัน p10–p90 | เดียวกัน | coverage_p10_p90 |
| 7 | วันเติมเงินถัดไป | survival (censored) | จำนวนวันก่อนเติมเงิน | XGBoost AFT | urgent-F2 (บน validation) |

หนึ่งการเทรนจึงผลิต 3 เวอร์ชัน registry (churn, clv, credit) โดย clv/credit artifact บรรจุหลายโมเดลย่อยใน bundle เดียว

### 3.6.2 การนิยาม Label (ทั้ง 4 ตัว)

ทั้งหมดคำนวณแบบ point-in-time จาก `apps/ml/src/training/labels.py`:

**ตารางที่ 3-6** การนิยาม label ทั้งสี่ตัว
| Label | ประชากร (eligible) | นิยาม |
|---|---|---|
| churn_label | มีกิจกรรมใน [cutoff−180d, cutoff) **และเคยจ่ายเงิน** | = 1 ถ้าไม่มีทั้งจ่ายและใช้งานบวกใน [cutoff, cutoff+180d) |
| future_revenue_6m | มีกิจกรรมใน 180 วันก่อน cutoff | ผลรวม amount ใน 180 วันถัดไป (ไม่มี = 0); future_purchase_flag = >0 |
| future_credit_usage_30d/90d | ลูกค้าทุกคนที่รู้จัก (customer sheet ∪ มีกิจกรรมก่อน cutoff) | ผลรวม usage ใน 30/90 วันถัดไป (ไม่มี = 0) |
| days_until_next_topup | เช่นเดียวกัน | วันแรกที่จ่าย ≥ cutoff ลบด้วย cutoff; ถ้าไม่จ่ายถึงสิ้นหน้าต่าง = censored (topup_observed = False) |

กิจกรรม (activity) นิยามเป็น: มีการชำระเงิน (payment_date) **หรือ** มีการใช้งานบวก (usage > 0)

### 3.6.3 การสร้างฟีเจอร์ — ตัวปัจจัยทั้งหมด 31 ตัว (แกนกลางของการคำนวณ)

โค้ด: `apps/ml/src/training/features.py` (1,237 บรรทัด) ผลิต superset 31 ฟีเจอร์แล้วให้แต่ละโมเดลเลือกใช้ตาม contract:

**ตารางที่ 3-7** ชุดฟีเจอร์ (feature contract) สามระดับ
| Contract | ชื่อ feature set | จำนวน | ใช้กับ |
|---|---|---|---|
| ฐาน | tier_a_27/v1 | 27 | Churn, CLV |
| เครดิต | tier_a_31/v1 | 31 (ฐาน + 4 เฉพาะเครดิต) | Credit |
| เดิม (รุ่นแรก) | tier_a_24/v1 | 24 | clv-2026.06.4 และโมเดลรุ่น 2026.06 ที่ยังเก็บอยู่ |

**กลุ่ม A — ตัวตนและความสด (4 ตัว):**

**ตารางที่ 3-8** ฟีเจอร์กลุ่ม A — ตัวตนและความสด (4 ตัว)
| ฟีเจอร์ | สูตร / ความหมาย |
|---|---|
| customer_age_days | cutoff − join_date (nullable) |
| days_since_last_activity | cutoff − max(payment_date ∪ วันที่ usage>0) |
| days_since_last_payment | cutoff − วันจ่ายล่าสุด |
| days_since_last_usage | cutoff − วันใช้งานจริงล่าสุด |

**กลุ่ม B — พฤติกรรมการจ่าย (8 ตัว):**

**ตารางที่ 3-9** ฟีเจอร์กลุ่ม B — พฤติกรรมการจ่ายเงิน (8 ตัว)
| ฟีเจอร์ | สูตร / ความหมาย |
|---|---|
| payment_count_all | จำนวนครั้งจ่ายตลอดประวัติ |
| payment_count_180d | จำนวนครั้งจ่ายใน 180 วันล่าสุด |
| total_revenue_all / total_revenue_180d | รายได้รวม / รายได้ 180 วัน |
| avg_transaction_value | เฉลี่ยยอดต่อครั้ง |
| payment_interval_mean_days | ระยะห่างเฉลี่ยระหว่างวันจ่ายติดกัน (ต้องมี ≥ 2 ครั้ง) |
| payment_overdue_ratio | days_since_last_payment ÷ payment_interval_mean_days — "เกินรอบจ่ายตัวเองมาแค่ไหน" |
| payment_amount_cv | std(amount) ÷ mean(amount) — ยอดจ่ายแกว่งแค่ไหน (NaN เมื่อจ่าย < 2 ครั้ง) |

**กลุ่ม C — พฤติกรรมการใช้งาน (8 ตัว):**

**ตารางที่ 3-10** ฟีเจอร์กลุ่ม C — พฤติกรรมการใช้งาน (8 ตัว)
| ฟีเจอร์ | สูตร / ความหมาย |
|---|---|
| usage_total_180d / usage_recent_90d / usage_prev_90d | ผลรวมการใช้ (180 วัน / 90 วันล่าสุด / 90 วันก่อนหน้า) |
| usage_change_90d_pct | signed_log1p((recent−prev)/|prev|) — +1 ถ้าเพิ่งเริ่มใช้; ใช้ signed log เพื่อบีบหางไม่ต้องตั้งพารามิเตอร์ |
| usage_decay_ratio | signed_log1p(recent/|prev|) — ต่ำกว่า 0 แปลว่าใช้ลดลง |
| usage_slope_6m | ความชัน OLS ของ usage รายเดือน 6 เดือนจบก่อน cutoff (เดือนที่หาย reindex เป็น 0) |
| usage_active_months_180d | จำนวนเดือนที่มี usage > 0 ในหน้าต่าง 180 วัน |
| usage_consistency_ratio | active_months ÷ จำนวนเดือนจริงในหน้าต่าง (คำนวณจากปฏิทิน ไม่ fix ที่ 6) |

**กลุ่ม D — โครงสร้างช่องทาง (7 ตัว):**

**ตารางที่ 3-11** ฟีเจอร์กลุ่ม D — โครงสร้างช่องทาง (7 ตัว)
| ฟีเจอร์ | สูตร / ความหมาย |
|---|---|
| sms_usage_share / email_usage_share | สัดส่วนการใช้ตาม channel (sms/email) ต่อรวมทั้งประวัติก่อน cutoff |
| bc_usage_share / api_usage_share / otp_usage_share | สัดส่วนตาม usage_source |
| channel_hhi | sms_share² + email_share² (Herfindahl — ใช้ช่องเดียว ≈ 1) |
| multichannel_flag | 1 ถ้าใช้ทั้ง sms และ email |

**กลุ่ม E — เฉพาะเครดิต (4 ตัว, tier_a_31 เท่านั้น):**

**ตารางที่ 3-12** ฟีเจอร์กลุ่ม E — เฉพาะเครดิต (4 ตัว, tier_a_31)
| ฟีเจอร์ | สูตร / ความหมาย |
|---|---|
| credit_added_180d | ผลรวม credit_add ใน 180 วันก่อน cutoff |
| credit_balance_proxy | Σ credit_add − Σ usage (ก่อน cutoff) — โดยเจตนา **ไม่ใช้** credit_sms/credit_email จาก snapshot เพราะสะท้อนเวลา export ไม่ใช่เวลา cutoff |
| credit_runway_months | balance_proxy ÷ (usage_recent_90d/3), clip [0, 24]; = 24 ถ้ามีเงินแต่ไม่เบิร์น |
| credit_usage_decel | signed_log1p ของการเปลี่ยนแปลงอัตราใช้รายเดือน (90 วันล่าสุด vs ก่อนหน้า) |

กฎจัดการค่าว่าง: ฟีเจอร์กลุ่มนับ/ผลรวม/สัดส่วน (23 ตัว) fillna = 0.0; กลุ่มความสด/เฉลี่ย (8 ตัว) ยอมให้ NaN แล้วไปเติมที่ preprocessing ทุกฟีเจอร์คำนวณจากข้อมูล **ก่อน cutoff เท่านั้น** (PIT) และมี `feature_code_hash` (SHA-256 ของโค้ดสร้างฟีเจอร์) ฝังใน artifact เพื่อตรวจ train/serve skew

### 3.6.4 Preprocessing

- ฟิต **บน train split เท่านั้น**; เก็บเป็น JSON contract (`preprocessor.json`): รายชื่อฟีเจอร์, ค่าเติม (schema default 0.0 หรือ median ของ train), center = mean, scale = std (population) ของคอลัมน์หลังเติม; std ≤ 0 ใช้ scale = 1.0
- ทุกค่า coerce เป็นตัวเลขก่อน (`pd.to_numeric(errors="coerce")`); ไม่มี one-hot เพราะทุกฟีเจอร์เป็นตัวเลข
- Gate 8 ตรวจความปลอดภัย: preprocessor ต้อง fitted, จำนวนแถว fit ต้องตรง train split, ลำดับฟีเจอร์ต้องคงเดิม, ห้ามมีสถานะ refit จาก split อื่น

### 3.6.5 การแบ่งชุดข้อมูล

- seed 42; แบ่งสองชั้น: ตัด holdout 40% แล้วแบ่งครึ่งเป็น validation/test → **train 60 / val 20 / test 20**
- stratify ตาม label ของแต่ละโมเดล (churn_label / future_purchase_flag / usage_30d>0); หนึ่งลูกค้า = หนึ่งแถวต่อ cutoff จึงเป็น group split โดยโครงสร้าง + มี check ยืนยัน acc_id ไม่ซ้ำข้าม split
- ป้องกันชุดเล็กเกิน: < 25 แถว → ทั้งหมดเป็น train (ไม่ทำ holdout)
- **Multi-cutoff pooling:** แถว cutoff เก่า ๆ ถูก pool เข้า train (ตัด acc_id ที่อยู่ใน val/test ล่าสุดทิ้ง) — val/test ยึดล่าสุดเท่านั้น

### 3.6.6 ขั้นตอนการเทรนทั้งหมด (Training Workflow)

จาก `apps/ml/src/training/runner.py` (1,487 บรรทัด) แสดงดังรูปที่ 3-4:

```
0. โหลด run row → hard-fail ทันทีถ้า cutoff ไม่ใช่วันที่ 1 ของเดือน (usage เป็นรายเดือน)
1. Gate 1 readiness    — source ต้อง ready
2. Gate 2 schema       — คอลัมน์/ชนิดครบ, invalid date ≤ 0.5%, orphan ≤ 1% (warn), null สูง ≤ 50% (warn)
3. Gate 3 feasibility  — ประวัติยาวพอ (min activity < cutoff−180d) และ label ครบ (max activity ≥ cutoff+horizon)
4. Gate 4 label viability — churn: eligible ≥ 500, positive ≥ 100, negative ≥ 100, positive_rate 0.05–0.80
                          clv: eligible ≥ 500, nonzero ≥ 100, top-1% แชร์รายได้ ≤ 50% (warn)
                          credit: nonzero ≥ 500 ต่อ horizon, topup observed ≥ 500 (warn), censoring ≤ 90% (warn)
5. Gate 5 PIT leakage  — max วันจ่ายในฟีเจอร์ < cutoff, max period < cutoff,
                          ห้ามมี snapshot fields (last_access, last_send, credit_sms, credit_email, expire_*)
6. โหลด train_clean → สร้างชุด cutoff หลัก (C1) + adaptive backtest cutoffs (ถอยเดือนละ 2, เงื่อนไข
   ประวัติ ≥ 365 วันและ label ครบ, สูงสุด 6 cutoffs) + cutoff แยกของ credit (activity_max − 90 วัน)
7. เทรน/ประเมิน/promote ต่อโมเดล (churn → clv → credit) ตามหัวข้อ 3.6.7–3.6.10
8. เขียน artifact + registry + evaluations + reports, สถานะ completed พร้อม results_json
   (exception ใด ๆ → สถานะ failed พร้อม error_message)
```
**รูปที่ 3-4** ขั้นตอนการเทรนและประตูตรวจสอบคุณภาพทั้งหมด

### 3.6.7 ผู้สมัครโมเดลและพารามิเตอร์ (สำคัญมากสำหรับการสอบ)

**Churn (churn_trainer.py, 902 บรรทัด) — ผู้สมัคร default 3 ตัว:**

**ตารางที่ 3-13** ผู้สมัครโมเดล churn และการหาพารามิเตอร์
| อัลกอริทึม | การหาพารามิเตอร์ |
|---|---|
| LightGBM | Optuna 40 trials (TPE seed 42, MedianPruner): num_leaves 16–256, learning_rate 0.01–0.2 (log), min_child_samples 10–200, feature/bagging_fraction 0.5–1.0, lambda_l1/l2 1e-8–10 (log), n_estimators 2000 + early stopping 50, scale_pos_weight = n_neg/n_pos; เมตริก = validation PR-AUC |
| Logistic Regression | คงที่: max_iter 2000, class_weight balanced, C = 1.0 |
| TabICL | คงที่: random_state 42, device อัตโนมัติ (CUDA→MPS→CPU), จำกัด 2000 แถว/fit |
| (XGBoost / Random Forest) | เปิดด้วย env CHURN_CANDIDATES; XGB Optuna 50 trials (max_depth 3–9, lr 0.01–0.2, min_child_weight 1–50, subsample/colsample 0.5–1.0, alpha/lambda 1e-8–10); RF คงที่ (500 ต้น, min_samples_leaf 5) |

หลังเทรนแต่ละผู้สมัคร: จัดอันดับด้วย 5-fold **StratifiedGroupKFold (group = acc_id)** บน train∪validation → OOF ใช้คำนวณ calibration + threshold; test แตะครั้งเดียวท้ายสุด; bootstrap 95% CI (1000 ครั้ง); Hosmer–Lemeshow; baseline 3 ตัว (recency_rule_90d, rfm_quartile, logistic_regression); feature importance (SHAP TreeExplainer สำหรับต้นไม้, |coef| สำหรับเชิงเส้น, permutation สำหรับ TabICL) top-10

**Calibration:** Platt เป็น default; isotonic ได้เมื่อ OOF positives ≥ 200 และ ECE ดีขึ้น > 0.005 (หรือ ECE เท่ากันแต่ Brier ดีขึ้น ≥ 2%)

**Threshold:** เลือก threshold ที่ให้ F2 สูงสุดจาก 97 quantiles ของ OOF คลิปในช่วง (0.35, 0.85) แล้ว ลากเส้น: medium = high × 0.5, critical = high + 0.6 × (1 − high)

**CLV (clv_trainer.py, 435 บรรทัด) — champion = two-part, พารามิเตอร์คงที่:**

**ตารางที่ 3-14** พารามิเตอร์ของโมเดล CLV แบบสองส่วน
| องค์ประกอบ | พารามิเตอร์ |
|---|---|
| p_pay (LightGBM binary) | n_estimators 1500, num_leaves 64, lr 0.05, min_child_samples 50, feature/bagging_fraction 0.8, bagging_freq 1, early stopping 50, seed 42 |
| value (3 โมเดล quantile) | objective quantile, alpha ∈ {0.1, 0.5, 0.9}, บน log1p, ฝึกเฉพาะแถวจ่ายจริง, early stopping เมื่อ positive ใน val ≥ 20 |
| BG-NBD/Gamma-Gamma | penalizer sweep logspace(−4, 0, 9) เลือกด้วย validation Spearman; GG ฟิตเมื่อมี ≥ 50 แถวมี frequency > 0 |
| Magnitude calibration | OLS บน validation, fallback identity เมื่อแถว < 2 หรือ slope ≤ 0.01 |
| p_alive thresholds | at_risk = quantile 0.15 คลิป (0.10, 0.30); watch = quantile 0.40 คลิป (0.35, 0.60); fallback 0.20/0.50 |

**Credit (credit_trainer.py, 820 บรรทัด):**

**ตารางที่ 3-15** องค์ประกอบโมเดล credit forecast
| องค์ประกอบ | รายละเอียด |
|---|---|
| Quantile | 5 ควอนไทล์ {0.10, 0.25, 0.50, 0.75, 0.90} × 2 horizons {30d, 90d}; Optuna 30 trials/ horizon/ family; LightGBM (n_estimators 1200, num_leaves 16–128, ...) แข่งกับ XGBoost (max_depth 3–8, objective reg:quantileerror) — เลือก family ที่ pinball@p50 ดีกว่า |
| Anchor | ทำนาย log-ratio จาก carryover: anchor = log1p(carryover), carryover = usage_recent_90d/3 × horizon/30 |
| Shrinkage | λ ∈ linspace(0,1,11) เลือกจาก validation p50 MAE; correction คลิป ±1.5; แก้ quantile crossing ด้วยการ pin p50 แล้ว clamp p10/p25 ลง, p75/p90 ขึ้น |
| CQR | α = 0.20 → q̂ ขยายช่วง p10/p90 แบบ additive |
| Monotonicity | p90 ของ 90d ≥ p90 ของ 30d (ทุกควอนไทล์ ทั้งตอนเทรนและเสิร์ฟ) |
| AFT top-up | XGBoost survival:aft, max_depth 4, lr 0.05, subsample/colsample 0.8, 600 rounds, ES 50; censored: lower = 180, upper = ∞; เลือก (distribution, scale) จาก {normal, logistic} × {0.5, 1.0, 1.5} ด้วย validation urgent-F2; day_scale = 14 / t*; ค่าทำนาย cap 365 วันตอนเสิร์ฟ |

**Baseline ของ credit:** last_30d_carryover, moving_avg_90d, runway_depletion — และเกณฑ์พิเศษ: โมเดลต้องชนะ baseline ที่ดีที่สุดด้าน MAE ภายในตัวคูณ 1.10× ทั้ง 30d และ 90d จึงจะ promote ได้

### 3.6.8 ชุดตรวจ Data Leakage (Leakage Suite)

รันในทุกการเทรน บันทึกผลลง `ml_data_validation_reports` (validation_type = leakage):

**ตารางที่ 3-16** ชุดตรวจ data leakage ห้ารายการ
| ตรวจ | วิธี | เกณฑ์ fail |
|---|---|---|
| single_feature_auc_scan | ต้นไม้ลึก 2 ชั้นต่อฟีเจอร์ | AUC > 0.90 (มีฟีเจอร์ทำนาย label เองได้เกินเหตุ) |
| target_shuffle | สลับ label 5 รอบแล้วเทรนซ้ำ | ค่าเฉลี่ย AUC−0.5 > 0.07 (ฝึกกับ label มั่วแล้วยังแม่น = leak) |
| suspect_drop_audit | ตัดฟีเจอร์ recency ที่น่าสงสัย (4 ตัว) ออก | AUC ตก > 0.30 (โมเดลพึ่งฟีเจอร์เดียวเกินไป) |
| split_contamination | ตรวจ acc_id ข้าม split | มีซ้ำเลย |
| score_sanity | ตรวจความสมเหตุสมผล | ROC-AUC > 0.97 (warn — ดีเกินจริง) |

ฝั่ง regression (CLV/credit) มีชุดเสริม: single_feature_spearman_scan (warn 0.95), target_shuffle ด้วย LGBMRegressor (fail ที่ Spearman > 0.10), score_sanity (warn 0.97)

### 3.6.9 Multi-Cutoff Backtest

ระบบไม่เชื่อผล test จุดเดียว — ไล่ cutoff ย้อนหลังทุก 2 เดือน (สูงสุด 6 cutoffs, เงื่อนไข: ประวัติ ≥ 365 วันและ label ครบ) ที่แต่ละ cutoff จะ **refit โมเดลใหม่ทั้งระบบ** (preprocessor ใหม่ + champion config + calibration) แล้ววัดผล พร้อม baseline ของ cutoff นั้น ๆ — ช่วยกันผลที่ดีเพราะโชคของช่วงเวลาหนึ่ง

### 3.6.10 ประตูคัดเลือก Champion (Promotion Two-Stage)

**ตารางที่ 3-17** เกณฑ์ประตูคัดเลือก champion (promotion two-stage)
| Config | เมตริกหลัก | ต้องชนะ champion (rel) | ห้ามร่วง (max rel drop) | ECE ceiling / target | บทลงโทษ calibration |
|---|---|---|---|---|---|
| Churn | pr_auc | ≥ 1% | 0.30 | 0.10 / 0.05 | 1.0 |
| CLV | clv_composite | ≥ 1% | 0.30 | 0.10 / 0.05 | 0.5 |
| Credit | coverage_p10_p90 | ≥ 0.5% | 0.25 | 0.001 (เข้มมาก) | 0.0 |

กลไกสองขั้น (promotion.py): **ขั้นที่ 1 — ความปลอดภัย:** ผ่าน leakage, artifact โหลดได้จริง, ชนะ baseline ต่างอัลกอริทึมทุก split ทุก backtest, ชนะ incumbent บน backtest ร่วม (แต้มต่อ = max(ค่าสัมบูรณ์, rel × ค่า champion)), แกว่งไม่เกิน max_rel_drop, ECE ไม่เกิน ceiling **ขั้นที่ 2 — คุณภาพ:** คำนวณ composite = เฉลี่ย(เมตริก test + ทุก backtest) − บทลงโทษ × เกินเป้า ECE; ผู้ชนะ = composite สูงสุดที่ผ่านขั้น 1; ไม่มีใครผ่าน → คง incumbent สำหรับ credit เพิ่มเงื่อนไข MAE ≤ 1.10× baseline ที่ดีที่สุด ทุกการ promote ใช้ `pg_advisory_xact_lock` กัน race และเขียน activation history

### 3.6.11 Artifact และการจัดเวอร์ชัน

โครงสร้างไฟล์ต่อหนึ่งเวอร์ชันที่ `models/{model_type}/{version}/`:

**ตารางที่ 3-18** ไฟล์ artifact ต่อหนึ่งเวอร์ชันโมเดล
| ไฟล์ | คืออะไร |
|---|---|
| model.pkl | โมเดลหลัก (serialize ด้วย dill) + SHA-256 checksum |
| calibrator.pkl | calibrator ของ churn (Platt/Isotonic) |
| thresholds.json | churn: เส้น medium/high/critical; clv: เส้น p_alive at_risk/watch |
| feature_baseline.json | baseline การกระจายฟีเจอร์สำหรับ PSI ตอนเสิร์ฟ |
| preprocessor.json | contract การเติมค่า/ปรับสเกล |
| feature_names.json | รายชื่อฟีเจอร์ที่โมเดลใช้ |
| metrics.json | ผลทุก split + backtests + baselines |
| model_card.json | บัตรโมเดล: method, algorithm, cutoff, rows, feature_set, feature_code_hash, params, candidate_selection, primary_metric, calibration, backtests, leakage, limitations, trained_by |

รูปแบบเวอร์ชัน: `{type}-YYYY.MM.{seq}` (เช่น churn-2026.09.0) — ปัจจุบันมีในระบบ: churn 6 เวอร์ชัน, clv 6 เวอร์ชัน, credit 5 เวอร์ชัน

### 3.6.12 ขั้นตอนการพยากรณ์ (Prediction Workflow)

จาก `apps/ml/src/prediction/runner.py` (1,423 บรรทัด) — progress 10 ขั้นบนหน้าจอ ดังรูปที่ 3-5:

```
5% โหลดข้อมูล → 10% quality gates → 20% สร้างฟีเจอร์ → 30% PSI drift → 35% churn → 45% SHAP
→ 55% CLV → 65% credit → 75% derived fields → 85% เขียน outputs → 95% post-checks → 100%
```
**รูปที่ 3-5** ความคืบหน้า (progress) ของงานพยากรณ์ 10 ขั้น

สาระสำคัญทีละจุด:

1. **โหลดโมเดล:** champion จาก alias `production` หรือ override ต่อ run (`model_overrides_json`) — override ชี้เวอร์ชันที่ไม่มีจริง = ล้มทันที
2. **Eligibility matrix:** churn ใช้ได้เฉพาะ `Active Paid`; clv/credit ใช้ได้กับ `Active Paid` และ `Active Free` — ลูกค้านอกเกณฑ์ไม่ถูกทำนาย (ไม่มั่ว)
3. **Feature contract guard:** คอลัมน์ตาม preprocessor ต้องครบ; feature_code_hash ต่าง → เตือนแยกว่า legacy (ปลอดภัย) หรือ train/serve skew (ควร retrain)
4. **PSI drift ต่อโมเดล:** คำนวณเฉพาะแถวที่ eligible ต่อโมเดล เทียบ feature_baseline.json; ≥ 0.10 = minor, ≥ 0.25 = major; **major ≥ 2 ฟีเจอร์** → ผลของลูกค้าที่โมเดลนั้นดูแลถูก mark `output_status = partial` พร้อมหมายเหตุ
5. **Churn:** predict_proba → calibrator → clip [0,1] → risk level ตาม thresholds.json (ห้ามเดา default); SHAP top-5 factors (tree: TreeExplainer เต็มกอง, linear: x·coef, TabICL: ไม่อธิบายได้)
6. **CLV:** two-part + p_alive จาก BG-NBD; **whale tail blend:** ถ้ากองที่จะ blend มี ≥ 50 ราย — ลูกค้าในกลุ่มบน (payment_count_all ≥ max(P90, 2.0) หรือ total_revenue_all ≥ P90) ใช้ max(two-part, BG-NBD) ก่อนปรับ magnitude calibration
7. **Credit:** quantiles + anchor + shrinkage + CQR; บังคับ 90d ≥ 30d ทุกควอนไทล์; วันเติมเงินจาก AFT (cap 365 วัน)
8. **Derived fields (สูตรเชิงธุรกิจ):**
   - Churn abstention: อายุลูกค้า < 90 วัน → ไม่ให้คะแนน churn (ประวัติน้อยเกิน)
   - customer_value_tier: percentile ของ CLV ในกอง active: ≥ 0.90 → high, ≥ 0.50 → mid, อื่น ๆ → low / none
   - revenue_at_risk = churn_probability × predicted_clv_6m
   - usage_trend: > +10% = increasing, < −10% = declining, ไม่มีการใช้ = no_usage, ที่เหลือ stable
   - credit_urgency: วันเหลือ ≤ 14 = critical, ≤ 30 = warning, ≤ 90 = monitor, อื่น ๆ stable (fallback ถ้า AFT ว่าง: ceil(balance ÷ อัตราใช้ต่อวัน))
   - priority_score = 100 × (log1p(revenue_at_risk) − min) / (max − min) — จัดอันดับตามเงินที่เสี่ยงโดยไม่ให้วาฬบีบคนอื่นหมด
   - needs_review = active และ (risk ∈ {high, critical} **หรือ** "ลดลงเงียบ ๆ": tier ∈ {high, mid} และ p_alive ต่ำกว่าเส้น at_risk และ usage_change < −10%)
9. **Segment 10 กลุ่ม (first-match):** Ghost → Lapsed (Churned Paid) → Dormant (Churned) → High-Value At-Risk → Mid-Value At-Risk → High-Value Stable → Low-Value At-Risk → Low-Value Watch → Emerging (โต > +10%) → Stable
10. **priority_rank:** เรียงตามลำดับ segment ที่ทีมควรลงมือ (High-Value At-Risk มาก่อน Stable) แล้วเรียงด้วยเงินภายใน segment (revenue_at_risk สำหรับกลุ่ม retention, predicted_clv_6m สำหรับกลุ่มอื่น)
11. **เขียนผล:** 1 แถว/ลูกค้า, DELETE + upsert chunk ละ 1000 แถว (ON CONFLICT (prediction_run_id, acc_id))
12. **Post-checks:** จำนวนแถวต้องเท่าจำนวนลูกค้า, ความน่าจะเป็นต้องอยู่ [0,1] ทั้งหมด, churn-null ในกองที่ควรทำนาย ≤ 1% — พังข้อไหน run ล้ม

## 3.7 การออกแบบระบบนำเข้าข้อมูล

### 3.7.1 Contract ไฟล์ Excel

`moby-data-prep/config/excel_schema.yaml` (version 1.0): แผ่นบังคับ 2 แผ่น (`Users+User_profile`, `Backend_payment`) และเสริม 6 แผ่น (SMS/Email × BC/API/OTP) คอลัมน์ของแต่ละแผ่นถูกประกาศใน YAML (เช่น Users: acc_id, status (SMS), user.credit + user.credit_premium, credit_email, expire, expire_email, status (Email), join_date, last_access, last_send; Backend_payment: uid, payment_date, acc_id, credit_add, amount, credit_type; usage: year, month, acc_id, usage) — batch 500 แถว, ข้ามแถวว่างทั้งแถว

### 3.7.2 กฎ Fidelity (เก็บของจริง 100%)

ที่มา: `moby-data-prep/docs/import-fidelity-rules.md` — **สิ่งที่ import ทำ:** เก็บทุกแถวข้อมูล (รวมแถวซ้ำ), trim เฉพาะหัวคอลัมน์, บันทึก excel_row เพื่อ audit, หนึ่ง sheet = หนึ่งตาราง, checksum SHA-256, datetime เก็บทั้ง iso และ serial **สิ่งที่ปล่อยให้ขั้น clean ทำ:** แปลงวันที่, dedupe, ตัด payment ไม่มีวันที่, fillna(0) เครดิต, รวม usage พร้อม tag channel/source, ตรวจ orphan acc_id, feature engineering — เหตุผล: ตัวอย่างข้อมูลเป็น mock (SMS API กับ OTP อาจซ้ำกัน) ห้ามตัดสินใจแทนจากฝั่ง import

### 3.7.3 Import ผ่าน API (หน้าเว็บ)

Sync (`POST /import`) และ Async (`POST /import/async`) — async พยากรณ์ progress ผ่าน Redis Stream `train-import:{source_id}` (event: progress/done/failed, TTL 1 ชั่วโมง) หน้าเว็บอัปโหลดด้วย XHR แสดง % อัปโหลดแล้ว poll progress ทุก 400 มิลลิวินาที จนกว่าจะ ready/failed (deadline 10 นาที) ฝั่ง predict import มี `auto_run` default เปิด: import เสร็จจะสร้าง prediction run และจุดชนวน ML ทันทีในชื่อ "Auto — {source} {วันที่}"

## 3.8 การออกแบบ Dashboard (เว็บแอปพลิเคชัน)

### 3.8.1 หน้าจอทั้งหมด 9 หน้า

**ตารางที่ 3-20** หน้าจอ Dashboard ทั้ง 9 หน้า
| หน้า | เนื้อหา |
|---|---|
| / (Dashboard) | การ์ดสรุป (metric cards), ลูกค้า top 10 priority, value–risk matrix, สัดส่วน lifecycle, กราฟรายได้รายเดือน (Recharts LineChart มี pan/zoom), risk card, credit urgency, run insight card |
| /runs | สร้าง/เลือก prediction run, ตาราง run + progress สด (poll ทุก 3 วินาที), retry |
| /training | จุดชนวนเทรน (เลือก source, cutoff, horizon), สถานะโมเดลปัจจุบัน 3 การ์ด, ประวัติเทรนทุกครั้งพร้อมผล |
| /customers | ตารางลูกค้า (กรอง 9 มิติ, ค้น acc_id, sort), export CSV |
| /customers/[id] | Customer 360: profile, ผลพยากรณ์ทุกตัว, กราฟ usage รายเดือน + payment (Recharts), ปุ่ม Gen-AI อธิบายเหตุผลรายคน |
| /model-performance | การ์ดเมตริกทุกโมเดล + คำอธิบายเมตริก (metric-help), เวอร์ชัน, competition, calibration, lift |
| /ai-chat | แชท "Moby AI" สตรีม SSE, quick prompts, evidence แสดง SQL ที่ใช้ |
| /login | ล็อกอิน Google OAuth (การ์ดเดียว, redirect กลับตาม param ที่ sanitize แล้ว) |
| /profile | จัดการบัญชีตัวเอง (ชื่อ/รูป/ลบบัญชี) |

### 3.8.2 State management และการเชื่อมต่อ

- Zustand 3 store: `run-store` (runId ปัจจุบัน persist localStorage, sync ?run= กับ URL), `chat-store` (บทสนทนา/สตรีม SSE parser เอง), `status-dialog-store` (แจ้งเตือนกลาง)
- API client (`lib/api.ts`, `lib/ml-api.ts`): fetch ครอบ redirectingFetch (401 → เด้ง /login), รองรับโหมด mock (`NEXT_PUBLIC_ML_USE_MOCK=1`) สำหรับพัฒนาโดยไม่ต้องรัน backend
- เชื่อม api ผ่าน Next proxy rewrite: `/api/:path*` → `${ELYSIA_URL}/:path*` (ตัด prefix), auth ผ่าน `/api/auth/*` โดยตรง

## 3.9 การออกแบบระบบ AI (สามฟีเจอร์)

**ตารางที่ 3-19** ฟีเจอร์ AI สามส่วนของระบบ
| ฟีเจอร์ | อินพุต (หลักฐาน) | ผลลัพธ์ | การเก็บ |
|---|---|---|---|
| คำอธิบายรายลูกค้า | profile snapshot + สัญญาณคำนวณ + ผลโมเดล + SHAP churn_factors | ย่อหน้าภาษาไทยอธิบายว่าทำไมได้คะแนนนี้ | ai_explanation + ai_reasoning_json ใน output row; temp 0.2; ตรวจห้ามปี พ.ศ. |
| Run insight | สรุปสถิติรวมของ run (deterministic aggregates) | บทวิเคราะห์พอร์ตลูกค้า | cohort_insight_json ของ run |
| แชท Text-to-SQL | คำถามผู้ใช้ + ประวัติ 10 ตา + schema ที่อนุญาต | คำตอบ + evidence (SQL, จำนวนแถว) | ai_messages (user + assistant) |

LLM provider รองรับ 2 แบบ: ใด ๆ ที่เข้ากัน OpenAI (OpenAI/OpenRouter/Groq/Together/vLLM) หรือ Ollama (default: qwen3.5:397b-cloud ที่ localhost:11434) — agent Text-to-SQL แก้ตัวเองได้สูงสุด 3 ครั้งเมื่อ SQL error, ล็อกขอบเขตไปที่ run ที่ผูกไว้, และอนุญาตเฉพาะ id ของตารางที่กำหนด (allowlist)

## 3.10 ความปลอดภัยและการควบคุมการเข้าถึง

- **Auth:** Better Auth + Google OAuth เท่านั้น (ปิด email/password), session 7 วัน (refresh ทุกวัน), secret แยก env
- **Service-to-service:** ML internal API ป้องกันด้วย `x-internal-token` เทียบด้วย hmac.compare_digest (403 ถ้า env ไม่ตั้งหรือไม่ตรง)
- **Access model:** org-shared (ทุกผู้ใช้จัดการทุกอย่างได้) ยกเว้น AI chat ต่อ user; การลบมีเงื่อนไขกันผลกระทบ (ห้ามลบ champion, ห้ามลบของที่ถูก run อ้างอิง, auto repoint production)
- **ความถูกต้องข้อมูล:** checksum SHA-256 ทั้งไฟล์ import และ artifact model, feature_code_hash กัน train/serve skew, excel_row lineage ทุกแถว
- **Integrity ของผล:** post-checks หลังเขียน outputs, ห้ามเดา threshold ถ้า artifact ไม่มี, PSI gate ป้องกันผลเพี้ยนออกไปเงียบ ๆ

## 3.11 การติดตั้งและตัวแปรสภาพแวดล้อม

Docker Compose 5 services (db → healthy → redis → healthy → ml → api → web) volumes: `postgres_data` (ฐานข้อมูล), `./models:/app/models` (ทั้ง ml และ api), `./db/init` (bootstrap ครั้งแรก), `./data:/data` ตัวแปรสำคัญ: DATABASE_URL, REDIS_HOST/PORT, MODEL_DIR, DATA_DIR, INTERNAL_SERVICE_TOKEN, ML_INTERNAL_URL (default http://localhost:8000), ML_INTERNAL_TIMEOUT_MS (30000), STALE_RUN_TIMEOUT_MINUTES (120), ALLOWED_ORIGINS, BETTER_AUTH_SECRET/URL, GOOGLE_CLIENT_ID/SECRET, LLM_PROVIDER/LLM_API_KEY/LLM_BASE_URL/LLM_MODEL/LLM_EMBED_MODEL, TABICL_DEVICE/TABICL_MAX_ROWS, ENABLE_XGB_CREDIT, IMPORT_MAX_UPLOAD_BYTES (1 GiB), IMPORT_TIMEOUT_MS (10 นาที) CI: GitHub Actions — build ด้วย Bun 1.4.0 (bun install --frozen-lockfile; turbo build) และ deploy ผ่าน Railway CLI (matrix: web, api, ml)

---

# บทที่ 4 การพัฒนา การทดสอบ และผลการทดสอบ

## 4.1 วิธีการพัฒนาและการตรวจสอบความถูกต้อง

โปรเจกต์นี้เลือกแนวทาง **verification scripts** แทน unit test ปกติ เนื่องจากความถูกต้องของ ML ต้องพิสูจน์กับข้อมูลจริงในฐานข้อมูล ไม่ใช่ fixture เทียม — มีสคริปต์ตรวจ 6 ตัวใน `apps/ml/scripts/`:

**ตารางที่ 4-1** สคริปต์ตรวจสอบความถูกต้อง (verification scripts)
| สคริปต์ | ตรวจอะไร |
|---|---|
| verify_constants_sync.py | ค่าคงที่ข้อความใน constants.py (Python) ต้องตรงกับ constants.ts (TypeScript) 100% — กัน drift ข้ามภาษา |
| verify_promotion_policy.py | ทดสอบ promotion.decide 8 สถานการณ์ (miscalibration เล็กน้อยผ่าน, ECE 0.20 ตก, backtest ร่วง 1 cutoff ตก, แพ้ incumbent ตก, tie คงเดิม ฯลฯ) |
| verify_preprocessing.py | fit→save→load ต้อง reproduce ผลเหมือนเดิมเป๊ะ, ไม่มี NaN, ลำดับฟีเจอร์คงที่ |
| verify_feature_builder.py | 6 ตรวจ: จำนวนแถว = แกนลูกค้า, ชื่อฟีเจอร์ = contract 31, ลำดับคอลัมน์ deterministic, ไม่มี acc_id ซ้ำ, ไม่มีข้อมูลหลัง cutoff (ทั้ง payment และ usage) |
| verify_clean_data_access.py | รัน Gate 1–5 จริงกับ DB + ตรวจ dtype ของ loader |
| verify_realized_outcomes.py | label ฝั่งวัดผลจริงต้องเป็น object เดียวกับฝั่งเทรน (identity check) + metric sanity + ความสอดคล้องของแถวที่บันทึก |

นอกจากนี้ CI (GitHub Actions) build ทั้ง monorepo ทุก PR พร้อม deploy Railway อัตโนมัติเมื่อ merge main

## 4.2 กลยุทธ์การทดสอบโดยรวม (Test Strategy)

ระบบมีการทดสอบซ้อนกัน 6 ชั้น:

1. **Gate ก่อนเทรน 5 ด่าน** — ข้อมูลไม่ผ่านก็ไม่ยอมเทรน (readiness/schema/feasibility/label viability/PIT)
2. **Leakage suite 5 รายการ** — พิสูจน์ว่าไม่มีข้อมูลอนาคตรั่ว
3. **การแบ่งชุดแบบ group** + contamination check — ลูกค้าเดียวกันไม่ข้ามฝั่ง
4. **Multi-cutoff backtest (สูงสุด 6 ช่วง)** — กันผลดีเพราะโชค
5. **Promotion two-stage + verify_artifact_load** — production ไม่มีวันถอยหลัง
6. **ตอนเสิร์ฟ:** PSI drift gate + post-checks (ความครบถ้วนของแถว, ขอบเขตความน่าจะเป็น, churn-null ≤ 1%)

และชั้นที่ 7 ซึ่งเป็นของจริงที่สุด: **production holdout** — วัดผลย้อนหลังจากผลจริงที่เกิดขึ้นแล้ว (หัวข้อ 4.7)

## 4.3 ชุดข้อมูลที่ใช้ทดสอบ

**ตารางที่ 4-2** ชุดข้อมูลที่ใช้เทรนแต่ละโมเดล
| โมเดล | dataset (แถว) | cutoff | horizon | feature set |
|---|---|---|---|---|
| churn-2026.09.0 | 7,107 | (รุ่นล่าสุด) | 180 วัน | tier_a_27/v1 |
| clv-2026.09.0 | 13,017 | 2025-07-01 | 180 วัน | tier_a_27/v1 |
| clv-2026.06.4 | 4,038 (test n=808) | 2025-07-01 | 180 วัน | tier_a_24/v1 |
| credit-2026.09.0 | 30,988 | 2025-10-01 | 30/90 วัน | tier_a_31/v1 |

## 4.4 ผลการทดสอบโมเดล Churn

**การแข่งขันผู้สมัครของรุ่น churn-2026.09.0** (CV PR-AUC): Logistic Regression 0.7877, LightGBM 0.8082, **TabICL 0.8145 (ชนะ)** — champion composite 0.7550

**ตารางที่ 4-3** ผลการทดสอบโมเดล churn แต่ละเวอร์ชัน
| เวอร์ชัน | อัลกอริทึม | PR-AUC (test) | baseline | dataset | หมายเหตุ |
|---|---|---|---|---|---|
| churn-2026.09.0 | TabICL | **0.76139** | logistic_regression 0.73974 | 7,107 แถว (positive_rate 0.3117) | isotonic, ECE test 0.04797 (เกณฑ์ ≤ 0.10 ผ่าน) |
| churn-2026.06.3/.4 | LightGBM | 0.7284 | — | 2,388 แถว | รุ่นก่อน |
| (รุ่นแรก) | Logistic Regression | 0.6502 | recency_rule_90d 0.6181 | — | — |

เส้นความเสี่ยงของรุ่นล่าสุด (จาก thresholds.json): medium 0.17 / high 0.35 / critical 0.74 — ผ่าน leakage suite ทั้ง 5 รายการ, calibration ผ่านเพดาน, bootstrap CI 1000 ครั้ง, ผ่าน backtest หลาย cutoff พร้อม baseline recency_rule_90d, rfm_quartile, logistic_regression

## 4.5 ผลการทดสอบโมเดล CLV (Two-Part)

**รุ่น champion ล่าสุด clv-2026.09.0** (13,017 แถว, tier_a_27/v1):

**ตารางที่ 4-4** ผลการทดสอบโมเดล CLV (clv-2026.09.0)
| เมตริก | Validation | Test |
|---|---|---|
| Spearman | 0.5287 | 0.5106 |
| MAE (THB) | 26,995.01 | 25,952.39 |
| RMSE | 156,234.19 | 92,497.67 |
| Top-decile capture | 0.792 | 0.7859 |
| p_pay ROC-AUC | 0.8886 | 0.8923 |
| p_pay ECE | 0.0339 | 0.0213 |
| range_coverage | 0.7609 | 0.765 |
| clv_composite | **0.7557** | **0.7264** |

- **เทียบ baseline (test):** โมเดล 0.7264 เทียบ revenue_180d_carryover 0.51 และ segment_mean 0.4664 — ชนะชัดเจนและผ่านเกณฑ์ promotion ≥ 1%
- **revenue_bias_ratio (test)** = 1.1225 (พยากรณ์รวมพอร์ตสูงกว่าจริง 12% — อยู่ในเกณฑ์รับได้ของ composite bias_score)
- **Backtest 3 cutoffs:** 2025-05-01 = 0.6135, 2025-03-01 = 0.6667, 2025-01-01 = 0.7526 — เสถียรทุกช่วง
- **การแข่งขันผู้สมัครในรุ่น:** twopart (composite 0.6898 บน validation) ชนะเป็น champion

**รุ่นก่อนหน้า clv-2026.06.4** (4,038 แถว, tier_a_24/v1) เผื่อเทียบ: test Spearman 0.5195, MAE 24,679.76 บาท, top-decile 0.7629; ชนะ baseline carryover (0.3654 / MAE 31,242.96) และ segment_mean (0.3173 / 42,968.74); backtest 0.5094/0.5066/0.5098 — การเพิ่มฟีเจอร์ (24→27) และข้อมูล (4k→13k แถว) ยก composite จาก Spearman ~0.52 ไปเป็น 0.7264 ส่วนการแข่งขันคู่คลาสสิกในรุ่นเก่า: BG-NBD+Gamma-Gamma Spearman 0.042 vs LightGBM Tweedie 0.5295 จึงยืนยันสถาปัตยกรรม two-part

## 4.6 ผลการทดสอบโมเดล Credit Forecast

**รุ่น champion credit-2026.09.0** (30,988 แถว, tier_a_31/v1, cutoff 2025-10-01):

**ตารางที่ 4-5** ผลการทดสอบโมเดล credit forecast (credit-2026.09.0)
| ชุด | Coverage p10–p90 (รวม) | 30d | 90d | MAE 30d (หน่วยการใช้) | MAE 90d | n |
|---|---|---|---|---|---|---|
| Validation | 0.8882 | 0.8994 | 0.8771 | 5,697.85 | 20,259.43 | 2,067 |
| Test | **0.8639** | 0.8777 | 0.8501 | 6,865.87 | 21,188.64 | 2,068 |

เทียบเกณฑ์เป้าหมาย (0.75–0.90) → ผ่าน เทียบ baseline (test MAE 30d): last_30d_carryover 8,521.33, moving_avg_90d 11,656.98, runway_depletion 9,216.21 — โมเดล 6,865.87 ชนะทุกตัว (และผ่านเงื่อนไข MAE ≤ 1.10×)

**โมเดลวันเติมเงิน (XGBoost AFT) วัดแยก:** การแจ้งเตือน "จะเติมภายใน 14 วัน" บน test — precision 0.2346 / **recall 0.7755** (actual 49 / flag 162) ขณะที่กฎ heuristic เตือน 283 คนได้ recall เพียง 0.4898 (precision 0.0848) — โมเดลจับเคสเติมเงินได้มากกว่าและผิดพลาดน้อยกว่า; MAE วันเติมเงิน (เฉพาะเคสที่สังเกตได้) = 34.49 วัน (test, n=161) และ 31.53 วัน (validation, n=132)

**Backtest 4 cutoffs** (2025-08-01 n=1,940 / 06-01 n=1,790 / 04-01 n=1,641 / 02-01 n=1,506) ครบทุกเมตริกพร้อม baseline 3 ตัวต่อช่วง

## 4.7 การวัดผลจริงบน Production (Realized Outcomes)

กลไก: เมื่อ prediction run อายุครบ horizon (churn/CLV 180 วัน, credit 30/90 วัน) งาน `backfill_outcomes` จะกลับไปนิยาม label จริงด้วย **object สร้าง label ชุดเดียวกับตอนเทรน** (identity-checked ด้วย verify_realized_outcomes.py) จับคู่กับผลที่เคยพยากรณ์ไว้ (ต้องมีอย่างน้อย 20 ราย) แล้วคำนวณเมตริกจริงของเวอร์ชันโมเดลที่ใช้จริงตอนนั้น — เก็บเป็น `ml_model_evaluations` (evaluation_type = production_holdout, dataset_split = production) พร้อม context (จำนวน matched, แหล่ง actuals, เส้น threshold ที่ใช้) — API เปิดให้ดูผ่าน `GET /prediction-runs/:id/realized-outcomes` และการ์ด "realized" บนหน้า model performance กลไกนี้ปิดวงจร MLOps: ทุกผลพยากรณ์จะถูกตรวจสอบกับความจริงในที่สุด ไม่ใช่แค่แม่นบนกระดาษตอนเทรน

## 4.8 ผลการทดสอบระดับระบบ

- **ความครบถ้วนของผล:** post-check บังคับ แถวที่เขียน == จำนวนลูกค้าทุก run; ความน่าจะเป็นนอกช่วง [0,1] = 0; churn-null ≤ 1% ของกองที่ควรทำนาย
- **การป้องกัน drift:** PSI ต่อโมเดลทุก run (เกณฑ์ minor 0.10 / major 0.25 และต้อง major ≥ 2 ฟีเจอร์จึง mark partial)
- **การคัดเลือกโมเดล:** promotion policy ถูกพิสูจน์ด้วย 8 สถานการณ์ทดสอบ (verify_promotion_policy.py) และมี advisory lock + audit history กันการ promote พร้อมกัน
- **ความถูกต้องของ contract ข้ามภาษา:** verify_constants_sync.py ยืนยันค่าคงที่ Python = TypeScript ทุกค่า
- **ประสิทธิภาพงานหนัก:** import แบบ batch 500 แถว/รอบ, พยากรณ์แบบ upsert chunk 1,000 แถว, async import ผ่าน Redis stream จึงไม่ timeout กับไฟล์ใหญ่ (cap 1 GiB)

---

# บทที่ 5 สรุปและข้อเสนอแนะ

## 5.1 สรุปผลโครงงาน

โครงงานนี้สร้างระบบ end-to-end ครบวงจรตั้งแต่ไฟล์ Excel ดิบจนถึงการตัดสินใจเชิงธุรกิจบน Dashboard โดยสิ่งที่สร้างเสร็จจริงตามโค้ด ได้แก่:

1. **ท่อข้อมูลที่ซื่อสัตย์** — import แบบ fidelity + แยกชั้น raw/clean + lineage ทุกแถว + checksum; ฐานข้อมูล 39 ตารางแยกฝั่ง train/predict ชัดเจน
2. **ฟีเจอร์ 31 ตัวแบบ point-in-time** ครอบคลุม 4 มิติพฤติกรรม (ความสด, การจ่าย, การใช้งาน, ช่องทาง) พร้อม 4 ตัวเฉพาะเครดิต ทุกตัวมีสูตร กฎค่าว่าง และ feature_code_hash
3. **ชุดโมเดล 3 กลุ่ม 7 ส่วน** (Churn, CLV two-part + BG-NBD p_alive, Credit quantile 30/90 + AFT) พร้อมช่วงความไม่แน่นอนทุกตัว ไม่ใช่ตัวเลขเดี่ยว
4. **MLOps ที่วัดผลอย่างซื่อสัตย์** — ประตู 5 ด่าน, leakage suite, backtest หลายช่วง, promotion two-stage, PSI drift, production holdout, audit trail
5. **ผลลัพธ์ที่มนุษย์ใช้ได้** — revenue_at_risk, priority_score/rank, credit urgency, 10 segments, needs_review, AI explanation, Text-to-SQL chat
6. **ผลการทดสอบผ่านทุกเกณฑ์** — Churn PR-AUC 0.7614 (> baseline 0.7397), CLV composite 0.7264 (> baseline 0.51) โดย top 10% จับรายได้จริง 78.59%, Credit coverage 0.8639 (เป้า 0.75–0.90) และชนะ baseline MAE ทุกตัว

## 5.2 ปัญหาที่พบและแนวทางแก้ไขที่ฝังในการออกแบบ

| ปัญหา | แนวทางแก้ในระบบ |
|---|---|
| Label เป็นศูนย์ 77% | แยกสองส่วน p_pay × value + ทำนายบน log1p |
| ข้อมูล censored 70% ในวันเติมเงิน | XGBoost AFT survival regression |
| Leakage ง่ายเกิดในข้อมูล time-series | PIT ทุกฟีเจอร์ + group split + leakage suite + ห้ามใช้ snapshot fields |
| ช่วงพยากรณ์ไม่น่าเชื่อถือ | CQR conformal + เกณฑ์ coverage เป็นเมตริก promotion |
| ผลดีเพราะโชคช่วงเวลา | adaptive multi-cutoff backtest สูงสุด 6 ช่วง |
| โมเดลเก่าถูกแทนแล้วแย่ลง | promotion two-stage + ต้องชนะทุก split + stability guardrail |
| ผลเพี้ยนเมื่อข้อมูลเปลี่ยน | PSI drift gate → mark partial ให้คนตรวจ |
| ลูกค้าใหม่ประวัติน้อย | abstention อายุ < 90 วัน + fallback heuristic เตือนเติมเงิน |

## 5.3 ข้อจำกัดของระบบ

- ข้อมูลมาจากลูกค้าชุดเดียว (ตัวอย่างมหาวิทยาลัยกรุงเทพฯ ซึ่งเป็น mock data) — ใช้กับธุรกิจอื่นต้อง fit ใหม่ทั้ง pipeline
- CLV horizon สั้น (6 เดือน); churn abstain ลูกค้าอายุ < 90 วันโดยเจตนา
- BG-NBD คลาสสิกทำนายรายได้ตรง ๆ ไม่ได้ (Spearman 0.042) — ใช้เฉพาะบทบาทสนับสนุน
- precision ของการเตือนเติมเงิน 14 วันยังต่ำ (0.23) แม้ recall สูง (0.78) — เหมาะใช้เป็นช่องทางเตือน ไม่ใช่การยืนยัน
- โครงการยังไม่มีชุด unit test แบบอัตโนมัติ (ใช้ verification scripts + CI build แทน) และมีความไม่ตรงกันบางจุดระหว่างเอกสาร schema เก่ากับ SQL จริง (เช่น คอลัมน์ prediction_run_id, ความ unique ของ checksum)
- Docker image ใช้ pgvector แต่สคีมายังไม่มีคอลัมน์ embedding — ฟีเจอร์ RAG เชิงเวกเตอร์ยังไม่เปิดใช้

## 5.4 แนวทางพัฒนาต่อในอนาคต

1. เพิ่ม horizon CLV 12 เดือน และลองโมเดล next-purchase
2. ต่อยอด pgvector จริง: เก็บ embedding ของคำอธิบาย/เอกสาร เพื่อ RAG ที่ตอบคำถามเชิงวิเคราะห์ได้กว้างขึ้น
3. เพิ่ม SHAP ฝั่ง CLV/credit (ปัจจุบัน SHAP มีเฉพาะ churn) เพื่อคำอธิบายรอบด้าน
4. A/B test กับทีมขายจริง (โทรตามกลุ่มที่โมเดลชี้ vs กลุ่มสุ่ม) เพื่อวัด ROI
5. เพิ่ม unit/integration test พื้นฐานใน repo และปรับเอกสาร schema ให้ตรง SQL ปัจจุบัน
6. ระบบแจ้งเตือนอัตโนมัติ (เช่น อีเมล/ไลน์) เมื่อลูกค้าเข้าเกณฑ์ credit urgency = critical หรือ needs_review

---

# เอกสารอ้างอิง

[1] Ke, G., Meng, Q., Finley, T., Wang, T., Chen, W., Ma, W., Ye, Q., and Liu, T.-Y. LightGBM: A Highly Efficient Gradient Boosting Decision Tree. Advances in Neural Information Processing Systems 30 (NeurIPS), 2017.

[2] Chen, T. and Guestrin, C. XGBoost: A Scalable Tree Boosting System. Proceedings of the 22nd ACM SIGKDD, 2016.

[3] Akiba, T., Sano, S., Yanase, T., Ohta, T., and Koyama, M. Optuna: A Next-generation Hyperparameter Optimization Framework. Proceedings of the 25th ACM SIGKDD, 2019.

[4] Fader, P. S., Hardie, B. G. S., and Lee, K. L. "Counting Your Customers" the Easy Way: An Alternative to the Pareto/NBD Model. Marketing Science, 24(2), 2005.

[5] Fader, P. S. and Hardie, B. G. S. The Gamma-Gamma Model of Monetary Value. White Paper, 2007.

[6] Lundberg, S. M. and Lee, S.-I. A Unified Approach to Interpreting Model Predictions. Advances in Neural Information Processing Systems 30 (NeurIPS), 2017.

[7] Romano, Y., Patterson, E., and Candès, E. Conformalized Quantile Regression. Advances in Neural Information Processing Systems 32 (NeurIPS), 2019.

[8] Platt, J. Probabilistic Outputs for Support Vector Machines and Comparisons to Regularized Likelihood Methods. Advances in Large Margin Classifiers, 1999.

[9] Naeini, M. P., Cooper, G. F., and Hauskrecht, M. Obtaining Well Calibrated Probabilities Using Bayesian Binning. Proceedings of AAAI, 2015.

[10] Hosmer, D. W. and Lemeshow, S. Applied Logistic Regression (2nd ed.). Wiley, 2000.

[11] Kalbfleisch, J. D. and Prentice, R. L. The Statistical Analysis of Failure Time Data (2nd ed.). Wiley, 2002.

[12] Saito, T. and Rehmsmeier, M. The Precision-Recall Plot Is More Informative than the ROC Plot When Evaluating Binary Classifiers on Imbalanced Datasets. PLOS ONE, 10(3), 2015.

[13] Yurdakul, B. Statistical Properties of Population Stability Index. Dissertation, Western Michigan University, 2018.

[14] Davidson-Pilon, C. lifetimes: Customer Lifetime Value in Python. GitHub repository, https://github.com/CamDavidsonPilon/lifetimes

[15] Pedregosa, F., et al. Scikit-learn: Machine Learning in Python. Journal of Machine Learning Research, 12, 2011.

[16] McKinney, W. Data Structures for Statistical Computing in Python. Proceedings of the 9th Python in Science Conference, 2010.

[17] FastAPI Documentation. https://fastapi.tiangolo.com

[18] Next.js Documentation. https://nextjs.org/docs

[19] Elysia - Ergonomic Framework for Humans. https://elysiajs.com

[20] Drizzle ORM Documentation. https://orm.drizzle.team

[21] Better Auth Documentation. https://www.better-auth.com

[22] PostgreSQL 15 Documentation. https://www.postgresql.org/docs/15/

[23] Redis Documentation. https://redis.io/docs

[24] Docker Compose Documentation. https://docs.docker.com/compose/

[25] Optuna Documentation. https://optuna.org

[26] moby-analytics Source Code and Internal Documentation (this repository): apps/web, apps/api, apps/ml, packages/types, moby-data-prep, db/init/001_schema.sql, models/, docker-compose.yml.

# ภาคผนวก ก: สรุปโครงสร้างฐานข้อมูล (39 ตาราง)

**ตารางที่ ก-1** รายการตารางฐานข้อมูลทั้ง 39 ตาราง
| # | ตาราง | กลุ่ม | บทบาท |
|---|---|---|---|
| 1–4 | user, account, session, verification | auth | Better Auth (Google OAuth, session) |
| 5 | train_data_sources | import | catalog ไฟล์ train (checksum, manifest, สถานะ) |
| 6–13 | train_raw_sheet_users_user_profile, _backend_payment, _sms_usage_bc/api/otp, _email_usage_bc/api/otp | import | เก็บ Excel ดิบทุกแถวเป็น JSONB |
| 14–16 | train_clean_customers, _payments, _usage | import | ข้อมูลสะอาดพร้อม lineage |
| 17 | predict_data_sources | import | catalog ไฟล์ predict |
| 18–25 | predict_raw_sheet_* ×8 | import | raw ฝั่งพยากรณ์ |
| 26–28 | predict_clean_customers, _payments, _usage | import | clean ฝั่งพยากรณ์ |
| 29 | ml_training_runs | runs | งานเทรน + config/progress/results |
| 30 | ml_prediction_runs | runs | งานพยากรณ์ + overrides + insight |
| 31 | ml_prediction_outputs | outputs | ผลต่อลูกค้า (40 คอลัมน์, unique ต่อ run+acc) |
| 32 | ml_model_versions | registry | เวอร์ชันโมเดล + artifact + metrics + model card |
| 33 | ml_feature_sets | registry | contract ฟีเจอร์ + feature_code_hash |
| 34 | ml_model_aliases | registry | alias production → champion |
| 35 | ml_model_activation_history | registry | audit การ promote/manual override/delete |
| 36 | ml_model_evaluations | registry | metrics ทุก split รวม production_holdout |
| 37–38 | ai_conversations, ai_messages | ai | แชท AI + evidence_json |
| 39 | ml_data_validation_reports | other | รายงานตรวจ leakage/drift/quality |

# ภาคผนวก ข: โครงสร้างไฟล์ artifact ต่อเวอร์ชันโมเดล

```
models/
├── churn/ churn-2026.06.0 … churn-2026.09.0/
│     model.pkl, calibrator.pkl, thresholds.json, feature_baseline.json,
│     preprocessor.json, feature_names.json, metrics.json, model_card.json
├── clv/ clv-2026.06.1 … clv-2026.09.0/   (model.pkl รวม p_pay + 3 quantile + calibrator)
└── credit/ credit-2026.06.1 … credit-2026.09.0/  (quantile bundles 30d/90d + AFT topup)
```

# ภาคผนวก ค: แผนที่โค้ดสำคัญ (Code Map)

**ตารางที่ ค-1** แผนที่โค้ดสำคัญของโปรเจกต์
| หัวข้อ | ไฟล์ |
|---|---|
| สถาปัตยกรรม/รัน | docker-compose.yml, turbo.json, .github/workflows/ci.yml |
| นำเข้า CLI | moby-data-prep/scripts/import_train_raw.py, config/excel_schema.yaml, docs/*.md |
| นำเข้า API | apps/api/src/routes/train-data.ts, predict-data.ts, lib/train-import*.ts |
| ฐานข้อมูล | db/init/001_schema.sql (39 ตาราง), apps/api/src/db/schema.ts (Drizzle) |
| API | apps/api/src/index.ts + src/routes/* (train-data, predict-data, training-runs, prediction-runs/{runs,outputs,summary,customer-360,insight,realized-outcomes}, model-performance, outcome-backfill, ai-chat) |
| ML orchestrator | apps/ml/src/training/runner.py (1,487 บรรทัด), src/cli/train.py |
| Label / Features / Preprocess / Split | apps/ml/src/training/labels.py, features.py, preprocessing.py, datasets.py |
| โมเดล | apps/ml/src/training/churn_trainer.py, clv_trainer.py, credit_trainer.py, promotion.py, leakage.py, metrics.py, drift.py |
| Artifact/Registry | apps/ml/src/training/artifacts.py, registry.py |
| พยากรณ์ | apps/ml/src/prediction/runner.py (1,423 บรรทัด), src/constants.py |
| วัดผลจริง | apps/ml/src/outcomes/runner.py, metrics.py, src/cli/backfill_outcomes.py |
| Internal API | apps/ml/api/main.py (FastAPI v6.0) |
| เว็บ | apps/web/src/app/*, src/features/*, src/stores/*, src/lib/{api,ml-api,http}.ts |
| Contract ร่วม | packages/types/src/* (enums, prediction, training, model-performance, realized-outcomes, data-sources, auth) |
| สคริปต์ตรวจ | apps/ml/scripts/verify_*.py ×6 |
| ผลทดสอบ | models/{churn,clv,credit}/*/metrics.json, model_card.json, thresholds.json |
