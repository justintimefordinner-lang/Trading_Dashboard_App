// VIX / volatility-regime engine — the Options Trading University "VIX Cash
// Allocation" framework. The bands and cash/invested targets mirror the
// Streamlit dashboard's schwab_client.VIX_GUIDE exactly, so the app and the
// Google Sheet read the VIX the same way. Pure functions only.

export type Regime = "extreme-greed" | "greed" | "slight-fear" | "fear" | "very-fear" | "extreme-fear";
export type TermStructure = "deep_contango" | "contango" | "backwardation" | "deep_backwardation";
export type Edge = "thin" | "ok" | "fat";
export type S5fiZone = "oversold" | "rebuilding" | "noTrend" | "constructive" | "overbought";
export type S5fiTrend = "strength" | "sideways" | "weakness";

export interface VixInputs {
  vix: number;
  vix9d: number | null;
  vix3m: number | null;
  vvix: number | null;
  skew: number | null;
  realizedVol20: number | null;
  realizedVol30: number | null;
  realizedVolBasis?: string;
  s5fi?: number | null; // $SPXA50R — % of S&P 500 above their 50-day SMA
  s5fiSlopeWk?: number | null; // weekly-close least-squares slope (pts/week)
  s5fiWeekly?: number[] | null; // recent weekly closes, oldest→newest (for the sparkline)
}

export interface VixSnapshot {
  asof: string;
  source: string;
  note?: string;
  inputs: VixInputs;
}

export interface VixAssessment {
  vix: number;
  regime: Regime;
  regimeLabel: string;
  realizedVol: number | null;
  vrp: number | null;
  edge: Edge | null;
  ivts: number | null;
  termStructure: TermStructure | null;
  vix9d: number | null;
  vvix: number | null;
  skew: number | null;
  s5fi: number | null;
  s5fiZone: S5fiZone | null;
  s5fiTrend: S5fiTrend | null;
  s5fiSlopeWk: number | null;
  s5fiWeekly: number[] | null;
  baseReservePct: number;
  targetReservePct: number; // cash target (band midpoint), share of total account
  targetDeployedPct: number; // 1 - reserve
  targetReserveLow: number; // cash band low (e.g. 0.20 for 20–25%)
  targetReserveHigh: number; // cash band high (e.g. 0.25 for 20–25%)
  cashRange: string; // e.g. "20–25%"
  investedRange: string; // e.g. "75–80%"
  sizeMultiplier: number | null;
  hookRequired: boolean;
  confidence: "full" | "reduced";
  missing: string[];
  marketRead: string;
  action: string;
  cspAction: string;
  notes: string[];
}

interface Band {
  low: number;
  high: number;
  regime: Regime;
  label: string;
  cashLow: number; // fraction of total account
  cashHigh: number;
  note?: string;
}

// Mirrors schwab_client.VIX_GUIDE (cash % of liquidation value per regime).
const GUIDE: Band[] = [
  { low: 0, high: 12, regime: "extreme-greed", label: "Extreme Greed", cashLow: 0.4, cashHigh: 0.5 },
  { low: 12, high: 15, regime: "greed", label: "Greed", cashLow: 0.3, cashHigh: 0.4 },
  { low: 15, high: 20, regime: "slight-fear", label: "Slight Fear", cashLow: 0.2, cashHigh: 0.25 },
  { low: 20, high: 25, regime: "fear", label: "Fear", cashLow: 0.1, cashHigh: 0.15 },
  { low: 25, high: 30, regime: "very-fear", label: "Very Fearful", cashLow: 0.05, cashHigh: 0.1 },
  { low: 30, high: Infinity, regime: "extreme-fear", label: "Extreme Fear", cashLow: 0.0, cashHigh: 0.05, note: "Find $$$!" },
];

const REGIME_LABEL: Record<Regime, string> = {
  "extreme-greed": "Extreme Greed",
  greed: "Greed",
  "slight-fear": "Slight Fear",
  fear: "Fear",
  "very-fear": "Very Fearful",
  "extreme-fear": "Extreme Fear",
};

/** Tailwind classes per regime, shared by the VIX page and the dashboard chip.
 *  Low VIX (greed, market rich) → cool; high VIX (fear, deploy) → warm. */
export const REGIME_COLORS: Record<Regime, { chip: string; bar: string }> = {
  "extreme-greed": { chip: "bg-slate-500/15 text-slate-300 ring-slate-500/30", bar: "bg-slate-400" },
  greed: { chip: "bg-sky-500/15 text-sky-300 ring-sky-500/30", bar: "bg-sky-400" },
  "slight-fear": { chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30", bar: "bg-emerald-400" },
  fear: { chip: "bg-amber-500/15 text-amber-300 ring-amber-500/30", bar: "bg-amber-400" },
  "very-fear": { chip: "bg-orange-500/15 text-orange-300 ring-orange-500/30", bar: "bg-orange-400" },
  "extreme-fear": { chip: "bg-rose-500/15 text-rose-300 ring-rose-500/30", bar: "bg-rose-400" },
};

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const rangeStr = (lo: number, hi: number) => `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;

function bandFor(vix: number): Band {
  return GUIDE.find((b) => vix >= b.low && vix < b.high) ?? GUIDE[GUIDE.length - 1];
}

// S5FI ($SPXA50R) level bands — % of S&P 500 above their 50-day SMA. Under 20 is
// oversold (a buying zone), over 80 overbought (shore up cash), and the 37–58
// middle is a no-trend chop zone. 20–37 and 58–80 are the transitions.
export function classifyS5fi(v: number): S5fiZone {
  if (v < 20) return "oversold";
  if (v < 37) return "rebuilding";
  if (v <= 58) return "noTrend";
  if (v <= 80) return "constructive";
  return "overbought";
}
// Weekly trend read off the slope of the weekly-close line (pts/week): a steep up
// slope is market strength, flat is sideways, a steep down slope is weakness.
const S5FI_TREND_STEEP = 2;
export function classifyS5fiTrend(slopeWk: number): S5fiTrend {
  if (slopeWk >= S5FI_TREND_STEEP) return "strength";
  if (slopeWk <= -S5FI_TREND_STEEP) return "weakness";
  return "sideways";
}

function classifyTermStructure(ivts: number): TermStructure {
  if (ivts < 0.9) return "deep_contango";
  if (ivts < 1.0) return "contango";
  if (ivts <= 1.1) return "backwardation";
  return "deep_backwardation";
}

function classifyEdge(vrp: number): Edge {
  if (vrp < 1.5) return "thin";
  if (vrp <= 4) return "ok";
  return "fat";
}

function vvixSizeMultiplier(vvix: number): number {
  if (vvix < 90) return 1.0;
  if (vvix < 110) return 0.75;
  if (vvix <= 120) return 0.5;
  return 0.25;
}

export function assessVix(snap: VixSnapshot): VixAssessment {
  const i = snap.inputs;
  const vix = i.vix;
  const band = bandFor(vix);

  const cashLow = band.cashLow;
  const cashHigh = band.cashHigh;
  const targetReservePct = round((cashLow + cashHigh) / 2, 4);
  const targetDeployedPct = round(1 - targetReservePct, 4);
  const cashRange = rangeStr(cashLow, cashHigh);
  const investedRange = rangeStr(1 - cashHigh, 1 - cashLow);

  // Secondary vol stats are not part of the OTU framework, but we keep the
  // fields populated when the feed provides them (it currently sends level only).
  const realizedVol = i.realizedVol20 ?? i.realizedVol30 ?? null;
  const vrp = realizedVol != null ? round(vix - realizedVol) : null;
  const edge = vrp != null ? classifyEdge(vrp) : null;
  const ivts = i.vix3m && i.vix3m > 0 ? round(vix / i.vix3m, 3) : null;
  const termStructure = ivts != null ? classifyTermStructure(ivts) : null;
  const sizeMultiplier = i.vvix != null ? vvixSizeMultiplier(i.vvix) : null;

  const s5fi = i.s5fi ?? null;
  const s5fiZone = s5fi != null ? classifyS5fi(s5fi) : null;
  const s5fiSlopeWk = i.s5fiSlopeWk ?? null;
  const s5fiTrend = s5fiSlopeWk != null ? classifyS5fiTrend(s5fiSlopeWk) : null;

  return {
    vix,
    regime: band.regime,
    regimeLabel: REGIME_LABEL[band.regime],
    realizedVol,
    vrp,
    edge,
    ivts,
    termStructure,
    vix9d: i.vix9d ?? null,
    vvix: i.vvix,
    skew: i.skew,
    s5fi,
    s5fiZone,
    s5fiTrend,
    s5fiSlopeWk,
    s5fiWeekly: i.s5fiWeekly ?? null,
    baseReservePct: targetReservePct,
    targetReservePct,
    targetDeployedPct,
    targetReserveLow: cashLow,
    targetReserveHigh: cashHigh,
    cashRange,
    investedRange,
    sizeMultiplier,
    hookRequired: false,
    // The OTU framework needs only the VIX level, so a level-only feed is full confidence.
    confidence: "full",
    missing: [],
    marketRead: buildMarketRead(vix, band, cashRange, investedRange),
    action: buildAction(band, cashRange, investedRange),
    cspAction: buildCspAction(band),
    notes: buildNotes(band, cashRange, investedRange),
  };
}

function buildMarketRead(vix: number, band: Band, cash: string, invested: string): string {
  const v = vix.toFixed(1);
  switch (band.regime) {
    case "extreme-greed":
      return `VIX ${v} — Extreme Greed. The market is richly priced and complacent; the framework keeps the most cash here (${cash}) and the least invested (${invested}).`;
    case "greed":
      return `VIX ${v} — Greed. Still a calm, expensive tape. Hold a healthy cash buffer (${cash}); stay ${invested} invested.`;
    case "slight-fear":
      return `VIX ${v} — Slight Fear. The sweet spot to lean in: target ${invested} invested, ${cash} cash.`;
    case "fear":
      return `VIX ${v} — Fear. Premium is rich and the framework pushes capital to work: ${invested} invested, only ${cash} cash.`;
    case "very-fear":
      return `VIX ${v} — Very Fearful. Stress is high and premium is fat; the framework deploys hard — ${invested} invested, just ${cash} cash.`;
    case "extreme-fear":
      return `VIX ${v} — Extreme Fear. Crisis pricing — deploy nearly everything (${invested} invested, ${cash} cash). ${band.note ?? ""}`.trim();
  }
}

function buildAction(band: Band, cash: string, invested: string): string {
  switch (band.regime) {
    case "extreme-greed":
      return `Rich market — hold ${cash} cash`;
    case "greed":
      return `Stay defensive — ${cash} cash`;
    case "slight-fear":
      return `Lean in — ${invested} invested`;
    case "fear":
      return `Deploy — ${invested} invested`;
    case "very-fear":
      return `Deploy hard — ${invested} invested`;
    case "extreme-fear":
      return `Back up the truck — ${invested} invested${band.note ? ` (${band.note})` : ""}`;
  }
}

function buildCspAction(band: Band): string {
  switch (band.regime) {
    case "extreme-greed":
      return "Premium is thin in deep calm. Sell sparingly and only your highest-conviction strikes; keep the large cash buffer the regime calls for.";
    case "greed":
      return "Calm tape — sell to target on quality names at your usual delta, but keep cash near the band; don't over-commit collateral.";
    case "slight-fear":
      return "The premium-selling sweet spot. Sell CSPs to target on quality underlyings; this is where the framework wants you working.";
    case "fear":
      return "Rich premium — favor quality underlyings and put more collateral to work, keeping only a thin cash reserve per the band.";
    case "very-fear":
      return "Very rich premium — deploy aggressively on quality underlyings, keep only a sliver of cash, and watch assignment and margin as collateral ramps.";
    case "extreme-fear":
      return "Crisis pricing pays the most premium. Deploy aggressively on quality names, mind assignment risk, and keep almost no idle cash.";
  }
}

function buildNotes(band: Band, cash: string, invested: string): string[] {
  const notes: string[] = [
    `Framework target for ${band.label}: ${cash} cash / ${invested} invested (Options Trading University VIX Cash Allocation).`,
  ];
  if (band.note) notes.push(`${band.label}: ${band.note}`);
  return notes;
}
