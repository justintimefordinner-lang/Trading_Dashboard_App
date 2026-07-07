"use client";

// Stocks view with a pinned Open|Closed toggle (default Open). Open shows a summary
// plus a sortable column table of holdings (qty, avg cost, value, P/L $ and %) — tap
// a header to sort, tap a row to expand into last price, cost basis, today's move,
// BB positioning, gamma walls and the ~30Δ covered-call premiums. Closed shows
// realized round-trips with the shared time filter.
import { Fragment, useState, type ReactNode } from "react";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { compactMoney } from "@/components/OptionRow";
import { ClosedStocks } from "@/components/ClosedStocks";
import { equityCost, equityPnl, equityPnlPct, equityValue, fmtMoney } from "@/lib/calc";
import type { ClosedStock, Equity } from "@/lib/types";

type Status = "open" | "closed";
type SortKey = "sym" | "qty" | "avg" | "value" | "pnl" | "pnlPct";

// Shared column template so the header and every row line up.
const COLS = "grid-cols-[1.2fr_0.6fr_0.85fr_0.9fr_0.9fr_0.6fr]";

function Detail({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{k}</span>
      <span className="tabular font-medium text-text">{v}</span>
    </div>
  );
}

// Where the price sits in its 20-day Bollinger bands: +2σ ≈ upper (extended),
// −2σ ≈ lower (pulled back).
function sigmaTone(s: number): string {
  if (s >= 2) return "text-amber-300";
  if (s <= -2) return "text-sky-300";
  return "text-text";
}

function Caret({ on, dir }: { on: boolean; dir: "asc" | "desc" }) {
  return <span className={`text-[7px] ${on ? "text-text" : "text-transparent"}`}>{dir === "asc" ? "▲" : "▼"}</span>;
}

export function StocksView({ equities, closed, initialStatus = "open", closedMode, closedMonths }: { equities: Equity[]; closed: ClosedStock[]; initialStatus?: Status; closedMode?: "all" | "ytd" | "months" | "today"; closedMonths?: number }) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggle = (sym: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(sym)) n.delete(sym);
      else n.add(sym);
      return n;
    });
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "sym" ? "asc" : "desc");
    }
  };

  const totalValue = equities.reduce((s, e) => s + equityValue(e), 0);
  const totalCost = equities.reduce((s, e) => s + equityCost(e), 0);
  const totalPnl = equities.reduce((s, e) => s + equityPnl(e), 0);
  const totalPct = totalCost > 0 ? totalPnl / totalCost : 0;

  const sortNum = (e: Equity): number => {
    switch (sortKey) {
      case "qty": return e.qty;
      case "avg": return e.avgCost;
      case "value": return equityValue(e);
      case "pnl": return equityPnl(e);
      case "pnlPct": return equityPnlPct(e);
      default: return 0;
    }
  };
  const rows = [...equities].sort((a, b) => {
    if (sortKey === "sym") {
      const d = a.symbol.localeCompare(b.symbol);
      return sortDir === "asc" ? d : -d;
    }
    const d = sortNum(a) - sortNum(b);
    return sortDir === "asc" ? d : -d;
  });

  const th = (k: SortKey, label: string, align: "start" | "end" = "end") => (
    <button
      onClick={() => toggleSort(k)}
      className={`flex items-center gap-0.5 active:opacity-70 ${align === "end" ? "justify-end" : ""} ${sortKey === k ? "text-text" : ""}`}
    >
      {label}
      <Caret on={sortKey === k} dir={sortDir} />
    </button>
  );

  return (
    <div>
      <div className="mt-4 flex gap-1 rounded-xl border border-border bg-surface p-1">
        {(
          [
            { key: "open" as const, label: `Open · ${equities.length}` },
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
            <Card className="px-1 py-1">
              <div className={`grid ${COLS} gap-1.5 border-b border-border px-2 pb-1.5 pt-1 text-[10px] uppercase tracking-wide text-muted`}>
                {th("sym", "Ticker", "start")}
                {th("qty", "Qty")}
                {th("avg", "Avg")}
                {th("value", "Value")}
                {th("pnl", "P/L$")}
                {th("pnlPct", "P/L%")}
              </div>
              <div className="divide-y divide-border/60">
                {rows.map((e) => {
                  const val = equityValue(e);
                  const pnl = equityPnl(e);
                  const pnlPct = equityPnlPct(e);
                  const isOpen = open.has(e.symbol);
                  return (
                    <Fragment key={e.symbol}>
                      <button
                        type="button"
                        onClick={() => toggle(e.symbol)}
                        aria-expanded={isOpen}
                        className={`grid ${COLS} w-full items-center gap-1.5 px-2 py-2.5 text-left text-[12px] active:bg-surface-2`}
                      >
                        <span className="flex items-center gap-1 truncate font-semibold">
                          <span className="text-[9px] text-muted">{isOpen ? "▾" : "▸"}</span>
                          {e.symbol}
                        </span>
                        <span className="tabular text-right text-muted">{e.qty.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                        <span className="tabular text-right">
                          <Amt>{`$${e.avgCost.toFixed(2)}`}</Amt>
                        </span>
                        <span className="tabular text-right">
                          <Amt>{compactMoney(val)}</Amt>
                        </span>
                        <span className={`tabular text-right ${pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          <Amt>{`${pnl >= 0 ? "+" : "−"}${compactMoney(Math.abs(pnl))}`}</Amt>
                        </span>
                        <span className={`tabular text-right ${pnlPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {pnlPct >= 0 ? "+" : ""}
                          {(pnlPct * 100).toFixed(0)}%
                        </span>
                      </button>
                      {isOpen && (
                        <div className="bg-surface-2/30 px-3 py-3 text-[12px]">
                          <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
                            <Detail k="Avg" v={<Amt>{`$${e.avgCost.toFixed(2)}`}</Amt>} />
                            <Detail k="Last" v={<Amt>{`$${e.price.toFixed(2)}`}</Amt>} />
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
                          {e.gamma && (
                            <div className="mt-2.5 text-[11px] text-muted">
                              <span className="font-semibold text-text">Gamma</span>{" "}
                              {e.gamma.net === "pos" ? "positive" : "negative"} · flip{" "}
                              {e.gamma.flip != null ? `$${e.gamma.flip}` : "—"} · wall ${e.gamma.callWall ?? "—"}/
                              {e.gamma.putWall ?? "—"}
                            </div>
                          )}
                          {e.coveredCalls && e.coveredCalls.length > 0 && (
                            <div className="mt-3">
                              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted/80">
                                Covered call · ~30Δ
                              </div>
                              <div className="grid grid-cols-[1.8rem_1fr_0.9fr_1fr_1fr_1fr] gap-x-2 gap-y-1 text-[11px]">
                                <span className="text-[9px] uppercase text-muted/70">Exp</span>
                                <span className="text-right text-[9px] uppercase text-muted/70">Strike</span>
                                <span className="text-right text-[9px] uppercase text-muted/70">BBσ</span>
                                <span className="text-right text-[9px] uppercase text-muted/70">Prem</span>
                                <span className="text-right text-[9px] uppercase text-muted/70">Prem%</span>
                                <span className="text-right text-[9px] uppercase text-muted/70">Ann%</span>
                                {e.coveredCalls.map((cc) => (
                                  <Fragment key={cc.targetDte}>
                                    <span className="font-medium text-text">{cc.dte}d</span>
                                    <span className="tabular text-right text-text">${cc.strike}</span>
                                    <span className={`tabular text-right ${cc.bbSigma != null ? sigmaTone(cc.bbSigma) : "text-muted"}`}>
                                      {cc.bbSigma != null ? `${cc.bbSigma > 0 ? "+" : ""}${cc.bbSigma.toFixed(1)}` : "—"}
                                    </span>
                                    <span className="tabular text-right text-text">
                                      <Amt>{`$${cc.mark.toFixed(2)}`}</Amt>
                                    </span>
                                    <span className="tabular text-right text-text">{cc.premPct.toFixed(1)}%</span>
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
              </div>
            </Card>
          )}
        </>
      ) : (
        <ClosedStocks source={closed} initialMode={closedMode} initialMonths={closedMonths} />
      )}
    </div>
  );
}
