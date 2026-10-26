"use client";
/**
 * Binds /customers/[id] to the URL-selected or active prediction run (spec §2.0/§2.3):
 * run selector → fetchRunOutput + fetchCustomerUsageMonthly →
 * CustomerDetailView. No mock fallback — empty state links to /runs.
 */
import Link from "next/link";
import { Database } from "lucide-react";
import { useActiveRun } from "@/stores/run-store";
import { useAsync } from "@/lib/use-async";
import { EmptyState, Skeleton } from "@/components/ui";
import { fetchCustomerPayments, fetchCustomerUsageMonthly, fetchRunOutput } from "@/lib/ml-api";
import { CustomerDetailView } from "./customer-detail-view";

export function CustomerDetailClient({
  accId,
  requestedRunId,
  customersHref,
}: {
  accId: string;
  requestedRunId: string;
  customersHref: string;
}) {
  const { run, runId, runs, loading: runsLoading } = useActiveRun();
  const effectiveRunId =
    requestedRunId && runs.some((candidate) => candidate.id === requestedRunId)
      ? requestedRunId
      : runId;
  const detail = useAsync(
    () =>
      Promise.all([
        fetchRunOutput(effectiveRunId, accId),
        fetchCustomerUsageMonthly(effectiveRunId, accId),
        fetchCustomerPayments(effectiveRunId, accId),
      ]),
    [effectiveRunId, accId],
    Boolean(effectiveRunId)
  );
  const [customer, usageTrend, payments] = detail.data ?? [null, [], []];
  const error = detail.error ? (detail.error instanceof Error ? detail.error.message : "โหลดข้อมูลลูกค้าไม่สำเร็จ") : null;

  const effectiveRun = runs.find((candidate) => candidate.id === effectiveRunId) ?? run;

  if (!runsLoading && !effectiveRun) {
    return (
      <div className="px-4 py-10 sm:px-6 lg:px-8">
        <EmptyState
          title="ยังไม่มี prediction run ที่เสร็จสมบูรณ์"
          hint="import ข้อมูล predict แล้วสร้าง run ก่อน — ข้อมูลลูกค้ารายคนมาจากผลของ run"
          action={
            <Link
              href="/runs"
              className="inline-flex h-9 items-center rounded-lg bg-[color:var(--moby-600)] px-4 text-[13px] font-medium text-white hover:bg-[color:var(--moby-700)]"
            >
              ไปหน้า Prediction Runs
            </Link>
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <EmptyState title={`โหลดข้อมูล account ${accId} ไม่สำเร็จ`} hint={error} />
      </div>
    );
  }

  if (runsLoading || !customer) {
    return (
      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-[26px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <CustomerDetailView
      accId={accId}
      customer={customer}
      usageTrend={usageTrend}
      payments={payments}
      runId={effectiveRun?.id}
      customersHref={customersHref}
    />
  );
}
