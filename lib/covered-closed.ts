// Server-side loader for closed covered-call history (data/covered-closed.json),
// reconstructed by the Schwab bridge from option order history.
import fs from "node:fs";
import path from "node:path";
import type { ClosedCoveredFile } from "./types";
import { isExampleMode } from "./example-mode";
import { exampleCoveredFile } from "./example";

export const COVERED_CLOSED_PATH = path.join(process.cwd(), "data", "covered-closed.json");

const EMPTY: ClosedCoveredFile = { meta: { generatedAt: "", source: "" }, closed: [] };

export async function getClosedCovered(): Promise<ClosedCoveredFile> {
  if (await isExampleMode()) return exampleCoveredFile;
  try {
    const raw = fs.readFileSync(COVERED_CLOSED_PATH, "utf8");
    const parsed = JSON.parse(raw) as ClosedCoveredFile;
    if (parsed?.closed && Array.isArray(parsed.closed)) return parsed;
  } catch {
    /* missing/malformed */
  }
  return EMPTY;
}
