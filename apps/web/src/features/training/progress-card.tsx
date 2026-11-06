import { RefreshCw } from "lucide-react";

export function ProgressCard({
  training,
  progress,
  step,
  phase,
}: {
  training: boolean;
  progress: number;
  step: string;
  phase: "raw" | "clean" | null;
}) {
  const label = training
    ? "กำลังเทรนโมเดล"
    : phase === "clean"
      ? "กำลังจัดเตรียมข้อมูล"
      : "กำลังนำเข้าข้อมูล";

  return (
    <div className="mt-5 rounded-card border border-accent-track bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-accent">
          <RefreshCw size={15} className="animate-spin" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-small font-semibold text-text">{label}</p>
            {!training && (
              <span className="num text-small font-semibold text-accent">
                {progress}%
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-micro text-muted">
            {training
              ? "Refreshing active models after training completes."
              : step || "Processing..."}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <GradientProgressBar
          value={training ? 100 : Math.max(progress > 0 ? 4 : 0, progress)}
          indeterminate={training}
        />
      </div>
    </div>
  );
}

function GradientProgressBar({
  value,
  indeterminate = false,
}: {
  value: number;
  indeterminate?: boolean;
}) {
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-raised">
      {/* flat fill; an unknown amount shows a full track-coloured bar instead of a pulse */}
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out ${indeterminate ? "bg-accent-track" : "bg-accent"}`}
        style={{ width: indeterminate ? "100%" : `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
