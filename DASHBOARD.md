# Overview page (Dashboard) v5 — implementation spec

> **Audience:** Claude Code, working in `demo-predict`.
> **Visual + interaction reference:** `dashboard-v5.html`. It is a standalone page; open it in a browser. Everything that can be hovered, switched or clicked in the design works there. Use it to check *behaviour and hierarchy*; **do not copy its markup, inline styles or mini runtime**.
> **Static reference:** `dashboard-v5.png`, a full-page render at 1440 px.
> **Companion docs (already in repo):** `docs/ui/DESIGN.md` (tokens, components, chart rules), `docs/ui/CONTENT.md` (wording), `docs/ui/REFACTOR-PLAN.md`.
> **Source design:** canvas artboard `DashboardV5.dc.html` on page "v5 · ธีม CRM".

---

## 0. TL;DR for the implementer

1. The route stays `/` → `apps/web/src/features/dashboard/dashboard-view.tsx`. This is a **re-layout and extension of the current overview** (phase 2), not a new page. `overviewModel()`, `RiskMap`, `CallFirstList`, `TopupUrgency`, `MonthlyRevenue`, `PageHeader`, `KpiStrip`, `InfoTip`, `Panel` all exist and are reused or reshaped.
2. The page grows from "KPI + risk map + rail" into **KPI strip + two titled sections**:
   - **Section 1: "ธุรกิจปี 2568".** Facts from payments and usage: monthly trend, revenue concentration, customer base.
   - **Section 2: "ลูกค้าที่จ่ายเงิน · ใครเสี่ยงจะหาย".** Predictions plus one usage signal: value × risk heat grid, sending-months histogram, top-5 call list, next top-up.
3. Every card carries a provenance chip: **ข้อมูลจริง** (computed from imported data) or **คาดการณ์** (model output). This is a hard requirement. People must never mistake a prediction for a fact.
4. About 70% of the data already exists in `RunSummary`. The rest is listed in **§11, Data contract**, with SQL sketches. Ship the UI first with **unavailable states** for missing fields, then add the API fields.
5. Build every number once, in `overview-model.ts` (pure, unit-tested). Components only format and draw.

### 0.1 Revisions after the data check (11 Nov 2026)

The spec was checked against the real run on the Excel workbook (cutoff 1 ม.ค. 2569, 2,282 scored customers). Every change below is already folded into the sections. Terms (Payer, Call List, Playbook, Backtest, Value Tier, Credit Urgency) are defined in `GLOSSARY.md`.

| # | Change | Why (real data) |
|---|---|---|
| R1 | The top-5 table, header CTA and finding use the **Call List**: every scored Active Paid customer by revenue at risk, with no tier or risk filter | One account, #296269 (high × medium), holds 49% of the revenue at risk; the high × high/critical filter hid it |
| R2 | The top-5 reason line falls back to value tier + CLV | The churn champion (TabICL) gives no SHAP factors, so `top_factor` is null on every row |
| R3 | The trend note and KPI 1 ⓘ name the top contributor when it drives more than half the growth | #296269 is 76% of the H2 − H1 increase; without it revenue grows 6% and revenue per payer falls 4% |
| R4 | "ลูกค้าที่ใช้งาน" means a Lifecycle Stage only; the monthly usage count is "ลูกค้าที่ส่งข้อความ"; "ผู้จ่ายเงิน" counts payments above ฿0 | "Active" had two meanings on one page; a ฿0 credit grant is not a payment |
| R5 | The heat grid gets a fourth row, `none` ("คาดว่าไม่จ่าย") | 539 scored customers are predicted to pay ฿0; without them KPI 4 (899) ≠ grid (474) and the subtitle (2,282) ≠ cells (1,743) |
| R6 | The cell's Playbook action is the only "what to do"; the customer page drops the Segment pill, "กลุ่มแนะนำ" and "อันดับที่ต้องดูแล" | Segment names contradict the Value Tier for 705 customers; #296269 is first on the Call List but shows "อันดับที่ต้องดูแล 203" |
| R7 | Sending months (was "active months"), its backtest and its list filter are computed in the API, with no ML change | One SQL reproduces 71 / 58 / 42 / 25 / 17 / 1% at 1 ก.ค. 2568; the backtest date must be a month start |
| R8 | The top-up card says "อาจเติม", shows the model's hit rate and draws all five buckets | About 1 in 4 predicted ≤ 14-day top-ups happen (credit backtests: 24–26%); > 90 days is 12.5%, not 77% |
| R9 | Churn thresholds and the top-up hit rate come from the run's own model versions | The current champion's values are wrong for runs scored by an earlier model |
| R10 | `run.data_start` replaces `monthly_actual[0]` as the data start | `monthly_actual[0]` is always cutoff − 24 months, whatever the data covers |
| R11 | KPI 3's ⓘ sets the 6-month CLV against the last 6 months' actual revenue | KPI 3's customers are predicted to pay ฿364.0M in 6 months; they paid ฿222.3M in the last 6 (1.64×; 1.45× without #296269). Fixing CLV is ML work, outside this spec |

---

## 1. The page's job

**Question the page answers:** *"How is the business doing, and which paying customers should we act on first?"*

**Who reads it:** a sales lead or manager, once a day or once per prediction run, often on a laptop and sometimes on a phone.

**Reading order (top → bottom = most general → most actionable):**

| Order | Block | Sub-question it answers |
|---|---|---|
| 1 | Header | Which run am I looking at? What's the one-line finding? |
| 2 | KPI strip | Four numbers: revenue, active base, money at risk, people at risk |
| 3 | Monthly trend | Is revenue growing, and is that from more payers or more per payer? |
| 4 | Revenue concentration | How dependent are we on a few accounts? |
| 5 | Customer base | How big is the live base vs dormant accounts? |
| 6 | Value × risk heat grid | Where is the revenue at risk concentrated, and what do we do about each cell? |
| 7 | Sending months | What behavioural signal predicts churn, and how many customers show it? |
| 8 | Top 5 call list | Exactly who to call first |
| 9 | Next top-up | Who will need to buy credit soon (a sales opportunity, not a risk) |

Design principle behind the order: **facts before predictions**. Section 1 builds trust with numbers people can verify against their own books. Section 2 then asks them to act on model output.

---

## 2. What changes vs the current overview

| Current (repo) | v5 | Action |
|---|---|---|
| `PageHeader` with `finding` + `AiSummaryLine` + CTA "เปิดรายชื่อ N ราย" | Same header. The prototype shows a static subtitle only because a canvas has no run data. | **Keep** the existing header: finding sentence, AI line, CTA and `RunScope`. Add the data-period subtitle (§5). |
| `KpiStrip`: at risk (lead), revenue 12m with YoY, paid-no-usage, top-up ≤14 d | Revenue + spark, active customers + spark, at risk + meter, high-risk count + split bar | **Change** tiles (§6). The `KpiStrip` component needs two optional slots: `viz` (spark/meter) and `chip` (provenance). |
| `RiskMap`: squares whose area ∝ revenue at risk | Heat grid: count + ฿ printed in each cell, fill = binned revenue at risk, a selected-cell action panel | **Rewrite internals** of `risk-map.tsx`, keeping its props (§8.1). |
| `MonthlyRevenue`: line chart, this year vs last year (in rail) | Column chart with a metric switch (revenue / payers / active), half-year average lines, tooltip with all three metrics, table view | **Replace** with `monthly-trend.tsx` (§7.1). Keep `MonthlyRevenue` only if YoY is still wanted (see §17, open decision D1). |
| `CallFirstList` (rail, top 10) | Table card "5 รายที่รายได้เสี่ยงหายมากที่สุด" (the head of the Call List) with risk pill, sending-month dots, ฿ at risk + inline meter, next top-up | **Reshape** into `top-risk-table.tsx` (§8.3). |
| `TopupUrgency` (rail) | Card with 5 horizontal bars (≤7, 8–14, 15–30, 31–90, > 90 d), two stats, link | **Reshape** (§8.4). |
| — | Revenue concentration card | **New** `revenue-concentration.tsx` (§7.2) |
| — | Customer base card | **New** `customer-base.tsx` (§7.3) |
| — | Sending months card | **New** `sending-months.tsx` (§8.2) |
| Right rail layout (`GRID` with 384 px rail) | Full-width sections with 2-column rows | **Change** layout (§4) |
| Customer page: Segment pill, "กลุ่มแนะนำ" row, "อันดับที่ต้องดูแล" | The Playbook action of the customer's own cell | **Replace** (§8.1, R6). The ML still writes `segment` and `priority_rank`; the CSV export and the AI semantic layer keep them |

---

## 3. Ground rules (apply to every block)

- **Tokens, not hexes.** Use `globals.css` tokens via Tailwind (`bg-surface`, `text-muted`, `border-border`, `rounded-card`, …). The prototype's 16 px radii and literal hexes come from the v5 canvas styling. The repo's tokens (radius 8 px, etc.) win. New chart colours are added as tokens in §12, with light **and** dark values.
- **Font:** `--font` (IBM Plex Sans Thai). Use `tabular-nums` only where numbers align in columns (tables, axis ticks, lists). **Don't** use it on KPI values or big standalone figures: tabular figures look loose at display size.
- **Currency:** `formatBahtCompact` / `formatBaht`. ฿ goes **before** the number (`฿413.6M`). Counts use `formatCount` + " ราย". Dates are Thai short with a Buddhist-era year (`formatDate`, `formatMonth`).
- **Colour meaning is fixed:**
  - Accent blue (`--chart-1` / `--accent`) = the data itself.
  - Orange (`--risk-emph`, `--heat-*`, `--negative`) = **risk only**.
  - Grey (`--chart-muted`) = context or de-emphasised.
  - Green (`--positive`) appears only in a positive `Delta`.
  - Never colour text with a series colour. Text uses `--text` / `--muted` / pill ink tokens.
- **One axis per chart. No dual-axis charts.** Different measures get a switch or separate charts (see §7.1 for why).
- **Provenance chip on every card header**, top-right: `ข้อมูลจริง` (neutral pill) or `คาดการณ์` (accent-soft pill). Use `StatusPill` tones `neutral` / `accent` (both exist in `PILL_TONES`).
- **Single source of numbers:** every figure is computed in `overview-model.ts`. A figure shown twice (e.g. 899 in KPI 4 and in the heat grid's column totals) reads the same model field. Totals are summed from the rows shown, as the existing `assertAtRiskMatches` already enforces.
- **Card titles state the finding, not the chart type.** Write "รายได้ครึ่งปีหลังโตขึ้น 25%", not "รายได้รายเดือน". Titles are computed from data (§7–8 give the rule for each). When the data does not support the claim (e.g. growth ≤ 0), fall back to the neutral title given for that card.
- **Tooltips enhance, never gate.** Every value in a tooltip is also reachable without hovering: direct labels, the table view, or the list under a chart.
- **Info tips (ⓘ):** use the existing `InfoTip`. It must open on keyboard focus as well as hover. The text for each is in §15.

---

## 4. Layout

Content width at 1440: 1440 − 232 sidebar − 2 × 32 padding = **1144 px**.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PageHeader: ภาพรวม · subtitle · finding · AI line · [RunScope] [CTA]     │
├──────────────────────────────────────────────────────────────────────────┤
│ KPI strip: [Revenue+spark] [Active+spark] [At-risk+meter] [High-risk+bar]│
│                                                                          │
│ Section heading 1: ธุรกิจปี 2568 — รายได้มาจากไหน และฐานลูกค้าเป็นอย่างไร │
│ ┌──────────────── Monthly trend (flex 2) ─────┐ ┌─ Concentration (1) ──┐ │
│ └─────────────────────────────────────────────┘ └──────────────────────┘ │
│ ┌──────────────────────── Customer base (full) ──────────────────────────┐│
│ └────────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│ Section heading 2: ลูกค้าที่จ่ายเงิน · ใครเสี่ยงจะหาย — …               │
│ ┌──────────────── Value × risk heat grid (2) ─┐ ┌─ Sending months (1) ─┐ │
│ └─────────────────────────────────────────────┘ └──────────────────────┘ │
│ ┌──────────────── Top-5 call list (2) ────────┐ ┌─ Next top-up (1) ────┐ │
│ └─────────────────────────────────────────────┘ └──────────────────────┘ │
│ Footnote: provenance + model versions                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Rows:** `grid gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_360px]`. The wide card is left; the narrow card is right, 360 px. Cards in one row stretch to equal height. The narrow card pins its callout or link to the bottom (`mt-auto`).
- **Below 1180 px:** every row stacks to one column, in source order.
- **KPI strip:** 4 columns ≥ 1024 px, 2 × 2 from 560 to 1023, 1 column below 560. Tiles are separated by 1 px hairlines (`gap-px bg-border` trick) inside one bordered box.
- **Section headings:** `h2` at `text-section`, weight 600, with a muted one-line description on the same baseline (it wraps on mobile). 12 px extra top padding separates sections.
- **Mobile (390 px):**
  - No horizontal *page* scroll.
  - Wide content (the heat grid at min-width 520 px, the top-5 table at min-width 660 px) scrolls **inside its card** (`overflow-x-auto`). In the top-5 table the account column should be sticky.
  - Monthly trend x-labels thin to every other month below 640 px.
  - Bar widths shrink proportionally.

---

## 5. Page header

| Element | Content | Source |
|---|---|---|
| Title | `ภาพรวม` (from `getRouteTitle("/")`) | existing |
| Subtitle (new) | `ข้อมูลการชำระเงินและการใช้งานจริง {data start} – {last full month} · ผลทำนายรอบ {cutoff}` | `run.data_start` (gap G9; not `monthly_actual[0]`, which is always cutoff − 24 months), last month before cutoff, `run.cutoff_date` |
| Finding | `finding(model)`. The first clause is unchanged (high-tier share). The second clause becomes the head of the Call List: `{k} รายถือ {share}% ของรายได้ที่เสี่ยงหาย`, where k = the fewest `top_priority` rows (≤ 10) that together hold ≥ 25% of `atRisk`. Omit the clause when 10 rows hold less. Real: `85% ของรายได้ที่เสี่ยงหายอยู่กับลูกค้ามูลค่าสูง 201 ราย · 1 รายถือ 49% ของรายได้ที่เสี่ยงหาย` | existing + F1 |
| AI line | existing `AiSummaryLine` | existing |
| Right side | existing `RunScope` (run picker) + CTA `เปิดรายชื่อที่ต้องโทร` → `/customers?run={id}` (the paid tab, whose default sort is `revenue_at_risk:desc`). No count: the Call List is every scored customer, so a count adds nothing. Show it when `scored > 0` | existing + R1 |
| Export (prototype "ส่งออกรายงาน") | **Out of scope** for this PR. Leave it out rather than ship a dead button. | — |

---

## 6. KPI strip

All four tiles share one anatomy, top to bottom:
- **Label row:** label + `InfoTip` + provenance chip, chip right-aligned.
- **Value row:** value at `text-kpi`/`lead` size, weight 600, proportional figures. An optional viz sits to the right of the value (spark) or under it (meter/bar).
- **Caption:** 13 px muted, one line on desktop.

| # | Label | Value | Viz | Caption | Chip |
|---|---|---|---|---|---|
| 1 | รายได้ปี {BE year} | Σ `monthly_actual.amount` over the 12 months before cutoff → `฿413.6M` | None. DESIGN.md §6.2 forbids sparklines on KPIs; the trend card right below draws the same 12 months | `<Delta value={h2/h1−1}> ครึ่งปีหลัง เทียบครึ่งปีแรก` (`▲ 25%`, positive ink) | ข้อมูลจริง |
| 2 | ลูกค้าที่ใช้งาน | `lifecycle.active_paid + lifecycle.active_free` → `4,250` | None. A monthly sending count under a Lifecycle count would give "ใช้งาน" two meanings (R4) | `จ่ายเงิน {active_paid} · จาก {run.total_customers} บัญชี` | ข้อมูลจริง |
| 3 | รายได้เสี่ยงหาย 6 เดือน | `model.atRisk` (= `revenue.expected_at_risk`) → `฿55.2M` | **Meter**, fill = atRisk / clvTotal | `{pct}% ของ {clvTotal} ที่คาดว่าจะได้ใน 6 เดือน`. The ⓘ sets the CLV against actual revenue (R11, §15 `kpi_rar`) | คาดการณ์ |
| 4 | เสี่ยงเลิกใช้สูง | `churn.by_risk.high + churn.by_risk.critical` → `899 ราย` | **Segmented bar** over `churn.eligible_count`: critical segment, high segment, then the remaining track | Legend row: `■ วิกฤต 297  ■ สูง 602  จาก 2,282 ราย`. These equal the heat grid's column totals (R5) | คาดการณ์ |

**Why these four.** Two are facts (size of the business, size of the live base). Two are predictions (money at risk, people at risk). Read left to right, they go from "how big" to "how exposed". The current tiles "ไม่มีการใช้งาน" and "ต้องเติมใน 14 วัน" move down into the sections where they have context (§8.2, §8.4).

**Viz specs:**
- **Sparkline:** not built. DESIGN.md §1.3, §6.2 and §10 forbid sparklines on KPIs, and the trend card directly below shows the same 12 months.
- **Meter:** 8 px tall, fully rounded. Track `--risk-emph-track`, fill `--risk-emph`. Use a meter rather than a donut: one ratio against a whole reads faster as a bar, and the caption gives the exact number.
- **Segmented bar:** 8 px, 2 px gaps between segments. Critical uses `--heat-4`, high uses `--heat-3`, and the track is `--raised`. The legend squares mirror the segments. Never rely on colour alone: the legend states the numbers.

**States:**
- Loading: one `Skeleton` 124 px high.
- `eligible_count = 0`: tile 4 shows `—` and the caption `ยังไม่มีคะแนนความเสี่ยงในรอบนี้`.
- `clvTotal = 0`: hide the meter.

---

## 7. Section 1 — "ธุรกิจปี {BE year}" (facts)

Heading: `ธุรกิจปี 2568`. Description: `รายได้มาจากไหน และฐานลูกค้าเป็นอย่างไร`.
The year is the BE year of the last full month before cutoff.

### 7.1 Monthly trend — `monthly-trend.tsx` (replaces `MonthlyRevenue`)

**Question:** Is revenue growing, and is the growth coming from more payers or from more spend per payer?

**Why this form:**
- Monthly totals are discrete buckets, so they are drawn as **columns**, not a line.
- The story is a step change between the halves of the year, so we draw **two half-year average lines** instead of a moving average or a trendline. A step is easier to read and easier to explain.
- The three measures have different units and scales: baht in millions, payers in hundreds, senders in thousands. Drawing them on one plot would need a dual axis, and a dual axis invents correlations (the alignment of two scales is arbitrary). So there is **one metric at a time, chosen with a segmented switch**, and the tooltip shows all three for the hovered month. That gives the reader the "is it people or spend?" comparison without a misleading chart.

**Data (last 12 months before cutoff, oldest first):**

| Metric key | Label | Value per month | Source | Status |
|---|---|---|---|---|
| `rev` | รายได้ | `amount` | `revenue.monthly_actual` (last 12 of 24) | ✅ exists |
| `pay` | ผู้จ่ายเงิน | distinct Payers (paid more than ฿0 that month) | **`n_payers`** on `monthly_actual` | ❌ gap G1 (`n_payments` counts payments, not payers) |
| `mau` | ลูกค้าที่ส่งข้อความ | distinct accounts with usage > 0 | **`usage_monthly_senders`** | ❌ gap G2 |

While G1 or G2 is missing, render that switch option **disabled**, with a tooltip `ยังไม่มีข้อมูลนี้ในรอบนี้`. Don't hide it, so the design intent stays visible.

**Derived values (in `overview-model.ts`):**
- `h1 = mean(values[0..5])`, `h2 = mean(values[6..11])`, `growth = h2 / h1 − 1`.
- `max` = index of the largest value (gets a direct label).
- Revenue per payer per month: `arppu_h1 = Σ rev[0..5] / Σ pay[0..5]`, and `arppu_h2` the same for months 6..11. These are used in the note.
- Y axis: a "nice" max and step from the candidates {1, 2, 2.5, 5} × 10ⁿ with 5–6 ticks. Prototype values: rev 0–50M step 10M; payers 0–600 step 100; active 0–2,500 step 500.

**Encoding:**

| Part | Spec |
|---|---|
| Plot | 240 px high. Recharts `BarChart` using the DESIGN.md §7 preset: horizontal grid `--grid`, no y-axis line, ticks 12 px `--axis-ink`, `tickFormatter` per metric (`฿10M`, `100`, `1,000`) |
| Bars | `--chart-1`, `maxBarSize={24}`, top corners 4 px, start at 0 |
| Hover | Hovered column gets a `--raised` band behind it (recharts `cursor={{ fill: "var(--raised)" }}`). The hovered bar uses `--accent-ink` (light) / brighter `--chart-1` (dark) |
| Direct label | Only on the **maximum** month, 12 px semibold, above the cap. Labelling the min as well collided with the average line in testing, so don't add it |
| Half averages | Two dashed 2 px `--text` lines: one spanning months 1–6 at `h1`, one spanning months 7–12 at `h2`. Use `ReferenceLine` with `segment`, or `ReferenceArea` with zero height and a stroke. Dashed is deliberate here: it marks a *reference*, not a gridline |
| Half summary row | Under the x-axis, two equal columns, each with a 1 px top rule: `ครึ่งปีแรก · เฉลี่ยต่อเดือน` / **`฿30.7M`** and `ครึ่งปีหลัง · เฉลี่ยต่อเดือน` / **`฿38.3M`** + `<Delta value={growth}/>` |
| X labels | Short Thai months (`ม.ค.` … `ธ.ค.`). The hovered month is bold. Below 640 px show every other label |
| Title (computed) | rev: `รายได้ครึ่งปีหลังโตขึ้น {growth}%`; pay: `ผู้จ่ายเงินต่อเดือนเพิ่มขึ้น {growth}%`; mau: `ลูกค้าที่ส่งข้อความต่อเดือนเพิ่มขึ้น {growth}%`. If growth ≤ 0, swap in `ลดลง {abs}%` / `ทรงตัว` (abs < 1%) |
| Subtitle | `ม.ค.–ธ.ค. 2568 · ชี้แต่ละเดือนเพื่อดูตัวเลขทั้ง 3 ตัว` |

**Tooltip** (custom `BareTooltip`, `--tip-bg` / `--tip-ink`, 196 px wide):
```
พ.ย. 2568                    ← 12 px muted
฿39.8M            รายได้      ← the active metric row: 16 px semibold
443 ราย           ผู้จ่ายเงิน   ← other rows: 14 px regular
2,279 ราย         ลูกค้าที่ส่งข้อความ
───────────────
รายได้สูงกว่าค่าเฉลี่ยครึ่งปีหลัง 4%   ← vs the average of the half the month belongs to
```
Values lead and labels follow, because the reader already knows the series and wants the number. Rows for missing metrics (gaps) are omitted.

**Controls row (above the plot, left → right):**
- Segmented switch: `รายได้ | ผู้จ่ายเงิน | ลูกค้าที่ส่งข้อความ`. Use the existing Segmented / Tabs style (DESIGN.md §6.9), `aria-pressed`.
- Right-aligned toggle `ดูเป็นตาราง` ↔ `ดูเป็นกราฟ`.

Switching the metric clears the hover state. The view toggle swaps the chart for a table.

**Table view** (the accessible twin): 12 rows × columns `เดือน | รายได้ | ผู้จ่ายเงิน | ลูกค้าที่ส่งข้อความ`. The active metric's column is semibold, numbers are right-aligned and tabular. Build it as a `<table>` in React. (The prototype uses div roles only because of a canvas limitation.)

**Insight note** (below the chart, `--raised` box, lightbulb icon `--accent`). Generated from data by rule, not by an LLM:

| Metric | Template | Prototype output |
|---|---|---|
| rev | `รายได้โตเร็วกว่าจำนวนคน: ผู้จ่ายเงินต่อเดือนเพิ่มขึ้น {payGrowth}% ส่วนยอดเฉลี่ยต่อผู้จ่ายเงินเพิ่มจาก {arppu_h1} เป็น {arppu_h2} (+{arppuGrowth}%) และ {maxMonth} ทำรายได้สูงสุดของปีที่ {maxValue}` | …10% … ฿73.2K เป็น ฿82.5K (+13%) … ธ.ค. … ฿45.1M |
| pay | `ผู้จ่ายเงินเพิ่มจากเฉลี่ย {h1} เป็น {h2} รายต่อเดือน (+{growth}%) {น้อยกว่า/มากกว่า}รายได้ที่โต {revGrowth}% ส่วนที่เหลือมาจากยอดจ่ายต่อคนที่{สูงขึ้น/ลดลง}` | 420 → 464 (+10%) … 25% |
| mau | `ลูกค้าที่ส่งข้อความต่อเดือนเพิ่มขึ้น {growth}% ({h1} → {h2} ราย) …` | 8% (2,008 → 2,161) |

Use the first clause only (`รายได้โตขึ้น {growth}% เทียบครึ่งปีแรก`) when `n_payers` is missing. Don't make claims the available data can't support.

**Top-contributor rule (R3, gap G8).** When one account's H2 − H1 increase is more than half of the net increase, the `rev` note leads with that account, and its growth and per-payer figures leave it out:
`รายได้ที่เพิ่มขึ้น {share}% มาจากบัญชี #{acc_id}{ ที่เริ่มจ่ายเงิน {first month}} · ไม่นับบัญชีนี้ รายได้โต {growthEx}% และยอดเฉลี่ยต่อผู้จ่ายเงิน{เพิ่มขึ้น|ลดลง} {abs(arppuGrowthEx)}%`
- Real: `รายได้ที่เพิ่มขึ้น 76% มาจากบัญชี #296269 ที่เริ่มจ่ายเงิน ต.ค. 68 · ไม่นับบัญชีนี้ รายได้โต 6% และยอดเฉลี่ยต่อผู้จ่ายเงินลดลง 4%`.
- The `ที่เริ่มจ่ายเงิน {first month}` clause appears only when the account's first payment in the 12 months falls in H2.
- The card title is unchanged: the growth is real, and the note says where it came from. KPI 1's ⓘ carries the same `ไม่นับบัญชี #{acc_id} รายได้โต {growthEx}%` clause (§15 `kpi_rev`).

**States:**
- Loading: skeleton 420 px.
- Fewer than 12 months of data: draw what exists, and only show half averages when each half has ≥ 3 months.
- All zero: `EmptyState title="ยังไม่มีการชำระเงินในช่วงนี้"`.

### 7.2 Revenue concentration — `revenue-concentration.tsx` (new)

**Question:** How dependent is revenue on a handful of accounts?

**Why this form:**
- Concentration is a comparison of **two wholes**: share of *payers* vs share of *revenue*. Two stacked 100% bars on the same width make the gap visible at once. The top tier is a 1% sliver in the first bar and half of the second.
- A Pareto curve is more precise, but it needs explaining. A donut can't show two wholes side by side.
- Tiers are ordered (by rank), so they use an **ordinal blue ramp** (darkest = top tier), not categorical colours.

**Data:** gap G3 → new `RunSummary.revenue_concentration` (§11).
- Rank every account by total payment `amount` in the 12 months before cutoff (desc, ties by `acc_id`).
- `n = count(accounts with amount > 0)`.
- Tier boundaries by rank: `top1 = ceil(0.01 n)`, `top5 = ceil(0.05 n)`, `top10 = ceil(0.10 n)`.
- Real (n = 2,945 Payers; the prototype's 2,946 counted an account whose only rows were ฿0): ranks 1–30, 31–148, 149–295, 296–2,945.
- The same per-account query yields `top_contributor` (gap G8, §7.1).

| Tier key | Name (Thai) | Sub | Payers | Revenue | Share |
|---|---|---|---|---|---|
| `top1` | `{top1} รายแรก` | `1% ของผู้จ่ายเงิน` | 30 | ฿208.9M | 50.5% |
| `top5` | `อันดับ {top1+1}–{top5}` | `อีก 4% · {n} ราย` | 118 | ฿91.9M | 22.2% |
| `top10` | `อันดับ {top5+1}–{top10}` | `อีก 5% · {n} ราย` | 147 | ฿40.9M | 9.9% |
| `rest` | `อีก {n} ราย` | `90% ของผู้จ่ายเงิน` | 2,650 | ฿72.0M | 17.4% |

**Encoding:**
- **Two tall segmented bars**, 28 px, 4 px corners on each block, 2 px gaps.
  - Labels: `สัดส่วนผู้จ่ายเงิน` + total `2,945 ราย` (right), and `สัดส่วนรายได้` + total `฿413.6M`.
  - Segment widths are proportional to share (`flex-grow: share`), with `min-width: 3px` so the 1% tier stays visible.
  - The share is printed inside a block only when share ≥ 12%: payers bar `90%`; revenue bar `50.5%`, `22.2%`, `17.4%`.
  - Ink inside: white on tiers 1–2, `--text` on tiers 3–4 (contrast checked, §12).
- **Legend-table list** under the bars, one row per tier: swatch 10 px · name/sub · revenue (tabular) · share (semibold, right). This list *is* the table view, so the bars need no tooltip.
- **Linked highlight:** hovering or focusing a segment or a list row dims the other tiers to 30% opacity in both bars, and tints the row with `--raised`.
- **Callout** (pinned to the bottom, orange-tinted `--pill-negative-bg`, warning icon):
  - `เสีย 1 รายใน {top1} รายแรก = รายได้หายเฉลี่ย {avgTop1} ต่อปี` (avgTop1 = revenue_top1 / top1 = ฿7.0M)
  - `มากกว่ารายได้ทั้งปีของผู้จ่ายเงิน {k} รายล่างรวมกัน`, where k = the largest number of lowest-paying payers whose summed revenue < avgTop1. Compute k server-side (`bottom_k_below_top1_avg`); prototype k = 1,200 (rounded down to a hundred).
- **Title:** `1% ของผู้จ่ายเงิน ทำรายได้{ครึ่งหนึ่ง | {share}%}`. Use "ครึ่งหนึ่ง" when the top-1% share is between 45% and 55%; otherwise print the percentage.
- **Subtitle:** `ผู้จ่ายเงินปี 2568 จำนวน {n} ราย · ชี้กลุ่มเพื่อเทียบ`.
- **No click-through.** The customer list has no rank filter. Don't fake one.

### 7.3 Customer base — `customer-base.tsx` (new)

**Question:** How much of the account base is actually alive?

**Why this form:** one whole split into 4 ordered states. A **thin segmented bar** shows the proportions, and four **cards** below carry the figures and the click-through. The figures sit beside the bar, so the bar itself carries no text.

**Data:** `lifecycle` ✅. The total is `run.total_customers`; assert that it equals the sum of the four.

| State | Label | Count | Share | Description (Thai) | Link | Fill token |
|---|---|---|---|---|---|---|
| active_paid | `ใช้งาน · จ่ายเงิน` | 2,572 | 8.4% | `LIFECYCLE_HELP["Active Paid"]` | `/customers?run=…` (tab paid is the default) | `--base-paid` |
| active_free | `ใช้งาน · ไม่ได้เติมเงิน` | 1,678 | 5.5% | `LIFECYCLE_HELP["Active Free"]` | `?tab=free` | `--base-free` |
| churned | `หยุดใช้` | 7,174 | 23.4% | `LIFECYCLE_HELP.Churned` + ` · ในนี้เคยเติมเงิน {churned_ever_paid} ราย` | `?tab=churned` | `--base-churned` |
| ghost | `ไม่มีกิจกรรม` | 19,273 | 62.8% | `LIFECYCLE_HELP.Ghost` | `?tab=ghost` | `--base-ghost` |

- Descriptions reuse `LIFECYCLE_HELP` (`lib/labels.ts`), so the overview and the customer list describe each stage the same way (R4).
- `churned_ever_paid` (1,914) is gap G4. It is already stored as `sub_stage = 'Churned Paid'`. Until it exists, either get it from `fetchRunOutputs(runId, { lifecycle_stage: "Churned", ever_paid: "true", page_size: 1 }).total` or drop the clause.
- The prototype's "95% สมัครก่อนปี 2567" for ghost needs data we don't serve. **Drop it.**
- **Bar:** 10 px, fully rounded segments, 2 px gaps, `min-width: 4px`.
- **Cards:** `flex-1 basis-[200px]`. Each card is a `<Link>` showing swatch + label + chevron, the count (24 px semibold), the share (13 px muted) and the description.
- **Linked highlight** between cards and segments works as in §7.2. Highlight = border `--control`.
- **Title:** `ใช้งานอยู่ {active_paid+active_free} จาก {total} บัญชี`. Subtitle: `สถานะ ณ {cutoff} · กดกลุ่มเพื่อเปิดรายชื่อในหน้าลูกค้า`.

---

## 8. Section 2 — "ลูกค้าที่จ่ายเงิน · ใครเสี่ยงจะหาย" (predictions + one signal)

Heading: `ลูกค้าที่จ่ายเงิน · ใครเสี่ยงจะหาย`. Description: `{active_paid} ราย · ผลทำนายรอบ {cutoff} และสัญญาณจากการใช้งานจริง`.

### 8.1 Value × risk heat grid — rewrite `risk-map.tsx`

**Question:** Where is the revenue at risk, and what should we do about each group?

**Why this form (and why it replaces the area squares):**
- The grid is the team's shared mental model: value tier × risk level, the same 16 groups as the Playbook. Each cell must show **two numbers**, how many customers and how much money.
- Area-scaled squares made small cells unreadable and couldn't carry the count. A **heat grid** prints both numbers in every cell and uses fill only for the ranking signal (฿ at risk).
- Fill = **sequential orange ramp** (one hue, light → dark = more money at risk). It's orange because this is risk.
- Clicking a cell **selects** it and shows its playbook action below the grid, plus a link to the filtered list. One click to understand, a second to act. Touch works the same way, with no hover needed.

**Data:** `value_risk_matrix` ✅ (Active Paid, scored customers only; the API already returns the `none` rows). Rows `MAP_TIERS = high, mid, low, none`. Columns `MAP_RISKS = low, medium, high, critical`. Use the existing `model.cells`.
- `none` = scored customers predicted to pay ฿0 in 6 months (R5). With this row, the columns sum to `churn.by_risk` and the grid total equals `eligible_count`. So KPI 4 and the subtitle match the cells.
- Almost half of the high-risk customers (425 of 899) are in this row. They have no money at risk, so a sales call isn't worth it, and the row shows that.

**Real values** (count / ฿ at risk):

| | ต่ำ <17% | ปานกลาง 17–35% | สูง 35–74% | วิกฤต ≥74% | row Σ |
|---|---|---|---|---|---|
| มูลค่าสูง (10% แรก) | 154 / 8.4M | 24 / 32.9M | 22 / 5.6M | 1 / 302K | 201 / 47.1M |
| มูลค่ากลาง (10–50%) | 551 / 1.4M | 71 / 1.1M | 153 / 4.8M | 7 / 151K | 782 / 7.4M |
| มูลค่าต่ำ (ครึ่งล่าง) | 385 / 91K | 84 / 88K | 233 / 348K | 58 / 121K | 760 / 649K |
| คาดว่าไม่จ่าย (฿0) | 90 / 0 | 24 / 0 | 194 / 0 | 231 / 0 | 539 / 0 |
| column Σ | 1,180 / 9.9M | 203 / 34.0M | 602 / 10.7M | 297 / 574K | 2,282 / 55.2M |

#296269 alone is ฿27.1M of the high × medium cell.

**Encoding:**

| Part | Spec |
|---|---|
| Grid | CSS grid `112px repeat(4, minmax(0,1fr))`, 3 px gap (the surface shows through as the separator, so no cell borders), `min-width: 520px` inside an `overflow-x-auto` wrapper |
| Column headers | Risk label (13 px medium) + range from `riskRange(thresholds)` (12 px muted). **Never hard-code 17/35/74**: they come from `churn.thresholds` |
| Row headers | Tier label (`VALUE_TIER_LABEL`) + `10% แรก` / `10–50%` / `ครึ่งล่าง` (from `VALUE_TIER_HIGH_PCT` 0.90 / `VALUE_TIER_MID_PCT` 0.50 in `apps/ml/src/constants.py`). The `none` row is `คาดว่าไม่จ่าย` + `มูลค่า 6 เดือน ฿0`, not `VALUE_TIER_LABEL.none` ("ยังประเมินไม่ได้"), which only fits Churned and Ghost. Wherever a tier is shown, pick the `none` label by stage: Active → `คาดว่าไม่จ่าย`, otherwise `ยังประเมินไม่ได้` |
| Corner cell | `มูลค่า ↓ · โอกาส →` (12 px muted), so both axes are named |
| Cell | `<button>` min-height 76 px, radius 6 px, padding 10/12, left-aligned: count (20 px semibold, tabular) over ฿ at risk (12 px). Fill `--heat-{bin}`; ink `--text` for bins 0–3 and white for bin 4 |
| Bins | `HEAT_BREAKS = [500_000, 1_000_000, 2_000_000, 5_000_000]` THB → bins 0..4. Put the constant in `overview-model.ts` with a comment. Revisit if real runs cluster in one bin (see §17, D3) |
| Selected cell | 2 px `--text` outline, offset 2 px. Default selection = the cell with the largest `revenueAtRisk` (real: high × medium, ฿32.9M) |
| Totals row | `รวม` + per column `{count} ราย` / `฿{rar}` (12–13 px muted). Summed from cells, not read from another field |
| Legend | `รายได้ที่เสี่ยงหายต่อช่อง` + 5 swatches (14×10, with an inset 1 px hairline so the palest swatch stays visible) labelled `ต่ำกว่า ฿0.5M · ฿0.5–1M · ฿1–2M · ฿2–5M · เกิน ฿5M` |
| Detail panel | `--raised` box below the legend. Contents: `ช่องที่เลือก` (12 px muted), **`{tier} × โอกาสเลิกใช้{risk}`** (15 px semibold), `{count} ราย · รายได้เสี่ยงหาย ฿{rar} ({share}% ของ ฿{total})`, `แนวทาง: {action}`, and on the right a primary link `ดูรายชื่อ {count} ราย →` |
| Link target | `/customers?run={id}&customer_value_tier={tier}&churn_risk_level={risk}&sort=revenue_at_risk:desc` |
| Title (computed) | `{round(highTier.share×100)}% ของรายได้เสี่ยงหาย อยู่ในลูกค้ามูลค่าสูง {highTier.count} ราย` (real: 85%, 201). Use the existing `model.highTier` |
| Subtitle | `ลูกค้า {eligible_count} รายที่ประเมินได้ · กดช่องเพื่อดูแนวทาง` |

**Playbook** (a glossary term; store it as a typed map in `lib/labels.ts`, `CELL_ACTION[tier][risk]`).

It is the only "what to do" in the app (R6). The customer page shows the action for the customer's own cell. It replaces three things there: the Segment pill (`customer-profile-panel.tsx`), and the "กลุ่มแนะนำ" row and "อันดับที่ต้องดูแล" (`customer-detail-view.tsx`).
- Why: a cell mixes Segments (mid × low holds 504 / 35 / 12 across three of them), so a Segment can't explain a cell. Segment names also contradict the Value Tier for 705 customers.
- The `needs_review` banner stays.
- Known cost: p_alive (the CLV model's chance the customer is still active) flags 77 low-risk customers into watch or at-risk Segments. Only 8 of them have the banner, so the other 69 lose that flag.

| tier \ risk | low | medium | high | critical |
|---|---|---|---|---|
| high | ลูกค้าหลักที่มั่นคง เหมาะกับการเสนอแพ็กเกจที่ใหญ่ขึ้น | เฝ้าดูใกล้ชิด และเตรียมข้อเสนอพิเศษเพื่อรักษาไว้ | โทรสอบถามความพึงพอใจและปัญหาการใช้งานภายใน 2 สัปดาห์ | ให้ Account Manager ติดต่อภายในสัปดาห์นี้ เริ่มจากรายที่เสี่ยงหายมากที่สุด |
| mid | กลุ่มที่โตได้ แนะนำบริการเสริม เช่น Email หรือ OTP | สื่อสารตามรอบปกติ พร้อมแนะนำฟีเจอร์ที่ยังไม่ได้ใช้ | ส่งแคมเปญรักษาลูกค้าแบบอัตโนมัติ แล้วติดตามผล | เสนอส่วนลดเติมเครดิต และเช็กว่ามีปัญหาการใช้งานหรือไม่ |
| low | สื่อสารตามรอบปกติ | สื่อสารตามรอบปกติ | ใช้อีเมลอัตโนมัติ ไม่คุ้มที่จะใช้คนติดต่อ | ใช้อีเมลอัตโนมัติ ไม่คุ้มที่จะใช้คนติดต่อ |
| none | สื่อสารตามรอบปกติ | สื่อสารตามรอบปกติ | ใช้อีเมลอัตโนมัติ ไม่คุ้มที่จะใช้คนติดต่อ | ใช้อีเมลอัตโนมัติ ไม่คุ้มที่จะใช้คนติดต่อ |

**Accessibility:**
- Each cell has `aria-label="{tier} × โอกาสเลิกใช้{risk}: {count} ราย รายได้เสี่ยงหาย ฿{rar}"` and `aria-pressed`.
- Arrow-key navigation across the grid is a nice-to-have, not required.
- The detail panel uses `aria-live="polite"`.

**States:**
- `atRisk = 0` → keep the existing `EmptyState title="ยังไม่มีรายได้ที่เสี่ยงหายในรอบนี้"`.
- Cells with count 0 render with the bin 0 fill and `0` / `฿0`; they stay clickable but the link is disabled.

### 8.2 Sending months — `sending-months.tsx` (new)

**Question:** Which behaviour predicts churn, and how many paying customers show it right now?

**Why this card exists:**
- The number of months in which a customer sent any messages in the scoring window (the model feature `usage_active_months_180d`) is the strongest single churn signal in the data. In the Backtest at 1 ก.ค. 2568, customers who sent in 0–1 of 5 months churned 58–71%; customers who sent in all 5 months churned 1%.
- It is **observable** (a fact, not a prediction) and **explainable** to a salesperson in one sentence. It is the bridge between the model and intuition, and it builds trust in the heat grid next to it.
- Its name is "เดือนที่ส่งข้อความ", not "เดือนที่ใช้งาน", because "ใช้งาน / Active" means a Lifecycle Stage (R4).

**Why this form:**
- A histogram over an ordered count (0…N months) is drawn as **columns**. Every column is labelled with its count, so there is no y-axis.
- The backtest churn rate goes in a **text row under the axis**, not a second series. That is again to avoid a dual axis: two different measures (counts vs rates).
- **Emphasis colouring:** buckets 0–1 in `--risk-emph` (orange), the rest in `--chart-muted`. The story is "this group", so we use emphasis, not a gradient.

**Data** (all computed by the API from the run's Predict Data Source, with no ML change, R7; SQL sketch in §11.2):
- **Sending months** of a customer at a date D = the number of distinct months with usage > 0 among the month stamps in [D − 180 d, D), exactly as `features.py` counts `usage_active_months_180d`. For a month-start D that is 5 months (the comment in `features.py` explains why it isn't 6). Real window for cutoff 1 ม.ค. 2569: ส.ค.–ธ.ค. 2568.
- **Histogram (gap G5):** sending months at the cutoff, over every Active Paid customer (scored or not).
  - Real: `[457, 455, 297, 204, 193, 966]` (Σ 2,572).
- **Backtest churn rate per bucket (gap G6):** measured at the Backtest date B = cutoff − 6 months, which is always the first of a month.
  - Not cutoff − 180 d: that lands on 5 ก.ค., gives 6 month stamps, and counts July's usage as "before B".
  - Population and outcome copy the training churn label (`labels.py › build_churn_labels`): any payment or usage > 0 in [B − 180 d, B), and any payment before B. Churned = no payment and no usage > 0 in [B, B + 180 d). Bucket by sending months at B.
  - Real (B = 1 ก.ค. 2568): n `[374, 453, 277, 211, 208, 865]`, rates `[71, 58, 42, 25, 17, 1]%`, which is exactly the prototype.
  - Today B happens to equal the churn champion's training cutoff, on the same workbook. Computing it per run keeps it describing this workbook's customers after a retrain or a newer workbook.
  - If it's null (the source has less than 12 months before the cutoff) → hide the rate row, use the neutral title `ลูกค้าที่จ่ายเงินตามจำนวนเดือนที่ส่งข้อความ`, and change the callout to drop the rate.

**Encoding:**

| Part | Spec |
|---|---|
| Plot | ~250 px high (it fills its row next to the heat grid); baseline 1 px `--control`; equal slots; bars 24 px, top corners 4 px |
| Labels | Count on every cap (13 px semibold); x labels `{k} เดือน` |
| Rate row | Between two hairlines: `{rate}%` per bucket, 14 px. Buckets 0–1 semibold in `--pill-negative-ink` (risk text), others `--text` |
| Readout line | Under the rate row, `aria-live="polite"`. Default text: `แถวบน = จำนวนเดือนที่ส่งข้อความ · แถวล่าง = เคยเลิกใช้จริง (ย้อนทดสอบ {B, e.g. ก.ค. 68}) · ชี้แท่งเพื่อดูสัดส่วน`. On hover/focus of a bucket: `ส่งข้อความ {k} จาก {N} เดือน: {count} ราย ({share}% ของลูกค้าที่จ่ายเงิน) · เคยเลิกใช้จริง {rate}%`. **No floating tooltip.** It covered the card title in testing, and every other value is already printed |
| Hover | Hovered slot gets a `--raised` band; its bar darkens one step |
| Callout | Pinned to the bottom, `--pill-negative-bg`: orange square + **`{n0+n1} ราย`** `ส่งข้อความแค่ 0–1 เดือน เคยเลิกใช้ {min}–{max}%` + link `ดูรายชื่อ ›` |
| Link | `/customers?run={id}&sending_months_max=1&sort=revenue_at_risk:desc`. This needs **gap G7**, a new list filter. Until it lands, link to `/customers?run={id}&sort=revenue_at_risk:desc` and keep the label |
| Title | `ยิ่งส่งข้อความน้อยเดือน ยิ่งเลิกใช้` when the rates are non-increasing in k; otherwise the neutral title |
| Subtitle | `ลูกค้าที่จ่ายเงินตามจำนวนเดือนที่ส่งข้อความ {window first month}–{last month}` |
| Chip | ข้อมูลจริง |

This replaces the current KPI "ไม่มีการใช้งาน" (`usage_trend.no_usage`). Bucket 0 is that same group, now shown in context (457 = 457 on the real run).

### 8.3 Top-5 call list — reshape `CallFirstList` → `top-risk-table.tsx`

**Question:** Exactly who should be called first?

**Why this form:** a short ranked table, because people act on rows, not charts. Each row adds a small **inline meter** of ฿ at risk relative to row 1, so the drop-off between ranks is visible without reading digits.

**Data:**
- `summary.top_priority`, changed by **fix F1** into the head of the Call List: every scored Active Paid customer, sorted by `revenue_at_risk` desc then `acc_id`, with no tier or risk filter. Take the first 5.
- Why (R1): the old high × high/critical filter left out #296269, which alone holds 49% of the revenue at risk.
- Real top 5: #296269 (high × medium, ฿27.1M), #264612 (high × low, ฿883K), #282926 (high × low, ฿875K), #263310 (high × medium, ฿686K), #259522 (high × medium, ฿682K).

**Copy:**
- Title: `5 รายที่รายได้เสี่ยงหายมากที่สุด`.
- Subtitle: `ลูกค้าที่จ่ายเงินทุกระดับ · เรียงตามรายได้เสี่ยงหาย · กดแถวเพื่อเปิดหน้าลูกค้า`.
- Header link (secondary button): `ดูทั้งหมด ›` → `/customers?run={id}` (the paid tab, whose default sort is `revenue_at_risk:desc`). No count, as with the header CTA.
- Remove `callFirst`, `CALL_FIRST_RISKS` and `callFirstHref`; nothing else reads them.

**Columns** (`grid-template-columns: 20px minmax(150px,1fr) 112px 92px 136px 84px`, min-width 660 px, account column sticky on mobile):

| # | Header | Cell | Source |
|---|---|---|---|
| 1 | `#` | rank (13 px muted, tabular) | index |
| 2 | `บัญชี` | `#acc_id` (15 px semibold) over one 13 px muted line (single-line ellipsis): the main reason when `top_factor` exists, otherwise `{VALUE_TIER_LABEL} · คาดจ่าย 6 เดือน ฿{clv}`. Real row 1: `มูลค่าสูง · คาดจ่าย 6 เดือน ฿92.8M` | `top_factor` → `humanizeFeature` from `features/customers/reasoning.ts`; fallback `customer_value_tier` + `predicted_clv_6m`. The current churn champion (TabICL) gives no factors (R2, §17 D6) |
| 3 | `โอกาสเลิกใช้` | `StatusPill` `78% · วิกฤต` (critical → negative tone, high → warning tone, medium/low → neutral; the list now spans every risk level) | `churn_probability`, `churn_risk_level` |
| 4 | `ส่งข้อความ 5 ด.` | 5 squares 10 px (filled `--chart-1` = a month with messages sent, empty = `--control` ring) + `{n}/5` (`--pill-negative-ink` when ≤ 2) | **gap G5b**: per-customer month flags. Until then hide this column; don't render placeholder squares |
| 5 | `รายได้เสี่ยงหาย` (right) | `฿2,223,000` (15 px medium, tabular) over a 6 px meter (track `--risk-emph-track`, fill `--risk-emph`, width = rar / rar[0]) | `revenue_at_risk` |
| 6 | `เติมครั้งถัดไป` (right) | `ใน 41 วัน` / `เกิน 90 วัน`. ≤ 14 days: semibold `--pill-negative-ink` | `estimated_days_until_topup` → `formatDaysAhead` |

Each row is a `<Link href="/customers/{acc_id}?run={id}">`, min-height 64 px, with a hover `--raised` background.

**States:** if `top_priority` is empty, show `EmptyState title="ยังไม่มีลูกค้าที่มีคะแนนความเสี่ยงในรอบนี้"`.

### 8.4 Next top-up — reshape `TopupUrgency`

**Question:** Who will need to buy credit soon? This is a **sales opportunity**, so it uses blue, not orange.

**Why this form:** ordered time buckets. **Horizontal bars** with the bucket name left and the value right read like a sentence. All five buckets are drawn: > 90 days is 12.5% of the real run, not the prototype's 77%, so it doesn't flatten the others (R8).

**Data** (`credit` ✅ + gap **G10**; urgency cut-offs from `apps/ml/src/constants.py`: 14 / 30 / 90 days):

| Row | Label | Value | Real |
|---|---|---|---|
| 1 | `ภายใน 7 วัน` | `credit.topup_due_7d` | 320 |
| 2 | `8–14 วัน` | `by_urgency.critical − topup_due_7d` (assert ≥ 0) | 375 |
| 3 | `15–30 วัน` | `by_urgency.warning` | 1,049 |
| 4 | `31–90 วัน` | `by_urgency.monitor` | 1,974 |
| 5 | `เกิน 90 วัน` | `by_urgency.stable` | 532 |

Σ 4,250 (Active Paid and Active Free).

**How far to trust it (R8):**
- In the credit champion's own backtests, about 1 in 4 customers predicted to top up within 14 days actually did (`urgent_topup_precision` 0.24–0.26 on four backtest dates). The model caught 50–72% of the customers who did top up.
- A quick check agrees: 256 of these 4,250 customers paid in the 14 days before the cutoff, while the model puts 695 in the next 14.
- So the card states a chance, never a promise, and it shows the hit rate. The list it links to is sorted by days until top-up, and ordering who to contact first is the part the model does reasonably well.

**Encoding:**
- Grid rows `84px 1fr 44px`, 14 px row gap.
- Bars 18 px tall, square at the left baseline, 4 px right corners, width ∝ value / max(rows 1–5).
- Rows 1–2 (≤ 14 days) use `--chart-1` with a semibold value; rows 3–5 use `--chart-muted`.
- **Stat pair:** two cells in a hairline-divided box: `อาจเติมใน 7 วัน` **`320 ราย`** and `คาดใช้ใน 30 วัน` **`{demand_30d} เครดิต`** (`credit.demand_30d`, `formatCountCompact` + ` เครดิต`; real: 191M).
- **Bottom link:** a full-width secondary button `ดูรายชื่อลูกค้าที่จ่ายเงิน →` to `/customers?run={id}&credit_urgency_level=critical&sort=estimated_days_until_topup:asc`. This is the existing "credit" preset, which sits in the paid tab: it lists 664 customers, while the card's 695 also counts Active Free. So the link carries no count.
- **Title:** `{by_urgency.critical} รายอาจเติมเครดิตใน 14 วัน` (real: 695). Subtitle: `ลูกค้าที่ใช้งาน {Σ by_urgency} ราย · นับจาก {cutoff}`. Chip: คาดการณ์.
- **Info:** this is the predicted next *payment* date, **not** the date the credit runs out (glossary: Credit Urgency), plus the hit rate from G10 (§15 `topup`). Leave the hit-rate sentence out when G10 is null.

---

## 9. Footnote

13 px muted, under the last row:

> ตัวเลขที่ติด "ข้อมูลจริง" มาจากข้อมูลที่นำเข้า (รอบข้อมูล {source name}) · ตัวเลขที่ติด "คาดการณ์" มาจากโมเดล: churn {model_versions.churn} · clv {model_versions.clv} · credit {model_versions.credit}

Model versions come from `summary.model_versions` ✅. Don't print "ข้อมูลตัวอย่าง". That wording was only for the prototype.

---

## 10. Interaction model

All interaction state is **local component state** (`useState` in each card). None of it belongs in the URL. The run lives in the URL already via `RunScope`.

| State | Owner | Values | Effect |
|---|---|---|---|
| `metric` | MonthlyTrend | `rev` / `pay` / `mau` | swaps the series, ticks, title, note; clears `hoverMonth` |
| `view` | MonthlyTrend | `chart` / `table` | chart ↔ table |
| `hoverMonth` | MonthlyTrend | index / null | band + tooltip + bold x-label |
| `hoverTier` | RevenueConcentration | index / null | dims other tiers in both bars, tints the list row |
| `hoverState` | CustomerBase | index / null | dims other segments, highlights the card border |
| `selectedCell` | RiskMap | `{tier, risk}` | outline + detail panel; default = the largest ฿ at risk cell; resets when the run changes |
| `hoverBucket` | SendingMonths | index / null | band + readout text |

Keyboard parity:
- Everything that reacts to hover also reacts to focus: bars and segments are `<button>`s or have `tabIndex=0` with `onFocus` / `onBlur`.
- Info tips open on focus.

Reduced motion: no animations are needed. If any are added (e.g. a bar grow-in), gate them behind `prefers-reduced-motion`.

---

## 11. Data contract

### 11.1 Already in `RunSummary` (no API work)

| UI | Field |
|---|---|
| KPI 1, trend (revenue), H1/H2 | `revenue.monthly_actual[].amount` (24 months; use the last 12) |
| KPI 2 | `lifecycle.active_paid`, `lifecycle.active_free`, `run.total_customers` |
| KPI 3 | `revenue.expected_at_risk`, Σ `value_risk_matrix.clv_sum`; ⓘ: Σ of the last 6 `monthly_actual.amount` |
| KPI 4 | `churn.by_risk`, `churn.eligible_count` |
| Customer base | `lifecycle.*` |
| Heat grid | `value_risk_matrix[]` (including `none`), `churn.thresholds` (source fixed by F2) |
| Top-5, finding's second clause | `top_priority[]` (scope fixed by F1) |
| Next top-up | `credit.by_urgency`, `credit.topup_due_7d`, `credit.demand_30d` |
| Footnote | `model_versions` |

### 11.2 Gaps

| ID | Needed by | Add | Where / how |
|---|---|---|---|
| **G1** | Trend "ผู้จ่ายเงิน", note, ARPPU | `monthly_actual[].n_payers: number` | `summary.ts › monthlyActual()`: add `COUNT(DISTINCT acc_id) FILTER (WHERE amount > 0)::int AS n_payers` next to `n_payments`. A ฿0 credit grant is not a payment |
| **G2** | Trend "ลูกค้าที่ส่งข้อความ" | `usage_monthly_senders: { month: string; senders: number }[]` (24 months, oldest first) | New query over `predict_clean_usage`: `make_date(year, month, 1)` within the same 24-month window, `COUNT(DISTINCT acc_id) FILTER (WHERE usage > 0)`. Reuse `monthKeysBeforeCutoff` so the months line up with `monthly_actual` |
| **G3** | Concentration | `revenue_concentration: { payers: number; revenue: number; tiers: { key: "top1"\|"top5"\|"top10"\|"rest"; from_rank: number; to_rank: number; payers: number; revenue: number }[]; avg_top1: number; bottom_k_below_top1_avg: number }` | One SQL over `predict_clean_payments` for the 12 months before cutoff: `SUM(amount) GROUP BY acc_id`, `ROW_NUMBER() OVER (ORDER BY total DESC, acc_id)`, bucket by `ceil(n×p)`. Compute `bottom_k` with a running sum ascending |
| **G4** | Customer base, churned description | `lifecycle_detail: { churned_ever_paid: number }` | `COUNT(*) FILTER (WHERE sub_stage = 'Churned Paid')` in `fetchRunAggregates` (already stored; real 1,914) |
| **G5** | Sending months histogram | `RunSummary.sending_months: { window_months: number; window_start: string; backtest_date: string \| null; buckets: { months: number; count: number; backtest_n: number \| null; backtest_churn_rate: number \| null }[] }` | API SQL over `predict_clean_usage` at the cutoff, joined to the run's Active Paid outputs (§8.2). No ML change |
| **G5b** | Top-5 dots | `top_priority[].sending_month_flags: boolean[]` (oldest → newest, length = window_months) | API SQL over `predict_clean_usage` for the 5–10 accounts in `top_priority` |
| **G6** | Sending months rate row | `backtest_n`, `backtest_churn_rate` per bucket in G5 | API SQL at B = cutoff − 6 months (§8.2; sketch below). Comment in the code that the rule copies `labels.py › build_churn_labels`; that file is bug-fix-only, so the copy shouldn't drift. Null when the source has less than 12 months before the cutoff |
| **G7** | Sending months link | list filter `sending_months_max` | `OutputsQuery`; in `outputs.ts` filter `acc_id IN (subquery over predict_clean_usage)`; `FILTER_KEYS` in `customers-view.tsx`; filter chip label `ส่งข้อความไม่เกิน {n} เดือน` |
| **G8** | Trend note, KPI 1 ⓘ | `revenue.top_contributor: { acc_id: number; monthly: number[] } \| null` (12 months, oldest first) | G3's per-account query: the account with the largest H2 − H1 increase. Null when the net increase ≤ 0. The 50% rule is applied in `overview-model.ts` |
| **G9** | Header subtitle, base ⓘ | `run.data_start: string` (`YYYY-MM`) | The first month with any payment or usage > 0 in the run's Predict Data Source |
| **G10** | Top-up ⓘ | `credit.urgent_topup_hit_rate: number \| null` | From the run's credit model version (`run.model_versions_json.credit`): `model_card_json.backtests`, the entry with the latest `cutoff_date`, `metrics.urgent_topup_precision` (real: 0.24 at 1 ส.ค. 2568) |

**Fixes to existing fields:**

| ID | Field | Change |
|---|---|---|
| **F1** | `top_priority` | Replace the `customer_value_tier = 'high' AND churn_risk_level IN ('high','critical')` filter with `revenue_at_risk IS NOT NULL` (= scored Active Paid). Keep the order and `TOP_PRIORITY_LIMIT` (R1) |
| **F2** | `churn.thresholds` | Read `model_card_json.thresholds` of the run's churn model version (`run.model_versions_json.churn`), not of the current champion. Otherwise an older run's grid headers show a newer model's cut-offs (R9) |

**G5/G6 SQL sketch** (verified on the real run; `:d` = the cutoff for G5, B for G6):

```sql
WITH act AS (           -- any payment, or any usage > 0 (labels.py › _activity_events)
  SELECT acc_id, payment_date::date d FROM predict_clean_payments WHERE source_id = :src
  UNION ALL
  SELECT acc_id, make_date(year, month, 1) FROM predict_clean_usage WHERE source_id = :src AND usage > 0
),
elig AS (               -- active in the 180 days before B, and paid before B
  SELECT acc_id FROM act WHERE d >= :b - 180 AND d < :b
  INTERSECT
  SELECT acc_id FROM predict_clean_payments WHERE source_id = :src AND payment_date < :b
),
fut AS (SELECT DISTINCT acc_id FROM act WHERE d >= :b AND d < :b + 180),
sm AS (                 -- sending months (features.py › usage_active_months_180d)
  SELECT acc_id, COUNT(DISTINCT make_date(year, month, 1)) n FROM predict_clean_usage
  WHERE source_id = :src AND usage > 0
    AND make_date(year, month, 1) >= :b - 180 AND make_date(year, month, 1) < :b
  GROUP BY acc_id
)
SELECT COALESCE(sm.n, 0) months, COUNT(*) n, AVG((fut.acc_id IS NULL)::int) churn_rate
FROM elig LEFT JOIN sm USING (acc_id) LEFT JOIN fut USING (acc_id)
GROUP BY 1 ORDER BY 1;
```

For G5, the `sm` CTE at the cutoff, joined to the run's `lifecycle_stage = 'Active Paid'` outputs, gives the histogram.

**Order:** F1, F2, G1, G2, G4, G9 and G10 are small changes in one PR. G3 and G8 share one query. G5, G5b, G6 and G7 share the sending-months SQL in one PR. None of them needs an ML change. Ship each card with its unavailable state first.

### 11.3 `overview-model.ts` additions (pure, unit-tested)

```ts
export type TrendMetric = "rev" | "pay" | "mau";
export type TrendSeries = {
  metric: TrendMetric;
  available: boolean;
  months: { month: string; label: string; value: number }[]; // last 12
  h1: number; h2: number; growth: number | null;              // null when a half has < 3 months
  maxIndex: number;
  ticks: number[];                                              // nice scale
};
// extend the existing OverviewModel with:
export type OverviewModelV5 = OverviewModel & {
  trend: Record<TrendMetric, TrendSeries>;
  arppu: { h1: number; h2: number; growth: number } | null;   // needs G1
  kpi: { revenue12m: number; revenueHalfGrowth: number | null; active: number; highRisk: { critical: number; high: number; eligible: number } };
  concentration: … | null;                                      // G3
  base: { key: LifecycleKey; count: number; share: number }[];  // asserts Σ = total_customers
  heat: { breaks: number[]; cells: (MapCell & { bin: 0|1|2|3|4 })[]; colTotals: …; defaultCell: { tier; risk } }; // 4 tiers incl. none
  sendingMonths: … | null;                                      // G5/G6
  topup: { label: string; count: number; urgent: boolean }[];   // 5 rows
  callListHead: { count: number; share: number } | null;        // finding's second clause (§5)
  topContributor: { accId: number; share: number; growthEx: number; arppuGrowthEx: number | null; firstMonth: string | null } | null; // G8, set only when share > 0.5
};
// and drop callFirst / CALL_FIRST_RISKS (R1). MAP_TIERS gains "none" (R5).
```

**Tests** to add in `overview-model.test.ts`:
- H1/H2 means and growth on the prototype numbers: revenue 30.69 → 38.25, growth ≈ 0.246.
- Nice ticks: max 45.12 → [0..50 step 10]; 508 → [0..600 step 100]; 2,279 → [0..2,500 step 500].
- Heat bins at the edges: 0.5M → bin 1, 1.0M → bin 2, 5.0M → bin 4.
- Top-up row 2 = critical − due_7d and never negative; the five rows sum to Σ `by_urgency`.
- Base shares sum to 100% (±0.1).
- Concentration tiers sum to payers and revenue.
- `highTier.share` gives 85% (201 customers) on the real matrix (§8.1); grid columns sum to `churn.by_risk` and the total to `eligible_count`.
- Call List head: k = 1, share ≈ 0.49 on the real top rows; null when 10 rows hold < 25%.
- Top contributor: set when its increase is > 50% of the net increase, not at exactly 50%; null when the net increase ≤ 0.

---

## 12. Colour tokens to add (`globals.css`, light + dark)

All validated with the dataviz palette checker (OKLab/CVD/contrast). Ink rules are in the last column.

| Token | Light | Dark | Used by | Ink on fill |
|---|---|---|---|---|
| `--heat-0` | `#FFEADD` | `#55301C` | heat bin < 0.5M | light: `--text` · dark: white |
| `--heat-1` | `#FFCBAA` | `#7A3716` | 0.5–1M | `--text` · white |
| `--heat-2` | `#FFA36F` | `#A8460F` | 1–2M | `--text` · white |
| `--heat-3` | `#F2671F` | `#E2621C` | 2–5M; KPI 4 "high" segment | `--text` (5.96:1) · `#111318` |
| `--heat-4` | `#A93300` | `#FF9A5C` | ≥ 5M; KPI 4 "critical" segment | white (6.6:1) · `#111318` |
| `--risk-emph` | `#FC4C02` | `#E8602A` | sending-months 0–1 bars, meters | — |
| `--risk-emph-track` | `#FFE3D1` | `#3A2419` | meter tracks | — |
| `--tier-1` (top 1%) | `#0A3D91` | `#CFE0FF` | concentration | white · `#111318` |
| `--tier-2` | `#006BFF` | `#7FB0FF` | | white (4.6:1) · `#111318` |
| `--tier-3` | `#4D8FFF` | `#3D8BFF` | | `--text` · `#111318` |
| `--tier-4` (rest) | `#8DB8FF` | `#2C5BA6` | | `--text` · white |
| `--base-paid` | `var(--chart-1)` | `var(--accent)` | customer base | — |
| `--base-free` | `#8DB8FF` | `#2C5BA6` | | — |
| `--base-churned` | `#9AA1AD` | `#5B5B62` | | — |
| `--base-ghost` | `#D5D9E0` | `#2E2E33` | | — |

Notes:
- The heat ramp is **sequential**: its palest step is allowed to fade toward the surface because it means "near zero". The 3 px surface gaps and the printed numbers keep every cell readable.
- In dark mode the ramps run *dark → bright* (bright = more), as dark-mode convention expects.
- Repo dark `--chart-1` is near-white (theme B). Monthly bars follow it automatically.
- `--risk-*` (blue) in the repo is the **old** RiskMap ramp. Leave it alone; other pages may use it. The heat grid uses `--heat-*`.

---

## 13. States (whole page)

| Situation | Behaviour |
|---|---|
| No run yet | existing `EmptyState` ("ยังไม่มีผลทำนาย" + link to /runs) |
| Loading | header renders; body shows skeletons sized like the final blocks: KPI 124 px · trend 420 · concentration 420 · base 220 · heat 640 · sending months 640 · top-5 420 · top-up 420. No layout jump when data arrives |
| Refetch (run switch) | keep the previous render at 60% opacity until the new data arrives (no skeleton flash) |
| Error | existing inline error with `ลองอีกครั้ง` |
| Field missing (gap not shipped) | card renders its frame + title + chip, and in place of the chart: `ยังไม่มีข้อมูลนี้ในรอบนี้` (muted, 13 px) + one line on what's missing. Never zeros |
| Zero values | Draw them (a zero bar is information). Exception: heat grid all zero → EmptyState |

---

## 14. Accessibility checklist

- Every chart has a text route: the trend has its table view; concentration has the list; base has the cards; the heat grid prints its numbers; sending months labels every bar and has the readout; top-up prints values.
- Every `role="img"` viz (sparkline, meter, segmented bars) has an `aria-label` with the numbers.
- Interactive marks are focusable and expose the same info on focus as on hover.
- Contrast: all text ≥ 4.5:1. Axis ticks use `--axis-ink`, not the lighter `--faint`. In-fill ink follows §12.
- Colour is never the only channel: risk tiers have labels, emphasis bars have printed counts, and the chips have text.
- `prefers-reduced-motion` is respected if any motion is added.
- Lighthouse a11y ≥ 95 on `/`.

---

## 15. Copy (Thai) — info tips

| Key | Text |
|---|---|
| kpi_rev | เงินที่ลูกค้าชำระจริงรวมกันตั้งแต่ ม.ค. ถึง ธ.ค. {year} จากตารางการชำระเงิน ตามวันที่ชำระ · when G8 fires, add: ไม่นับบัญชี #{acc_id} รายได้ครึ่งปีหลังโต {growthEx}% |
| kpi_active | บัญชีที่ส่งข้อความหรือชำระเงินภายใน 180 วันก่อนวันตัดข้อมูล คือสถานะ "ใช้งาน · จ่ายเงิน" และ "ใช้งาน · ไม่ได้เติมเงิน" |
| kpi_rar | ผลรวมของ โอกาสเลิกใช้ × มูลค่าที่คาดว่าจะจ่ายใน 6 เดือน ของลูกค้าที่จ่ายเงินทุกราย เป็นค่าคาดหวัง ไม่ใช่เงินที่หายไปแล้ว อีก {unscored} รายใช้งานไม่ถึง 90 วัน ยังไม่มีคะแนน · มูลค่า 6 เดือนเป็นค่าที่โมเดลคาด เทียบกับรายได้จริง 6 เดือนล่าสุด {h2Actual} |
| kpi_risk | ลูกค้าที่จ่ายเงินซึ่งมีโอกาสไม่ใช้งานและไม่ชำระเงินเลยใน 180 วันข้างหน้า ระดับสูง ({high}–{critical}) หรือวิกฤต ({critical} ขึ้นไป) ประเมินเฉพาะลูกค้าที่ใช้งานมาเกิน 90 วัน {eligible} ราย |
| trend | ผู้จ่ายเงิน = บัญชีที่ชำระเงินมากกว่า ฿0 ในเดือนนั้น · ลูกค้าที่ส่งข้อความ = บัญชีที่ส่ง SMS หรือ Email ในเดือนนั้น · เส้นประ = ค่าเฉลี่ยต่อเดือนของแต่ละครึ่งปี ทั้ง 3 ตัวชี้วัดใช้แกนเวลาเดียวกัน สลับดูทีละตัว |
| conc | รวมยอดชำระต่อบัญชีใน 12 เดือนก่อนวันตัดข้อมูล แล้วเรียงจากมากไปน้อย แบ่งเป็น 1% แรก, 1–5%, 5–10% และที่เหลือ แถบบนคือสัดส่วนจำนวนคน แถบล่างคือสัดส่วนรายได้ของกลุ่มเดียวกัน |
| base | สถานะตามกฎตายตัว ไม่ได้มาจากการทำนาย ข้อมูลกิจกรรมเริ่ม {data start} · "ไม่ได้เติมเงิน" = ไม่มีการชำระในช่วงข้อมูล อาจเคยเติมก่อนหน้านั้นแล้วใช้เครดิตเดิม |
| matrix | ตัวเลขใหญ่ = จำนวนลูกค้า · สีเข้มขึ้น = รายได้ที่เสี่ยงหายในช่องนั้นมากขึ้น · โอกาสเลิกใช้แบ่งด้วยเกณฑ์ {thresholds} · มูลค่า 6 เดือน: 10% แรก = สูง, 10–50% = กลาง, ที่เหลือ = ต่ำ (จัดอันดับเฉพาะรายที่คาดว่าจะจ่ายมากกว่า ฿0) · คาดว่าไม่จ่าย = โมเดลคาดว่าจะจ่าย ฿0 ใน 6 เดือน · ไม่รวม {unscored} รายที่ใช้งานไม่ถึง 90 วัน |
| months | จำนวนเดือนที่ลูกค้าที่จ่ายเงินมีการส่งข้อความ ใน {window} · "เคยเลิกใช้" = สัดส่วนที่เลิกใช้จริงภายใน 180 วัน เมื่อย้อนทดสอบ ณ {backtest date} (6 เดือนก่อนวันตัดข้อมูล) กับลูกค้าในข้อมูลชุดเดียวกัน เป็นสัญญาณที่บอกการเลิกใช้ได้ดีที่สุดในข้อมูล |
| top | รายได้ที่เสี่ยงหาย = โอกาสเลิกใช้ × มูลค่าที่คาดว่าจะจ่ายใน 6 เดือน เรียงจากลูกค้าที่จ่ายเงินทุกระดับ · บรรทัดใต้เลขบัญชีคือเหตุผลหลักจากโมเดลเมื่อมี ถ้าไม่มีจะแสดงระดับมูลค่าและยอดที่คาดว่าจะจ่าย |
| topup | โมเดลทำนายจำนวนวันถึงการเติมเครดิต (ชำระเงิน) ครั้งถัดไป จากประวัติการเติมเงินจริง นับจากวันตัดข้อมูล {cutoff} ไม่ใช่วันที่เครดิตหมด · ในการทดสอบย้อนหลัง ราว {hitRate} ของรายที่คาดว่าจะเติมใน 14 วัน เติมจริงภายใน 14 วัน |

All other visible strings are quoted inline in §5–§9. Put them in the components as literals, or in `lib/labels.ts` when shared, following `CONTENT.md`.

---

## 16. Prototype numbers: real vs sample

Use these to sanity-check the implementation against prediction run `07fc9347-8f26-4826-9279-9521020918b2` on the Excel workbook (cutoff **1 ม.ค. 2569**). Every figure below is real.

| Figure | Value |
|---|---|
| Monthly revenue 2568 (฿M) | 27.59, 26.18, 28.98, 26.24, 34.42, 40.74, 41.17, 35.07, 38.47, 29.86, 39.79, 45.12 (Σ 413.6) |
| Monthly payers | 382, 427, 426, 397, 456, 429, 472, 450, 478, 430, 443, 508. These count any payment row; with G1's > ฿0 rule, 9 of the months are one lower |
| Monthly senders | 1,949, 1,907, 2,002, 1,953, 2,129, 2,106, 2,186, 2,130, 2,111, 2,151, 2,279, 2,111 |
| Concentration tiers | 30 / 118 / 147 / 2,650 payers (n = 2,945); ฿208.9M / 91.9M / 40.9M / 72.0M; bottom k = 1,240 (shown as 1,200) |
| Top contributor (G8) | #296269: 76% of the H2 − H1 increase; without it, revenue +6% and revenue per payer −4% |
| Lifecycle | 2,572 / 1,678 / 7,174 (1,914 ever paid) / 19,273 = 30,697 |
| Heat grid | §8.1: ฿55.2M at risk; KPI 4 = 899 (297 critical + 602 high) of 2,282 scored; `none` row 539 |
| Finding | high tier 85% / 201 customers; Call List head: 1 account holds 49% |
| Top-5 | §8.3 (#296269, #264612, #282926, #263310, #259522) |
| Sending months histogram | 457 / 455 / 297 / 204 / 193 / 966 |
| Backtest at 1 ก.ค. 2568 | n 374 / 453 / 277 / 211 / 208 / 865; churn 71 / 58 / 42 / 25 / 17 / 1% |
| Top-up buckets | 320 / 375 / 1,049 / 1,974 / 532 (Σ 4,250); hit rate 0.24; `demand_30d` 191.2M credits |
| KPI 3 | atRisk ฿55.2M of `clvTotal` ฿364.0M → meter 15.2% |
| 6-month CLV vs actual (R11) | KPI 3's 2,282 customers: ฿364.0M predicted vs ฿222.3M they paid in H2 2568 (1.64×). Without #296269: ฿271.2M vs ฿187.6M (1.45×). #296269: ฿92.8M vs ฿34.7M; it first paid in ต.ค. 68 and paid ฿17.1M in ธ.ค. alone, so its own figure is plausible. All Active customers: ฿380.3M vs ฿229.5M from all payers |
| Bucket 0 vs `usage_trend.no_usage` | 457 = 457 (Active Paid) |
| `run.data_start` (G9) | 2024-01. On this workbook it equals cutoff − 24 months, so R10 changes nothing visible here; it matters for a workbook with a different span |

Numbers change with every run. **Don't hard-code any of them.** They are listed only so a reviewer can spot an off-by-one.

---

## 17. Open decisions (flag in the PR, default given)

| ID | Question | Default |
|---|---|---|
| D1 | KPI 1 delta: H2 vs H1 (prototype) or 12 m vs previous 12 m (current code, `revenueChange`)? | **H2 vs H1**, so the KPI matches the trend chart's story. Put YoY in the KPI info tip when `revenueChange` is non-null |
| D2 | Keep the current header finding + AI line? | **Yes**. They answer the page question in one sentence |
| D3 | Heat bins: fixed THB breaks or relative to the run's max? | **Fixed** `[0.5M, 1M, 2M, 5M]` (comparable across runs). Revisit if every cell lands in one bin |
| D4 | Top-5 scope: high-value × high/critical (`top_priority`) or all tiers? | **Decided: the Call List**, all scored Active Paid customers by revenue at risk (R1, F1) |
| D5 | Section year label when the 12-month window spans two calendar years | Use `{first BE month-year}–{last}` instead of `ปี 2568` |
| D6 | May a churn model that gives no reasons (no SHAP, e.g. TabICL) be Champion? | **Parked, ML question.** Until then the top-5 reason line falls back to value tier + CLV (§8.3) |

---

## 18. Acceptance checklist

- [ ] `/` shows: header, KPI strip, section 1 (trend, concentration, base), section 2 (heat grid, active months, top-5, top-up), footnote, in that order.
- [ ] Every card has the correct provenance chip.
- [ ] No chart uses two y-axes. The trend switches metric; its tooltip lists all available metrics.
- [ ] Trend: max-month label only; dashed half-average lines; half summary row with a `Delta`; table view toggle works and is keyboard accessible.
- [ ] Concentration: two 100% bars, 1% tier visible (min width), linked highlight, callout computed from data.
- [ ] Base: shares sum to 100%; each card links to the right `/customers` tab with `run` preserved.
- [ ] Heat grid: four rows including `none`; columns sum to `churn.by_risk` and the total equals `eligible_count`; thresholds come from the run's own churn model (F2); selected cell shows the Playbook action from `CELL_ACTION`; link filters by tier + risk; column totals summed from cells; title uses `highTier`.
- [ ] Customer page: no Segment pill, "กลุ่มแนะนำ" row or "อันดับที่ต้องดูแล"; the Playbook action of the customer's cell is shown; the `needs_review` banner stays.
- [ ] Sending months: emphasis on buckets 0–1; rate row hidden when rates are null; readout updates on hover and focus; link uses `sending_months_max` once G7 ships; on the real run, bucket 0 equals `usage_trend.no_usage` for Active Paid and the rates read 71 / 58 / 42 / 25 / 17 / 1%.
- [ ] Top-5: #296269 is row 1 on the real run; rows link to `/customers/{id}?run=…`; meter widths relative to row 1; reason line falls back when `top_factor` is null; the dots column is hidden until G5b ships.
- [ ] Top-up: five bars; row 2 = critical − due_7d; title says "อาจเติม"; hit-rate sentence hidden when G10 is null; link equals the list's "credit" preset.
- [ ] Wording: no visible copy uses "ใช้งาน" for a monthly count; "ผู้จ่ายเงิน" counts payments above ฿0.
- [ ] Missing fields render the unavailable state, never zeros.
- [ ] New colour tokens exist in light and dark; dark mode reviewed on every card.
- [ ] At 390 px: no page-level horizontal scroll; heat grid and top-5 scroll inside their cards; trend x-labels thinned.
- [ ] `overview-model.test.ts` covers §11.3; `assertAtRiskMatches` still passes.
- [ ] Lighthouse a11y ≥ 95.

---

## 19. Suggested PR breakdown

1. **Tokens + model:** add the §12 tokens, extend `overview-model.ts` (§11.3) with tests. No UI change.
2. **Layout + KPI strip:** new page grid and section headings; `KpiStrip` gets the `viz` + `chip` slots; sparkline, meter and segmented bar components.
3. **Section 1:** `monthly-trend.tsx` (revenue only, with pay/mau disabled), `customer-base.tsx`, the concentration card frame with its unavailable state.
4. **Section 2:** rewrite the `risk-map.tsx` heat grid (4 rows) + `CELL_ACTION`, and swap the Segment for the Playbook action on the customer page; `top-risk-table.tsx`; reshape the top-up card; sending-months card frame with its unavailable state.
5. **API small:** F1, F2, G1, G2, G4, G9, G10 → Call List scope, per-run thresholds, trend switch, churned description, data start, top-up hit rate.
6. **API concentration:** G3 + G8 (one query).
7. **API sending months:** G5, G5b, G6, G7 → sending-months card, top-5 dots, list filter. No ML change.

Each PR leaves the page shippable.
