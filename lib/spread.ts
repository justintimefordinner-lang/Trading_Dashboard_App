// Combines the two legs of a vertical spread into one synthetic position with
// net statistics (credit, risk, P/L, breakeven, annualized return-on-remaining).
// The Schwab bridge feeds each leg as its own OptionPosition tagged put-spread /
// call-spread; here we pair short+long back into the complete spread the trader
// actually opened.
import { daysToExpiry, optionPnl } from "@/lib/calc";
import type { OptionPosition } from "@/lib/types";

export interface Spread {
  id: string;
  symbol: string;
  kind: "put-spread" | "call-spread";
  optionType: "put" | "call";
  expiration: string;
  openedAt?: string;
  qty: number;
  shortStrike: number;
  longStrike: number;
  width: number; // strike distance, per share
  netCredit: number; // per share at entry (positive ⇒ credit spread)
  netMark: number; // per share now — cost to close the spread
  maxProfit: number; // total $ (the credit kept if it expires worthless)
  maxLoss: number; // total $ — capital at risk
  collateral: number; // alias for maxLoss; the "money working" denominator
  pnl: number; // net $ P/L across both legs
  pnlPct: number; // pnl ÷ maxProfit — % of the credit captured
  dte: number;
  breakeven: number;
  underlyingPrice?: number;
  toStrike: number | null; // signed cushion from underlying to the short strike (+ = OTM)
  remainingYield: number; // remaining spread value ÷ collateral
  yr: number; // remainingYield annualized (×360/DTE) — current working rate
  short: OptionPosition;
  long: OptionPosition;
}

function makeSpread(s: OptionPosition, l: OptionPosition): Spread {
  const qty = Math.min(s.qty, l.qty) || s.qty;
  const isPut = s.optionType === "put";
  const width = Math.abs(s.strike - l.strike);
  const netCredit = s.entryPerShare - l.entryPerShare; // short collected − long paid
  const netMark = s.mark - l.mark; // current cost to buy the spread back
  const maxProfit = netCredit * 100 * qty;
  const maxLoss = Math.max(width - netCredit, 0) * 100 * qty;
  const pnl = optionPnl(s) + optionPnl(l);
  const pnlPct = maxProfit !== 0 ? pnl / Math.abs(maxProfit) : 0;
  const dte = daysToExpiry(s.expiration);
  const breakeven = isPut ? s.strike - netCredit : s.strike + netCredit;
  const up = s.underlyingPrice ?? l.underlyingPrice;
  const toStrike = up && up > 0 ? (isPut ? (up - s.strike) / up : (s.strike - up) / up) : null;
  const collateral = maxLoss;
  const remainingYield = collateral > 0 ? (netMark * 100 * qty) / collateral : 0;
  const yr = remainingYield * (360 / Math.max(dte, 1));
  return {
    id: `${s.id}|${l.id}`,
    symbol: s.symbol,
    kind: isPut ? "put-spread" : "call-spread",
    optionType: s.optionType,
    expiration: s.expiration,
    openedAt: s.openedAt ?? l.openedAt,
    qty,
    shortStrike: s.strike,
    longStrike: l.strike,
    width,
    netCredit,
    netMark,
    maxProfit,
    maxLoss,
    collateral,
    pnl,
    pnlPct,
    dte,
    breakeven,
    underlyingPrice: up,
    toStrike,
    remainingYield,
    yr,
    short: s,
    long: l,
  };
}

// Pair legs into spreads. Group by underlying + expiration + kind, then zip the
// sorted short and long legs (handles multiple spreads on the same expiry).
// Any leg that can't be paired is returned as an orphan so nothing is hidden.
export function buildSpreads(legs: OptionPosition[]): { spreads: Spread[]; orphans: OptionPosition[] } {
  const groups = new Map<string, OptionPosition[]>();
  for (const l of legs) {
    const k = `${l.symbol}|${l.expiration}|${l.kind}`;
    const arr = groups.get(k);
    if (arr) arr.push(l);
    else groups.set(k, [l]);
  }
  const spreads: Spread[] = [];
  const orphans: OptionPosition[] = [];
  for (const gl of groups.values()) {
    const shorts = gl.filter((x) => x.side === "short").sort((a, b) => a.strike - b.strike);
    const longs = gl.filter((x) => x.side === "long").sort((a, b) => a.strike - b.strike);
    const n = Math.min(shorts.length, longs.length);
    for (let i = 0; i < n; i++) spreads.push(makeSpread(shorts[i], longs[i]));
    orphans.push(...shorts.slice(n), ...longs.slice(n));
  }
  return { spreads, orphans };
}

// Management action for a credit spread, mirroring the CSP Rollable/Hold chips.
// The desk rule: take winners at 50% of max profit, and manage *everything* at
// 21 DTE (gamma risk rises into expiration) — whichever comes first.
export type SpreadAction = "manage" | "hold";
export interface SpreadInsight {
  action: SpreadAction;
  label: string;
  detail: string;
}
export function spreadInsight(sp: Spread): SpreadInsight {
  const captured = sp.pnlPct >= 0.5;
  const nearExpiry = sp.dte <= 21;
  if (captured || nearExpiry) {
    const detail = captured
      ? `${Math.round(sp.pnlPct * 100)}% of max profit captured — close or roll to lock the gain and free the risk capital.`
      : `${sp.dte} DTE — gamma risk rising into expiration. Close or roll to manage.`;
    return { action: "manage", label: "Manage Spread", detail };
  }
  return {
    action: "hold",
    label: "Hold",
    detail: `${Math.round(sp.pnlPct * 100)}% captured · ${sp.dte} DTE — below the 50% / 21-DTE triggers, let it work.`,
  };
}
