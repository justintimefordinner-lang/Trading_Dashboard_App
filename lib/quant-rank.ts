// The Auto Trader's ranking of scan picks (Portfolio_Trader suggest.rank()),
// so the Quant pages list names in the order the trader hands out capital.
// Pure. Every pick already pays the target; the score says how good a trade it is:
//   liquidity 40% — bid/ask spread as a share of the mid (0% best, 30%+ worst), plus open interest
//   cushion   35% — the delta it takes to reach the target (0.10 best, the 0.35 cap worst)
//   vrp       25% — the Brief's implied ÷ realized volatility (0.9 worst, 1.3 best; unknown = middle)
// Names with a report inside the put's life queue after those without one.
// Backtested over 2022–Aug 2026: matches the recommended allocation (47.1% vs 46.9% a year).
import type { QuantContract, QuantRow } from "./quant";

const unit = (x: number) => Math.max(0, Math.min(1, x));

export interface QuantRank {
  score: number; // 0–100
  spreadPct: number | null;
  vrpRatio: number | null;
  perRound: number; // contracts the trader hands this name per round
}

export function rankPick(pick: QuantContract, vrpRatio: number | null | undefined): QuantRank {
  const sp = pick.spreadPct;
  const spread = sp != null ? unit(1 - sp / 30) : 0.5;
  const liquidity = 0.75 * spread + 0.25 * unit((pick.oi || 0) / 500);
  const cushion = unit((0.35 - Math.abs(pick.delta)) / 0.25);
  const vrp = vrpRatio ? unit((vrpRatio - 0.9) / 0.4) : 0.5;
  const score = Math.round(1000 * (0.4 * liquidity + 0.35 * cushion + 0.25 * vrp)) / 10;
  return { score, spreadPct: sp, vrpRatio: vrpRatio ?? null, perRound: score >= 80 ? 3 : score >= 65 ? 2 : 1 };
}

/** Sort scan rows the trader's way: no earnings in the put's life first, then score, yield, symbol. */
export function byTraderRank(vrp: (sym: string) => number | null | undefined) {
  const cache = new Map<string, number>();
  const score = (r: QuantRow) => {
    if (!cache.has(r.sym)) cache.set(r.sym, r.pick ? rankPick(r.pick, vrp(r.sym)).score : -1);
    return cache.get(r.sym)!;
  };
  return (a: QuantRow, b: QuantRow) =>
    Number(a.erInWindow) - Number(b.erInWindow) ||
    score(b) - score(a) ||
    (b.pick?.yield30 ?? 0) - (a.pick?.yield30 ?? 0) ||
    a.sym.localeCompare(b.sym);
}
