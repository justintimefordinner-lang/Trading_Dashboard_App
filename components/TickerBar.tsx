import Link from "next/link";

// Horizontal, scrollable ticker filter for a strategy page. Each chip just links to
// `?symbol=SYM` (server filters the list); "All" clears. The active ticker is
// highlighted from the `active` prop — no client state needed.
export function TickerBar({ tickers, active, base }: { tickers: string[]; active?: string; base: string }) {
  if (tickers.length <= 1) return null;
const chip = (label: string, href: string, on: boolean) => (
  <Link
    key={href}
    href={href}
    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors ${
      on ? "bg-sky-500/25 text-sky-100 ring-sky-500/50" : "bg-surface-2 text-muted ring-border active:bg-surface"
    }`}
  >
      {label}
    </Link>
  );
  return (
    <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {chip("All", base, !active)}
      {tickers.map((t) => chip(t, `${base}?symbol=${t}`, active === t))}
    </div>
  );
}
