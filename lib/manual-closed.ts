// Closing a manual position books a realized round-trip into the manual
// account's own closed-trade files — data/manual/{csp,covered,leaps,spreads,
// stocks}-closed.json — in exactly the shapes the bridge writes for Schwab,
// so the P&L page's Realized lens, win rate and cumulative chart pick them up
// through the same loaders. Conventions follow closed_trades.py:
//   * days held is at least 1; annualized = return × 365 ÷ days
//   * an assigned put books ZERO realized gain — the premium folds into the
//     assigned shares' cost basis instead (otherwise it double-counts)
//   * fees, when given, come straight off the realized figure
// Server-only (touches the filesystem).
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/data-dirs";
import type { ManualOption, ManualStock } from "@/lib/manual-positions";
import type { ClosedCSP, ClosedCoveredCall, ClosedLeap, ClosedSpread, ClosedStock } from "@/lib/types";

export const MANUAL_DIR = path.join(DATA_DIR, "manual");

type ClosedFile<T> = { meta: { generatedAt: string; source: string; note?: string }; closed: T[] };

function appendClosed<T>(file: string, record: T): void {
  const p = path.join(MANUAL_DIR, file);
  let doc: ClosedFile<T> = { meta: { generatedAt: "", source: "manual", note: "Closed by hand on the Settings page" }, closed: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as ClosedFile<T>;
    if (parsed && Array.isArray(parsed.closed)) doc = parsed;
  } catch {
    /* first record */
  }
  doc.closed.push(record);
  doc.meta.generatedAt = new Date().toISOString();
  doc.meta.source = "manual";
  fs.mkdirSync(MANUAL_DIR, { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
  fs.renameSync(tmp, p);
}

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
export function daysHeld(openedAt: string | undefined, closedAt: string): number {
  if (!openedAt) return 1;
  const d = Math.round((Date.parse(`${closedAt}T00:00:00Z`) - Date.parse(`${openedAt}T00:00:00Z`)) / DAY);
  return Math.max(1, Number.isFinite(d) ? d : 1);
}
const annualize = (ret: number, days: number) => r4((ret * 365) / days);
const winLoss = (pnl: number): "closed_profit" | "closed_loss" => (pnl >= 0 ? "closed_profit" : "closed_loss");

export interface CloseInput {
  closePrice: number; // per share (0 for expired worthless)
  closedAt: string; // YYYY-MM-DD
  fees?: number; // total $ commissions/fees for the round trip
  expired?: boolean;
  assigned?: boolean; // short put assigned / covered call called away
}

/** Short put → csp-closed.json. */
export function closeCsp(o: ManualOption, input: CloseInput, accountLabel: string): ClosedCSP {
  const credit = o.premium * 100 * o.qty;
  const cost = input.closePrice * 100 * o.qty;
  const fees = input.fees ?? 0;
  const collateral = o.strike * 100 * o.qty;
  const days = daysHeld(o.openedAt, input.closedAt);
  let realized = credit - cost - fees;
  let roc = collateral ? realized / collateral : 0;
  let outcome: ClosedCSP["outcome"];
  if (input.assigned) {
    outcome = "assigned";
    realized = 0;
    roc = 0;
  } else outcome = input.expired ? "expired" : winLoss(realized);
  const rec: ClosedCSP = {
    id: `manual:${o.id}`,
    symbol: o.symbol,
    name: `${o.symbol} · ${accountLabel}`,
    strike: o.strike,
    expiration: o.expiration,
    openedAt: o.openedAt ?? input.closedAt,
    closedAt: input.closedAt,
    contracts: o.qty,
    creditPerShare: r2(o.premium),
    creditReceived: r2(credit),
    costToClose: r2(cost),
    realizedPnl: r2(realized),
    outcome,
    daysHeld: days,
    collateral: r2(collateral),
    returnOnCollateral: r4(roc),
    annualized: annualize(roc, days),
  };
  appendClosed("csp-closed.json", rec);
  return rec;
}

/** Short call → covered-closed.json (covered or not; return is on notional either way). */
export function closeCoveredCall(o: ManualOption, input: CloseInput, accountLabel: string): ClosedCoveredCall {
  const credit = o.premium * 100 * o.qty;
  const cost = input.assigned ? 0 : input.closePrice * 100 * o.qty;
  const fees = input.fees ?? 0;
  const notional = o.strike * 100 * o.qty;
  const days = daysHeld(o.openedAt, input.closedAt);
  const realized = credit - cost - fees;
  const ret = notional ? realized / notional : 0;
  const rec: ClosedCoveredCall = {
    id: `manual:${o.id}`,
    symbol: o.symbol,
    name: `${o.symbol} · ${accountLabel}`,
    strike: o.strike,
    expiration: o.expiration,
    openedAt: o.openedAt ?? input.closedAt,
    closedAt: input.closedAt,
    contracts: o.qty,
    creditPerShare: r2(o.premium),
    creditReceived: r2(credit),
    costToClose: r2(cost),
    realizedPnl: r2(realized),
    outcome: input.expired || input.assigned ? "expired" : winLoss(realized),
    daysHeld: days,
    returnOnNotional: r4(ret),
    annualized: annualize(ret, days),
  };
  appendClosed("covered-closed.json", rec);
  return rec;
}

/** Any long option → leaps-closed.json (the file carries optionType). */
export function closeLongOption(o: ManualOption, input: CloseInput, accountLabel: string): ClosedLeap {
  const costBasis = o.premium * 100 * o.qty;
  const proceeds = input.closePrice * 100 * o.qty;
  const fees = input.fees ?? 0;
  const days = daysHeld(o.openedAt, input.closedAt);
  const realized = proceeds - costBasis - fees;
  const ret = costBasis ? realized / costBasis : 0;
  const rec: ClosedLeap = {
    id: `manual:${o.id}`,
    symbol: o.symbol,
    name: `${o.symbol} · ${accountLabel}`,
    optionType: o.optionType,
    strike: o.strike,
    expiration: o.expiration,
    openedAt: o.openedAt ?? input.closedAt,
    closedAt: input.closedAt,
    contracts: o.qty,
    entryPerShare: r2(o.premium),
    costBasis: r2(costBasis),
    proceeds: r2(proceeds),
    realizedPnl: r2(realized),
    outcome: input.expired ? "expired" : winLoss(realized),
    daysHeld: days,
    returnPct: r4(ret),
    annualized: annualize(ret, days),
  };
  appendClosed("leaps-closed.json", rec);
  return rec;
}

/** A vertical (short + long leg, same type and expiry) closed together at a net price. */
export function closeSpread(shortLeg: ManualOption, longLeg: ManualOption, netClosePerShare: number, input: CloseInput, accountLabel: string): ClosedSpread {
  const contracts = Math.min(shortLeg.qty, longLeg.qty);
  const netOpenPerShare = shortLeg.premium - longLeg.premium; // + credit, − debit
  const netOpen = netOpenPerShare * 100 * contracts;
  // netClosePerShare is what it costs to close (+ debit paid, − credit received).
  const netClose = netClosePerShare * 100 * contracts;
  const fees = input.fees ?? 0;
  const realized = netOpen - netClose - fees;
  const width = Math.abs(shortLeg.strike - longLeg.strike);
  const isCredit = netOpenPerShare >= 0;
  const maxRisk = (isCredit ? width - netOpenPerShare : -netOpenPerShare) * 100 * contracts;
  const days = daysHeld(shortLeg.openedAt ?? longLeg.openedAt, input.closedAt);
  const ret = maxRisk ? realized / maxRisk : 0;
  const rec: ClosedSpread = {
    id: `manual:${shortLeg.id}+${longLeg.id}`,
    symbol: shortLeg.symbol,
    name: `${shortLeg.symbol} · ${accountLabel}`,
    optionType: shortLeg.optionType,
    shortStrike: shortLeg.strike,
    longStrike: longLeg.strike,
    width,
    expiration: shortLeg.expiration,
    openedAt: shortLeg.openedAt ?? longLeg.openedAt ?? input.closedAt,
    closedAt: input.closedAt,
    contracts,
    isCredit,
    netCreditPerShare: r2(netOpenPerShare),
    netOpen: r2(netOpen),
    netClose: r2(netClose),
    realizedPnl: r2(realized),
    maxRisk: r2(maxRisk),
    outcome: input.expired ? "expired" : winLoss(realized),
    daysHeld: days,
    returnOnRisk: r4(ret),
    annualized: annualize(ret, days),
  };
  appendClosed("spreads-closed.json", rec);
  return rec;
}

/** Shares sold (all or some) → stocks-closed.json. */
export function closeStock(s: ManualStock, shares: number, input: CloseInput, accountLabel: string): ClosedStock {
  const costBasis = s.avgCost * shares;
  const proceeds = input.closePrice * shares;
  const fees = input.fees ?? 0;
  const realized = proceeds - costBasis - fees;
  const days = daysHeld(s.openedAt, input.closedAt);
  const ret = costBasis ? realized / costBasis : 0;
  const rec: ClosedStock = {
    id: `manual:${s.id}:${input.closedAt}`,
    symbol: s.symbol,
    name: `${s.symbol} · ${accountLabel}`,
    side: "long",
    shares: r4(shares),
    avgOpen: r4(s.avgCost),
    avgClose: r4(input.closePrice),
    costBasis: r2(costBasis),
    proceeds: r2(proceeds),
    realizedPnl: r2(realized),
    outcome: winLoss(realized),
    openedAt: s.openedAt ?? input.closedAt,
    closedAt: input.closedAt,
    daysHeld: days,
    returnPct: r4(ret),
    annualized: annualize(ret, days),
  };
  appendClosed("stocks-closed.json", rec);
  return rec;
}
