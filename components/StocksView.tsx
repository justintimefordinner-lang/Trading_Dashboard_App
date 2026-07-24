"use client";

// Stocks view with a pinned Open|Closed toggle (default Open). Open shows a summary
// plus a sortable column table of holdings (qty, avg cost, value, P/L $ and %) — tap
// a header to sort, tap a row to expand into last price, cost basis, today's move,
// BB positioning, gamma walls and the ~30Δ covered-call premiums. Closed shows
// realized round-trips with the shared time filter.
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { usePersistentSet, usePersistentState } from "@/lib/view-state";
import { useRouter } from "next/navigation";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { DataRefresh } from "@/components/DataRefresh";
import { compactMoney } from "@/components/OptionRow";
import { Sparkline } from "@/components/charts";
import { ClosedStocks } from "@/components/ClosedStocks";
import { equityCost, equityPnl, equityPnlPct, equityValue, fmtMoney } from "@/lib/calc";
import type { ClosedStock, Equity, OptionPosition } from "@/lib/types";

type Status = "open" | "closed";
type SortKey = "sym" | "qty" | "cc" | "avg" | "value" | "pnl" | "pnlPct";

// Shared column template so the header and every row line up.
const COLS = "grid-cols-[1.1fr_0.5fr_0.5fr_0.82fr_0.85fr_0.85fr_0.55fr]";

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

// yyyy-mm-dd → "Aug 21" (built from parts to avoid a UTC-parse day shift).
function fmtExp(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Caret({ on, dir }: { on: boolean; dir: "asc" | "desc" }) {
  return <span className={`text-[7px] ${on ? "text-text" : "text-transparent"}`}>{dir === "asc" ? "▲" : "▼"}</span>;
}

export function StocksView({ equities, closed, initialStatus = "open", closedMode, closedMonths, laddersNextAt, coveredCalls = [] }: { equities: Equity[]; closed: ClosedStock[]; initialStatus?: Status; closedMode?: "all" | "ytd" | "months" | "today"; closedMonths?: number; laddersNextAt?: string; coveredCalls?: OptionPosition[] }) {
  const [status, setStatus] = usePersistentState<Status>("stocks-status", initialStatus);
  const { has, toggle } = usePersistentSet("stocks-open");
  const [sortKey, setSortKey] = usePersistentState<SortKey>("stocks-sortkey", "value");
  const [sortDir, setSortDir] = usePersistentState<"asc" | "desc">("stocks-sortdir", "desc");
  const router = useRouter();
  const [pendingCC, setPendingCC] = useState<string | null>(null); // symbol awaiting "View CC?" confirm

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

  // Open covered calls written against these shares, grouped by underlying — both the
  // CC column and the expanded "Covered" line read from this.
  const ccBySym = useMemo(() => {
    const m = new Map<string, { contracts: number; positions: OptionPosition[] }>();
    for (const o of coveredCalls) {
      const k = o.symbol.toUpperCase();
      const cur = m.get(k) ?? { contracts: 0, positions: [] as OptionPosition[] };
      cur.contracts += o.qty;
      cur.positions.push(o);
      m.set(k, cur);
    }
    return m;
  }, [coveredCalls]);

  const sortNum = (e: Equity): number => {
    switch (sortKey) {
      case "qty": return e.qty;
      case "cc": return ccBySym.get(e.symbol.toUpperCase())?.contracts ?? 0;
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

  const th = (k: SortKey, label: string, align: "start" | "center" | "end" = "center") => (
    <button
      onClick={() => toggleSort(k)}
      className={`flex items-center gap-0.5 active:opacity-70 ${align === "end" ? "justify-end" : align === "center" ? "justify-center" : ""} ${sortKey === k ? "text-text" : ""}`}
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

          <SectionTitle>
            Holdings
            <DataRefresh nextAt={laddersNextAt} />
          </SectionTitle>
          {rows.length === 0 ? (
            <Card className="px-4 py-5 text-center text-sm text-muted">No stock holdings in this account.</Card>
          ) : (
            <Card className="px-1 py-1">
              <div className={`grid ${COLS} gap-1.5 border-b border-border px-2 pb-1.5 pt-1 text-[10px] uppercase tracking-wide text-muted`}>
                {th("sym", "Ticker", "start")}
                {th("qty", "Qty")}
                {th("cc", "CC")}
                {th("avg", "Avg/Last")}
                {th("value", "Value")}
                {th("pnl", "P/L$")}
                {th("pnlPct", "P/L%")}
              </div>
              <div className="divide-y divide-border/60">
                {rows.map((e) => {
                  const val = equityValue(e);
                  const pnl = equityPnl(e);
                  const pnlPct = equityPnlPct(e);
                  const ccInfo = ccBySym.get(e.symbol.toUpperCase());
                  const ccN = ccInfo?.contracts ?? 0;
                  const ccFully = ccN > 0 && ccN * 100 >= e.qty;
                  const isOpen = has(e.symbol);
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
                        <span className="tabular text-center text-muted">{e.qty.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                        <span className="tabular text-center">
                          {ccN > 0 ? (
                            <span
                              role="link"
                              title={`View the ${e.symbol} covered call${ccN > 1 ? "s" : ""}${ccFully ? "" : ` · ${ccN * 100} of ${e.qty} sh covered`}`}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setPendingCC(e.symbol);
                              }}
                              className={`cursor-pointer underline decoration-dotted underline-offset-2 ${ccFully ? "text-emerald-300" : "text-amber-300"}`}
                            >
                              {ccN}
                            </span>
                          ) : (
                            <span className="text-muted/50">No</span>
                          )}
                        </span>
                        <span className="tabular flex flex-col items-center gap-0.5 leading-none">
                          <Amt>{`$${e.avgCost.toFixed(2)}`}</Amt>
                          <span className="text-[9px] font-normal text-muted">
                            <Amt>{`$${e.price.toFixed(2)}`}</Amt>
                          </span>
                        </span>
                        <span className="tabular text-center">
                          <Amt>{compactMoney(val)}</Amt>
                        </span>
                        <span className={`tabular text-center ${pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          <Amt>{`${pnl >= 0 ? "+" : "−"}${compactMoney(Math.abs(pnl))}`}</Amt>
                        </span>
                        <span className={`tabular text-center ${pnlPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
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
                          {e.priceHistory && e.priceHistory.length >= 2 && (() => {
                            const ph = e.priceHistory;
                            const chg = ph[ph.length - 1] - ph[0];
                            const pct = ph[0] ? chg / ph[0] : 0;
                            return (
                              <div className="mt-2.5">
                                <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
                                  <span>Last {ph.length} trading days</span>
                                  <span className={chg >= 0 ? "text-emerald-300" : "text-rose-300"}>
                                    {chg >= 0 ? "+" : "−"}${Math.abs(chg).toFixed(2)} · {chg >= 0 ? "+" : ""}
                                    {(pct * 100).toFixed(1)}%
                                  </span>
                                </div>
                                <div className="h-12 overflow-hidden rounded-md bg-surface/50 px-1 ring-1 ring-inset ring-border">
                                  <Sparkline
                                    data={ph.map((v, i) => ({ label: `d${i + 1}`, value: v }))}
                                    height={48}
                                    positive={chg >= 0}
                                  />
                                </div>
                              </div>
                            );
                          })()}
                          {e.gamma && (
                            <div className="mt-2.5 text-[11px] text-muted">
                              <span className="font-semibold text-text">Gamma</span>{" "}
                              {e.gamma.net === "pos" ? "positive" : "negative"} · flip{" "}
                              {e.gamma.flip != null ? `$${e.gamma.flip}` : "—"} · wall ${e.gamma.callWall ?? "—"}/
                              {e.gamma.putWall ?? "—"}
                            </div>
                          )}
                          {ccInfo && ccInfo.contracts > 0 && (
                            <div className="mt-2.5 text-[11px] text-muted">
                              <span className="font-semibold text-text">Covered</span>{" "}
                              <span className={ccFully ? "text-emerald-300" : "text-amber-300"}>
                                {ccInfo.contracts * 100}/{e.qty} sh
                              </span>
                              {" · "}
                              {ccInfo.contracts} {ccInfo.contracts === 1 ? "call" : "calls"}
                              {" · "}
                              {ccInfo.positions
                                .slice()
                                .sort((a, b) => a.expiration.localeCompare(b.expiration))
                                .map((p) => `$${p.strike} ${fmtExp(p.expiration)}`)
                                .join(", ")}
                            </div>
                          )}
                          {e.coveredCalls && e.coveredCalls.length > 0 && (
                            <div className="mt-3">
                              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted/80">
                                Covered-call ideas · ~30Δ
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
                                    <span
                                      className={`tabular text-right ${cc.strike > e.avgCost ? "font-semibold text-emerald-300" : "text-text"}`}
                                      title={cc.strike > e.avgCost ? "Above your average cost — assignment locks in a gain" : undefined}
                                    >
                                      ${cc.strike}
                                    </span>
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
                                Premium/share to sell one ~30Δ call near 1/2/3/4 weeks · Ann% = premium annualized
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

      {pendingCC && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="View covered call"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-8"
          onClick={() => setPendingCC(null)}
        >
          <div
            className="w-full max-w-[240px] rounded-2xl border border-border bg-surface p-5 text-center shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <p className="text-sm font-semibold text-text">View {pendingCC} CC?</p>
            <p className="mt-1 text-[11px] text-muted">Opens the covered-call page for {pendingCC}.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPendingCC(null)}
                className="flex-1 rounded-lg bg-surface-2 py-2 text-sm font-medium text-muted active:opacity-70"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  const s = pendingCC;
                  setPendingCC(null);
                  router.push(`/options/covered?symbol=${encodeURIComponent(s)}`);
                }}
                className="flex-1 rounded-lg bg-emerald-500/20 py-2 text-sm font-semibold text-emerald-200 active:opacity-70"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
