// Server-side loader for closed stock history (data/stocks-closed.json),
// reconstructed by the Schwab bridge from equity order history.
import fs from "node:fs";
import path from "node:path";
import type { ClosedStockFile } from "./types";
import { isExampleMode } from "./example-mode";
import { exampleStockFile } from "./example";

export const STOCKS_CLOSED_PATH = path.join(process.cwd(), "data", "stocks-closed.json");

const EMPTY: ClosedStockFile = { meta: { generatedAt: "", source: "" }, closed: [] };

export async function getClosedStocks(): Promise<ClosedStockFile> {
  if (await isExampleMode()) return exampleStockFile;
  try {
    const raw = fs.readFileSync(STOCKS_CLOSED_PATH, "utf8");
    const parsed = JSON.parse(raw) as ClosedStockFile;
    if (parsed?.closed && Array.isArray(parsed.closed)) return parsed;
  } catch {
    /* missing/malformed */
  }
  return EMPTY;
}
