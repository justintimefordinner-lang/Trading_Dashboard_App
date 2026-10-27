// Which shares a stock sale sold, as Schwab reports it. The bridge matches every
// sale against the oldest shares first; Schwab sells whichever tax lots the
// account's lot method picks (often the highest-cost ones). On a partial sale the
// two disagree on cost and so on realized P&L, though not on the position's total.
// An override, saved from Reconcile, replaces the bridge's records for one sale
// with Schwab's lots. The sale price stays the app's; only the cost changes.
//
// Pure and client-safe; the file itself (data/stock_lot_overrides.json) is read and
// written in lib/bridge-files.ts.
import type { ClosedStock } from "./types";

export interface OverrideLot {
  shares: number;
  costPerShare: number;
  acquiredDate: string | null;
}

export interface LotOverride {
  key: string; // "SYMBOL|closeDate|accountId"
  symbol: string;
  closeDate: string; // YYYY-MM-DD
  accountId: string | null;
  shares: number; // the whole sale: must equal what the bridge booked that day
  closePrice: number; // the app's own sale price, kept
  lots: OverrideLot[];
}

export const overrideKey = (symbol: string, closeDate: string, accountId: string | null | undefined) => `${symbol.toUpperCase()}|${closeDate}|${accountId ?? ""}`;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const DAY = 86_400_000;

/** Swap the bridge's records for each overridden sale with Schwab's lots. A sale
 *  is the bridge's (not hand-entered) long records of one symbol closed on one day
 *  in one account. If those no longer add up to the override's shares (the bridge
 *  re-read history differently) the override is skipped and the bridge stands. */
export function applyLotOverrides(closed: ClosedStock[], overrides: LotOverride[]): ClosedStock[] {
  if (overrides.length === 0) return closed;
  let out = closed;
  for (const o of overrides) {
    const sale = out.filter(
      (r) => !r.manualBasis && !r.manualEntry && !r.schwabLots && r.side === "long" && r.symbol.toUpperCase() === o.symbol && r.closedAt.slice(0, 10) === o.closeDate && (r.accountId ?? null) === o.accountId,
    );
    const booked = sale.reduce((s, r) => s + r.shares, 0);
    if (sale.length === 0 || Math.abs(booked - o.shares) > 1e-3) continue;
    const first = sale[0];
    const built = o.lots.map((l, i): ClosedStock => {
      const costBasis = l.costPerShare * l.shares;
      const proceeds = o.closePrice * l.shares;
      const realized = proceeds - costBasis;
      const days = l.acquiredDate ? Math.max(1, Math.round((Date.parse(`${o.closeDate}T00:00:00Z`) - Date.parse(`${l.acquiredDate}T00:00:00Z`)) / DAY)) : first.daysHeld;
      const ret = costBasis ? realized / costBasis : 0;
      return {
        id: `${o.symbol}-schwab-lots-${o.closeDate}-${i}`,
        accountId: first.accountId,
        symbol: first.symbol,
        name: first.name,
        side: "long",
        shares: l.shares,
        avgOpen: r4(l.costPerShare),
        avgClose: r4(o.closePrice),
        costBasis: r2(costBasis),
        proceeds: r2(proceeds),
        realizedPnl: r2(realized),
        outcome: realized >= 0 ? "closed_profit" : "closed_loss",
        openedAt: l.acquiredDate ?? first.openedAt,
        closedAt: first.closedAt,
        daysHeld: days,
        returnPct: r4(ret),
        annualized: r4((ret * 365) / days),
        schwabLots: true,
      };
    });
    const drop = new Set(sale);
    out = [...out.filter((r) => !drop.has(r)), ...built];
  }
  return out;
}
