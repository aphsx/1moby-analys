/**
 * MarkdownLite — full-featured Markdown renderer for chat.
 *
 * Handles: headings, **bold**, *italic*, `inline code`, tables,
 * fenced code blocks, ordered/unordered lists, blockquotes, horizontal rules.
 *
 * Zero dependencies. Renders from a string to React elements.
 */

import React from "react";

// ── Regex patterns (module-level: hot parsing path, avoid recompiling) ─────────

// Tokenise: **bold**, *italic*, `code`, plain. Global regex, but every call
// site fully drains matches to null before returning, which resets lastIndex
// to 0 per spec — safe to share across calls.
const INLINE_TOKEN_RE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
const TABLE_PIPE_TRIM_RE = /^\||\|$/g;
const TABLE_SEPARATOR_CELL_RE = /^:?-+:?$/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/;
const HEADING_RE = /^(#{1,4})\s+(.*)/;
const UL_MARKER_RE = /^[-*•]\s/;
const OL_MARKER_RE = /^\d+\.\s/;

// ── Inline renderer ────────────────────────────────────────────────────────────

type InlineProps = { text: string; className?: string };

function Inline({ text, className }: InlineProps) {
  const tokens: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  const nextKey = () => {
    const current = key;
    key += 1;
    return current;
  };
  let match: RegExpExecArray | null = INLINE_TOKEN_RE.exec(text);

  while (match !== null) {
    if (match.index > last) {
      tokens.push(
        <span key={nextKey()}>{text.slice(last, match.index)}</span>
      );
    }
    const m = match[0];
    if (m.startsWith("**")) {
      tokens.push(
        <strong className={className} key={nextKey()}>
          {m.slice(2, -2)}
        </strong>
      );
    } else if (m.startsWith("`")) {
      tokens.push(
        <code
          className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[12px] text-[color:var(--ink-1)]"
          key={nextKey()}
        >
          {m.slice(1, -1)}
        </code>
      );
    } else {
      tokens.push(<em key={nextKey()}>{m.slice(1, -1)}</em>);
    }
    last = match.index + m.length;
    match = INLINE_TOKEN_RE.exec(text);
  }
  if (last < text.length) {
    tokens.push(<span key={nextKey()}>{text.slice(last)}</span>);
  }
  return <>{tokens}</>;
}

// ── Block types ────────────────────────────────────────────────────────────────

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; lang: string; lines: string[] }
  | { type: "table"; header: string[]; align: string[]; rows: string[][] }
  | { type: "ul"; items: string[][] } // items are sub-lines (nested not supported)
  | { type: "ol"; items: string[][] }
  | { type: "blockquote"; lines: string[] }
  | { type: "hr" }
  | { type: "blank" };

// ── Parser ─────────────────────────────────────────────────────────────────────

function parseTableRow(line: string): string[] {
  return line
    .replace(TABLE_PIPE_TRIM_RE, "")
    .split("|")
    .map((c) => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => TABLE_SEPARATOR_CELL_RE.test(c.trim()));
}

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === "") {
      blocks.push({ type: "blank" });
      i += 1;
      continue;
    }

    // HR
    if (HR_RE.test(line.trim())) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // consume closing ```
      blocks.push({ lang, lines: codeLines, type: "code" });
      continue;
    }

    // Heading
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      blocks.push({
        level: headingMatch[1].length,
        text: headingMatch[2],
        type: "heading",
      });
      i += 1;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const qlines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        qlines.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push({ lines: qlines, type: "blockquote" });
      continue;
    }

    // Unordered list
    if (UL_MARKER_RE.test(line)) {
      const items: string[][] = [];
      let current: string[] = [];
      while (
        i < lines.length &&
        (UL_MARKER_RE.test(lines[i]) ||
          (lines[i].startsWith("  ") && current.length > 0))
      ) {
        if (UL_MARKER_RE.test(lines[i])) {
          if (current.length) {
            items.push(current);
          }
          current = [lines[i].replace(UL_MARKER_RE, "")];
        } else {
          current.push(lines[i].trim());
        }
        i += 1;
      }
      if (current.length) {
        items.push(current);
      }
      blocks.push({ items, type: "ul" });
      continue;
    }

    // Ordered list
    if (OL_MARKER_RE.test(line)) {
      const items: string[][] = [];
      let current: string[] = [];
      while (
        i < lines.length &&
        (OL_MARKER_RE.test(lines[i]) ||
          (lines[i].startsWith("  ") && current.length > 0))
      ) {
        if (OL_MARKER_RE.test(lines[i])) {
          if (current.length) {
            items.push(current);
          }
          current = [lines[i].replace(OL_MARKER_RE, "")];
        } else {
          current.push(lines[i].trim());
        }
        i += 1;
      }
      if (current.length) {
        items.push(current);
      }
      blocks.push({ items, type: "ol" });
      continue;
    }

    // Table (lines starting with |)
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      if (tableLines.length >= 2) {
        const header = parseTableRow(tableLines[0]);
        const sep = parseTableRow(tableLines[1]);
        if (isSeparatorRow(sep)) {
          const align = sep.map((c) => {
            if (c.startsWith(":") && c.endsWith(":")) {
              return "center";
            }
            if (c.endsWith(":")) {
              return "right";
            }
            return "left";
          });
          const rows = tableLines.slice(2).map(parseTableRow);
          blocks.push({ align, header, rows, type: "table" });
          continue;
        }
      }
      // Not a valid table → treat as paragraphs
      for (const tl of tableLines) {
        blocks.push({ text: tl, type: "paragraph" });
      }
      continue;
    }

    // Paragraph (collect until blank or block-start)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("> ") &&
      !UL_MARKER_RE.test(lines[i]) &&
      !OL_MARKER_RE.test(lines[i]) &&
      !lines[i].startsWith("|") &&
      !HR_RE.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    if (paraLines.length) {
      blocks.push({ text: paraLines.join("\n"), type: "paragraph" });
    }
  }

  return blocks;
}

// ── Block renderers ────────────────────────────────────────────────────────────

function renderBlock(
  block: Block,
  idx: number,
  strongClass?: string
): React.ReactNode {
  switch (block.type) {
    case "blank":
      return <div aria-hidden className="h-2" key={idx} />;

    case "hr":
      return <hr className="my-3 border-gray-200" key={idx} />;

    case "heading": {
      const hClass = [
        "font-semibold text-[color:var(--ink-1)]",
        block.level === 1
          ? "mt-4 text-[15px]"
          : block.level === 2
            ? "mt-3 text-[14px]"
            : block.level === 3
              ? "mt-2.5 text-[13px]"
              : "mt-2 text-[12px]",
      ].join(" ");
      const inner = <Inline className={strongClass} text={block.text} />;
      if (block.level === 1) {
        return (
          <h1 className={hClass} key={idx}>
            {inner}
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2 className={hClass} key={idx}>
            {inner}
          </h2>
        );
      }
      if (block.level === 3) {
        return (
          <h3 className={hClass} key={idx}>
            {inner}
          </h3>
        );
      }
      return (
        <h4 className={hClass} key={idx}>
          {inner}
        </h4>
      );
    }

    case "paragraph":
      return (
        <p className="leading-relaxed" key={idx}>
          {block.text.split("\n").map((line, li) => (
            <React.Fragment key={li}>
              {li > 0 && <br />}
              <Inline className={strongClass} text={line} />
            </React.Fragment>
          ))}
        </p>
      );

    case "code":
      return (
        <div
          className="my-2 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50"
          key={idx}
        >
          {block.lang && (
            <div className="border-gray-200 border-b px-3 py-1 font-medium text-[10px] text-[color:var(--ink-5)] uppercase tracking-wider">
              {block.lang}
            </div>
          )}
          <pre className="overflow-x-auto p-3 text-[12px] text-[color:var(--ink-2)] leading-relaxed">
            <code>{block.lines.join("\n")}</code>
          </pre>
        </div>
      );

    case "blockquote":
      return (
        <blockquote
          className="my-2 border-[color:var(--moby-400)] border-l-4 pl-3 text-[color:var(--ink-3)]"
          key={idx}
        >
          {block.lines.map((line, li) => (
            <p className="leading-relaxed" key={li}>
              <Inline className={strongClass} text={line} />
            </p>
          ))}
        </blockquote>
      );

    case "ul":
      return (
        <ul className="my-1 space-y-0.5 pl-4" key={idx}>
          {block.items.map((item, ii) => (
            <li className="flex gap-2 leading-relaxed" key={ii}>
              <span className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--moby-500)]" />
              <span>
                {item.map((line, li) => (
                  <React.Fragment key={li}>
                    {li > 0 && <br />}
                    <Inline className={strongClass} text={line} />
                  </React.Fragment>
                ))}
              </span>
            </li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol className="my-1 space-y-0.5 pl-4" key={idx}>
          {block.items.map((item, ii) => (
            <li className="flex gap-2 leading-relaxed" key={ii}>
              <span className="shrink-0 font-semibold text-[color:var(--moby-600)]">
                {ii + 1}.
              </span>
              <span>
                {item.map((line, li) => (
                  <React.Fragment key={li}>
                    {li > 0 && <br />}
                    <Inline className={strongClass} text={line} />
                  </React.Fragment>
                ))}
              </span>
            </li>
          ))}
        </ol>
      );

    case "table":
      return (
        <div
          className="my-2 overflow-x-auto rounded-lg border border-gray-200"
          key={idx}
        >
          <table className="min-w-full text-[12px]">
            <thead className="bg-gray-50">
              <tr>
                {block.header.map((h, hi) => (
                  <th
                    className={`border-gray-200 border-b px-3 py-2 font-semibold text-[color:var(--ink-2)] text-${block.align[hi] ?? "left"}`}
                    key={hi}
                  >
                    <Inline className={strongClass} text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {block.rows.map((row, ri) => (
                <tr className="transition-colors hover:bg-gray-50" key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      className={`px-3 py-2 text-[color:var(--ink-3)] text-${block.align[ci] ?? "left"}`}
                      key={ci}
                    >
                      <Inline className={strongClass} text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export type MarkdownLiteProps = {
  text: string;
  /** Optional className for <strong> tags (e.g., for user messages on coloured bg). */
  strongClassName?: string;
  className?: string;
};

export function MarkdownLite({
  text,
  strongClassName,
  className,
}: MarkdownLiteProps) {
  const blocks = parseBlocks(text);
  return (
    <div className={["min-w-0 space-y-1", className].filter(Boolean).join(" ")}>
      {blocks.map((block, i) => renderBlock(block, i, strongClassName))}
    </div>
  );
}
