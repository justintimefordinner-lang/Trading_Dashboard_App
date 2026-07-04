// Read/write store for the approved trading universe. The canonical list now
// lives in data/approved-stocks.json so it can be edited from the app at runtime;
// lib/approved-stocks.ts is the initial seed used until the first edit. The Python
// research_sync reads the same JSON, so both stay in sync.
//
// Server-only (touches the filesystem) — import from server components and route
// handlers, not client components.
import fs from "node:fs";
import path from "node:path";
import { APPROVED_STOCKS } from "./approved-stocks";

export const APPROVED_PATH = path.join(process.cwd(), "data", "approved-stocks.json");

const TICKER_RE = /^[A-Z][A-Z0-9.]{0,9}$/;

export function normalizeSymbol(raw: string): string | null {
  const u = String(raw ?? "").trim().toUpperCase();
  return TICKER_RE.test(u) ? u : null;
}

function dedupe(symbols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of symbols) {
    const u = normalizeSymbol(s);
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

export function getApproved(): string[] {
  try {
    const raw = fs.readFileSync(APPROVED_PATH, "utf8");
    const parsed = JSON.parse(raw) as { symbols?: unknown };
    if (Array.isArray(parsed.symbols)) return dedupe(parsed.symbols as string[]);
  } catch {
    // no store yet — fall back to the seed
  }
  return [...APPROVED_STOCKS];
}

export function saveApproved(symbols: string[]): string[] {
  const clean = dedupe(symbols);
  fs.mkdirSync(path.dirname(APPROVED_PATH), { recursive: true });
  fs.writeFileSync(
    APPROVED_PATH,
    JSON.stringify({ symbols: clean, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
  return clean;
}

export function addApproved(symbol: string): string[] {
  const u = normalizeSymbol(symbol);
  const cur = getApproved();
  if (!u || cur.includes(u)) return cur;
  return saveApproved([...cur, u]);
}

export function removeApproved(symbol: string): string[] {
  const u = normalizeSymbol(symbol);
  if (!u) return getApproved();
  return saveApproved(getApproved().filter((s) => s !== u));
}
