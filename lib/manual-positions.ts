// Manual positions: holdings the user tracks by hand because Schwab can't see
// them (another broker, a 401k window, a paper account). The app stores only
// the facts a broker can't look up — symbol, size, strike, expiry, what was
// paid or collected — in data/manual_positions.json. The bridge's
// manual_positions.py reads that file every cycle, prices every row from
// Schwab market data (mark, Greeks, IV, underlying), and writes
// data/manual/snapshot.json, which the snapshot loader merges like any other
// bridge's output. Server-only (touches the filesystem).
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/data-dirs";
import * as closed from "@/lib/manual-closed";

export const MANUAL_PATH = path.join(DATA_DIR, "manual_positions.json");

export interface ManualStock {
  id: string;
  type: "stock";
  symbol: string;
  qty: number;
  avgCost: number;
  openedAt?: string;
}

export interface ManualOption {
  id: string;
  type: "option";
  symbol: string;
  optionType: "put" | "call";
  side: "long" | "short";
  qty: number;
  strike: number;
  expiration: string; // YYYY-MM-DD
  premium: number; // per share, positive
  openedAt?: string;
}

export type ManualPosition = ManualStock | ManualOption;

// Omit distributed over the union: a plain Omit<ManualPosition, "id"> would keep
// only the keys the two shapes share and lose avgCost / strike / premium.
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type NewManualPosition = DistributiveOmit<ManualPosition, "id">;

export interface ManualAccount {
  id: string; // "manual-<slug>", stable — it is the account id in the snapshot
  label: string;
  cash: number;
  positions: ManualPosition[];
  updatedAt: string;
}

export interface ManualFile {
  version: 1;
  accounts: ManualAccount[];
}

export function readManualFile(): ManualFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(MANUAL_PATH, "utf8")) as ManualFile;
    if (parsed && Array.isArray(parsed.accounts)) return { version: 1, accounts: parsed.accounts };
  } catch {
    /* absent or malformed */
  }
  return { version: 1, accounts: [] };
}

function writeManualFile(doc: ManualFile): void {
  fs.mkdirSync(path.dirname(MANUAL_PATH), { recursive: true });
  const tmp = `${MANUAL_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
  fs.renameSync(tmp, MANUAL_PATH);
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function slugify(label: string): string {
  const s = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `manual-${s || "account"}`;
}

/** Create an account (id derived from the label, de-duplicated) or update its label/cash. */
export function upsertAccount(input: { id?: string; label: string; cash: number }): ManualAccount {
  const doc = readManualFile();
  const now = new Date().toISOString();
  if (input.id) {
    const acct = doc.accounts.find((a) => a.id === input.id);
    if (!acct) throw new Error("Unknown manual account.");
    acct.label = input.label;
    acct.cash = input.cash;
    acct.updatedAt = now;
    writeManualFile(doc);
    return acct;
  }
  let id = slugify(input.label);
  let n = 2;
  while (doc.accounts.some((a) => a.id === id)) id = `${slugify(input.label)}-${n++}`;
  const acct: ManualAccount = { id, label: input.label, cash: input.cash, positions: [], updatedAt: now };
  doc.accounts.push(acct);
  writeManualFile(doc);
  return acct;
}

/** Set an account's cash balance (from a form edit or an import's cash row). */
export function setAccountCash(id: string, cash: number): ManualAccount | null {
  const doc = readManualFile();
  const acct = doc.accounts.find((a) => a.id === id);
  if (!acct) return null;
  acct.cash = cash;
  acct.updatedAt = new Date().toISOString();
  writeManualFile(doc);
  return acct;
}

export function deleteAccount(id: string): void {
  const doc = readManualFile();
  doc.accounts = doc.accounts.filter((a) => a.id !== id);
  writeManualFile(doc);
}

/** Append rows to an account (or replace its rows). Rows get ids here. */
export function addPositions(accountId: string, rows: NewManualPosition[], replace = false): ManualAccount {
  const doc = readManualFile();
  const acct = doc.accounts.find((a) => a.id === accountId);
  if (!acct) throw new Error("Unknown manual account.");
  const stamped = rows.map((r) => ({ ...r, id: newId() }) as ManualPosition);
  acct.positions = replace ? stamped : [...acct.positions, ...stamped];
  acct.updatedAt = new Date().toISOString();
  writeManualFile(doc);
  return acct;
}

export function deletePosition(accountId: string, positionId: string): void {
  const doc = readManualFile();
  const acct = doc.accounts.find((a) => a.id === accountId);
  if (!acct) return;
  acct.positions = acct.positions.filter((p) => p.id !== positionId);
  acct.updatedAt = new Date().toISOString();
  writeManualFile(doc);
}

// ---- closing ------------------------------------------------------------------
export interface ClosePositionInput {
  closePrice: number; // per share; 0 for expired worthless
  closedAt: string; // YYYY-MM-DD
  fees?: number;
  expired?: boolean;
  assigned?: boolean; // short put assigned / covered call called away
  shares?: number; // stock only: how many sold (default all)
  netClosePerShare?: number; // spread only: net debit(+)/credit(−) to close both legs
  closeSpreadTogether?: boolean; // spread leg: close its partner leg too
}

export interface CloseResult {
  account: ManualAccount;
  booked: string; // human summary of what was recorded
}

/** Close one manual position: book the realized round-trip into the manual
 *  account's closed files and take the open row (or shares) off the account.
 *  Follows the bridge's conventions — see lib/manual-closed.ts. */
export function closePosition(accountId: string, positionId: string, input: ClosePositionInput): CloseResult {
  const doc = readManualFile();
  const acct = doc.accounts.find((a) => a.id === accountId);
  if (!acct) throw new Error("Unknown manual account.");
  const pos = acct.positions.find((p) => p.id === positionId);
  if (!pos) throw new Error("That position is no longer in the account.");
  const remove = new Set<string>([pos.id]);
  let booked = "";

  if (pos.type === "stock") {
    const shares = input.shares && input.shares > 0 ? Math.min(input.shares, pos.qty) : pos.qty;
    const rec = closed.closeStock(pos, shares, input, acct.label);
    booked = `${shares} ${pos.symbol} sold @ ${input.closePrice}: ${rec.realizedPnl >= 0 ? "+" : "−"}$${Math.abs(rec.realizedPnl)}`;
    if (shares < pos.qty) {
      remove.delete(pos.id);
      pos.qty -= shares;
    }
  } else {
    const partner = acct.positions.find(
      (p): p is ManualOption =>
        p.type === "option" && p.id !== pos.id && p.symbol === pos.symbol && p.optionType === pos.optionType && p.expiration === pos.expiration && p.side !== pos.side,
    );
    if (partner && input.closeSpreadTogether && input.netClosePerShare != null) {
      const shortLeg = pos.side === "short" ? pos : partner;
      const longLeg = pos.side === "short" ? partner : pos;
      const rec = closed.closeSpread(shortLeg, longLeg, input.netClosePerShare, input, acct.label);
      remove.add(partner.id);
      booked = `${pos.symbol} ${shortLeg.strike}/${longLeg.strike} spread: ${rec.realizedPnl >= 0 ? "+" : "−"}$${Math.abs(rec.realizedPnl)}`;
    } else if (pos.side === "short" && pos.optionType === "put") {
      const rec = closed.closeCsp(pos, input, acct.label);
      booked = rec.outcome === "assigned" ? `${pos.symbol} put assigned — premium folded into the shares' basis` : `${pos.symbol} put: ${rec.realizedPnl >= 0 ? "+" : "−"}$${Math.abs(rec.realizedPnl)}`;
      if (input.assigned) {
        // Take delivery: 100 shares per contract at the strike, basis net of the premium.
        acct.positions.push({
          id: newId(),
          type: "stock",
          symbol: pos.symbol,
          qty: 100 * pos.qty,
          avgCost: Math.round((pos.strike - pos.premium) * 100) / 100,
          openedAt: input.closedAt,
        });
        booked += `; ${100 * pos.qty} shares added @ ${(pos.strike - pos.premium).toFixed(2)}`;
      }
    } else if (pos.side === "short") {
      const rec = closed.closeCoveredCall(pos, input, acct.label);
      booked = `${pos.symbol} call: ${rec.realizedPnl >= 0 ? "+" : "−"}$${Math.abs(rec.realizedPnl)}`;
      if (input.assigned) {
        // Called away: the covering shares leave at the strike, booked as a stock sale.
        let toSell = 100 * pos.qty;
        for (const s of acct.positions) {
          if (toSell <= 0) break;
          if (s.type !== "stock" || s.symbol !== pos.symbol || s.qty <= 0) continue;
          const n = Math.min(s.qty, toSell);
          const rec2 = closed.closeStock(s, n, { closePrice: pos.strike, closedAt: input.closedAt }, acct.label);
          booked += `; ${n} shares called away @ ${pos.strike}: ${rec2.realizedPnl >= 0 ? "+" : "−"}$${Math.abs(rec2.realizedPnl)}`;
          s.qty -= n;
          if (s.qty === 0) remove.add(s.id);
          toSell -= n;
        }
      }
    } else {
      const rec = closed.closeLongOption(pos, input, acct.label);
      booked = `${pos.symbol} ${pos.optionType}: ${rec.realizedPnl >= 0 ? "+" : "−"}$${Math.abs(rec.realizedPnl)}`;
    }
  }

  acct.positions = acct.positions.filter((p) => !remove.has(p.id));
  acct.updatedAt = new Date().toISOString();
  writeManualFile(doc);
  return { account: acct, booked };
}

// ---- validation shared by the form and the importer ------------------------
const SYM = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Validate one incoming row; returns the clean row or an error message. */
export function validatePosition(raw: Record<string, unknown>): { row?: NewManualPosition; error?: string } {
  const symbol = String(raw.symbol ?? "").trim().toUpperCase();
  if (!SYM.test(symbol)) return { error: `"${symbol || "?"}" is not a valid symbol.` };
  const qty = Number(raw.qty);
  if (!Number.isFinite(qty) || qty <= 0) return { error: `${symbol}: quantity must be greater than 0.` };
  const openedAt = typeof raw.openedAt === "string" && ISO.test(raw.openedAt) ? raw.openedAt : undefined;

  if (raw.type === "stock") {
    const avgCost = Number(raw.avgCost);
    if (!Number.isFinite(avgCost) || avgCost < 0) return { error: `${symbol}: average cost must be a number ≥ 0.` };
    return { row: { type: "stock", symbol, qty, avgCost, openedAt } };
  }
  if (raw.type === "option") {
    const optionType = raw.optionType === "put" ? "put" : raw.optionType === "call" ? "call" : null;
    if (!optionType) return { error: `${symbol}: option type must be put or call.` };
    const side = raw.side === "short" ? "short" : raw.side === "long" ? "long" : null;
    if (!side) return { error: `${symbol}: side must be long (bought) or short (sold).` };
    const strike = Number(raw.strike);
    if (!Number.isFinite(strike) || strike <= 0) return { error: `${symbol}: strike must be greater than 0.` };
    const expiration = String(raw.expiration ?? "");
    if (!ISO.test(expiration)) return { error: `${symbol}: expiration must be a date.` };
    const premium = Math.abs(Number(raw.premium));
    if (!Number.isFinite(premium)) return { error: `${symbol}: premium must be a number.` };
    if (!Number.isInteger(qty)) return { error: `${symbol}: contracts must be a whole number.` };
    return { row: { type: "option", symbol, optionType, side, qty, strike, expiration, premium, openedAt } };
  }
  return { error: `${symbol}: each row must be a stock or an option.` };
}
