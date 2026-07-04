// ---------------------------------------------------------------------------
// Cash-Secured Put (CSP) screening + scoring model.
// Encodes the research-backed criteria from CSP_FEATURE_SPEC.md as pure,
// testable TypeScript. The composite score is computed here (not baked into the
// data) so the UI can always show *why* a candidate scored the way it did.
//
// Components the Robinhood connector can't supply (IV Rank, technicals, event
// calendar) are scored as `null` and EXCLUDED from the weighted total, which is
// renormalized over the available weight. `availableWeight` reports coverage.
// ---------------------------------------------------------------------------
import type { CSPCandidate } from "./types";

const MULT = 100;

// ---- derived numbers -----------------------------------------------------
export function premium(c: CSPCandidate): number {
  return c.mark * MULT;
}
export function collateral(c: CSPCandidate): number {
  return c.strike * MULT;
}
/** Return on collateral over the holding window if the put expires worthless. */
export function periodReturn(c: CSPCandidate): number {
  return c.mark / c.strike;
}
export function annualizedReturn(c: CSPCandidate): number {
  return periodReturn(c) * (365 / Math.max(c.dte, 1));
}
export function effectiveCostBasis(c: CSPCandidate): number {
  return c.strike - c.mark;
}
export function breakeven(c: CSPCandidate): number {
  return c.strike - c.mark;
}
export function spread(c: CSPCandidate): number {
  return Math.max(0, c.ask - c.bid);
}
export function spreadPct(c: CSPCandidate): number {
  return c.mark > 0 ? spread(c) / c.mark : 1;
}
export function downsidePct(c: CSPCandidate): number {
  // how far OTM the strike sits below spot
  return c.underlyingPrice > 0 ? (c.underlyingPrice - c.strike) / c.underlyingPrice : 0;
}

// ---- scoring -------------------------------------------------------------
export interface ScoreComponent {
  key: string;
  label: string;
  weight: number; // 0..1
  score: number | null; // 0..100, null = data not available
  detail: string;
}

export interface CSPScore {
  total: number; // 0..100 over available components
  availableWeight: number; // 0..1 fraction of rubric that could be scored
  components: ScoreComponent[];
  missing: string[]; // labels of components excluded for lack of data
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const lerp = (x: number, x0: number, y0: number, x1: number, y1: number) =>
  y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);

function scoreStockQuality(c: CSPCandidate): ScoreComponent {
  const f = c.fundamentals;
  const known = [f.largeCap, f.sp500, f.profitable].filter((v) => v !== null) as boolean[];
  const score = known.length ? (known.filter(Boolean).length / known.length) * 100 : null;
  return {
    key: "quality",
    label: "Stock quality",
    weight: 0.2,
    score,
    detail: known.length
      ? `${[f.largeCap && "large-cap", f.sp500 && "S&P 500", f.profitable && "profitable"].filter(Boolean).join(", ") || "fails filters"}`
      : "fundamentals feed not connected",
  };
}

function scoreLiquidity(c: CSPCandidate): ScoreComponent {
  const oi = c.openInterest >= 2000 ? 100 : c.openInterest >= 500 ? lerp(c.openInterest, 500, 60, 2000, 100) : (c.openInterest / 500) * 60;
  const vol = c.volume >= 1000 ? 100 : c.volume >= 100 ? lerp(c.volume, 100, 60, 1000, 100) : (c.volume / 100) * 60;
  const sp = spreadPct(c);
  const spreadScore = sp <= 0.03 ? 100 : sp <= 0.05 ? 80 : sp <= 0.08 ? 55 : sp <= 0.12 ? 35 : 15;
  const score = clamp(0.4 * oi + 0.3 * vol + 0.3 * spreadScore);
  return {
    key: "liquidity",
    label: "Liquidity",
    weight: 0.15,
    score,
    detail: `OI ${c.openInterest.toLocaleString()}, vol ${c.volume.toLocaleString()}, spread ${(sp * 100).toFixed(0)}%`,
  };
}

function scoreIvRank(c: CSPCandidate): ScoreComponent {
  let score: number | null = null;
  if (c.ivRank !== null) {
    const r = c.ivRank;
    score = clamp(r <= 30 ? lerp(r, 0, 0, 30, 25) : r <= 50 ? lerp(r, 30, 25, 50, 60) : r <= 70 ? lerp(r, 50, 60, 70, 85) : lerp(r, 70, 85, 90, 100));
  }
  return {
    key: "ivRank",
    label: "IV Rank",
    weight: 0.2,
    score,
    detail: c.ivRank !== null ? `IVR ${c.ivRank.toFixed(0)}` : `IVR feed not connected (abs IV ${(c.iv * 100).toFixed(0)}%)`,
  };
}

function scoreDte(c: CSPCandidate): ScoreComponent {
  const d = c.dte;
  let score: number;
  if (d >= 30 && d <= 45) score = 100;
  else if (d < 30) score = clamp(lerp(d, 7, 40, 30, 100), 20, 100);
  else score = clamp(lerp(d, 45, 100, 75, 50), 40, 100);
  return { key: "dte", label: "DTE fit", weight: 0.1, score, detail: `${d} DTE` };
}

function scoreDelta(c: CSPCandidate): ScoreComponent {
  const d = c.delta;
  let score: number;
  if (d >= 0.15 && d <= 0.25) score = 100;
  else if (d < 0.15) score = clamp(lerp(d, 0.05, 40, 0.15, 100), 30, 100);
  else score = clamp(lerp(d, 0.25, 100, 0.45, 30), 20, 100);
  return { key: "delta", label: "Delta fit", weight: 0.1, score, detail: `Δ ${d.toFixed(2)} (~${Math.round(d * 100)}% assign)` };
}

function scoreTechnical(c: CSPCandidate): ScoreComponent {
  const t = c.technical;
  const known = t.aboveSma50 !== null || t.rsi !== null || t.strikeBelowSupport !== null;
  let score: number | null = null;
  if (known) {
    let pts = 0;
    if (t.aboveSma50) pts += 30;
    if (t.rsi !== null && t.rsi >= 30 && t.rsi <= 50) pts += 30;
    if (t.strikeBelowSupport) pts += 40;
    score = clamp(pts);
  }
  return {
    key: "technical",
    label: "Technical",
    weight: 0.1,
    score,
    detail: known ? "support/MA/RSI" : "OHLCV feed not connected",
  };
}

function scorePremiumYield(c: CSPCandidate): ScoreComponent {
  const a = annualizedReturn(c) * 100; // percent
  const score = clamp(a <= 10 ? (a / 10) * 30 : a <= 30 ? lerp(a, 10, 30, 30, 100) : 100);
  return { key: "yield", label: "Premium yield", weight: 0.1, score, detail: `${a.toFixed(0)}% annualized` };
}

function scoreEventRisk(c: CSPCandidate): ScoreComponent {
  const e = c.flags.earningsBeforeExp;
  const x = c.flags.exDivBeforeExp;
  let score: number | null = null;
  if (e !== null || x !== null) score = e || x ? 0 : 100;
  return {
    key: "event",
    label: "Event risk",
    weight: 0.05,
    score,
    detail: e === null && x === null ? "earnings/ex-div unverified" : e || x ? "event before expiry" : "no events before expiry",
  };
}

export function scoreCandidate(c: CSPCandidate): CSPScore {
  const components = [
    scoreStockQuality(c),
    scoreLiquidity(c),
    scoreIvRank(c),
    scoreDte(c),
    scoreDelta(c),
    scoreTechnical(c),
    scorePremiumYield(c),
    scoreEventRisk(c),
  ];
  const available = components.filter((x) => x.score !== null);
  const wSum = available.reduce((s, x) => s + x.weight, 0);
  const total = wSum > 0 ? available.reduce((s, x) => s + x.weight * (x.score as number), 0) / wSum : 0;
  return {
    total: Math.round(total),
    availableWeight: wSum,
    components,
    missing: components.filter((x) => x.score === null).map((x) => x.label),
  };
}

export function scoreBand(total: number): { label: string; chip: string } {
  if (total >= 80) return { label: "Strong", chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" };
  if (total >= 65) return { label: "Good", chip: "bg-sky-500/15 text-sky-300 ring-sky-500/30" };
  if (total >= 50) return { label: "Fair", chip: "bg-amber-500/15 text-amber-300 ring-amber-500/30" };
  return { label: "Weak", chip: "bg-rose-500/15 text-rose-300 ring-rose-500/30" };
}

// ---- screener configs (Section 3.5) --------------------------------------
export interface ScreenerConfig {
  id: string;
  name: string;
  minIvRank: number | null;
  deltaMin: number;
  deltaMax: number;
  dteMin: number;
  dteMax: number;
  note: string;
}

export const DEFAULT_SCREENERS: ScreenerConfig[] = [
  { id: "conservative", name: "Conservative Income", minIvRank: 50, deltaMin: 0.15, deltaMax: 0.2, dteMin: 30, dteMax: 45, note: "S&P 500 only, no events" },
  { id: "balanced", name: "Balanced Wheel", minIvRank: 40, deltaMin: 0.2, deltaMax: 0.3, dteMin: 21, dteMax: 45, note: "Large+mid cap, no events" },
  { id: "high-premium", name: "High Premium", minIvRank: 70, deltaMin: 0.2, deltaMax: 0.3, dteMin: 30, dteMax: 45, note: "Verify why IV is elevated" },
  { id: "acquisition", name: "Stock Acquisition", minIvRank: null, deltaMin: 0.25, deltaMax: 0.35, dteMin: 30, dteMax: 60, note: "You want assignment" },
];

/** Apply a screener's delta/DTE/IVR gates to a candidate (IVR ignored when null). */
export function passesScreener(c: CSPCandidate, s: ScreenerConfig): boolean {
  if (c.delta < s.deltaMin || c.delta > s.deltaMax) return false;
  if (c.dte < s.dteMin || c.dte > s.dteMax) return false;
  if (s.minIvRank !== null && c.ivRank !== null && c.ivRank < s.minIvRank) return false;
  return true;
}
