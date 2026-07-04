// Canonical technical-indicator math (RSI, SMA, support) shared by the CSP
// discovery scanner and the get_equity_historicals technicals consumer, so the
// numbers are computed one way everywhere.

export function sma(values, n) {
  if (!values || values.length < n) return null;
  return values.slice(-n).reduce((s, x) => s + x, 0) / n;
}

// Simple 14-period RSI over the most recent window (matches the discovery scan).
export function rsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  const ag = gain / period, al = loss / period;
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

const round = (n) => (n == null ? null : Math.round(n * 100) / 100);

// Annualized historical (realized) volatility over the recent window — a proxy
// for how rich option premium is (higher HV ≈ richer CSP premium).
export function historicalVol(closes, window = 20) {
  if (!closes || closes.length < window + 1) return null;
  const rets = [];
  for (let i = closes.length - window; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
  const variance = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/**
 * Compute the CSP technical signals from a close series (and optional lows).
 * @param {{closes:number[], lows?:number[], strike?:number}} input
 */
export function computeTechnicals({ closes, lows, strike }) {
  const price = closes.at(-1);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const supportSeries = lows && lows.length ? lows : closes;
  const support20 = Math.min(...supportSeries.slice(-20));
  const r = rsi(closes);
  return {
    price: round(price),
    rsi: round(r),
    sma50: round(sma50),
    sma200: round(sma200),
    aboveSma50: sma50 != null ? price > sma50 : null,
    aboveSma200: sma200 != null ? price > sma200 : null,
    pctFromSma50: sma50 ? round(((price - sma50) / sma50) * 100) : null,
    support20: round(support20),
    strikeBelowSupport: strike != null ? strike < support20 : null,
    hv: historicalVol(closes),
  };
}
