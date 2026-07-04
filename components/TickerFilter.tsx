import Link from "next/link";

// Shown on a strategy page when it's filtered to a single ticker (e.g. arrived from
// the home breakout). Tapping the ✕ clears back to the unfiltered page.
export function TickerFilter({ symbol, clearHref }: { symbol: string; clearHref: string }) {
  return (
    <Link
      href={clearHref}
      className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-200 ring-1 ring-inset ring-sky-500/40 active:opacity-70"
    >
      {symbol}
      <span className="text-sky-300/80">✕</span>
    </Link>
  );
}
