// Quant portfolio check: the wheel study's management rules, applied to what the
// selected account holds right now. Pure; the page renders whatever comes back.
//
// The rules, from the winning combo (87 v2):
//   * close a short put once it has captured 50% of its credit — even late in life
//   * every put stays cash-secured; the margin allowance scales with the VIX, plus any
//     extra margin the user set for the account (Quant scan Settings)
//   * no name above 10% of buying power (15% when a contract overshoots while adding);
//     both follow the Settings, like the scan page and the trader
//   * assigned shares: sell a call 7–21 days out at or above cost basis, the furthest
//     strike still paying ≥0.5% of basis per week; hold with no call if none does
//   * assigned shares: buy a ~0.75-delta LEAPS ~450 days out (one per 100 shares);
//     (0.75 beat 0.60–0.80 in every period tested, by ~2 pts/yr over 0.60)
//     close it once the shares are called away or it gets within 90 days of expiry
//   * capital that isn't working: put it into a name the scan says pays
import type { AccountData, CoveredCallQuote } from "./types";
import { capturedPct, daysToExpiry } from "./calc";
import { capitalCommitted, quantCapacity, quantFit, type QuantCapacity, type QuantScan } from "./quant";
import { byTraderRank } from "./quant-rank";

export type Urgency = "act" | "income" | "deploy" | "note";

export interface QuantAction {
  urgency: Urgency;
  rule: string; // which rule this comes from, short
  symbol: string;
  title: string; // the action, imperative
  detail: string; // the numbers behind it
  amount?: number; // $ involved, when there is one
  href?: string; // where tapping the card goes, when there is somewhere to go
  linkLabel?: string; // shown under the detail when href is set
}

export interface PortfolioCheck {
  capacity: QuantCapacity;
  actions: QuantAction[];
  counts: Record<Urgency, number>;
  compliant: string[]; // one line per rule that is already satisfied
}

const R = {
  closeAt: 0.5,
  maxPerTicker: 0.1,
  tickerBand: 0.05,
  callMinDte: 7,
  callMaxDte: 21,
  callWeeklyMin: 0.005, // of cost basis, per week
  leapsDelta: 0.75,
  leapsDte: 450,
  leapsMinDteToHold: 90,
};

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

function bySymbol<T extends { symbol: string }>(xs: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(x.symbol, [...(m.get(x.symbol) ?? []), x]);
  return m;
}

/** Sizing from the Quant scan's Settings (the study's values by default). */
export interface CheckSizing {
  reservePct?: number; // the VIX page's cash reserve held back ("follow the VIX cash allocation"); 0 = the study's way
  extraMargin?: number; // $ added to this account's base
  maxPerTicker?: number;
  tickerBand?: number;
  vrp?: (sym: string) => number | null | undefined; // the Brief's IV/RV, for the trader's ranking
}

export function checkPortfolio(data: AccountData, vix: number | null, scan: QuantScan | null, sizing: CheckSizing = {}): PortfolioCheck {
  const reservePct = sizing.reservePct ?? 0;
  const perName = sizing.maxPerTicker ?? R.maxPerTicker;
  const band = sizing.tickerBand ?? R.tickerBand;
  const rawCap = quantCapacity(data, vix, sizing.extraMargin ?? 0);
  const cap = reservePct > 0 ? { ...rawCap, freeCash: Math.max(0, rawCap.freeCash - reservePct * rawCap.totalValue) } : rawCap;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const actions: QuantAction[] = [];
  const compliant: string[] = [];
  // Cash-secured puts only: a spread's short leg is managed as a spread, and is
  // capitalised at the spread's defined risk, not its strike.
  const shortPuts = data.options.filter((o) => o.kind === "csp" && o.side === "short");
  const shortCalls = data.options.filter((o) => o.side === "short" && o.optionType === "call");
  const longCalls = data.options.filter((o) => o.side === "long" && o.optionType === "call");
  const eqBySym = bySymbol(data.equities);

  // 1. Close at 50%.
  let closers = 0;
  for (const o of shortPuts) {
    const captured = capturedPct(o);
    const dte = daysToExpiry(o.expiration);
    if (captured >= R.closeAt && dte > 0) {
      closers += 1;
      actions.push({
        urgency: "act",
        rule: "close at 50%",
        symbol: o.symbol,
        title: `Buy to close ${o.qty} × ${o.symbol} $${o.strike} put`,
        detail: `${Math.round(captured * 100)}% of the ${(o.entryPerShare).toFixed(2)} credit captured; costs about ${o.mark.toFixed(2)} with ${dte} days left. The study closes here every time — holding late winners cost more in 2022 than it made in rallies.`,
        amount: o.mark * 100 * o.qty,
      });
    }
  }
  if (shortPuts.length && !closers) compliant.push("No short put has reached 50% of its credit yet.");

  // 2. Cash-secured, with the VIX-scaled allowance.
  if (cap.freeCash < 0) {
    actions.push({
      urgency: "act",
      rule: "cash-secured",
      symbol: "—",
      title: `Collateral exceeds cash by ${money(-cap.freeCash)}`,
      detail: `CSPs and spreads pledge ${money(cap.putObligations)}; cash on hand (sweep funds included) ${money(cap.cash)} plus a ${Math.round(cap.margin * 100)}% margin allowance at VIX ${vix != null ? vix.toFixed(1) : "?"}${cap.extraMargin ? ` and ${money(cap.extraMargin)} extra margin` : ""} covers ${money(cap.cash + cap.margin * cap.totalValue + cap.extraMargin)}. Close the weakest puts (lowest yield left, nearest the money) until it fits.`,
      amount: -cap.freeCash,
    });
  } else if (shortPuts.length) {
    compliant.push(`Every put and spread is covered: ${money(cap.putObligations)} pledged against ${money(cap.cash + cap.margin * cap.totalValue + cap.extraMargin)} available.`);
  }

  // 3. Per-name cap.
  // Per name, counted the way the Options page does: CSP collateral, spread
  // defined risk, long options at market, shares at value.
  const committedBy = new Map<string, number>();
  for (const sym of new Set([...data.options.map((o) => o.symbol), ...data.equities.map((e) => e.symbol)])) {
    const c = capitalCommitted(data.options.filter((o) => o.symbol === sym), data.equities.filter((e) => e.symbol === sym));
    if (c > 0) committedBy.set(sym, c);
  }
  const capHi = (perName + band) * cap.buyingPower;
  const capLo = perName * cap.buyingPower;
  let over = 0;
  for (const [sym, committed] of [...committedBy.entries()].sort((a, b) => b[1] - a[1])) {
    if (committed > capHi) {
      over += 1;
      actions.push({
        urgency: "act",
        rule: `${pct(perName)} per name`,
        symbol: sym,
        title: `${sym} is ${money(committed - capLo)} over its cap`,
        detail: `${money(committed)} in ${sym} (shares, put collateral, spread risk, LEAPS) against a ${money(capLo)} ${pct(perName)} cap; the ${pct(perName + band)} stretch allocation is ${money(capHi)}. Don't add; let puts run off or close the newest.`,
        amount: committed - capLo,
      });
    } else if (committed > capLo) {
      actions.push({
        urgency: "note",
        rule: `${pct(perName)} per name`,
        symbol: sym,
        title: `${sym} is at its cap`,
        detail: `${money(committed)} against the ${money(capLo)} ${pct(perName)} cap, inside the ${pct(perName + band)} stretch allocation (${money(capHi)}). Nothing to do, but no more here.`,
      });
    }
  }
  if (committedBy.size && !over) compliant.push(`No name is above ${pct(perName + band)} of buying power.`);

  // 4. Covered calls on shares (≥100, no call already on).
  const calledBy = bySymbol(shortCalls);
  for (const [sym, lots] of eqBySym) {
    const shares = lots.reduce((s, e) => s + e.qty, 0);
    if (shares < 100) continue;
    if (calledBy.has(sym)) continue;
    const eq = lots[0];
    const basis = lots.reduce((s, e) => s + e.qty * e.avgCost, 0) / shares;
    const ladder = (eq.coveredCalls ?? []).filter((c) => c.dte >= R.callMinDte && c.dte <= R.callMaxDte && c.strike >= basis);
    const weekly = (c: CoveredCallQuote) => c.mark / basis / (c.dte / 7);
    const ok = ladder.filter((c) => weekly(c) >= R.callWeeklyMin);
    const contracts = Math.floor(shares / 100);
    if (ok.length) {
      const top = Math.max(...ok.map((c) => c.strike));
      const pick = ok.filter((c) => c.strike === top).sort((a, b) => weekly(b) - weekly(a))[0];
      actions.push({
        urgency: "income",
        rule: "covered call",
        symbol: sym,
        title: `Sell ${contracts} × ${sym} $${pick.strike} call, ${pick.dte}d`,
        detail: `Furthest strike at or above your $${basis.toFixed(2)} basis still paying ${(weekly(pick) * 100).toFixed(2)}% of basis per week (${pick.mark.toFixed(2)} × 100). ${pick.delta ? `${pick.delta.toFixed(2)}Δ.` : ""} Let it expire or be called; the wheel goes back to cash.`,
        amount: pick.mark * 100 * contracts,
      });
    } else if (eq.price < basis) {
      actions.push({
        urgency: "note",
        rule: "covered call",
        symbol: sym,
        title: `${sym}: hold without a call`,
        detail: `Price $${eq.price.toFixed(2)} is under your $${basis.toFixed(2)} basis and no 7–21 day call above basis pays 0.5%/week. The study waits rather than selling below cost.`,
      });
    } else if (!eq.coveredCalls?.length) {
      actions.push({
        urgency: "note",
        rule: "covered call",
        symbol: sym,
        title: `${sym}: no call ladder on file`,
        detail: `${shares} shares with no call on; the bridge hasn't priced calls for it yet (it does during market hours).`,
      });
    }
  }

  // 5. LEAPS on assignment.
  const leapsBy = bySymbol(longCalls);
  for (const [sym, lots] of eqBySym) {
    const shares = lots.reduce((s, e) => s + e.qty, 0);
    if (shares < 100) continue;
    if (leapsBy.has(sym)) continue;
    const price = lots[0].price;
    actions.push({
      urgency: "income",
      rule: "LEAPS on shares",
      symbol: sym,
      title: `Buy ${Math.floor(shares / 100)} × ${sym} ~${R.leapsDelta.toFixed(2)}Δ call, ~${R.leapsDte} days out`,
      detail: `Shares held with no long call under them. The study pairs each 100 assigned shares with a deep call to keep upside while the shares get called away (it added $503k over the full backtest). Well in the money: a strike around $${Math.round(price * 0.72 / (price < 100 ? 1 : 5)) * (price < 100 ? 1 : 5)} at today's price.`,
    });
  }
  for (const o of longCalls) {
    const dte = daysToExpiry(o.expiration);
    const shares = (eqBySym.get(o.symbol) ?? []).reduce((s, e) => s + e.qty, 0);
    if (shares === 0) {
      actions.push({
        urgency: "note",
        rule: "LEAPS on shares",
        symbol: o.symbol,
        title: `${o.symbol} LEAPS with no shares under it`,
        detail: `The study only holds a LEAPS while it holds the shares and sells it when they're called away. If this is a standalone LEAP position, ignore this.`,
      });
    } else if (dte <= R.leapsMinDteToHold) {
      actions.push({
        urgency: "act",
        rule: "LEAPS on shares",
        symbol: o.symbol,
        title: `Sell ${o.qty} × ${o.symbol} $${o.strike} call: ${dte} days left`,
        detail: `Inside the study's ${R.leapsMinDteToHold}-day floor for holding a LEAPS. Roll out to ~${R.leapsDte} days if you still hold the shares.`,
        amount: o.mark * 100 * o.qty,
      });
    }
  }

  // 6. Idle capital: what the scan says would fit, in the trader's order (names
  // with earnings inside the put's life last, then its rank).
  if (scan && cap.freeCash > 0) {
    const sizingParams = { ...scan.meta.params, maxPerTicker: perName, tickerBand: band };
    const fits = scan.rows
      .filter((r) => r.pick)
      .sort(byTraderRank(sizing.vrp ?? (() => null)))
      .map((r) => ({ r, fit: quantFit(r, data, cap, sizingParams) }))
      .filter((x) => x.fit && x.fit.contracts > 0 && !x.fit.full);
    if (fits.length) {
      const best = fits[0];
      actions.push({
        urgency: "deploy",
        rule: "4% target",
        symbol: best.r.sym,
        title: `${money(cap.freeCash)} free: ${fits.length} scan pick${fits.length === 1 ? "" : "s"} fit`,
        detail: `First in the trader's queue is ${best.r.sym} $${best.r.pick!.strike} ${best.r.pick!.exp.slice(5)} at ${best.r.pick!.yield30.toFixed(1)}% per 30 days (${best.fit!.contracts} contract${best.fit!.contracts === 1 ? "" : "s"}).`,
        amount: cap.freeCash,
        href: "/quant",
        linkLabel: "(Click to view scan results)",
      });
    } else if (scan.meta.qualifying === 0) {
      compliant.push("Free cash is idle because nothing on the approved list pays the target — that is the rule sitting out, not a problem.");
    }
  }

  // 7. Puts in the money near expiry: the study takes the shares.
  for (const o of shortPuts) {
    const dte = daysToExpiry(o.expiration);
    const under = o.underlyingPrice ?? o.underlyingLive ?? null;
    if (under != null && under < o.strike && dte <= 7 && dte >= 0) {
      actions.push({
        urgency: "note",
        rule: "take assignment",
        symbol: o.symbol,
        title: `${o.symbol} $${o.strike} put is in the money with ${dte}d left`,
        detail: `Underlying $${under.toFixed(2)}. The study lets it assign and starts the call/LEAPS leg rather than rolling. Your basis would be $${(o.strike - o.entryPerShare).toFixed(2)}.`,
      });
    }
  }

  const order: Record<Urgency, number> = { act: 0, income: 1, deploy: 2, note: 3 };
  actions.sort((a, b) => order[a.urgency] - order[b.urgency] || (b.amount ?? 0) - (a.amount ?? 0));
  const counts: Record<Urgency, number> = { act: 0, income: 0, deploy: 0, note: 0 };
  for (const a of actions) counts[a.urgency] += 1;
  return { capacity: cap, actions, counts, compliant };
}

