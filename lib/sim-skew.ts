// Read/write store for the Simulate IV-skew assumption. Lives in
// data/sim-config.json so it can be edited from the Settings page at runtime
// and survives reloads (the same server-first pattern as lib/approved.ts).
// Server-only (touches the filesystem) — import from server components and
// route handlers, not client components.
import fs from "node:fs";
import path from "node:path";

export const SIM_SKEW_PATH = path.join(process.cwd(), "data", "sim-config.json");
export const DEFAULT_SKEW = 0.7;

export function clampSkew(v: number): number {
  return Math.min(3, Math.max(0, Math.round(v * 10) / 10));
}

export function getSimSkew(): number {
  try {
    const raw = fs.readFileSync(SIM_SKEW_PATH, "utf8");
    const parsed = JSON.parse(raw) as { ivSkew?: unknown };
    if (typeof parsed.ivSkew === "number" && Number.isFinite(parsed.ivSkew)) {
      return clampSkew(parsed.ivSkew);
    }
  } catch {
    // no store yet — fall back to the default
  }
  return DEFAULT_SKEW;
}

export function saveSimSkew(v: number): number {
  const clean = clampSkew(v);
  fs.mkdirSync(path.dirname(SIM_SKEW_PATH), { recursive: true });
  fs.writeFileSync(
    SIM_SKEW_PATH,
    JSON.stringify({ ivSkew: clean, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
  return clean;
}
