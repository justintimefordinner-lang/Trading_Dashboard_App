// Server-side loader for closed vertical-spread history (data/spreads-closed.json),
// reconstructed by the Schwab bridge from option order history.
import fs from "node:fs";
import path from "node:path";
import type { ClosedSpreadFile } from "./types";
import { isExampleMode } from "./example-mode";
import { exampleSpreadFile } from "./example";

export const SPREADS_CLOSED_PATH = path.join(process.cwd(), "data", "spreads-closed.json");

const EMPTY: ClosedSpreadFile = { meta: { generatedAt: "", source: "" }, closed: [] };

export async function getClosedSpreads(): Promise<ClosedSpreadFile> {
  if (await isExampleMode()) return exampleSpreadFile;
  try {
    const raw = fs.readFileSync(SPREADS_CLOSED_PATH, "utf8");
    const parsed = JSON.parse(raw) as ClosedSpreadFile;
    if (parsed?.closed && Array.isArray(parsed.closed)) return parsed;
  } catch {
    /* missing/malformed */
  }
  return EMPTY;
}
