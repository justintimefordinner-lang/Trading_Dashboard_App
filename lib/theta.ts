// Daily theta roll-up for the whole options book, split into premium-collecting
// "credit" vehicles (CSPs, covered calls, net-credit spreads) and long "debit"
// vehicles (LEAPs, net-debit spreads).
import type { OptionPosition } from "@/lib/types";
import { buildSpreads } from "@/lib/spread";

/** Daily theta $ the holder earns (short premium → +) or pays (long → −).
 *  We take the magnitude of the per-share theta and apply the position side, so this
 *  is correct whether the feed stores raw (negative) or already-signed theta. */
export function positionDailyTheta(o: OptionPosition): number {
  const sign = o.side === "short" ? 1 : -1;
  return sign * Math.abs(o.theta) * o.qty * 100;
}

export interface ThetaBreakdown {
  total: number; // net daily theta $ across every option vehicle
  credit: number; // theta earned: CSPs + covered calls + credit spreads (≥ 0)
  debit: number; // theta paid: LEAPs + debit spreads (≤ 0)
}

/** Split the book's daily theta into Credit vs Debit. Spread legs are paired first so
 *  each spread is judged whole, by whether it opened for a net credit or a net debit. */
export function dailyThetaBreakdown(options: OptionPosition[]): ThetaBreakdown {
  let credit = 0;
  let debit = 0;
  const spreadLegs: OptionPosition[] = [];

  for (const o of options) {
    if (o.kind === "put-spread" || o.kind === "call-spread") {
      spreadLegs.push(o);
      continue;
    }
    const t = positionDailyTheta(o);
    if (o.kind === "csp" || o.kind === "covered-call") credit += t;
    else if (o.kind === "leap-call" || o.kind === "leap-put-hedge") debit += t;
    else if (t >= 0) credit += t; // "other" → follow the theta sign
    else debit += t;
  }

  const { spreads, orphans } = buildSpreads(spreadLegs);
  for (const sp of spreads) {
    const t = positionDailyTheta(sp.short) + positionDailyTheta(sp.long);
    if (sp.netCredit >= 0) credit += t; // net-credit spread
    else debit += t; // net-debit spread
  }
  for (const o of orphans) {
    const t = positionDailyTheta(o);
    if (t >= 0) credit += t;
    else debit += t;
  }

  return { total: credit + debit, credit, debit };
}
