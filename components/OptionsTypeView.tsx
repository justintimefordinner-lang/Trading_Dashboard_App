"use client";

// Reusable single-type Options view (CSP or LEAP). A pinned Open|Closed toggle
// (default Open) switches between live positions and realized round-trips, so the
// CSP and LEAP experiences are identical — just a different `type`.
import { useState } from "react";
import Link from "next/link";
import { Card, Stat } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { ClosedOptions } from "@/components/ClosedOptions";
import { OpenGroupCard } from "@/components/OpenGroupCard";
import { CspCashPlan, CASH_BUCKETS, cashBucketIndex } from "@/components/CspCashPlan";
import { cspCollateral, cspInsight, cspRemainingAnnualized, daysToExpiry, fmtMoney, fmtPct, isCashSettledIndex, optionBasis, optionMarketValue, optionPnl, optionPnlPct } from "@/lib/calc";
import type { ClosedCSP, ClosedLeap, OptionPosition } from "@/lib/types";
import { SimulateControls } from "@/components/SimulateControls";
import { useIvSkew } from "@/lib/simConfig";
import { simulatePosition, hasSimulatableMove } from "@/lib/simulate";
import { SimValue } from "@/components/SimValue";

type Status = "open" | "closed";

export type CspFilter = "atrisk" | "rollable" | "hold";

const CSP_FILTERS: { key: CspFilter; label: string; active: string; idle: string; dot: string }[] = [
  {
    key: "atrisk",
    label: "At risk",
    active: "bg-rose-500/25 text-rose-100 ring-rose-500/50",
    idle: "bg-rose-500/10 text-rose-300 ring-rose-500/30 active:bg-rose-500/20",
    dot: "bg-rose-500",
  },
  {
    key: "rollable",
    label: "Rollable",
    active: "bg-amber-500/25 text-amber-100 ring-amber-500/50",
    idle: "bg-amber-500/10 text-amber-300 ring-amber-500/30 active:bg-amber-500/20",
    dot: "bg-amber-500",
  },
  {
    key: "hold",
    label: "Hold",
    active: "bg-sky-500/25 text-sky-100 ring-sky-500/50",
    idle: "bg-surface-2 text-muted ring-border active:bg-surface-2/70",
    dot: "bg-sky-500",
  },
];

export type CspSortKey = "ticker" | "bb" | "dte" | "coll" | "plpct" | "pldollar" | "tostrike" | "yr";
export type LeapSortKey = "ticker" | "dte" | "value" | "plpct" | "pldollar" | "delta";
type SortDir = "asc" | "desc";
type Sort = { key: string; dir: SortDir };
const DEFAULT_DIR: Record<string, SortDir> = {
  ticker: "asc", dte: "asc", coll: "desc", plpct: "desc", pldollar: "desc", tostrike: "asc", yr: "desc",
  bb: "asc",
  value: "desc", delta: "desc",
};
function cspSortVal(o: OptionPosition, key: string): number | string {
  switch (key) {
    case "ticker": return o.symbol;
    case "bb": return o.bbSigma ?? Infinity;
    case "dte": return daysToExpiry(o.expiration);
    case "coll": return cspCollateral(o);
    case "plpct": return optionPnlPct(o);
    case "pldollar": return optionPnl(o);
    case "tostrike": return o.underlyingPrice && o.underlyingPrice > 0 ? (o.underlyingPrice - o.strike) / o.underlyingPrice : Infinity;
    case "yr": return cspRemainingAnnualized(o);
    default: return 0;
  }
}
function leapSortVal(o: OptionPosition, key: string): number | string {
  switch (key) {
    case "ticker": return o.symbol;
    case "dte": return daysToExpiry(o.expiration);
    case "value": return optionMarketValue(o);
    case "plpct": return optionPnlPct(o);
    case "pldollar": return optionPnl(o);
    case "delta": return o.delta;
    default: return 0;
  }
}
function sortBy(items: OptionPosition[], sort: Sort, valFn: (o: OptionPosition, key: string) => number | string): OptionPosition[] {
  return [...items].sort((a, b) => {
    const va = valFn(a, sort.key);
    const vb = valFn(b, sort.key);
    const aMiss = typeof va === "number" && !isFinite(va);
    const bMiss = typeof vb === "number" && !isFinite(vb);
    if (aMiss || bMiss) return aMiss === bMiss ? 0 : aMiss ? 1 : -1; // missing values always last
    const r = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
    return sort.dir === "asc" ? r : -r;
  });
}
const sortCsps = (items: OptionPosition[], sort: Sort) => sortBy(items, sort, cspSortVal);
const sortLeaps = (items: OptionPosition[], sort: Sort) => sortBy(items, sort, leapSortVal);

export function OptionsTypeView({
  type,
  open: rawOpen,
  closedCsps,
  closedLeaps,
  initialCspFilter,
  initialStatus = "open",
  closedMode,
  closedMonths,
}: {
  type: "csp" | "leap";
  open: OptionPosition[];
  closedCsps: ClosedCSP[];
  closedLeaps: ClosedLeap[];
  initialCspFilter?: CspFilter; // deep-link from the home action center
  initialStatus?: Status; // deep-link straight to Open or Closed
  closedMode?: "all" | "ytd" | "months" | "today"; // carry the P&L time window in
  closedMonths?: number;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [cspFilter, setCspFilter] = useState<CspFilter | null>(initialCspFilter ?? null);
  const [cashBucket, setCashBucket] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>(type === "csp" ? { key: "yr", dir: "asc" } : { key: "value", dir: "desc" });
  const onSort = (key: string) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: DEFAULT_DIR[key] ?? "asc" }));
  };

  // After-hours Simulate: re-price every open leg from its underlying's current price.
  // Downstream code below reads `open`, so the whole view (stats + tables) follows.
  const [sim, setSim] = useState(false);
  const [ivSkew] = useIvSkew();
  const canSim = hasSimulatableMove(rawOpen);
  const open = sim && canSim ? rawOpen.map((o) => simulatePosition(o, { ivSkew })) : rawOpen;
  const simToggle =
    rawOpen.length > 0 ? (
      <SimulateControls on={sim && canSim} onToggle={() => setSim((v) => !v)} disabled={!canSim} />
    ) : undefined;

  const noun = type === "csp" ? "CSP" : "LEAP";
  const closedCount = type === "csp" ? closedCsps.length : closedLeaps.length;

  // Classify each open CSP by the same insight engine that labels the cards:
  //   Assignment risk (ITM)  → "atrisk"
  //   Rollable (<30% credit left) → "rollable"
  //   Hold                    → "hold"
  const cspCat = (o: OptionPosition): CspFilter => {
    const lvl = cspInsight(o).level;
    return lvl === "manage" ? "atrisk" : lvl === "roll" ? "rollable" : "hold";
  };
  const cspCounts: Record<CspFilter, number> =
    type === "csp"
      ? open.reduce(
          (acc, o) => {
            acc[cspCat(o)] += 1;
            return acc;
          },
          { atrisk: 0, rollable: 0, hold: 0 } as Record<CspFilter, number>,
        )
      : { atrisk: 0, rollable: 0, hold: 0 };

  // The active filters narrow the whole CSP view — stats and list alike. The chip
  // (At risk/Rollable/Hold) and the cash-plan DTE bucket compose. The bucket uses
  // the same membership as the chart: real-collateral CSPs only.
  const inCashBucket = (o: OptionPosition): boolean =>
    cashBucket == null ||
    (!isCashSettledIndex(o.symbol) &&
      cspCollateral(o) > 0 &&
      cashBucketIndex(Math.max(daysToExpiry(o.expiration), 0)) === cashBucket);
  const effectiveOpen =
    type === "csp" ? open.filter((o) => (cspFilter ? cspCat(o) === cspFilter : true) && inCashBucket(o)) : open;

  const value = effectiveOpen.reduce((s, o) => s + optionMarketValue(o), 0);
  const premium = effectiveOpen.reduce((s, o) => s + optionBasis(o), 0);
  const pnl = effectiveOpen.reduce((s, o) => s + optionPnl(o), 0);
  // Real (pre-sim) counterparts of the shown positions, so the summary cards can read
  // before → after when Simulate is on. Membership matches the current view; the real
  // values come from each position's raw pre-sim mark, matched by id.
  const rawById = new Map(rawOpen.map((o) => [o.id, o]));
  const effReal = effectiveOpen.map((o) => rawById.get(o.id) ?? o);
  const valueReal = effReal.reduce((s, o) => s + optionMarketValue(o), 0);
  const pnlReal = effReal.reduce((s, o) => s + optionPnl(o), 0);

  // CSP collateral cards — mirror the Closed view so Open/Closed read uniformly.
  // All open CSPs are concurrent right now, so committed collateral IS the peak.
  // Opening yield = credit collected ÷ collateral committed. Annualized per the
  // desk convention: (360 ÷ collateral-weighted DTE) × (premium ÷ collateral).
  const collateral =
    type === "csp" ? effectiveOpen.reduce((s, o) => s + (isCashSettledIndex(o.symbol) ? 0 : cspCollateral(o)), 0) : 0;
  const cspOpen = type === "csp" ? effectiveOpen.filter((o) => !isCashSettledIndex(o.symbol)) : [];
  const cspPremiumColl = cspOpen.reduce((s, o) => s + optionBasis(o), 0);
  const openingYield = collateral > 0 ? cspPremiumColl / collateral : 0;
  // Collateral-weighted average DTE: positions tying up more cash, for longer,
  // dominate — the consistent partner to total premium ÷ total collateral.
  const weightedDte = collateral > 0
    ? cspOpen.reduce((s, o) => s + Math.max(daysToExpiry(o.expiration), 0) * cspCollateral(o), 0) / collateral
    : 0;
  const openingAnnualized = weightedDte > 0 ? openingYield * (360 / weightedDte) : 0;

  // Filter bar for the CSP view: At risk · Rollable · Hold. Tapping a chip filters
  // (stats + list); tapping the active one clears back to all.
  const cspFilterBar =
    type !== "csp" ? null : (
      <div className="mt-3 flex gap-1.5">
        {CSP_FILTERS.map((f) => {
          const on = cspFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setCspFilter(on ? null : f.key)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium ring-1 ring-inset transition-colors ${
                on ? f.active : f.idle
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${f.dot}`} />
              {f.label} · {cspCounts[f.key]}
              {on ? <span className="opacity-80">✕</span> : null}
            </button>
          );
        })}
      </div>
    );

  const filterEmptyLabel =
    cspFilter === "atrisk"
      ? "No CSPs at risk of assignment."
      : cspFilter === "rollable"
        ? "No CSPs are rollable yet (all still yield ≥25% annualized on remaining premium)."
        : cspFilter === "hold"
          ? "No CSPs in the hold bucket."
          : "No open CSPs.";

  const groups =
    type === "csp"
      ? [
          {
            title: "Cash-Secured Puts",
            note: "tap a column header to sort",
            items: sortCsps(effectiveOpen, sort),
            variant: "csp" as const,
            action: undefined,
            emptyLabel: filterEmptyLabel,
          },
        ]
      : [
          { title: "LEAP Calls", note: "tap a column header to sort", items: sortLeaps(effectiveOpen.filter((o) => o.kind === "leap-call"), sort), variant: "long" as const, action: undefined, emptyLabel: undefined },
          { title: "Hedges", note: "tap a column header to sort", items: sortLeaps(effectiveOpen.filter((o) => o.kind === "leap-put-hedge"), sort), variant: "long" as const, action: undefined, emptyLabel: undefined },
        ].filter((g) => g.items.length > 0);

  return (
    <div>
      {/* Open | Closed */}
      <div className="mt-4 flex gap-1 rounded-xl border border-border bg-surface p-1">
        {([
          { key: "open" as const, label: `Open · ${open.length}` },
          { key: "closed" as const, label: `Closed · ${closedCount}` },
        ]).map((s) => (
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
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {type === "csp" ? (
                <Stat label="Premium value" value={<Amt>{fmtMoney(premium)}</Amt>} sub="collected" />
              ) : (
                <Stat label="Market value" value={<SimValue oldV={valueReal} newV={value} />} sub={`${effectiveOpen.length} open`} />
              )}
              <Stat label="Gain/Loss" value={<SimValue oldV={pnlReal} newV={pnl} signed />} sub="unrealized" />
              {type === "csp" && (
                <>
                  <Stat label="Collateral" value={<Amt>{fmtMoney(collateral)}</Amt>} sub="committed" />
                  <Stat
                    label="Opening yield"
                    value={fmtPct(openingYield, 1)}
                    tone="pos"
                    sub={`${fmtPct(openingAnnualized, 0)} annualized`}
                  />
                </>
              )}
            </div>
            {type === "csp" && cashBucket != null && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-[12px]">
                <span className="text-sky-200">
                  Cash plan · {CASH_BUCKETS[cashBucket].label} · {effectiveOpen.length} CSP{effectiveOpen.length === 1 ? "" : "s"}
                </span>
                <button onClick={() => setCashBucket(null)} className="font-medium text-sky-300 active:opacity-70">
                  Clear ✕
                </button>
              </div>
            )}
            {cspFilterBar}
            {sim && canSim && (
              <p className="mt-2 px-1 text-[10px] leading-snug text-amber-300/90">
                Projected from the current underlying (after-hours) via Δ/Γ — marks, P/L and yields are estimates, not
                Schwab close values.
              </p>
            )}
            {groups.map((g, gi) => (
              <OpenGroupCard
                key={g.title}
                title={g.title}
                note={g.note}
                items={g.items}
                variant={g.variant}
                action={gi === 0 ? simToggle : g.action}
                emptyLabel={g.emptyLabel}
                sort={sort}
                onSort={onSort}
                realById={rawById}
                sim={sim && canSim}
              />
            ))}
            {type === "csp" && <CspCashPlan csps={open} selected={cashBucket} onSelect={setCashBucket} />}
          </>
        )
      ) : (
        <ClosedOptions csps={closedCsps} leaps={closedLeaps} initialType={type} lockType initialMode={closedMode} initialMonths={closedMonths} />
      )}

      {/* Find new — jumps to the matching Research vehicle */}
      <Link href={`/research?vehicle=${type === "csp" ? "CSP" : "LEAP"}`} className="mt-3 block active:opacity-80">
        <Card className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium">
            Find new {noun} <span className="font-normal text-muted">in Research</span>
          </span>
          <span className="text-muted">›</span>
        </Card>
      </Link>
    </div>
  );
}
