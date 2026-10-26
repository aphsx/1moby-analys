# Moby Analytics — UI Refactor Plan

แผนแก้ UI ทีละเฟส แต่ละเฟสคือ 1–2 PR ที่ merge ได้เองโดยไม่ทำให้ระบบพัง
อ่าน `DESIGN.md` (หน้าตา) และ `CONTENT.md` (คำและตัวเลข) ก่อนเริ่ม

**สิ่งที่ไม่เปลี่ยน:** routes, auth (`better-auth`), การดึงข้อมูล (`lib/api.ts`, `lib/ml-api.ts`), zustand stores, หน้า login, logic ของ ML และ API นอกเหนือจาก §3

แผนนี้แทนข้อ 5.2–5.4 และ 5.12 ของแผนหลัก [`docs/REFACTOR-PLAN.md`](../REFACTOR-PLAN.md) (ตัดสินใจ 2026-10-26: คง Tailwind 3 + React 18 ไม่ใช้ shadcn, คำบนจอเป็นไทยตาม `CONTENT.md`) ข้ออื่นของ Phase 5 ในแผนหลักยังใช้อยู่ ติ๊กเมื่อ merge แล้ว:

- [x] เฟส 0 — Foundation
- [x] เฟส 1 — Shell
- [ ] §3 Contract / API (ก่อนหรือคู่กับเฟส 2)
- [ ] เฟส 2 — หน้าภาพรวม
- [ ] เฟส 3 — รายชื่อลูกค้า
- [ ] เฟส 4 — หน้าลูกค้า
- [ ] เฟส 5 — หน้าที่เหลือ
- [ ] เฟส 6 — เก็บงาน

---

## 1. สภาพปัจจุบันที่ต้องแก้

| เรื่อง | ไฟล์ | ปัญหา |
|---|---|---|
| Tokens | `src/app/globals.css` | ตั้งชื่อตามสี (`--moby-500`, `--ink-4`), ปนกับ class Tailwind ตรง ๆ (`gray-200`, `slate-50`) ทำให้ทำธีมมืดไม่ได้ |
| ฟอนต์ | `globals.css` | MeroThai + Sarabun + Geometrica สามฟอนต์ ตัวเลขคนละฟอนต์กับข้อความ |
| สไตล์ต้องห้าม | `globals.css` | หัวตาราง uppercase + พื้นหัว + hover fill, `.type-label` uppercase, shimmer gradient, `.lift` shadow, sparkline, ซ่อน scrollbar ทั้งระบบ |
| Tailwind | `tailwind.config.js` | `extend: {}` ว่าง ไม่รู้จัก token |
| Palette | `features/dashboard/palette.ts` | gradient ต่อสถานะ lifecycle / brand |
| Sidebar | `components/sidebar.tsx` | หัวเป็น gradient + รูปพื้นหลัง, เมนูภาษาอังกฤษ |
| Primitives | `components/ui.tsx` | `KpiCard` + `Sparkline` + `DeltaPill` + `Skeleton` shimmer ไม่ตรงกับ DESIGN |
| Dashboard | `features/dashboard/dashboard-view.tsx` + การ์ด 9 ไฟล์ | KPI 5 ใบมีไอคอน, การ์ดย่อยหลายใบตอบคำถามซ้ำกัน, ไม่มีบล็อกหลัก |
| Format | `lib/format.ts` | `1.2M ฿` (สกุลเงินไว้ท้าย), `toLocaleString()` ไม่ระบุ locale, ชื่อเดือนอังกฤษ |
| คำบนจอ | `lib/nav.ts`, `customers-view.tsx`, `customer-detail-view.tsx` | อังกฤษปนไทย, "เครดิตใกล้หมด" สื่อผิด (ดู `CONTENT.md` §7) |

---

## 2. เฟส

### เฟส 0 — Foundation (ไม่มีหน้าตาเปลี่ยนแบบตั้งใจ ยกเว้นฟอนต์และสี)

1. โหลด IBM Plex Sans Thai ด้วย `next/font/google` ใน `app/layout.tsx` และตั้ง `<html lang="th">` (`DESIGN.md` §3)
2. แทนที่ token ใน `globals.css` ด้วยชุดใน `DESIGN.md` §2 (light + `[data-theme="dark"]`)
   - **ระหว่างย้าย** ให้ alias ของเดิมชี้ไปค่าใหม่ชั่วคราว เช่น `--ink-4: var(--muted); --line: var(--border);` เพื่อไม่ให้หน้าที่ยังไม่ได้แก้พัง แล้วค่อยลบ alias ในเฟส 6
3. อัปเดต `tailwind.config.js` ตาม `DESIGN.md` §2 (ต้องใช้ Tailwind ≥ 3.4.1 สำหรับ `darkMode: ["selector", …]`)
4. ลบสไตล์ต้องห้ามใน `globals.css` (`DESIGN.md` §10): `.type-label` uppercase, `.lift`, shimmer, `pulse-soft`, การซ่อน scrollbar, สไตล์ sparkline
5. เขียน `lib/format.ts` ใหม่ + unit test (`CONTENT.md` §2) แล้วไล่แทนที่ผู้เรียกทั้งหมด (`grep -rn "formatCurrency\|toLocaleString" src`)
6. เพิ่ม `lib/labels.ts` (`CONTENT.md` §4)
7. สร้าง primitives ใหม่ใน `components/`: `KpiStrip`, `InfoTip`, `Panel`, `StatusPill`, `Delta`, `DataTable` styles, `EmptyState`, `Skeleton` (เรียบ) ตาม `DESIGN.md` §6 ให้ของเดิมยังอยู่จนเฟสที่ใช้แทนเสร็จ

**Done เมื่อ:** typecheck + test ผ่าน, ทุกหน้าเปิดได้ ฟอนต์ใหม่โหลดจริง (DevTools → Network → font), ไม่มี class `.table-base` / `.skeleton` shimmer เหลือใช้งาน

### เฟส 1 — Shell

1. `components/sidebar.tsx`: พื้น `--ground`, เส้นขวา 1px, โลโก้ SVG บนพื้นเรียบ (ไม่มี gradient/รูป), เมนูไทยจาก `lib/nav.ts`, nav active = `--accent-soft` + `--accent-ink`, กลุ่ม "การทำนาย" สำหรับ รอบทำนาย/เทรนโมเดล/ความแม่นยำโมเดล, บัญชีอยู่ล่าง
2. `components/shell.tsx`: เลิกใช้ top bar ใหญ่ ย้ายตัวเลือกรอบทำนาย (`run-selector.tsx`) ไปแถว scope ใต้ชื่อหน้า (`DESIGN.md` §6.1) มือถือ < 860px ใช้ top bar 48px + เมนู sheet เต็มจอ
3. `lib/nav.ts`: label และ title เป็นไทย (`CONTENT.md` §7), `getRouteTitle` สำหรับหน้าลูกค้าคืน "บัญชี #{id}", ไอคอนเทรนโมเดลกับความแม่นยำโมเดลต้องไม่ซ้ำกัน
4. ตัวสลับธีม (ถ้าต้องการธีมมืดตอนนี้): ตั้ง `data-theme` บน `<html>` เก็บค่าใน localStorage พร้อม try/catch

**Done เมื่อ:** sidebar พับเป็นเมนูบนมือถือ, ไม่มี gradient ในกรอบ, ทุกเมนูภาษาไทย

### เฟส 2 — หน้าภาพรวม (`/`)

คำถามของหน้า: **รายได้ส่วนไหนเสี่ยงหาย และอยู่กับใคร**

| บล็อก | ข้อมูล | แทนที่ของเดิม |
|---|---|---|
| ชื่อหน้า + ข้อค้นพบ + ปุ่ม "เปิดรายชื่อ {n} ราย" | คำนวณจาก `value_risk_matrix` (high × high/critical) | `PageHeader`, `RunInsightCard` (ข้อความ AI ย้ายมาเป็นบรรทัดใต้ข้อค้นพบ ติดป้าย "สรุปจาก AI") |
| KPI strip 4 ช่อง: รายได้ที่เสี่ยงหาย (lead) · รายได้ 12 เดือน (เทียบปีก่อน) · การใช้งานลดลง/ไม่ใช้ · ต้องเติมเครดิตใน 14 วัน | `revenue.expected_at_risk`, `monthly_actual`, `usage_trend`*, `credit.by_urgency.critical` + `topup_due_7d` | `MetricCard` ×5 |
| บล็อกหลัก: `RiskMap` (หรือ `ValueBridge` / `UnitChart` ตามธีมที่ทีมเลือก) | `value_risk_matrix[].revenue_at_risk`* | `ValueRiskMatrixCard`, `RiskCard`, `ValueCard` |
| รายได้รายเดือน ปีนี้ vs ปีก่อน | `revenue.monthly_actual` (ต้องขยายเป็น 24 เดือน*) | `MonthlyRevenueCard` |
| Rail: ต้องโทรก่อน 5 ราย + "ดูทั้งหมด" | `top_priority` (ต้องเพิ่ม field*) | `TopPriorityCard` |
| Rail: ใกล้ถึงรอบเติมเครดิต | `credit.by_urgency` | `CreditUrgencyCard` |
| Rail: แนวโน้มการใช้งาน | `usage_trend`* | ใหม่ |
| (ย้ายออก) สัดส่วนสถานะลูกค้า | ไปเป็นแท็บบนหน้า ลูกค้า | `LifecycleMixCard` |

\* ต้องเปลี่ยน contract ตาม §3 ก่อน หรือทำ PR API ควบคู่

**Done เมื่อ:** ไม่มีการ์ดเดิมในตาราง "แทนที่" ถูก import อยู่, ฿ ใน KPI = ผลรวมในบล็อกหลัก (assert ใน dev), ทุกบล็อกมี loading/empty/error

### เฟส 3 — รายชื่อลูกค้า (`/customers`)

อ้างอิง canvas v5 "รายชื่อลูกค้า"

1. แท็บขีดเส้นใต้ตาม `lifecycle_stage` พร้อมจำนวน (จาก `summary.lifecycle`) — ไม่ต้องมีคอลัมน์สถานะในตารางเพราะแท็บบอกแล้ว
2. ตัวกรองด่วนเป็น segmented (presets เดิม เปลี่ยนชื่อตาม `CONTENT.md` §7) + จำนวนของแต่ละ preset
3. หัวข้อกลุ่ม + ⓘ + ประโยคสรุป ("210 ราย · รายได้ที่เสี่ยงหายรวม ฿9.3M") คำนวณจากผลกรองจริง
4. ตาราง: บัญชี+เหตุผลหลัก (2 บรรทัด) · โอกาสเลิกใช้ + pill · รายได้ที่เสี่ยงหาย · แนวโน้มการใช้งาน · เติมครั้งถัดไป (ชิดขวา, ≤ 14 วันสี negative)
5. (ทางเลือก) แผงขวาแสดงลูกค้าที่เลือก + ปุ่ม "เปิดหน้าลูกค้า"
6. Pagination แบบ "1–50 จาก N ราย", หัวตาราง sticky
7. มือถือ: ตารางเป็นแถว 2 บรรทัด ไม่ทิ้ง field

### เฟส 4 — หน้าลูกค้า (`/customers/[id]`)

อ้างอิง canvas v5 "หน้าลูกค้า"

1. แผงซ้าย: บัญชี #id, กลุ่มมูลค่า | ลูกค้าตั้งแต่ (`profile_snapshot.join_date`), ปุ่ม อีเมล/โทร/เพิ่มเติม, เข้าระบบล่าสุด, ช่องทางที่ใช้ (shares), การชำระเงิน (`total_revenue`, `avg_transaction_value`, ครั้งล่าสุด)
2. แท็บ: ภาพรวม · การทำนาย · การใช้งาน · การชำระเงิน (คงกราฟ `customer-usage-chart.tsx`, `customer-payment-chart.tsx` แต่ปรับตาม `DESIGN.md` §7)
3. แท็บการทำนาย: segmented (ทั้งหมด / ความเสี่ยงเลิกใช้ / มูลค่าและรายได้ / เครดิตและการใช้งาน) → section + การ์ด (ไอคอนกรอบเทา + ชื่อ + ค่า → ข้อมูล 3 คอลัมน์ → แถวล่าง)
4. ปัจจัยที่มีผลเป็นแถบสองทาง (`churn_factors`) แทนรายการข้อความ
5. คำอธิบาย AI (`ai_explanation`) อยู่ในการ์ดของตัวเอง ติดป้าย "สรุปจาก AI"
6. Label ทั้งหมดตาม `CONTENT.md` §3, §7

### เฟส 5 — หน้าที่เหลือ (ปรับ token อย่างเดียว ไม่ redesign)

`/runs`, `/training`, `/model-performance`, `/ai-chat`, `/profile`: ใช้ `Panel`, ตาราง, pill, ปุ่ม, ตัวเลขตาม format ใหม่ ข้อความใน `features/model-performance/metric-info.ts` ตรวจคำตาม `CONTENT.md`

### เฟส 6 — เก็บงาน

ลบ alias token เดิม, ลบ `palette.ts` gradients และรวม `lib/login-brand-colors.ts` เข้า token, ลบ primitives เก่าที่ไม่มีใครใช้, ตรวจมือถือ 390px ทุกหน้า, ตรวจ contrast ธีมมืด

**Done เมื่อ:** `git grep "\[color:var(--"` ว่าง (ใช้ชื่อ token ของ Tailwind แทน), ชื่อหน้าตรงกันทั้ง sidebar, หัวหน้า และ tab ของเบราว์เซอร์ (`lib/nav.ts`, metadata ใน `app/*/page.tsx`)

---

## 3. Contract / API ที่ต้องเพิ่ม

| เปลี่ยน | ที่ | ทำไม | แรง |
|---|---|---|---|
| ส่ง `revenue_at_risk` ใน `RunSummary.value_risk_matrix[]` | `packages/types/src/prediction.ts` + `routes/prediction-runs/summary.ts` | `fetchRunAggregates` คำนวณไว้แล้วแต่ type ไม่มี ใช้กับบล็อกหลัก | เล็ก |
| ส่ง `usage_trend` ใน `RunSummary` | เดียวกัน | มีใน aggregates แล้ว ใช้กับ KPI และ rail | เล็ก |
| `top_priority[]` เพิ่ม `revenue_at_risk`, `churn_risk_level`, `customer_value_tier`, `estimated_days_until_topup`, `top_factor` (ปัจจัยแรกของ `churn_factors`) | summary query | รายการ "ต้องโทรก่อน" ต้องบอกเหตุผลและตัวเงิน | กลาง |
| `monthly_actual` ขยายเป็น 24 เดือน (หรือเพิ่ม `monthly_actual_prev_year`) | `summary.ts` (`INTERVAL '12 months'`) | กราฟเทียบปีก่อน | เล็ก |
| filter `churn_risk_level` รับหลายค่า (`high,critical`) | `routes/prediction-runs/outputs.ts` (`eq` → `inArray`) | แก้บั๊ก preset (§4) | เล็ก |
| (ภายหลัง) จำนวนเดือนที่ใช้งานใน 5 เดือนล่าสุดต่อบัญชี | `features.py` → outputs | ตัวชี้วัดเดี่ยวที่แยกคนเลิกใช้ได้ดีมาก (ย้อนทดสอบ: ใช้ 1/5 เดือน เลิก 58%, ใช้ครบ เลิก 1%) | กลาง |

แก้ `packages/types` ก่อน แล้วให้ TypeScript บอกทุกจุดที่ต้องตาม (type-driven refactor)

---

## 4. ปัญหาข้อมูลที่กระทบ UI (แก้หรือรู้ไว้ก่อนแสดง)

1. **Preset "มูลค่าสูง + เสี่ยงสูง" ตัดลูกค้าระดับวิกฤตทิ้ง** — `customers-view.tsx` ตั้ง `churn_risk_level: "high"` และ API ใช้ `eq` คอมเมนต์บอกว่ากลุ่มวิกฤตจะขึ้นมาจากการเรียง แต่จริง ๆ ถูกกรองออกไปก่อนเรียง ลูกค้าที่เร่งด่วนที่สุดจึงไม่อยู่ในลิสต์ แก้ด้วย `inArray` ตาม §3
2. **`usage_trend` อาจนับ "ลดลง" เกินจริง** — ใน `features.py` ถ้าวันตัดข้อมูลเป็นต้นเดือน หน้าต่าง 90 วันล่าสุดครอบคลุม 2 เดือนเต็ม แต่หน้าต่างก่อนหน้าครอบคลุม 3 เดือน ลูกค้าที่ใช้คงที่จะถูกนับว่าลดลง ก่อนโชว์ KPI "การใช้งานลดลง" ให้แก้การนับ (เทียบเป็นรายเดือนเต็มเท่ากันสองช่วง) หรือแสดงเฉพาะ `no_usage`
3. **ตัวเลขเดียวกันต้องใช้ตัวกรองเดียวกัน** — `revenue.expected_at_risk` กรอง `lifecycle_stage = 'Active Paid'` แต่ `value_risk_matrix` ไม่ได้กรอง lifecycle ถ้าโชว์ทั้งสองบนหน้าเดียว ผลรวมอาจไม่ตรงกัน ให้ใช้ตัวกรองเดียวกันใน SQL และ assert ใน dev ว่า `sum(matrix.revenue_at_risk) ≈ expected_at_risk`
4. **ลูกค้าใช้งานไม่ถึง 90 วันไม่มีคะแนน** (`CHURN_ABSTAIN_MIN_TENURE_DAYS = 90`) — แสดงเป็น "ยังไม่มีคะแนน" และบอกจำนวนใต้บล็อกหลัก อย่าใส่เป็น 0%
5. **ข้อมูล mock ของบริษัท** มีจุดแปลก (ชีต SMS API = OTP ซ้ำกัน, บัญชี Ghost 63%) ออกแบบให้รองรับข้อมูลจริงที่สะอาดกว่า แต่อย่าใช้ช่องทาง API vs OTP เป็นข้อค้นพบจนกว่าข้อมูลจริงจะมา

---

## 5. Definition of Done (ทุก PR)

- [ ] `bun run typecheck` และ `bun test` ใน `apps/web` ผ่าน
- [ ] ผ่าน checklist ใน `DESIGN.md` ภาคผนวก B
- [ ] ไม่มีสีแบบ literal ใหม่ใน component (`grep -rn "#[0-9a-fA-F]\{6\}" src/components src/features` ควรเหลือเฉพาะที่จำเป็น)
- [ ] ไม่มีข้อความอังกฤษที่ไม่อยู่ในรายการศัพท์ที่อนุญาต (`CONTENT.md` §1)
- [ ] ภาพหน้าจอ 1440 / 768 / 390 แนบใน PR
- [ ] ถ้าแตะ contract: `packages/types` + API + เว็บ อยู่ใน PR เดียวกันหรือ merge ตามลำดับ types → api → web

## 6. วิธีตรวจด้วย taste skill ใน repo

```bash
# ตรวจ source หา pattern ต้องห้าม (gradient, shadow, uppercase label ฯลฯ)
node .agents/skills/design-taste-frontend/scripts/lint.mjs --app apps/web/src

# ตรวจหน้าที่รันอยู่ (ต้องมี Chrome; เก็บภาพไว้ที่ .taste-skill/inspect)
node .agents/skills/design-taste-frontend/scripts/inspect.mjs --app http://localhost:3000/ --out .taste-skill/inspect-dashboard
```

ข้อจำกัด: หน้าในระบบต้อง login (`proxy.ts`) inspector เข้าเองไม่ได้ ถ้าจะใช้ ให้ทำ dev-only route ที่ render หน้าจากข้อมูลตัวอย่างโดยไม่ต้อง login (ห้ามเปิดใน production) หรือดูภาพหน้าจอเองตาม checklist
เพิ่ม `.taste-skill/` ใน `.gitignore`

## 7. กติกาสำหรับ AI ที่ช่วยเขียนโค้ด

อยู่ใน `AGENTS.md` หัวข้อ "UI rules" แล้ว (`CLAUDE.md` import ไฟล์นั้น)
