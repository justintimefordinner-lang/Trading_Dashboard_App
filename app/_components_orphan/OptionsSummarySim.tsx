"use client";

// Options summary + after-hours Simulate. The Options main page is a Server
// Component, so the toggle and every card it re-prices live here in one client
// island: the two aggregate cards AND the four per-strategy SideCards. When
// simulating, each affected number keeps the real close value (dimmed + struck)
// and shows the projected value with the Δ. Fields that don't move (premium
// received; strategies with no after-hours underlying) render plainly.
import { useState } from "react";
import Link from "next/link";
import { Stat } from "@/components/ui";
import { SimulateToggle } from "@/components/SimulateToggle";
import { SimValue } from "@/components/SimValue";
import { simulatePosition, hasSimulatableMove } from "@/lib/simulate";
import { optionBasis, optionMarketValue, optionNetValue, optionPnl } from "@/lib/calc";
import type { OptionPosition } from "@/lib/types";


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

export function OptionsSummarySim({ options }: { options: OptionPosition[] }) {
  const [sim, setSim] = useState(false);
  const canSim = hasSimulatableMove(options);
  const on = sim && canSim;

  const sum = (arr: OptionPosition[], f: (o: OptionPosition) => number) => arr.reduce((s, o) => s + f(o), 0);
  const simOf = (arr: OptionPosition[]) => (on ? arr.map(simulatePosition) : arr);
  const card = (arr: OptionPosition[], valueFn: (o: OptionPosition) => number) => {
    const s = simOf(arr);
    return { realValue: sum(arr, valueFn), simValue: sum(s, valueFn), realPnl: sum(arr, optionPnl), simPnl: sum(s, optionPnl) };
  };

  const csps = options.filter((o) => o.kind === "csp");
  const leaps = options.filter((o) => o.kind === "leap-call" || o.kind === "leap-put-hedge");
  const covered = options.filter((o) => o.kind === "covered-call");
  const spreads = options.filter((o) => o.kind === "put-spread" || o.kind === "call-spread");

  const allSim = simOf(options);
  // Net options value: longs are assets (+), shorts are liabilities (−). This makes a
  // drop in a short you sold read as a gain, not a loss — and its Δ tracks P/L.
  const realValue = sum(options, optionNetValue);
  const simValue = sum(allSim, optionNetValue);
  const realPnl = sum(options, optionPnl);
  const simPnl = sum(allSim, optionPnl);

  const cspC = card(csps, optionBasis);
  const leapC = card(leaps, optionMarketValue);
  const covC = card(covered, optionBasis);
  const sprC = card(spreads, optionMarketValue);

  return (
    <>
      <div className="mt-4 flex items-center justify-end gap-2">
        {on && <span className="text-[10px] text-amber-300/90">after-hours estimate · Δ/Γ</span>}
        <SimulateToggle on={on} onToggle={() => setSim((v) => !v)} disabled={!canSim} />
      </div>

      {/* All options */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Stat
          label="Market value"
          value={<SimValue oldV={realValue} newV={on ? simValue : realValue} />}
          sub={on ? "after-hours est." : "net · all options"}
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
