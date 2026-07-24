"use client";

import { useMemo, useRef, useState } from "react";
import { usePersistentSet, usePersistentState } from "@/lib/view-state";
import Link from "next/link";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { TimeFilter, useTimeFilter } from "@/components/TimeFilter";
import { fmtMoney } from "@/lib/calc";
import { inRange, rangeSubLabel } from "@/lib/date-range";

export interface BucketInput {
  key: string;
  label: string;
  items: {
    pnl: number;
    date?: string;
    sym?: string;
    strikeLabel?: string;
    openedAt?: string;
    daysHeld?: number;
  }[];
}

// Capital-gains holding period. Short-term = held one year or less; anything longer
// — or without a determinable holding period — is treated as long-term.
type TermFilter = "both" | "short" | "long";
const LONG_TERM_DAYS = 365;
const isShortTerm = (daysHeld?: number) => daysHeld != null && daysHeld <= LONG_TERM_DAYS;
const keepTerm = (term: TermFilter, daysHeld?: number) =>
  term === "both" || (term === "short" ? isShortTerm(daysHeld) : !isShortTerm(daysHeld));

const ACCENT: Record<string, string> = {
  csp: "bg-sky-400",
  covered: "bg-emerald-400",
  spread: "bg-amber-400",
  leap: "bg-violet-400",
  stock: "bg-cyan-400",
  other: "bg-slate-400",
};

const signed = (n: number) => `${n >= 0 ? "+" : "−"}${fmtMoney(Math.abs(n))}`;

// ISO date → "Jul 10, 2026" without touching the Date API.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : iso;
};

// Compact dollars for tight sub-labels: $980, $14k, $1.2M.
const fmtCompact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `$${(n / 1_000).toFixed(a >= 10_000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
};

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
  winDollars: number; // sum of positive trade P&L
  lossDollars: number; // sum of |negative trade P&L| (positive magnitude)
}

export function PnlView({ realized, open }: { realized: BucketInput[]; open: BucketInput[] }) {
  const tf = useTimeFilter("months", 1); // default to the last 1 month
  const [mode, setMode] = usePersistentState<"realized" | "open">("pnl-mode", "realized");
  const [term, setTerm] = usePersistentState<TermFilter>("pnl-term", "both");
  const [cumScrub, setCumScrub] = useState<number | null>(null);

  const isRealized = mode === "realized";
  const source = isRealized ? realized : open;
  const range = tf.range;

  const buckets = useMemo<BucketAgg[]>(() => {
    return source
      .map((b) => {
        const items = (isRealized ? b.items.filter((it) => (it.date ? inRange(it.date, range) : true)) : b.items).filter((it) => keepTerm(term, it.daysHeld));
        const pnl = items.reduce((s, it) => s + it.pnl, 0);
        const wins = items.filter((it) => it.pnl > 0).length;
        const winDollars = items.reduce((s, it) => s + Math.max(0, it.pnl), 0);
        const lossDollars = items.reduce((s, it) => s - Math.min(0, it.pnl), 0);
        return { key: b.key, label: b.label, pnl, count: items.length, wins, winDollars, lossDollars };
      })
      .filter((b) => b.count > 0)
      .sort((a, b) => b.pnl - a.pnl);
  }, [source, isRealized, range, term]);

  // Flat, dated item list (realized only) for the time-series charts.
  const dated = useMemo(() => {
    if (!isRealized) return [] as { pnl: number; date: string }[];
    return realized
      .flatMap((b) => b.items)
      .filter((it) => keepTerm(term, it.daysHeld))
      .filter((it): it is { pnl: number; date: string } => !!it.date && inRange(it.date, range))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [realized, isRealized, range, term]);

  const cumulative = useMemo(() => {
    let run = 0;
    return dated.map((it) => ({ date: it.date, cum: (run += it.pnl) }));
  }, [dated]);
  // Press-and-drag on the cumulative chart shows the running realized P&L at a past point.
  const cumPoint =
    cumScrub !== null && cumScrub >= 0 && cumScrub < cumulative.length ? cumulative[cumScrub] : null;

  const total = buckets.reduce((s, b) => s + b.pnl, 0);
  const totalCount = buckets.reduce((s, b) => s + b.count, 0);
  const totalWins = buckets.reduce((s, b) => s + b.wins, 0);
  // Trade-level winning vs losing dollars (not bucket-netted), so the gross split
  // and the dollarized win rate reflect actual winners/losers rather than netting
  // to $0 within a profitable strategy.
  const winDollars = buckets.reduce((s, b) => s + b.winDollars, 0);
  const lossDollars = buckets.reduce((s, b) => s + b.lossDollars, 0); // positive magnitude
  const maxAbs = buckets.reduce((m, b) => Math.max(m, Math.abs(b.pnl)), 0);
  const winRate = totalCount > 0 ? Math.round((totalWins / totalCount) * 100) : 0;
  // Dollarized win rate: share of gross traded dollars that were winners.
  const dollarPool = winDollars + lossDollars;
  const dollarWinRate = dollarPool > 0 ? Math.round((winDollars / dollarPool) * 100) : 0;

  // Same items, grouped by underlying ticker instead of by strategy. Each ticker keeps
  // its constituent trades so the row can expand into a per-trade breakout.
  interface TickerTrade { pnl: number; date?: string; stratKey: string; stratLabel: string; strikeLabel?: string; openedAt?: string; daysHeld?: number }
  const tickers = useMemo<{ sym: string; pnl: number; count: number; wins: number; trades: TickerTrade[] }[]>(() => {
    const m = new Map<string, { pnl: number; count: number; wins: number; trades: TickerTrade[] }>();
    for (const b of source) {
      const items = (isRealized ? b.items.filter((it) => (it.date ? inRange(it.date, range) : true)) : b.items).filter((it) => keepTerm(term, it.daysHeld));
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
  }, [source, isRealized, range, term]);

  const tickerMaxAbs = tickers.reduce((m, t) => Math.max(m, Math.abs(t.pnl)), 0);
  const [showAllTickers, setShowAllTickers] = usePersistentState("pnl-showall", false);
  const { has: symOpen, toggle: toggleSym } = usePersistentSet("pnl-opensyms");
  const TICKER_CAP = 8;
  const shownTickers = showAllTickers ? tickers : tickers.slice(0, TICKER_CAP);

  // Deep-link a ticker's strategy breakout row to that strategy's page, filtered to
  // the stock and matching the current Realized/Open lens (+ the realized time
  // range). Null for strategies without a dedicated page (e.g. "other").
  const stratHref = (stratKey: string, sym: string): string | null => {
    const route = STRATEGY_ROUTE[stratKey];
    if (!route) return null;
    const params = new URLSearchParams({ symbol: sym, view: isRealized ? "closed" : "open" });
    if (isRealized) {
      params.set("range", tf.mode);
      params.set("months", String(tf.months));
    }
    return `${route}?${params.toString()}`;
  };

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
        <div className="text-xs text-muted">
          {cumPoint ? "Realized P&L to date" : isRealized ? "Total realized P&L" : "Total open P&L · unrealized"}
        </div>
        <div
          className={`tabular mt-0.5 text-4xl font-bold ${(cumPoint ? cumPoint.cum : total) >= 0 ? "text-emerald-400" : "text-rose-400"}`}
        >
          <Amt>{signed(cumPoint ? cumPoint.cum : total)}</Amt>
        </div>
        <div className="mt-1 text-[12px] text-muted">
          {cumPoint ? (
            <>as of {fmtDate(cumPoint.date)}</>
          ) : isRealized ? (
            <>
              {totalCount} closed {totalCount === 1 ? "trade" : "trades"} · {rangeSubLabel(range)}
            </>
          ) : (
            <>
              {totalCount} open {totalCount === 1 ? "position" : "positions"}
            </>
          )}
        </div>

        {/* Capital-gains term lens — re-scopes the whole realized/open view */}
        <div className="mt-3 flex">
          <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-[11px] font-medium">
            {([
              { key: "both", label: "Both", title: "All realized gains" },
              { key: "short", label: "Short", title: "Short-term gains — held one year or less" },
              { key: "long", label: "Long", title: "Long-term gains — held more than one year" },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setTerm(t.key)}
                title={t.title}
                className={`rounded-md px-2.5 py-0.5 transition-colors ${
                  term === t.key ? "bg-surface text-text shadow-sm" : "text-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {isRealized && cumulative.length >= 2 && (
          <div className="mt-2">
            <CumulativeChart points={cumulative} onScrub={setCumScrub} />
          </div>
        )}
      </Card>

      {/* Win rate */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat
          label={isRealized ? "Win rate ($)" : "In profit ($)"}
          value={`${dollarWinRate}%`}
          tone={dollarPool === 0 ? undefined : dollarWinRate >= 50 ? "pos" : "neg"}
          sub={
            isRealized
              ? `${fmtCompact(winDollars)} won · ${fmtCompact(lossDollars)} lost`
              : `${fmtCompact(winDollars)} up · ${fmtCompact(lossDollars)} down`
          }
        />
        <Stat
          label={isRealized ? "Win–loss" : "Up–down"}
          value={`${totalWins}–${Math.max(0, totalCount - totalWins)}`}
          sub={`${winRate}% ${isRealized ? "by trade count" : "in profit"}`}
        />
      </div>

      {/* Gross split */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Gross profit" value={<Amt>{signed(winDollars)}</Amt>} tone="pos" />
        <Stat label="Gross loss" value={<Amt>{lossDollars > 0 ? signed(-lossDollars) : fmtMoney(0)}</Amt>} tone="neg" />
      </div>

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
              const isOpen = symOpen(t.sym);
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
                        {t.trades.map((tr, i) => {
                          const href = stratHref(tr.stratKey, t.sym);
                          const rowInner = (
                            <>
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACCENT[tr.stratKey] ?? "bg-slate-400"}`} />
                                  <span className="font-medium">{SHORT_LABEL[tr.stratKey] ?? tr.stratLabel}</span>
                                  {tr.strikeLabel && <span className="text-muted">{tr.strikeLabel}</span>}
                                </div>
                                <span className="flex shrink-0 items-center gap-1">
                                  <span className={`tabular ${tr.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    <Amt>{signed(tr.pnl)}</Amt>
                                  </span>
                                  {href && <span className="text-[10px] text-muted">›</span>}
                                </span>
                              </div>
                              {(tr.openedAt || tr.daysHeld != null || (isRealized && tr.date)) && (
                                <div className="ml-3.5 mt-0.5 text-[10px] text-muted">
                                  {tr.openedAt ? `opened ${tr.openedAt}` : ""}
                                  {tr.daysHeld != null ? `${tr.openedAt ? " · " : ""}${tr.daysHeld}d held` : ""}
                                  {isRealized && tr.date ? ` · closed ${tr.date}` : ""}
                                </div>
                              )}
                            </>
                          );
                          return href ? (
                            <Link
                              key={i}
                              href={href}
                              className="-mx-1 block rounded-md px-1 py-1.5 active:bg-surface-2"
                              title={`View ${SHORT_LABEL[tr.stratKey] ?? tr.stratLabel} for ${t.sym}`}
                            >
                              {rowInner}
                            </Link>
                          ) : (
                            <div key={i} className="py-1.5">
                              {rowInner}
                            </div>
                          );
                        })}
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

// Cumulative realized P&L, press-and-drag scrubbable (same interaction as the home
// hero chart): dragging reports the touched index via onScrub so the header can show
// the running P&L at that date. Drag is tracked with window listeners so it never
// drops when the finger leaves the chart; overlays are HTML-positioned so the dot
// stays round and the line crisp under the horizontal stretch.
function CumulativeChart({
  points,
  onScrub,
}: {
  points: { date: string; cum: number }[];
  onScrub?: (idx: number | null) => void;
}) {
  const W = 320;
  const H = 96;
  const P = 6;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const cums = points.map((p) => p.cum);
  const minY = Math.min(0, ...cums);
  const maxY = Math.max(0, ...cums);
  const spanY = maxY - minY || 1;
  const x = (i: number) => P + (i / (n - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - minY) / spanY) * (H - 2 * P);
  const last = cums[n - 1];
  const up = last >= 0;
  const stroke = up ? "#34d399" : "#fb7185";
  const fill = up ? "rgba(52,211,153,0.14)" : "rgba(251,113,133,0.14)";
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  const area = `${line} L${x(n - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`;
  const interactive = n >= 2;

  const idxFrom = (clientX: number): number | null => {
    const el = wrapRef.current;
    if (!el || !interactive) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(frac * (n - 1));
  };
  const beginScrub = (e: React.PointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    const apply = (clientX: number) => {
      const i = idxFrom(clientX);
      if (i === null) return;
      setActive(i);
      onScrub?.(i);
    };
    apply(e.clientX);
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      apply(ev.clientX);
    };
    const end = () => {
      setActive(null);
      onScrub?.(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const fracPct = active !== null ? (active / (n - 1)) * 100 : 0;
  const topPct = active !== null ? (y(points[active].cum) / H) * 100 : 0;

  return (
    <div>
      <div className="mb-1 text-[10px] text-muted">Cumulative realized P&L</div>
      <div
        ref={wrapRef}
        className="relative select-none"
        style={interactive ? { touchAction: "none" } : undefined}
        onPointerDown={interactive ? beginScrub : undefined}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" preserveAspectRatio="none">
          <line x1={P} y1={zeroY} x2={W - P} y2={zeroY} stroke="currentColor" strokeOpacity="0.18" strokeWidth="1" />
          <path d={area} fill={fill} />
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {active !== null && (
          <>
            <div className="pointer-events-none absolute inset-y-0 w-px bg-white/25" style={{ left: `${fracPct}%` }} />
            <div
              className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${fracPct}%`, top: `${topPct}%`, backgroundColor: stroke, boxShadow: "0 0 0 2px rgba(10,12,16,0.85)" }}
            />
          </>
        )}
      </div>
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
