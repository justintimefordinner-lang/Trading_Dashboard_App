// Trader page data. The trader service (a separate, optional container) writes
// data/trade-suggestions.json; the app reads it and writes its verdicts to
// data/trade-feedback.json, which the trader reads back on its next pass. The
// page exists only when the suggestions file does, so installs without the
// trader never see it. No orders are placed from here.
import fs from "node:fs";
import path from "node:path";

export const SUGGESTIONS_PATH = path.join(process.cwd(), "data", "trade-suggestions.json");
export const FEEDBACK_PATH = path.join(process.cwd(), "data", "trade-feedback.json");
// "Run now": the app drops this marker; the trader runs a full pass within seconds and removes it.
export const RUN_PATH = path.join(process.cwd(), "data", "trader-run");

export type SuggestionStatus = "new" | "good" | "bad" | "done" | "skip" | "expired";

export interface Suggestion {
  key: string;
  kind: "csp" | "close" | "cc" | "note";
  symbol: string;
  title: string;
  detail: string;
  rule: string;
  amount?: number;
  qty?: number;
  price?: number;
  strike?: number;
  expiration?: string;
  yield30?: number;
  delta?: number;
  status: SuggestionStatus;
  firstSeen: string;
  lastSeen: string;
  pushedAt?: string;
  expiredAt?: string;
  accountId?: string;
  /** the account's label, as the notification named it */
  account?: string;
  /** position in the trader's build for this account; for new puts, the ranked queue order */
  seq?: number;
  /** the trader's rank (0–100) for a new put */
  rank?: number;
}

// Kinds in the order the page shows them inside each account: new puts first
// (the user's priority), then closes, covered calls and notes.
const KIND_ORDER: Record<Suggestion["kind"], number> = { csp: 0, close: 1, cc: 2, note: 3 };

/** Group by account (dashboard order), then kind, then the trader's build position.
 *  Stable across the day: the 15-minute close checks no longer reshuffle the list. */
export function orderSuggestions(rows: Suggestion[], accounts: string[] = []): Suggestion[] {
  const acct = (s: Suggestion) => {
    const i = s.account ? accounts.indexOf(s.account) : -1;
    return i === -1 ? accounts.length : i;
  };
  return [...rows].sort(
    (a, b) =>
      acct(a) - acct(b) ||
      (a.account ?? "").localeCompare(b.account ?? "") ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.seq ?? 1e6) - (b.seq ?? 1e6) ||
      b.lastSeen.localeCompare(a.lastSeen),
  );
}

export interface SuggestionsFile {
  meta: {
    asOf: string;
    interval: number;
    paused: boolean;
    ntfy: boolean;
    active: number;
    pushed: number;
    /** e.g. "11:00–15:00 ET hourly": when new puts, calls and notes are evaluated */
    window?: string;
    slots?: number[];
    accounts?: string[];
    /** the last day (ET) the entry half ran */
    entriesBuilt?: string | null;
    lastPass?: "entries" | "closes" | "run now";
  };
  suggestions: Suggestion[];
}

// The Auto Trader paper account's trade log, written by the trader each pass.
export const PAPER_PATH = path.join(process.cwd(), "data", "trader-paper.json");

export interface PaperTrade {
  at: string;
  kind: "csp" | "close" | "cc" | "assigned" | "called" | "expired" | string;
  text: string;
  amount: number | null;
  symbol?: string;
  rule?: string;
}
export interface PaperFile {
  meta: {
    asOf: string;
    accountId: string;
    label: string;
    startingCash: number;
    cash: number;
    totalValue: number;
    puts: number;
    calls: number;
    shareLots: number;
    priced: boolean;
    trades: number;
  };
  trades: PaperTrade[];
}

export function readPaper(): PaperFile | null {
  try {
    const doc = JSON.parse(fs.readFileSync(PAPER_PATH, "utf8")) as PaperFile;
    return doc?.meta && Array.isArray(doc.trades) ? doc : null;
  } catch {
    return null;
  }
}

/** Ask the trader for a full pass now (any time, any day). Write-only: the marker is the request. */
export function requestRun(): void {
  fs.mkdirSync(path.dirname(RUN_PATH), { recursive: true });
  fs.writeFileSync(RUN_PATH, new Date().toISOString());
}

export function runPending(): boolean {
  return fs.existsSync(RUN_PATH);
}

export function traderPresent(): boolean {
  return fs.existsSync(SUGGESTIONS_PATH);
}

export function readSuggestions(): SuggestionsFile | null {
  try {
    const doc = JSON.parse(fs.readFileSync(SUGGESTIONS_PATH, "utf8")) as SuggestionsFile;
    return Array.isArray(doc?.suggestions) ? doc : null;
  } catch {
    return null;
  }
}

/** Record a verdict on one suggestion. Read-merge is fine: this is the user's own
 *  input in the app's own data folder, not anything the trader keeps private. */
export function saveFeedback(key: string, status: SuggestionStatus): void {
  let cur: Record<string, { status: string; at: string }> = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(FEEDBACK_PATH, "utf8"));
    if (parsed && typeof parsed === "object") cur = parsed;
  } catch {
    cur = {};
  }
  if (status === "new") delete cur[key];
  else cur[key] = { status, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(FEEDBACK_PATH), { recursive: true });
  fs.writeFileSync(FEEDBACK_PATH, JSON.stringify(cur, null, 2));
}
