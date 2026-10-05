// Out-of-reach picks on the Quant scan: names that pay the target but need more
// collateral than the account has room for, and the cheapest way to fund each —
// which open puts to close, and whether the swap pays. Pure; display only.
//
// Puts to close are the ones with the least left to earn on their collateral:
// winners only (the backtest's roll test never closed a loser), lowest remaining
// yield per 30 days first. Closing a put gives up its remaining premium (its
// mark) and frees its collateral. The swap "pays" when the new put's yield beats
// what the closed puts still had to earn by at least SWAP_EDGE.
//
// Caution carried on the page: the backtest's early-roll rule (close winners to
// redeploy) added premium but no return, so this is information, not a rule.
import type { AccountData, OptionPosition } from "./types";
import { capturedPct, daysToExpiry } from "./calc";
import { capitalCommitted, type QuantCapacity, type QuantRow } from "./quant";

export const SWAP_EDGE = 1.0; // points of yield per 30 days the new put must beat the closed ones by

export interface SwapLeg {
  symbol: string;
  strike: number;
  expiration: string;
  contracts: number;
  capturedPct: number; // 0–1
  dte: number;
  yield30: number; // % of collateral per 30 days still to earn
  collateral: number; // $ freed (strike × 100 × contracts)
  buyback: number; // $ to close at the mark
}

export interface SwapPlan {
  sym: string;
  need: number; // $ one contract needs
  shortBy: number; // $ beyond the room
  blocked: "cap" | null; // over the per-name cap: no swap can help
  legs: SwapLeg[];
  freed: number; // $ collateral freed, net of buybacks
  enough: boolean; // the legs free enough for one contract
  give30: number; // $ per 30 days the closed puts still had to earn
  gain30: number; // $ per 30 days the new put pays
  closedYield30: number; // % per 30 days, weighted, of what is closed
  pays: boolean;
}

function remainingYield30(o: OptionPosition, dte: number): number {
  return o.strike > 0 ? (o.mark / o.strike) * (30 / Math.max(1, dte)) * 100 : 0;
}

/** The funding plan for one out-of-reach pick (one contract). */
export function swapPlan(
  row: QuantRow,
  data: AccountData,
  cap: QuantCapacity,
  sizing: { maxPerTicker: number; tickerBand: number },
): SwapPlan | null {
  const pick = row.pick;
  if (!pick || pick.collateral <= cap.room) return null;
  const sym = row.sym.toUpperCase();
  const need = pick.collateral;
  const shortBy = need - cap.room;
  const gain30 = (pick.yield30 / 100) * need;
  const base = { sym, need, shortBy, legs: [] as SwapLeg[], freed: 0, enough: false, give30: 0, gain30, closedYield30: 0, pays: false };

  // Over the per-name cap (stretch included): freeing cash elsewhere doesn't help.
  const committed = capitalCommitted(
    data.options.filter((o) => o.symbol === sym),
    data.equities.filter((e) => e.symbol === sym),
  );
  if ((sizing.maxPerTicker + sizing.tickerBand) * cap.buyingPower - committed < need) return { ...base, blocked: "cap" };

  const candidates = data.options
    .filter((o) => o.kind === "csp" && o.side === "short" && o.symbol !== sym && o.qty > 0)
    .map((o) => ({ o, dte: daysToExpiry(o.expiration), captured: capturedPct(o) }))
    .filter((c) => c.dte > 0 && c.captured > 0) // winners only
    .map((c) => ({ ...c, y: remainingYield30(c.o, c.dte) }))
    .sort((a, b) => a.y - b.y || b.captured - a.captured);

  const legs: SwapLeg[] = [];
  let freed = 0;
  for (const c of candidates) {
    if (freed >= shortBy) break;
    const perContract = c.o.strike * 100 - c.o.mark * 100; // collateral released, less the buyback
    if (perContract <= 0) continue;
    const k = Math.min(c.o.qty, Math.ceil((shortBy - freed) / perContract));
    legs.push({
      symbol: c.o.symbol,
      strike: c.o.strike,
      expiration: c.o.expiration,
      contracts: k,
      capturedPct: c.captured,
      dte: c.dte,
      yield30: c.y,
      collateral: c.o.strike * 100 * k,
      buyback: c.o.mark * 100 * k,
    });
    freed += perContract * k;
  }
  const closedCollateral = legs.reduce((s, l) => s + l.collateral, 0);
  const give30 = legs.reduce((s, l) => s + (l.yield30 / 100) * l.collateral, 0);
  const closedYield30 = closedCollateral > 0 ? (give30 / closedCollateral) * 100 : 0;
  const enough = freed >= shortBy;
  return {
    ...base,
    blocked: null,
    legs,
    freed,
    enough,
    give30,
    closedYield30,
    pays: enough && pick.yield30 >= closedYield30 + SWAP_EDGE && gain30 > give30,
  };
}
