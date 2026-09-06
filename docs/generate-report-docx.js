// md → docx converter for the Thai final-project report
// Parses the markdown subset used in docs/FINAL-REPORT-FULL-TH.md
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  PageBreak, Header, Footer, PageNumber, NumberFormat, SectionType,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  TableOfContents, TableLayoutType,
} = require("docx");
const fs = require("fs");

const SRC = "docs/FINAL-REPORT-FULL-TH.md";
const OUT = "docs/FINAL-REPORT-FULL-TH.docx";
const TH = { ascii: "Tahoma", eastAsia: "Tahoma", hAnsi: "Tahoma" };
const MONO = { ascii: "Courier New", eastAsia: "Tahoma", hAnsi: "Courier New" };
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

const run = (text, o = {}) => new TextRun({ text, font: TH, size: 24, color: "000000", ...o });

// inline **bold** and `code` (bold may span backticks)
function fmtCode(text, base) {
  const parts = []; let rest = text; const codeRe = /`([^`]+)`/;
  while (rest) {
    const m = rest.match(codeRe);
    if (!m) { parts.push(run(rest, base)); break; }
    if (m.index > 0) parts.push(run(rest.slice(0, m.index), base));
    parts.push(run(m[1], { ...base, font: MONO, size: (base.size || 24) - 2 }));
    rest = rest.slice(m.index + m[0].length);
  }
  return parts;
}
function inlineRuns(text, base = {}) {
  const parts = []; let rest = text; const boldRe = /\*\*(.+?)\*\*/;
  while (rest) {
    const m = rest.match(boldRe);
    if (!m) { parts.push(...fmtCode(rest, base)); break; }
    if (m.index > 0) parts.push(...fmtCode(rest.slice(0, m.index), base));
    parts.push(...fmtCode(m[1], { ...base, bold: true }));
    rest = rest.slice(m.index + m[0].length);
  }
  return parts.length ? parts : [run("", base)];
}

function h(text, level, first) {
  return new Paragraph({
    heading: level,
    keepNext: true,
    ...(level === HeadingLevel.HEADING_1 && !first ? { pageBreakBefore: true } : {}),
    ...(level === HeadingLevel.HEADING_1
      ? { alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360, line: 360 } }
      : level === HeadingLevel.HEADING_2
        ? { spacing: { before: 360, after: 200, line: 360 } }
        : { spacing: { before: 240, after: 120, line: 360 } }),
    children: inlineRuns(text, { bold: true, size: level === HeadingLevel.HEADING_1 ? 32 : level === HeadingLevel.HEADING_2 ? 28 : 26 }),
  });
}
const h1 = (t, first) => h(t, HeadingLevel.HEADING_1, first);
const h2 = (t) => h(t, HeadingLevel.HEADING_2, true);
const h3 = (t) => h(t, HeadingLevel.HEADING_3, true);

const body = (t, keep) => new Paragraph({
  alignment: AlignmentType.LEFT, indent: { firstLine: 708 }, spacing: { line: 360, after: 60 },
  ...(keep ? { keepNext: true } : {}),
  children: inlineRuns(t),
});
const numItem = (t) => new Paragraph({
  alignment: AlignmentType.LEFT, indent: { left: 708, hanging: 360 }, spacing: { line: 360, after: 40 },
  children: inlineRuns(t),
});
const plain = (t) => new Paragraph({
  alignment: AlignmentType.LEFT, spacing: { line: 360, after: 60 }, children: inlineRuns(t),
});
const bullet = (t) => new Paragraph({
  bullet: { level: 0 }, alignment: AlignmentType.LEFT, spacing: { line: 360, after: 40 },
  children: inlineRuns(t),
});
const tcap = (t) => new Paragraph({
  keepNext: true, alignment: AlignmentType.CENTER, spacing: { before: 200, after: 80, line: 320 },
  children: inlineRuns(t, { bold: true, size: 22 }),
});
const fcap = (t) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 80, after: 200, line: 320 },
  children: inlineRuns(t, { bold: true, size: 21 }),
});
const note = (t) => new Paragraph({
  spacing: { line: 360, after: 60 }, children: inlineRuns(t, { italics: true, size: 20, color: "444444" }),
});
const monoBlock = (lines) => lines.map(l => new Paragraph({
  spacing: { line: 260 }, shading: { type: ShadingType.CLEAR, fill: "F5F7FA" }, indent: { left: 200 },
  children: [run(l === "" ? " " : l, { size: 16, font: MONO })],
}));

function threeLine(headers, rows) {
  const n = headers.length;
  const clean = (s) => (s || "").replace(/[*`]/g, "");
  // token-aware: column must fit its longest unbreakable token
  const tokLen = (i) => Math.max(...[headers[i], ...rows.map(r => r[i] || "")]
    .flatMap(s => clean(s).split(/\s+/)).map(x => x.length), 4);
  const cellLen = (i) => Math.max(...[headers[i], ...rows.map(r => r[i] || "")]
    .map(s => clean(s).length), 4);
  const weight = headers.map((_, i) => Math.max(tokLen(i) + 2, Math.min(cellLen(i), 60), 6));
  const sum = weight.reduce((a, b) => a + b, 0);
  const pct = weight.map(x => Math.max(9, Math.round((x / sum) * 100)));
  const diff = pct.reduce((a, b) => a + b, 0) - 100;
  pct[pct.indexOf(Math.max(...pct))] -= diff;
  const fsz = (n >= 6) ? 18 : (n >= 4 ? 20 : 21);
  const isAsciiish = (t) => /[_.\/\d()]/.test(t) && !/[\u0E00-\u0E7F]{4}/.test(t);
  const cell = (text, isHdr, i) => new TableCell({
    width: { size: pct[i], type: WidthType.PERCENTAGE },
    borders: isHdr
      ? { bottom: { style: BorderStyle.SINGLE, size: 2, color: "000000" }, top: NB, left: NB, right: NB }
      : { top: NB, bottom: NB, left: NB, right: NB },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: (isAsciiish(text) || clean(text).length > 45 || i > 0 && w[i] > 55) ? AlignmentType.LEFT : AlignmentType.CENTER,
      spacing: { line: 280 },
      children: inlineRuns(text, { bold: isHdr, size: fsz }),
    })],
  });
  const w = weight;
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        left: NB, right: NB, insideHorizontal: NB, insideVertical: NB,
      },
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((t, i) => cell(t, true, i)) }),
        ...rows.map(r => new TableRow({ cantSplit: true, children: headers.map((_, i) => cell(r[i] || "", false, i)) })),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

// ---------- parse markdown ----------
const md = fs.readFileSync(SRC, "utf8");
const lines = md.split("\n");
let items = [], i = 0, firstH1 = true, inCode = false, code = [];
while (i < lines.length && lines[i].trim() !== "---") i++;
i++;

for (; i < lines.length; i++) {
  const raw = lines[i];
  const line = raw.trimEnd();
  if (inCode) {
    if (line.startsWith("```")) { items.push({ kind: "mono", lines: code }); code = []; inCode = false; }
    else code.push(raw);
    continue;
  }
  if (line.startsWith("```")) { inCode = true; code = []; continue; }
  if (line === "" || line === "---") continue;
  if (line.startsWith("|")) {
    const tbl = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) { tbl.push(lines[i].trim()); i++; }
    i--;
    const split = (s) => s.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
    const rows = tbl.filter(r => !/^\|(\s*:?-{2,}:?\s*\|)+$/.test(r)).map(split);
    if (rows.length >= 2) items.push({ kind: "table", headers: rows[0], rows: rows.slice(1) });
    continue;
  }
  if (line.startsWith("### ")) { items.push({ kind: "h3", text: line.slice(4) }); continue; }
  if (line.startsWith("## ")) { items.push({ kind: "h2", text: line.slice(3) }); continue; }
  if (line.startsWith("# ")) { items.push({ kind: "h1", text: line.slice(2), first: firstH1 }); firstH1 = false; continue; }
  if (line.startsWith("> ")) { items.push({ kind: "note", text: line.slice(2) }); continue; }
  if (line.startsWith("**ตารางที่")) { items.push({ kind: "tcap", text: line }); continue; }
  if (line.startsWith("**รูปที่")) { items.push({ kind: "fcap", text: line }); continue; }
  if (line.startsWith("- ")) { items.push({ kind: "bullet", text: line.slice(2) }); continue; }
  if (/^\d+\.\s/.test(line)) { items.push({ kind: "num", text: line }); continue; }
  items.push({ kind: "body", text: line });
}

// lead-in paragraphs stick to the block that follows
function render(items) {
  return items.map((it, k) => {
    const next = items[k + 1];
    const stick = next && ["table", "mono", "bullet", "num"].includes(next.kind);
    if (it.kind === "body") return body(it.text, stick);
    if (it.kind === "num") return numItem(it.text);
    if (it.kind === "bullet") return bullet(it.text);
    if (it.kind === "note") return note(it.text);
    if (it.kind === "tcap") return tcap(it.text);
    if (it.kind === "fcap") return fcap(it.text);
    if (it.kind === "h1") return h1(it.text, it.first);
    if (it.kind === "h2") return h2(it.text);
    if (it.kind === "h3") return h3(it.text);
    if (it.kind === "table") return threeLine(it.headers, it.rows);
    if (it.kind === "mono") return monoBlock(it.lines);
    return [];
  }).flat();
}

// split: front matter (everything before บทที่ 1) vs body
const splitIdx = items.findIndex(it => it.kind === "h1" && it.text.startsWith("บทที่ 1"));
const frontItems = items.slice(0, splitIdx);
const bodyItems = items.slice(splitIdx);
const front = render(frontItems);
const out = render(bodyItems);

// ---------- cover ----------
function coverChildren() {
  const infoRows = [
    ["ชื่อโครงงาน", "ระบบวิเคราะห์และพยากรณ์มูลค่าลูกค้าและความเสี่ยงการเลิกใช้บริการ (moby-analytics)"],
    ["ผู้จัดทำ", "【ชื่อ-นามสกุล】"],
    ["รหัสนักศึกษา", "【รหัสนักศึกษา】"],
    ["อาจารย์ที่ปรึกษา", "【อาจารย์ที่ปรึกษา】"],
    ["ภาคการศึกษา", "【ภาคการศึกษา/ปีการศึกษา】"],
  ];
  const infoTable = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 90, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER,
    borders: { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB },
    rows: infoRows.map(([label, value]) => new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          width: { size: 44, type: WidthType.PERCENTAGE },
          borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" }, top: NB, left: NB, right: NB },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { line: 360 },
            children: [run(label + ":", { size: 24, bold: true })] })],
        }),
        new TableCell({
          width: { size: 56, type: WidthType.PERCENTAGE },
          borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" }, top: NB, left: NB, right: NB },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { line: 360 },
            children: [run(value, { size: 26 })] })],
        }),
      ],
    })),
  });
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1500, after: 300, line: Math.ceil(20 * 23), lineRule: "atLeast" },
      children: [run("รายงานโครงงานวิศวกรรมคอมพิวเตอร์", { size: 32, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 650, line: Math.ceil(18 * 23), lineRule: "atLeast" },
      children: [run("โครงงานสำหรับการสอบประเมินผล (Senior Project)", { size: 28 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120, line: Math.ceil(20 * 23), lineRule: "atLeast" },
      children: [run("ระบบวิเคราะห์และพยากรณ์มูลค่าลูกค้า", { size: 36, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800, line: Math.ceil(20 * 23), lineRule: "atLeast" },
      children: [run("และความเสี่ยงการเลิกใช้บริการ (moby-analytics)", { size: 36, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 550, line: Math.ceil(14 * 23), lineRule: "atLeast" },
      children: [run("Customer Lifetime Value, Churn Prediction, and Credit Usage Forecasting", { size: 24, italics: true })] }),
    infoTable,
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 900, line: Math.ceil(14 * 23), lineRule: "atLeast" },
      children: [run("ภาคการศึกษาที่ 【…】 ปีการศึกษา 2569", { size: 26 })] }),
  ];
}

// ---------- TOC ----------
const tocChildren = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360 },
    children: [run("สารบัญ", { bold: true, size: 32 })] }),
  new TableOfContents("สารบัญ", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({ spacing: { before: 200 },
    children: [run("หมายเหตุ: เมื่อเปิดเอกสารครั้งแรก Word จะถามให้อัปเดตฟิลด์ ให้กด \"ใช่\" เพื่อให้เลขหน้าในสารบัญตรงกับหน้าจริง", { italics: true, size: 18, color: "888888" })] }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ---------- assemble ----------
const pageMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417, header: 850, footer: 992 };
const pageHeader = new Header({ children: [new Paragraph({
  alignment: AlignmentType.CENTER,
  border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" } },
  children: [run("รายงานโครงงาน: ระบบวิเคราะห์และพยากรณ์มูลค่าลูกค้าและความเสี่ยงการเลิกใช้บริการ (moby-analytics)", { size: 18, color: "333333" })],
})] });
const numFooter = () => new Footer({ children: [new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [run("- ", { size: 21 }), new TextRun({ children: [PageNumber.CURRENT], size: 21, font: TH }), run(" -", { size: 21 })],
})] });

const doc = new Document({
  creator: "moby-analytics",
  title: "รายงานโครงงาน: ระบบวิเคราะห์และพยากรณ์มูลค่าลูกค้าและความเสี่ยงการเลิกใช้บริการ",
  styles: { default: {
    document: { run: { font: TH, size: 24, color: "000000" }, paragraph: { spacing: { line: 360 } } },
    heading1: { run: { font: TH, size: 32, bold: true, color: "000000" },
      paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360, line: 360 }, outlineLevel: 0 } },
    heading2: { run: { font: TH, size: 28, bold: true, color: "000000" },
      paragraph: { spacing: { before: 360, after: 200, line: 360 }, outlineLevel: 1 } },
    heading3: { run: { font: TH, size: 26, bold: true, color: "000000" },
      paragraph: { spacing: { before: 240, after: 120, line: 360 }, outlineLevel: 2 } },
  } },
  sections: [
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: pageMargin } }, children: coverChildren() },
    { properties: { type: SectionType.NEXT_PAGE, page: { size: { width: 11906, height: 16838 }, margin: pageMargin,
        pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } } },
      headers: { default: pageHeader }, footers: { default: numFooter() }, children: [...tocChildren, ...front] },
    { properties: { type: SectionType.NEXT_PAGE, page: { size: { width: 11906, height: 16838 }, margin: pageMargin,
        pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
      headers: { default: pageHeader }, footers: { default: numFooter() }, children: out },
  ],
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync(OUT, buf); console.log("OK", OUT, buf.length, "bytes"); });
