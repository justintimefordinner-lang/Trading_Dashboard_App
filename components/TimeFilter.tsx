"use client";

// Shared time-range filter used across the closed views and the P&L page:
// All · YTD · a 6→1 calendar-month slider (fills from the right) · Today.
import { useMemo, useState } from "react";
import { type Range } from "@/lib/date-range";

export type TimeMode = "all" | "ytd" | "months" | "today";

export function useTimeFilter(defaultMode: TimeMode = "months", defaultMonths = 1) {
  const [mode, setMode] = useState<TimeMode>(defaultMode);
  const [months, setMonths] = useState(defaultMonths);
  const [now] = useState(() => Date.now());

  const range = useMemo<Range>(() => {
    const d = new Date(now);
    const ymd = (x: Date) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    if (mode === "all") return { start: null, end: null };
    if (mode === "ytd") return { start: ymd(new Date(d.getFullYear(), 0, 1)), end: null };
    if (mode === "today") {
      const t = ymd(d);
      return { start: t, end: t };
    }
    // N calendar months including the current one: 1 = month-to-date,
    // 2 = all of last month + MTD, … 6 = 1st of the month five months back → now.
    return { start: ymd(new Date(d.getFullYear(), d.getMonth() - (months - 1), 1)), end: null };
  }, [mode, months, now]);

  return { mode, setMode, months, setMonths, now, range };
}

export type TimeFilterState = ReturnType<typeof useTimeFilter>;

const chip = (active: boolean) =>
  `shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
    active ? "bg-surface-2 text-text ring-border" : "bg-surface text-muted ring-border active:bg-surface-2/50"
  }`;

export function TimeFilter({ state }: { state: TimeFilterState }) {
  const { mode, setMode, months, setMonths } = state;
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setMode("all")} className={chip(mode === "all")}>
        All
      </button>
      <button onClick={() => setMode("ytd")} className={chip(mode === "ytd")}>
        YTD
      </button>
      <div
        className={`flex-1 rounded-lg px-3 py-1 ring-1 ring-inset ${
          mode === "months" ? "bg-surface-2/40 ring-border" : "bg-surface ring-border"
        }`}
      >
        <div className="flex items-center justify-between text-[10px] text-muted">
          <span>6 mo</span>
          <span className={`font-semibold ${mode === "months" ? "text-text" : "text-muted"}`}>Last {months} mo</span>
          <span>1 mo</span>
        </div>
        <input
          type="range"
          min={1}
          max={6}
          step={1}
          value={months}
          onChange={(e) => {
            setMonths(Number(e.target.value));
            setMode("months");
          }}
          style={{ direction: "rtl" }}
          className="mt-0.5 w-full accent-sky-400"
          aria-label="Months to show"
        />
      </div>
      <button onClick={() => setMode("today")} className={chip(mode === "today")}>
        Today
      </button>
    </div>
  );
}
