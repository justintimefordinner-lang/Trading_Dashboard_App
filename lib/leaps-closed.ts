// Server-side loader for closed LEAP history (data/leaps-closed.json),
// reconstructed by Claude Code from the connector's option order history.
// See REFRESH.md → "Regenerating closed-LEAP history".
import fs from "node:fs";
import path from "node:path";
import type { ClosedLeapFile } from "./types";
import { isExampleMode } from "./example-mode";
import { exampleLeapFile } from "./example";

export const LEAPS_CLOSED_PATH = path.join(process.cwd(), "data", "leaps-closed.json");

const EMPTY: ClosedLeapFile = { meta: { generatedAt: "", source: "" }, closed: [] };

export async function getClosedLeaps(): Promise<ClosedLeapFile> {
  if (await isExampleMode()) return exampleLeapFile;
  try {
    const raw = fs.readFileSync(LEAPS_CLOSED_PATH, "utf8");
    const parsed = JSON.parse(raw) as ClosedLeapFile;
    if (parsed?.closed && Array.isArray(parsed.closed)) return parsed;
  } catch {
    /* missing/malformed */
  }
  return EMPTY;
}
