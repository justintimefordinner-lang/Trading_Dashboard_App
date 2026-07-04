import type { OptionPosition } from "./types";
import type { Spread } from "./spread";

const money = (n: number) => "$" + Math.round(n).toLocaleString();
const strikeStr = (n: number) => "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const expStr = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// A paste-ready one-liner for an option position, e.g.:
//   SOLD TO OPEN — IREN (4 contracts) $48P · Jul 17 · 18 delta · $792 collected ($1.98/ct) · 4.1% ROI — Why:
// Short positions read "SOLD TO OPEN / collected / ROI"; long positions read
// "BOUGHT TO OPEN / paid" (no ROI, since open is a debit). Trailing " — Why:" is a
// prompt for the rationale you type in after pasting.
export function formatPositionCopy(o: OptionPosition): string {
  const t = o.optionType === "put" ? "P" : "C";
  const contracts = `${o.qty} contract${o.qty === 1 ? "" : "s"}`;
  const delta = `${Math.round(Math.abs(o.delta) * 100)} delta`;
  const head = `${o.symbol} (${contracts}) ${strikeStr(o.strike)}${t} · ${expStr(o.expiration)} · ${delta}`;
  const total = o.entryPerShare * 100 * o.qty;
  const perCt = `$${o.entryPerShare.toFixed(2)}/ct`;

  if (o.side === "short") {
    const denom = o.strike * 100 * o.qty; // collateral (CSP) / notional (covered call)
    const roi = denom > 0 ? (total / denom) * 100 : 0;
    return `SOLD TO OPEN — ${head} · ${money(total)} collected (${perCt}) · ${roi.toFixed(1)}% ROI — Why:`;
  }
  return `BOUGHT TO OPEN — ${head} · ${money(total)} paid (${perCt}) — Why:`;
}

// Paste-ready line for a complete vertical, e.g.:
//   SOLD TO OPEN — AMD (2 contracts) $120/$115 put spread · Jul 17 · 30 delta · $230 collected ($1.15/ct) · 29.9% ROI — Why:
// Credit spreads (net credit ≥ 0) read SOLD TO OPEN / collected / ROI (credit ÷ max
// risk); debit spreads read BOUGHT TO OPEN / paid. Delta is the short leg's — the
// assignment-risk strike. Strikes are short/long, in that order.
export function formatSpreadCopy(sp: Spread): string {
  const t = sp.optionType === "put" ? "put spread" : "call spread";
  const contracts = `${sp.qty} contract${sp.qty === 1 ? "" : "s"}`;
  const delta = `${Math.round(Math.abs(sp.short.delta) * 100)} delta`;
  const strikes = `${strikeStr(sp.shortStrike)}/${strikeStr(sp.longStrike)}`;
  const head = `${sp.symbol} (${contracts}) ${strikes} ${t} · ${expStr(sp.expiration)} · ${delta}`;
  const perCt = `$${Math.abs(sp.netCredit).toFixed(2)}/ct`;

  if (sp.netCredit >= 0) {
    const roi = sp.collateral > 0 ? (sp.maxProfit / sp.collateral) * 100 : 0;
    return `SOLD TO OPEN — ${head} · ${money(sp.maxProfit)} collected (${perCt}) · ${roi.toFixed(1)}% ROI — Why:`;
  }
  const paid = Math.abs(sp.netCredit) * 100 * sp.qty;
  return `BOUGHT TO OPEN — ${head} · ${money(paid)} paid (${perCt}) — Why:`;
}
