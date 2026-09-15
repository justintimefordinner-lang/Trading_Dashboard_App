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
