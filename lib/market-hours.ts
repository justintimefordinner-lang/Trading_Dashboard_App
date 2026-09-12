// True during the US equity regular session: Mon–Fri, 9:30–16:00 America/New_York.
// Pure and timezone-correct via Intl (works regardless of the server's own zone), so
// it's safe to call on the server and pass the result to client components.
//
// Holidays are NOT handled — a market holiday reads as "open." That's an acceptable
// edge for gating Top Movers' day-change source: on a holiday Schwab's day P&L is
// frozen anyway, so it would just show the (frozen) figure rather than the Simulate
// projection. Weekends and nights — the common closed case — are handled correctly.
export function isRegularSession(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const val = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = val("weekday");
  if (wd === "Sat" || wd === "Sun") return false;
  let hour = parseInt(val("hour"), 10);
  if (hour === 24) hour = 0; // some engines render midnight as "24"
  const mins = hour * 60 + parseInt(val("minute"), 10);
  return mins >= 570 && mins < 960; // 9:30 → 16:00 ET
}

// ---------------------------------------------------------------------------
// ET calendar helpers for the desktop shell's market countdown. Same holiday
// gap as isRegularSession above: a market holiday counts down to 9:30/16:00
// ET as if it were a normal trading day. Ported from jttyeung's fork.
// ---------------------------------------------------------------------------

// marketDateParts reads `now`'s own America/New_York wall-clock date and
// time apart, for building a real Date at a specific ET moment below.
function marketDateParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const val = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = parseInt(val("hour"), 10);
  if (hour === 24) hour = 0; // some engines render midnight as "24"
  return {
    year: parseInt(val("year"), 10),
    month: parseInt(val("month"), 10),
    day: parseInt(val("day"), 10),
    weekday: val("weekday"),
    hour,
    minute: parseInt(val("minute"), 10),
    second: parseInt(val("second"), 10),
  };
}

/** `now`'s America/New_York calendar date as YYYY-MM-DD. */
export function etDateString(now: Date): string {
  const p = marketDateParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// How far America/New_York is behind UTC right now (240 in EDT, 300 in EST),
// derived from `now` itself rather than a hardcoded DST table.
function etOffsetMinutes(now: Date): number {
  const p = marketDateParts(now);
  const asIfUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((now.getTime() - asIfUTC) / 60000);
}

// The real UTC Date for a given ET wall-clock moment, reusing `now`'s own
// ET/UTC offset — safe since callers only target dates within a few days.
function etDateTime(now: Date, year: number, month: number, day: number, hour: number, minute: number): Date {
  const offset = etOffsetMinutes(now);
  const asIfUTC = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(asIfUTC + offset * 60000);
}

/** The real 9:30 ET moment for the given Date's own America/New_York day. */
export function etOpenAt(day: Date): Date {
  const p = marketDateParts(day);
  return etDateTime(day, p.year, p.month, p.day, 9, 30);
}

/** Whether the market is open right now, and the Date of the next state
 *  change: today's 16:00 ET close if open, else the next weekday's 9:30 ET open. */
export function nextMarketTransition(now: Date = new Date()): { open: boolean; at: Date } {
  const open = isRegularSession(now);
  if (open) {
    const p = marketDateParts(now);
    return { open: true, at: etDateTime(now, p.year, p.month, p.day, 16, 0) };
  }
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const p = marketDateParts(d);
    if (p.weekday === "Sat" || p.weekday === "Sun") continue;
    const candidate = etDateTime(now, p.year, p.month, p.day, 9, 30);
    if (candidate.getTime() > now.getTime()) {
      return { open: false, at: candidate };
    }
  }
  // Unreachable in practice (8 calendar days always contains a weekday open).
  return { open: false, at: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
}
