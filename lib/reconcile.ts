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
import type { SchwabLot, SchwabReport } from "@/lib/schwab-realized";

export interface AppClosed {
  kind: "csp" | "covered" | "leap" | "spread" | "stock";
  symbol: string;
  closedAt: string;
  realizedPnl: number;
  outcome: string;
  accountId?: string;
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
  schwab: { total: number; options: number; stock: number; lots: number };
  app: { total: number; options: number; stock: number; records: number; unstamped: number };
  bySymbol: SymbolDiff[]; // only rows off by more than the tolerance, largest first
  byMonth: { month: string; schwab: number; app: number; diff: number }[];
  washSales: { lots: number; disallowed: number };
  matchedSymbols: number; // symbols within tolerance
}

const TOLERANCE = 5; // dollars: fees and rounding on a symbol's total

export function reconcile(report: SchwabReport, records: AppClosed[], accountId: string | null): Reconciliation {
  const dates = report.lots.map((l) => l.closed).sort();
  const from = report.from ?? dates[0];
  const to = report.to ?? dates[dates.length - 1];
  const inWindow = records.filter((r) => r.closedAt >= from && r.closedAt <= to);
  const scoped = accountId ? inWindow.filter((r) => r.accountId === accountId) : inWindow;
  const unstamped = inWindow.filter((r) => !r.accountId).length;

  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const sOpt = sum(report.lots.filter((l) => l.isOption).map((l) => l.gain));
  const sStk = sum(report.lots.filter((l) => !l.isOption).map((l) => l.gain));
  const aOpt = sum(scoped.filter((r) => r.kind !== "stock").map((r) => r.realizedPnl));
  const aStk = sum(scoped.filter((r) => r.kind === "stock").map((r) => r.realizedPnl));

  // by symbol, options and stock separately
  const bucket = new Map<string, { schwab: number; app: number; assigned: number; wash: number }>();
  const slot = (k: string) => {
    let b = bucket.get(k);
    if (!b) bucket.set(k, (b = { schwab: 0, app: 0, assigned: 0, wash: 0 }));
    return b;
  };
  for (const l of report.lots) {
    const b = slot(`${l.isOption ? "options" : "stock"}|${l.root}`);
    b.schwab += l.gain;
    if (l.washSale) b.wash += l.disallowed;
  }
  for (const r of scoped) {
    const b = slot(`${r.kind === "stock" ? "stock" : "options"}|${r.symbol.toUpperCase()}`);
    b.app += r.realizedPnl;
    if (r.outcome === "assigned") b.assigned += 1;
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
    let reason: string;
    if (b.app === 0 && side === "stock") reason = "Not in the app: the shares were bought before its history begins, or the sale needs a cost basis.";
    else if (b.app === 0) reason = "Not in the app: these closes aren't in its order or transaction history.";
    else if (b.schwab === 0) reason = side === "options" ? "Only in the app: likely an assignment older than the transactions feed, booked as expired." : "Only in the app: check the account filter.";
    else if (b.wash > 0 && Math.abs(diff + b.wash) <= Math.max(TOLERANCE, b.wash * 0.05)) reason = `Wash sales: Schwab disallowed ${Math.round(b.wash).toLocaleString()} of loss here. A tax adjustment, not a P&L error.`;
    else if (b.wash > 0) reason = `Partly wash sales (${Math.round(b.wash).toLocaleString()} disallowed); the rest is lot matching or a missing fill.`;
    else if (side === "stock") reason = "Amounts differ: usually cost basis (assignment premium, a manual basis) or a missing purchase.";
    else reason = "Amounts differ: usually a close the app never saw, so it booked the option as expired.";
    bySymbol.push({ symbol, side, schwab: b.schwab, app: b.app, diff, reason });
  }
  bySymbol.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const months = new Map<string, { schwab: number; app: number }>();
  for (const l of report.lots) {
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
    schwab: { total: sOpt + sStk, options: sOpt, stock: sStk, lots: report.lots.length },
    app: { total: aOpt + aStk, options: aOpt, stock: aStk, records: scoped.length, unstamped },
    bySymbol,
    byMonth: [...months.entries()].sort().map(([month, v]) => ({ month, schwab: v.schwab, app: v.app, diff: v.app - v.schwab })),
    washSales: { lots: report.lots.filter((l) => l.washSale).length, disallowed: sum(report.lots.map((l) => l.disallowed)) },
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

const DAY = 86_400_000;
const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;

/** For each sale the app couldn't cost, find the report's stock lots for the
 *  same symbol sold within five days (assignment sales post a day or two after
 *  Schwab's lot date), nearest sale price first, consuming part of a lot when
 *  the sale is smaller. Only complete matches are proposed. */
export function proposeCostBasis(unresolved: UnresolvedSale[], lots: SchwabLot[]): { proposals: BasisProposal[]; unmatched: UnresolvedSale[] } {
  const pool = lots.filter((l) => !l.isOption && l.qty > 0).map((l) => ({ ...l, left: l.qty, cps: l.cost / l.qty, pps: l.proceeds / l.qty }));
  const proposals: BasisProposal[] = [];
  const unmatched: UnresolvedSale[] = [];
  for (const u of unresolved) {
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
    if (Math.abs(got - u.shares) > 1e-3) {
      unmatched.push(u);
      continue;
    }
    for (const t of taken) t.lot.left -= t.qty;
    const cps = Math.round((cost / got) * 10_000) / 10_000;
    proposals.push({ id: u.id, symbol: sym, shares: u.shares, soldAt: u.soldAt, closeDate: u.closeDate, costPerShare: cps, acquiredDate: acquired, gain: Math.round((u.soldAt * u.shares - cost) * 100) / 100 });
  }
  return { proposals, unmatched };
}
