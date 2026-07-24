"use client";

// Single-type view for covered calls or vertical spreads. Pinned Open|Closed
// toggle (default Open). Covered calls reuse OpenGroupCard; spreads combine their
// two legs into one complete vertical (SpreadGroupCard) with net stats. Closed
// round-trips render via ClosedStrategy. Mirrors the CSP/LEAP experience.
import { useState } from "react";
import { usePersistentState } from "@/lib/view-state";
import Link from "next/link";
import { Card, Stat } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { OpenGroupCard } from "@/components/OpenGroupCard";
import { SpreadGroupCard } from "@/components/SpreadGroupCard";
import { ClosedStrategy } from "@/components/ClosedStrategy";
import { fmtMoney, fmtPct, optionBasis, optionPnl } from "@/lib/calc";
import { buildSpreads, type Spread } from "@/lib/spread";
import type { ClosedCoveredCall, ClosedSpread, OptionPosition } from "@/lib/types";
import { SimulateControls } from "@/components/SimulateControls";
import { useIvSkew } from "@/lib/simConfig";
import { simulatePosition, hasSimulatableMove } from "@/lib/simulate";
import { SimValue } from "@/components/SimValue";

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

export function StrategyTypeView({
  type,
  open: rawOpen,
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
  const [status, setStatus] = usePersistentState<Status>("strategy-status", initialStatus);
  const [sort, setSort] = usePersistentState<Sort>("strategy-sort", { key: "yr", dir: "asc" });
  const onSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: SPREAD_DEFAULT_DIR[key] ?? "asc" }));

  // After-hours Simulate: re-price open legs from the live underlying. Spreads rebuild
  // from these legs (buildSpreads below), so the whole view follows.
  const [sim, setSim] = useState(false);
  const [ivSkew] = useIvSkew();
  const canSim = hasSimulatableMove(rawOpen);
  const open = sim && canSim ? rawOpen.map((o) => simulatePosition(o, { ivSkew })) : rawOpen;
  const simToggle =
    rawOpen.length > 0 ? (
      <SimulateControls on={sim && canSim} onToggle={() => setSim((v) => !v)} disabled={!canSim} />
    ) : undefined;

  const noun = type === "covered" ? "covered call" : "spread";
  const closedCount = type === "covered" ? closedCovered.length : closedSpreads.length;

  // Covered-call aggregates (per leg).
  const premium = open.reduce((s, o) => s + optionBasis(o), 0);
  const pnl = open.reduce((s, o) => s + optionPnl(o), 0);
  const rawPnl = rawOpen.reduce((s, o) => s + optionPnl(o), 0); // pre-sim, for before/after
  const rawById = new Map(rawOpen.map((o) => [o.id, o])); // pre-sim legs by id, for row before/after

  // Spread aggregates (per complete vertical). Action filtering removed — all open
  // verticals show; sorting still applies.
  const { spreads, orphans } = type === "spread" ? buildSpreads(open) : { spreads: [], orphans: [] };
  const effectiveSpreads = spreads;
  const sortedSpreads = sortSpreads(effectiveSpreads, sort);
  const sCredit = effectiveSpreads.reduce((s, x) => s + x.maxProfit, 0);
  const sRisk = effectiveSpreads.reduce((s, x) => s + x.collateral, 0);
  const sPnl = effectiveSpreads.reduce((s, x) => s + x.pnl, 0);
  // Pre-sim spread P/L for the shown verticals (matched by id), for before/after.
  const rawSpreadById = new Map(
    (type === "spread" ? buildSpreads(rawOpen).spreads : []).map((s) => [s.id, s]),
  );
  const sPnlReal = effectiveSpreads.reduce((s, sp) => s + (rawSpreadById.get(sp.id) ?? sp).pnl, 0);
  const sOpeningYield = sRisk > 0 ? sCredit / sRisk : 0;
  // Collateral-weighted DTE, same convention as the CSP view.
  const sWeightedDte = sRisk > 0 ? effectiveSpreads.reduce((s, x) => s + Math.max(x.dte, 0) * x.collateral, 0) / sRisk : 0;
  const sOpeningAnn = sWeightedDte > 0 ? sOpeningYield * (360 / sWeightedDte) : 0;
  const spreadEmpty = "No open spreads.";

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
              <Stat label="Gain/Loss" value={<SimValue oldV={rawPnl} newV={pnl} signed />} sub="unrealized" />
            </div>
            {sim && canSim && (
              <p className="mt-2 px-1 text-[10px] leading-snug text-amber-300/90">
                Projected from the current underlying (after-hours) via Δ/Γ — estimates, not Schwab close values.
              </p>
            )}
            <OpenGroupCard title="Covered Calls" note="short calls against stock" items={open} variant="csp" action={simToggle} realById={rawById} sim={sim && canSim} />
          </>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="Net credit" value={<Amt>{fmtMoney(sCredit)}</Amt>} sub={`${effectiveSpreads.length} spread${effectiveSpreads.length === 1 ? "" : "s"}`} />
              <Stat label="Gain/Loss" value={<SimValue oldV={sPnlReal} newV={sPnl} signed />} sub="unrealized" />
              <Stat label="Risk" value={<Amt>{fmtMoney(sRisk)}</Amt>} sub="max loss" />
              <Stat
                label="Opening yield"
                value={fmtPct(sOpeningYield, 1)}
                tone="pos"
                sub={`${fmtPct(sOpeningAnn, 0)} annualized`}
              />
            </div>
            {sim && canSim && (
              <p className="mt-2 px-1 text-[10px] leading-snug text-amber-300/90">
                Projected from the current underlying (after-hours) via Δ/Γ — estimates, not Schwab close values.
              </p>
            )}
            <SpreadGroupCard title="Vertical Spreads" note="tap a column header to sort" spreads={sortedSpreads} emptyLabel={spreadEmpty} sort={sort} onSort={onSort} action={simToggle} realById={rawSpreadById} sim={sim && canSim} />
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
