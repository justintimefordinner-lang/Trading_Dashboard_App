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
  shares?: number; // stock only: lets a sale be lined up with Schwab's lots
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
  const inRange = forAccount.filter((r) => r.closedAt >= from && r.closedAt <= to);
  const unstamped = inWindow.filter((r) => !r.accountId).length;

  // Where the app's own history begins: the earliest date on any trade it
  // rebuilt from Schwab's feeds. Hand-entered records don't count — a sale
  // added from 2019 doesn't mean the feeds reach 2019.
  const known = forAccount.filter((r) => !r.manual).flatMap((r) => [r.openedAt, r.closedAt]).filter((d): d is string => !!d);
  const historyStart = known.length ? known.reduce((a, b) => (a < b ? a : b)) : null;
  const before = historyStart ? report.lots.filter((l) => l.closed < historyStart) : [];
  const lots = historyStart ? report.lots.filter((l) => l.closed >= historyStart) : report.lots;
  // Both sides start at the same date: a sale added by hand from before the app's
  // history is set aside along with Schwab's lots from then.
  const scoped = historyStart ? inRange.filter((r) => r.closedAt >= historyStart) : inRange;

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
    else if (side === "stock" && b.manual > 0) reason = `Amounts differ, and ${b.manual === 1 ? "a sale here uses" : `${b.manual} sales here use`} a cost entered by hand. The summary of your hand-entered costs above says whether Schwab agrees with ${b.manual === 1 ? "it" : "them"}; if it does, the rest is sales the app never saw.${early}`;
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

// ---- stock sales: cost bases, corrections, and sales the app never saw ---------
export interface UnresolvedSale {
  id: string;
  symbol: string;
  shares: number;
  soldAt: number;
  closeDate: string;
  costPerShare?: number | null;
  acquiredDate?: string | null;
}

/** Something the user typed in, with the sale it belongs to: a cost basis for a
 *  sale the bridge found ("basis", manual_cost_basis.json) or a whole sale added by
 *  hand ("sale", manual_stock_sales.json). Both can be wrong in the same way. */
export interface EnteredBasis {
  id: string;
  kind?: "basis" | "sale";
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

/** An entered cost that Schwab's own lots disagree with. */
export interface BasisCorrection extends BasisProposal {
  kind: "basis" | "sale";
  enteredCost: number;
  enteredGain: number;
  delta: number; // gain with Schwab's cost − gain with the entered cost
}

/** An entered cost this report could not be checked against, and why. */
export interface NotFound {
  id: string;
  symbol: string;
  shares: number;
  closeDate: string;
  why: string;
}

/** A stock sale in Schwab's report with no counterpart in the app. */
export interface MissingSale {
  key: string;
  symbol: string;
  shares: number;
  soldDate: string;
  acquiredDate: string;
  proceedsPerShare: number;
  costPerShare: number;
  gain: number;
  beforeHistory: boolean;
}

export interface BasisReview {
  proposals: BasisProposal[];
  unmatched: UnresolvedSale[];
  corrections: BasisCorrection[];
  checked: { total: number; agree: number; differ: number; notFound: NotFound[] };
  missing: MissingSale[];
}

const DAY = 86_400_000;
const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;
const WINDOW_DAYS = 5; // an assignment's shares post a day or two after Schwab's lot date
const shiftDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Line the report's stock lots up against everything the app knows about stock
 *  sales, in order of how much each needs the lots:
 *
 *    1. sales the app couldn't cost          → propose a cost basis
 *    2. costs and sales the user typed in    → check them; the number Schwab used is
 *       the cost of the lots it actually sold, which under any lot method other than
 *       average is NOT the position's average cost — the usual way these are off
 *    3. sales the app rebuilt from the feeds → just use up their lots
 *
 *  Whatever lots are left over are sales Schwab has and the app doesn't: shares
 *  held since before the transaction feed begins and then sold or called away leave
 *  no trace in the app at all. Those come back as `missing`, ready to be added.
 *
 *  A lot is matched by symbol and sale date (within five days), nearest sale price
 *  first, and may be used in part. */
export function proposeCostBasis(
  unresolved: UnresolvedSale[],
  lots: SchwabLot[],
  entered: EnteredBasis[] = [],
  records: AppClosed[] = [],
  historyStart: string | null = null,
): BasisReview {
  const pool = lots.filter((l) => !l.isOption && l.qty > 0).map((l) => ({ ...l, left: l.qty, cps: l.cost / l.qty, pps: l.proceeds / l.qty }));
  type Lot = (typeof pool)[number];

  const candidates = (sym: string, date: string, price: number | null): Lot[] =>
    pool
      .filter((l) => l.root === sym && l.left > 1e-4 && daysApart(l.closed, date) <= WINDOW_DAYS)
      .sort((a, b) => (price == null ? 0 : Math.abs(a.pps - price) - Math.abs(b.pps - price)) || daysApart(a.closed, date) - daysApart(b.closed, date) || (a.opened ?? "").localeCompare(b.opened ?? ""));

  // Take `shares` from the lots near this sale. Complete matches only, unless `partial`.
  const take = (sym: string, date: string, shares: number, price: number | null, partial = false) => {
    let got = 0;
    let cost = 0;
    let acquired: string | null = null;
    const taken: { lot: Lot; qty: number }[] = [];
    for (const l of candidates(sym, date, price)) {
      if (got >= shares - 1e-4) break;
      const q = Math.min(l.left, shares - got);
      got += q;
      cost += q * l.cps;
      taken.push({ lot: l, qty: q });
      if (l.opened && (!acquired || l.opened < acquired)) acquired = l.opened;
    }
    const complete = Math.abs(got - shares) <= 1e-3;
    if (!complete && !partial) return null;
    for (const t of taken) t.lot.left -= t.qty;
    return { got, cost, acquired };
  };

  const match = (u: UnresolvedSale): BasisProposal | null => {
    const sym = u.symbol.toUpperCase();
    const m = take(sym, u.closeDate, u.shares, u.soldAt);
    if (!m) return null;
    const cps = Math.round((m.cost / m.got) * 10_000) / 10_000;
    return { id: u.id, symbol: sym, shares: u.shares, soldAt: u.soldAt, closeDate: u.closeDate, costPerShare: cps, acquiredDate: m.acquired, gain: Math.round((u.soldAt * u.shares - m.cost) * 100) / 100 };
  };

  // Why an entered cost couldn't be checked: say what the report does hold for that symbol.
  const explain = (e: EnteredBasis): string => {
    const sym = e.symbol.toUpperCase();
    const same = lots.filter((l) => !l.isOption && l.root === sym);
    if (same.length === 0) return `this report has no ${sym} stock sales at all`;
    const near = same.filter((l) => daysApart(l.closed, e.closeDate) <= WINDOW_DAYS);
    if (near.length === 0) {
      const nearest = same.reduce((a, b) => (daysApart(a.closed, e.closeDate) <= daysApart(b.closed, e.closeDate) ? a : b));
      return `Schwab's nearest ${sym} sale is ${nearest.closed}, ${Math.round(daysApart(nearest.closed, e.closeDate))} days away`;
    }
    const qty = near.reduce((s, l) => s + l.qty, 0);
    return `Schwab shows ${qty.toLocaleString()} sh sold around then, not ${e.shares.toLocaleString()}`;
  };

  // 1. sales with no cost at all
  const proposals: BasisProposal[] = [];
  const unmatched: UnresolvedSale[] = [];
  for (const u of unresolved) {
    const p = match(u);
    if (p) proposals.push(p);
    else unmatched.push(u);
  }

  // 2. what the user typed in
  const claimed = new Set(unresolved.map((u) => u.id));
  const corrections: BasisCorrection[] = [];
  const notFound: NotFound[] = [];
  let agree = 0;
  let total = 0;
  for (const e of entered) {
    if (claimed.has(e.id)) continue;
    total += 1;
    const p = match(e);
    if (!p) {
      notFound.push({ id: e.id, symbol: e.symbol.toUpperCase(), shares: e.shares, closeDate: e.closeDate, why: explain(e) });
      continue;
    }
    const enteredGain = Math.round((e.soldAt - e.costPerShare) * e.shares * 100) / 100;
    const delta = Math.round((p.gain - enteredGain) * 100) / 100;
    if (Math.abs(delta) <= TOLERANCE) {
      agree += 1;
      continue;
    }
    corrections.push({ ...p, kind: e.kind ?? "basis", acquiredDate: p.acquiredDate ?? e.acquiredDate, enteredCost: e.costPerShare, enteredGain, delta });
  }
  corrections.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // 3. sales the app rebuilt itself. A hand-entered record was handled above.
  for (const r of records) {
    if (r.kind !== "stock" || r.manual || !r.shares) continue;
    take(r.symbol.toUpperCase(), r.closedAt, r.shares, null, true);
  }

  // What's left. An entry that couldn't be lined up may BE one of these lots, so
  // anything near it stays out: adding it would count that sale twice.
  const unsure = [...notFound, ...unmatched.map((u) => ({ symbol: u.symbol.toUpperCase(), closeDate: u.closeDate }))];
  const shadowed = (l: Lot) => unsure.some((n) => n.symbol === l.root && daysApart(l.closed, n.closeDate) <= 45);
  const groups = new Map<string, { lots: Lot[]; qty: number; proceeds: number; cost: number }>();
  for (const l of pool) {
    if (l.left <= 1e-3 || shadowed(l)) continue;
    const longTerm = l.opened ? daysApart(l.opened, l.closed) > 365 : /long/i.test(l.term);
    const key = `${l.root}|${l.closed}|${longTerm ? "L" : "S"}`;
    const g = groups.get(key) ?? { lots: [], qty: 0, proceeds: 0, cost: 0 };
    g.lots.push(l);
    g.qty += l.left;
    g.proceeds += l.left * l.pps;
    g.cost += l.left * l.cps;
    groups.set(key, g);
  }
  const missing: MissingSale[] = [];
  for (const [key, g] of groups) {
    const [symbol, soldDate, bucket] = key.split("|");
    const opened = g.lots.map((l) => l.opened).filter((d): d is string => !!d).sort();
    // Schwab prints no open date for some lots; keep the holding period it reported.
    const acquiredDate = opened[0] ?? shiftDays(soldDate, bucket === "L" ? -366 : 0);
    missing.push({
      key,
      symbol,
      shares: Math.round(g.qty * 10_000) / 10_000,
      soldDate,
      acquiredDate,
      proceedsPerShare: Math.round((g.proceeds / g.qty) * 10_000) / 10_000,
      costPerShare: Math.round((g.cost / g.qty) * 10_000) / 10_000,
      gain: Math.round((g.proceeds - g.cost) * 100) / 100,
      beforeHistory: !!historyStart && soldDate < historyStart,
    });
  }
  missing.sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));

  return { proposals, unmatched, corrections, checked: { total, agree, differ: corrections.length, notFound }, missing };
}
