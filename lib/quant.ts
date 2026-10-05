// Quant CSP scan: the wheel study's put-selection rule, read from the bridge's
// data/quant-scan.json and sized against the selected account here.
//
// The rule (from the 2022–2026 backtests, confirmed on the 2023 hold-out): sell
// the LOWEST-delta put paying at least 4% of the strike per 30 days, never above
// 0.35 delta, in the expiration closest to 35 days (28–42); close at 50% of the credit.
// The bridge applies that to every approved name (market data only). What a pick
// means for THIS account — how many contracts fit, whether the name is already at
// its full size — depends on which account is selected, so that part lives here.
import fs from "node:fs";
import path from "node:path";
import type { AccountData } from "./types";
import { cspCollateralTotal, freeCashValue, optionMarketValue, spreadRiskCapital } from "./calc";
import type { Equity, OptionPosition } from "./types";

/** Capital a set of positions ties up, the way the rest of the app counts it:
 *  CSPs at their collateral, spreads at their defined risk (not the short leg's
 *  strike), long calls and hedges at market value, shares at value, covered
 *  calls nothing (the shares carry them). Filter by symbol first for one name. */
export function capitalCommitted(options: OptionPosition[], equities: Equity[]): number {
  const longs = options.filter((o) => o.side === "long" && (o.kind === "leap-call" || o.kind === "leap-put-hedge" || o.kind === "other"));
  return (
    cspCollateralTotal(options) +
    spreadRiskCapital(options) +
    longs.reduce((s, o) => s + optionMarketValue(o), 0) +
    equities.reduce((s, e) => s + e.qty * e.price, 0)
  );
}
import { EXAMPLE_CLOSES, EXAMPLE_EARNINGS, lastClose } from "./example-market";

export interface QuantContract {
  exp: string;
  dte: number;
  strike: number;
  bid: number;
  ask: number;
  mark: number;
  delta: number;
  yield30: number; // % of strike per 30 days, at the mid
  annPct: number;
  premium: number; // $ per contract at the mid
  collateral: number;
  oi: number;
  volume: number;
  spreadPct: number | null;
  iv: number | null;
  belowSpotPct: number | null;
}

export interface QuantRow {
  sym: string;
  price: number | null;
  pick: QuantContract | null; // the contract the rule would sell
  best: QuantContract | null; // richest contract under the delta cap (the closest miss)
  reason: "ok" | "low" | "no_puts" | "no_chain" | string;
  erDate: string | null;
  erDays: number | null;
  erInWindow: boolean;
}

export interface QuantScan {
  meta: {
    asOf: string;
    marketOpen: boolean | null;
    universe: number;
    qualifying: number;
    params: { targetYield: number; yieldDays: number; maxDelta: number; expMin: number; expMax: number; expTarget?: number; closeAtPct: number; maxPerTicker: number; tickerBand: number };
    source: string;
    elapsedSec?: number;
  };
  rows: QuantRow[];
}

export const QUANT_PATH = path.join(process.cwd(), "data", "quant-scan.json");

export function getQuantScan(example = false): QuantScan | null {
  if (example) return exampleQuantScan();
  try {
    return JSON.parse(fs.readFileSync(QUANT_PATH, "utf8")) as QuantScan;
  } catch {
    return null;
  }
}

// ---- sizing against the selected account ----------------------------------------
// Mirrors the backtest's sell_put(): buying power = total value × (1 + margin),
// margin set from the VIX (0 under 20, then 5% per 5 points, capped at 35%); a
// ticker may hold 10% of buying power (one contract may overshoot to 15% when
// adding to a name already held); and every put stays cash-secured.
export interface QuantFit {
  contracts: number; // how many the rules allow right now (0 is fine — see flags)
  held: boolean; // shares, puts or LEAPS already on this name
  full: boolean; // the name is already at its per-ticker size
  cashShort: boolean; // free cash can't secure even one contract
  committed: number; // $ already tied up in this name
  perTickerCap: number; // $ the rule allows per name
}

export interface QuantCapacity {
  totalValue: number;
  cash: number;
  vix: number | null;
  margin: number; // VIX-scaled allowance, as a fraction of total value
  extraMargin: number; // $ the user set for this account (margin against holdings they won't sell)
  buyingPower: number;
  putObligations: number;
  committedTotal: number;
  freeCash: number; // uncommitted cash + the margin allowance + extra margin
  marginUsed: number; // $ committed beyond the account's value (Home's "used margin")
  room: number; // $ new puts can actually take: the smaller of free cash and what is left under buying power
}

export function vixMargin(vix: number | null): number {
  if (vix == null || vix < 20) return 0;
  return Math.min(0.35, 0.05 * Math.floor(vix / 5));
}

/** `extraMargin`: dollars the user adds to this account's base (Quant Settings),
 *  so long-term holdings they won't sell don't leave the wheel short of capital.
 *  It raises buying power (and with it the per-name cap) and free cash alike. */
export function quantCapacity(data: AccountData, vix: number | null, extraMargin = 0): QuantCapacity {
  const totalValue = data.summary.totalValue;
  const margin = vixMargin(vix);
  const extra = Math.max(0, extraMargin);
  // Collateral the short book pledges: CSPs at strike x 100, spreads at their
  // defined risk. A short put inside a spread is NOT a cash-secured put.
  const putObligations = cspCollateralTotal(data.options) + spreadRiskCapital(data.options);
  // What is actually uncommitted, the way the Home page counts it: total value
  // less everything deployed (shares, LEAPS, collateral, spread risk), plus
  // money-market sweep funds, which Schwab reports as a holding rather than cash.
  const free = freeCashValue(data.summary, data.equities, data.options);
  const buyingPower = totalValue * (1 + margin) + extra;
  const committedTotal = capitalCommitted(data.options, data.equities);
  const freeCash = free + margin * totalValue + extra;
  return {
    totalValue,
    cash: free + putObligations, // cash on hand, including what already secures the puts
    vix,
    margin,
    extraMargin: extra,
    buyingPower,
    putObligations,
    committedTotal,
    freeCash,
    marginUsed: Math.max(0, committedTotal - totalValue),
    // Margin already in use counts against the allowances: an account $97k past its
    // value with a $117k extra-margin limit has $20k of room, not $117k.
    room: Math.max(0, Math.min(freeCash, buyingPower - committedTotal)),
  };
}

/** Hold back a cash reserve (the VIX cash allocation) from what can be deployed. */
export function holdBack(cap: QuantCapacity, reserve: number): QuantCapacity {
  if (reserve <= 0) return cap;
  const freeCash = Math.max(0, cap.freeCash - reserve);
  return { ...cap, freeCash, room: Math.max(0, Math.min(freeCash, cap.buyingPower - cap.committedTotal)) };
}

export function quantFit(row: QuantRow, data: AccountData, cap: QuantCapacity, params: QuantScan["meta"]["params"]): QuantFit | null {
  const pick = row.pick;
  if (!pick) return null;
  const sym = row.sym.toUpperCase();
  const committed = capitalCommitted(
    data.options.filter((o) => o.symbol === sym),
    data.equities.filter((e) => e.symbol === sym),
  );
  const perTickerCap = params.maxPerTicker * cap.buyingPower;
  const roomTicker = perTickerCap - committed;
  const roomTotal = cap.buyingPower - cap.committedTotal;
  const room = Math.min(roomTicker, roomTotal, cap.freeCash);
  let contracts = room > 0 ? Math.floor(room / pick.collateral) : 0;
  if (contracts < 1 && roomTicker > 0) {
    // Under target but one contract doesn't fit: allowed up to cap + band when the
    // account-level limits still have room (the study's "adds" rule).
    const capHi = (params.maxPerTicker + params.tickerBand) * cap.buyingPower - committed;
    if (capHi >= pick.collateral && Math.min(roomTotal, cap.freeCash) >= pick.collateral) contracts = 1;
  }
  return {
    contracts,
    held: committed > 0,
    full: committed >= perTickerCap,
    cashShort: cap.freeCash < pick.collateral,
    committed,
    perTickerCap,
  };
}

// ---- demo ---------------------------------------------------------------------
// A plausible scan for the public demo: strikes sit 7–9% under the real close,
// premiums are set so roughly half the names pay the target. Not market data.
function exampleQuantScan(): QuantScan {
  const today = new Date();
  const exp = (dte: number) => new Date(today.getTime() + dte * 86_400_000).toISOString().slice(0, 10);
  const rows: QuantRow[] = Object.keys(EXAMPLE_CLOSES).map((sym, i) => {
    const price = lastClose(sym);
    const dte = [30, 35, 37, 42][i % 4];
    const inc = price < 30 ? 0.5 : price < 100 ? 1 : price < 250 ? 5 : 10;
    const strike = Math.round((price * (1 - 0.07 - (i % 3) * 0.01)) / inc) * inc;
    const yield30 = 3.1 + ((i * 7) % 23) / 10; // 3.1 … 5.3
    const mark = Math.round(((yield30 / 100) * strike * dte) / 30 * 100) / 100;
    const bid = Math.round((mark - 0.03) * 100) / 100;
    const contract: QuantContract = {
      exp: exp(dte), dte, strike, bid, ask: Math.round((mark + 0.03) * 100) / 100, mark,
      delta: Math.round((0.22 + ((i * 5) % 13) / 100) * 1000) / 1000,
      yield30: Math.round(yield30 * 100) / 100, annPct: Math.round((mark / strike) * (365 / dte) * 1000) / 10,
      premium: Math.round(mark * 100 * 100) / 100, collateral: strike * 100, oi: 1200 + ((i * 917) % 9000), volume: 80 + ((i * 131) % 700),
      spreadPct: Math.round((4 + (i % 5)) * 10) / 10, iv: Math.round((0.35 + ((i * 3) % 40) / 100) * 1000) / 1000,
      belowSpotPct: Math.round((1 - strike / price) * 1000) / 10,
    };
    const ok = yield30 >= 4;
    const er = EXAMPLE_EARNINGS[sym] ?? null;
    const erDays = er ? Math.ceil((Date.parse(er + "T21:00:00Z") - Date.now()) / 86_400_000) : null;
    return { sym, price, pick: ok ? contract : null, best: contract, reason: ok ? "ok" : "low", erDate: er, erDays, erInWindow: !!(ok && erDays != null && erDays >= 0 && erDays <= dte) };
  });
  rows.sort((a, b) => Number(!!b.pick) - Number(!!a.pick) || (b.pick ?? b.best)!.yield30 - (a.pick ?? a.best)!.yield30);
  return {
    meta: { asOf: new Date().toISOString(), marketOpen: true, universe: rows.length, qualifying: rows.filter((r) => r.pick).length, params: { targetYield: 0.04, yieldDays: 30, maxDelta: 0.35, expMin: 28, expMax: 42, expTarget: 35, closeAtPct: 50, maxPerTicker: 0.1, tickerBand: 0.05 }, source: "example" },
    rows,
  };
}
