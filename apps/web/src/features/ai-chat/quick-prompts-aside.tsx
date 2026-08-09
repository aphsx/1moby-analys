"use client";

import { AlertTriangle, ChevronRight, TrendingUp, Users } from "lucide-react";
import Link from "next/link";

const TEXT_WRAP =
  "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

const QUICK_PROMPTS = [
  { icon: TrendingUp, label: "วิเคราะห์ churn risk ของพอร์ต" },
  { icon: Users, label: "สรุป lifecycle distribution" },
  { icon: AlertTriangle, label: "บัญชีที่มีความเสี่ยงสูงสุด" },
];

export function QuickPromptsAside({
  showQuick,
  onPrompt,
}: {
  showQuick: boolean;
  onPrompt: (label: string) => void;
}) {
  return (
    <aside className="hidden min-h-0 w-[240px] shrink-0 flex-col gap-4 overflow-y-auto border-gray-200 border-l p-5 xl:flex">
      {showQuick && (
        <div>
          <p className="mb-3 font-semibold text-[10px] text-[color:var(--ink-5)] uppercase tracking-[.12em]">
            ตัวอย่างคำถาม
          </p>
          <div className="space-y-2.5">
            {QUICK_PROMPTS.map(({ label }) => (
              <button
                className={`block w-full text-left text-[12px] text-[color:var(--ink-3)] leading-5 transition-colors hover:text-[color:var(--moby-600)] ${TEXT_WRAP}`}
                key={label}
                onClick={() => onPrompt(label)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-3 font-semibold text-[10px] text-[color:var(--ink-5)] uppercase tracking-[.12em]">
          ลิงก์ด่วน
        </p>
        <div className="space-y-1">
          {[
            { href: "/customers", label: "Customers" },
            { href: "/model-performance", label: "Model Health" },
          ].map(({ href, label }) => (
            <Link
              className="group flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] text-[color:var(--ink-3)] transition-colors hover:bg-gray-50 hover:text-[color:var(--ink-1)]"
              href={href}
              key={href}
            >
              <ChevronRight
                className="text-[color:var(--ink-5)] group-hover:text-[color:var(--moby-600)]"
                size={12}
              />
              <span className={TEXT_WRAP}>{label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="border-gray-200 border-t pt-4">
        <p className="mb-3 font-semibold text-[10px] text-[color:var(--ink-5)] uppercase tracking-[.12em]">
          เมื่อ API พร้อม
        </p>
        <ul className="space-y-2.5">
          {[
            "วิเคราะห์ churn risk",
            "คำนวณ CLV",
            "ติดตาม lifecycle",
            "ตรวจ model drift",
          ].map((cap) => (
            <li
              className="flex min-w-0 items-start gap-2 text-[11.5px] text-[color:var(--ink-3)]"
              key={cap}
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[color:var(--moby-500)]" />
              <span className={TEXT_WRAP}>{cap}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto border-gray-200 border-t pt-4">
        <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
          <p className="mb-1 font-semibold text-[11px] text-[color:var(--moby-600)]">
            Real insights only
          </p>
          <p
            className={`text-[10.5px] text-[color:var(--ink-4)] leading-relaxed ${TEXT_WRAP}`}
          >
            ไม่มี fallback เป็นข้อมูลจำลอง หาก backend ยังไม่พร้อมจะแสดงสถานะรอเชื่อมต่อ
          </p>
        </div>
      </div>
    </aside>
  );
}
