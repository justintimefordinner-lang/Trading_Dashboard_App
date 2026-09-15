// Chart data contract + the indicator math behind the Chart-a-Ticker chart.
// Pure — no fs, no fetch, no React — so the API route, the demo fixture and any
// test can share one implementation. The math mirrors the bridge's
// indicators.py (SMA / EMA / MACD 12-26-9 / RSI 14 / Bollinger 20,2σ) and the
// TypeScript port jttyeung wrote for her demo fixture.

export interface BollingerPoint {
  upper: number;
  mid: number;
  lower: number;
}

export interface Cross {
  date: string; // YYYY-MM-DD
  type: "golden" | "death";
}

export interface ChartData {
  symbol: string;
  companyName?: string;
  spotPrice: number;
  dates: string[]; // YYYY-MM-DD, oldest → newest
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  bollinger: (BollingerPoint | null)[];
  macd: {
    line: (number | null)[];
    signal: (number | null)[];
    histogram: (number | null)[];
  };
  rsi14: (number | null)[];
  sma50: (number | null)[];
  sma200: (number | null)[];
  // Every 50/200-day SMA golden/death cross across the chart's history.
  crosses: Cross[];
  // Dealer-gamma walls from the bridge's snapshot when the ticker is held
  // (holdings ≥100 shares get them); null otherwise.
  callWall: number | null;
  putWall: number | null;
  gammaFlip: number | null;
  asOf?: string; // ISO — when the bars were fetched
}

export function smaSeries(values: number[], period: number): (number | null)[] {
  const n = values.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n < period) return result;
  let sum = values.slice(0, period).reduce((a, b) => a + b, 0);
  result[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    sum += values[i] - values[i - period];
    result[i] = sum / period;
  }
  return result;
}

export function emaSeries(values: number[], period: number): (number | null)[] {
  const n = values.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n < period) return result;
  const k = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < n; i++) {
    prev = values[i] * k + prev * (1 - k);
    result[i] = prev;
  }
  return result;
}

export function macdSeries(closes: number[]): ChartData["macd"] {
  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  const line = closes.map((_, i) => (fast[i] == null || slow[i] == null ? null : (fast[i] as number) - (slow[i] as number)));
  const validStart = line.findIndex((v) => v != null);
  if (validStart === -1) {
    return { line, signal: closes.map(() => null), histogram: closes.map(() => null) };
  }
  const tail = emaSeries(line.slice(validStart).map((v) => v as number), 9);
  const signal: (number | null)[] = [...new Array(validStart).fill(null), ...tail];
  const histogram = line.map((v, i) => (v == null || signal[i] == null ? null : v - (signal[i] as number)));
  return { line, signal, histogram };
}

export function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const n = closes.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return result;
  const deltas = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = deltas.map((d) => (d > 0 ? d : 0));
  const losses = deltas.map((d) => (d < 0 ? -d : 0));
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const rsiFrom = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  result[period] = rsiFrom(avgGain, avgLoss);
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    result[i + 1] = rsiFrom(avgGain, avgLoss);
  }
  return result;
}

export function bollingerSeries(closes: number[], period = 20, numStd = 2): (BollingerPoint | null)[] {
  const n = closes.length;
  const result: (BollingerPoint | null)[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    const window = closes.slice(i - period + 1, i + 1);
    const mid = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - mid) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    result[i] = { upper: mid + numStd * std, mid, lower: mid - numStd * std };
  }
  return result;
}

// Every 50/200-day SMA golden/death cross across the full history, not just the latest.
export function detectAllCrosses(dates: string[], short: (number | null)[], long_: (number | null)[]): Cross[] {
  const validIdxs: number[] = [];
  for (let i = 0; i < short.length; i++) {
    if (short[i] != null && long_[i] != null) validIdxs.push(i);
  }
  const crosses: Cross[] = [];
  for (let k = 0; k < validIdxs.length - 1; k++) {
    const prevI = validIdxs[k];
    const curI = validIdxs[k + 1];
    const prevDiff = (short[prevI] as number) - (long_[prevI] as number);
    const curDiff = (short[curI] as number) - (long_[curI] as number);
    if (prevDiff <= 0 && curDiff > 0) crosses.push({ date: dates[curI], type: "golden" });
    else if (prevDiff >= 0 && curDiff < 0) crosses.push({ date: dates[curI], type: "death" });
  }
  return crosses;
}

export interface Bars {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
}

/** Assemble a full ChartData from raw daily bars: every derived series computed here. */
export function buildChartData(
  symbol: string,
  bars: Bars,
  extras: { companyName?: string; spotPrice?: number | null; callWall?: number | null; putWall?: number | null; gammaFlip?: number | null; asOf?: string } = {},
): ChartData {
  const { dates, open, high, low, close } = bars;
  const sma50 = smaSeries(close, 50);
  const sma200 = smaSeries(close, 200);
  return {
    symbol,
    companyName: extras.companyName,
    spotPrice: extras.spotPrice ?? close[close.length - 1] ?? 0,
    dates,
    open,
    high,
    low,
    close,
    bollinger: bollingerSeries(close),
    macd: macdSeries(close),
    rsi14: rsiSeries(close),
    sma50,
    sma200,
    crosses: detectAllCrosses(dates, sma50, sma200),
    callWall: extras.callWall ?? null,
    putWall: extras.putWall ?? null,
    gammaFlip: extras.gammaFlip ?? null,
    asOf: extras.asOf,
  };
}
