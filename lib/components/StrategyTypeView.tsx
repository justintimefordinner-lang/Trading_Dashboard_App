"use client";

// Single-type view for covered calls or vertical spreads. Pinned Open|Closed
// toggle (default Open). Covered calls reuse OpenGroupCard; spreads combine their
// two legs into one complete vertical (SpreadGroupCard) with net stats. Closed
// round-trips render via ClosedStrategy. Mirrors the CSP/LEAP experience.
import { useState } from "react";
import Link from "next/link";
import { Card, Stat } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { OpenGroupCard } from "@/components/OpenGroupCard";
import { SpreadGroupCard } from "@/components/SpreadGroupCard";
import { ClosedStrategy } from "@/components/ClosedStrategy";
import { fmtMoney, fmtPct, optionBasis, optionPnl } from "@/lib/calc";
import { buildSpreads, spreadInsight, type Spread, type SpreadAction } from "@/lib/spread";
import type { ClosedCoveredCall, ClosedSpread, OptionPosition } from "@/lib/types";

type Status = "open" | "closed";
type SortDir = "asc" | "desc";
type Sort = { key: string; dir: SortDir };

const SPREAD_DEFAULT_DIR: Record<string, SortDir> = {
  ticker: "asc", dte: "asc", risk: "desc", plpct: "desc", pldollar: "desc", tostrike: "asc", yr: "desc",
  bb: "asc",
};
function spreadSortVal(sp: Spread, key: string): number | string {
  switch (key) {
    case "ticker": return sp.symbol;
    case "bb": return sp.short.bbSigma ?? Infinity;
    case "dte": return sp.dte;
    case "risk": return sp.collateral;
    case "plpct": return sp.pnlPct;
    case "pldollar": return sp.pnl;
    case "tostrike": return sp.toStrike ?? Infinity;
    case "yr": return sp.yr;
    default: return 0;
  }
}
function sortSpreads(items: Spread[], sort: Sort): Spread[] {
  return [...items].sort((a, b) => {
    const va = spreadSortVal(a, sort.key);
    const vb = spreadSortVal(b, sort.key);
    const aMiss = typeof va === "number" && !isFinite(va);
    const bMiss = typeof vb === "number" && !isFinite(vb);
    if (aMiss || bMiss) return aMiss === bMiss ? 0 : aMiss ? 1 : -1;
    const r = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
    return sort.dir === "asc" ? r : -r;
  });
}

const SPREAD_FILTERS: { key: SpreadAction; label: string; active: string; idle: string; dot: string }[] = [
  {
    key: "manage",
    label: "Manage",
    active: "bg-emerald-500/25 text-emerald-100 ring-emerald-500/50",
    idle: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30 active:bg-emerald-500/20",
    dot: "bg-emerald-500",
  },
  {
    key: "hold",
    label: "Hold",
    active: "bg-sky-500/25 text-sky-100 ring-sky-500/50",
    idle: "bg-surface-2 text-muted ring-border active:bg-surface-2/70",
    dot: "bg-sky-500",
  },
];

export function StrategyTypeView({
  type,
  open,
  closedCovered,
  closedSpreads,
  initialStatus = "open",
  closedMode,
  closedMonths,
}: {
  type: "covered" | "spread";
  open: OptionPosition[];
  closedCovered: ClosedCoveredCall[];
  closedSpreads: ClosedSpread[];
  initialStatus?: Status;
  closedMode?: "all" | "ytd" | "months" | "today";
  closedMonths?: number;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [sort, setSort] = useState<Sort>({ key: "yr", dir: "asc" });
  const [spreadFilter, setSpreadFilter] = useState<SpreadAction | null>(null);
  const onSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: SPREAD_DEFAULT_DIR[key] ?? "asc" }));

  const noun = type === "covered" ? "covered call" : "spread";
  const closedCount = type === "covered" ? closedCovered.length : closedSpreads.length;

  // Covered-call aggregates (per leg).
  const premium = open.reduce((s, o) => s + optionBasis(o), 0);
  const pnl = open.reduce((s, o) => s + optionPnl(o), 0);

  // Spread aggregates (per complete vertical). The Manage/Hold filter narrows the
  // whole view — chips, stats and list alike — exactly like the CSP filter bar.
  const { spreads, orphans } = type === "spread" ? buildSpreads(open) : { spreads: [], orphans: [] };
  const spreadCounts = spreads.reduce(
    (acc, sp) => {
      acc[spreadInsight(sp).action] += 1;
      return acc;
    },
    { manage: 0, hold: 0 } as Record<SpreadAction, number>,
  );
  const effectiveSpreads = spreadFilter ? spreads.filter((sp) => spreadInsight(sp).action === spreadFilter) : spreads;
  const sortedSpreads = sortSpreads(effectiveSpreads, sort);
  const sCredit = effectiveSpreads.reduce((s, x) => s + x.maxProfit, 0);
  const sRisk = effectiveSpreads.reduce((s, x) => s + x.collateral, 0);
  const sPnl = effectiveSpreads.reduce((s, x) => s + x.pnl, 0);
  const sOpeningYield = sRisk > 0 ? sCredit / sRisk : 0;
  // Collateral-weighted DTE, same convention as the CSP view.
  const sWeightedDte = sRisk > 0 ? effectiveSpreads.reduce((s, x) => s + Math.max(x.dte, 0) * x.collateral, 0) / sRisk : 0;
  const sOpeningAnn = sWeightedDte > 0 ? sOpeningYield * (360 / sWeightedDte) : 0;
  const spreadEmpty =
    spreadFilter === "manage"
      ? "No spreads hitting the 50% / 21-DTE trigger."
      : spreadFilter === "hold"
        ? "No spreads in the hold bucket."
        : "No open spreads.";

  return (
    <div>
      <div className="mt-4 flex gap-1 rounded-xl border border-border bg-surface p-1">
        {(
          [
            { key: "open" as const, label: `Open · ${open.length}` },
            { key: "closed" as const, label: `Closed · ${closedCount}` },
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
        open.length === 0 ? (
          <Card className="mt-3 px-4 py-5 text-center text-sm text-muted">No open {noun} positions in this account.</Card>
        ) : type === "covered" ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="Premium value" value={<Amt>{fmtMoney(premium)}</Amt>} sub="collected" />
              <Stat
                label="Gain/Loss"
                value={<Amt>{`${pnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(pnl))}`}</Amt>}
                tone={pnl >= 0 ? "pos" : "neg"}
                sub="unrealized"
              />
            </div>
            <OpenGroupCard title="Covered Calls" note="short calls against stock" items={open} variant="csp" />
          </>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="Net credit" value={<Amt>{fmtMoney(sCredit)}</Amt>} sub={`${effectiveSpreads.length} spread${effectiveSpreads.length === 1 ? "" : "s"}`} />
              <Stat
                label="Gain/Loss"
                value={<Amt>{`${sPnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(sPnl))}`}</Amt>}
                tone={sPnl >= 0 ? "pos" : "neg"}
                sub="unrealized"
              />
              <Stat label="Risk" value={<Amt>{fmtMoney(sRisk)}</Amt>} sub="max loss" />
              <Stat
                label="Opening yield"
                value={fmtPct(sOpeningYield, 1)}
                tone="pos"
                sub={`${fmtPct(sOpeningAnn, 0)} annualized`}
              />
            </div>
            {spreads.length > 0 && (
              <div className="mt-3 flex gap-1.5">
                {SPREAD_FILTERS.map((f) => {
                  const on = spreadFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setSpreadFilter(on ? null : f.key)}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium ring-1 ring-inset transition-colors ${on ? f.active : f.idle}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${f.dot}`} />
                      {f.label} · {spreadCounts[f.key]}
                      {on ? <span className="opacity-80">✕</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
            <SpreadGroupCard title="Vertical Spreads" note="tap a column header to sort" spreads={sortedSpreads} emptyLabel={spreadEmpty} sort={sort} onSort={onSort} />
            {orphans.length > 0 && (
              <OpenGroupCard title="Unpaired legs" note="couldn't match into a spread" items={orphans} variant="long" />
            )}
          </>
        )
      ) : (
        <ClosedStrategy kind={type} items={type === "covered" ? closedCovered : closedSpreads} initialMode={closedMode} initialMonths={closedMonths} />
      )}

      {/* Find new — jumps to the matching Research vehicle */}
      <Link
        href={`/research?vehicle=${type === "spread" ? encodeURIComponent("Bull Put Spread") : "Covered"}`}
        className="mt-3 block active:opacity-80"
      >
        <Card className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium">
            Find new {type === "spread" ? "bull put spread" : "covered call"}{" "}
            <span className="font-normal text-muted">in Research</span>
          </span>
          <span className="text-muted">›</span>
        </Card>
      </Link>
    </div>
  );
}
