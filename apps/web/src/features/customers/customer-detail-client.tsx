"use client";
/**
 * Binds /customers/[id] to the URL-selected or active prediction run (spec §2.0/§2.3):
 * run selector → fetchRunOutput + fetchCustomerUsageMonthly →
 * CustomerDetailView. No mock fallback — empty state links to /runs.
 */
import Link from "next/link";
import { useActiveRun } from "@/stores/run-store";
import { getDisplayError } from "@/lib/ui-error";
import { useAsync } from "@/lib/use-async";
import { BUTTON, EmptyState, Skeleton } from "@/components/ui";
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
  const error = detail.error ? getDisplayError(detail.error, "เกิดข้อผิดพลาด") : null;

  const effectiveRun = runs.find((candidate) => candidate.id === effectiveRunId) ?? run;

  if (!runsLoading && !effectiveRun) {
    return (
      <div className="px-4 pt-6 sm:px-6 lg:px-8">
        <EmptyState
          title="ยังไม่มีผลทำนาย"
          hint="อัปโหลดข้อมูลแล้วสร้างรอบทำนายแรกได้ที่ “รอบทำนาย”"
          action={<Link href="/runs" className={BUTTON.primary}>สร้างรอบทำนาย</Link>}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pt-6 sm:px-6 lg:px-8">
        <EmptyState title={`โหลดข้อมูลบัญชี #${accId} ไม่สำเร็จ`} hint={error} />
      </div>
    );
  }

  if (runsLoading || !customer) {
    return (
      <div className="space-y-5 px-4 pt-6 sm:px-6 lg:px-8">
        <Skeleton className="h-5 w-32" />
        <div className="grid gap-6 min-[1180px]:grid-cols-[320px_minmax(0,1fr)]">
          <Skeleton className="h-[560px]" />
          <div className="space-y-5">
            <Skeleton className="h-11" />
            <Skeleton className="h-[124px]" />
            <Skeleton className="h-[260px]" />
          </div>
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
      onCustomerChange={(next) => detail.setData([next, usageTrend, payments])}
    />
  );
}
