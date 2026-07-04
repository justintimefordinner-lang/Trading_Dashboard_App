"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { TimeFilter, useTimeFilter } from "@/components/TimeFilter";
import { fmtMoney } from "@/lib/calc";
import { inRange, rangeSubLabel } from "@/lib/date-range";

export interface BucketInput {
  key: string;
  label: string;
  items: { pnl: number; date?: string; sym?: string; strikeLabel?: string; openedAt?: string; daysHeld?: number }[];
}

const ACCENT: Record<string, string> = {
  csp: "bg-sky-400",
  covered: "bg-emerald-400",
  spread: "bg-amber-400",
  leap: "bg-violet-400",
  stock: "bg-cyan-400",
  other: "bg-slate-400",
};

const signed = (n: number) => `${n >= 0 ? "+" : "−"}${fmtMoney(Math.abs(n))}`;

// Where each strategy bucket links to (Open or Closed set by ?view=).
const STRATEGY_ROUTE: Record<string, string> = {
  csp: "/options/csp",
  leap: "/options/leap",
  covered: "/options/covered",
  spread: "/options/spread",
  stock: "/stocks",
};

// Compact strategy labels for the tight per-trade breakout rows.
const SHORT_LABEL: Record<string, string> = {
  csp: "CSP",
  covered: "CC",
  spread: "Spread",
  leap: "LEAP",
  stock: "Stock",
  other: "Other",
};

interface BucketAgg {
  key: string;
  label: string;
  pnl: number;
  count: number;
  wins: number;
}

export function PnlView({ realized, open }: { realized: BucketInput[]; open: BucketInput[] }) {
  const tf = useTimeFilter("months", 1); // default to the last 1 month
  const [mode, setMode] = useState<"realized" | "open">("realized");

  const isRealized = mode === "realized";
  const source = isRealized ? realized : open;
  const range = tf.range;

  const buckets = useMemo<BucketAgg[]>(() => {
    return source
      .map((b) => {
        const items = isRealized ? b.items.filter((it) => (it.date ? inRange(it.date, range) : true)) : b.items;
        const pnl = items.reduce((s, it) => s + it.pnl, 0);
        const wins = items.filter((it) => it.pnl > 0).length;
        return { key: b.key, label: b.label, pnl, count: items.length, wins };
      })
      .filter((b) => b.count > 0)
      .sort((a, b) => b.pnl - a.pnl);
  }, [source, isRealized, range]);

  // Flat, dated item list (realized only) for the time-series charts.
  const dated = useMemo(() => {
    if (!isRealized) return [] as { pnl: number; date: string }[];
    return realized
      .flatMap((b) => b.items)
      .filter((it): it is { pnl: number; date: string } => !!it.date && inRange(it.date, range))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [realized, isRealized, range]);

  const cumulative = useMemo(() => {
    let run = 0;
    return dated.map((it) => ({ date: it.date, cum: (run += it.pnl) }));
  }, [dated]);

  const monthly = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of dated) {
      const key = it.date.slice(0, 7); // YYYY-MM
      m.set(key, (m.get(key) ?? 0) + it.pnl);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, pnl]) => ({ key, pnl }));
  }, [dated]);

  const total = buckets.reduce((s, b) => s + b.pnl, 0);
  const totalCount = buckets.reduce((s, b) => s + b.count, 0);
  const totalWins = buckets.reduce((s, b) => s + b.wins, 0);
  const grossProfit = buckets.reduce((s, b) => s + Math.max(0, b.pnl), 0);
  const grossLoss = buckets.reduce((s, b) => s + Math.min(0, b.pnl), 0);
  const maxAbs = buckets.reduce((m, b) => Math.max(m, Math.abs(b.pnl)), 0);
  const winRate = totalCount > 0 ? Math.round((totalWins / totalCount) * 100) : 0;

  // Same items, grouped by underlying ticker instead of by strategy. Each ticker keeps
  // its constituent trades so the row can expand into a per-trade breakout.
  interface TickerTrade { pnl: number; date?: string; stratKey: string; stratLabel: string; strikeLabel?: string; openedAt?: string; daysHeld?: number }
  const tickers = useMemo<{ sym: string; pnl: number; count: number; wins: number; trades: TickerTrade[] }[]>(() => {
    const m = new Map<string, { pnl: number; count: number; wins: number; trades: TickerTrade[] }>();
    for (const b of source) {
      const items = isRealized ? b.items.filter((it) => (it.date ? inRange(it.date, range) : true)) : b.items;
      for (const it of items) {
        const sym = (it.sym ?? "—").toUpperCase();
        const agg = m.get(sym) ?? { pnl: 0, count: 0, wins: 0, trades: [] };
        agg.pnl += it.pnl;
        agg.count += 1;
        if (it.pnl > 0) agg.wins += 1;
        agg.trades.push({ pnl: it.pnl, date: it.date, stratKey: b.key, stratLabel: b.label,
          strikeLabel: it.strikeLabel, openedAt: it.openedAt, daysHeld: it.daysHeld });
        m.set(sym, agg);
      }
    }
    const out = [...m.entries()].map(([sym, v]) => ({ sym, ...v }));
    for (const t of out) {
      t.trades.sort((a, c) => c.pnl - a.pnl); // largest profit first
    }
    return out.sort((a, b) => b.pnl - a.pnl);
  }, [source, isRealized, range]);

  const tickerMaxAbs = tickers.reduce((m, t) => Math.max(m, Math.abs(t.pnl)), 0);
  const [showAllTickers, setShowAllTickers] = useState(false);
  const [openSyms, setOpenSyms] = useState<Set<string>>(new Set());
  const toggleSym = (sym: string) =>
    setOpenSyms((prev) => {
      const n = new Set(prev);
      if (n.has(sym)) n.delete(sym);
      else n.add(sym);
      return n;
    });
  const TICKER_CAP = 8;
  const shownTickers = showAllTickers ? tickers : tickers.slice(0, TICKER_CAP);

  return (
    <div className="pb-24 pt-3 sm:pb-6">
      {/* Realized / Open */}
      <div className="flex rounded-xl border border-border bg-surface-2 p-1 text-[12px] font-medium">
        {(["realized", "open"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${
              mode === m ? "bg-surface text-text shadow-sm" : "text-muted"
            }`}
          >
            {m === "realized" ? "Realized" : "Open"}
          </button>
        ))}
      </div>

      {/* Time filter (realized only) */}
      {isRealized && (
        <div className="mt-3">
          <TimeFilter state={tf} />
        </div>
      )}

      {/* Hero total */}
      <Card className="mt-3 px-4 py-4">
        <div className="text-xs text-muted">{isRealized ? "Total realized P&L" : "Total open P&L · unrealized"}</div>
        <div className={`tabular mt-0.5 text-4xl font-bold ${total >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          <Amt>{signed(total)}</Amt>
        </div>
        <div className="mt-1 text-[12px] text-muted">
          {isRealized ? (
            <>
              {totalCount} closed {totalCount === 1 ? "trade" : "trades"} · {rangeSubLabel(range)}
            </>
          ) : (
            <>
              {totalCount} open {totalCount === 1 ? "position" : "positions"}
            </>
          )}
        </div>

        {isRealized && cumulative.length >= 2 && (
          <div className="mt-3">
            <CumulativeChart points={cumulative} />
          </div>
        )}
      </Card>

      {/* Win rate */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat
          label={isRealized ? "Win rate" : "In profit"}
          value={`${winRate}%`}
          tone={totalCount === 0 ? undefined : winRate >= 50 ? "pos" : "neg"}
          sub={`${totalWins}/${totalCount} ${isRealized ? "profitable" : "positions"}`}
        />
        <Stat
          label={isRealized ? "Win–loss" : "Up–down"}
          value={`${totalWins}–${Math.max(0, totalCount - totalWins)}`}
          sub={isRealized ? "closed trades" : "open positions"}
        />
      </div>

      {/* Gross split */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Gross profit" value={<Amt>{signed(grossProfit)}</Amt>} tone="pos" />
        <Stat label="Gross loss" value={<Amt>{grossLoss < 0 ? signed(grossLoss) : fmtMoney(0)}</Amt>} tone="neg" />
      </div>

      {/* Monthly P&L bars (realized) */}
      {isRealized && monthly.length > 0 && (
        <>
          <SectionTitle>By month</SectionTitle>
          <Card className="px-4 py-3">
            <MonthlyBars months={monthly} />
          </Card>
        </>
      )}

      {/* By strategy */}
      <SectionTitle>By strategy</SectionTitle>
      {buckets.length === 0 ? (
        <Card className="px-4 py-6 text-center text-[12px] text-muted">
          No {isRealized ? "closed trades in this range" : "open positions"} yet.
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {buckets.map((b) => {
            const route = STRATEGY_ROUTE[b.key];
            const inner = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${ACCENT[b.key] ?? "bg-slate-400"}`} />
                    <span className="text-sm font-medium">{b.label}</span>
                    <span className="tabular rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{b.count}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`tabular text-sm font-semibold ${b.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      <Amt>{signed(b.pnl)}</Amt>
                    </span>
                    {route && <span className="text-muted">›</span>}
                  </div>
                </div>
                <div className="mt-2">
                  <DivergingBar pnl={b.pnl} maxAbs={maxAbs} />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-muted">
                  <span>
                    {b.wins}/{b.count} {isRealized ? "profitable" : "in profit"}
                    {b.count > 0 && ` · ${Math.round((b.wins / b.count) * 100)}%`}
                  </span>
                  <span className="tabular">{total !== 0 ? `${Math.round((b.pnl / Math.abs(total)) * 100)}% of net` : ""}</span>
                </div>
              </>
            );
            return route ? (
              <Link key={b.key} href={`${route}?view=${isRealized ? "closed" : "open"}${isRealized ? `&range=${tf.mode}&months=${tf.months}` : ""}`} className="block px-4 py-3 active:bg-surface-2">
                {inner}
              </Link>
            ) : (
              <div key={b.key} className="px-4 py-3">
                {inner}
              </div>
            );
          })}
        </Card>
      )}

      <p className="mt-3 px-1 text-[10px] leading-relaxed text-muted">
        {isRealized
          ? "Realized P&L from reconstructed closed round-trips (FIFO). Stocks include assignment cost basis where available."
          : "Open P&L is current unrealized mark-to-market on live positions, grouped by strategy."}
      </p>

      {/* By ticker */}
      <SectionTitle>By ticker</SectionTitle>
      {tickers.length === 0 ? (
        <Card className="px-4 py-6 text-center text-[12px] text-muted">
          No {isRealized ? "closed trades in this range" : "open positions"} yet.
        </Card>
      ) : (
        <>
          <Card className="divide-y divide-border">
            {shownTickers.map((t) => {
              const isOpen = openSyms.has(t.sym);
              return (
                <div key={t.sym}>
                  <button onClick={() => toggleSym(t.sym)} className="block w-full px-4 py-2.5 text-left active:bg-surface-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-3 shrink-0 text-[10px] text-muted">{isOpen ? "▾" : "▸"}</span>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${t.pnl >= 0 ? "bg-emerald-400" : "bg-rose-400"}`} />
                        <span className="text-sm font-semibold">{t.sym}</span>
                        <span className="tabular rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{t.count}</span>
                      </div>
                      <span className={`tabular shrink-0 text-sm font-semibold ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        <Amt>{signed(t.pnl)}</Amt>
                      </span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border/50 bg-surface-2/30 px-4 py-2">
                      <DivergingBar pnl={t.pnl} maxAbs={tickerMaxAbs} />
                      <div className="mt-1.5 flex justify-between text-[10px] text-muted">
                        <span>
                          {t.wins}/{t.count} {isRealized ? "profitable" : "in profit"}
                          {t.count > 0 && ` · ${Math.round((t.wins / t.count) * 100)}%`}
                        </span>
                        <span className="tabular">{total !== 0 ? `${Math.round((t.pnl / Math.abs(total)) * 100)}% of net` : ""}</span>
                      </div>
                      <div className="mt-2 border-t border-border/40 pt-1">
                        {t.trades.map((tr, i) => (
                          <div key={i} className="py-1.5">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACCENT[tr.stratKey] ?? "bg-slate-400"}`} />
                                <span className="font-medium">{SHORT_LABEL[tr.stratKey] ?? tr.stratLabel}</span>
                                {tr.strikeLabel && <span className="text-muted">{tr.strikeLabel}</span>}
                              </div>
                              <span className={`tabular shrink-0 ${tr.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                <Amt>{signed(tr.pnl)}</Amt>
                              </span>
                            </div>
                            {(tr.openedAt || tr.daysHeld != null || (isRealized && tr.date)) && (
                              <div className="ml-3.5 mt-0.5 text-[10px] text-muted">
                                {tr.openedAt ? `opened ${tr.openedAt}` : ""}
                                {tr.daysHeld != null ? `${tr.openedAt ? " · " : ""}${tr.daysHeld}d held` : ""}
                                {isRealized && tr.date ? ` · closed ${tr.date}` : ""}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
          {tickers.length > TICKER_CAP && (
            <button
              onClick={() => setShowAllTickers((v) => !v)}
              className="mt-2 w-full text-center text-[11px] font-medium text-sky-400 active:opacity-70"
            >
              {showAllTickers ? "Show less" : `Show all ${tickers.length} tickers`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function CumulativeChart({ points }: { points: { date: string; cum: number }[] }) {
  const W = 320;
  const H = 96;
  const P = 6;
  const cums = points.map((p) => p.cum);
  const minY = Math.min(0, ...cums);
  const maxY = Math.max(0, ...cums);
  const spanY = maxY - minY || 1;
  const x = (i: number) => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - minY) / spanY) * (H - 2 * P);
  const last = cums[cums.length - 1];
  const up = last >= 0;
  const stroke = up ? "#34d399" : "#fb7185";
  const fill = up ? "rgba(52,211,153,0.14)" : "rgba(251,113,133,0.14)";
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  const area = `${line} L${x(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`;
  return (
    <div>
      <div className="mb-1 text-[10px] text-muted">Cumulative realized P&L</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="none">
        <line x1={P} y1={zeroY} x2={W - P} y2={zeroY} stroke="currentColor" strokeOpacity="0.18" strokeWidth="1" />
        <path d={area} fill={fill} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function MonthlyBars({ months }: { months: { key: string; pnl: number }[] }) {
  const maxAbs = Math.max(1, ...months.map((m) => Math.abs(m.pnl)));
  const label = (k: string) => {
    const m = Number(k.split("-")[1]);
    return ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m] ?? k;
  };
  return (
    <div className="flex items-end justify-between gap-1.5">
      {months.map((m) => {
        const h = (Math.abs(m.pnl) / maxAbs) * 38;
        const pos = m.pnl >= 0;
        return (
          <div key={m.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full flex-col items-center">
              <div className="flex h-[40px] w-full items-end justify-center">
                {pos && <div className="w-3 rounded-t bg-emerald-500/70" style={{ height: `${h}px` }} />}
              </div>
              <div className="h-px w-full bg-border" />
              <div className="flex h-[40px] w-full items-start justify-center">
                {!pos && <div className="w-3 rounded-b bg-rose-500/70" style={{ height: `${h}px` }} />}
              </div>
            </div>
            <div className="mt-1 text-[9px] text-muted">{label(m.key)}</div>
          </div>
        );
      })}
    </div>
  );
}

function DivergingBar({ pnl, maxAbs }: { pnl: number; maxAbs: number }) {
  const frac = maxAbs > 0 ? Math.min(1, Math.abs(pnl) / maxAbs) : 0;
  const w = frac * 50;
  const pos = pnl >= 0;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <div
        className={`absolute inset-y-0 ${pos ? "rounded-r-full bg-emerald-500/70" : "rounded-l-full bg-rose-500/70"}`}
        style={pos ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
      />
    </div>
  );
}
