"use client";

// Stocks view with a pinned Open|Closed toggle (default Open). Open shows live
// holdings (value, unrealized P/L, per-name list); Closed shows realized stock
// round-trips with the shared time filter and sortable headers.
import { useState } from "react";
import { Card, SectionTitle, Stat, Pill } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { ClosedStocks } from "@/components/ClosedStocks";
import { equityCost, equityPnl, equityPnlPct, equityValue, fmtMoney } from "@/lib/calc";
import type { ClosedStock, Equity } from "@/lib/types";

type Status = "open" | "closed";

export function StocksView({ equities, closed, initialStatus = "open", closedMode, closedMonths }: { equities: Equity[]; closed: ClosedStock[]; initialStatus?: Status; closedMode?: "all" | "ytd" | "months" | "today"; closedMonths?: number }) {
  const [status, setStatus] = useState<Status>(initialStatus);

  const rows = [...equities].sort((a, b) => equityValue(b) - equityValue(a));
  const totalValue = rows.reduce((s, e) => s + equityValue(e), 0);
  const totalCost = rows.reduce((s, e) => s + equityCost(e), 0);
  const totalPnl = rows.reduce((s, e) => s + equityPnl(e), 0);
  const totalPct = totalCost > 0 ? totalPnl / totalCost : 0;

  return (
    <div>
      <div className="mt-4 flex gap-1 rounded-xl border border-border bg-surface p-1">
        {(
          [
            { key: "open" as const, label: `Open · ${rows.length}` },
            { key: "closed" as const, label: `Closed · ${closed.length}` },
          ]
        ).map((s) => (
          <button
            key={s.key}
            onClick={() => setStatus(s.key)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
              status === s.key ? "bg-surface-2 text-text" : "text-muted active:bg-surface-2/50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {status === "open" ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Market value" value={<Amt>{fmtMoney(totalValue)}</Amt>} sub={<><Amt>{fmtMoney(totalCost)}</Amt> cost</>} />
            <Stat
              label="Unrealized P/L"
              value={<Amt>{`${totalPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(totalPnl))}`}</Amt>}
              tone={totalPnl >= 0 ? "pos" : "neg"}
              sub={`${totalPct >= 0 ? "+" : ""}${(totalPct * 100).toFixed(1)}%`}
            />
          </div>

          <SectionTitle>Holdings</SectionTitle>
          {rows.length === 0 ? (
            <Card className="px-4 py-5 text-center text-sm text-muted">No stock holdings in this account.</Card>
          ) : (
            <Card className="divide-y divide-border">
              {rows.map((e) => {
                const val = equityValue(e);
                const pnlPct = equityPnlPct(e);
                const share = totalValue > 0 ? Math.round((val / totalValue) * 100) : 0;
                return (
                  <div key={e.symbol} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[11px] font-bold">
                      {e.symbol.slice(0, 4)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{e.symbol}</div>
                      <div className="truncate text-[11px] text-muted">
                        {e.name} · {e.qty.toLocaleString("en-US", { maximumFractionDigits: 4 })} sh @ <Amt>{`$${e.price.toFixed(2)}`}</Amt>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tabular text-sm font-medium">
                        <Amt>{fmtMoney(val)}</Amt>
                      </div>
                      <div className="mt-0.5 flex items-center justify-end gap-1.5">
                        <span className="text-[10px] text-muted">{share}%</span>
                        <Pill className={pnlPct >= 0 ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20" : "bg-rose-500/10 text-rose-300 ring-rose-500/20"}>
                          {pnlPct >= 0 ? "+" : ""}
                          {(pnlPct * 100).toFixed(0)}%
                        </Pill>
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      ) : (
        <ClosedStocks source={closed} initialMode={closedMode} initialMonths={closedMonths} />
      )}
    </div>
  );
}
