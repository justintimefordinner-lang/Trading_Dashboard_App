// Example-mode research feed (ResearchFile, normally written by research_sync.py).
// Populates the Research tab's grid, vehicle tabs, and covered-call candidates.
//
// Nothing here is hand-set. Each ticker's Bollinger %B, RSI(14) and MACD(12/26/9)
// are computed from the real daily closes in lib/example-market.ts, and scored
// with a line-for-line port of the bridge's indicators.py (compute_indicators +
// classify). The demo therefore shows exactly what a live install showed at that
// close — which names are toppy, which are washed out — instead of a story that
// was true once.
import { EXAMPLE_AS_OF, EXAMPLE_CLOSES } from "./example-market";
import type { IndicatorSnapshot, Setup, TickerData, ResearchFile, ResearchTicker } from "./research-types";

// Thresholds and periods: indicators.py PARAMS.
const BB_LOW = 0.25;
const BB_HIGH = 0.75;
const RSI_OVERSOLD = 40;
const RSI_OVERBOUGHT = 60;
const PARAMS = {
  bbPeriod: 20, bbMult: 2, bbLow: BB_LOW, bbHigh: BB_HIGH,
  rsiPeriod: 14, rsiOversold: RSI_OVERSOLD, rsiOverbought: RSI_OVERBOUGHT,
  macdFast: 12, macdSlow: 26, macdSignal: 9,
  strongScore: 65, formingScore: 40,
};

const round = (x: number, d = 4) => +x.toFixed(d);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  let prev = values[0];
  for (const v of values.slice(1)) {
    prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

// Wilder's RSI, latest reading.
function rsiLatest(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  let ag = gains.slice(0, period).reduce((s, x) => s + x, 0) / period;
  let al = losses.slice(0, period).reduce((s, x) => s + x, 0) / period;
  for (let i = period; i < gains.length; i++) {
    ag = (ag * (period - 1) + gains[i]) / period;
    al = (al * (period - 1) + losses[i]) / period;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function computeIndicators(closes: number[]): IndicatorSnapshot | null {
  if (closes.length < 35) return null; // slow EMA + signal + a prior bar for a cross
  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  const macdLine = fast.map((f, i) => f - slow[i]);
  const signalLine = emaSeries(macdLine, 9);
  const hist = macdLine.map((m, i) => m - signalLine[i]);
  const rsi = rsiLatest(closes);
  if (rsi == null) return null;

  const window = closes.slice(-20);
  const mid = window.reduce((s, x) => s + x, 0) / 20;
  const sd = Math.sqrt(window.reduce((s, x) => s + (x - mid) ** 2, 0) / 20); // population SD
  const upper = mid + 2 * sd;
  const lower = mid - 2 * sd;
  const price = closes[closes.length - 1];
  const hNow = hist[hist.length - 1];
  const hPrev = hist[hist.length - 2];
  return {
    price: round(price, 2),
    sma20: round(mid, 2),
    bbUpper: round(upper, 2),
    bbLower: round(lower, 2),
    pctB: round(upper > lower ? (price - lower) / (upper - lower) : 0.5),
    rsi: round(rsi, 2),
    macd: round(macdLine[macdLine.length - 1]),
    signal: round(signalLine[signalLine.length - 1]),
    hist: round(hNow),
    histPrev: round(hPrev),
    macdBullish: hNow > 0,
    macdBearish: hNow < 0,
    freshBullCross: hPrev <= 0 && hNow > 0,
    freshBearCross: hPrev >= 0 && hNow < 0,
  };
}

// Momentum gradient from the histogram: full credit when it's on the right side
// AND accelerating, partial when merely on-side or just turning.
function macdScore(hist: number, histPrev: number, bullish: boolean): number {
  const turning = bullish ? hist > histPrev : hist < histPrev;
  const onSide = bullish ? hist > 0 : hist < 0;
  if (onSide && turning) return 1;
  if (onSide) return 0.7;
  if (turning) return 0.4;
  return 0;
}

function classify(ind: IndicatorSnapshot): Setup {
  const { pctB, rsi, hist } = ind;
  const histPrev = ind.histPrev ?? hist;
  // Bullish: %B 1.0 at/below 0.10, 0 at/above 0.60 | RSI 1.0 at/below 35, 0 at 55
  const bbB = clamp01((0.6 - pctB) / 0.5);
  const rsB = clamp01((55 - rsi) / 20);
  const mcB = macdScore(hist, histPrev, true);
  // Bearish mirror: %B 0 at/below 0.40, 1.0 at/above 0.90 | RSI 0 at 45, 1.0 at 65
  const bbR = clamp01((pctB - 0.4) / 0.5);
  const rsR = clamp01((rsi - 45) / 20);
  const mcR = macdScore(hist, histPrev, false);

  const bull = Math.round((100 * (bbB + rsB + mcB)) / 3);
  const bear = Math.round((100 * (bbR + rsR + mcR)) / 3);
  let signal: Setup["signal"] = null;
  if (bull >= bear && bull >= 40) {
    signal = { direction: "bullish", strength: bull >= 65 ? "strong" : "forming", score: bull, vehicles: ["CSP", "LEAP", "Bull Put Spread"] };
  } else if (bear > bull && bear >= 40) {
    signal = { direction: "bearish", strength: bear >= 65 ? "strong" : "forming", score: bear, vehicles: ["Bear Call Spread"] };
  }
  return {
    bullScore: bull,
    bearScore: bear,
    vehicleScores: {
      CSP: Math.round(100 * (0.4 * bbB + 0.4 * rsB + 0.2 * mcB)),
      "Bull Put Spread": Math.round(100 * (0.4 * bbB + 0.4 * rsB + 0.2 * mcB)),
      LEAP: Math.round(100 * (0.25 * bbB + 0.25 * rsB + 0.5 * mcB)),
      "Bear Call Spread": Math.round(100 * (0.4 * bbR + 0.35 * rsR + 0.25 * mcR)),
    },
    bull: { bbLow: pctB <= BB_LOW, rsiOversold: rsi <= RSI_OVERSOLD, macdBullish: ind.macdBullish, sub: { bb: round(bbB, 2), rsi: round(rsB, 2), macd: round(mcB, 2) } },
    bear: { bbHigh: pctB >= BB_HIGH, rsiOverbought: rsi >= RSI_OVERBOUGHT, macdBearish: ind.macdBearish, sub: { bb: round(bbR, 2), rsi: round(rsR, 2), macd: round(mcR, 2) } },
    signal,
  };
}

// The approved universe shown in the demo: everything held in the example
// portfolio that an options wheel would screen, plus a few unheld names.
const UNIVERSE = [
  "NVDA", "AVGO", "TSM", "MU", "LRCX", "AMAT", "ADI", "INTC", "CRDO", "COHR", "GLW", "CLS",
  "AAPL", "GOOGL", "AMZN", "PLTR", "SOFI", "IREN", "CEG", "CDE", "CCL",
];

const tickers: ResearchFile["tickers"] = Object.fromEntries(
  UNIVERSE.map((sym): [string, ResearchTicker] => {
    const ind = computeIndicators(EXAMPLE_CLOSES[sym] ?? []);
    if (!ind) return [sym, { error: "not enough price history" }];
    const t: TickerData = { ...ind, setup: classify(ind) };
    return [sym, t];
  }),
);

const signals: ResearchFile["signals"] = Object.entries(tickers)
  .map(([symbol, t]) => {
    if ("error" in t || !t.setup.signal) return null;
    const s = t.setup.signal;
    return { symbol, direction: s.direction, strength: s.strength, score: s.score, vehicles: s.vehicles, price: t.price, pctB: t.pctB, rsi: t.rsi, hist: t.hist };
  })
  .filter((x): x is NonNullable<typeof x> => x !== null)
  .sort((a, b) => b.score - a.score);

export const exampleResearch: ResearchFile = {
  meta: { asOf: `${EXAMPLE_AS_OF}T20:00:00Z`, count: Object.keys(tickers).length, params: PARAMS },
  tickers,
  signals,
};
