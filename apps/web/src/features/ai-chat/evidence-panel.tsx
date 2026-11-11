"use client";
/** The SQL and rows behind an assistant answer, folded under the message. */
import { useState } from "react";
import { ChevronDown, ChevronRight, Database, AlertCircle } from "lucide-react";
import { type ChatEvidence } from "@/stores/chat-store";

// ── Evidence panel ─────────────────────────────────────────────────────────────
export function EvidencePanel({ evidence }: { evidence: ChatEvidence }) {
  const [open, setOpen] = useState(false);
  const hasData = evidence.sql || evidence.row_count > 0 || evidence.warnings.length > 0;
  if (!hasData) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-control border border-border bg-[#f8fafc]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-micro text-muted transition-colors hover:bg-raised"
      >
        <Database size={11} className="shrink-0 text-accent" />
        <span className="flex-1 text-left font-medium">
          {evidence.mode === "text_to_sql"
            ? `SQL · ${evidence.row_count} row${evidence.row_count !== 1 ? "s" : ""}`
            : "ตอบโดยตรง"}
        </span>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-3">
          {evidence.sql && (
            <div>
              <p className="mb-1 text-micro font-semibold text-faint">SQL</p>
              <pre className="overflow-x-auto rounded-control bg-raised p-3 text-micro leading-relaxed text-text">
                <code>{evidence.sql}</code>
              </pre>
            </div>
          )}
          {evidence.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-[var(--pill-warning-bg)] px-3 py-2">
              <AlertCircle size={12} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-micro text-warning">{evidence.warnings.join(" · ")}</p>
            </div>
          )}
          {evidence.row_count > 0 && evidence.columns.length > 0 && (
            <div>
              <p className="mb-1 text-micro font-semibold text-faint">
                Result · {evidence.row_count} rows
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full text-micro">
                  <thead className="bg-raised">
                    <tr>
                      {evidence.columns.map((col) => (
                        <th key={col} className="border-b border-border px-2 py-1.5 text-left font-semibold text-text">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {(evidence.rows as Record<string, unknown>[]).slice(0, 20).map((row, ri) => (
                      <tr key={ri} className="hover:bg-raised">
                        {evidence.columns.map((col) => (
                          <td key={col} className="px-2 py-1.5 text-muted">
                            {String(row[col] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {evidence.row_count > 20 && (
                  <p className="px-3 py-1.5 text-micro text-faint">
                    + {evidence.row_count - 20} more rows
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
