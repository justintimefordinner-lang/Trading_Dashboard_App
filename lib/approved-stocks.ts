// The approved trading universe — the only names considered for new CSP / LEAP /
// spread setups. Hand-curated; edit this list to change what's approved.
//
// Kept as a plain symbol list in the order it was given. Per-name live data and
// condition flags get merged in at render time from the research feed, so nothing
// here needs to change when the flagging layer (→ home action center) lands.
export const APPROVED_STOCKS: readonly string[] = [
  "AMD", "VRT", "PLTR", "FUTU", "SHOP", "DELL", "CRDO", "ANET", "HOOD", "WDC",
  "CCJ", "KTOS", "FTNT", "INOD", "CSCO", "IBIT", "META", "APP", "MSFT", "TSLA",
  "AXP", "AVGO", "GE", "JPM", "CLS", "TSM", "AAPL", "GOOGL", "STX", "AMZN",
  "MU", "NVDA", "ETHA", "SOFI", "CDE", "IREN", "AA", "ADI", "CCL", "HL",
  "AMAT", "LRCX", "APH", "EQT", "NEM", "CAT", "FCX", "RTX", "GLW", "COHR",
  "DRAM", "INTC", "SMH", "CEG", "NBIS", "TER",
];

// Alphabetical for display/scanning; the canonical order above is preserved.
export const APPROVED_STOCKS_SORTED: readonly string[] = [...APPROVED_STOCKS].sort((a, b) => a.localeCompare(b));

export function isApproved(symbol: string): boolean {
  return APPROVED_STOCKS.includes(symbol.toUpperCase());
}
