// Shared plain-calendar-date helpers. Deliberately never touch the local
// Date API's own timezone for a YYYY-MM-DD string — parsed and read back
// in UTC so it can't drift a day off in a negative-UTC-offset browser.

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Short weekday label for a YYYY-MM-DD date. Used to label a value carried
// forward from an earlier session ("as of Fri") as not actually today's.
export function fmtWeekdayShort(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return WEEKDAYS_SHORT[d.getUTCDay()] ?? dateISO;
}
