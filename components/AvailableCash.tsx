"use client";

import { useMarginMode } from "@/components/margin-mode";
import { computeFit } from "@/lib/fit";
import { fmtMoney } from "@/lib/calc";

// The "Available: X%, Raise $Y" line under the VIX chip. Driven by computeFit so
// it tracks the Liquidity-only / Liquidity + Options BP toggle: in margin mode the
// options buying power counts as available funds (raising Available, shrinking Raise).
export function AvailableCash({
  uncommitted,
  totalValue,
  optionsBuyingPower,
  targetLow,
  targetHigh,
}: {
  uncommitted: number; // free cash (calc.freeCashValue)
  totalValue: number;
  optionsBuyingPower: number;
  targetLow: number; // cash band low, e.g. 0.20
  targetHigh: number; // cash band high, e.g. 0.25
}) {
  const { marginAware } = useMarginMode();
  const fit = computeFit({ uncommitted, totalValue, optionsBuyingPower }, marginAware);
  const raise = Math.max(0, targetLow * fit.base - fit.dryPowder); // to reach the band floor
  const deploy = Math.max(0, fit.dryPowder - targetHigh * fit.base); // excess over the band top

  return (
    <div className="text-[11px] text-muted">
      Available: {(fit.reserve * 100).toFixed(1)}%
      {raise > 0 && (
        <>
          , <span className="font-medium text-amber-300">Raise {fmtMoney(raise)}</span>
        </>
      )}
      {raise === 0 && deploy > 0 && (
        <>
          , <span className="font-medium text-emerald-300">Deploy {fmtMoney(deploy)}</span>
        </>
      )}
      {raise === 0 && deploy === 0 && <> · in range</>}
    </div>
  );
}
