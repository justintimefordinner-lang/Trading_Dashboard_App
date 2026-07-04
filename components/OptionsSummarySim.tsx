"use client";

// Options summary + after-hours Simulate. The Options main page is a Server
// Component, so the toggle and every card it re-prices live here in one client
// island: the two aggregate cards AND the four per-strategy SideCards. When
// simulating, each affected number keeps the real close value (dimmed + struck)
// and shows the projected value with the Δ. Fields that don't move (premium
// received; strategies with no after-hours underlying) render plainly.
import { useState } from "react";
import Link from "next/link";
import { Card, Stat } from "@/components/ui";
import { Donut } from "@/components/charts";
import type { DonutSlice } from "@/components/charts";
import { Amt } from "@/components/privacy";
import { SimulateControls } from "@/components/SimulateControls";
import { useIvSkew } from "@/lib/simConfig";
import { SimValue } from "@/components/SimValue";
import { simulatePosition, hasSimulatableMove } from "@/lib/simulate";
import { cspCollateralTotal, fmtMoney, optionBasis, optionMarketValue, optionPnl, spreadRiskCapital } from "@/lib/calc";
import type { OptionPosition } from "@/lib/types";

// Capital-donut slice colors (match the CSP/LEAP side accents). Kept local so the
// component can build its own allocation when the page doesn't pass one.
const CSP_COLOR = "#38bdf8"; // sky
const LEAP_COLOR = "#a78bfa"; // violet


const ACCENT = {
  csp: "ring-sky-500/25 bg-sky-500/[0.06] group-hover:bg-sky-500/10 group-active:bg-sky-500/20 group-active:ring-sky-500/50",
  leap: "ring-violet-500/25 bg-violet-500/[0.06] group-hover:bg-violet-500/10 group-active:bg-violet-500/20 group-active:ring-violet-500/50",
  covered: "ring-emerald-500/25 bg-emerald-500/[0.06] group-hover:bg-emerald-500/10 group-active:bg-emerald-500/20 group-active:ring-emerald-500/50",
  spread: "ring-amber-500/25 bg-amber-500/[0.06] group-hover:bg-amber-500/10 group-active:bg-amber-500/20 group-active:ring-amber-500/50",
};

function SideCard({
  href,
  label,
  count,
  valueLabel = "Value",
  realValue,
  simValue,
  realPnl,
  simPnl,
  on,
  accent,
}: {
  href: string;
  label: string;
  count: number;
  valueLabel?: string;
  realValue: number;
  simValue: number;
  realPnl: number;
  simPnl: number;
  on: boolean;
  accent: "csp" | "leap" | "covered" | "spread";
}) {
  return (
    <Link href={href} className="group block">
      <div className={`overflow-hidden rounded-2xl ring-1 ring-inset transition-colors ${ACCENT[accent]}`}>
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-sm font-semibold">
            {label} <span className="font-normal text-muted">· {count}</span>
          </span>
          <span className="text-muted">›</span>
        </div>
        <div className="border-t border-border/50 px-4 py-2.5">
          <div className="text-[11px] text-muted">{valueLabel}</div>
          <div className="tabular text-base font-semibold">
            <SimValue oldV={realValue} newV={on ? simValue : realValue} />
          </div>
        </div>
        <div className="border-t border-border/50 px-4 py-2.5">
          <div className="text-[11px] text-muted">Gain/Loss</div>
          <div className="tabular text-base font-semibold">
            <SimValue oldV={realPnl} newV={on ? simPnl : realPnl} signed />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function OptionsSummarySim({
  options = [],
  allocation: allocationProp,
  stratTotal: stratTotalProp,
}: {
  options?: OptionPosition[];
  allocation?: DonutSlice[];
  stratTotal?: number;
}) {
  const [sim, setSim] = useState(false);
  const [ivSkew] = useIvSkew();
  const canSim = hasSimulatableMove(options);
  const on = sim && canSim;

  const sum = (arr: OptionPosition[], f: (o: OptionPosition) => number) => arr.reduce((s, o) => s + f(o), 0);
  const simOf = (arr: OptionPosition[]) => (on ? arr.map((o) => simulatePosition(o, { ivSkew })) : arr);
  const card = (arr: OptionPosition[], valueFn: (o: OptionPosition) => number) => {
    const s = simOf(arr);
    return { realValue: sum(arr, valueFn), simValue: sum(s, valueFn), realPnl: sum(arr, optionPnl), simPnl: sum(s, optionPnl) };
  };

  const csps = options.filter((o) => o.kind === "csp");
  const leaps = options.filter((o) => o.kind === "leap-call" || o.kind === "leap-put-hedge");
  const covered = options.filter((o) => o.kind === "covered-call");
  const spreads = options.filter((o) => o.kind === "put-spread" || o.kind === "call-spread");

  // Capital-allocation donut. Use the props when passed, but when an out-of-sync page
  // omits them, derive both from `options` so the summary is self-sufficient and can't
  // crash on missing props. (Slice sum = the donut's capital total.)
  const allocation: DonutSlice[] =
    allocationProp ?? [
      { label: "CSPs", value: cspCollateralTotal(csps), color: CSP_COLOR },
      { label: "LEAPs", value: sum(leaps, optionMarketValue), color: LEAP_COLOR },
    ];
  const stratTotal = stratTotalProp ?? allocation.reduce((s, a) => s + a.value, 0);

  const allSim = simOf(options);
  // "Market value" of the options book, by strategy:
  //   CSPs    → cash collateral + the CSP's P/L
  //   LEAPs   → market value (they're long assets)
  //   Covered → just the short call's P/L (the shares sit in equities, valued there)
  //   Spreads → defined-risk capital + the spread's P/L
  // Collateral and defined risk are strike/entry-based, so they're static under Simulate;
  // only the P/L and LEAP-mark terms move — which means a short losing value lifts this.
  const structuredValue = (arr: OptionPosition[]) =>
    cspCollateralTotal(arr) +
    sum(arr.filter((o) => o.kind === "csp"), optionPnl) +
    sum(arr.filter((o) => o.kind === "leap-call" || o.kind === "leap-put-hedge"), optionMarketValue) +
    sum(arr.filter((o) => o.kind === "covered-call"), optionPnl) +
    spreadRiskCapital(arr) +
    sum(arr.filter((o) => o.kind === "put-spread" || o.kind === "call-spread"), optionPnl);
  const realValue = structuredValue(options);
  const simValue = structuredValue(allSim);
  const realPnl = sum(options, optionPnl);
  const simPnl = sum(allSim, optionPnl);

  const cspC = card(csps, optionBasis);
  const leapC = card(leaps, optionMarketValue);
  const covC = card(covered, optionBasis);
  const sprC = card(spreads, optionMarketValue);

  return (
    <>
      {/* Capital wheel with the Simulate toggle overlaid in the top-right corner
          (matches the home hero). The toggle drives every re-priced number below. */}
      {options.length > 0 && (
        <Card className="relative mt-4 px-4 py-4">
          <div className="absolute right-3 top-3 z-10">
            <SimulateControls on={on} onToggle={() => setSim((v) => !v)} disabled={!canSim} />
          </div>
          <div className="flex items-center gap-4">
            <Donut slices={allocation} centerTop={<Amt>{fmtMoney(stratTotal)}</Amt>} centerBottom="capital" />
            <ul className="flex-1 space-y-3">
              {allocation.map((s) => {
                const pct = stratTotal > 0 ? s.value / stratTotal : 0;
                return (
                  <li key={s.label}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                        {s.label}
                      </span>
                      <span className="tabular font-semibold">{Math.round(pct * 100)}%</span>
                    </div>
                    <div className="tabular mt-0.5 pl-[18px] text-[11px] text-muted">
                      <Amt>{fmtMoney(s.value)}</Amt>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="mt-3 border-t border-border pt-2 text-[11px] leading-relaxed text-muted">
            Share of capital deployed by strategy — CSP collateral (cash-secured) vs current LEAP market value.
          </p>
        </Card>
      )}

      {/* All options */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Stat
          label="Market value"
          value={<SimValue oldV={realValue} newV={on ? simValue : realValue} />}
          sub={on ? "after-hours est." : "all options"}
        />
        <Stat
          label="Gain/Loss"
          value={<SimValue oldV={realPnl} newV={on ? simPnl : realPnl} signed />}
          sub={on ? "after-hours est." : "unrealized"}
        />
      </div>

      {/* Per-strategy summary cards — tap to drill in */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SideCard href="/options/csp" label="CSPs" count={csps.length} valueLabel="Premium received" {...cspC} on={on} accent="csp" />
        <SideCard href="/options/leap" label="LEAPs" count={leaps.length} {...leapC} on={on} accent="leap" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <SideCard href="/options/covered" label="Covered" count={covered.length} valueLabel="Premium received" {...covC} on={on} accent="covered" />
        <SideCard href="/options/spread" label="Spreads" count={spreads.length} valueLabel="Net value" {...sprC} on={on} accent="spread" />
      </div>
    </>
  );
}
