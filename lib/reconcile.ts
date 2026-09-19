// Reconcile the app's realized P&L against a Schwab Realized Gain/Loss report.
// Pure and client-safe. It never changes a number — it says where the two
// disagree and why that usually is, and separately proposes cost bases for
// sales the app couldn't cost, read off the report's own lots.
//
// The comparison is by SYMBOL and by MONTH rather than lot-for-lot, on purpose:
// Schwab reports a vertical as two lots and the app as one spread; Schwab has
// no lot for an assigned option (its premium lives in the shares) while the
// app books a zero-gain "assigned" record; Schwab picks tax lots while the app
// matches first-in-first-out. All of those agree in a symbol's total and would
// be noise lot-by-lot.
//
// It is also only fair over the stretch both sides can see. The app's history
// starts where Schwab's API let the bridge reach; a report exported from years
// earlier is full of lots the app could never have, so those are set aside and
// counted separately rather than scored as the app being wrong.
import type { SchwabLot, SchwabReport } from "@/lib/schwab-realized";

export interface AppClosed {
  kind: "csp" | "covered" | "leap" | "spread" | "stock";
  symbol: string;
  openedAt?: string;
  closedAt: string;
  realizedPnl: number;
  outcome: string;
  accountId?: string;
  manual?: boolean; // a hand-entered cost basis or a hand-added sale: says nothing about where history begins
}

export interface SymbolDiff {
  symbol: string;
  side: "options" | "stock";
  schwab: number;
  app: number;
  diff: number; // app − schwab
  reason: string;
}

export interface Reconciliation {
  from: string;
  to: string;
  historyStart: string | null; // earliest trade the app knows of; null when it has none
  beforeHistory: { lots: number; gain: number; options: number; stock: number }; // Schwab lots closed before that, left out of everything below
  schwab: { total: number; options: number; stock: number; lots: number };
  app: { total: number; options: number; stock: number; records: number; unstamped: number };
  bySymbol: SymbolDiff[]; // only rows off by more than the tolerance, largest first
  byMonth: { month: string; schwab: number; app: number; diff: number }[];
  washSales: { lots: number; disallowed: number };
  matchedSymbols: number; // symbols within tolerance
}

const TOLERANCE = 5; // dollars: fees and rounding on a symbol's total
const usd = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString()}`;

export function reconcile(report: SchwabReport, records: AppClosed[], accountId: string | null): Reconciliation {
  const dates = report.lots.map((l) => l.closed).sort();
  const from = report.from ?? dates[0];
  const to = report.to ?? dates[dates.length - 1];
  const forAccount = accountId ? records.filter((r) => r.accountId === accountId) : records;
  const inWindow = records.filter((r) => r.closedAt >= from && r.closedAt <= to);
  const scoped = forAccount.filter((r) => r.closedAt >= from && r.closedAt <= to);
  const unstamped = inWindow.filter((r) => !r.accountId).length;

  // Where the app's own history begins: the earliest date on any trade it
  // rebuilt from Schwab's feeds. Hand-entered records don't count — a sale
  // added from 2019 doesn't mean the feeds reach 2019.
  const known = forAccount.filter((r) => !r.manual).flatMap((r) => [r.openedAt, r.closedAt]).filter((d): d is string => !!d);
  const historyStart = known.length ? known.reduce((a, b) => (a < b ? a : b)) : null;
  const before = historyStart ? report.lots.filter((l) => l.closed < historyStart) : [];
  const lots = historyStart ? report.lots.filter((l) => l.closed >= historyStart) : report.lots;

  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const sOpt = sum(lots.filter((l) => l.isOption).map((l) => l.gain));
  const sStk = sum(lots.filter((l) => !l.isOption).map((l) => l.gain));
  const aOpt = sum(scoped.filter((r) => r.kind !== "stock").map((r) => r.realizedPnl));
  const aStk = sum(scoped.filter((r) => r.kind === "stock").map((r) => r.realizedPnl));

  // by symbol, options and stock separately
  const bucket = new Map<string, { schwab: number; app: number; assigned: number; wash: number; early: number; manual: number }>();
  const slot = (k: string) => {
    let b = bucket.get(k);
    if (!b) bucket.set(k, (b = { schwab: 0, app: 0, assigned: 0, wash: 0, early: 0, manual: 0 }));
    return b;
  };
  for (const l of lots) {
    const b = slot(`${l.isOption ? "options" : "stock"}|${l.root}`);
    b.schwab += l.gain;
    if (l.washSale) b.wash += l.disallowed;
    // Closed inside the app's history but OPENED before it: the app never saw
    // the purchase, so it only has this if the sale was given a cost basis.
    if (historyStart && l.opened && l.opened < historyStart) b.early += l.gain;
  }
  for (const r of scoped) {
    const b = slot(`${r.kind === "stock" ? "stock" : "options"}|${r.symbol.toUpperCase()}`);
    b.app += r.realizedPnl;
    if (r.outcome === "assigned") b.assigned += 1;
    if (r.manual) b.manual += 1;
  }
  const bySymbol: SymbolDiff[] = [];
  let matched = 0;
  for (const [k, b] of bucket) {
    const [side, symbol] = k.split("|") as ["options" | "stock", string];
    const diff = b.app - b.schwab;
    if (Math.abs(diff) <= TOLERANCE) {
      matched += 1;
      continue;
    }
    const early = Math.abs(b.early) > TOLERANCE ? ` ${usd(b.early)} of Schwab's figure is on lots opened before ${historyStart}, where the app's history begins.` : "";
    let reason: string;
    if (b.app === 0 && side === "stock") reason = `Not in the app: the shares were bought before its history begins, or the sale needs a cost basis.${early}`;
    else if (b.app === 0) reason = `Not in the app: these closes aren't in its order or transaction history.${early}`;
    else if (b.schwab === 0) reason = side === "options" ? "Only in the app: likely an assignment older than the transactions feed, booked as expired." : "Only in the app: check the account filter.";
    else if (b.wash > 0 && Math.abs(diff + b.wash) <= Math.max(TOLERANCE, b.wash * 0.05)) reason = `Wash sales: Schwab disallowed ${Math.round(b.wash).toLocaleString()} of loss here. A tax adjustment, not a P&L error.`;
    else if (b.wash > 0) reason = `Partly wash sales (${Math.round(b.wash).toLocaleString()} disallowed); the rest is lot matching or a missing fill.`;
    else if (side === "stock" && b.manual > 0) reason = `Amounts differ, and ${b.manual === 1 ? "a sale here uses" : `${b.manual} sales here use`} a cost basis entered by hand. If this report covers ${b.manual === 1 ? "it" : "them"}, the check above compares your number with Schwab's.${early}`;
    else if (side === "stock") reason = `Amounts differ: usually cost basis (assignment premium, Schwab selling different tax lots than first-in-first-out) or a missing purchase.${early}`;
    else reason = `Amounts differ: usually a close the app never saw, so it booked the option as expired.${early}`;
    bySymbol.push({ symbol, side, schwab: b.schwab, app: b.app, diff, reason });
  }
  bySymbol.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const months = new Map<string, { schwab: number; app: number }>();
  for (const l of lots) {
    const m = months.get(l.closed.slice(0, 7)) ?? { schwab: 0, app: 0 };
    m.schwab += l.gain;
    months.set(l.closed.slice(0, 7), m);
  }
  for (const r of scoped) {
    const m = months.get(r.closedAt.slice(0, 7)) ?? { schwab: 0, app: 0 };
    m.app += r.realizedPnl;
    months.set(r.closedAt.slice(0, 7), m);
  }

  return {
    from,
    to,
    historyStart,
    beforeHistory: {
      lots: before.length,
      gain: sum(before.map((l) => l.gain)),
      options: sum(before.filter((l) => l.isOption).map((l) => l.gain)),
      stock: sum(before.filter((l) => !l.isOption).map((l) => l.gain)),
    },
    schwab: { total: sOpt + sStk, options: sOpt, stock: sStk, lots: lots.length },
    app: { total: aOpt + aStk, options: aOpt, stock: aStk, records: scoped.length, unstamped },
    bySymbol,
    byMonth: [...months.entries()].sort().map(([month, v]) => ({ month, schwab: v.schwab, app: v.app, diff: v.app - v.schwab })),
    washSales: { lots: lots.filter((l) => l.washSale).length, disallowed: sum(lots.map((l) => l.disallowed)) },
    matchedSymbols: matched,
  };
}

// ---- cost basis from the report ------------------------------------------------
export interface UnresolvedSale {
  id: string;
  symbol: string;
  shares: number;
  soldAt: number;
  closeDate: string;
  costPerShare?: number | null;
  acquiredDate?: string | null;
}

/** A cost basis the user already typed in (manual_cost_basis.json), with the sale it belongs to. */
export interface EnteredBasis {
  id: string;
  symbol: string;
  shares: number;
  soldAt: number;
  closeDate: string;
  costPerShare: number;
  acquiredDate: string | null;
}

export interface BasisProposal {
  id: string;
  symbol: string;
  shares: number;
  soldAt: number;
  closeDate: string;
  costPerShare: number;
  acquiredDate: string | null;
  gain: number;
}

/** An entered cost basis that Schwab's own lots disagree with. */
export interface BasisCorrection extends BasisProposal {
  enteredCost: number;
  enteredGain: number;
  delta: number; // gain with Schwab's cost − gain with the entered cost
}

const DAY = 86_400_000;
const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;

/** For each sale, find the report's stock lots for the same symbol sold within
 *  five days (assignment sales post a day or two after Schwab's lot date),
 *  nearest sale price first, consuming part of a lot when the sale is smaller.
 *  Only complete matches are proposed.
 *
 *  Sales the app couldn't cost go first. Then the cost bases already entered by
 *  hand are checked against what is left: the number Schwab used is the cost of
 *  the lots it actually sold, which under any lot method other than average is
 *  NOT the position's average cost — the usual way a hand-entered basis is off. */
export function proposeCostBasis(
  unresolved: UnresolvedSale[],
  lots: SchwabLot[],
  entered: EnteredBasis[] = [],
): { proposals: BasisProposal[]; unmatched: UnresolvedSale[]; corrections: BasisCorrection[] } {
  const pool = lots.filter((l) => !l.isOption && l.qty > 0).map((l) => ({ ...l, left: l.qty, cps: l.cost / l.qty, pps: l.proceeds / l.qty }));

  const match = (u: UnresolvedSale): BasisProposal | null => {
    const sym = u.symbol.toUpperCase();
    const cands = pool
      .filter((l) => l.root === sym && l.left > 1e-4 && daysApart(l.closed, u.closeDate) <= 5)
      .sort((a, b) => Math.abs(a.pps - u.soldAt) - Math.abs(b.pps - u.soldAt) || (a.opened ?? "").localeCompare(b.opened ?? ""));
    let got = 0;
    let cost = 0;
    let acquired: string | null = null;
    const taken: { lot: (typeof pool)[number]; qty: number }[] = [];
    for (const l of cands) {
      if (got >= u.shares - 1e-4) break;
      const take = Math.min(l.left, u.shares - got);
      got += take;
      cost += take * l.cps;
      taken.push({ lot: l, qty: take });
      if (l.opened && (!acquired || l.opened < acquired)) acquired = l.opened;
    }
    if (Math.abs(got - u.shares) > 1e-3) return null;
    for (const t of taken) t.lot.left -= t.qty;
    const cps = Math.round((cost / got) * 10_000) / 10_000;
    return { id: u.id, symbol: sym, shares: u.shares, soldAt: u.soldAt, closeDate: u.closeDate, costPerShare: cps, acquiredDate: acquired, gain: Math.round((u.soldAt * u.shares - cost) * 100) / 100 };
  };

  const proposals: BasisProposal[] = [];
  const unmatched: UnresolvedSale[] = [];
  for (const u of unresolved) {
    const p = match(u);
    if (p) proposals.push(p);
    else unmatched.push(u);
  }

  const claimed = new Set(unresolved.map((u) => u.id));
  const corrections: BasisCorrection[] = [];
  for (const e of entered) {
    if (claimed.has(e.id)) continue;
    const p = match(e);
    if (!p) continue; // not in this report: nothing to say about it
    const enteredGain = Math.round((e.soldAt - e.costPerShare) * e.shares * 100) / 100;
    const delta = Math.round((p.gain - enteredGain) * 100) / 100;
    if (Math.abs(delta) <= TOLERANCE) continue;
    corrections.push({ ...p, acquiredDate: p.acquiredDate ?? e.acquiredDate, enteredCost: e.costPerShare, enteredGain, delta });
  }
  corrections.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { proposals, unmatched, corrections };
}
