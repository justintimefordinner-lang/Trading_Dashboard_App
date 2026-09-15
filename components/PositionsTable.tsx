"use client";

// Open Positions: one wide, sortable, groupable table of every open position —
// options AND stocks — across every account, with the columns the phone rows
// keep behind a tap (Δ, IV, theta, return figures) laid out in view.
//
// Started from jttyeung's fork (components/desktop/PositionsTable.tsx on her
// staging branch) and reshaped for this app: stock rows alongside the options,
// grouped by ticker by default with a totals row per group, Δ/IV columns, the
// app's own palette, and none of the columns that read from her daemons.
import { Fragment, useMemo } from "react";
import { usePersistentState } from "@/lib/view-state";
import { Amt } from "@/components/privacy";
import type { Equity, OptionKind, OptionPosition } from "@/lib/types";
import {
  daysBetween,
  daysToExpiry,
  equityPnl,
  equityPnlPct,
  equityValue,
  fmtMoney,
  fmtPct,
  optionBasis,
  optionNetValue,
  optionPnl,
  optionPnlPct,
  positionAnnualizedReturn,
  positionRemainingAnnualizedReturn,
  positionReturnOnCapital,
  spotPercentChange,
} from "@/lib/calc";
import { positionDailyTheta } from "@/lib/theta";

export type SourcedOption = OptionPosition & { account: string };
export type SourcedEquity = Equity & { account: string };

type Kind = OptionKind | "stock";

const CODE: Record<Kind, string> = {
  csp: "CSP",
  "covered-call": "CC",
  "leap-call": "LEAP",
  "leap-put-hedge": "HEDGE",
  "put-spread": "P-SPR",
  "call-spread": "C-SPR",
  other: "OTHER",
  stock: "STOCK",
};

// Same hue per strategy as the P&L page's ACCENT map, so a chip here means the
// same thing it means there.
const CHIP: Record<Kind, string> = {
  csp: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  "covered-call": "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  "leap-call": "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  "leap-put-hedge": "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  "put-spread": "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  "call-spread": "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  other: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  stock: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
};

const KIND_ORDER: Kind[] = ["stock", "csp", "covered-call", "leap-call", "leap-put-hedge", "put-spread", "call-spread", "other"];

type GroupBy = "ticker" | "type" | "dte" | "account" | "none";
type SortKey =
  | "ticker" | "type" | "qty" | "strike" | "dte" | "dit" | "spot" | "spotPct" | "delta" | "iv"
  | "theta" | "ror" | "apy" | "unrealized" | "remApy" | "todayPl" | "marketValue" | "account";

interface Row {
  id: string;
  symbol: string;
  kind: Kind;
  account: string;
  qty: number; // signed: short options negative
  strike: number | null;
  expiration: string | null;
  dte: number | null;
  dit: number | null;
  spot: number | null;
  spotPct: number | null;
  delta: number | null;
  iv: number | null;
  theta: number;
  ror: number | null;
  apy: number | null;
  unrealized: number;
  unrealizedPct: number;
  basis: number; // |cost basis|, for weighting group percentages
  remainingDollar: number | null; // buy-to-close cost (short) or today's mark (long)
  remainingLabel: "left" | "value" | null;
  remainingAnnualized: number | null;
  todayPl: number | null;
  todayPlPct: number | null;
  marketValue: number;
}

function optionRow(o: SourcedOption): Row {
  const marketValue = optionNetValue(o); // long +, short − (the buy-back liability)
  const todayPl = o.dayValueChange ?? null;
  const yesterday = todayPl != null ? marketValue - todayPl : null;
  return {
    id: `o:${o.account}:${o.id}`,
    symbol: o.symbol.toUpperCase(),
    kind: o.kind,
    account: o.account,
    qty: o.side === "short" ? -o.qty : o.qty,
    strike: o.strike,
    expiration: o.expiration,
    dte: daysToExpiry(o.expiration),
    dit: o.openedAt ? daysBetween(o.openedAt) : null,
    spot: o.underlyingPrice ?? o.underlyingLive ?? o.underlyingClose ?? null,
    spotPct: spotPercentChange(o),
    delta: o.delta,
    iv: o.iv,
    theta: positionDailyTheta(o),
    ror: positionReturnOnCapital(o),
    apy: positionAnnualizedReturn(o),
    unrealized: optionPnl(o),
    unrealizedPct: optionPnlPct(o),
    basis: Math.abs(optionBasis(o)),
    remainingDollar: Math.abs(marketValue),
    remainingLabel: o.side === "long" ? "value" : "left",
    remainingAnnualized: positionRemainingAnnualizedReturn(o),
    todayPl,
    todayPlPct: todayPl != null && yesterday ? todayPl / Math.abs(yesterday) : null,
    marketValue,
  };
}

function stockRow(e: SourcedEquity): Row {
  const prior = e.dayChange != null ? e.price - e.dayChange : null;
  const spotPct = e.dayChange != null && prior ? e.dayChange / prior : null;
  return {
    id: `s:${e.account}:${e.symbol}`,
    symbol: e.symbol.toUpperCase(),
    kind: "stock",
    account: e.account,
    qty: e.qty,
    strike: null,
    expiration: null,
    dte: null,
    dit: null,
    spot: e.price,
    spotPct,
    delta: null,
    iv: null,
    theta: 0,
    ror: null,
    apy: null,
    unrealized: equityPnl(e),
    unrealizedPct: equityPnlPct(e),
    basis: Math.abs(e.avgCost * e.qty),
    remainingDollar: null,
    remainingLabel: null,
    remainingAnnualized: null,
    todayPl: e.dayChange != null ? e.dayChange * e.qty : null,
    todayPlPct: spotPct,
    marketValue: equityValue(e),
  };
}

function sortValue(r: Row, k: SortKey): number | string {
  switch (k) {
    case "ticker": return r.symbol;
    case "type": return KIND_ORDER.indexOf(r.kind);
    case "qty": return r.qty;
    case "strike": return r.strike ?? -Infinity;
    case "dte": return r.dte ?? Infinity;
    case "dit": return r.dit ?? -Infinity;
    case "spot": return r.spot ?? -Infinity;
    case "spotPct": return r.spotPct ?? -Infinity;
    case "delta": return r.delta ?? -Infinity;
    case "iv": return r.iv ?? -Infinity;
    case "theta": return r.theta;
    case "ror": return r.ror ?? -Infinity;
    case "apy": return r.apy ?? -Infinity;
    case "unrealized": return r.unrealized;
    case "remApy": return r.remainingAnnualized ?? -Infinity;
    case "todayPl": return r.todayPl ?? -Infinity;
    case "marketValue": return r.marketValue;
    case "account": return r.account;
  }
}

// 0–7 / 8–21 mirror the app's own DTE-management framing (the 21-DTE window).
function dteBucket(dte: number | null): { key: string; label: string; order: number } {
  if (dte == null) return { key: "stock", label: "No expiry", order: 5 };
  if (dte <= 7) return { key: "0-7", label: "0–7 DTE", order: 0 };
  if (dte <= 21) return { key: "8-21", label: "8–21 DTE", order: 1 };
  if (dte <= 30) return { key: "22-30", label: "22–30 DTE", order: 2 };
  if (dte <= 45) return { key: "31-45", label: "31–45 DTE", order: 3 };
  return { key: "45+", label: "45+ DTE", order: 4 };
}

const dteChip = (dte: number) =>
  dte <= 7 ? "bg-rose-500/15 text-rose-300" : dte <= 21 ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300";
const tone = (n: number | null) => (n == null ? "text-muted" : n >= 0 ? "text-emerald-400" : "text-rose-400");
const money = (n: number, sign = false) => <Amt>{fmtMoney(n, { sign })}</Amt>;

function sumRows(rows: Row[]) {
  const unrealized = rows.reduce((s, r) => s + r.unrealized, 0);
  const basis = rows.reduce((s, r) => s + r.basis, 0);
  const todayPl = rows.reduce((s, r) => s + (r.todayPl ?? 0), 0);
  const todayBase = rows.reduce((s, r) => s + Math.abs(r.marketValue - (r.todayPl ?? 0)), 0);
  return {
    count: rows.length,
    theta: rows.reduce((s, r) => s + r.theta, 0),
    unrealized,
    unrealizedPct: basis !== 0 ? unrealized / basis : 0,
    todayPl,
    todayPlPct: todayBase !== 0 ? todayPl / todayBase : 0,
    hasTodayPl: rows.some((r) => r.todayPl != null),
    marketValue: rows.reduce((s, r) => s + r.marketValue, 0),
  };
}
type Summary = ReturnType<typeof sumRows>;

// unrealizedPct for a short premium position is also "% of the credit already
// captured", so the bar doubles as a capture-progress bar on CSP/CC rows.
function PctBar({ pct, label }: { pct: number; label: React.ReactNode }) {
  const pos = pct >= 0;
  const width = Math.min(100, Math.abs(pct) * 100);
  return (
    <div className={`relative h-[18px] w-24 overflow-hidden rounded-full ${pos ? "bg-emerald-500/15" : "bg-rose-500/15"}`}>
      <div className={`h-full rounded-full ${pos ? "bg-emerald-400" : "bg-rose-400"}`} style={{ width: `${width}%` }} />
      <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap text-[10px] font-semibold text-[#0a0e14]">
        {label}
      </span>
    </div>
  );
}

const COLUMNS: { key: SortKey; label: string; right?: boolean; title?: string }[] = [
  { key: "ticker", label: "Ticker" },
  { key: "type", label: "Type" },
  { key: "qty", label: "Qty", right: true, title: "Contracts (short negative) or shares" },
  { key: "strike", label: "Strike", right: true },
  { key: "dte", label: "DTE", right: true, title: "Days to expiry — hover for the date" },
  { key: "dit", label: "DIT", right: true, title: "Days in trade" },
  { key: "spot", label: "Spot", right: true, title: "Underlying price" },
  { key: "spotPct", label: "Chg", right: true, title: "Underlying move today" },
  { key: "delta", label: "Δ", right: true },
  { key: "iv", label: "IV", right: true },
  { key: "theta", label: "Θ/day", right: true, title: "Daily theta, dollars" },
  { key: "ror", label: "RoR", right: true, title: "Credit ÷ collateral (CSP / covered call)" },
  { key: "apy", label: "APY", right: true, title: "RoR annualized over the original term" },
  { key: "unrealized", label: "Unrealized", right: true, title: "Bar = % of premium captured on short positions" },
  { key: "remApy", label: "APY left", right: true, title: "Return still on the table, annualized over remaining DTE" },
  { key: "todayPl", label: "Today", right: true },
  { key: "marketValue", label: "Value", right: true, title: "Market value (short options negative: the buy-back cost)" },
  { key: "account", label: "Account" },
];

export function PositionsTable({
  options,
  equities,
  multiAccount,
}: {
  options: SourcedOption[];
  equities: SourcedEquity[];
  multiAccount: boolean;
}) {
  const [groupBy, setGroupBy] = usePersistentState<GroupBy>("positions-group", "ticker");
  const [sortKey, setSortKey] = usePersistentState<SortKey>("positions-sort", "dte");
  const [sortDir, setSortDir] = usePersistentState<1 | -1>("positions-dir", 1);
  const [collapsed, setCollapsed] = usePersistentState<string[]>("positions-collapsed", []);

  const rows = useMemo(() => [...options.map(optionRow), ...equities.map(stockRow)], [options, equities]);
  const columns = multiAccount ? COLUMNS : COLUMNS.filter((c) => c.key !== "account");

  const groups = useMemo(() => {
    type Group = { key: string; label: string; order: number; rows: Row[] };
    const map = new Map<string, Group>();
    for (const r of rows) {
      let g: { key: string; label: string; order: number };
      if (groupBy === "none") g = { key: "all", label: "", order: 0 };
      else if (groupBy === "type") g = { key: r.kind, label: CODE[r.kind], order: KIND_ORDER.indexOf(r.kind) };
      else if (groupBy === "dte") g = dteBucket(r.dte);
      else if (groupBy === "account") g = { key: r.account, label: r.account, order: 0 };
      else g = { key: r.symbol, label: r.symbol, order: 0 };
      const cur = map.get(g.key) ?? { ...g, rows: [] };
      cur.rows.push(r);
      map.set(g.key, cur);
    }
    const list = [...map.values()];
    list.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.label.localeCompare(b.label)));
    for (const g of list) {
      g.rows.sort((a, b) => {
        const av = sortValue(a, sortKey);
        const bv = sortValue(b, sortKey);
        const cmp = typeof av === "string" ? av.localeCompare(String(bv)) : av - (bv as number);
        return cmp * sortDir || a.symbol.localeCompare(b.symbol);
      });
    }
    return list;
  }, [rows, groupBy, sortKey, sortDir]);

  const total = useMemo(() => sumRows(rows), [rows]);
  const collapsedSet = new Set(collapsed);
  const allCollapsed = groupBy !== "none" && groups.length > 0 && groups.every((g) => collapsedSet.has(g.key));

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(1);
    }
  };
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const summaryCells = (s: Summary): Partial<Record<SortKey, React.ReactNode>> => ({
    theta: <span className={`font-semibold ${tone(s.theta)}`}>{money(s.theta, true)}</span>,
    unrealized: (
      <div className="flex justify-end">
        <PctBar pct={s.unrealizedPct} label={money(s.unrealized, true)} />
      </div>
    ),
    todayPl: s.hasTodayPl ? (
      <span className={`font-semibold ${tone(s.todayPl)}`}>
        {money(s.todayPl, true)} <span className="text-[10px] opacity-80">({fmtPct(s.todayPlPct)})</span>
      </span>
    ) : (
      <span className="text-muted">—</span>
    ),
    marketValue: <span className="font-semibold">{money(s.marketValue, true)}</span>,
  });

  const SummaryRow = ({ label, sum, className, pad }: { label: React.ReactNode; sum: Summary; className: string; pad: string }) => {
    const cells = summaryCells(sum);
    return (
      <tr className={className}>
        {columns.map((c) => {
          if (c.key === "type") return null;
          if (c.key === "ticker")
            return (
              <td key={c.key} colSpan={2} className={pad}>
                {label}
              </td>
            );
          return (
            <td key={c.key} className={`${pad} tabular whitespace-nowrap text-right`}>
              {cells[c.key] ?? null}
            </td>
          );
        })}
      </tr>
    );
  };

  const cell = "px-2 py-1.5 tabular whitespace-nowrap";

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="text-sm font-semibold">Open positions</span>
        <span className="tabular rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{rows.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Group</span>
          <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-[11px] font-medium">
            {([
              ["ticker", "Ticker"],
              ["type", "Type"],
              ["dte", "DTE"],
              ...(multiAccount ? ([["account", "Account"]] as [GroupBy, string][]) : []),
              ["none", "None"],
            ] as [GroupBy, string][]).map(([g, label]) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`rounded-md px-2 py-0.5 transition-colors ${groupBy === g ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {groupBy !== "none" && (
            <button
              onClick={() => setCollapsed(allCollapsed ? [] : groups.map((g) => g.key))}
              className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted hover:text-text"
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
        </div>
      </div>

      {/* Table — wider than the canvas at every column, so it scrolls sideways
          inside this card while the page itself never does. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1060px] border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
              {columns.map((c) => (
                <th key={c.key} className={`whitespace-nowrap px-2 py-2 font-medium ${c.right ? "text-right" : "text-left"}`} title={c.title}>
                  <button
                    onClick={() => toggleSort(c.key)}
                    className={`inline-flex items-center gap-0.5 hover:text-text ${c.right ? "w-full justify-end" : ""} ${sortKey === c.key ? "text-text" : ""}`}
                  >
                    {c.label}
                    <span className="text-[8px]">{sortKey === c.key ? (sortDir === 1 ? "▲" : "▼") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isCollapsed = groupBy !== "none" && collapsedSet.has(g.key);
              return (
                <Fragment key={g.key}>
                  {groupBy !== "none" && (
                    <SummaryRow
                      className="border-b border-border bg-surface-2/60"
                      pad="px-2 py-1.5"
                      sum={sumRows(g.rows)}
                      label={
                        <button onClick={() => toggleGroup(g.key)} className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold" data-ticker={groupBy === "ticker" ? g.label : undefined}>
                          <span className={`inline-block text-muted transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>▾</span>
                          {g.label} <span className="font-normal text-muted">({g.rows.length})</span>
                        </button>
                      }
                    />
                  )}
                  {!isCollapsed &&
                    g.rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-surface-2/40">
                        <td className={`${cell} font-semibold`} data-ticker={r.symbol}>{r.symbol}</td>
                        <td className={cell}>
                          <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold ring-1 ring-inset ${CHIP[r.kind]}`}>{CODE[r.kind]}</span>
                        </td>
                        <td className={`${cell} text-right ${r.qty < 0 ? "text-rose-300" : ""}`}>{r.qty}</td>
                        <td className={`${cell} text-right`}>{r.strike != null ? fmtMoney(r.strike) : "—"}</td>
                        <td className={`${cell} text-right`}>
                          {r.dte != null ? (
                            <span className={`rounded px-1.5 py-0.5 font-semibold ${dteChip(r.dte)}`} title={r.expiration ?? undefined}>{r.dte}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className={`${cell} text-right text-muted`}>{r.dit ?? "—"}</td>
                        <td className={`${cell} text-right`}>{r.spot != null ? fmtMoney(r.spot, { cents: true }) : "—"}</td>
                        <td className={`${cell} text-right ${tone(r.spotPct)}`}>{r.spotPct != null ? fmtPct(r.spotPct) : "—"}</td>
                        <td className={`${cell} text-right`}>{r.delta != null ? r.delta.toFixed(2) : "—"}</td>
                        <td className={`${cell} text-right`}>{r.iv != null ? `${Math.round(r.iv * 100)}%` : "—"}</td>
                        <td className={`${cell} text-right ${r.kind === "stock" ? "text-muted" : tone(r.theta)}`}>{r.kind === "stock" ? "—" : money(r.theta, true)}</td>
                        <td className={`${cell} text-right`}>{r.ror != null ? fmtPct(r.ror, 1) : "—"}</td>
                        <td className={`${cell} text-right`}>{r.apy != null ? fmtPct(r.apy, 0) : "—"}</td>
                        <td className={`${cell} text-right`}>
                          <div className="flex flex-col items-end gap-0.5">
                            <PctBar pct={r.unrealizedPct} label={money(r.unrealized, true)} />
                            {r.remainingDollar != null && (
                              <span className="text-[10px] text-muted">
                                {money(r.remainingDollar)} {r.remainingLabel}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`${cell} text-right`}>{r.remainingAnnualized != null ? fmtPct(r.remainingAnnualized, 0) : "—"}</td>
                        <td className={`${cell} text-right ${tone(r.todayPl)}`}>
                          {r.todayPl != null ? (
                            <>
                              {money(r.todayPl, true)}
                              {r.todayPlPct != null && <span className="ml-1 text-[10px] opacity-80">({fmtPct(r.todayPlPct)})</span>}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${cell} text-right`}>{money(r.marketValue, true)}</td>
                        {multiAccount && <td className={`${cell} text-muted`}>{r.account}</td>}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <SummaryRow
              className="border-t border-border bg-surface-2/60"
              pad="px-2 py-2"
              sum={total}
              label={<span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Total</span>}
            />
          </tfoot>
        </table>
      </div>
      <p className="border-t border-border px-3 py-2 text-[10px] leading-relaxed text-muted">
        Options and stocks together. Short contracts show a negative quantity and a negative value (the cost to buy
        back). RoR and APY apply to cash-secured puts and covered calls: credit ÷ collateral, annualized over the
        original term; APY left annualizes what remains over the days left. Hold a ticker to chart it.
      </p>
    </div>
  );
}
