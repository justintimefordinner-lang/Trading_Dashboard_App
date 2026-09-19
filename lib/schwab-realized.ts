// Parser for Schwab's "Realized Gain/Loss — Lot Details" export (Accounts →
// History → Realized Gain/Loss → Export). Pure and client-safe: the file is
// read in the browser and never uploaded anywhere.
//
// Shape of the file: a title row ("Realized Gain/Loss - Lot Details for
// <account> as of … from 01/01/2026 to 09/19/2026"), then a header row, then
// one row per tax lot. Option lots carry the whole contract in the Symbol cell
// ("HOOD 08/14/2026 95.00 P"); stock lots carry the ticker. The figures are
// Schwab's TAX figures: proceeds and cost are net of fees, an assigned option
// has no lot of its own (its premium is folded into the shares), and a
// wash-sale lot reports the disallowed part of its loss separately.
import { normHeader, parseCsv, parseDate, parseNumber } from "@/lib/csv-import";

export interface SchwabLot {
  symbol: string; // as printed
  root: string; // underlying / ticker
  isOption: boolean;
  expiration?: string;
  strike?: number;
  putCall?: "P" | "C";
  closed: string; // YYYY-MM-DD
  opened: string | null;
  qty: number;
  proceeds: number;
  cost: number;
  gain: number;
  washSale: boolean;
  disallowed: number;
  term: string;
}

export interface SchwabReport {
  account: string | null;
  from: string | null;
  to: string | null;
  lots: SchwabLot[];
}

const OPTION_SYMBOL = /^(\S+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.]+)\s+([PC])$/;

export function parseSchwabRealized(text: string): SchwabReport | { error: string } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: "That file is empty." };
  const title = rows[0]?.[0] ?? "";
  const tm = title.match(/for\s+(.+?)\s+as of .*?from\s+(\d{2}\/\d{2}\/\d{4})\s+to\s+(\d{2}\/\d{2}\/\d{4})/i);

  const hi = rows.findIndex((r) => r.some((c) => normHeader(c) === "symbol") && r.some((c) => normHeader(c).startsWith("gainloss")));
  if (hi < 0) return { error: "This doesn't look like Schwab's Realized Gain/Loss export (no Symbol and Gain/Loss columns)." };
  const hdr = rows[hi].map((c) => normHeader(c));
  const col = (...names: string[]) => hdr.findIndex((h) => names.includes(h));
  const iSym = col("symbol");
  const iClosed = col("closeddate");
  const iOpened = col("openeddate");
  const iQty = col("quantity");
  const iProceeds = col("proceeds");
  const iCost = col("costbasiscb", "costbasis");
  const iGain = col("gainloss");
  const iWash = col("washsale");
  const iDis = col("disallowedloss");
  const iTerm = col("term");
  if ([iSym, iClosed, iQty, iProceeds, iCost, iGain].some((i) => i < 0)) {
    return { error: "Expected the Lot Details export: Symbol, Closed Date, Quantity, Proceeds, Cost Basis and Gain/Loss columns." };
  }

  const lots: SchwabLot[] = [];
  for (const r of rows.slice(hi + 1)) {
    const symbol = (r[iSym] ?? "").trim();
    const closed = parseDate(r[iClosed]);
    const qty = parseNumber(r[iQty]);
    if (!symbol || !closed || qty == null || /^total/i.test(symbol)) continue;
    const m = symbol.match(OPTION_SYMBOL);
    lots.push({
      symbol,
      root: (m ? m[1] : symbol).toUpperCase(),
      isOption: !!m,
      expiration: m ? parseDate(m[2]) ?? undefined : undefined,
      strike: m ? Number(m[3]) : undefined,
      putCall: m ? (m[4] as "P" | "C") : undefined,
      closed,
      opened: iOpened >= 0 ? parseDate(r[iOpened]) : null,
      qty: Math.abs(qty),
      proceeds: parseNumber(r[iProceeds]) ?? 0,
      cost: parseNumber(r[iCost]) ?? 0,
      gain: parseNumber(r[iGain]) ?? 0,
      washSale: iWash >= 0 && /^y/i.test((r[iWash] ?? "").trim()),
      disallowed: iDis >= 0 ? Math.abs(parseNumber(r[iDis]) ?? 0) : 0,
      term: iTerm >= 0 ? (r[iTerm] ?? "").trim() : "",
    });
  }
  if (lots.length === 0) return { error: "No lots found under the header row." };
  return {
    account: tm ? tm[1].replace(/_/g, " ") : null,
    from: tm ? parseDate(tm[2]) : null,
    to: tm ? parseDate(tm[3]) : null,
    lots,
  };
}
