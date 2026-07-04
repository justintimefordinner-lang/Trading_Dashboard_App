// Server-side loader for data/earnings.json ({ "AMD": "2026-07-29", ... }), the same
// file fetch_earnings.py writes. Used to flag CSPs that span an earnings report.
import fs from "node:fs";
import path from "node:path";

export const EARNINGS_PATH = path.join(process.cwd(), "data", "earnings.json");

export function getEarnings(): Record<string, string> {
  try {
    const raw = fs.readFileSync(EARNINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      if (typeof v === "string" && v) out[k.toUpperCase()] = v;
    }
    return out;
  } catch {
    return {};
  }
}
