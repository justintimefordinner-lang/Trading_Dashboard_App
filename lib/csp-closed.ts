// Server-side loader for closed CSP history (data/csp-closed.json), reconstructed
// by the data bridge from the broker's option order history.
import fs from "node:fs";
import path from "node:path";
import type { ClosedCSPFile } from "./types";
import { isExampleMode } from "./example-mode";
import { exampleCspFile } from "./example";

export const CSP_CLOSED_PATH = path.join(process.cwd(), "data", "csp-closed.json");

const EMPTY: ClosedCSPFile = { meta: { generatedAt: "", source: "" }, closed: [] };

export async function getClosedCsps(): Promise<ClosedCSPFile> {
  if (await isExampleMode()) return exampleCspFile;
  try {
    const raw = fs.readFileSync(CSP_CLOSED_PATH, "utf8");
    const parsed = JSON.parse(raw) as ClosedCSPFile;
    if (parsed?.closed && Array.isArray(parsed.closed)) return parsed;
  } catch {
    /* missing/malformed */
  }
  return EMPTY;
}
