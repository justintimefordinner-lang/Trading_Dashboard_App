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
