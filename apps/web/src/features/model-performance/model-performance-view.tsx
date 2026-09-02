"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, CircleHelp } from "lucide-react";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { fetchModelPerformance, type ModelPerfEntry } from "@/lib/ml-api";
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
      <PageHeader title="Model Accuracy" />

      <div className="mt-5 space-y-4 px-4 sm:px-6 lg:px-8">
        <p className="max-w-3xl text-[12.5px] leading-5 text-[color:var(--ink-5)]">
          Production champion · test holdout ·{" "}
          <CircleHelp className="inline h-3.5 w-3.5 align-[-2px]" /> อธิบาย metric · จัดการเวอร์ชันที่
          Training
        </p>

        {error && <EmptyState icon={Activity} title="โหลดไม่สำเร็จ" hint={error} />}

        {!error && entries === null && (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </section>
        )}

        {!error && entries?.length === 0 && (
          <EmptyState
            icon={Activity}
            title="ยังไม่มี evaluation"
            hint="รัน training ให้สำเร็จก่อน"
          />
        )}

        {!error && entries && entries.length > 0 && (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {entries.map((entry) => (
              <ModelPerformanceCard key={entry.model_type} entry={entry} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
