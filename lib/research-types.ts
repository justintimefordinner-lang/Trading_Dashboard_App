// Shapes for research.json (written by the Python research_sync) plus pure
// ranking helpers. No filesystem access here, so client components can import it.

export interface IndicatorSnapshot {
  price: number;
  sma20: number;
  bbUpper: number;
  bbLower: number;
  pctB: number;
  rsi: number;
  macd: number;
  signal: number;
  hist: number;
  histPrev?: number;
  macdBullish: boolean;
  macdBearish: boolean;
  freshBullCross: boolean;
  freshBearCross: boolean;
}

export interface SetupSignal {
  direction: "bullish" | "bearish";
  strength: "strong" | "forming";
  score: number;
  vehicles: string[];
}

export interface SetupSide {
  sub: { bb: number; rsi: number; macd: number };
  bbLow?: boolean;
  bbHigh?: boolean;
  rsiOversold?: boolean;
  rsiOverbought?: boolean;
  macdBullish?: boolean;
  macdBearish?: boolean;
}

export interface Setup {
  bullScore: number;
  bearScore: number;
  vehicleScores: Record<string, number>;
  bull: SetupSide;
  bear: SetupSide;
  signal: SetupSignal | null;
}

export type TickerData = IndicatorSnapshot & { setup: Setup };
export type ResearchTicker = TickerData | { error: string };

export interface ResearchFile {
  meta: { asOf: string; count: number; params: Record<string, number> };
  tickers: Record<string, ResearchTicker>;
  signals: {
    symbol: string;
    direction: "bullish" | "bearish";
    strength: "strong" | "forming";
    score: number;
    vehicles: string[];
    price: number;
    pctB: number;
    rsi: number;
    hist: number;
  }[];
}

export function hasData(t: ResearchTicker | undefined): t is TickerData {
  return !!t && !("error" in t);
}

// The four vehicles, each with the direction it trades and a short tab label.
export const VEHICLES: { key: string; label: string; direction: "bullish" | "bearish" }[] = [
  { key: "CSP", label: "CSPs", direction: "bullish" },
  { key: "LEAP", label: "LEAPs", direction: "bullish" },
  { key: "Bull Put Spread", label: "Bull Puts", direction: "bullish" },
  { key: "Bear Call Spread", label: "Bear Calls", direction: "bearish" },
];

export interface Candidate {
  symbol: string;
  score: number;
  t: TickerData;
}

// Names ranked by a vehicle's blended score, strongest first.
export function topCandidates(
  tickers: Record<string, ResearchTicker>,
  vehicle: string,
  min = 40,
  limit = 15,
): Candidate[] {
  const out: Candidate[] = [];
  for (const [symbol, t] of Object.entries(tickers)) {
    if (!hasData(t)) continue;
    const score = t.setup.vehicleScores?.[vehicle] ?? 0;
    if (score >= min) out.push({ symbol, score, t });
  }
  out.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  return out.slice(0, limit);
}

// The dominant signal for a name (whichever direction scores higher), for grid tinting.
export function dominant(t: TickerData): { direction: "bullish" | "bearish"; score: number } {
  const { bullScore, bearScore } = t.setup;
  return bullScore >= bearScore
    ? { direction: "bullish", score: bullScore }
    : { direction: "bearish", score: bearScore };
}

// ---- covered calls (holdings-gated) ---------------------------------------
// Unlike the approved-universe vehicles, covered-call candidates come from stock
// you actually hold: ≥100 shares (one contract), price at/above your cost basis
// (so a called-away exit isn't a loss), and an overbought / upper-band lean —
// you sell calls into strength. Score is that "toppiness" (the bearish bb + rsi
// gradient); cost-basis cushion is shown as context, not scored.
export interface Holding {
  symbol: string;
  qty: number;
  avgCost: number;
  price: number;
}

export interface CoveredCandidate {
  symbol: string;
  qty: number;
  contracts: number;
  avgCost: number;
  price: number;
  vsBasis: number; // (price − avgCost) / avgCost
  ccScore: number; // 0–100 toppiness
  t: TickerData;
}

export function coveredCandidates(
  holdings: Holding[],
  tickers: Record<string, ResearchTicker>,
  nearBasis = 0.97, // price must be ≥ 97% of basis (at/above, small cushion below)
  minScore = 40,
): CoveredCandidate[] {
  const out: CoveredCandidate[] = [];
  for (const h of holdings) {
    const contracts = Math.floor((h.qty || 0) / 100);
    if (contracts < 1 || !h.avgCost || h.avgCost <= 0) continue;
    if (h.price < h.avgCost * nearBasis) continue; // below/near basis only
    const t = tickers[h.symbol];
    if (!hasData(t)) continue;
    const bear = t.setup.bear.sub;
    const ccScore = Math.round(100 * (0.5 * bear.bb + 0.5 * bear.rsi));
    if (ccScore < minScore) continue;
    out.push({
      symbol: h.symbol,
      qty: h.qty,
      contracts,
      avgCost: h.avgCost,
      price: h.price,
      vsBasis: (h.price - h.avgCost) / h.avgCost,
      ccScore,
      t,
    });
  }
  out.sort((a, b) => b.ccScore - a.ccScore || a.symbol.localeCompare(b.symbol));
  return out;
}
