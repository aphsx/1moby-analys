"use client";

import { type ModelPerfEntry } from "@moby/types";
import { useCallback, useEffect, useState } from "react";
import { Activity, CircleHelp } from "lucide-react";
import { EmptyState, Skeleton } from "@/components/ui";
import { fetchModelPerformance } from "@/lib/ml-api";
import { ModelPerformanceCard } from "./model-performance-card";

export function ModelPerformanceView() {
  const [entries, setEntries] = useState<ModelPerfEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetchModelPerformance()
      .then(setEntries)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "โหลด model performance ไม่สำเร็จ")
      );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="pb-12">
      <div className="mt-5 space-y-6 px-4 sm:px-6 lg:px-8">
        <div className="rounded-card border border-border bg-surface p-4">
          <h1 className="text-section font-semibold text-text">ความแม่นยำและการประเมินผล 3 โมเดล AI (Colab Alignment)</h1>
          <p className="mt-1 max-w-4xl text-small leading-5 text-faint">
            ตัวเลขประสิทธิภาพของโมเดล Champion ปัจจุบันที่วัดผลบนชุดทดสอบจริง (Test Holdout 20%) สอดคล้องตามเกณฑ์และตัวชี้วัดของ Google Colab ทั้ง 3 โมเดล
            · <CircleHelp className="inline h-3.5 w-3.5 align-[-2px]" /> คลิกเครื่องหมายคำถามเพื่อดูคำอธิบายแต่ละตัวชี้วัด · สลับหรือจัดการเวอร์ชันได้ที่หน้าเทรนโมเดล
          </p>
        </div>

        {error && <EmptyState title="โหลดไม่สำเร็จ" hint={error} />}

        {!error && entries === null && (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-96 rounded-card" />
            ))}
          </section>
        )}

        {!error && entries?.length === 0 && (
          <EmptyState
            title="ยังไม่มี evaluation"
            hint="รัน training ให้สำเร็จก่อน"
          />
        )}

        {!error && entries && entries.length > 0 && (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <ModelPerformanceCard key={entry.model_type} entry={entry} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
