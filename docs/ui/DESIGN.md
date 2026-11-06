# Moby Analytics — Design System (UI refactor)

เอกสารนี้คือ "กติกา" ของหน้าตาระบบใหม่ ใช้คู่กับ:

- `CONTENT.md` — คำศัพท์ไทย, นิยามข้อมูล, ข้อความใน ⓘ, รูปแบบตัวเลขและวันที่
- `REFACTOR-PLAN.md` — แผนแก้ทีละเฟส แมปกับไฟล์จริงใน `apps/web`

ต้นแบบที่ใช้อ้างอิง: artifact "ธีมแดชบอร์ด Moby" (ธีม A / B / C) และ canvas หน้า v5 (รายชื่อลูกค้า + หน้าลูกค้า)

---

## 0. การตัดสินใจหลัก

| เรื่อง | ตัดสินใจ | เหตุผล |
|---|---|---|
| ฟอนต์ UI | **IBM Plex Sans Thai** (400/500/600/700) ทั้งไทย อังกฤษ และตัวเลข | ตัวเลขกว้างเท่ากันทุกตัว ตารางเรียงหลักตรง อ่านง่ายที่ 12–14px มีทุกน้ำหนักที่ใช้ |
| ธีมสว่าง (ค่าเริ่มต้น) | **A · Accent ladder** สีแบรนด์ `#006BFF` | ยึด brand แต่ใช้ให้น้อย: สีเต็มเฉพาะจุดเล็ก สีจางทำงานบนพื้นที่ |
| ธีมมืด | **C · Data terminal** | สำหรับทีม Data/ML ที่เปิดดูนาน การเลือกทุกอย่างคือเส้น 1px สีแบรนด์ |
| ธีมทางเลือก | B · Achromatic ledger (ค่าใน ภาคผนวก A) | ถ้าทีมเลือก B ให้เปลี่ยนแค่ token ใน §2 ไม่ต้องแก้ component |
| ภาษา | ไทยเป็นหลัก ศัพท์เทคนิคอังกฤษได้ตามรายการใน `CONTENT.md` | ผู้ใช้หลักคือทีมขาย ผู้บริหาร การตลาด |
| ความหนาแน่น | ปานกลาง: แถว 45px, body 14px | หน้าภาพรวมแตะ 25–50 จุดข้อมูล |
| ไลบรารีกราฟ | คง `recharts` ตั้งค่าตาม §7 + component SVG เองสำหรับกราฟเฉพาะ | ไม่เพิ่ม dependency ใหม่ |

> ฟอนต์แบรนด์ MeroThai / Geometrica (ใน `public/fonts`) ยังใช้กับโลโก้และงานการตลาดได้ แต่ **ไม่ใช้ในแอป** เพราะการผสมสองฟอนต์ทำให้ตัวเลขกับตัวหนังสือคนละบุคลิก และ `.num` เดิมที่ใช้ Geometrica ทำให้ตัวเลขในตารางกับข้อความไม่เข้ากัน ถ้าทีมแบรนด์ไม่อนุมัติ ให้เปลี่ยนที่ `--font` ที่เดียว

---

## 1. หลักการ (และเหตุผล)

1. **หนึ่งหน้า ตอบหนึ่งคำถาม** — เขียนคำถามไว้ก่อนออกแบบ เช่น หน้าภาพรวม: "รายได้ส่วนไหนเสี่ยงหาย และอยู่กับใคร" บล็อกที่ใหญ่ที่สุดต้องตอบคำถามนี้ บล็อกที่ไม่ตอบคำถามถัดไปให้ลบ
2. **สีอยู่บนข้อมูล ไม่ใช่บนกรอบ** — เมนู พื้นหลัง การ์ด เป็นสีกลาง สีแบรนด์ไปอยู่ที่เส้นกราฟหลัก ปุ่มหลักปุ่มเดียว และรายการที่เลือก รวมพิกเซลสีไม่เกิน ~10%
3. **ตัวเลขคือพระเอก** — KPI เป็นตัวหนังสือ ไม่มีไอคอนในวงกลม ไม่มี sparkline ตัวเลขที่ตอบคำถามของหน้าใหญ่สุด (≥1.3 เท่าของตัวอื่น)
4. **อธิบายได้ทุกตัวเลข** — ทุก KPI และหัวกราฟมี ⓘ บอกว่าคืออะไรและคำนวณจากอะไร (ข้อความอยู่ใน `CONTENT.md`)
5. **บอกสิ่งที่ต้องทำต่อ** — ใต้ชื่อหน้าคือ "ข้อค้นพบ" 1 ประโยค ข้างขวาคือปุ่มหลัก 1 ปุ่มที่ทำงานนั้น
6. **ตัวเลขที่โชว์ซ้ำต้องมาจากตัวแปรเดียว** — ถ้า ฿13.4M ปรากฏ 3 ที่ ต้องคำนวณครั้งเดียว ผลรวมคำนวณจากแถวที่แสดง ไม่พิมพ์ค่าแยก
7. **พื้นผิวแบน** — แยกด้วยเส้น 1px หรือต่างโทน 1 ขั้น ไม่มีเงาบนของที่อยู่นิ่ง (ยกเว้นธีมมืดตาม §2)
8. **ข้อมูลจริงทุกสถานะ** — ศูนย์แสดง 0, ไม่มีข้อมูลแสดง "—" สีเทา, ว่างยังคงกรอบไว้พร้อมประโยคเดียว

---

## 2. Design tokens

วางใน `apps/web/src/app/globals.css` แทนชุด `--moby-*`, `--ink-*` เดิม (ดูขั้นตอนใน `REFACTOR-PLAN.md` เฟส 0)

```css
/* Light = Theme A · Accent ladder (default) */
:root {
  color-scheme: light;
  /* surfaces */
  --ground: #f9fafb;      /* พื้นหน้า + sidebar */
  --surface: #ffffff;     /* การ์ด/แผง */
  --raised: #f3f4f6;      /* แถว hover, well ด้านใน, track */
  --active: #eaf2ff;      /* nav ที่เลือก, แถวที่เลือก */
  /* lines */
  --border: #e5e7eb;      /* ขอบการ์ด */
  --rule: #f2f2f2;        /* เส้นคั่นแถว */
  --control: #d1d5db;     /* ขอบ input / ปุ่มรอง */
  /* text (ทุกระดับผ่าน 4.5:1 บนพื้นที่วาง) */
  --text: #111827;
  --muted: #5f6672;       /* label, caption */
  --faint: #646b78;       /* meta, placeholder */
  /* brand ladder */
  --accent: #006bff;      /* สีเต็ม: จุดเล็กเท่านั้น */
  --accent-soft: #eaf2ff; /* พื้นที่: nav active, badge */
  --accent-track: #d3e4ff;
  --accent-ink: #0a3d91;  /* ตัวอักษรบน accent-soft */
  --primary: #006bff; --primary-ink: #ffffff;
  /* status: สีบอก ดี/แย่ ไม่ใช่ ขึ้น/ลง */
  --positive: #247b50; --pill-positive-bg: #dcfce7; --pill-positive-ink: #14532d;
  --negative: #b93a06; --pill-negative-bg: #ffede3; --pill-negative-ink: #8f2d00;
  --warning:  #92400e; --pill-warning-bg:  #fff6e5; --pill-warning-ink:  #8a4a00;
  --pill-neutral-bg: #f3f4f6; --pill-neutral-ink: #374151;
  /* data */
  --chart-1: #006bff;     /* ซีรีส์หลัก (ปีนี้, ช่วงปัจจุบัน) */
  --chart-muted: #c3c8d1; /* ซีรีส์เทียบ (ปีก่อน) */
  --grid: #edf0f3; --axis-ink: #5f6672;
  --risk-low: #d3e4ff; --risk-medium: #9fc3ff; --risk-high: #4b92ff; --risk-critical: #006bff;
  /* tooltip */
  --tip-bg: #111827; --tip-ink: #ffffff;
  /* type */
  --font: "IBM Plex Sans Thai", system-ui, sans-serif;
  --fs-micro: 12px; --fs-small: 13px; --fs-body: 14px; --fs-section: 16px;
  --fs-kpi: 24px; --fs-title: 28px; --fs-lead: 32px;
  /* shape & space */
  --radius-card: 8px; --radius-control: 6px; --radius-pill: 999px;
  --gap: 24px; --card-pad: 20px; --page-pad: 32px;
  --control-h: 32px; --row-h: 45px; --nav-row: 32px;
  --sidebar-w: 232px; --rail-w: 384px;
  --shadow-float: 0 8px 24px rgba(0, 0, 0, .16); /* เมนู, tooltip, dialog เท่านั้น */
  --shadow-card: none;
}

/* Dark = Theme C · Data terminal */
:root[data-theme="dark"] {
  color-scheme: dark;
  --ground: #171719; --surface: #131217; --raised: #212023; --active: #212023;
  --border: #222224; --rule: #1d1c21; --control: #3a3a3e;
  --text: #ffffff; --muted: #a3a5ab; --faint: #8a8c92;
  --accent: #3d8bff; --accent-soft: #1b2a44; --accent-track: #22385c; --accent-ink: #cfe0ff;
  --primary: #ffffff; --primary-ink: #000000;     /* ปุ่มหลักแบบ invert */
  --positive: #44a282; --pill-positive-bg: #1b2828; --pill-positive-ink: #5fc39c;
  --negative: #e5566f; --pill-negative-bg: #2c1a20; --pill-negative-ink: #f07a8e;
  --warning:  #d9a441; --pill-warning-bg:  #2a2416; --pill-warning-ink:  #e3b55a;
  --pill-neutral-bg: #212023; --pill-neutral-ink: #bdbdc0;
  --chart-1: #f2f2f3; --chart-muted: #5b5b62; --grid: #242328; --axis-ink: #8a8c92;
  --risk-low: #26354d; --risk-medium: #2c5ba6; --risk-high: #3d8bff; --risk-critical: #a9cbff;
  --tip-bg: #f2f2f3; --tip-ink: #111111;
  --shadow-card: 0 12px 28px rgba(0, 0, 0, .2); /* ธีมมืดยกการ์ดด้วยเงาอ่อนนี้อย่างเดียว ไม่มีขอบ */
}
```

ให้ Tailwind ใช้ token เดียวกัน (`tailwind.config.js`) เพื่อไม่ต้องเขียน `text-[color:var(--ink-4)]` อีก:

```js
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ground: "var(--ground)", surface: "var(--surface)", raised: "var(--raised)", active: "var(--active)",
        border: "var(--border)", rule: "var(--rule)", control: "var(--control)",
        text: "var(--text)", muted: "var(--muted)", faint: "var(--faint)",
        accent: { DEFAULT: "var(--accent)", soft: "var(--accent-soft)", track: "var(--accent-track)", ink: "var(--accent-ink)" },
        primary: { DEFAULT: "var(--primary)", ink: "var(--primary-ink)" },
        positive: "var(--positive)", negative: "var(--negative)", warning: "var(--warning)",
      },
      fontFamily: { sans: ["var(--font)"] },
      fontSize: { micro: "12px", small: "13px", body: "14px", section: "16px", kpi: "24px", title: "28px", lead: "32px" },
      borderRadius: { card: "8px", control: "6px" },
    },
  },
  plugins: [],
};
```

> สอนสั้น ๆ: ตั้งชื่อ token ตาม **หน้าที่** (`--muted`, `--negative`) ไม่ใช่ตาม **สี** (`--gray-500`, `--orange`) เพราะธีมมืดจะเปลี่ยนค่าได้โดย component ไม่ต้องรู้เลย

---

## 3. Typography

**การโหลดฟอนต์** (Next 16): ใช้ `next/font/google` ใน `app/layout.tsx`

```ts
import { IBM_Plex_Sans_Thai } from "next/font/google";
const plex = IBM_Plex_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-plex" });
// <html lang="th" className={plex.variable}>  แล้วตั้ง --font: var(--font-plex), system-ui, sans-serif;
```

`next/font` ดาวน์โหลดฟอนต์ตอน build แล้ว self-host ให้ ถ้า Docker build ไม่มีอินเทอร์เน็ต ให้ใช้ `@fontsource/ibm-plex-sans-thai` (ติดตั้งจาก npm) แทน ทั้งสองทางไม่เรียก Google ตอนผู้ใช้เปิดหน้า

| บทบาท | ขนาด / น้ำหนัก / line-height | ใช้กับ |
|---|---|---|
| title | 28 / 600 / 1.25 (มือถือ 24) | ชื่อหน้า (h1) 1 อันต่อหน้า |
| lead | 32 / 600 | ตัวเลขที่ตอบคำถามของหน้า 1 ตัว |
| kpi | 24 / 500 | ตัวเลข KPI อื่น ๆ |
| section | 16 / 600 / 1.4 | หัวการ์ด หัวส่วนใน rail |
| body | 14 / 400 / 1.5 | เนื้อหา, เมนู, ช่องตาราง |
| small | 13 / 400 / 1.4 | caption, meta, คำอธิบายใต้หัว |
| micro | 12 / 400 | ป้ายแกนกราฟ, pill, หัวตาราง |

กติกา:
- **ไม่ใช้ letter-spacing กับภาษาไทย** (วรรณยุกต์/สระเลื่อนตำแหน่ง) และ **ไม่ใช้ตัวพิมพ์ใหญ่ทั้งคำ** กับ label (`.type-label` เดิมเลิกใช้)
- น้ำหนักไม่เกิน 3 ระดับต่อหน้า 600 ใช้กับชื่อ หัวการ์ด และตัวเลขเงินสำคัญ
- ตัวเลขทุกตัวใส่ `font-variant-numeric: tabular-nums` (IBM Plex Sans Thai ตัวเลขกว้างเท่ากันอยู่แล้ว แต่ใส่ไว้กันเปลี่ยนฟอนต์ภายหลัง)
- ข้อความยาวกว้างไม่เกิน ~65 ตัวอักษร
- ภาษาไทยต้องการ line-height ≥ 1.5 สำหรับ body เพราะมีสระบน-ล่าง

---

## 4. การใช้สี

| สถานการณ์ | ใช้ | ห้าม |
|---|---|---|
| เมนูที่เลือก | พื้น `--accent-soft` + ตัวอักษร `--accent-ink` + ไอคอน `--accent` | แถบซ้ายสี, พื้นสีเต็ม |
| ปุ่มหลัก | `--primary` 1 ปุ่มต่อหน้า | ทุกปุ่มเป็นสีแบรนด์ |
| เส้นกราฟหลัก | `--chart-1` | สีต่อซีรีส์ไล่รุ้ง |
| ซีรีส์เทียบ | `--chart-muted` | สีที่สองที่สด |
| ระดับความเสี่ยงบน "พื้นที่" (สี่เหลี่ยม, แท่ง) | `--risk-low…--risk-critical` (ไล่เข้มสีเดียว) | แดง-เหลือง-เขียว |
| ระดับความเสี่ยงเป็น "ข้อความ" (pill) | วิกฤต = negative pair, สูง = warning pair, ปานกลาง/ต่ำ = neutral | pill สีเต็มตัวอักษรขาว |
| การเปลี่ยนแปลง (delta) | ดี = `--positive` หรือเทา, แย่ = `--negative`, ไม่เปลี่ยน = เทา | เขียว=ขึ้น แดง=ลง (เช่น churn ขึ้นคือแย่) |
| สถานะ lifecycle | pill neutral + คำ (ดู `CONTENT.md`) | gradient ต่อสถานะ (`LIFECYCLE_PALETTE` เดิม) |

ห้ามทุกกรณี: gradient (พื้น ปุ่ม ตัวอักษร การ์ด), glow, glass/backdrop-blur, ม่วง/คราม, emoji, ไอคอนในกรอบสีบน KPI

---

## 5. Layout และ shell

```
┌ sidebar 232 ┬──────────── canvas (padding 32) ──────────────┐
│ โลโก้+ทีม    │ h1 ชื่อหน้า                        [ปุ่มหลัก] │
│ ภาพรวม  ●    │ ข้อค้นพบ 1 ประโยค                             │
│ ลูกค้า       │ รอบทำนาย [1 ม.ค. 2569 ▾]      ข้อมูลถึง ...   │
│ ผู้ช่วย AI   │ ┌──────── main 1fr ────────┐ ┌ rail 384 ┐   │
│ ─ การทำนาย ─ │ │ KPI strip                 │ │ หัว      │   │
│ รอบทำนาย     │ │ บล็อกหลัก (ใหญ่สุด)        │ │ การ์ด    │   │
│ เทรนโมเดล    │ │ บล็อกถัดไป                 │ │ หัว      │   │
│ ความแม่นยำ   │ └───────────────────────────┘ │ การ์ด    │   │
│ บัญชีของฉัน  │  gap 24 ทุกทิศ                  └──────────┘   │
└──────────────┴───────────────────────────────────────────────┘
```

- **Sidebar**: พื้นเดียวกับหน้า (`--ground`) คั่นด้วยเส้น 1px ไม่มีรูปพื้นหลังหรือ gradient แถว 32px ระยะ 34px ไอคอน 16px outline เส้น 1.5 ป้ายกลุ่มเป็นคำไทยขนาด 12px สีเทา (ไม่ uppercase) เมนูบัญชีอยู่ล่างสุด
- **ไม่มี top bar** ในธีม A (ช่องค้นหาไปอยู่ใน sidebar หรือหน้า ลูกค้า) ธีม C ใช้ icon rail 56px
- **Canvas**: padding 32, ใช้ gap ค่าเดียว 24 ทั้งแนวตั้งและแนวนอน เขียนเลขคณิตของ grid เป็น comment ในโค้ด เช่น `1440 − 232 − 64 = 1144; main = 1144 − 384 − 24 = 736`
- **Rail** 384px เริ่มระดับเดียวกับการ์ดแรก (ไม่ใช่ระดับชื่อหน้า) หัวส่วนอยู่ "นอก" การ์ด ระยะ 8px ถึงการ์ด
- **Main กับ rail ต้องจบใกล้กัน** — ถ้า rail สั้นกว่ามาก ให้จับบล็อกเล็กสองอันวางคู่กันใน main หรือย้ายบล็อกเล็กไป rail
- **การ์ดที่อยู่แถวเดียวกันจบขอบล่างเดียวกัน** อย่ายืดการ์ดจนมีช่องว่างเกิน 40px ข้างใน

Breakpoints:

| ความกว้าง | layout |
|---|---|
| ≥ 1180 | sidebar + main + rail |
| 860–1179 | sidebar + main (rail ต่อท้าย main) |
| < 860 | top bar 48px (ชื่อหน้า + ปุ่มเมนู) → เมนูเป็น sheet เต็มจอ, KPI 2 คอลัมน์, ตารางกลายเป็นแถว 2 บรรทัด, ปุ่ม/ลิงก์สูง ≥ 44px |

---

## 6. Components

ทุกตัวอยู่ใน `apps/web/src/components/` แมปกับของเดิมในวงเล็บ

### 6.1 PageHeader (แทน `PageHeader` ใน `ui.tsx`)
- h1 คำนาม ("ภาพรวมลูกค้า") ไม่ใช่คำทักทาย
- บรรทัดใต้ = ข้อค้นพบจากข้อมูล 1 ประโยค (≤ 64 ตัวอักษร/บรรทัด) ไม่ใช่คำอธิบายหน้าจอ
- ขวา = ปุ่มหลัก 1 ปุ่ม ชิดขอบล่างของบรรทัดข้อค้นพบ
- แถว scope ใต้หัว: ตัวเลือกรอบทำนาย (`run-selector.tsx`) ซ้าย, freshness stamp "ข้อมูลถึง …" ขวา

### 6.2 KpiStrip (แทน `KpiCard`, `MetricCard`)
- กล่องเดียว แบ่งด้วยเส้น 1px เป็น 3–5 ช่องเท่ากัน จำนวนช่อง = จำนวน KPI
- แต่ละช่อง: label (14 muted) + ⓘ → ค่า (24/500) + หน่วยเล็กสีเทา → caption 13px ที่บอก baseline เช่น "+4.2% จากปี 2567"
- ช่อง lead (ตอบคำถามหน้า) ค่า 32/600
- ห้าม: ไอคอน, sparkline, พื้นสี, delta pill สีสด
- มือถือ: grid 2 คอลัมน์ ถ้าจำนวนคี่ ช่องสุดท้ายเต็มแถว

### 6.3 InfoTip (ใหม่)
- ปุ่ม 28×28 (มือถือ hit area 44) ไอคอน ⓘ 14px สี `--faint` → hover/focus เป็น `--text`
- tooltip กว้าง 264px, 12/18, พื้น `--tip-bg`, เงา `--shadow-float`, ไม่มีลูกศร
- เปิดด้วย hover, focus และ tap (มือถือ) ปิดด้วย Esc/แตะนอก
- `aria-label` บอกว่าอธิบายอะไร, tooltip มี `role="tooltip"` ผูกด้วย `aria-describedby`
- ใกล้ขอบขวาให้ชิดขวา (`right: -8px`)

### 6.4 Panel (แทน `SectionCard`, `.surface*`)
- `--surface`, ขอบ 1px `--border`, radius 8, padding 20, ไม่มีเงา (ธีมมืดใช้ `--shadow-card` แทนขอบ)
- header: h2 16/600 + ⓘ, ใต้หัว meta 13px (หน่วย/ช่วงเวลา/วิธีอ่าน), ขวา = legend หรือ action 1 อัน
- ห้ามซ้อนการ์ดในการ์ด, ห้าม `.lift` hover

### 6.5 Table (แทน `.table-base`)
- หัวตาราง 12px สีเทา น้ำหนักปกติ ประโยคปกติ **ไม่ uppercase ไม่มีพื้นหัว**
- แถว 45px (มือถือเป็นแถว 2 บรรทัด) เส้นคั่น `--rule` ไม่มี zebra, **hover ไม่เปลี่ยนพื้น** แถวที่เลือกใช้ `--active`
- ตัวเลขชิดขวา tabular หัวคอลัมน์ตัวเลขชิดขวาตรงกับค่า
- คอลัมน์ตัวตน (บัญชี) กว้างสุด 1/3–1/2, เหตุผลรองเป็นบรรทัดที่สอง 13px เทา
- 1 สถานะต่อแถว (pill เดียว)
- รายการใน overview ตัดที่ 5–8 แถว + ปุ่ม "ดูทั้งหมด N ราย" ไม่ทำ pagination บน overview
- หน้าลิสต์เต็ม: บอกช่วง "1–50 จาก 2,572 ราย", หัวตาราง sticky

### 6.6 StatusPill (แทน `StatusPill`, `.pill`)
- สูง 22, text 12/500, padding 0 8, radius 999, `white-space: nowrap`, ไม่มี dot ถ้าไม่จำเป็น
- คู่สี: positive / negative / warning / neutral (§2) ห้าม pill สีเต็ม

### 6.7 Delta (แทน `DeltaPill`)
- ข้อความ 13px ไม่ใช่ pill: `+4.2% จากปี 2567` เครื่องหมายบวกลบเสมอ ใช้ `−` (U+2212)
- สีตามดี/แย่ของ metric (churn เพิ่ม = แย่) ศูนย์ = เทา ไม่มีฐานเทียบ = "—"

### 6.8 Buttons
- สูง 32 (มือถือ 44), radius 6, text 14/500, `white-space: nowrap`
- primary: `--primary` (1 ปุ่มต่อหน้า) / secondary: พื้น surface ขอบ `--control` / ghost: ไม่มีขอบ
- ปุ่มไอคอนอย่างเดียวต้องมี `aria-label`

### 6.9 Tabs และ Segmented
- Underline tabs: บนเส้น 1px เต็มความกว้าง เส้นเลือก 2px สี `--text` ป้ายที่ไม่เลือกสีเทา
- Segmented (ตัวกรองด่วน): กล่อง `--raised` padding 6, ปุ่มที่เลือกพื้น `--accent-soft` ตัวอักษร `--accent-ink` 600 + จำนวน 12px ไม่มีเงา (ลบ `.segmented button.active` shadow เดิม)
- ธีมมืด: การเลือกทุกแบบคือเส้น 1px `--accent` กว้างเท่าป้าย

### 6.10 ListRow (รายการ "ต้องโทรก่อน", rail)
- 2 บรรทัด: บรรทัด 1 `#10482` (600) ↔ `฿2,223,000` (600, ชิดขวา) / บรรทัด 2 เหตุผลหลัก 13px เทา (ตัดด้วย …) ↔ pill `78% · วิกฤต`
- ทั้งแถวเป็นลิงก์ไปหน้าลูกค้า, ระยะ 64px, เส้นคั่น `--rule`
- ปิดท้ายด้วยปุ่มรอง "ดูทั้งหมด 55 ราย" เต็มความกว้าง

### 6.11 States
- Loading: layout จริง + แท่งเทาเรียบ (`--raised`) ขนาดเท่าค่าจริง **ไม่มี shimmer gradient**
- Empty: คงกรอบและหัว + กล่องเส้นประ 1px สูง ~40px ประโยคเดียว
- Error: ในบล็อกที่พัง ประโยคเดียว "โหลดข้อมูลรอบทำนายไม่สำเร็จ ข้อมูลล่าสุดเมื่อ 09:14" + ปุ่มข้อความ "ลองอีกครั้ง"
- Stale: freshness stamp + ปุ่ม refresh

---

## 7. Charts

กติการ่วม (ตั้งเป็นค่า default ของ wrapper `components/charts/`):
- 1 กราฟ 1 คำถาม 1 ซีรีส์หลัก (เทียบได้อีก 1 ซีรีส์สีเทา)
- grid แนวนอน 3–5 เส้น `--grid` ไม่มีเส้นแกน y ไม่มี tick line
- ป้ายแกน 12px `--axis-ink` ตัวเลขกลม ๆ (0/20/40/60) ค่าบนสุดเกินค่าสูงสุด
- เส้น 2px ตรง (ไม่ smooth) ไม่มีจุดบนทุกค่า, hover แสดงจุด + tooltip แบบกล่องเรียบ
- แท่งมุมฉาก หรือมุมบน ≤ 4px เริ่มจากศูนย์เสมอ
- กราฟเส้นไม่ต้องเริ่มที่ศูนย์ (ให้เห็นการเปลี่ยนแปลง) แต่แกนต้องมีค่าบอก
- legend เฉพาะเมื่อ ≥ 2 ซีรีส์ วางใน header ของการ์ด swatch = รูปเดียวกับ mark
- ห้าม gradient fill, donut หนา, ป้ายบนชิ้นพาย, สีต่อแท่ง
- อธิบายเหตุการณ์ที่ผิดปกติด้วย annotation 1px + ป้าย 12px

Recharts preset:

```tsx
<LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
  <CartesianGrid vertical={false} stroke="var(--grid)" />
  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--axis-ink)" }} interval="preserveStartEnd" />
  <YAxis axisLine={false} tickLine={false} tickCount={5} width={56} tick={{ fontSize: 12, fill: "var(--axis-ink)" }} tickFormatter={formatBahtCompact} />
  <Tooltip content={<BareTooltip />} cursor={{ stroke: "var(--axis-ink)", strokeOpacity: 0.35 }} />
  <Line type="linear" dataKey="thisYear" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
  <Line type="linear" dataKey="lastYear" stroke="var(--chart-muted)" strokeWidth={2} dot={false} isAnimationActive={false} />
</LineChart>
```

กราฟเฉพาะของระบบ (เลือกตามธีม/ผลโหวตของทีม):

| Component | ตอบคำถาม | ข้อมูล | กติกา |
|---|---|---|---|
| `RiskMap` (ธีม A) | รายได้เสี่ยงหายอยู่ช่องไหน | `value_risk_matrix` (count, clv_sum, revenue_at_risk) | แถว = value tier, คอลัมน์ = risk level, **พื้นที่** สี่เหลี่ยม ∝ revenue_at_risk (ด้าน ∝ √ค่า), สีตาม `--risk-*`, ความสูงแถว = สี่เหลี่ยมใหญ่สุดในแถว, ทุกช่องเป็นลิงก์ไปลิสต์ที่กรองแล้ว |
| `ValueBridge` (ธีม B) | ถ้าไม่ดูแลเลย จะเหลือเท่าไร | ผลรวม clv_sum และ revenue_at_risk ต่อ tier | แท่งแรก = มูลค่า 6 เดือน, แท่งลอย = ส่วนเสี่ยงหายต่อ tier (สี accent), แท่งสุดท้าย = คงเหลือ (เทา), เส้นเชื่อม 1px, แกนเริ่มที่ 0 |
| `UnitChart` (ธีม C) | เงินเสี่ยงหายกระจุกที่ไหน | revenue_at_risk ต่อช่อง | 1 ช่อง = ฿100K, จัดกลุ่มได้ 2 แบบ (มูลค่า / ความเสี่ยง), ตรวจว่าจำนวนช่องรวม = round(total/100K) |
| `MonthlyRevenue` | รายได้รายเดือนปกติไหม | `revenue.monthly_actual` | ปีนี้ `--chart-1`, ปีก่อน `--chart-muted`, legend 2 รายการ |
| `ThinBarList` | อันไหนเร่งด่วนสุด | `credit.by_urgency` | แถบ 3px สีเทา อันแรกสี `--text` ตัวเลขชิดขวา |
| `ShareBar` | ใครทำรายได้ | (รายงาน) | แท่งเดียว 100% แบ่งด้วยช่อง 2px ≤ 5 ส่วน + ตาราง legend |

---

## 8. Accessibility

- ตัวอักษรทุกระดับ ≥ 4.5:1 บนพื้นที่วาง (ค่าใน §2 ผ่านแล้ว อย่าเปลี่ยนเป็นเทาที่อ่อนกว่า `#646b78`)
- focus: `outline: 2px solid var(--accent); outline-offset: 2px`
- **เลิกซ่อน scrollbar ทั้งระบบ** (`* { scrollbar-width: none }` เดิม) ผู้ใช้ trackpad/เมาส์ไม่รู้ว่าเลื่อนได้
- ทุกอย่างที่กดได้เป็น `<button>` หรือ `<a href>` จริง ไม่ใช้ `onClick` บน `div`
- กราฟมี `role="img"` + `aria-label` สรุปสิ่งที่แสดง
- สีไม่ใช่ช่องทางเดียว: ระดับความเสี่ยงมีคำกำกับเสมอ

## 9. Motion

มีเฉพาะ feedback: hover/press/focus 120–200ms, เมนู sheet เลื่อนเข้า 200ms ไม่มี entrance animation ของบล็อก, ไม่มี `pulse-soft`, รองรับ `prefers-reduced-motion`

## 10. ห้ามใช้ (พบในโค้ดเดิม)

| ของเดิม | ที่อยู่ | แทนด้วย |
|---|---|---|
| gradient + รูปพื้นหลังที่หัว sidebar | `components/sidebar.tsx` | โลโก้บนพื้น `--ground` |
| gradient ต่อ lifecycle/brand | `features/dashboard/palette.ts` | pill neutral + คำ, สีทึบจาก token |
| หัวตาราง uppercase + พื้นหัว + hover fill | `.table-base` ใน `globals.css` | §6.5 |
| `.type-label` uppercase letter-spacing | `globals.css` | small 13px sentence case |
| shimmer skeleton (gradient + animation) | `.skeleton` | แท่งเทาเรียบ |
| `.lift` เงาตอน hover การ์ด | `globals.css` | ไม่มี |
| sparkline บน KPI | `Sparkline` ใน `ui.tsx` | กราฟในการ์ดของมันเอง หรือไม่มี |
| ไอคอนบน MetricCard | `features/dashboard/metric-card.tsx` | KpiStrip |
| ตัวเลขด้วย Geometrica | `.num` | IBM Plex Sans Thai + tabular-nums |
| ซ่อน scrollbar | `globals.css` | scrollbar ปกติ |

---

## ภาคผนวก A — ค่า token ของธีม B (Achromatic ledger)

ใช้ถ้าทีมเลือกโทนที่เน้นตัวเลขเงิน: กรอบไม่มีสี, ปุ่มหลักดำ, สีเดียวคือ `#1d5fbf` บนข้อมูลหลัก

```css
:root {
  --ground: #f2f4f7; --surface: #ffffff; --raised: #eeeeee; --active: #e5e5e5;
  --border: #e3e5e8; --rule: #f0f0f0; --control: #d4d4d4;
  --text: #0a0a0a; --muted: #5e6166; --faint: #63666b;
  --accent: #1d5fbf; --accent-soft: #eeeeee; --accent-ink: #0a0a0a;
  --primary: #141414; --primary-ink: #ffffff;
  --chart-1: #141414; --chart-muted: #b9bcc1; --grid: #eceef0;
  --gap: 12px; --fs-title: 24px;
}
```

## ภาคผนวก B — Checklist ก่อน merge ทุกหน้า

- [ ] คำถามของหน้าเขียนไว้ใน PR description และบล็อกใหญ่สุดตอบคำถามนั้น
- [ ] ตัวเลขที่ใหญ่ที่สุดคือตัวที่ตอบคำถาม
- [ ] ทุก KPI/หัวกราฟมี ⓘ ตาม `CONTENT.md`
- [ ] ตัวเลขชิดขวา tabular, รูปแบบตาม `CONTENT.md`
- [ ] ตัวเลขที่ซ้ำกันมาจากตัวแปรเดียว, ผลรวมคำนวณจากแถว
- [ ] ไม่มีรายการใน §10
- [ ] ดูที่ 1440 / 768 / 390: ไม่มีแนวนอนล้น, คำไทยไม่ขาดกลางคำในปุ่ม, main กับ rail จบใกล้กัน
- [ ] สถานะ loading / empty / error ครบทุกบล็อก
