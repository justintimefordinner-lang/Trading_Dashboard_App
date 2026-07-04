// Shape of data/am_report.json (written by the Python am_report engine). Client-safe
// — no fs — so both the view and the server loader can import it.

export interface AmTrend {
  uptrend: boolean;
  ret18mo: number;
  above200: boolean;
  rising200: boolean;
  bollUp: boolean;
  pctAbove200: number;
  strength: number;
}

export interface AmChain {
  dte: number;
  exp: string;
  strike: number;
  delta: number;
  mark: number;
  premPct: number;
  annPct: number | null;
  oi: number;
  spreadPct: number;
}

export interface AmLadderLeg {
  dTarget: number;
  strike: number;
  delta: number;
  mark: number;
  premPct: number;
  annPct: number | null;
  oi: number;
  spreadPct: number;
  dte: number;
  exp: string;
  bbSigma?: number | null; // strike's σ from the 20-day mean (−2 = lower band)
  pctB?: number | null; // %B: 0 = lower band, 0.5 = mid, 1 = upper band
  bbZone?: string | null;
}

export interface AmGamma {
  flip: number | null;
  callWall: number | null;
  putWall: number | null;
  net: "pos" | "neg";
}

export type Vrp = "rich" | "fair" | "thin" | "n/a";
export type Tier = "S" | "A" | "B";

export interface AmBoardRow {
  sym: string;
  skip: boolean;
  fails: string[];
  trend: AmTrend;
  chain: AmChain | null;
  ladder: AmLadderLeg[];
  iv: number | null;
  rv: number | null;
  vrp: Vrp;
  vrpRatio: number | null;
  beta: number | null;
  gamma: AmGamma | null;
  score: number;
  tier: Tier;
  group: string;
  move?: number | null;
  last?: number | null;
  relVol?: number | null;
  ivr?: number | null;
  ivrSamples?: number;
  erDays?: number | null;
  erDate?: string | null;
  erSpansPut?: boolean;
}

export interface AmRegime {
  vix: number | null;
  vix3m: number | null;
  termStructure: "contango" | "backwardation" | null;
  band: string | null;
  cashRange: string | null;
  volWeather: "deploy" | "hold";
  futures: { sym: string; pct: number }[];
  s5fi?: number | null; // $SPXA50R breadth level (% of S&P 500 above 50-day SMA)
  s5fiSlopeWk?: number | null; // weekly-close slope (pts/week)
}

export interface AmVrpGroup {
  group: string;
  n: number;
  rich: number;
  fair: number;
  thin: number;
  richest: string;
  members: AmBoardRow[];
}

export interface AmMover {
  sym: string;
  move: number;
  last: number | null;
  vrp: Vrp;
  uptrend: boolean;
  gated: boolean;
  group: string;
}

export interface AmReport {
  meta: { asOf: string; source: string; count: number; passed: number; params?: unknown; ladderAsOf?: string; marketOpen?: boolean; earlyClose?: string | null; earningsLoaded?: boolean; ladderIntervalSec?: number; ladderNextAt?: string; ladderCadence?: "fast" | "base"; ladderStress?: { vix: number | null; ivts: number | null; spyMovePct: number | null; stressed: boolean } };
  regime: AmRegime;
  board: AmBoardRow[];
  movers?: { gainers: AmMover[]; losers: AmMover[] };
  vrpGroups: AmVrpGroup[];
  landmines?: { sym: string; erDate: string | null; erDays: number | null }[];
  steerClear: { sym: string; fails: string[] }[];
}

export function hasAmData(r: AmReport | null): r is AmReport {
  return !!r && Array.isArray(r.board);
}

export const TIER_STYLE: Record<Tier, string> = {
  S: "bg-emerald-500/25 text-emerald-100 ring-emerald-500/40",
  A: "bg-sky-500/20 text-sky-200 ring-sky-500/40",
  B: "bg-surface-2 text-muted ring-border",
};

export const VRP_STYLE: Record<Vrp, string> = {
  rich: "text-emerald-300",
  fair: "text-muted",
  thin: "text-rose-300",
  "n/a": "text-muted/60",
};
