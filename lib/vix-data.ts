// Server-side loader for the VIX/volatility snapshot (data/vix.json), refreshed
// by Claude Code from the Robinhood connector (VIX index + SPY historicals).
// See REFRESH.md → "Refreshing the VIX posture".
import fs from "node:fs";
import path from "node:path";
import type { VixSnapshot } from "./vix";

export const VIX_PATH = path.join(process.cwd(), "data", "vix.json");

export function getVixSnapshot(): VixSnapshot | null {
  try {
    const raw = fs.readFileSync(VIX_PATH, "utf8");
    const parsed = JSON.parse(raw) as VixSnapshot;
    if (parsed?.inputs && typeof parsed.inputs.vix === "number") return parsed;
  } catch {
    /* missing/malformed */
  }
  return null;
}
