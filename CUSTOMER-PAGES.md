# Customer pages v5 — implementation spec

> Handoff for Claude Code. Visual + interaction reference: **`customer-pages.html`** (open in a browser; `#list` = รายชื่อลูกค้า, `#detail` = หน้าลูกค้า #10482). Every tab, filter, and row click in that file works — use it to check behaviour, not to copy markup.
> Companion docs (if present in `docs/ui/`): `DESIGN.md` (tokens, components), `CONTENT.md` (wording), `REFACTOR-PLAN.md`.

## 0. Ground rules

- **One question per page.** List = "ใครควรได้รับความสนใจก่อน และเพราะอะไร". Detail = "เกิดอะไรขึ้นกับลูกค้ารายนี้ และควรทำอะไรต่อ".
- Build with the app's own stack: Next 16 app router, Tailwind (DESIGN.md tokens), lucide icons, recharts for charts. **Do not port the prototype's inline styles or its mini runtime.**
- Font: IBM Plex Sans Thai (400/500/600) via `next/font/google`; `font-variant-numeric: tabular-nums` on every number column.
- Colour: brand blue `#006BFF` for primary/data, orange `#FC4C02` only for risk/alerts. No gradients, no shadows at rest; sections are split by 1px borders.
- All UI text is Thai. Currency `฿` **before** the number (`฿2.85M`, `฿1,080,000`) — fix `format.ts`, which currently puts `M ฿` after.
- Thai dates in the พ.ศ. short form: `12 ส.ค. 2568`.

## 1. Routes → files

| Route | File | Notes |
|---|---|---|
| `/customers` | `apps/web/src/features/customers/customers-view.tsx` | Lifecycle tab is in the URL: `?tab=paid\|free\|churned\|ghost` (default `paid`), plus `?preset=…&q=…&page=…` |
| `/customers/[id]` | `apps/web/src/features/customers/customer-detail-view.tsx` | Detail tab: `?tab=overview\|prediction\|usage\|payment\|follow` (default `overview`) |

Keep tab/filter state in search params so links and the back button work. Split each tab into its own component (`PaidTable`, `FreeTable`…, `OverviewTab`, `UsageTab`…) — no god component.

Remove the **กลุ่มลูกค้า** sub-nav item: groups are presets/filters on the list, not a page.

---

## 2. List page `/customers`

### 2.1 Layout
- Header: title รายชื่อลูกค้า, search (`ค้นหาเลขบัญชี`), export button.
- Underlined **lifecycle tabs** with counts. Each tab has its own columns, filters, sort, and side-panel facts.
- Filter row (pill buttons) → summary line → table → pagination `1–10 จาก N ราย`.
- Row click opens a **right-side panel** (desktop ≥1280px) with a short profile and a "เปิดหน้าลูกค้า" link. Below 1280px the row navigates straight to `/customers/[id]`.

### 2.2 Tabs

| Tab (`?tab=`) | Label | Who | Count (Excel run) | Default sort |
|---|---|---|---|---|
| `paid` | ใช้งาน · จ่ายเงิน | active and paid in the scoring window (the model population) | 2,572 (282 unscored) | รายได้เสี่ยงหาย desc |
| `free` | ใช้งาน · ไม่ได้เติมเงิน | still sending, but living on credit topped up before ม.ค. 2567 | 1,678 | หมดอายุ asc |
| `churned` | หยุดใช้ | no usage or payment for >180 days | 7,174 | ยอดชำระรวม desc |
| `ghost` | ไม่มีกิจกรรม | accounts with no activity at all (62.8% of all accounts) | 19,273 | สมัครเมื่อ desc |

Tab counts come from the real Excel run (via features.py/labels.py). Rows and per-preset sub-counts in the prototype are sample data.

### 2.3 Columns per tab

**Paid**
| Column | Kind | Field | ⓘ tooltip (short) |
|---|---|---|---|
| บัญชี · เหตุผล | acct | `acc_id` + top reason from `top_factors[0]` | — |
| โอกาสเลิกใช้ | pill | `churn_probability`, `churn_risk_level` → `78% · วิกฤต` | ความน่าจะเป็นที่จะเลิกใช้ใน 90 วัน · วิกฤต ≥74% |
| มูลค่า 6 ด. | num | `predicted_value_6m` | ยอดที่คาดว่าจะจ่ายใน 6 เดือนข้างหน้า |
| รายได้เสี่ยงหาย | num | `churn_probability × predicted_value_6m` | — |
| ใช้งาน 5 ด. | dots | active-month flags, last 5 months (**gap**, §4) | ● = เดือนที่ส่งข้อความ |
| เติมครั้งถัดไป | text | `next_topup_days` → `ใน 41 วัน` / `เลยกำหนด 12 วัน` | — |

Unscored customers (tenure < 90 days, model abstains) show a grey pill **ยังไม่มีคะแนน** and sort last. Never show 0%.

**Free**: บัญชี · เครดิตคงเหลือ (`credit`) · หมดอายุ (`expire`, orange if ≤14 days) · ส่งข้อความล่าสุด (`last_send`) · เติมครั้งถัดไป.

**Churned**: บัญชี · ยอดชำระรวม · ชำระล่าสุด (**gap**) · หยุดใช้มา (`today − last_send`) · ช่องทางหลัก.

**Ghost**: a note at the top ("สมัครแล้วแต่ไม่เคยส่งข้อความ — ใช้สำหรับแคมเปญ onboarding ไม่ใช่การรักษาลูกค้า") + บัญชี · สมัครเมื่อ (`join_date`) · ยอดชำระรวม.

Implement cells as a small set of typed renderers (`AcctCell`, `RiskPill`, `MoneyCell`, `ActivityDots`, `TextCell`) driven by a column config per tab — not hand-written `<td>`s per tab.

### 2.4 Preset filters (pill row, one active at a time, `?preset=`)
Each preset has a **title + summary line** shown above the table (computed from the active filter, not hard-coded):

| Tab | Preset key · label | Rule | Summary example |
|---|---|---|---|
| paid | `all` ทั้งหมด | — | 2,572 ราย · รายได้ที่เสี่ยงหายรวม ฿26.4M · 282 รายยังไม่มีคะแนน |
| paid | `critical` ต้องติดต่อด่วน | `churn_risk_level = critical` | 210 ราย · ฿9.3M |
| paid | `high` เสี่ยงสูง | `churn_risk_level = high` | 520 ราย · ฿9.5M |
| paid | `credit` ต้องเติมใน 14 วัน | `next_topup_days ≤ 14` | 118 ราย · ในนี้ 52 รายต้องเติมภายใน 7 วัน |
| paid | `lowuse` ใช้งาน ≤ 2 จาก 5 เดือน | active months ≤ 2 (gap #1) | 1,209 ราย · เมื่อย้อนทดสอบ เคยเลิกใช้จริง 42–71% |
| free | `all` · `expiring` เครดิตหมดอายุใน 90 วัน · `soon` ต้องเติมใน 14 วัน · `quiet` ไม่ได้ส่ง 60 วันขึ้นไป | | 149 ราย · เครดิตที่จะหมดอายุรวม 5.4M เครดิต |
| churned | `all` · `paid` เคยเติมเงิน (1,914, ชวนกลับ) · `never` ไม่เคยเติม (5,260, แคมเปญอัตโนมัติ) | | |
| ghost | `all` only | | |

**Bug to fix while doing this:** any multi-level risk filter (e.g. the current repo preset "มูลค่าสูง เสี่ยงสูงขึ้นไป") must use `inArray(churn_risk_level, ['high','critical'])`. Today it uses `eq` and silently drops critical customers.

### 2.5 Side panel (paid)
Account name and tier · the risk pill · 3 facts (มูลค่า 6 ด., เติมล่าสุด, รอบเติมปกติ) · top 3 factors · button เปิดหน้าลูกค้า.

---

## 3. Detail page `/customers/[id]`

### 3.1 Frame
- Breadcrumb `รายชื่อลูกค้า › บัญชี #10482`, status chip (`ใช้งาน · จ่ายเงิน`).
- **Left profile panel (fixed width ~320px)**: avatar, account, tier, "ลูกค้าตั้งแต่", actions (อีเมล / โทร / เพิ่มเติม), last login. Sub-tabs ข้อมูลบัญชี / งานติดตาม. Channel shares (SMS ส่งเอง 70%, SMS API 30%, Email ไม่ได้ใช้). Payment facts: ยอดชำระปีนี้, รอบเติมเงินปกติ, เติมครั้งล่าสุด (orange + "เลยรอบปกติ 3.2 เท่า" when it is >1.5× the usual cycle).
- Underlined tabs on the right: **ภาพรวม · การทำนาย · การใช้งาน · การชำระเงิน · การติดตาม**.
- Mobile (<1024px): the profile panel collapses into a summary card above the tabs; tabs scroll horizontally.

### 3.2 ภาพรวม (overview) — default
1. **Finding box** (orange tint), titled สิ่งที่ควรรู้ก่อนโทร: one generated sentence + one evidence line + the CTA **สร้างงานโทรหาลูกค้า**. Example: "หยุดส่งข้อความตั้งแต่ ก.ย. ทั้งที่เพิ่งเติม ฿1.26M เมื่อ 12 ส.ค. เครดิตยังเหลือ 6.9M เครดิต". Write the sentence from rules (credit left + months inactive + last top-up), not an LLM.
2. **KPI strip (4)**: โอกาสเลิกใช้ (with tier threshold) · มูลค่า 6 เดือน (with interval) · รายได้ที่เสี่ยงหาย (rank among N) · เติมครั้งถัดไป (usual cycle).
3. **Usage + top-ups, 12 months**: bars = messages per month (millions); dots above = months with a top-up, labelled with the amount; a dashed band with the caption "ไม่มีการส่งข้อความ N เดือน" over the trailing zero months.
4. Two cards: **ทำไมโมเดลให้ความเสี่ยง…** (top 3 factors with ↑/↓ direction, link to the prediction tab) · **เหตุการณ์ล่าสุด** (merged timeline: prediction, login, last send, top-ups).

### 3.3 การทำนาย (prediction)
Keep the existing segmented content (churn / value / next top-up) as-is inside this tab; restyle only.

### 3.4 การใช้งาน (usage)
KPIs (total messages this year, monthly average, active months, last send) · stacked monthly bars BC/API/OTP per channel · channel mix · 5-month activity squares.

### 3.5 การชำระเงิน (payment)
- KPIs: ยอดชำระปีนี้ `฿6.12M` (+13.3% vs `฿5.40M`) · จำนวนครั้ง · เฉลี่ยต่อครั้ง · เติมล่าสุด (orange when overdue).
- **Gap chart**: days between consecutive top-ups `[42, 46, 45, 45, 43]`, plus a final orange bar "ตอนนี้ (ยังไม่เติม)" = 142, with a dashed line at the usual cycle (median gap, 45).
- **Next top-up**: big `ใน 41 วัน` + approximate date; a range bar 0–90 days with the 18–77 prediction interval shaded and a marker at 41.
- **History table**: วันที่ · ยอดชำระ · เครดิตที่ได้ · ห่างจากครั้งก่อน; latest 6, "ดูทั้งหมด N ครั้ง" button.

### 3.6 การติดตาม (follow)
Contact log form (channel, outcome, note, next follow-up date) + history list. Empty state: "ยังไม่มีการติดตาม — บันทึกการโทรครั้งแรกเพื่อเริ่มดูผลลัพธ์". Requires a new table (§4).

---

## 4. Data and contract gaps (backend work before the UI is complete)

| # | Needed by | Gap | Suggested fix |
|---|---|---|---|
| 1 | list "ใช้งาน 5 ด.", usage tab | active-month flags not in output | emit `active_months_5m: boolean[5]` from `features.py`. **Also fix the usage window bug (2- vs 3-month window) there.** |
| 2 | churned tab, detail KPIs | last payment date + amount | add `last_payment_date`, `last_payment_amount` to `profile_snapshot` |
| 3 | payment tab | per-customer payment history | `GET /customers/:id/payments` from Backend_payment (`payment_date, credit_add, amount, credit_type`) |
| 4 | overview chart, usage tab | monthly usage per channel | `GET /customers/:id/usage?months=12` → `{year, month, channel, usage}[]` |
| 5 | follow tab, task CTA | no contact log | new table `customer_contacts(id, acc_id, channel, outcome, note, next_follow_up, created_by, created_at)` |
| 6 | paid filter | `eq` on `churn_risk_level` drops critical | `inArray` with multiple levels |
| 7 | KPI "อันดับ 1 จาก N" | rank not exposed | compute in the list query (window function) or client-side from the sorted list |

Note: `RunSummary` is also missing `value_risk_matrix.revenue_at_risk` and `usage_trend`, which `fetchRunAggregates` already computes. These are dashboard gaps, not blockers here.

Until each gap ships, render that block's **empty/unavailable state**. Do not fake the numbers.

## 5. Real vs sample data in the prototype
- **Real** (Excel run at 1 ม.ค. 2569): the four tab counts, channel names, the 14/30/90 urgency cutoffs, P90/P50 value tiers, the 74% critical threshold, and the 90-day abstain rule.
- **Sample**: account #10482 and all its numbers, every prediction value, list rows, and other tab counts.

## 6. States (every block)
- **Loading**: skeleton matching the block's final height, with no layout shift.
- **Empty**: one sentence saying why, plus the next action when there is one.
- **Error**: inline message + retry; never a blank card.
- **Unscored**: "ยังไม่มีคะแนน — ลูกค้าใหม่กว่า 90 วัน" instead of the probability and factors.

## 7. Acceptance checklist
- [ ] Tab, preset, and page survive a reload and the back button (search params).
- [ ] Any multi-level risk filter includes critical customers (`inArray`, with a test).
- [ ] Unscored customers show the grey pill and sort last; nothing shows 0% for unscored.
- [ ] Money shows `฿` before the number everywhere; numbers are tabular and right-aligned.
- [ ] Every ⓘ tooltip opens by keyboard (focus) as well as hover.
- [ ] Charts have a text alternative (aria-label or a visually hidden table).
- [ ] No horizontal page scroll at 375px; the table scrolls inside its own container with the บัญชี column sticky.
- [ ] Orange appears only for risk/overdue/alert, never decoration.
- [ ] Each data gap in §4 shows its unavailable state, not placeholder numbers.
- [ ] Lighthouse a11y ≥ 95 on both routes.

## 8. Suggested order of work
1. Fix `format.ts` currency + the `inArray` filter (small, unblocks correctness).
2. List page with the paid tab only, column config + cell renderers.
3. Other list tabs.
4. Detail frame + overview tab, using the data already available (gaps → unavailable state).
5. Backend gaps #1–#4, then the usage and payment tabs.
6. `customer_contacts` + follow tab.
