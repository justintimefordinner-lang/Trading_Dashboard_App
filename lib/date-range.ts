// Shared date-range presets for the "closed history" / realized-P&L filters.
// Pure functions (take `now` as a param) so they're hydration-safe and reusable
// across CspClosed, LeapClosed, and the Options realized view.

export type RangeKey = "all" | "mtd" | "lastmo" | "30d" | "90d" | "ytd" | "12m";

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mtd", label: "This mo." },
  { key: "lastmo", label: "Last mo." },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "ytd", label: "YTD" },
  { key: "12m", label: "12mo" },
];

/** Inclusive YYYY-MM-DD bounds; null = unbounded on that side. */
export interface Range {
  start: string | null;
  end: string | null;
}

// Local calendar date as YYYY-MM-DD, so it compares lexically against ISO dates.
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function resolveRange(key: RangeKey, now: number): Range {
  const d = new Date(now);
  const y = d.getFullYear();
  const mo = d.getMonth();
  switch (key) {
    case "mtd":
      return { start: ymd(new Date(y, mo, 1)), end: null };
    case "lastmo":
      // Full previous calendar month: 1st → last day (day 0 of this month).
      return { start: ymd(new Date(y, mo - 1, 1)), end: ymd(new Date(y, mo, 0)) };
    case "ytd":
      return { start: ymd(new Date(y, 0, 1)), end: null };
    case "30d":
      return { start: ymd(new Date(y, mo, d.getDate() - 30)), end: null };
    case "90d":
      return { start: ymd(new Date(y, mo, d.getDate() - 90)), end: null };
    case "12m":
      return { start: ymd(new Date(y - 1, mo, d.getDate())), end: null };
    default:
      return { start: null, end: null };
  }
}

/** True if an ISO yyyy-mm-dd date falls within the (inclusive) range. */
export function inRange(date: string, r: Range): boolean {
  if (r.start && date < r.start) return false;
  if (r.end && date > r.end) return false;
  return true;
}

/** Human caption for the active range, e.g. "since 2026-06-01" or "May 2026". */
export function rangeSubLabel(r: Range): string {
  if (!r.start && !r.end) return "all time";
  if (r.start && r.end) return `${r.start} → ${r.end}`;
  if (r.start) return `since ${r.start}`;
  return `through ${r.end}`;
}

// The time-window modes used by the closed lists and the P&L card's TimeFilter.
export type ClosedMode = "all" | "ytd" | "months" | "today";

/**
 * Parse a closed-view time window out of URL search params so the P&L card's
 * selection can be carried into a strategy's closed page. Returns undefined
 * parts when absent/invalid, letting the component fall back to its defaults.
 */
export function parseClosedWindow(range?: string, months?: string): { mode?: ClosedMode; months?: number } {
  const mode = (["all", "ytd", "months", "today"] as const).includes(range as ClosedMode)
    ? (range as ClosedMode)
    : undefined;
  const m = months != null ? Math.min(6, Math.max(1, Number.parseInt(months, 10) || 1)) : undefined;
  return { mode, months: m };
}
