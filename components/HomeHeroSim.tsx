"use client";

// Home hero — Total value with an after-hours Simulate toggle overlaid top-right.
// The home page is a Server Component, so the toggle + re-priced value live here in a
// client island. Simulating re-prices the options book from the underlying's after-hours
// move (Δ/Γ, via simulatePosition) and holds equities/cash/crypto at their close — the
// same scope as the options-page Simulate, since only options carry a close/live
// reference. The projected total keeps the real value struck through, shows the estimate
// and the Δ. During regular hours (nothing to project) the toggle is disabled.
import { useState } from "react";
import { Card, Delta } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import { SimulateControls } from "@/components/SimulateControls";
import { useIvSkew } from "@/lib/simConfig";
import { SimValue } from "@/components/SimValue";
import { simulatePosition, hasSimulatableMove } from "@/lib/simulate";
import { optionNetValue } from "@/lib/calc";
import type { OptionPosition, ValuePoint } from "@/lib/types";

export function HomeHeroSim({
  totalValue,
  options,
  valueHistory,
  trailingDelta,
  trendPct,
}: {
  totalValue: number;
  options: OptionPosition[];
  valueHistory: ValuePoint[];
  trailingDelta: number;
  trendPct: number;
}) {
  const [sim, setSim] = useState(false);
  const [ivSkew] = useIvSkew();
  const canSim = hasSimulatableMove(options);
  const on = sim && canSim;

  // Change to total value from re-pricing the options book after-hours: sum of each
  // position's net-value move (long +, short −), so a short losing value lifts the total.
  const optionsDelta = on
    ? options.reduce((s, o) => s + (optionNetValue(simulatePosition(o, { ivSkew })) - optionNetValue(o)), 0)
    : 0;
  const simTotal = totalValue + optionsDelta;

  return (
    <Card className="relative mt-4 overflow-hidden">
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted">Total value</div>
          <SimulateControls on={on} onToggle={() => setSim((v) => !v)} disabled={!canSim} />
        </div>
        <div className="tabular mt-1.5 text-3xl font-bold">
          <SimValue oldV={totalValue} newV={on ? simTotal : totalValue} />
        </div>
        <div className="mt-1 text-sm">
          {on ? (
            <span className="text-xs text-amber-300/90">after-hours estimate · options re-priced (Δ/Γ)</span>
          ) : (
            <>
              <Delta value={trailingDelta} pct={trendPct} />
              <span className="ml-1 text-xs text-muted">trailing (illustrative)</span>
            </>
          )}
        </div>
      </div>
      <div className="mt-2">
        <Sparkline data={valueHistory} positive={trendPct >= 0} />
      </div>
    </Card>
  );
}
