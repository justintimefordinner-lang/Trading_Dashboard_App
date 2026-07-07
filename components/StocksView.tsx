"use client";

// Stocks view with a pinned Open|Closed toggle (default Open). Open shows live
// holdings with a summary and a per-name list; each row taps to expand into avg
// cost, cost basis, unrealized P/L and today's move. Closed shows realized stock
// round-trips with the shared time filter and sortable headers.
import { Fragment, useState, type ReactNode } from "react";
import { Card, SectionTitle, Stat, Pill } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { ClosedStocks } from "@/components/ClosedStocks";
import { equityCost, equityPnl, equityPnlPct, equityValue, fmtMoney } from "@/lib/calc";
import type { ClosedStock, Equity } from "@/lib/types";

type Status = "open" | "closed";

function Detail({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{k}</span>
      <span className="tabular font-medium text-text">{v}</span>
    </div>
  );
}

export function StocksView({ equities, closed, initialStatus = "open", closedMode, closedMonths }: { equities: Equity[]; closed: ClosedStock[]; initialStatus?: Status; closedMode?: "all" | "ytd" | "months" | "today"; closedMonths?: number }) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (sym: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(sym)) n.delete(sym);
      else n.add(sym);
      return n;
    });

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
                const cost = equityCost(e);
                const pnl = equityPnl(e);
                const pnlPct = equityPnlPct(e);
                const share = totalValue > 0 ? Math.round((val / totalValue) * 100) : 0;
                const isOpen = open.has(e.symbol);
                return (
                  <Fragment key={e.symbol}>
                    <button
                      type="button"
                      onClick={() => toggle(e.symbol)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2/40"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[11px] font-bold">
                        {e.symbol.slice(0, 4)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <span className="text-[9px] text-muted">{isOpen ? "▾" : "▸"}</span>
                          {e.symbol}
                        </div>
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
                    </button>
                    {isOpen && (
                      <div className="bg-surface-2/30 px-4 py-3 text-[12px]">
                        <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
                          <Detail k="Avg cost" v={<Amt>{`$${e.avgCost.toFixed(2)}`}</Amt>} />
                          <Detail k="Last" v={<Amt>{`$${e.price.toFixed(2)}`}</Amt>} />
                          <Detail k="Cost basis" v={<Amt>{fmtMoney(cost)}</Amt>} />
                          <Detail k="Mkt value" v={<Amt>{fmtMoney(val)}</Amt>} />
                          <Detail
                            k="Unrealized"
                            v={
                              <span className={pnl >= 0 ? "text-emerald-300" : "text-rose-300"}>
                                <Amt>{`${pnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(pnl))}`}</Amt> ({pnlPct >= 0 ? "+" : ""}
                                {(pnlPct * 100).toFixed(1)}%)
                              </span>
                            }
                          />
                          {e.dayChange != null && (
                            <Detail
                              k="Day change"
                              v={
                                <span className={e.dayChange >= 0 ? "text-emerald-300" : "text-rose-300"}>
                                  <Amt>{`${e.dayChange >= 0 ? "+" : "−"}$${Math.abs(e.dayChange).toFixed(2)}`}</Amt>/sh
                                </span>
                              }
                            />
                          )}
                        </div>
                        {e.coveredCalls && e.coveredCalls.length > 0 && (
                          <div className="mt-3">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted/80">
                              Covered call · ~30Δ
                            </div>
                            <div className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-x-3 gap-y-1 text-[11px]">
                              <span className="text-[9px] uppercase text-muted/70">Exp</span>
                              <span className="text-right text-[9px] uppercase text-muted/70">Strike</span>
                              <span className="text-right text-[9px] uppercase text-muted/70">Prem</span>
                              <span className="text-right text-[9px] uppercase text-muted/70">Ann%</span>
                              {e.coveredCalls.map((cc) => (
                                <Fragment key={cc.targetDte}>
                                  <span className="font-medium text-text">{cc.dte}d</span>
                                  <span className="tabular text-right text-text">${cc.strike}</span>
                                  <span className="tabular text-right text-text">
                                    <Amt>{`$${cc.mark.toFixed(2)}`}</Amt>
                                  </span>
                                  <span className="tabular text-right text-emerald-300">
                                    {cc.annPct != null ? `${Math.round(cc.annPct)}%` : "—"}
                                  </span>
                                </Fragment>
                              ))}
                            </div>
                            <div className="mt-1 text-[9px] leading-snug text-muted/60">
                              Premium/share to sell one ~30Δ call near 14/21/30 days · Ann% = premium annualized
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Fragment>
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
