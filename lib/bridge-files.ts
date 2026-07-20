// Write-only bridge deposits + one-way status read.
//
// The security contract for the Schwab connection: this app DEPOSITS things
// into the bridge folder and NEVER reads the bridge's secret files back.
//   * credentials.env      — App Key + Secret, written WHOLESALE (never read/merged)
//   * reauth_inbox/start   — empty marker: "generate a login URL"
//   * reauth_inbox/redirect_url — the pasted post-login URL, written wholesale
//
// The only thing the app reads is its OWN data/ folder, where the bridge writes
// a sanitized schwab-auth.json status (no secrets). See reauth.py on the bridge.
import fs from "node:fs";
import path from "node:path";
import { BRIDGE_DIR } from "@/lib/bridge-dir";
import { writeEnvUpdates } from "@/lib/env-file";

const CREDENTIALS_PATH = path.join(BRIDGE_DIR, "credentials.env");
const INBOX_DIR = path.join(BRIDGE_DIR, "reauth_inbox");
const START_MARKER = path.join(INBOX_DIR, "start");
const REDIRECT_FILE = path.join(INBOX_DIR, "redirect_url");
const BRIDGE_ENV_PATH = path.join(BRIDGE_DIR, ".env");

// The bridge writes its status/data here; it's the app's own folder, so reading
// it is not a "read of the bridge."
const STATUS_PATH = path.join(process.cwd(), "data", "schwab-auth.json");
const APP_DATA_DIR = path.join(process.cwd(), "data");

const DEFAULT_CALLBACK = "https://127.0.0.1:8182";

function lockDown(file: string): void {
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // best effort — not all filesystems support POSIX perms
  }
}

/**
 * WHOLESALE-write the two Schwab secrets into credentials.env. This truncates
 * and replaces the file; it never reads existing contents, so there is no read
 * path to the secret and no stale value can linger on rotation. Because the app
 * owns 100% of this file, wholesale write is safe.
 */
export function writeCredentials(appKey: string, appSecret: string, callbackUrl?: string): void {
  const cb = (callbackUrl || "").trim() || DEFAULT_CALLBACK;
  const body =
    "# Written by the Trading Dashboard setup wizard. Do not edit by hand.\n" +
    "# Holds secrets — git-ignored, chmod 600.\n" +
    `SCHWAB_API_KEY=${appKey.trim()}\n` +
    `SCHWAB_APP_SECRET=${appSecret}\n` +
    `SCHWAB_CALLBACK_URL=${cb}\n`;
  fs.mkdirSync(BRIDGE_DIR, { recursive: true });
  fs.writeFileSync(CREDENTIALS_PATH, body, { mode: 0o600 });
  lockDown(CREDENTIALS_PATH);

  // Non-secret config the bridge needs so it writes data/status into THIS app's
  // data folder. This touches .env (config, not secrets) via the existing merge
  // helper — credentials themselves never go here.
  writeEnvUpdates(BRIDGE_ENV_PATH, {
    APP_DATA_DIR,
    SCHWAB_CALLBACK_URL: cb,
  });
}

/** Drop the "please generate a login URL" marker. Write-only. */
export function requestReauthStart(): void {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.writeFileSync(START_MARKER, "");
}

/** Deposit the pasted redirect URL for the bridge to exchange. Write-only. */
export function submitRedirectUrl(url: string): void {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.writeFileSync(REDIRECT_FILE, url.trim() + "\n", { mode: 0o600 });
  lockDown(REDIRECT_FILE);
}

export interface SchwabAuthStatus {
  configured: boolean;
  hasToken: boolean;
  authStatus: "needs_setup" | "needs_login" | "awaiting_login" | "connected" | "error" | "idle";
  authorizationUrl: string | null;
  error: string | null;
  updatedAt: string | null;
}

/**
 * Read the bridge-authored status from the app's OWN data/ folder. Never reads
 * the bridge's secret files. Missing file => treat as un-configured.
 */
export function readAuthStatus(): SchwabAuthStatus {
  const fallback: SchwabAuthStatus = {
    configured: false,
    hasToken: false,
    authStatus: "needs_setup",
    authorizationUrl: null,
    error: null,
    updatedAt: null,
  };
  try {
    const raw = fs.readFileSync(STATUS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<SchwabAuthStatus>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

// ── Trade-history backfill: write-only trigger + one-way status read ──
const TASK_INBOX_DIR = path.join(BRIDGE_DIR, "task_inbox");
const BACKFILL_MARKER = path.join(TASK_INBOX_DIR, "backfill_history");
const HISTORY_STATUS_PATH = path.join(process.cwd(), "data", "history-status.json");

/** Drop the "rebuild full trade history" marker for the bridge. Write-only. */
export function requestHistoryBackfill(): void {
  fs.mkdirSync(TASK_INBOX_DIR, { recursive: true });
  fs.writeFileSync(BACKFILL_MARKER, "");
}

export interface HistoryStatus {
  status: "idle" | "running" | "done" | "error";
  counts: Record<string, number> | null;
  error: string | null;
  updatedAt: string | null;
}

/** Read the bridge-written backfill status from the app's OWN data/ folder. */
export function readHistoryStatus(): HistoryStatus {
  const fallback: HistoryStatus = { status: "idle", counts: null, error: null, updatedAt: null };
  try {
    const raw = fs.readFileSync(HISTORY_STATUS_PATH, "utf8");
    return { ...fallback, ...(JSON.parse(raw) as Partial<HistoryStatus>) };
  } catch {
    return fallback;
  }
}

// ── Morning Brief refresh: write-only trigger + one-way status read ──
const REPORT_REFRESH_MARKER = path.join(TASK_INBOX_DIR, "refresh_report");
const REPORT_STATUS_PATH = path.join(process.cwd(), "data", "report-status.json");

/** Drop the "rebuild the morning brief now" marker for the bridge. Write-only. */
export function requestReportRefresh(): void {
  fs.mkdirSync(TASK_INBOX_DIR, { recursive: true });
  fs.writeFileSync(REPORT_REFRESH_MARKER, "");
}

export interface ReportStatus {
  status: "idle" | "running" | "done" | "error";
  error: string | null;
  updatedAt: string | null;
}

/** Read the bridge-written report-refresh status from the app's OWN data/ folder. */
export function readReportStatus(): ReportStatus {
  const fallback: ReportStatus = { status: "idle", error: null, updatedAt: null };
  try {
    const raw = fs.readFileSync(REPORT_STATUS_PATH, "utf8");
    return { ...fallback, ...(JSON.parse(raw) as Partial<ReportStatus>) };
  } catch {
    return fallback;
  }
}

// ── Manual cost basis for stock sales whose purchase predates the data window ──
// These two files live in the app's OWN data/ folder (the shared diode): the bridge
// writes stocks-unresolved.json, the app writes manual_cost_basis.json (not a secret,
// so a read-merge is fine), and the bridge reads it back on its next rebuild.
const UNRESOLVED_PATH = path.join(process.cwd(), "data", "stocks-unresolved.json");
const MANUAL_BASIS_PATH = path.join(process.cwd(), "data", "manual_cost_basis.json");
const MANUAL_SALES_PATH = path.join(process.cwd(), "data", "manual_stock_sales.json");

export interface UnresolvedStock {
  id: string;
  symbol: string;
  side: "long" | "short";
  shares: number;
  soldAt: number;
  closeDate: string;
  costPerShare?: number | null; // pre-filled when a basis was already entered (just needs a date)
  acquiredDate?: string | null; // ISO date; when missing the sale can't be short/long-term classified
}

export function readUnresolvedStocks(): UnresolvedStock[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(UNRESOLVED_PATH, "utf8")) as { unresolved?: UnresolvedStock[] };
    return Array.isArray(parsed.unresolved) ? parsed.unresolved : [];
  } catch {
    return [];
  }
}

/** Merge one user-entered cost basis (and optional acquired date) into
 * manual_cost_basis.json. Read-merge is fine here — it's the user's own input, not
 * a bridge secret. acquiredDate sets the holding period so the bridge can classify
 * the sale as short- vs long-term. */
export function saveManualCostBasis(id: string, costPerShare: number, acquiredDate?: string | null): void {
  let cur: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(MANUAL_BASIS_PATH, "utf8"));
    if (parsed && typeof parsed === "object") cur = parsed as Record<string, unknown>;
  } catch {
    cur = {};
  }
  const acq = (acquiredDate || "").trim();
  cur[id] = acq ? { costPerShare, acquiredDate: acq } : { costPerShare };
  fs.mkdirSync(path.dirname(MANUAL_BASIS_PATH), { recursive: true });
  fs.writeFileSync(MANUAL_BASIS_PATH, JSON.stringify(cur, null, 2));
}

// ── Fully user-added closed stock sales (predate the feed entirely, so they never
//    surface as orphans). Stored as a list the bridge reads on rebuild. ──
export interface ManualStockSale {
  id: string;
  symbol: string;
  shares: number;
  proceedsPerShare: number;
  costPerShare: number;
  acquiredDate: string; // ISO
  soldDate: string; // ISO
}

export function readManualStockSales(): ManualStockSale[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(MANUAL_SALES_PATH, "utf8"));
    return Array.isArray(parsed) ? (parsed as ManualStockSale[]) : [];
  } catch {
    return [];
  }
}

function writeManualStockSales(list: ManualStockSale[]): void {
  fs.mkdirSync(path.dirname(MANUAL_SALES_PATH), { recursive: true });
  fs.writeFileSync(MANUAL_SALES_PATH, JSON.stringify(list, null, 2));
}

/** Append a user-added closed stock sale; returns the stored row (with its id). */
export function addManualStockSale(sale: Omit<ManualStockSale, "id">): ManualStockSale {
  const list = readManualStockSales();
  const row: ManualStockSale = { ...sale, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` };
  list.push(row);
  writeManualStockSales(list);
  return row;
}

/** Remove a user-added sale by id. */
export function deleteManualStockSale(id: string): void {
  writeManualStockSales(readManualStockSales().filter((s) => s.id !== id));
}
