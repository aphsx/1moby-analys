# การวิจัยทางเลือกโมเดล CLV และ Credit Forecast สำหรับ Moby Analytics

> เอกสารวิจัย (ภาษาไทย, technical terms เป็นภาษาอังกฤษตามธรรมชาติ)  
> วันที่: กันยายน 2026  
> ขอบเขต: ทางเลือกโมเดลเท่านั้น — **ไม่แก้โค้ด**  
> อ้างอิงสถานะปัจจุบัน: [`ML-CALCULATIONS-TH.md`](ML-CALCULATIONS-TH.md), [`MODEL-DEEP-DIVE-EN.md`](MODEL-DEEP-DIVE-EN.md), [`PROJECT-REPORT-TH.md`](PROJECT-REPORT-TH.md)

---

## Executive Summary

Moby Analytics ทำนาย **CLV 6 เดือน** (รายได้จาก payment ใน 180 วัน, zero-inflated + heavy tail) และ **credit burn 30/90 วัน** + **วันจนต้องเติม** บนข้อมูล prepaid B2B SMS/Email ที่ไม่มี subscription cancel event โดยใช้ feature แบบ point-in-time รายเดือน

**สรุปสั้น:**

1. **CLV revenue champion ปัจจุบัน (two-part quantile LGBM) สอดคล้องกับ literature** สำหรับ target แบบ zero-inflated + whale tail มากกว่า single-stage Tweedie หรือ BG/NBD+Gamma-Gamma เป็น revenue champion — งานวิจัยล่าสุดยืนยันว่า two-stage/hurdle ชนะ Tweedie บน retail CLV ที่มีศูนย์เยอะ ([Two-Stage Hurdle GBM, 2025](https://doi.org/10.3390/app16136550))
2. **ช่องว่างหลักที่ยังไม่ปิดคือ magnitude ของ whale** — ตรงกับ roadmap P1 "CLV log-space retrain" มากกว่าการเปลี่ยนตระกูลโมเดลทั้งหมด; BG/NBD ควรคงไว้เฉพาะ `p_alive` และ serve-time tail blend
3. **Credit stack (LGBM quantile + log-ratio anchor + CQR + XGBoost AFT)** ใกล้เคียง best practice ของ prepaid/usage SaaS แล้ว — การปรับปรุงที่คุ้มค่าที่สุดคือ **NGBoost/Tweedie conformal เป็น competitor**, **balance-depletion heuristic เป็น baseline**, และ **tune AFT distribution** ก่อนเปลี่ยนไป Cox/RSF
4. **อย่าไล่ PyMC hierarchical Bayes หรือ per-customer Prophet** เป็น production champion ใน scale ~10–50k customers / monthly cutoff — complexity สูง, point-in-time safety ยาก, และไม่ชนะ promotion gate ที่เน้น Spearman/coverage/stability
5. **ลำดับแนะนำ:** P0 = CLV log-space retrain + whale calibration; P1 = credit NGBoost competitor + prepaid runway baseline; P2 = MBG-NBD สำหรับ `p_alive`, Tweedie conformal, TA-CQR แทน CQR ถ้า coverage ไม่สมดุล

---

## Data Context Recap (บริบทข้อมูล Moby)

### ธุรกิจและ label

| มิติ | CLV | Credit |
|------|-----|--------|
| คำถาม | รายได้ 6 เดือนถัดจาก cutoff เป็นเท่าไร? | ใช้เครดิตเท่าไรใน 30/90 วัน? เมื่อไหร่จะเติม? |
| Label | `Σ payment.amount` ใน `[cutoff, cutoff+180d)` | `Σ usage` ใน 30d/90d; `days_until_next_topup` (censored ~70%) |
| ลักษณะ target | Zero-inflated, heavy right tail (whale) | Skewed count, high variance, regime change |
| Population | Active (paid + free ที่มี activity) | Active ทุกคนที่มีประวัติ |
| Cutoff | วันที่ 1 ของเดือน (บังคับ — usage รายเดือน) | เดียวกัน; credit อาจใช้ cutoff ใหม่กว่า churn 90 วัน |

### Feature ที่มี (point-in-time, `date < cutoff`)

- **27 base features** (recency, payment rhythm, usage momentum, channel mix, tenure) — ใช้ร่วม churn/CLV/credit
- **+4 credit features:** `credit_added_180d`, `credit_balance_proxy`, `credit_runway_months`, `credit_usage_decel`
- **ไม่ใช้ snapshot leak:** `credit_sms/email`, `expire_*` จาก profile sheet (export time ≠ cutoff)

### โมเดลปัจจุบัน (สรุป)

| งาน | Champion วันนี้ | บทบาทอื่น |
|-----|---------------|-----------|
| CLV revenue | **Two-part:** LGBM `P(revenue>0)` × LGBM quantile value (log-space) | BG/NBD → `p_alive` เท่านั้น; whale-tail blend ที่ serve time |
| Credit usage | **LGBM quantile** ×5/horizon, log-ratio กับ carryover, shrinkage λ, **CQR** | Baselines: `last_30d_carryover`, `moving_avg_90d` |
| Top-up timing | **XGBoost AFT** survival | — |

### เกณฑ์ประเมินและ promote

- **CLV:** `clv_composite` (Spearman + top-decile capture + portfolio bias + coverage + P(pay) ECE) — ranking สำคัญกว่า absolute magnitude
- **Credit:** pinball/MAE + **coverage p10–p90**; promote margin 0.5%, stability drop ≤25%
- **Backtest stability** บังคับ — ทางเลือกที่ชนะ validation แต่พังที่ cutoff เก่าจะไม่ขึ้น production

---

## CLV Alternatives (ทางเลือก CLV)

### 1. ทำไม target นี้ยาก — และครอบครัวโมเดลที่ literature แนะนำ

Target CLV ของ Moby คือ **semi-continuous revenue**: มวลจุดที่ศูนย์สูง + หางขวายาว ซึ่งตรงกับ:

- **Compound Poisson–Gamma (Tweedie, 1 < p < 2)** — จุดศูนย์ + positive skew ในตัว ([LightGBM Tweedie objective](https://lightgbm.readthedocs.io/en/stable/Parameters.html))
- **Two-part / Hurdle** — แยก `P(Y>0)` กับ `E[Y|Y>0]` ตาม law of total expectation ([Two-Stage Hurdle CLV paper](https://doi.org/10.3390/app16136550))
- **BTYD (BG/NBD + Gamma-Gamma)** — เหมาะกับ **frequency × monetary value** ใน non-contractual setting ([Fader et al. 2005 BG/NBD](https://brucehardie.com/papers/bgnbd_2004-04-20.pdf), [Gamma-Gamma note](https://www.brucehardie.com/notes/025/gamma_gamma.pdf))

Moby **เลือก two-part เป็น champion** หลังตัด candidate competition — สอดคล้องกับ evidence ว่า explicit zero/magnitude split ชนะ single-stage Tweedie บน zero-inflated CLV

### 2. BTYD variants: BG/NBD, Pareto/NBD, MBG/NBD

| โมเดล | สมมติฐานหลัก | Fit กับ Moby | ข้อมูลเพิ่ม | Gain คาดหวัง | Complexity |
|-------|-------------|-------------|------------|-------------|------------|
| **BG/NBD** (ใช้อยู่) | Poisson purchase + Beta dropout; ง่ายกว่า P/NBD | ดีสำหรับ `p_alive`; **ไม่ดีเป็น revenue champion** เพราะใช้แค่ RFM 4 ตัว ไม่ใช้ 27 features | RFM จาก payment (dedupe รายวัน) | Ranking ต่ำกว่า GBM; magnitude ดีที่ tail แต่ over-predict body | ต่ำ — `lifetimes` / [`btyd`](https://btyd.readthedocs.io/en/latest/index.html) |
| **Pareto/NBD** | SMC (1987) — ทฤษฎีเดิมของ BTYD | ผลใกล้ BG/NBD ใน practice ([Fader et al. 2005](https://brucehardie.com/papers/bgnbd_2004-04-20.pdf) แนะนำ BG/NBD แทนเพราะ implement ง่ายกว่า) | เหมือน BG/NBD | ไม่คาดว่าดีกว่า BG/NBD อย่างมีนัย | สูงกว่า BG/NBD — MLE ยาก |
| **MBG/NBD** | อนุญาต dropout ที่ t=0 — จัดการ zero-repeat ได้ดีกว่า | น่าสนใจถ้า cohort มีลูกค้าซื้อครั้งเดียวแล้วเงียบเยอะ ([Batislam et al. 2007](https://doi.org/10.1016/j.ijmedinf.2004.105700), [PyMC-Marketing MBG/NBD](https://www.pymc-marketing.io/en/stable/notebooks/clv/mbg_nbd.html)) | RFM เดิม | `p_alive` อาจแม่นขึ้นเล็กน้อย; revenue CLV ยังจำกัดที่ RFM | ปานกลาง — `btyd`/PyMC |

**คำแนะนำ:** คง BG/NBD สำหรับ `p_alive`; พิจารณา **MBG/NBD เป็น competitor เฉพาะ `p_alive`** (ไม่แทน two-part revenue) ถ้า realized outcome แสดง silent-decline false negative

### 3. Gradient boosting สำหรับ revenue

| ทางเลือก | จุดแข็ง | จุดอ่อนกับ Moby | บทบาทที่แนะนำ |
|---------|---------|----------------|--------------|
| **Two-part quantile (champion)** | แยก zero/magnitude ชัด; quantile ให้ p10–p90; ใช้ 27 features | Whale magnitude ยังต่ำถ้า value head ไม่ train log-space เต็มที่ | **คงเป็น champion** |
| **Tweedie LGBM/XGB** | Single model; native objective ([LightGBM](https://lightgbm.readthedocs.io/en/stable/Parameters.html)) | แพ้ two-part บน zero-inflated CLV ในงานวิจัยล่าสุด; tree ไม่ extrapolate whale | **Competitor ตอนเทรน** (มี legacy path อยู่แล้ว) — เปิด competition ถ้าต้องการ |
| **Hurdle (binary × Gamma)** | ใกล้ two-part; Gamma เหมาะ conditional positive | ไม่มี quantile interval ในตัวเหมือน twopart ปัจจุบัน | Competitor / fallback |
| **NGBoost (LogNormal/Tweedie dist.)** | Full predictive distribution, uncertainty เป็นชุดเดียว ([Duan et al. 2020](https://proceedings.mlr.press/v119/duan20a/duan20a.pdf)) | Training ช้ากว่า LGBM; tuning หนัก; promote gate เน้น Spearman ไม่ใช่ NLL | P2 competitor ถ้าต้องการ distributional CLV |

### 4. Log-space และ whale tail — สอดคล้อง roadmap P1

ปัญหาที่รู้แล้ว ([`MODEL-DEEP-DIVE-EN.md`](MODEL-DEEP-DIVE-EN.md) §A6, [`PROJECT-REPORT-TH.md`](PROJECT-REPORT-TH.md) §5.4):

- Tree **ไม่ extrapolate** เกินค่าสูงสุดใน leaf → under-predict whale
- **Whale-tail blend** (`max(twopart, bgnbd)` ที่ top decile) เป็น mitigation ชั่วคราว
- **Fix ที่ถูกต้อง:** retrain value head ใน log-space + magnitude calibration ที่รองรับ tail (P1)

ทางเลือกเสริม (ไม่แทน log-space retrain):

| แนวทาง | รายละเอียด | Priority |
|--------|-----------|----------|
| **Log-space value + quantile บน `log1p(revenue\|revenue>0)`** | ตรง P1 roadmap; RMSLE ลด, Spearman คง | **P0** |
| **Tail-aware loss / sample weighting** | ถ่วงน้ำหนัก whale ใน value stage | P1 ถ้า log-space ยังไม่พอ |
| **Serve-time ensemble:** `max(twopart, bgnbd×E[purchases])` | มีอยู่แล้วบางส่วน | คงไว้จนกว่า retrain ผ่าน gate |
| **Separate whale classifier + dedicated value model** | แยก decile บน train | P2 — complexity สูง |

### 5. Hierarchical Bayes / PyMC-Marketing

[PyMC-Marketing](https://www.pymc-marketing.io/en/stable/notebooks/clv/clv_quickstart.html) รองรับ BG/NBD, Pareto/NBD, MBG/NBD, Gamma-Gamma แบบ hierarchical — pool ข้าม cohort เพื่อ stability ([PyMC Labs hierarchical CLV](https://www.pymc-labs.com/blog-posts/hierarchical_clv))

| มิติ | ประเมิน |
|------|--------|
| Fit Moby | ดีถ้ามี covariate คงที่ (channel, status) หรือ cohort แยกชัด; Moby มี 27 tabular features อยู่แล้วใน GBM |
| ข้อมูลเพิ่ม | ไม่บังคับ แต่ต้องการ RFM + MCMC budget |
| Gain | น่าจะเล็ก vs two-part ที่ใช้ features เต็ม; ได้ uncertainty แบบ Bayesian |
| Complexity | สูง — PyMC, convergence, artifact pipeline ใหม่ |
| บทบาท | **ไม่แนะนำเป็น replacement**; อาจใช้ offline benchmark หรือ `p_alive` sensitivity analysis |

### 6. RFM + ML hybrids (causal / two-stage)

แนวทางที่พบใน industry:

1. **BTYD → features:** `expected_purchases`, `p_alive`, `E[monetary]` เป็น input ของ GBM ชั้นบน
2. **Residual modeling:** GBM ทำนาย residual ของ BG/NBD CLV

ข้อดี: รวม interpretability ของ BTYD กับ non-linear ของ trees  
ข้อเสีย: point-in-time ของ RFM features ต้อง rebuild ทุก cutoff; leakage risk ถ้า fit RFM บน full data  
**บทบาท:** P2 experiment — **serve-time feature ไม่ใช่ champion แยก**

---

## Credit Alternatives (ทางเลือก Credit / Usage)

### 1. ลักษณะปัญหาและครอบครัวโมเดล

Credit forecast ของ Moby แยกเป็น 2 sub-problem:

| Sub-problem | ลักษณะ | โมเดลที่เหมาะ |
|------------|--------|--------------|
| **Usage 30/90d** | Non-negative, skewed, regime change | Quantile regression, distributional GBM, Tweedie |
| **Days until top-up** | ~70% right-censored | Survival: AFT, Cox, RSF |

Industry prepaid/usage SaaS เน้น **burn rate + runway** มากกว่า pure time-series ต่อลูกค้า ([FP&A Trends — credit forecasting](https://fpa-trends.com/article/seats-credits-forecasting-credit-based-revenue), [prepaid wallet burn rate](https://getenso.ai/blog/prepaid-wallet-burn-rate-calculator/))

### 2. Usage forecasting alternatives

| ทางเลือก | Fit Moby | ข้อมูลเพิ่ม | Gain vs ปัจจุบัน | Complexity | บทบาท |
|---------|---------|------------|-----------------|------------|-------|
| **LGBM quantile + log-ratio anchor (champion)** | ดีมาก — มี shrinkage λ กันพัง, CQR กัน coverage | ไม่ต้อง | Baseline แข็ง | มีอยู่แล้ว | คง champion |
| **XGBoost quantile** (`ENABLE_XGB_CREDIT=1`) | เทียบได้กับ LGBM บน tabular | ไม่ต้อง | อาจชนะ/แพ้เล็กน้อย | ต่ำ — flag มีแล้ว | **Competitor ที่มีอยู่** — เปิดใน backtest |
| **NGBoost** (LogNormal / Tweedie) | ได้ full distribution ในตัวเดียว ([NGBoost docs](https://stanfordmlgroup.github.io/ngboost/1-useage.html)) | ไม่ต้อง | Uncertainty อาจดีกว่า quantile×5 แยก; pinball ใกล้เคียง | ปานกลาง — dependency ใหม่ | **P1 competitor** |
| **Tweedie LGBM (single-stage usage)** | เหมาะ zero+skew แต่ Moby มี anchor อยู่แล้ว | ไม่ต้อง | น่าจะไม่ชนะ log-ratio+quantile | ต่ำ | P2 ถ้า simplify pipeline |
| **Prepaid balance depletion model** | `runway = balance / daily_burn` — heuristic ที่ sales เข้าใจ | ใช้ `credit_balance_proxy` มีอยู่ | Magnitude baseline ดี; ranking ต่ำ | ต่ำมาก | **Baseline / blend กับ p50** |
| **Prophet / ETS per customer** | ต้อง ≥12–24 จุดรายเดือนต่อลูกค้า; Moby มี usage รายเดือนแต่หลายลูกค้า sparse | ไม่มี | แย่บน intermittent usage | สูงมาก (N models) | **ไม่แนะนำ** |
| **Global time-series (aggregated)** | ดีสำหรับ capacity planning ระดับ org ไม่ใช่ per-customer output | — | ไม่ตรง output contract | ปานกลาง | นอก scope `ml_prediction_outputs` |

### 3. Uncertainty: quantile vs probabilistic vs conformal

**ปัจจุบัน:** LGBM quantile + **CQR** ([Romano et al. 2019](https://arxiv.org/abs/1905.03222)) — มาตรฐาน industry สำหรับ adaptive intervals

ทางเลือก conformal ขั้นสูง (ถ้า coverage p10–p90 ไม่สมดุลหรือ interval กว้างเกิน):

| วิธี | ไอเดีย | เมื่อไหร่พิจารณา |
|------|--------|----------------|
| **CQR** (ใช้อยู่) | Quantile + calibration set | Default — ผ่าน gate coverage แล้วไม่ต้องเปลี่ยน |
| **Tweedie + conformal** ([Manna et al. 2025](https://arxiv.org/html/2507.06921v1)) | Nonconformity จาก Tweedie residual | ถ้าเปลี่ยนเป็น Tweedie champion |
| **TA-CQR** ([Tail allocation CQR](https://export.arxiv.org/pdf/2604.25202)) | ปรับ tail allocation แทน equal-tailed | Skew สูง, under-predict บ่อย |
| **Skew-adaptive CP** ([arXiv 2605.16145](https://arxiv.org/abs/2605.16145)) | เรียน asymmetry ของ error | P2 research |
| **CoCP / JAPAN** | Co-optimize center-radius / normalizing flows | Research-grade; ยังไม่ worth production complexity |

### 4. Top-up timing: survival models

| โมเดล | Censoring | Fit Moby (~70% censored) | ข้อดี | ข้อเสีย | บทบาท |
|-------|-----------|--------------------------|------|--------|-------|
| **XGBoost AFT (champion)** | ทุกชนิด รวม right-censored ([XGBoost AFT tutorial](https://xgboost.readthedocs.io/en/stable/tutorials/aft_survival_analysis.html), [Cho et al. 2020](https://arxiv.org/abs/2006.04920)) | ดี — ใช้ tabular features + censoring native | เร็ว, มีใน stack แล้ว | ต้องเลือก `aft_loss_distribution`; ไม่มี sklearn API เต็ม |
| **Cox PH (XGBoost `survival:cox`)** | Right-censored | พอใช้ | Interpretable hazard | สมมติ proportional hazards อาจผิดกับ prepaid top-up |
| **Random Survival Forest** ([scikit-survival](https://scikit-survival.readthedocs.io/)) | Right-censored | ต้อง events พอ — simulation แนะนำ ≥70 events ([Baralou et al. 2022](https://epidetect.gr/wp-content/uploads/2023/12/7_Biometrical-J-2022-Baralou-Individua-l-risk-prediction-Comparing-random-forest-.pdf)) | Non-linear | ช้ากว่า, calibration แย่กว่า Cox เมื่อ linear จริง |
| **NGBoost Survival** | Right-censored | ได้ distribution ของ survival time | Uncertainty | Dependency + tuning |

**คำแนะนำ:** คง **AFT**; ทดลอง `aft_loss_distribution` ∈ {`normal`, `logistic`, `extreme`} เป็น hyperparameter ก่อนเปลี่ยนตระกูล; Cox/RSF เป็น **P2 competitor** เฉพาะถ้า AFT calibration แย่บน backtest

### 5. Industry: telecom prepaid และ usage SaaS

| แหล่ง | บทเรียนสำหรับ Moby |
|-------|-------------------|
| [Top-up forecasting prepaid mobile (dissertation)](http://hdl.handle.net/10400.22/20157) | Feature จาก recharge + usage; regression + interval สำหรับ date/value top-up — ใกล้ AFT + quantile ของ Moby |
| [Prepaid mobile UR/UO model](https://doi.org/10.5897/ajmm2015.0445) | เน้น usage volatility ไม่ใช่แค่ recency — สนับสนุน momentum features (`usage_decel`, `credit_usage_decel`) |
| [Telecom quota forecasting (GitHub)](https://github.com/jsanchez-ds/telecom-quota-forecasting) | Quantile P90 + asymmetric loss สำหรับ cost structure ไม่สมมาตร — สอดคล้อง pinball quantile |
| [Usage-based revenue forecast (ORM)](https://orm-tech.com/blog/how-to-build-a-usage-based-revenue-forecast/) | แยก committed vs overage vs expansion — Moby ทำนาย usage ไม่ใช่ revenue โดยตรง แต่ logic เดียวกัน |

---

## Recommendation Matrix

| Alternative | CLV or Credit | Add as competitor? | Priority | Rationale |
|-------------|---------------|-------------------|----------|-----------|
| **CLV log-space retrain + tail calibration** | CLV | ไม่ — ปรับ champion ปัจจุบัน | **P0** | ตรง P1 roadmap; แก้ whale under-prediction ที่ root ไม่ใช่ blend ชั่วคราว |
| **Two-part quantile LGBM (status quo)** | CLV | — (champion) | — | สอดคล้อง literature zero-inflated CLV; promote ด้วย `clv_composite` |
| **BG/NBD (+ optional MBG/NBD) for `p_alive` only** | CLV | MBG/NBD: ใช่ (เฉพาะ p_alive) | **P1** (MBG) | `p_alive` ไม่มี ML equivalent; MBG ดีกว่าเมื่อ zero-repeat เยอะ |
| **BG/NBD+Gamma-Gamma as revenue champion** | CLV | ไม่ (ลองแล้ว) | P2 อย่างน้อย | RFM-only; แพ้ GBM บน ranking; เก็บเป็น tail blend เท่านั้น |
| **Tweedie LGBM/XGB (revenue)** | CLV | ใช่ (re-open competition) | **P1** | Benchmark ง่าย; อาจชนะบน magnitude บาง cohort แต่ two-part ชนะบ่อยใน literature |
| **NGBoost distributional (CLV or credit)** | Both | ใช่ | **P1** (credit), P2 (CLV) | ได้ uncertainty ชุดเดียว; credit ได้ประโยชน์ก่อน CLV |
| **LGBM quantile + anchor + CQR (status quo)** | Credit | — (champion) | — | Best practice quantile + valid coverage ([CQR](https://arxiv.org/abs/1905.03222)) |
| **XGBoost quantile credit** | Credit | ใช่ (flag มีแล้ว) | **P1** | เปิด `ENABLE_XGB_CREDIT=1` ใน backtest — cost ต่ำ |
| **Prepaid runway / depletion baseline** | Credit | ใช่ (baseline) | **P1** | `credit_runway_months` + burn heuristic — interpretable floor สำหรับ promotion gate |
| **XGBoost AFT top-up (status quo)** | Credit | — (champion) | — | รองรับ censoring ตรงปัญหา; tune distribution ก่อนเปลี่ยนตระกูล |
| **Cox PH / RSF top-up** | Credit | ใช่ (จำกัด) | P2 | ทดลองเมื่อ AFT ไม่ผ่าน stability; ต้อง events พอ |
| **TA-CQR / skew-adaptive conformal** | Credit | ใช่ (post-hoc) | P2 | ถ้า coverage ไม่สมดุลหลัง CQR มาตรฐาน |
| **Hierarchical Bayes CLV (PyMC)** | CLV | ไม่ | P3 | Complexity สูง; ไม่ชนะ tabular GBM ที่มี 27 features |
| **Per-customer Prophet/ETS** | Credit | ไม่ | — | Sparse monthly data; ไม่ scale |
| **Deep learning (NN tabular / DeepSurv)** | Both | ไม่ | — | Data ~1.5–50k rows; trees ชนะ; training cost สูง |

---

## สิ่งที่ไม่ควรไล่ (What NOT to Pursue)

1. **Per-customer time-series (Prophet, ARIMA, ETS ต่อ acc_id)** — usage รายเดือน intermittent; หลายลูกค้ามี <6 จุด; cold-start แย่; ไม่ point-in-time safe ถ้า fit ทั้ง series
2. **Pareto/NBD แทน BG/NBD** — ผลใกล้เคียง แต่ implement ยากกว่าโดยไม่มี gain ชัด ([Fader et al. 2005](https://brucehardie.com/papers/bgnbd_2004-04-20.pdf))
3. **BG/NBD+Gamma-Gamma เป็น revenue champion** — ไม่ใช้ 27 features; under-rank whale/momentum; Moby พิสูจน์แล้วว่า composite ~0.73 vs carryover ~0.45 แต่ twopart ชนะ BTYD
4. **Deep tabular (TabNet, FT-Transformer) สำหรับ CLV/credit** — sample size และ promotion stability gate ไม่เอื้อ; churn ใช้ TabICL ได้เพราะ binary + calibration ต่างจาก regression tail
5. **PyMC full production path** — MCMC runtime, artifact complexity, team skill; เหมาะ research ไม่เหมาะ Docker-first internal tool
6. **Causal uplift / marketing mix สำหรับ CLV** — ไม่มี treatment data; นอก scope
7. **Win-back / conversion models** — ตัดถาวรจาก roadmap
8. **R2/cloud AutoML (H2O, SageMaker)** — ขัดกับ artifact contract, reproducibility, และ gate ใน repo

---

## Alignment กับ Roadmap ที่มีอยู่

### P1: "CLV log-space retrain" ([`PROJECT-REPORT-TH.md`](PROJECT-REPORT-TH.md) §5.4)

| ทางเลือกในเอกสารนี้ | ความสัมพันธ์กับ P1 |
|--------------------|-------------------|
| **Log-space retrain (P0 ใน matrix)** | **คืองาน P1 โดยตรง** — ไม่ขัดกับทางเลือกอื่น แต่ควรทำก่อนเปิด competitor ใหม่ |
| Whale-tail blend | ลดความสำคัญหลัง retrain สำเร็จ; อาจเก็บเป็น safety net |
| Tweedie / NGBoost CLV | ทดลอง **หลัง** log-space twopart ผ่าน gate — ไม่งั้นเปรียบเทียบไม่ fair |
| MBG-NBD | แยก track — ปรับ `p_alive` ไม่ใช่ revenue |
| Hierarchical Bayes | ไม่แทน P1; เป็น research parallel ถ้ามีเวลา |

### Credit — ไม่มี P1 ชื่อเฉพาะใน roadmap

แนะนำจัดเป็น **Phase 2a** หลัง CLV log-space:

1. เปิด XGB quantile competitor + prepaid runway baseline
2. NGBoost credit pilot บน backtest เดียวกับ LGBM
3. AFT distribution tuning
4. TA-CQR เฉพาะถ้า coverage gate fail

---

## Implementation Sequencing (ลำดับการทำ)

```
Phase 0 (P0) — CLV magnitude
├── Retrain twopart value head ใน log-space เต็มรูปแบบ (train + serve symmetric)
├── ทบทวน OLS magnitude calibration บน validation หลัง retrain
├── วัด top-decile capture + portfolio bias บน backtest ทุก cutoff
└── ถ้าผ่าน gate → ลดหรือถอด whale-tail blend

Phase 1 (P1) — Low-risk competitors & baselines
├── Credit: เปิด ENABLE_XGB_CREDIT=1 ใน training competition
├── Credit: เพิ่ม baseline `runway_depletion` (balance / daily_burn)
├── CLV: re-open Tweedie เป็น competitor (optional env flag)
├── CLV: ทดลอง MBG/NBD สำหรับ p_alive เทียบ BG/NBD
└── Top-up: grid search aft_loss_distribution

Phase 2 (P2) — Distributional & conformal upgrades
├── NGBoost credit competitor (LogNormal หรือ Tweedie)
├── NGBoost CLV pilot (two-part style: Bernoulli + LogNormal ผ่าน custom)
├── TA-CQR แทน/เสริม CQR ถ้า coverage skew
└── Cox/RSF top-up ถ้า AFT ไม่ผ่าน stability

Phase 3 (P3) — Research only
├── PyMC hierarchical CLV benchmark offline
├── BTYD covariate extensions ([Hardie covariate note](https://www.brucehardie.com/notes/045/gamma_gamma_with_covars.pdf))
└── CoCP / flow-based conformal (paper replication)
```

### เกณฑ์ "พร้อม promote" (ยึดของเดิม)

- ชนะ champion ≥ margin (CLV 1%, credit 0.5%)
- Backtest worst-cutoff ไม่ตกจาก median เกิน threshold
- CLV: `clv_composite` ↑ โดยไม่แลก Spearman ลง
- Credit: coverage p10–p90 ในกรอบ; MAE ≤ 1.1× baseline

---

## References (แหล่งอ้างอิงหลัก)

### BTYD / CLV classical

1. Fader, P. S., Hardie, B. G. S., & Lee, K. L. (2005). ["Counting Your Customers" the Easy Way: An Alternative to the Pareto/NBD Model](https://brucehardie.com/papers/bgnbd_2004-04-20.pdf). *Marketing Science*.
2. Fader, P. S., & Hardie, B. G. S. (2013). [The Gamma-Gamma Model of Monetary Value](https://www.brucehardie.com/notes/025/gamma_gamma.pdf).
3. Fader, P. S., Hardie, B. G. S., & Lee, K. L. (2005). [RFM and CLV: Using Iso-value Curves for Customer Base Analysis](https://journals.sagepub.com/doi/pdf/10.1509/jmkr.2005.42.4.415). *Journal of Marketing Research*.
4. Batislam, E. P., Denizel, M., & Filiztekin, A. (2007). [Empirical validation and comparison of models for customer base analysis](https://doi.org/10.1016/j.ijmedinf.2004.105700). *International Journal of Research in Marketing*.
5. Hardie, B. G. S. [Incorporating Covariates in the Gamma-Gamma Model](https://www.brucehardie.com/notes/045/gamma_gamma_with_covars.pdf).

### Libraries

6. [lifetimes — GammaGammaFitter source](https://github.com/CamDavidsonPilon/lifetimes/blob/master/lifetimes/fitters/gamma_gamma_fitter.py)
7. [btyd documentation](https://btyd.readthedocs.io/en/latest/index.html) (successor to lifetimes)
8. [PyMC-Marketing CLV quickstart](https://www.pymc-marketing.io/en/stable/notebooks/clv/clv_quickstart.html)
9. [PyMC Labs — Hierarchical CLV](https://www.pymc-labs.com/blog-posts/hierarchical_clv)

### Gradient boosting / zero-inflated regression

10. [LightGBM Parameters (quantile, Tweedie, gamma objectives)](https://lightgbm.readthedocs.io/en/stable/Parameters.html)
11. [LightGBM quantile leaf renewal (GitHub #6062)](https://github.com/lightgbm-org/LightGBM/issues/6062)
12. Duan, T., et al. (2020). [NGBoost: Natural Gradient Boosting for Probabilistic Prediction](https://proceedings.mlr.press/v119/duan20a/duan20a.pdf). *ICML*.
13. [NGBoost usage documentation](https://stanfordmlgroup.github.io/ngboost/1-useage.html)
14. Two-Stage Hurdle GBM for zero-inflated CLV (2025). [Applied Sciences 16(13):6550](https://doi.org/10.3390/app16136550)
15. Manna, A., et al. (2025). [Distribution-Free Inference for LightGBM and GLM with Tweedie Loss](https://arxiv.org/html/2507.06921v1)

### Conformal prediction

16. Romano, Y., Patterson, E., & Candès, E. J. (2019). [Conformalized Quantile Regression](https://arxiv.org/abs/1905.03222). *NeurIPS*.
17. [CQR reference implementation (yromano/cqr)](https://github.com/yromano/cqr/blob/master/cqr_real_data_example.ipynb)
18. [Tail allocation CQR (TA-CQR)](https://export.arxiv.org/pdf/2604.25202)
19. [Skew-adaptive conformal prediction](https://arxiv.org/abs/2605.16145)

### Survival / top-up

20. [XGBoost AFT survival analysis tutorial](https://xgboost.readthedocs.io/en/stable/tutorials/aft_survival_analysis.html)
21. Cho, H., et al. (2020). [Survival regression with accelerated failure time model in XGBoost](https://arxiv.org/abs/2006.04920)
22. Baralou, V., et al. (2022). [Comparing random forests with Cox PH (simulation)](https://epidetect.gr/wp-content/uploads/2023/12/7_Biometrical-J-2022-Baralou-Individua-l-risk-prediction-Comparing-random-forest-.pdf)

### Industry / prepaid / usage SaaS

23. [Top-Up Forecasting of Pre-Paid Mobile Subscribers (thesis)](http://hdl.handle.net/10400.22/20157)
24. [Customer base management in prepaid mobile (UR/UO)](https://doi.org/10.5897/ajmm2015.0445)
25. [From Seats to Credits: Forecasting Credit-Based Revenue](https://fpa-trends.com/article/seats-credits-forecasting-credit-based-revenue)
26. [Prepaid wallet burn rate calculator (methodology)](https://getenso.ai/blog/prepaid-wallet-burn-rate-calculator/)
27. [How to Build a Usage-Based Revenue Forecast](https://orm-tech.com/blog/how-to-build-a-usage-based-revenue-forecast/)
28. [Telecom quota forecasting (quantile + asymmetric loss)](https://github.com/jsanchez-ds/telecom-quota-forecasting)

### Moby internal (canonical)

29. [`docs/ML-CALCULATIONS-TH.md`](ML-CALCULATIONS-TH.md) — สูตร, gate, promote
30. [`docs/MODEL-DEEP-DIVE-EN.md`](MODEL-DEEP-DIVE-EN.md) — rationale CLV whale blend, credit anchor/CQR
31. [`docs/PROJECT-REPORT-TH.md`](PROJECT-REPORT-TH.md) — P1 CLV log-space retrain

---

*เอกสารนี้จัดทำเพื่อสนับสนุนการตัดสินใจ roadmap โมเดล — การ validate ทุกทางเลือกต้องผ่าน promotion gate และ backtest stability บน DB จริงของ Moby*
