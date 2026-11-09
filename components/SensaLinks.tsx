// A row of small outbound links into Sensa Market: a ticker's pages when
// `symbol` is given, the site's own pages otherwise. Plain anchors in a new
// tab (the site's app picks them up where it is installed); no fetch, no login.
import { SENSA_SITE_PAGES, SENSA_TICKER_PAGES, sensaSiteUrl, sensaTickerUrl, type SensaSitePage, type SensaTickerPage } from "@/lib/sensa";

const LINK_CLS = "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-sky-300/90 ring-1 ring-inset ring-sky-500/20 hover:bg-sky-500/10 active:opacity-70";

function Out({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title} className={LINK_CLS} data-no-ticker-hold>
      {children}
    </a>
  );
}

/** Ticker pages on Sensa Market. `pages` picks and orders them; default is the research set. */
export function SensaTickerLinks({
  symbol,
  pages = ["overview", "chains", "greeks", "open-interest", "optionFlow", "chart-analysis", "financials", "build/cash-secured-put"],
  label = "Sensa Market",
  className = "",
}: {
  symbol: string;
  pages?: SensaTickerPage[];
  label?: string | null;
  className?: string;
}) {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {label && <span className="mr-0.5 text-[10px] text-muted">{label}</span>}
      {pages.map((p) => (
        <Out key={p} href={sensaTickerUrl(sym, p)} title={`${sym} · ${SENSA_TICKER_PAGES[p]} on Sensa Market (opens in a new tab)`}>
          {SENSA_TICKER_PAGES[p]}
        </Out>
      ))}
    </div>
  );
}

/** Site-wide pages on Sensa Market. */
export function SensaSiteLinks({ pages, label = "Sensa Market", className = "" }: { pages: SensaSitePage[]; label?: string | null; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {label && <span className="mr-0.5 text-[10px] text-muted">{label}</span>}
      {pages.map((p) => (
        <Out key={p} href={sensaSiteUrl(p)} title={`${SENSA_SITE_PAGES[p]} on Sensa Market (opens in a new tab)`}>
          {SENSA_SITE_PAGES[p]}
        </Out>
      ))}
    </div>
  );
}
