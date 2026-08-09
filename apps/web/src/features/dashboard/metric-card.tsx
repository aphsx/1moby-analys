import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ElementType } from "react";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import { TEXT_SAFE } from "./palette";

export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "brand",
  href,
}: {
  icon: ElementType;
  label: string;
  value: string;
  hint: string;
  tone?: "brand" | "danger" | "warn";
  href?: string;
}) {
  const toneStyles = {
    brand: {
      color: MOBY_BRAND.blue,
      softBg: "rgba(0, 107, 255, 0.08)",
    },
    danger: {
      color: MOBY_BRAND.orange,
      softBg: "rgba(252, 76, 2, 0.08)",
    },
    warn: {
      color: MOBY_BRAND.orangeWarm,
      softBg: "rgba(255, 164, 0, 0.10)",
    },
  }[tone];

  const content = (
    <div className="flex h-full min-w-0 flex-col text-left">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className={`type-label min-w-0 truncate ${TEXT_SAFE}`}>{label}</p>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: toneStyles.color, color: "#ffffff" }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-4 min-w-0">
        <h3
          className={`num truncate text-left text-[30px] text-[color:var(--ink-1)] tabular-nums leading-none ${TEXT_SAFE}`}
        >
          {value}
        </h3>
      </div>

      <div className="mt-auto flex min-w-0 items-center justify-between gap-3 pt-3">
        <p
          className={`min-w-0 text-left font-normal text-[11px] text-[color:var(--ink-4)] leading-snug ${TEXT_SAFE}`}
        >
          {hint}
        </p>
        {href ? (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: toneStyles.color, color: "#ffffff" }}
          >
            <ArrowRight size={13} />
          </span>
        ) : null}
      </div>
    </div>
  );

  const cardClass =
    "block h-[148px] min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-none transition-colors";

  if (href) {
    return (
      <Link
        className={`${cardClass} hover:border-gray-200 hover:bg-gray-50/40`}
        href={href}
      >
        {content}
      </Link>
    );
  }

  return <div className={cardClass}>{content}</div>;
}
