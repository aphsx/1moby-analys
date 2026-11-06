"use client";
/**
 * The AI summary of the run, one line under the finding (UI plan phase 2), always labelled
 * "สรุปจาก AI". Descriptive only; it never prescribes actions.
 */
import { useState } from "react";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { fetchRunInsight, generateRunInsight } from "@/lib/ml-api";
import { formatDateTime } from "@/lib/format";
import { useAsync } from "@/lib/use-async";

/** Markdown → one plain line for the collapsed view. */
const plain = (md: string) => md.replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();

export function AiSummaryLine({ runId }: { runId: string }) {
  // A failed load shows the generate button, same as no summary yet.
  const loaded = useAsync(() => fetchRunInsight(runId), [runId]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const insight = loaded.data;
  const text = insight?.ai_status === "completed" ? insight.ai_summary?.trim() : undefined;

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      loaded.setData(await generateRunInsight(runId, { force: Boolean(text) }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "สร้างสรุปไม่สำเร็จ");
    } finally {
      setGenerating(false);
    }
  }

  if (loaded.loading) return null;

  const label = <span className="mr-1.5 inline-flex h-5 items-center rounded-full bg-accent-soft px-2 text-micro font-medium text-accent-ink">สรุปจาก AI</span>;
  const link = "text-small text-accent-ink underline underline-offset-2 disabled:no-underline disabled:opacity-60";

  if (generating) return <p className="mt-2 text-small text-muted">{label}กำลังสรุป…</p>;

  if (!text) {
    return (
      <p className="mt-2 text-small text-muted">
        {label}
        {error ? `${error} · ` : ""}
        <button type="button" onClick={generate} className={link}>
          ให้ AI สรุปรอบนี้
        </button>
      </p>
    );
  }

  return (
    <div className="mt-2 text-small text-muted">
      {open ? (
        <div className="text-text">
          {label}
          <MarkdownLite text={text} strongClassName="font-semibold text-text" />
        </div>
      ) : (
        <p className="line-clamp-2">
          {label}
          {plain(text)}
        </p>
      )}
      <p className="mt-1 flex flex-wrap gap-x-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className={link} aria-expanded={open}>
          {open ? "ย่อ" : "อ่านต่อ"}
        </button>
        {open ? (
          <>
            <button type="button" onClick={generate} className={link}>
              สร้างใหม่
            </button>
            {insight?.ai_generated_at ? <span>สร้างเมื่อ {formatDateTime(insight.ai_generated_at)}</span> : null}
          </>
        ) : null}
        {error ? <span>{error}</span> : null}
      </p>
    </div>
  );
}
