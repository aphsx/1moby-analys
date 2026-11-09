# บทที่ 2: ทฤษฎีและงานวิจัยที่เกี่ยวข้อง (Literature Review & Theoretical Foundations)

---

## 2.1 สถาปัตยกรรมต้นไม้ตัดสินใจแบบกลุ่ม (Gradient Boosted Decision Trees: GBDT)
ในการประมวลผลข้อมูลแบบตาราง (Tabular Data) งานวิจัยร่วมสมัยในวงการวิทยาการข้อมูลและ Kaggle Competitions ได้พิสูจน์แล้วว่าโมเดลกลุ่ม Gradient Boosted Decision Trees (GBDT) ให้ประสิทธิภาพที่เหนือกว่าโครงข่ายประสาทเทียมแบบ Deep Learning ทั่วไป ทั้งในด้านความแม่นยำ ความทนทานต่อ Outliers และความเร็วในการประมวลผล โครงการนี้ประยุกต์ใช้ 2 สถาปัตยกรรมชั้นนำร่วมกัน:

### 1. LightGBM (Light Gradient Boosting Machine)
LightGBM พัฒนาโดย Microsoft Research มีจุดเด่นเชิงอัลกอริทึม 2 ประการ:
* **Histogram-based Algorithm:** ทำการจัดกลุ่มค่าของฟีเจอร์ตัวเลขต่อเนื่องลงในถังแบบไม่ต่อเนื่อง (Discrete Bins) ช่วยลดความซับซ้อนในการคำนวณการแบ่งกิ่ง (Split Finding) จาก $O(\text{data} \times \text{features})$ เป็น $O(\text{bins} \times \text{features})$
* **Leaf-wise Tree Growth:** ต่างจากต้นไม้ทั่วไปที่เติบโตทีละชั้นแบบ Depth-wise อัลกอริทึมของ LightGBM จะเลือกขยายใบที่ให้ค่าการลดลงของ Loss สูงสุด (Best-first Search) ส่งผลให้โมเดลสามารถจับรูปแบบความสัมพันธ์ที่ซับซ้อนของข้อมูลปริมาณธุรกรรมได้อย่างละเอียดลึกซึ้ง

### 2. CatBoost (Categorical Boosting)
CatBoost พัฒนาโดย Yandex มีจุดเด่นสำคัญ:
* **Ordered Boosting:** แก้ไขปัญหาการรั่วไหลของเป้าหมาย (Target Leakage) ที่เกิดขึ้นในกระบวนการ Boosting แบบเดิม โดยใช้หลักการเรียงลำดับเวลาสมมติเพื่อคำนวณ Gradient ส่งผลให้โมเดลมีความสามารถในการวางนัยทั่วไป (Generalization) สูงมาก และลดการเกิด Overfitting บนชุดข้อมูลที่มีความแปรปรวนสูง

### 3. Dual-GBDT Ensemble (การผสานพลังแบบ 50:50)
การรวมผลลัพธ์ของ LightGBM และ CatBoost เข้าด้วยกันด้วยค่าน้ำหนักเท่ากัน ($50:50$ Blend):
$$P_{\text{raw}}(Y=1|X) = 0.5 \times P_{\text{LGBM}}(Y=1|X) + 0.5 \times P_{\text{CatBoost}}(Y=1|X)$$
ช่วยลดความแปรปรวน (Variance Reduction) ของแบบจำลองเดี่ยว โดยอาศัยจุดแข็งของ LightGBM ในการแยกแยะค่าตัวเลขความถี่ และจุดแข็งของ CatBoost ในการรักษาเสถียรภาพของโครงสร้างต้นไม้

---

## 2.2 การจัดการปัญหาข้อมูลไม่สมดุลและการปรับเทียบความน่าจะเป็น (Imbalance & Probability Calibration)

### 1. ข้อจำกัดของ Accuracy และ ROC-AUC ในข้อมูล Churn
ในชุดข้อมูลที่มีสัดส่วนลูกค้าที่เลิกใช้บริการจริงเพียง $\approx 31\%$ การประเมินผลด้วย Accuracy จะทำให้โมเดลที่ทายว่าลูกค้าทุกคน "ไม่ Churn" ได้ค่าความแม่นยำสูงถึง $69\%$ ทั้งที่เป็นโมเดลที่ไร้ประโยชน์ทางธุรกิจ ส่วน ROC-AUC มักจะให้ค่าที่มองโลกในแง่ดีเกินจริง (Over-optimistic) เนื่องจากขนาดของ False Positive Rate (FPR) ถูกหารด้วยจำนวน True Negative ขนาดใหญ่

งานวิจัยนี้จึงกำหนดให้ **Precision-Recall AUC (PR-AUC)** เป็นตัวชี้วัดหลัก:
$$\text{PR-AUC} = \int_{0}^{1} P(R) \, dR$$
ซึ่งมุ่งเน้นการวัดความสามารถของโมเดลในการค้นหาลูกค้า Churn (Positive Class) ได้ถูกต้อง โดยไม่ถูกเจือปนด้วยขนาดของกลุ่มลูกค้าปกติ

### 2. การกำหนดจุดตัดด้วยฟังก์ชัน $F_2\text{-Score}$ (Optimal Threshold Tuning)
ในการดำเนินงานทางธุรกิจ ค่าเสียโอกาสจากการสูญเสียลูกค้ารายสำคัญโดยไม่รู้ตัว (False Negative) มีมูลค่าสูงกว่าค่าใช้จ่ายในการส่งข้อความหรือโทรติดต่อลูกค้าผิดราย (False Positive) อย่างมหาศาล ระบบจึงกำหนดเกณฑ์ตัดสินใจผ่านฟังก์ชัน **$F_\beta\text{-Score}$** โดยตั้งค่า $\beta = 2$:
$$F_2 = (1 + 2^2) \frac{\text{Precision} \times \text{Recall}}{(2^2 \times \text{Precision}) + \text{Recall}} = 5 \cdot \frac{\text{Precision} \times \text{Recall}}{4 \cdot \text{Precision} + \text{Recall}}$$
การ Optimize หาจุดตัด $\theta^*$ ที่ให้ค่า $F_2$ สูงสุด ช่วยให้โมเดลมีอัตราการตรวจจับลูกค้าที่จะเลิกใช้งาน (Recall) ได้ครอบคลุมสูงสุดบนระดับ Precision ที่ยอมรับได้

### 3. ทฤษฎีการปรับเทียบความน่าจะเป็นด้วย Isotonic Regression
คะแนนความน่าจะเป็นดิบที่ได้จากโมเดลตระกูล Boosting มักเกิดอาการ "Overconfident" (ความน่าจะเป็น $80\%$ อาจมีสัดส่วน Churn จริงเพียง $50\%$) จึงต้องนำผลลัพธ์ดิบมาปรับเทียบด้วย **Isotonic Regression**:
$$P_{\text{calibrated}} = \arg\min_{f} \sum_{i=1}^{n} (y_i - f(P_{\text{raw}, i}))^2 \quad \text{โดยที่ } f(x_1) \le f(x_2) \text{ เมื่อ } x_1 \le x_2$$
การปรับเทียบนี้เป็นแบบ Non-parametric Monotonic Step Function ช่วยรักษาลำดับการจัดอันดับเดิมไว้ได้อย่างสมบูรณ์ โดยประเมินคุณภาพความเที่ยงตรงด้วย **Expected Calibration Error (ECE)**:
$$\text{ECE} = \sum_{m=1}^{M} \frac{|B_m|}{N} |\text{acc}(B_m) - \text{conf}(B_m)|$$
และ **Brier Score**:
$$\text{Brier} = \frac{1}{N} \sum_{i=1}^{N} (P_i - Y_i)^2$$

---

## 2.3 การสร้างโมเดลยอดเงินที่มีความเบ้สูงและศูนย์หนาแน่น (Heavy-Tailed & Two-Part Hurdle Model)

### 1. ข้อจำกัดของโมเดลถดถอยแบบเดี่ยว (Single Regression Failure)
ในการพยากรณ์มูลค่าลูกค้า (CLV) ในระบบ Prepaid B2B ข้อมูลยอดชำระเงินในอนาคตมีลักษณะเป็น **Zero-Inflated** (ลูกค้ากว่า $75\%$ ยอดจ่ายเป็น 0 บาท) ร่วมกับลักษณะ **Extreme Right-Skewed** (มีลูกค้ารายใหญ่จ่ายหลายแสนหรือหลายล้านบาท) การใช้โมเดลเดี่ยว เช่น Linear Regression, Random Forest Regressor หรือ Tweedie Regression จะทำให้ค่า Mean ถูกดึงไปทางลูกค้ารายใหญ่ ส่งผลให้ยอดทำนายของลูกค้ารายย่อยสูงเกินจริง และทำให้ยอดรวมทั้งพอร์ตเกิดความคลาดเคลื่อนมหาศาล

### 2. สถาปัตยกรรม Two-Part Hurdle Model
สถาปัตยกรรม Hurdle Model แก้ปัญหานี้โดยแบ่งกระบวนการตัดสินใจออกเป็น 2 อุปสรรค (Two Hurdling Stages):
$$\mathbb{E}[Y | X] = P(Y > 0 | X) \times \mathbb{E}[Y | X, Y > 0]$$
1. **Part 1 (Payer Classifier):** ทำนายความน่าจะเป็นที่ลูกค้าจะเกิดธุรกรรมชำระเงินอย่างน้อย 1 บาทในรอบ 6 เดือนข้างหน้า ($p_{\text{pay}} = P(Y > 0 | X)$) ด้วย Binary Classifier
2. **Part 2 (Amount Regressor ใน Log-Space):** เทรนโมเดลถดถอย **เฉพาะกลุ่มประชากรที่ชำระเงินจริง ($Y > 0$)** โดยทำการแปลงตัวแปรเป้าหมายด้วย Log-Transform เพื่อลดความแปรปรวน:
   $$Z = \log(1 + Y)$$
   เมื่อโมเดลทำนายค่า $\hat{Z}$ ได้แล้ว จะทำการแปลงกลับสู่หน่วยเงินบาทด้วย:
   $$\hat{Y}_{\text{cond}} = \exp(\hat{Z}) - 1$$
3. **การคำนวณค่าคาดหมาย (Expected Hurdle Value):**
   $$\hat{Y}_{\text{hurdle}} = p_{\text{pay}} \times \hat{Y}_{\text{cond}}$$

### 3. การชดเชย Portfolio Multiplier (Jensen's Inequality Bias Correction)
ตามหลักการทางคณิตศาสตร์ว่าด้วยความไม่เท่ากันของเยนเซน (Jensen's Inequality) สำหรับฟังก์ชันนูน (Convex Function) ค่าคาดหมายของการแปลงเลขชี้กำลังจะมากกว่าหรือเท่ากับการแปลงเลขชี้กำลังของค่าคาดหมายเสมอ:
$$\mathbb{E}[\exp(Z)] \ge \exp(\mathbb{E}[Z])$$
การแปลงผลทำนายกลับจาก Log-space ด้วยสูตร $\exp(\hat{Z}) - 1$ จึงทำให้ยอดรวมเงินของทั้งพอร์ตโฟลิโอมีค่าต่ำกว่าความเป็นจริงเสมอ (Systematic Underestimation) ระบบจึงนำเสนอเทคนิคการปรับสเกลระดับพอร์ตโฟลิโอบน Validation Set:
$$M = \frac{\sum_{i \in \text{val}} Y_i}{\sum_{i \in \text{val}} \hat{Y}_{\text{hurdle}, i}}$$
$$\hat{Y}_{\text{final}} = M \times \hat{Y}_{\text{hurdle}}$$
โดยกำหนดขอบเขตความปลอดภัย $M \in [0.70, 1.40]$ เพื่อกำจัดความลำเอียงระดับพอร์ตโฟลิโอให้ใกล้เคียง $0\%$

---

## 2.4 ทฤษฎีการพยากรณ์แบบช่วงด้วยการถดถอยควอนไทล์ (Quantile Regression & Pinball Loss)
ในการวางแผนทรัพยากรเครดิต การพยากรณ์ปริมาณการใช้เพียงค่าเดียว (Point Forecast) ไม่สามารถสะท้อนความเสี่ยงได้ จึงประยุกต์ใช้ **Quantile Regression** เพื่อประมาณการค่าควอนไทล์ $\alpha \in (0, 1)$ โดยตรงผ่านฟังก์ชันวัตถุประสงค์ **Pinball Loss (Quantile Loss)**:
$$\mathcal{L}_\alpha(y, \hat{y}) = \begin{cases} \alpha (y - \hat{y}) & \text{ถ้า } y \ge \hat{y} \\ (1 - \alpha) (\hat{y} - y) & \text{ถ้า } y < \hat{y} \end{cases}$$

```
                Pinball Loss Shape for Quantiles
Loss
  ^                 alpha = 0.90 (เน้นบทลงโทษกรณีทายต่ำกว่าจริง)
  |                  /
  |                 /
  |      \         /     alpha = 0.50 (สมมาตร = Median Absolute Error)
  |       \       /
  |        \     /       alpha = 0.10 (เน้นบทลงโทษกรณีทายสูงกว่าจริง)
  +---------\---/------------> Error (y - y_hat)
             \ /
```

* **เมื่อ $\alpha = 0.50$ ($p_{50}$):** โมเดลจะมุ่งหาค่ามัธยฐาน ซึ่งมีความทนทานต่อ Outliers และ Whales สูงกว่าค่าเฉลี่ย (Mean)
* **เมื่อ $\alpha = 0.10$ ($p_{10}$) และ $\alpha = 0.90$ ($p_{90}$):** โมเดลจะสร้างขอบล่างและขอบบนของการใช้งาน ทำให้เกิด **Prediction Interval [p10, p90]** ที่ครอบคลุมความน่าจะเป็น $80\%$ ทางทฤษฎี

---

## 2.5 การอธิบายโมเดลด้วยเกมทฤษฎี (Explainable AI: Shapley Values & TreeSHAP)
เพื่อสร้างความโปร่งใส (Transparency) ให้แก่โมเดลและสนับสนุนการตัดสินใจของทีมธุรกิจ จึงนำทฤษฎี **SHAP (SHapley Additive exPlanations)** ซึ่งพัฒนามาจากเกมทฤษฎีความร่วมมือ (Cooperative Game Theory) มาประยุกต์ใช้ โดยค่า Shapley Value ($\phi_j$) ของตัวแปร $j$ คำนวณจาก:
$$\phi_j(x) = \sum_{S \subseteq F \setminus \{j\}} \frac{|S|!(|F| - |S| - 1)!}{|F|!} \left[ f(S \cup \{j\}) - f(S) \right]$$
โดย $F$ คือเซตของตัวแปรทั้งหมด และ $S$ คือเซตย่อยของตัวแปร

สำหรับโมเดลกลุ่มต้นไม้ ระบบเลือกใช้อัลกอริทึม **TreeSHAP** ซึ่งมีความซับซ้อนเชิงเวลาเพียง $O(T L D^2)$ (โดย $T$ คือจำนวนต้นไม้, $L$ คือจำนวนใบสูงสุด, $D$ คือความลึกสูงสุด) ทำให้สามารถคำนวณการมีส่วนร่วมของฟีเจอร์ของลูกค้าทุกรายในระบบได้อย่างรวดเร็วและแม่นยำ

