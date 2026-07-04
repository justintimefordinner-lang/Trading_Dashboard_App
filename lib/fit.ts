// Shared "portfolio fit" math for the VIX framework, used by the home card and
// the VIX page so they always agree.
//
// Reserve = dry powder ÷ base.
//   • Liquidity-only (marginAware = false): dry powder is uncommitted cash, base
//     is total account value.
//   • Margin-aware (marginAware = true): add options buying power to the dry
//     powder (it's real deployable capacity), but the base stays the total
//     account value — the VIX target is a share of the account, so OBP must not
//     dilute the denominator.

export interface FitInputs {
  cash: number;
  totalValue: number;
  cspCollateral: number;
  spreadRisk: number;
  optionsBuyingPower: number;
}

export interface FitResult {
  uncommitted: number; // free cash (cash − CSP collateral − spread risk)
  optionsBuyingPower: number; // OBP actually counted (0 when liquidity-only)
  dryPowder: number; // reserve numerator
  base: number; // reserve denominator
  reserve: number; // 0..1
  deployed: number; // 0..1
  committed: number; // CSP collateral + spread risk
}

export function computeFit(i: FitInputs, marginAware: boolean): FitResult {
  const committed = i.cspCollateral + i.spreadRisk;
  const uncommitted = Math.max(0, i.cash - committed);
  const obp = marginAware ? Math.max(0, i.optionsBuyingPower || 0) : 0;
  const dryPowder = uncommitted + obp;
  const base = i.totalValue; // account value; OBP lifts dry powder, not the base
  const reserve = base > 0 ? Math.min(1, dryPowder / base) : 1;
  return {
    uncommitted,
    optionsBuyingPower: obp,
    dryPowder,
    base,
    reserve,
    deployed: 1 - reserve,
    committed,
  };
}
