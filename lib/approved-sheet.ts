// Pull the approved list from a Google Sheet. The sheet must be viewable by anyone
// with the link; we fetch its CSV export, find the header row with a "Ticker" (or
// "Symbol") column, and take every valid ticker below it. Group/label rows with an
// empty ticker cell are skipped.
//
// Only Google Sheets URLs are accepted — the export URL is rebuilt from the sheet
// id and tab id, so a pasted link can't point the server anywhere else.
//
// Server-only (touches the filesystem and the network).
import fs from "node:fs";
import path from "node:path";
import { normalizeSymbol } from "./approved";

export const SHEET_PATH = path.join(process.cwd(), "data", "approved-sheet.json");

export type SheetSource = { url: string; syncedAt?: string; count?: number };

export function getSheetSource(): SheetSource | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(SHEET_PATH, "utf8")) as SheetSource;
    return typeof parsed.url === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSheetSource(src: SheetSource): void {
  fs.mkdirSync(path.dirname(SHEET_PATH), { recursive: true });
  fs.writeFileSync(SHEET_PATH, JSON.stringify(src, null, 2), "utf8");
}

/** CSV export URL for a Google Sheets link, or null if it isn't one. */
export function exportUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname !== "docs.google.com") return null;
  const m = u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (!m) return null;
  const gid = (u.hash.match(/gid=(\d+)/) ?? u.search.match(/gid=(\d+)/))?.[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Tickers in sheet order, from the column headed "Ticker" or "Symbol". */
export function tickersFromCsv(text: string): string[] {
  const rows = parseCsv(text);
  let col = -1;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (col < 0) {
      col = r.findIndex((c) => /^(ticker|symbol)s?$/i.test(c.trim()));
      continue;
    }
    const sym = normalizeSymbol(r[col] ?? "");
    if (sym && !seen.has(sym)) {
      seen.add(sym);
      out.push(sym);
    }
  }
  if (col < 0) throw new Error('No "Ticker" or "Symbol" column found in the sheet');
  return out;
}

export async function fetchSheetTickers(url: string): Promise<string[]> {
  const csvUrl = exportUrl(url);
  if (!csvUrl) throw new Error("Paste a Google Sheets link (docs.google.com/spreadsheets/…)");
  const res = await fetch(csvUrl, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(15_000) });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("text/csv")) {
    throw new Error("Couldn't read the sheet — set sharing to “Anyone with the link can view”");
  }
  const tickers = tickersFromCsv(await res.text());
  if (tickers.length === 0) throw new Error("The sheet's Ticker column is empty");
  return tickers;
}
