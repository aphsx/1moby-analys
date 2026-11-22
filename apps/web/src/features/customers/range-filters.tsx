"use client";
/** Min–max inputs for the tab's number ranges. Applies on submit (or Enter) so typing doesn't refetch the list. */
import { useState, type FormEvent } from "react";
import { BUTTON } from "@/components/ui";
import { RANGE_FIELDS, toRangeValue, type ListFilters, type RangeKey } from "./customers-filters";

type Draft = Partial<Record<RangeKey, { min: string; max: string }>>;

const INPUT =
  "tabular-nums h-9 w-full min-w-0 rounded-control border border-control bg-surface px-3 text-body text-text placeholder:text-faint max-[859px]:h-11";

interface RangeFiltersProps {
  keys: RangeKey[];
  filters: ListFilters;
  onApply: (ranges: Partial<ListFilters>) => void;
}

export function RangeFilters({ keys, filters, onApply }: RangeFiltersProps) {
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(
      keys.map((k) => {
        const [min = "", max = ""] = filters[k].split("-");
        return [k, { min, max }];
      })
    )
  );
  const value = (k: RangeKey) => draft[k] ?? { min: "", max: "" };
  const set = (k: RangeKey, side: "min" | "max", v: string) => setDraft((d) => ({ ...d, [k]: { ...value(k), [side]: v } }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onApply(Object.fromEntries(keys.map((k) => [k, toRangeValue(value(k).min, value(k).max)])));
  };

  return (
    <form onSubmit={submit} aria-label="ตัวกรองช่วงตัวเลข" className="mt-4 rounded-card bg-raised p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {keys.map((k) => {
          const { label, unit } = RANGE_FIELDS[k];
          const suffix = unit === "baht" ? "บาท" : "วัน";
          return (
            <fieldset key={k} className="min-w-0">
              <legend className="text-small text-muted">
                {label} ({suffix})
              </legend>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="ต่ำสุด"
                  aria-label={`${label} ต่ำสุด`}
                  value={value(k).min}
                  onChange={(e) => set(k, "min", e.target.value)}
                  className={INPUT}
                />
                <span aria-hidden className="text-muted">
                  –
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="สูงสุด"
                  aria-label={`${label} สูงสุด`}
                  value={value(k).max}
                  onChange={(e) => set(k, "max", e.target.value)}
                  className={INPUT}
                />
              </div>
            </fieldset>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className={BUTTON.primary}>
          ใช้ตัวกรอง
        </button>
        <button type="button" onClick={() => onApply(Object.fromEntries(keys.map((k) => [k, ""])))} className={BUTTON.ghost}>
          ล้างช่วงตัวเลข
        </button>
      </div>
    </form>
  );
}
