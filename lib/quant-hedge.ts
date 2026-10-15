// The portfolio hedge (backtested 2026-10-14/15, QuantConnect runs 125 and 133):
// SMH puts ~10% below spot, 6–12 months out (the pick lands on ~9), notional half
// of committed capital, bought when the account is within 5% of its high with the
// VIX under 20 and at least a quarter of the account committed; held; the lot is
// sold at 2.5× its cost or inside 60 days of expiry; nothing is rebought until the
// next new high. Over 2022–Aug 2026 it took the rule from 46.9% to 47.6% a year,
// the worst drawdown from 35.8% to 31.1% and the 2022 loss from 9.4% to 2.7%, for
// about 1.3% of account value a year net. The trader runs the same rule (its
// suggest.py H dict); this is the read-only view of it for the selected account.
import type { AccountData } from "./types";
import { capitalCommitted } from "./quant";

export const HEDGE = {
  sym: "SMH",
  frac: 0.5, // of committed capital
  otm: 0.1, // strike below spot
  tp: 2.5, // sell at this multiple of cost
  vixMax: 20,
  minInvested: 0.25,
  band: 0.05, // "near the high": within this of the high-water mark
  dteLo: 180,
  dteHi: 365,
  closeDte: 60,
} as const;

export interface HedgePut {
  exp: string;
  dte: number;
  strike: number;
  bid: number;
  ask: number;
  mark: number;
  delta: number | null;
  oi?: number;
  belowSpotPct?: number | null;
}
export interface HedgeChain {
  sym: string;
  price: number;
  puts: HedgePut[];
}

export interface HedgeLot {
  strike: number;
  expiration: string;
  qty: number;
  entry: number;
  mark: number;
  ratio: number; // mark ÷ entry
  dte: number;
  exit: "take profit" | "expiry" | null;
}

export interface HedgePick {
  strike: number;
  exp: string;
  dte: number;
  ask: number;
  contracts: number;
  cost: number;
  notional: number;
}

export interface HedgeStatus {
  sym: string;
  totalValue: number;
  high: number; // high-water mark: the best of the value history and today
  dd: number; // (today − high) ÷ high, ≤ 0
  nearHigh: boolean;
  vix: number | null;
  committed: number; // capital committed, the hedge itself excluded
  invested: number; // committed ÷ total value
  target: number; // notional the rule wants on
  live: number; // notional already on (lots outside the close window)
  lots: HedgeLot[];
  wanted: boolean; // the trigger holds right now
  blockers: string[]; // why not, in words
  pick: HedgePick | null; // what to buy, when wanted and the chain has it
}

function dte(exp: string, today: Date): number {
  const t = new Date(exp + "T00:00:00Z").getTime();
  return Math.round((t - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);
}

/** The hedge's standalone long puts on the hedge symbol (a spread's long leg is not a hedge). */
export function hedgeLots(data: AccountData, today = new Date()): HedgeLot[] {
  return data.options
    .filter((o) => o.symbol === HEDGE.sym && o.optionType === "put" && o.side === "long" && (o.kind === "leap-put-hedge" || o.kind === "other"))
    .map((o) => {
      const entry = o.entryPerShare ?? 0;
      const ratio = entry > 0 ? o.mark / entry : 0;
      const d = dte(o.expiration, today);
      const exit: HedgeLot["exit"] = entry > 0 && ratio >= HEDGE.tp ? "take profit" : d >= 0 && d <= HEDGE.closeDte ? "expiry" : null;
      return { strike: o.strike, expiration: o.expiration, qty: o.qty, entry, mark: o.mark, ratio, dte: d, exit };
    });
}

/** Where the rule stands for this account, and what it would buy. `freeCash` caps the purchase. */
export function hedgeStatus(data: AccountData, chain: HedgeChain | null, vix: number | null, freeCash: number, today = new Date()): HedgeStatus {
  const totalValue = data.summary.totalValue;
  const high = Math.max(totalValue, ...data.valueHistory.map((p) => p.value).filter((v) => Number.isFinite(v)));
  const dd = high > 0 ? (totalValue - high) / high : 0;
  const lots = hedgeLots(data, today);
  const hedgeValue = lots.reduce((s, l) => s + l.mark * 100 * l.qty, 0);
  const committed = Math.max(0, capitalCommitted(data.options, data.equities) - hedgeValue);
  const invested = totalValue > 0 ? committed / totalValue : 0;
  const nearHigh = dd >= -HEDGE.band;
  const blockers: string[] = [];
  if (!nearHigh) blockers.push(`${(-dd * 100).toFixed(1)}% under its high — the rule waits for the next new high`);
  if (vix == null) blockers.push("no VIX reading");
  else if (vix >= HEDGE.vixMax) blockers.push(`VIX ${vix.toFixed(1)} is not under ${HEDGE.vixMax}`);
  if (invested < HEDGE.minInvested) blockers.push(`${Math.round(invested * 100)}% invested, under the ${Math.round(HEDGE.minInvested * 100)}% floor`);
  const spot = chain?.price ?? 0;
  const live = spot > 0 ? lots.filter((l) => l.dte > HEDGE.closeDte).reduce((s, l) => s + l.qty, 0) * 100 * spot : 0;
  const target = HEDGE.frac * committed;
  const wanted = blockers.length === 0;
  let pick: HedgePick | null = null;
  if (wanted && chain && spot > 0) {
    const puts = chain.puts.filter((p) => p.ask > 0 && dte(p.exp, today) >= HEDGE.dteLo && dte(p.exp, today) <= HEDGE.dteHi);
    const want = spot * (1 - HEDGE.otm);
    const mid = (HEDGE.dteLo + HEDGE.dteHi) / 2;
    const best = puts.slice().sort((a, b) => Math.abs(a.strike - want) - Math.abs(b.strike - want) || Math.abs(dte(a.exp, today) - mid) - Math.abs(dte(b.exp, today) - mid))[0];
    let n = Math.floor((target - live) / (100 * spot));
    if (best && n >= 1) {
      if (best.ask * 100 * n > Math.max(0, freeCash)) n = Math.floor(Math.max(0, freeCash) / (best.ask * 100));
      if (n >= 1) pick = { strike: best.strike, exp: best.exp, dte: dte(best.exp, today), ask: best.ask, contracts: n, cost: best.ask * 100 * n, notional: n * 100 * spot };
    }
    if (!pick && n < 1 && live > 0) blockers.push("already covered to the half");
    if (!pick && !best) blockers.push(`no ${HEDGE.sym} put ${HEDGE.dteLo}–${HEDGE.dteHi} days out in the scan`);
  } else if (wanted && !chain) {
    blockers.push(`the scan has no ${HEDGE.sym} chain yet — run a scan`);
  }
  return { sym: HEDGE.sym, totalValue, high, dd, nearHigh, vix, committed, invested, target, live, lots, wanted, blockers, pick };
}
