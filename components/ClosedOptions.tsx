"use client";

// Unified "closed options" breakdown — closed CSPs + closed LEAPs in one list,
// filterable by period and by type (All / CSPs / LEAPs). Reached from the
// Realized P/L stats on the Options page. Mirrors the CSP/LEAP closed tabs.
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Stat } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { fmtMoney, fmtPct, isCashSettledIndex } from "@/lib/calc";
import { inRange, rangeSubLabel, type Range } from "@/lib/date-range";
import type { ClosedCSP, ClosedLeap } from "@/lib/types";

type TypeKey = "all" | "csp" | "leap";
const TYPES: { key: TypeKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "csp", label: "CSPs" },
  { key: "leap", label: "LEAPS" },
];

type Item =
  | { kind: "csp"; data: ClosedCSP; uid: string }
  | { kind: "leap"; data: ClosedLeap; uid: string };

const chipFor = (outcome: string) =>
  outcome === "closed_loss"
    ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
    : outcome === "assigned"
      ? "bg-sky-500/15 text-sky-300 ring-sky-500/30"
      : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";

export function ClosedOptions({
  csps,
  leaps,
  initialType = "all",
  lockType = false,
  initialMode,
  initialMonths,
}: {
  csps: ClosedCSP[];
  leaps: ClosedLeap[];
  initialType?: TypeKey;
  // When embedded in a single-type view, hide the All/CSPs/LEAPS switch so the
  // type stays fixed (the Open|Closed toggle lives one level up).
  lockType?: boolean;
  initialMode?: "all" | "ytd" | "months" | "today";
  initialMonths?: number;
}) {
  // Time filter: a YTD button, a calendar-month slider, or a Today button.
  type Mode = "all" | "ytd" | "months" | "today";
  const [mode, setMode] = useState<Mode>(initialMode ?? "months");
  // Calendar months including the current one. Default = 1 (month-to-date). The
  // slider is laid out right→left (1 mo on the right, 6 mo on the left) and fills
  // from the right, via `direction: rtl` on the input below.
  const [months, setMonths] = useState(initialMonths ?? 1);
  const [type, setType] = useState<TypeKey>(initialType);
  const [openId, setOpenId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  // Click-to-sort on column headers; same column toggles asc/desc, a new column
  // starts descending (top-of-list = biggest / most recent).
  type SortKey = "closedAt" | "return" | "ann" | "pnl";
  const [sortKey, setSortKey] = useState<SortKey>("closedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };
  const sortVal = (it: Item, k: SortKey): number => {
    switch (k) {
      case "return":
        return it.kind === "csp" ? it.data.returnOnCollateral : it.data.returnPct;
      case "ann":
        return it.data.annualized;
      case "pnl":
        return it.data.realizedPnl;
      default:
        return Date.parse(`${it.data.closedAt}T00:00:00Z`) || 0;
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
    // N *calendar* months including the current one: 1 = month-to-date,
    // 2 = all of last month + MTD, … 6 = 1st of the month five months back → now.
    return { start: ymd(new Date(d.getFullYear(), d.getMonth() - (months - 1), 1)), end: null };
  }, [mode, months, now]);

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...csps.map((c, i) => ({ kind: "csp" as const, data: c, uid: `c${i}` })),
      ...leaps.map((l, i) => ({ kind: "leap" as const, data: l, uid: `l${i}` })),
    ];
    return all
      .filter((it) => inRange(it.data.closedAt, r))
      .filter((it) => type === "all" || it.kind === type)
      .sort((a, b) => {
        const d = sortVal(a, sortKey) - sortVal(b, sortKey);
        return sortDir === "asc" ? d : -d;
      });
  }, [csps, leaps, r, type, sortKey, sortDir]);

  const totalPnl = items.reduce((s, it) => s + it.data.realizedPnl, 0);
  const wins = items.filter((it) => it.data.realizedPnl > 0).length;
  const cspPnl = items.filter((it) => it.kind === "csp").reduce((s, it) => s + it.data.realizedPnl, 0);
  const leapPnl = items.filter((it) => it.kind === "leap").reduce((s, it) => s + it.data.realizedPnl, 0);

  // Sum ledger at the foot of the list — the realized mirror of the Open list footers.
  const closedCredit = items.reduce((s, it) => s + (it.kind === "csp" ? it.data.creditReceived : 0), 0);
  const closedCost = items.reduce((s, it) => s + (it.kind === "csp" ? it.data.costToClose : 0), 0);
  const closedBasis = items.reduce((s, it) => s + (it.kind === "leap" ? it.data.costBasis : 0), 0);
  const closedProceeds = items.reduce((s, it) => s + (it.kind === "leap" ? it.data.proceeds : 0), 0);
  const pnlText = `${totalPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(totalPnl))}`;
  const pnlTone = totalPnl >= 0 ? "text-emerald-400" : "text-rose-400";

  // Max collateral used: the peak *concurrent* capital tied up during the period
  // — NOT the sum across all positions. 3 sequential $20k positions peak at $20k,
  // not $60k. Capital = strike collateral (CSP) or cost basis (LEAP). The step
  // function peaks right after an open, so evaluate concurrency at each (period-
  // clipped) open day.
  const capitalOf = (it: Item) =>
    it.kind === "leap" ? it.data.costBasis : isCashSettledIndex(it.data.symbol) ? 0 : it.data.collateral;
  const openDayOf = (it: Item) => (r.start && it.data.openedAt < r.start ? r.start : it.data.openedAt);
  let maxCollateral = 0;
  for (const i of items) {
    const day = openDayOf(i);
    let concurrent = 0;
    for (const j of items) {
      if (openDayOf(j) <= day && day <= j.data.closedAt) concurrent += capitalOf(j);
    }
    if (concurrent > maxCollateral) maxCollateral = concurrent;
  }
  const returnOnMax = maxCollateral > 0 ? totalPnl / maxCollateral : 0;

  // Days the period spanned, for annualizing the return on max collateral.
  const MS = 86_400_000;
  const parseDay = (s: string) => Date.parse(`${s}T00:00:00Z`);
  let periodDays: number;
  if (r.start) {
    const endMs = r.end ? parseDay(r.end) + MS : now;
    periodDays = Math.max(1, Math.round((endMs - parseDay(r.start)) / MS));
  } else if (items.length) {
    const opens = items.map((it) => parseDay(it.data.openedAt));
    const closes = items.map((it) => parseDay(it.data.closedAt));
    periodDays = Math.max(1, Math.round((Math.max(...closes) - Math.min(...opens)) / MS) + 1);
  } else {
    periodDays = 1;
  }
  const annualizedOnMax = returnOnMax * (365 / periodDays);

  return (
    <div>
      {!lockType && (
        <div className="mt-4 flex gap-1 rounded-xl border border-border bg-surface p-1">
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                type === t.key ? "bg-surface-2 text-text" : "text-muted active:bg-surface-2/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Time filter: YTD · 6→1 month slider · Today */}
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
        {type === "all" ? (
          <>
            <Stat label="Realized P/L" value={<Amt>{`${totalPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(totalPnl))}`}</Amt>} tone={totalPnl >= 0 ? "pos" : "neg"} sub={`${items.length} closed · ${rangeSubLabel(r)}`} />
            <Stat label="Win rate" value={items.length ? `${Math.round((wins / items.length) * 100)}%` : "—"} sub={`${wins}/${items.length} profitable`} />
            <button onClick={() => setType("csp")} className="block text-left active:opacity-80">
              <Stat label="CSP P/L ›" value={<Amt>{`${cspPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(cspPnl))}`}</Amt>} tone={cspPnl >= 0 ? "pos" : "neg"} sub={`${items.filter((i) => i.kind === "csp").length} closed`} />
            </button>
            <button onClick={() => setType("leap")} className="block text-left active:opacity-80">
              <Stat label="Leap P/L ›" value={<Amt>{`${leapPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(leapPnl))}`}</Amt>} tone={leapPnl >= 0 ? "pos" : "neg"} sub={`${items.filter((i) => i.kind === "leap").length} closed`} />
            </button>
          </>
        ) : (
          <>
            <Stat label={type === "csp" ? "CSP P/L" : "Leap P/L"} value={<Amt>{`${totalPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(totalPnl))}`}</Amt>} tone={totalPnl >= 0 ? "pos" : "neg"} sub={`${items.length} closed · ${rangeSubLabel(r)}`} />
            <Stat label="Win rate" value={items.length ? `${Math.round((wins / items.length) * 100)}%` : "—"} sub={`${wins}/${items.length} profitable`} />
          </>
        )}
        <Stat label="Max collateral" value={<Amt>{fmtMoney(maxCollateral)}</Amt>} sub="peak concurrent" />
        <Stat label="Return on collateral" value={fmtPct(returnOnMax, 1)} tone={returnOnMax >= 0 ? "pos" : "neg"} sub={`${fmtPct(annualizedOnMax, 0)} annualized`} />
      </div>

      {items.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-border bg-surface px-4 py-5 text-center text-sm text-muted">
          Nothing closed in this period.
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-[1.4fr_0.6fr_0.7fr_0.85fr_0.55fr] gap-1 border-b border-border px-1 pb-1 text-[10px] uppercase tracking-wide text-muted">
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
              const d = it.data;
              const open = openId === it.uid;
              const optType = it.kind === "csp" ? "p" : it.data.optionType === "put" ? "p" : "c";
              const retPct = it.kind === "csp" ? it.data.returnOnCollateral : it.data.returnPct;
              return (
                <div key={it.uid}>
                  <button onClick={() => setOpenId(open ? null : it.uid)} className="grid w-full grid-cols-[1.4fr_0.6fr_0.7fr_0.85fr_0.55fr] items-center gap-1 px-1 py-2.5 text-left active:bg-surface-2">
                    <span className="min-w-0">
                      <span className="text-sm font-medium">
                        {d.symbol} ${d.strike}{optType}{d.contracts > 1 ? ` ×${d.contracts}` : ""}
                      </span>
                      <span className="block text-[10px] text-muted">
                        {d.closedAt} · {it.kind === "csp" ? "CSP" : "LEAP"}
                      </span>
                    </span>
                    <span className={`tabular text-right text-xs ${d.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {retPct >= 0 ? "+" : ""}
                      {(retPct * 100).toFixed(0)}%
                    </span>
                    <span className="tabular text-right text-[11px] text-muted">
                      {d.annualized >= 0 ? "+" : ""}
                      {(d.annualized * 100).toFixed(0)}%
                    </span>
                    <span className={`tabular text-right text-sm font-semibold ${d.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      <Amt>{`${d.realizedPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(d.realizedPnl))}`}</Amt>
                    </span>
                    <span className="flex justify-end">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${chipFor(d.outcome)}`}>
                        {d.outcome === "expired" ? "expired" : d.outcome === "assigned" ? "assigned" : d.outcome === "closed_loss" ? "loss" : "closed"}
                      </span>
                    </span>
                  </button>
                  {open && (it.kind === "csp" ? <CspRows c={it.data} /> : <LeapRows l={it.data} />)}
                </div>
              );
            })}
          </div>

          {type === "csp" && (
            <div className="mt-2 space-y-1 border-t-2 border-border px-1 pt-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted">Total premium collected</span>
                <span className="tabular font-medium">
                  <Amt>{fmtMoney(closedCredit)}</Amt>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">− Cost to close</span>
                <span className="tabular font-medium">
                  −<Amt>{fmtMoney(closedCost)}</Amt>
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1">
                <span className="font-medium">Realized P/L</span>
                <span className={`tabular font-semibold ${pnlTone}`}>
                  <Amt>{pnlText}</Amt>
                </span>
              </div>
            </div>
          )}

          {type === "leap" && (
            <div className="mt-2 space-y-1 border-t-2 border-border px-1 pt-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted">Cost basis</span>
                <span className="tabular font-medium">
                  <Amt>{fmtMoney(closedBasis)}</Amt>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Proceeds</span>
                <span className="tabular font-medium">
                  <Amt>{fmtMoney(closedProceeds)}</Amt>
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1">
                <span className="font-medium">Realized P/L</span>
                <span className={`tabular font-semibold ${pnlTone}`}>
                  <Amt>{pnlText}</Amt>
                </span>
              </div>
            </div>
          )}

          {type === "all" && (
            <div className="mt-2 flex items-center justify-between border-t-2 border-border px-1 pt-2 text-[11px]">
              <span className="font-medium">Total realized P/L</span>
              <span className={`tabular font-semibold ${pnlTone}`}>
                <Amt>{pnlText}</Amt>
              </span>
            </div>
          )}
        </>
      )}

      <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted">
        Realized round-trips reconstructed from filled option orders. CSP return is on collateral;
        LEAP return is on cost basis.
      </p>
    </div>
  );
}

function CspRows({ c }: { c: ClosedCSP }) {
  return (
    <dl className="space-y-1.5 bg-surface-2/40 px-3 pb-3 pt-1 text-[11px]">
      <Row k="Opened → closed" v={`${c.openedAt} → ${c.closedAt} (${c.daysHeld}d held)`} />
      <Row k="Contracts" v={`${c.contracts} (×100 = ${c.contracts * 100} sh)`} />
      <Row k="Credit received" v={<><Amt>{fmtMoney(c.creditReceived, { cents: true })}</Amt> <span className="text-muted">(${c.creditPerShare.toFixed(2)}/sh)</span></>} />
      <Row k="Cost to close" v={c.outcome === "expired" ? "$0 (expired worthless)" : c.outcome === "assigned" ? "$0 (assigned into shares)" : <Amt>{fmtMoney(c.costToClose, { cents: true })}</Amt>} />
      <Row k="Collateral" v={<Amt>{fmtMoney(c.collateral)}</Amt>} />
      <Row k="Realized P/L" v={c.outcome === "assigned" ? <span className="text-sky-300">$0 <span className="text-muted">— premium folded into share cost basis</span></span> : <span className={c.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}><Amt>{`${c.realizedPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(c.realizedPnl), { cents: true })}`}</Amt></span>} />
      <Row k="Return on collateral" v={`${(c.returnOnCollateral * 100).toFixed(2)}% · ${fmtPct(c.annualized, 0)} annualized`} />
    </dl>
  );
}

function LeapRows({ l }: { l: ClosedLeap }) {
  return (
    <dl className="space-y-1.5 bg-surface-2/40 px-3 pb-3 pt-1 text-[11px]">
      <Row k="Opened → closed" v={`${l.openedAt} → ${l.closedAt} (${l.daysHeld}d held)`} />
      <Row k="Contracts" v={`${l.contracts} ${l.optionType} (×100 = ${l.contracts * 100} sh)`} />
      <Row k="Cost basis" v={<><Amt>{fmtMoney(l.costBasis, { cents: true })}</Amt> <span className="text-muted">(${l.entryPerShare.toFixed(2)}/sh)</span></>} />
      <Row k="Proceeds" v={l.outcome === "expired" ? "$0 (expired worthless)" : <Amt>{fmtMoney(l.proceeds, { cents: true })}</Amt>} />
      <Row k="Realized P/L" v={<span className={l.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}><Amt>{`${l.realizedPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(l.realizedPnl), { cents: true })}`}</Amt></span>} />
      <Row k="Return" v={`${(l.returnPct * 100).toFixed(1)}% · ${fmtPct(l.annualized, 0)} annualized`} />
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
