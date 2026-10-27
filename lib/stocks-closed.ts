// Server-side loader for closed stock history (data/stocks-closed.json),
// reconstructed by the Schwab bridge from equity order history. Read from every
// bridge's data dir and scoped to the account being viewed (lib/closed-files.ts).
import path from "node:path";
import type { ClosedStock, ClosedStockFile } from "./types";
import { isExampleMode } from "./example-mode";
import { exampleStockFile } from "./example";
import { readClosedForView } from "./closed-files";
import { readLotOverrides } from "./bridge-files";
import { applyLotOverrides } from "./lot-overrides";

export const STOCKS_CLOSED_PATH = path.join(process.cwd(), "data", "stocks-closed.json");

const EMPTY: ClosedStockFile = { meta: { generatedAt: "", source: "" }, closed: [] };

export async function getClosedStocks(): Promise<ClosedStockFile> {
  if (await isExampleMode()) return exampleStockFile;
  const doc = await readClosedForView<ClosedStock>("stocks-closed.json", EMPTY);
  // Sales whose lots were taken from Schwab's report in Reconcile.
  const closed = applyLotOverrides(doc.closed, readLotOverrides());
  return closed === doc.closed ? doc : { ...doc, closed: closed.sort((a, b) => b.closedAt.localeCompare(a.closedAt)) };
}
