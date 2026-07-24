"use client";

// Realized stock round-trips (FIFO). Same time filter (YTD · calendar-month
// slider · Today) and click-to-sort headers as the closed options views.
import { useMemo, useState } from "react";
import { usePersistentState } from "@/lib/view-state";
import type { ReactNode } from "react";
import { Stat } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { fmtMoney, fmtPct } from "@/lib/calc";
import { inRange, rangeSubLabel, type Range } from "@/lib/date-range";
import type { ClosedStock } from "@/lib/types";

const chipFor = (outcome: string) =>
  outcome === "closed_loss"
    ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
    : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";

const fmtShares = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });

export function ClosedStocks({
  source,
  initialMode,
  initialMonths,
}: {
  source: ClosedStock[];
  initialMode?: "all" | "ytd" | "months" | "today";
  initialMonths?: number;
}) {
  type Mode = "all" | "ytd" | "months" | "today";
  const [mode, setMode] = usePersistentState<Mode>("closedstk-mode", initialMode ?? "months");
  const [months, setMonths] = usePersistentState("closedstk-months", initialMonths ?? 1);
  const [openId, setOpenId] = usePersistentState<string | null>("closedstk-openid", null);
  const [now] = useState(() => Date.now());

  type SortKey = "closedAt" | "return" | "ann" | "pnl";
  const [sortKey, setSortKey] = usePersistentState<SortKey>("closedstk-sortkey", "closedAt");
  const [sortDir, setSortDir] = usePersistentState<"asc" | "desc">("closedstk-sortdir", "desc");
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };
  const sortVal = (it: ClosedStock, k: SortKey): number => {
    switch (k) {
      case "return":
        return it.returnPct;
      case "ann":
        return it.annualized;
      case "pnl":
        return it.realizedPnl;
      default:
        return Date.parse(`${it.closedAt}T00:00:00Z`) || 0;
    }
  };

  const r = useMemo<Range>(() => {
    const d = new Date(now);
    const ymd = (x: Date) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    if (mode === "all") return { start: null, end: null };
    if (mode === "ytd") return { start: ymd(new Date(d.getFullYear(), 0, 1)), end: null };
    if (mode === "today") {
      const t = ymd(d);
      return { start: t, end: t };
    }
    return { start: ymd(new Date(d.getFullYear(), d.getMonth() - (months - 1), 1)), end: null };
  }, [mode, months, now]);

  const items = useMemo(
    () =>
      source
        .filter((it) => inRange(it.closedAt, r))
        .slice()
        .sort((a, b) => {
          const d = sortVal(a, sortKey) - sortVal(b, sortKey);
          return sortDir === "asc" ? d : -d;
        }),
    [source, r, sortKey, sortDir],
  );

  // Stable, position-independent unique key per row (guards against any duplicate
  // reconstructed ids corrupting React reconciliation / sorting).
  const uidOf = useMemo(() => {
    const m = new WeakMap<object, string>();
    source.forEach((s, i) => m.set(s, `r${i}`));
    return (it: object) => m.get(it) ?? "";
  }, [source]);

  const totalPnl = items.reduce((s, it) => s + it.realizedPnl, 0);
  const wins = items.filter((it) => it.realizedPnl > 0).length;
  const pnlText = `${totalPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(totalPnl))}`;
  const pnlTone = totalPnl >= 0 ? "text-emerald-400" : "text-rose-400";

  return (
    <div>
      {/* Time filter: YTD · calendar-month slider · Today (fills from the right) */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => setMode("all")}
          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
            mode === "all" ? "bg-surface-2 text-text ring-border" : "bg-surface text-muted ring-border active:bg-surface-2/50"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setMode("ytd")}
          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
            mode === "ytd" ? "bg-surface-2 text-text ring-border" : "bg-surface text-muted ring-border active:bg-surface-2/50"
          }`}
        >
          YTD
        </button>
        <div className={`flex-1 rounded-lg px-3 py-1 ring-1 ring-inset ${mode === "months" ? "bg-surface-2/40 ring-border" : "bg-surface ring-border"}`}>
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>6 mo</span>
            <span className={`font-semibold ${mode === "months" ? "text-text" : "text-muted"}`}>Last {months} mo</span>
            <span>1 mo</span>
          </div>
          <input
            type="range"
            min={1}
            max={6}
            step={1}
            value={months}
            onChange={(e) => {
              setMonths(Number(e.target.value));
              setMode("months");
            }}
            style={{ direction: "rtl" }}
            className="mt-0.5 w-full accent-sky-400"
            aria-label="Months of closed trades to show"
          />
        </div>
        <button
          onClick={() => setMode("today")}
          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
            mode === "today" ? "bg-surface-2 text-text ring-border" : "bg-surface text-muted ring-border active:bg-surface-2/50"
          }`}
        >
          Today
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat
          label="Realized P/L"
          value={<Amt>{pnlText}</Amt>}
          tone={totalPnl >= 0 ? "pos" : "neg"}
          sub={`${items.length} closed · ${rangeSubLabel(r)}`}
        />
        <Stat
          label="Win rate"
          value={items.length ? `${Math.round((wins / items.length) * 100)}%` : "—"}
          sub={`${wins}/${items.length} profitable`}
        />
      </div>

      {items.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-border bg-surface px-4 py-5 text-center text-sm text-muted">
          Nothing closed in this period.
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-[1.5fr_0.6fr_0.7fr_0.85fr_0.55fr] gap-1 border-b border-border px-1 pb-1 text-[10px] uppercase tracking-wide text-muted">
            <button onClick={() => toggleSort("closedAt")} className={`flex items-center gap-0.5 active:opacity-70 ${sortKey === "closedAt" ? "text-text" : ""}`}>
              Closed · position<Caret on={sortKey === "closedAt"} dir={sortDir} />
            </button>
            <button onClick={() => toggleSort("return")} className={`flex items-center justify-end gap-0.5 active:opacity-70 ${sortKey === "return" ? "text-text" : ""}`}>
              Return<Caret on={sortKey === "return"} dir={sortDir} />
            </button>
            <button onClick={() => toggleSort("ann")} className={`flex items-center justify-end gap-0.5 active:opacity-70 ${sortKey === "ann" ? "text-text" : ""}`}>
              Ann.<Caret on={sortKey === "ann"} dir={sortDir} />
            </button>
            <button onClick={() => toggleSort("pnl")} className={`flex items-center justify-end gap-0.5 active:opacity-70 ${sortKey === "pnl" ? "text-text" : ""}`}>
              P/L<Caret on={sortKey === "pnl"} dir={sortDir} />
            </button>
            <span className="text-right" />
          </div>
          <div className="divide-y divide-border">
            {items.map((it) => {
              const uid = uidOf(it);
              const open = openId === uid;
              return (
                <div key={uid}>
                  <button
                    onClick={() => setOpenId(open ? null : uid)}
                    className="grid w-full grid-cols-[1.5fr_0.6fr_0.7fr_0.85fr_0.55fr] items-center gap-1 px-1 py-2.5 text-left active:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="text-sm font-medium">
                        {it.symbol} <span className="text-muted">{fmtShares(it.shares)}sh</span>
                      </span>
                      <span className="block text-[10px] text-muted">
                        {it.closedAt} · {it.side === "short" ? "Short" : "Long"}
                      </span>
                    </span>
                    <span className={`tabular text-right text-xs ${it.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {it.returnPct >= 0 ? "+" : ""}
                      {(it.returnPct * 100).toFixed(0)}%
                    </span>
                    <span className="tabular text-right text-[11px] text-muted">
                      {it.annualized >= 0 ? "+" : ""}
                      {(it.annualized * 100).toFixed(0)}%
                    </span>
                    <span className={`tabular text-right text-sm font-semibold ${it.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      <Amt>{`${it.realizedPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(it.realizedPnl))}`}</Amt>
                    </span>
                    <span className="flex justify-end">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${chipFor(it.outcome)}`}>
                        {it.outcome === "closed_loss" ? "loss" : "gain"}
                      </span>
                    </span>
                  </button>
                  {open && <StockRows s={it} />}
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t-2 border-border px-1 pt-2 text-[11px]">
            <span className="font-medium">Total realized P/L</span>
            <span className={`tabular font-semibold ${pnlTone}`}>
              <Amt>{pnlText}</Amt>
            </span>
          </div>
        </>
      )}

      <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted">
        Realized stock round-trips reconstructed from filled equity orders (FIFO lot matching). Return is on cost basis.
      </p>
    </div>
  );
}

function StockRows({ s }: { s: ClosedStock }) {
  return (
    <dl className="space-y-1.5 bg-surface-2/40 px-3 pb-3 pt-1 text-[11px]">
      <Row k="Opened → closed" v={`${s.openedAt} → ${s.closedAt} (${s.daysHeld}d held)`} />
      <Row k="Shares" v={`${fmtShares(s.shares)} · ${s.side === "short" ? "short" : "long"}`} />
      <Row k={s.side === "short" ? "Sold → covered" : "Bought → sold"} v={<><Amt>{`$${s.avgOpen.toFixed(2)}`}</Amt> → <Amt>{`$${s.avgClose.toFixed(2)}`}</Amt> /sh</>} />
      <Row k="Cost basis" v={<Amt>{fmtMoney(s.costBasis, { cents: true })}</Amt>} />
      <Row k="Proceeds" v={<Amt>{fmtMoney(s.proceeds, { cents: true })}</Amt>} />
      <Row
        k="Realized P/L"
        v={
          <span className={s.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
            <Amt>{`${s.realizedPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(s.realizedPnl), { cents: true })}`}</Amt>
          </span>
        }
      />
      <Row k="Return" v={`${(s.returnPct * 100).toFixed(1)}% · ${fmtPct(s.annualized, 0)} annualized`} />
    </dl>
  );
}

function Caret({ on, dir }: { on: boolean; dir: "asc" | "desc" }) {
  if (!on) return null;
  return <span className="text-[7px] leading-none">{dir === "asc" ? "▲" : "▼"}</span>;
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="tabular text-right">{v}</dd>
    </div>
  );
}
