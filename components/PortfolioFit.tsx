"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { useMarginMode } from "@/components/margin-mode";
import { REGIME_COLORS, type VixAssessment } from "@/lib/vix";
import { fmtMoney } from "@/lib/calc";
import { computeFit } from "@/lib/fit";

// The "Your portfolio fit" card. Reserve vs deployment for the VIX framework.
// A toggle at the bottom switches the reserve base between liquidity-only and
// liquidity + options buying power (for margin accounts). Shared by the VIX page
// and the home dashboard so both stay in sync via the persisted toggle.
export function PortfolioFit({
  a,
  cash,
  totalValue,
  cspCollateral,
  spreadRisk,
  optionsBuyingPower,
  bare = false,
}: {
  a: VixAssessment;
  cash: number;
  totalValue: number;
  cspCollateral: number;
  spreadRisk: number;
  optionsBuyingPower: number;
  // When true, render just the inner content (no Card wrapper) so a caller can
  // nest it inside a larger card — e.g. grouped with the VIX chip on the home page.
  bare?: boolean;
}) {
  const { marginAware, setMarginAware } = useMarginMode();
  const tone = REGIME_COLORS[a.regime];
  const fit = computeFit({ cash, totalValue, cspCollateral, spreadRisk, optionsBuyingPower }, marginAware);

  const share = (n: number) => (fit.base > 0 ? Math.round((n / fit.base) * 100) : 0);
  const reserveGap = fit.reserve - a.targetReservePct; // + = more dry powder than target
  const fitVerdict =
    Math.abs(reserveGap) < 0.03
      ? "Your reserve is roughly in line with the regime's target."
      : reserveGap > 0
        ? "You're holding more reserve than the regime targets — dry powder available if the edge supports deploying."
        : "You're holding less reserve than the regime targets — lean cautious about adding risk until the buffer rebuilds.";

  const inner = (
    <>
      <div className="mb-1 flex justify-between text-[11px] text-muted">
        <span>Deployed {Math.round(fit.deployed * 100)}% · reserve {Math.round(fit.reserve * 100)}%</span>
        <span className="tabular">Target {a.investedRange} allocated</span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`absolute inset-y-0 left-0 ${tone.bar}`} style={{ width: `${Math.min(100, fit.deployed * 100)}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${Math.min(100, a.targetDeployedPct * 100)}%` }} title="target" />
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">{fitVerdict}</p>

      <dl className="mt-2 space-y-1 border-t border-border pt-2 text-[11px]">
        <FitRow k="Uncommitted cash" v={<>{fmtMoney(fit.uncommitted)} <span className="text-muted">({share(fit.uncommitted)}%)</span></>} />
        {marginAware && fit.optionsBuyingPower > 0 && (
          <FitRow k="+ Options buying power" v={<>{fmtMoney(fit.optionsBuyingPower)} <span className="text-muted">({share(fit.optionsBuyingPower)}%)</span></>} />
        )}
        {!marginAware && (
          <FitRow k="Reserve" v={<>{fmtMoney(fit.dryPowder)} <span className="text-muted">({Math.round(fit.reserve * 100)}%)</span></>} />
        )}
        {!bare && <FitRow k="Total account value" v={fmtMoney(fit.base)} />}
      </dl>

      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMarginAware(!marginAware);
        }}
        className="mt-3 flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-[11px] active:bg-surface-2"
      >
        <span className="text-muted">
          Reserve base
          <span className="block text-[10px] text-muted/80">tap to {marginAware ? "exclude" : "include"} options buying power</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${marginAware ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : "bg-surface-2 text-muted ring-border"}`}>
          {marginAware ? "Liquidity + options BP" : "Liquidity only"}
        </span>
      </button>
    </>
  );

  return bare ? inner : <Card className="px-4 py-3">{inner}</Card>;
}

function FitRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="tabular text-right font-medium">{v}</dd>
    </div>
  );
}
