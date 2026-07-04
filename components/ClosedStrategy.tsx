"use client";

// Closed round-trips for covered calls OR vertical spreads. Shares the same time
// filter (YTD · calendar-month slider · Today) and stat header as the CSP/LEAP
// closed view, but renders strategy-specific rows. Kept separate from
// ClosedOptions so the proven CSP/LEAP view stays untouched.
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Stat } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { fmtMoney, fmtPct } from "@/lib/calc";
import { inRange, rangeSubLabel, type Range } from "@/lib/date-range";
import type { ClosedCoveredCall, ClosedSpread } from "@/lib/types";

type Item = ClosedCoveredCall | ClosedSpread;

const chipFor = (outcome: string) =>
  outcome === "closed_loss"
    ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
    : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";

const chipText = (outcome: string) =>
  outcome === "expired" ? "expired" : outcome === "closed_loss" ? "loss" : "closed";

export function ClosedStrategy({
  kind,
  items: source,
  initialMode,
  initialMonths,
}: {
  kind: "covered" | "spread";
  items: Item[];
  initialMode?: "all" | "ytd" | "months" | "today";
  initialMonths?: number;
}) {
  type Mode = "all" | "ytd" | "months" | "today";
  const [mode, setMode] = useState<Mode>(initialMode ?? "months");
  const [months, setMonths] = useState(initialMonths ?? 1);
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
        return kind === "covered" ? (it as ClosedCoveredCall).returnOnNotional : (it as ClosedSpread).returnOnRisk;
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

  // Stable, position-independent unique key per row — reconstructed ids can
  // collide (same ticker/strike/expiration opened the same day), which corrupts
  // React reconciliation and breaks header sorting after a few clicks.
  const uidOf = useMemo(() => {
    const m = new WeakMap<object, string>();
    source.forEach((s, i) => m.set(s, `r${i}`));
    return (it: object) => m.get(it) ?? "";
  }, [source]);

  const totalPnl = items.reduce((s, it) => s + it.realizedPnl, 0);
  const wins = items.filter((it) => it.realizedPnl > 0).length;
  const pnlText = `${totalPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(totalPnl))}`;
  const pnlTone = totalPnl >= 0 ? "text-emerald-400" : "text-rose-400";
  const noun = kind === "covered" ? "Covered call" : "Spread";

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
          label={`${noun} P/L`}
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
              const ret = kind === "covered" ? (it as ClosedCoveredCall).returnOnNotional : (it as ClosedSpread).returnOnRisk;
              const label =
                kind === "covered"
                  ? `${it.symbol} $${(it as ClosedCoveredCall).strike}c`
                  : `${it.symbol} $${(it as ClosedSpread).shortStrike}/${(it as ClosedSpread).longStrike}${(it as ClosedSpread).optionType === "put" ? "p" : "c"}`;
              const sub = kind === "covered" ? "Covered call" : `${(it as ClosedSpread).optionType === "put" ? "Put" : "Call"} spread`;
              return (
                <div key={uid}>
                  <button
                    onClick={() => setOpenId(open ? null : uid)}
                    className="grid w-full grid-cols-[1.5fr_0.6fr_0.7fr_0.85fr_0.55fr] items-center gap-1 px-1 py-2.5 text-left active:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="text-sm font-medium">
                        {label}
                        {it.contracts > 1 ? ` ×${it.contracts}` : ""}
                      </span>
                      <span className="block text-[10px] text-muted">
                        {it.closedAt} · {sub}
                      </span>
                    </span>
                    <span className={`tabular text-right text-xs ${it.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {ret >= 0 ? "+" : ""}
                      {(ret * 100).toFixed(0)}%
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
                        {chipText(it.outcome)}
                      </span>
                    </span>
                  </button>
                  {open &&
                    (kind === "covered" ? (
                      <CoveredRows c={it as ClosedCoveredCall} />
                    ) : (
                      <SpreadRows s={it as ClosedSpread} />
                    ))}
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
        {kind === "covered"
          ? "Realized covered-call round-trips reconstructed from filled option orders. Return is premium net of buy-to-close, on the strike notional."
          : "Realized vertical-spread round-trips (short + long leg) reconstructed from filled option orders. Return is on defined risk."}
      </p>
    </div>
  );
}

function CoveredRows({ c }: { c: ClosedCoveredCall }) {
  return (
    <dl className="space-y-1.5 bg-surface-2/40 px-3 pb-3 pt-1 text-[11px]">
      <Row k="Opened → closed" v={`${c.openedAt} → ${c.closedAt} (${c.daysHeld}d held)`} />
      <Row k="Contracts" v={`${c.contracts} (×100 = ${c.contracts * 100} sh)`} />
      <Row
        k="Credit received"
        v={
          <>
            <Amt>{fmtMoney(c.creditReceived, { cents: true })}</Amt>{" "}
            <span className="text-muted">(${c.creditPerShare.toFixed(2)}/sh)</span>
          </>
        }
      />
      <Row k="Cost to close" v={c.outcome === "expired" ? "$0 (expired worthless)" : <Amt>{fmtMoney(c.costToClose, { cents: true })}</Amt>} />
      <Row
        k="Realized P/L"
        v={
          <span className={c.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
            <Amt>{`${c.realizedPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(c.realizedPnl), { cents: true })}`}</Amt>
          </span>
        }
      />
      <Row k="Return on notional" v={`${(c.returnOnNotional * 100).toFixed(2)}% · ${fmtPct(c.annualized, 0)} annualized`} />
    </dl>
  );
}

function SpreadRows({ s }: { s: ClosedSpread }) {
  return (
    <dl className="space-y-1.5 bg-surface-2/40 px-3 pb-3 pt-1 text-[11px]">
      <Row k="Opened → closed" v={`${s.openedAt} → ${s.closedAt} (${s.daysHeld}d held)`} />
      <Row k="Structure" v={`$${s.shortStrike} / $${s.longStrike} ${s.optionType} · ${s.width}-wide · ${s.isCredit ? "credit" : "debit"}`} />
      <Row k="Contracts" v={`${s.contracts} (×100)`} />
      <Row
        k={s.isCredit ? "Net credit" : "Net debit"}
        v={
          <>
            <Amt>{fmtMoney(Math.abs(s.netOpen), { cents: true })}</Amt>{" "}
            <span className="text-muted">(${Math.abs(s.netCreditPerShare).toFixed(2)}/sh)</span>
          </>
        }
      />
      <Row k="Cost to close" v={s.outcome === "expired" ? "$0 (expired worthless)" : <Amt>{fmtMoney(s.netClose, { cents: true })}</Amt>} />
      <Row k="Max risk" v={<Amt>{fmtMoney(s.maxRisk)}</Amt>} />
      <Row
        k="Realized P/L"
        v={
          <span className={s.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
            <Amt>{`${s.realizedPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(s.realizedPnl), { cents: true })}`}</Amt>
          </span>
        }
      />
      <Row k="Return on risk" v={`${(s.returnOnRisk * 100).toFixed(2)}% · ${fmtPct(s.annualized, 0)} annualized`} />
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
