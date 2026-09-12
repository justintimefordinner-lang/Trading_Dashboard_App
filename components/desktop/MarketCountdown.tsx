"use client";

import { useEffect, useState } from "react";
import { nextMarketTransition } from "@/lib/market-hours";

// Live "market open / closed" badge with a countdown to the next transition
// (today's 16:00 ET close, or the next weekday's 9:30 ET open). Pure weekday
// and time-of-day math from lib/market-hours.ts — market holidays are not
// known here, so a holiday reads as a normal trading day, the same caveat
// isRegularSession already carries. Ticks client-side once a second; the
// first paint shows nothing until the effect runs (Date.now() is impure and
// can't be read during render).
//
// Ported from jttyeung's fork minus her daemon-backed holiday calendar.
function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function MarketCountdown() {
  const [state, setState] = useState<{ open: boolean; remainingMs: number } | null>(null);

  useEffect(() => {
    function tick() {
      const t = nextMarketTransition();
      setState({ open: t.open, remainingMs: t.at.getTime() - Date.now() });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!state) return null;

  const style = state.open ? "bg-pos/10 text-pos ring-pos/30" : "bg-neg/10 text-neg ring-neg/30";

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${style}`} title="Weekday hours only — holidays aren't known here">
      {state.open ? "☀️ MARKET OPEN" : "🌙 MARKET CLOSED"} · {state.open ? "closes in" : "opens in"}{" "}
      <span className="tabular">{formatCountdown(state.remainingMs)}</span>
    </span>
  );
}
