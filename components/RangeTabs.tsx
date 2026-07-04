"use client";

// Shared horizontally-scrollable preset selector for date-range filters.
import { RANGES, type RangeKey } from "@/lib/date-range";

export function RangeTabs({ value, onChange }: { value: RangeKey; onChange: (k: RangeKey) => void }) {
  return (
    <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-0.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => onChange(r.key)}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors ${
            value === r.key ? "bg-surface-2 text-text ring-border" : "text-muted ring-border/60 active:bg-surface-2/50"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
