"use client";

// The VIX page's allocation cards: the framework target band (Cash / Invested) with
// a "now X%" bubble showing where the portfolio actually sits. Client-side so the
// "now" figure honors the same margin-aware toggle as the PortfolioFit card below.
import { Stat } from "@/components/ui";
import { useMarginMode } from "@/components/margin-mode";
import { computeFit } from "@/lib/fit";
import type { VixAssessment } from "@/lib/vix";

export function PostureStats({
  a,
  cash,
  totalValue,
  cspCollateral,
  spreadRisk,
  optionsBuyingPower,
}: {
  a: VixAssessment;
  cash: number;
  totalValue: number;
  cspCollateral: number;
  spreadRisk: number;
  optionsBuyingPower: number;
}) {
  const { marginAware } = useMarginMode();
  const fit = computeFit({ cash, totalValue, cspCollateral, spreadRisk, optionsBuyingPower }, marginAware);
  return (
    <>
      <Stat
        label="Cash target"
        value={a.cashRange}
        sub="framework band"
        pct={`now ${Math.round(fit.reserve * 100)}%`}
      />
      <Stat
        label="Invested target"
        value={a.investedRange}
        sub="framework band"
        pct={`now ${Math.round(fit.deployed * 100)}%`}
      />
    </>
  );
}
