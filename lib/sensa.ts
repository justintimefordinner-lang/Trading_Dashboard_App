// Links into Sensa Market (sensamarket.com), the options-research site many of
// this app's users also run. Nothing is fetched from it: these are plain outbound
// links, so the dashboard stays free of its login and its API. Client-safe.
//
// Ticker pages take the bare symbol (/trade/MU/chains works without the
// exchange prefix the site's own links carry), and the strategy builder opens
// with a strategy preselected (/trade/MU/build/cash-secured-put).
export const SENSA_URL = "https://www.sensamarket.com";

/** Per-ticker pages, keyed by the site's route slug. */
export const SENSA_TICKER_PAGES = {
  overview: "Overview",
  "chart-analysis": "Chart",
  chains: "Chains",
  greeks: "Greeks",
  "open-interest": "Open interest",
  optionFlow: "Flow",
  "heat-map": "Heat map",
  financials: "Financials",
  news: "News",
  insider: "Insider",
  investors: "Top investors",
  seasonals: "Seasonal",
  darkpool: "Dark pool",
  "build/cash-secured-put": "CSP builder",
  "build/covered-call": "CC builder",
} as const;
export type SensaTickerPage = keyof typeof SENSA_TICKER_PAGES;

/** Site-wide pages. */
export const SENSA_SITE_PAGES = {
  dashboard: "Dashboard",
  screener: "Screener",
  "sector-heatmap": "Sector heat map",
  cashflow: "Option flow",
  "greeks-analytics": "Greeks analytics",
  strategies: "Strategies",
  "inside-trade": "Insider trading",
  "institutional-investor": "Institutional",
  "political-trades": "Political trades",
} as const;
export type SensaSitePage = keyof typeof SENSA_SITE_PAGES;

/** A ticker's page on Sensa Market. Symbols with a class suffix (BRK.B) are passed as written. */
export function sensaTickerUrl(symbol: string, page: SensaTickerPage = "overview"): string {
  return `${SENSA_URL}/trade/${encodeURIComponent(symbol.trim().toUpperCase())}/${page}`;
}

export function sensaSiteUrl(page: SensaSitePage): string {
  return `${SENSA_URL}/${page}`;
}
