// Registry of Schwab bridges the app can connect/reconnect from Settings.
//
// The primary bridge is the original one (BRIDGE_DIR). Each ADDITIONAL login runs
// its own bridge writing into a data/ subdirectory (see lib/data-dirs) — we
// auto-discover those here and assume its folder follows the `schwab-bridge-<sub>`
// convention next to the app (override per-bridge with env if your layout differs).
// Server-only (touches the filesystem); import from routes/server components.
import fs from "node:fs";
import path from "node:path";
import { BRIDGE_DIR } from "./bridge-dir";
import { DATA_DIR, dataDirs } from "./data-dirs";

export interface BridgeInfo {
  id: string; // url-safe key: "primary" | "acct2" | ...
  label: string; // shown on the Settings connection card
  dir: string; // bridge folder — reauth_inbox/ + credentials.env + .env live here
  statusPath: string; // app-owned schwab-auth.json this bridge publishes to
}

const env = (name: string) => process.env[name]?.trim() || undefined;

export function bridges(): BridgeInfo[] {
  const list: BridgeInfo[] = [
    {
      id: "primary",
      label: env("SCHWAB_BRIDGE_LABEL") || "Account 1",
      dir: BRIDGE_DIR,
      statusPath: path.join(DATA_DIR, "schwab-auth.json"),
    },
  ];
  for (const dir of dataDirs()) {
    if (dir === DATA_DIR) continue; // the base dir is the primary bridge
    // data/manual is written by the bridge for hand-entered positions, not a login.
    if (path.basename(dir) === "manual") continue;
    // Only a real extra-login bridge output dir counts (has a status or snapshot
    // file) — a stray subfolder never becomes a phantom connection card.
    if (!fs.existsSync(path.join(dir, "schwab-auth.json")) && !fs.existsSync(path.join(dir, "snapshot.json"))) {
      continue;
    }
    const sub = path.basename(dir); // e.g. "acct2"
    const KEY = sub.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    list.push({
      id: sub,
      label: env(`SCHWAB_BRIDGE_${KEY}_LABEL`) || `Account (${sub})`,
      dir: env(`SCHWAB_BRIDGE_${KEY}_DIR`) || path.resolve(process.cwd(), "..", `schwab-bridge-${sub}`),
      statusPath: path.join(dir, "schwab-auth.json"),
    });
  }
  return list;
}

/** Look up one bridge by id (defaults to the primary when id is missing/unknown-safe callers). */
export function bridgeById(id: string | null | undefined): BridgeInfo | undefined {
  const wanted = (id || "primary").trim();
  return bridges().find((b) => b.id === wanted);
}
