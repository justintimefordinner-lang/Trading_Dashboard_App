"use client";

import { Fragment } from "react";
import Link from "next/link";
import { Amt } from "@/components/privacy";
import { fmtMoney } from "@/lib/calc";
import { usePersistentSet } from "@/lib/view-state";

export interface HoldingBreakout {
  key: string;
  label: string;
  value: number;
  route: string;
}

export interface HoldingRow {
  symbol: string;
  value: number;
  pct: number; // 0..1, share of the stock sleeve
  breakout: HoldingBreakout[];
}

// Strategy accent dots — match the colors used elsewhere (P&L, options sides).
const ACCENT: Record<string, string> = {
  stock: "bg-cyan-400",
  csp: "bg-sky-400",
  leap: "bg-violet-400",
  spread: "bg-amber-400",
};

// Concentration coloring: >10% orange (heavy), <5% green (light), 5–10% neutral.
function tone(pct: number): { row: string; text: string } {
  if (pct > 0.1) return { row: "bg-orange-500/10", text: "text-orange-300" };
  if (pct < 0.05) return { row: "bg-emerald-500/10", text: "text-emerald-300" };
  return { row: "", text: "text-text" };
}

export function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  const { has, toggle } = usePersistentSet("holdings");

  if (rows.length === 0) {
    return <div className="rounded-xl border border-border px-4 py-5 text-center text-[12px] text-muted">No stock holdings.</div>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
            <th className="px-3 py-2 text-left font-medium">Ticker</th>
            <th className="px-3 py-2 text-right font-medium">Capital</th>
            <th className="px-3 py-2 text-right font-medium">Portfolio %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const t = tone(r.pct);
            const isOpen = has(r.symbol);
            const expandable = r.breakout.length > 0;
            return (
              <Fragment key={r.symbol}>
                <tr
                  className={`${t.row} ${expandable ? "cursor-pointer active:bg-surface-2" : ""}`}
                  onClick={expandable ? () => toggle(r.symbol) : undefined}
                >
                  <td className={`px-3 py-2 font-semibold ${t.text}`}>
                    <span className="inline-flex items-center gap-1.5">
                      {expandable && <span className="text-[9px] text-muted">{isOpen ? "▾" : "▸"}</span>}
                      {r.symbol}
                    </span>
                  </td>
                  <td className="tabular px-3 py-2 text-right">
                    <Amt>{fmtMoney(r.value)}</Amt>
                  </td>
                  <td className={`tabular px-3 py-2 text-right font-medium ${t.text}`}>{(r.pct * 100).toFixed(1)}%</td>
                </tr>
                {isOpen && expandable && (
                  <tr className="bg-surface-2/30">
                    <td colSpan={3} className="px-2 py-1.5">
                      <div className="space-y-0.5">
                        {r.breakout.map((b) => (
                          <Link
                            key={b.key}
                            href={`${b.route}?symbol=${r.symbol}`}
                            className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[11px] active:bg-surface-2"
                          >
                            <span className="flex items-center gap-2">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACCENT[b.key] ?? "bg-slate-400"}`} />
                              <span className="font-medium">{b.label}</span>
                            </span>
                            <span className="flex items-center gap-1.5 text-muted">
                              <span className="tabular">
                                <Amt>{fmtMoney(b.value)}</Amt>
                              </span>
                              <span>›</span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
