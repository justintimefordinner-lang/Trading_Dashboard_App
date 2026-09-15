"use client";

// Wide, sortable, groupable table of every open option position across
// every account — the desktop counterpart to the phone app's per-strategy
// lists. Ported from jttyeung's fork (components/desktop/PositionsTable.tsx
// on her staging branch), minus the alert glyphs and roll-analysis panel
// that read from her backend.
import { Fragment, useMemo, useState } from "react";
import type { OptionKind, OptionPosition } from "@/lib/types";
import {
  daysBetween,
  daysToExpiry,
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
import { MarketCountdown } from "@/components/desktop/MarketCountdown";
import { fmtWeekdayShort } from "@/lib/dates";

const STRATEGY_CODE: Record<OptionKind, string> = {
  csp: "CSP",
  "covered-call": "CC",
  "leap-call": "LEAPS",
  "leap-put-hedge": "HDG",
  "put-spread": "PS",
  "call-spread": "CS",
  other: "OTH",
};

// One hue per strategy kind so the badge doubles as an at-a-glance category
// marker across a wide, ungrouped table — distinct from the DTE/P&L columns'
// own semantic (good/warning/bad) colors. Each hue is a theme-aware token
// (globals.css) used at low opacity for the tint and full opacity for the
// border/text, so the chips read in both wide-surface themes.
const STRATEGY_STYLE: Record<OptionKind, string> = {
  csp: "border-info/30 bg-info/10 text-info",
  "covered-call": "border-violet/30 bg-violet/10 text-violet",
  "leap-call": "border-warn/30 bg-warn/10 text-warn",
  "leap-put-hedge": "border-fuchsia/30 bg-fuchsia/10 text-fuchsia",
  "put-spread": "border-teal/30 bg-teal/10 text-teal",
  "call-spread": "border-indigo/30 bg-indigo/10 text-indigo",
  other: "border-border bg-surface-2 text-muted",
};

// A position tagged with which account it came from — computed by the server
// page, which iterates every account itself.
export type SourcedOption = OptionPosition & { sourceLabel: string };

type GroupBy = "none" | "strategy" | "dte" | "ticker" | "account";
type SortKey = "ticker" | "strategy" | "qty" | "dit" | "dte" | "strike" | "spot" | "spotPct" | "theta" | "apy" | "ror" | "unrealized" | "remApy" | "todayPl" | "marketValue" | "source";

interface Row {
  o: SourcedOption;
  strategyCode: string;
  dit: number | null;
  dte: number;
  spot: number | null;
  spotPct: number | null;
  theta: number;
  unrealized: number;
  unrealizedPct: number;
  // Dollar amount still on the table if held to expiration — the buy-to-close
  // cost magnitude. Meaningful as "how much is left to capture" only for a
  // short (credit) position; for a long position it's just today's mark.
  remainingDollar: number;
  remainingLabel: "left" | "value";
  remainingAnnualized: number | null;
  todayPl: number | null;
  todayPlPct: number | null;
  // Set only when todayPl is a fallback to the most recent real trading day.
  todayPlAsOf: string | null;
  greeksAsOf: string | null;
  marketValue: number;
  apy: number | null;
  ror: number | null;
}

// OptionPosition.qty is a plain magnitude (side carries the sign) — signed
// here to match how a short position's size/value is conventionally shown.
function signedQty(o: OptionPosition): number {
  return o.side === "short" ? -o.qty : o.qty;
}

function buildRow(o: SourcedOption): Row {
  const marketValue = optionNetValue(o); // long +, short − (the buy-back liability)
  const todayPl = o.dayValueChange ?? null;
  // Back out yesterday's value (today's value minus today's change) to get a %.
  const yesterdayValue = todayPl != null ? marketValue - todayPl : null;
  const todayPlPct = todayPl != null && yesterdayValue ? todayPl / Math.abs(yesterdayValue) : null;

  return {
    o,
    strategyCode: STRATEGY_CODE[o.kind] ?? "OTH",
    dit: o.openedAt ? daysBetween(o.openedAt) : null,
    dte: daysToExpiry(o.expiration),
    spot: o.underlyingPrice ?? o.underlyingLive ?? o.underlyingClose ?? null,
    spotPct: spotPercentChange(o),
    theta: positionDailyTheta(o),
    unrealized: optionPnl(o),
    unrealizedPct: optionPnlPct(o),
    remainingDollar: Math.abs(marketValue),
    remainingLabel: o.side === "long" ? "value" : "left",
    remainingAnnualized: positionRemainingAnnualizedReturn(o),
    todayPl,
    todayPlPct,
    todayPlAsOf: o.dayValueChangeAsOf ?? null,
    greeksAsOf: o.greeksAsOf ?? null,
    marketValue,
    apy: positionAnnualizedReturn(o),
    ror: positionReturnOnCapital(o),
  };
}

// summaryCells maps a totals object to the columns those totals belong under,
// keyed rather than positional, so a column added or reordered carries its
// total along automatically.
function summaryCells(sum: Summary): Partial<Record<SortKey, React.ReactNode>> {
  return {
    theta: <span className="font-semibold text-muted">{fmtMoney(sum.theta)}</span>,
    unrealized: (
      <div className="flex flex-col items-end gap-0.5">
        <PctBar pct={sum.unrealizedPct} label={fmtMoney(sum.unrealized, { sign: true })} />
        <span className="whitespace-nowrap text-[10px] text-muted">
          {fmtMoney(sum.remainingDollar)} {sum.remainingLabel}
        </span>
      </div>
    ),
    todayPl: sum.hasTodayPl ? (
      <span className={`font-semibold ${pnlColor(sum.todayPl)}`}>
        {fmtMoney(sum.todayPl, { sign: true })} ({fmtPct(sum.todayPlPct)})
      </span>
    ) : (
      <span className="text-muted">-</span>
    ),
    marketValue: <span className="font-semibold text-text">{fmtMoney(sum.marketValue, { sign: true })}</span>,
  };
}

// SummaryRow renders one totals row across the full column set. The label
// occupies the first two columns (ticker + strategy).
function SummaryRow({
  label,
  sum,
  className,
  cellClassName,
}: {
  label: React.ReactNode;
  sum: Summary;
  className?: string;
  cellClassName: string;
}) {
  const cells = summaryCells(sum);
  return (
    <tr className={className}>
      {COLUMNS.map((c) => {
        if (c.key === "strategy") return null;
        if (c.key === "ticker") {
          return (
            <td key={c.key} colSpan={2} className={cellClassName}>
              {label}
            </td>
          );
        }
        return (
          <td key={c.key} className={`${cellClassName} whitespace-nowrap text-right tabular text-xs`}>
            {cells[c.key] ?? null}
          </td>
        );
      })}
    </tr>
  );
}

// unrealizedPct for a short premium-selling position is the same number as
// "% of the credit already captured", so this bar doubles as a capture-
// progress bar for CSP/covered-call rows. Width is clamped to the track past
// ±100%; the label always shows the real number.
function PctBar({ pct, label }: { pct: number; label?: string }) {
  const positive = pct >= 0;
  const width = Math.min(100, Math.abs(pct) * 100);
  return (
    <div className={`relative h-5 w-24 overflow-hidden rounded-full ${positive ? "bg-pos/15" : "bg-neg/15"}`}>
      <div className={`h-full rounded-full ${positive ? "bg-pos" : "bg-neg"}`} style={{ width: `${width}%` }} />
      {/* A fixed dark tone, not a theme token — --pos/--neg are light-ish in
          both themes, so a dark label reads against either fill. */}
      <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap text-[10px] font-semibold text-[#2c2620]">
        {label ?? fmtPct(pct, 0)}
      </span>
    </div>
  );
}

// 0-7 / 8-21 mirror this app's own DTE-management framing (the 21-DTE early-
// management window); the rest split the far end for more granularity.
function dteBucket(dte: number): { key: string; label: string; order: number } {
  if (dte <= 7) return { key: "0-7", label: "0-7 DTE", order: 0 };
  if (dte <= 21) return { key: "8-21", label: "8-21 DTE", order: 1 };
  if (dte <= 30) return { key: "22-30", label: "22-30 DTE", order: 2 };
  if (dte <= 45) return { key: "30-45", label: "30-45 DTE", order: 3 };
  return { key: "45+", label: "45+ DTE", order: 4 };
}

function dteColor(dte: number): string {
  if (dte <= 7) return "bg-neg/10 text-neg";
  if (dte <= 21) return "bg-warn/10 text-warn";
  return "bg-pos/10 text-pos";
}

function pnlColor(n: number | null): string {
  if (n == null) return "text-muted";
  return n >= 0 ? "text-pos" : "text-neg";
}

function sortValue(r: Row, key: SortKey): number | string {
  switch (key) {
    case "ticker":
      return r.o.symbol;
    case "strategy":
      return r.strategyCode;
    case "qty":
      return signedQty(r.o);
    case "dit":
      return r.dit ?? -Infinity;
    case "dte":
      return r.dte;
    case "strike":
      return r.o.strike;
    case "spot":
      return r.spot ?? -Infinity;
    case "spotPct":
      return r.spotPct ?? -Infinity;
    case "theta":
      return r.theta;
    case "apy":
      return r.apy ?? -Infinity;
    case "ror":
      return r.ror ?? -Infinity;
    case "unrealized":
      return r.unrealized;
    case "remApy":
      return r.remainingAnnualized ?? -Infinity;
    case "todayPl":
      return r.todayPl ?? -Infinity;
    case "marketValue":
      return r.marketValue;
    case "source":
      return r.o.sourceLabel;
  }
}

type Summary = ReturnType<typeof sumRows>;

function sumRows(rows: Row[]) {
  const unrealized = rows.reduce((s, r) => s + r.unrealized, 0);
  const remainingDollar = rows.reduce((s, r) => s + r.remainingDollar, 0);
  const todayPl = rows.reduce((s, r) => s + (r.todayPl ?? 0), 0);
  const marketValue = rows.reduce((s, r) => s + r.marketValue, 0);
  const theta = rows.reduce((s, r) => s + r.theta, 0);
  // % versions: weighted by each row's own basis magnitude so a subtotal's %
  // means "blended return on the capital in this group".
  const unrealizedBasis = rows.reduce((s, r) => s + Math.abs(optionBasis(r.o)), 0);
  const unrealizedPct = unrealizedBasis !== 0 ? unrealized / unrealizedBasis : 0;
  const todayBasis = rows.reduce((s, r) => s + Math.abs(r.marketValue - (r.todayPl ?? 0)), 0);
  const todayPlPct = todayBasis !== 0 ? todayPl / todayBasis : 0;
  const hasTodayPl = rows.some((r) => r.todayPl != null);
  const labels = new Set(rows.map((r) => r.remainingLabel));
  const remainingLabel: "left" | "value" | "combined" = labels.size === 1 ? [...labels][0] : "combined";
  return { unrealized, unrealizedPct, remainingDollar, remainingLabel, todayPl, todayPlPct, marketValue, theta, hasTodayPl };
}

// align mirrors how each column's own cells render: numeric columns are
// right-aligned in the body, so their headers are too.
const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "ticker", label: "Ticker" },
  { key: "strategy", label: "Strategy" },
  { key: "qty", label: "Qty", align: "right" },
  { key: "dit", label: "DIT", align: "right" },
  { key: "dte", label: "DTE", align: "right" },
  { key: "strike", label: "Strike", align: "right" },
  { key: "spot", label: "Mark", align: "right" },
  { key: "spotPct", label: "Chg %", align: "right" },
  { key: "theta", label: "Theta $", align: "right" },
  { key: "ror", label: "RoR %", align: "right" },
  { key: "apy", label: "APY", align: "right" },
  { key: "unrealized", label: "Unrealized", align: "right" },
  { key: "remApy", label: "APY Left", align: "right" },
  { key: "todayPl", label: "Today P/L", align: "right" },
  { key: "marketValue", label: "Market Value", align: "right" },
  { key: "source", label: "Source" },
];

export function PositionsTable({ options }: { options: SourcedOption[] }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("dte");
  const [sortKey, setSortKey] = useState<SortKey>("dte");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const rows = useMemo(() => options.map(buildRow), [options]);

  const groups = useMemo(() => {
    type Group = { key: string; label: string; order: number; rows: Row[] };
    const map = new Map<string, Group>();
    for (const r of rows) {
      let key: string, label: string, order: number;
      if (groupBy === "none") {
        key = "all";
        label = "";
        order = 0;
      } else if (groupBy === "strategy") {
        key = r.strategyCode;
        label = r.strategyCode;
        order = key.charCodeAt(0);
      } else if (groupBy === "dte") {
        const b = dteBucket(r.dte);
        key = b.key;
        label = b.label;
        order = b.order;
      } else if (groupBy === "account") {
        key = r.o.sourceLabel;
        label = r.o.sourceLabel;
        order = 0;
      } else {
        key = r.o.symbol;
        label = r.o.symbol;
        order = 0;
      }
      const g = map.get(key) ?? { key, label, order, rows: [] };
      g.rows.push(r);
      map.set(key, g);
    }
    const list = Array.from(map.values());
    list.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.label.localeCompare(b.label)));
    for (const g of list) {
      g.rows.sort((a, b) => {
        const av = sortValue(a, sortKey);
        const bv = sortValue(b, sortKey);
        const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
        return cmp * sortDir;
      });
    }
    return list;
  }, [rows, groupBy, sortKey, sortDir]);

  const total = useMemo(() => sumRows(rows), [rows]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function collapseAll() {
    setCollapsed(new Set(groups.map((g) => g.key)));
  }
  function expandAll() {
    setCollapsed(new Set());
  }
  const allCollapsed = groupBy !== "none" && groups.length > 0 && groups.every((g) => collapsed.has(g.key));

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-surface">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text">Open Positions</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">{rows.length}</span>
        </div>
        <MarketCountdown />

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Group
            <div className="flex overflow-hidden rounded-lg border border-border">
              {(["none", "strategy", "dte", "ticker", "account"] as GroupBy[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`px-2.5 py-1 text-xs font-medium capitalize ${
                    groupBy === g ? "bg-accent/15 text-accent" : "bg-transparent text-muted hover:text-text"
                  }`}
                >
                  {g === "none" ? "None" : g === "dte" ? "DTE" : g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {groupBy !== "none" && (
            <button
              onClick={allCollapsed ? expandAll : collapseAll}
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted hover:text-text"
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <table className="w-full min-w-[1080px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={`whitespace-nowrap px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}
              >
                <button
                  onClick={() => toggleSort(c.key)}
                  className={`flex items-center gap-1 hover:text-text ${c.align === "right" ? "w-full justify-end" : ""}`}
                >
                  {c.label}
                  <span className="text-[9px]">{sortKey === c.key ? (sortDir === 1 ? "▲" : "▼") : "↕"}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isCollapsed = groupBy !== "none" && collapsed.has(g.key);
            const gSum = groupBy !== "none" ? sumRows(g.rows) : null;
            return (
              <Fragment key={g.key}>
                {groupBy !== "none" && gSum && (
                  <SummaryRow
                    key={`${g.key}-header`}
                    className="border-b border-border bg-surface-2/60"
                    cellClassName="px-3 py-2"
                    sum={gSum}
                    label={
                      <button onClick={() => toggleGroup(g.key)} className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-text">
                        <span className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>▾</span>
                        {g.label} <span className="font-normal text-muted">({g.rows.length})</span>
                      </button>
                    }
                  />
                )}
                {!isCollapsed &&
                  g.rows.map((r) => (
                    <tr key={r.o.id} className="border-b border-border/60 hover:bg-surface-2/40">
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-text" data-ticker={r.o.symbol}>
                        {r.o.symbol}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STRATEGY_STYLE[r.o.kind] ?? STRATEGY_STYLE.other}`}>
                          {r.strategyCode}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-right tabular ${r.o.side === "short" ? "text-neg" : "text-text"}`}>{signedQty(r.o)}</td>
                      <td className="px-3 py-2 text-right tabular text-info">{r.dit ?? "-"}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold tabular ${dteColor(r.dte)}`}>{r.dte}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular text-text">{fmtMoney(r.o.strike)}</td>
                      <td className="px-3 py-2 text-right tabular text-text">{r.spot != null ? fmtMoney(r.spot) : "-"}</td>
                      <td className={`px-3 py-2 text-right tabular ${r.spotPct != null ? pnlColor(r.spotPct) : "text-text"}`}>
                        {r.spotPct != null ? fmtPct(r.spotPct) : "-"}
                      </td>
                      <td className={`px-3 py-2 text-right tabular ${pnlColor(r.theta)}`}>
                        <div className="flex flex-col items-end leading-tight">
                          <span>{fmtMoney(r.theta, { sign: true })}</span>
                          {r.greeksAsOf && (
                            <span className="text-[10px] text-muted" title={`Markets were closed today — showing ${r.greeksAsOf}'s Greeks`}>
                              as of {fmtWeekdayShort(r.greeksAsOf)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular text-text">{r.ror != null ? fmtPct(r.ror, 1) : "-"}</td>
                      <td className="px-3 py-2 text-right tabular text-text">{r.apy != null ? fmtPct(r.apy, 1) : "-"}</td>
                      <td className="px-3 py-2 text-right tabular">
                        <div className="flex flex-col items-end gap-0.5">
                          <PctBar pct={r.unrealizedPct} label={fmtMoney(r.unrealized, { sign: true })} />
                          <span className="whitespace-nowrap text-[10px] text-muted">
                            {fmtMoney(r.remainingDollar)} {r.remainingLabel}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular text-text">
                        {r.remainingAnnualized != null ? fmtPct(r.remainingAnnualized, 1) : "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular">
                        {r.todayPl != null ? (
                          <div className="flex flex-col items-end">
                            <span className={pnlColor(r.todayPl)}>
                              {fmtMoney(r.todayPl, { sign: true })} {r.todayPlPct != null && `(${fmtPct(r.todayPlPct)})`}
                            </span>
                            {r.todayPlAsOf && (
                              <span className="text-[10px] text-muted" title={`Markets were closed today — showing ${r.todayPlAsOf}'s close-to-close change`}>
                                as of {fmtWeekdayShort(r.todayPlAsOf)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular text-text">{fmtMoney(r.marketValue, { sign: true })}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{r.o.sourceLabel}</td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <SummaryRow
            className="border-t border-border bg-surface-2/60 font-semibold"
            cellClassName="px-3 py-2.5"
            sum={total}
            label={<span className="text-xs uppercase tracking-wide text-muted">Total</span>}
          />
        </tfoot>
      </table>
    </div>
  );
}
