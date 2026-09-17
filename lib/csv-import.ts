// Spreadsheet import for manual positions. Pure functions, safe on the client:
// parse a CSV, work out which column is which from header names AND from the
// values in them, and turn rows into manual-position rows. Anything it can't
// find on its own comes back as a question for the user ("we couldn't find
// Strike — is it one of these unused columns?"), which the import dialog asks.
//
// Two facts about broker exports drive the design. First, headers vary wildly
// but cluster around a few words (Qty / Quantity / Contracts / Shares), so a
// synonym table catches most of them. Second, most exports don't carry
// strike, expiry and put/call as separate columns at all — they encode the
// whole contract in a Symbol or Description cell, in OCC form
// ("SOFI  261009P00016000"), a broker's shorthand ("-SOFI261009P16"), or in
// words ("SOFI Oct 09 '26 $16 Put"). Parsing that cell makes those columns
// optional, which is the difference between "works on E*TRADE's export" and
// "works only on our own template".

export type Field =
  | "symbol" | "description" | "quantity" | "entry" | "costTotal"
  | "optionType" | "side" | "strike" | "expiration" | "assetType" | "openedAt";

export const FIELD_LABEL: Record<Field, string> = {
  symbol: "Symbol",
  description: "Description",
  quantity: "Quantity",
  entry: "Price paid / premium",
  costTotal: "Cost basis (total)",
  optionType: "Put or call",
  side: "Side (bought / sold)",
  strike: "Strike",
  expiration: "Expiration",
  assetType: "Asset type",
  openedAt: "Opened date",
};

// What each field means to a user, shown in the "columns we need" intro.
export const FIELD_HELP: Record<Field, string> = {
  symbol: "the ticker, or a full option symbol like SOFI 261009P00016000",
  description: "a text description of the position; used to read the contract if the symbol is only the ticker",
  quantity: "shares, or contracts for options; negative or a Side column marks a sold option",
  entry: "per-share price paid for stock, or premium per share for options",
  costTotal: "total cost basis, used to work out the per-share price when that column is missing",
  optionType: "put or call, if the symbol doesn't say",
  side: "long / short, bought / sold, or buy / sell",
  strike: "strike price, if the symbol doesn't say",
  expiration: "expiration date, if the symbol doesn't say",
  assetType: "stock / option, if the file mixes both and the symbol doesn't say",
  openedAt: "the date the position was opened, for days-in-trade",
};

// Header synonyms, matched after normalising (lowercase, letters and digits only).
const SYNONYMS: Record<Field, string[]> = {
  symbol: ["symbol", "ticker", "tickersymbol", "underlying", "underlyingsymbol", "sym", "stock", "root", "rootsymbol", "securityid"],
  description: ["description", "desc", "security", "securitydescription", "securityname", "name", "instrument", "contract", "option", "optiondescription", "positiondescription", "product"],
  quantity: ["qty", "quantity", "contracts", "shares", "units", "positionqty", "quantityheld", "qtyheld", "amount", "size", "numberofshares", "numberofcontracts", "count", "sharesheld", "position"],
  entry: ["premium", "avgpremium", "avgcost", "averagecost", "avgprice", "averageprice", "costpershare", "costshare", "pricepaid", "unitcost", "avgcostbasis", "averagecostbasis", "purchaseprice", "entryprice", "entry", "openprice", "tradeprice", "fillprice", "averagecostpershare", "costbasispershare", "avgcostshare", "credit", "debit", "netprice", "price", "avgentry", "avgentryprice", "openingprice"],
  costTotal: ["costbasis", "costbasistotal", "totalcost", "totalcostbasis", "cost", "basis", "netcost", "amountinvested", "originalcost"],
  optionType: ["putcall", "putorcall", "optiontype", "right", "callput", "pc", "cp", "callorput", "putcalltype", "contracttype"],
  side: ["side", "longshort", "buysell", "action", "direction", "positiontype", "opentype", "openingaction", "buyorsell", "longorshort", "positionside", "shortlong"],
  strike: ["strike", "strikeprice", "strk", "exerciseprice"],
  expiration: ["exp", "expiry", "expiration", "expirationdate", "expdate", "expires", "expirydate", "maturity", "maturitydate", "expiredate"],
  assetType: ["assettype", "securitytype", "instrumenttype", "assetclass", "producttype", "sectype", "type", "category"],
  openedAt: ["opened", "openedat", "opendate", "openeddate", "dateopened", "acquired", "acquireddate", "dateacquired", "purchasedate", "purchasedate", "tradedate", "entrydate", "date"],
};

export const REQUIRED_STOCK: Field[] = ["symbol", "quantity", "entry"];
export const REQUIRED_OPTION: Field[] = ["symbol", "quantity", "entry", "optionType", "strike", "expiration", "side"];

export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

// ---- CSV -------------------------------------------------------------------
/** RFC-4180-ish CSV parser: quoted fields, doubled quotes, CRLF, and a
 *  tab-separated fallback when the first line has tabs and no commas. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = !firstLine.includes(",") && firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Broker exports often start with a title block ("Positions as of …") before
 *  the real header. Pick the first row that looks like a header: mostly
 *  non-numeric cells, at least two of them, and at least one known synonym. */
export function findHeaderRow(rows: string[][]): number {
  const known = new Set(Object.values(SYNONYMS).flat());
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const numeric = cells.filter((c) => /^[-$(]?[\d,.]+%?\)?$/.test(c)).length;
    if (numeric > cells.length / 3) continue;
    if (cells.some((c) => known.has(normHeader(c)))) return i;
  }
  return 0;
}

// ---- values ----------------------------------------------------------------
export function parseNumber(v: string | undefined): number | null {
  if (v == null) return null;
  let s = v.trim().replace(/[$,%\s]/g, "");
  if (!s || s === "-" || s === "--") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
const year4 = (y: number) => (y < 100 ? 2000 + y : y);

/** Accepts 2026-10-09, 10/09/2026, 10/9/26, 20261009, 261009 (YYMMDD), Oct 9 2026,
 *  Oct 09 '26, 9-Oct-2026, 09OCT26. Returns YYYY-MM-DD or null. */
export function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/))) return iso(year4(+m[3]), +m[1], +m[2]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{2})(\d{2})(\d{2})$/))) return iso(2000 + +m[1], +m[2], +m[3]);
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+'?(\d{2,4})$/))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return mo ? iso(year4(+m[3]), mo, +m[2]) : null;
  }
  if ((m = s.match(/^(\d{1,2})[-\s]?([A-Za-z]{3,9})[-\s]?'?(\d{2,4})$/))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return mo ? iso(year4(+m[3]), mo, +m[1]) : null;
  }
  return null;
}

export interface ContractParts {
  symbol: string;
  expiration: string;
  optionType: "put" | "call";
  strike: number;
}

/** Read a whole option contract out of one cell. Handles OCC
 *  ("SOFI  261009P00016000", "SOFI261009P00016000"), broker shorthand
 *  ("-SOFI261009P16", ".SOFI261009P16", "SOFI 261009P16"), and words in
 *  either order ("SOFI Oct 09 '26 $16 Put", "SOFI 10/09/2026 16.00 P",
 *  "SOFI $16 Put 10/09/26"). Null when the cell is just a ticker. */
export function parseContract(cell: string | undefined): ContractParts | null {
  if (!cell) return null;
  const s = cell.trim().replace(/^[-.+]/, "");
  let m: RegExpMatchArray | null;
  // OCC: root, YYMMDD, P/C, 8-digit strike ×1000
  if ((m = s.replace(/\s+/g, "").match(/^([A-Z][A-Z0-9]{0,5})(\d{6})([CP])(\d{8})$/i))) {
    const exp = parseDate(m[2]);
    return exp ? { symbol: m[1].toUpperCase(), expiration: exp, optionType: m[3].toUpperCase() === "P" ? "put" : "call", strike: +m[4] / 1000 } : null;
  }
  // Shorthand: root, YYMMDD, P/C, plain strike
  if ((m = s.replace(/\s+/g, "").match(/^([A-Z][A-Z0-9]{0,5})(\d{6})([CP])(\d+(?:\.\d+)?)$/i))) {
    const exp = parseDate(m[2]);
    return exp ? { symbol: m[1].toUpperCase(), expiration: exp, optionType: m[3].toUpperCase() === "P" ? "put" : "call", strike: +m[4] } : null;
  }
  // Words: needs a ticker, a date, a strike and a P/C somewhere in the cell.
  const tokens = s.split(/\s+/);
  const symbol = tokens[0]?.replace(/[^A-Za-z0-9.]/g, "").toUpperCase();
  if (!symbol || !/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol)) return null;
  const typeTok = tokens.find((t) => /^(put|call|p|c|puts|calls)$/i.test(t.replace(/[^a-z]/gi, "")));
  if (!typeTok) return null;
  const optionType: "put" | "call" = /^p/i.test(typeTok.replace(/[^a-z]/gi, "")) ? "put" : "call";
  // Date: try each token and each pair/triple of adjacent tokens ("Oct 09 '26").
  let expiration: string | null = null;
  for (let i = 1; i < tokens.length && !expiration; i++) {
    for (let n = 3; n >= 1 && !expiration; n--) {
      expiration = parseDate(tokens.slice(i, i + n).join(" "));
    }
  }
  if (!expiration) return null;
  // Strike: a bare number (allowing $) that isn't part of the date and isn't the ticker.
  const dateTokens = new Set<string>();
  for (let i = 1; i < tokens.length; i++) for (let n = 3; n >= 1; n--) if (parseDate(tokens.slice(i, i + n).join(" ")) === expiration) tokens.slice(i, i + n).forEach((t) => dateTokens.add(t));
  const strikeTok = tokens.slice(1).find((t) => !dateTokens.has(t) && /^\$?\d+(\.\d+)?$/.test(t));
  const strike = strikeTok ? parseNumber(strikeTok) : null;
  if (!strike || strike <= 0) return null;
  return { symbol, expiration, optionType, strike };
}

const SHORT_WORDS = /^(short|s|sell|sold|sto|sellto open|selltoopen|st|-|written|write|credit)$/i;
const LONG_WORDS = /^(long|l|buy|bought|bto|buyto open|buytoopen|bt|\+|held|debit)$/i;
export function parseSide(v: string | undefined): "long" | "short" | null {
  if (!v) return null;
  const s = v.trim().replace(/\s+/g, "").toLowerCase();
  if (SHORT_WORDS.test(s)) return "short";
  if (LONG_WORDS.test(s)) return "long";
  return null;
}

export function parseOptionType(v: string | undefined): "put" | "call" | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (/^(put|puts|p)$/.test(s)) return "put";
  if (/^(call|calls|c)$/.test(s)) return "call";
  return null;
}

export function parseAssetType(v: string | undefined): "stock" | "option" | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (/option|opt|call|put|contract/.test(s)) return "option";
  if (/stock|equity|equities|etf|share|common|fund|eq$/.test(s)) return "stock";
  return null;
}

// ---- header detection --------------------------------------------------------
export type Mapping = Partial<Record<Field, number>>; // field -> column index

/** Detect columns from headers, then disambiguate by looking at the values:
 *  a "Type" column full of Put/Call is optionType, one full of Stock/Option is
 *  assetType; a "Price" column is only "entry" when there's no better cost
 *  column; a Symbol column whose values parse as contracts also serves as the
 *  description. */
export function detectMapping(headers: string[], sample: string[][]): Mapping {
  const map: Mapping = {};
  const taken = new Set<number>();
  const col = (i: number) => sample.map((r) => r[i] ?? "").filter((v) => v.trim() !== "");
  const claim = (f: Field, i: number) => {
    if (map[f] == null && !taken.has(i)) {
      map[f] = i;
      taken.add(i);
    }
  };
  const norm = headers.map(normHeader);

  // Exact synonym hits, most specific fields first so "Type" lands last.
  const order: Field[] = ["strike", "expiration", "optionType", "side", "quantity", "openedAt", "symbol", "description", "costTotal", "entry", "assetType"];
  for (const f of order) {
    for (let i = 0; i < norm.length; i++) {
      if (taken.has(i) || !norm[i]) continue;
      if (SYNONYMS[f].includes(norm[i])) {
        // "type"/"category" is ambiguous: decide by the values.
        if (f === "assetType" && (norm[i] === "type" || norm[i] === "category")) {
          const vals = col(i);
          if (vals.length && vals.every((v) => parseOptionType(v))) {
            claim("optionType", i);
            continue;
          }
          if (vals.length && vals.some((v) => parseAssetType(v))) claim("assetType", i);
          continue;
        }
        // "price" alone is often the CURRENT price; only take it as entry when the
        // file offers nothing better.
        if (f === "entry" && norm[i] === "price" && norm.some((h, j) => j !== i && SYNONYMS.entry.includes(h) && h !== "price")) continue;
        claim(f, i);
      }
    }
  }
  // Fuzzy pass: header CONTAINS a synonym (e.g. "Quantity (Shares)", "Avg Cost/Share").
  for (const f of order) {
    if (map[f] != null) continue;
    for (let i = 0; i < norm.length; i++) {
      if (taken.has(i) || !norm[i]) continue;
      if (SYNONYMS[f].some((s) => s.length >= 4 && norm[i].includes(s))) {
        if (f === "entry" && /current|market|last|mark/.test(norm[i])) continue;
        claim(f, i);
        break;
      }
    }
  }
  // A symbol column whose values are whole contracts doubles as the description.
  if (map.symbol != null && map.description == null) {
    const vals = col(map.symbol);
    if (vals.length && vals.filter((v) => parseContract(v)).length >= Math.ceil(vals.length / 2)) map.description = map.symbol;
  }
  // Values-only rescue for put/call and side when no header claimed them.
  if (map.optionType == null) {
    for (let i = 0; i < headers.length; i++) {
      if (taken.has(i)) continue;
      const vals = col(i);
      if (vals.length >= 1 && vals.every((v) => parseOptionType(v))) {
        claim("optionType", i);
        break;
      }
    }
  }
  if (map.side == null) {
    for (let i = 0; i < headers.length; i++) {
      if (taken.has(i)) continue;
      const vals = col(i);
      if (vals.length >= 1 && vals.every((v) => parseSide(v))) {
        claim("side", i);
        break;
      }
    }
  }
  return map;
}

// ---- rows -> positions ---------------------------------------------------------
export interface ImportOptions {
  // When the file has no side column and quantities are unsigned, what an option row is.
  defaultOptionSide: "short" | "long";
}

export interface ImportedRow {
  line: number;
  position?: {
    type: "stock" | "option";
    symbol: string;
    qty: number;
    avgCost?: number;
    optionType?: "put" | "call";
    side?: "long" | "short";
    strike?: number;
    expiration?: string;
    premium?: number;
    openedAt?: string;
  };
  error?: string;
}

export interface ImportResult {
  rows: ImportedRow[];
  // Fields that were needed by at least one row and weren't available.
  missing: Field[];
}

/** Convert data rows with a mapping. Rows that can't be completed carry an
 *  error and the field that would have fixed them shows up in `missing`. */
export function convertRows(rows: string[][], map: Mapping, opts: ImportOptions, firstLine = 2): ImportResult {
  const out: ImportedRow[] = [];
  const missing = new Set<Field>();
  const get = (r: string[], f: Field) => (map[f] != null ? (r[map[f] as number] ?? "").trim() : "");

  rows.forEach((r, idx) => {
    const line = firstLine + idx;
    if (r.every((c) => c.trim() === "")) return;
    const symCell = get(r, "symbol");
    const descCell = get(r, "description");
    // Broker housekeeping lines, not positions: Fidelity's core money-market
    // position (symbol ends in **, no quantity), pending activity, sweep cash.
    if (/\*\*$/.test(symCell) || /money market|core position|pending activity|sweep/i.test(descCell)) return;
    const contract = parseContract(symCell) ?? parseContract(descCell);
    const symbol = (contract?.symbol ?? symCell.split(/\s+/)[0] ?? "").replace(/[^A-Za-z0-9.\-]/g, "").toUpperCase();
    if (!symbol) {
      if (map.symbol == null) missing.add("symbol");
      out.push({ line, error: map.symbol == null ? "No symbol column." : "Blank symbol." });
      return;
    }
    // Totals rows ("Total", "Cash", "Account Total") are not positions.
    if (/^(total|totals|cash|pending|account|balance|margin|summary)$/i.test(symbol) || /total/i.test(symCell) && !contract) return;

    const qtyRaw = parseNumber(get(r, "quantity"));
    if (qtyRaw == null) {
      if (map.quantity == null) missing.add("quantity");
      out.push({ line, error: map.quantity == null ? `${symbol}: no quantity column.` : `${symbol}: quantity is blank.` });
      return;
    }
    const qty = Math.abs(qtyRaw);
    if (qty === 0) return; // a closed line in a positions export

    const isOption =
      !!contract ||
      parseAssetType(get(r, "assetType")) === "option" ||
      (map.optionType != null && !!parseOptionType(get(r, "optionType"))) ||
      (map.strike != null && !!parseNumber(get(r, "strike")));

    // Per-share entry: the entry column, else total cost ÷ size.
    let entry = parseNumber(get(r, "entry"));
    if (entry == null) {
      const total = parseNumber(get(r, "costTotal"));
      if (total != null && qty > 0) entry = Math.abs(total) / (qty * (isOption ? 100 : 1));
    }
    if (entry == null) {
      if (map.entry == null && map.costTotal == null) missing.add("entry");
      out.push({ line, error: `${symbol}: no price paid / premium.` });
      return;
    }
    entry = Math.abs(entry);
    const openedAt = parseDate(get(r, "openedAt")) ?? undefined;

    if (!isOption) {
      out.push({ line, position: { type: "stock", symbol, qty, avgCost: entry, openedAt } });
      return;
    }

    const optionType = contract?.optionType ?? parseOptionType(get(r, "optionType"));
    if (!optionType) {
      if (map.optionType == null) missing.add("optionType");
      out.push({ line, error: `${symbol}: can't tell put from call.` });
      return;
    }
    const strike = contract?.strike ?? parseNumber(get(r, "strike"));
    if (!strike || strike <= 0) {
      if (map.strike == null) missing.add("strike");
      out.push({ line, error: `${symbol}: no strike.` });
      return;
    }
    const expiration = contract?.expiration ?? parseDate(get(r, "expiration"));
    if (!expiration) {
      if (map.expiration == null) missing.add("expiration");
      out.push({ line, error: `${symbol}: no expiration date.` });
      return;
    }
    let side = parseSide(get(r, "side"));
    if (!side && qtyRaw < 0) side = "short";
    if (!side && map.side == null && qtyRaw > 0) side = opts.defaultOptionSide;
    if (!side) {
      if (map.side == null) missing.add("side");
      out.push({ line, error: `${symbol}: can't tell bought from sold.` });
      return;
    }
    if (!Number.isInteger(qty)) {
      out.push({ line, error: `${symbol}: contracts must be a whole number (got ${qty}).` });
      return;
    }
    out.push({ line, position: { type: "option", symbol, qty, optionType, side, strike, expiration, premium: entry, openedAt } });
  });

  return { rows: out, missing: [...missing] };
}

/** The template users can download: our own column names, one stock and one option row. */
export const TEMPLATE_CSV = [
  "Symbol,Quantity,Price paid,Put or call,Side,Strike,Expiration,Opened",
  "AAPL,100,240.00,,,,,2026-08-01",
  "SOFI,1,0.69,put,sold,16,2026-10-09,2026-09-18",
  "SOFI  261009P00016000,1,0.69,,sold,,,2026-09-18",
].join("\n");
