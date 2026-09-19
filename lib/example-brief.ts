// Example-mode Morning Brief (AmReport). Mirrors what am_report.py produces, from
// the real close in lib/example-market.ts (prices, moves, regime, earnings), so
// the Briefing tab and the home CSP-board flags fully populate in a demo. Board
// names are drawn from the approved universe and deliberately overlap the example
// holdings (SOFI/INTC/MU are held & underweight → overlap green) while others
// (AVGO/TSM/LRCX) are unheld with score > 80 → high-conviction green.
import type {
  AmReport,
  AmBoardRow,
  AmChain,
  AmLadderLeg,
  AmTrend,
  AmGamma,
  AmVrpGroup,
  AmMover,
  Vrp,
  Tier,
} from "./am-report-types";
import { EXAMPLE_EARNINGS, EXAMPLE_MARKET as M, dayMovePct, daysToEarnings, lastClose } from "./example-market";

// Dates derive from today so the board never reads as stale — expirations stay in
// the future and the days-to-expiry on every ladder rung stays sensible.
const DAY_MS = 86_400_000;
const isoDay = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

// IV/RV pair per VRP bucket so vrpRatio agrees with the label.
const VRP_IVRV: Record<Vrp, [number, number]> = {
  rich: [0.42, 0.32],
  fair: [0.35, 0.33],
  thin: [0.28, 0.34],
  "n/a": [0.3, 0.3],
};

function chainFor(last: number): AmChain {
  const strike = Math.round(last * 0.9);
  const mark = +(last * 0.022).toFixed(2);
  const premPct = +((mark / last) * 100).toFixed(2);
  return { dte: 30, exp: isoDay(30), strike, delta: -0.3, mark, premPct, annPct: +((premPct * 365) / 30).toFixed(1), oi: 4200, spreadPct: 1.4 };
}

function ladderFor(last: number): AmLadderLeg[] {
  const leg = (dTarget: number, dAbs: number, dte: number, exp: string, sigma: number, zone: string): AmLadderLeg => {
    const strike = +(last * (1 - dAbs * 0.5)).toFixed(last < 20 ? 1 : 0);
    const mark = +(last * 0.02 * (dAbs / 0.3)).toFixed(2);
    const premPct = +((mark / last) * 100).toFixed(2);
    return { dTarget, strike, delta: -dAbs, mark, premPct, annPct: +((premPct * 365) / dte).toFixed(1), oi: 3200, spreadPct: 1.5, dte, exp, bbSigma: sigma, pctB: 0.3, bbZone: zone };
  };
  return [
    leg(16, 0.16, 14, isoDay(14), -1.9, "lower"),
    leg(30, 0.3, 30, isoDay(30), -1.0, "lower-mid"),
    leg(45, 0.45, 45, isoDay(45), -0.3, "mid"),
  ];
}

function trendFor(score: number): AmTrend {
  return {
    uptrend: score >= 60,
    ret18mo: +((score / 100) * 0.8).toFixed(2),
    above200: score >= 55,
    rising200: score >= 60,
    bollUp: score >= 70,
    pctAbove200: +((score - 50) * 0.6).toFixed(1),
    strength: score,
  };
}

function gammaFor(last: number): AmGamma {
  return { flip: Math.round(last), callWall: Math.round(last * 1.08), putWall: Math.round(last * 0.92), net: "pos" };
}

interface RowOpts {
  group: string;
  beta?: number;
  ivr?: number;
  relVol?: number;
  move?: number;
  er?: { date: string; days: number; spans: boolean };
}

function mkRow(sym: string, last: number, score: number, tier: Tier, vrp: Vrp, o: RowOpts): AmBoardRow {
  const [iv, rv] = VRP_IVRV[vrp];
  return {
    sym,
    skip: false,
    fails: [],
    trend: trendFor(score),
    chain: chainFor(last),
    ladder: ladderFor(last),
    iv,
    rv,
    vrp,
    vrpRatio: +(iv / rv).toFixed(2),
    beta: o.beta ?? 1.2,
    gamma: gammaFor(last),
    score,
    tier,
    group: o.group,
    move: o.move ?? 0,
    last,
    relVol: o.relVol ?? 1.1,
    ivr: o.ivr ?? 45,
    ivrSamples: 250,
    erDays: o.er?.days ?? null,
    erDate: o.er?.date ?? null,
    erSpansPut: o.er?.spans ?? false,
  };
}

// Prices, the day's move and earnings timing are real (lib/example-market.ts).
// The trend score, tier and VRP label are the screen's judgement calls and stay
// hand-set; they are chosen to agree with where each name actually sits.
function row(sym: string, score: number, tier: Tier, vrp: Vrp, o: Omit<RowOpts, "move" | "er">): AmBoardRow {
  const days = daysToEarnings(sym);
  const er = days != null && days <= 45 ? { date: EXAMPLE_EARNINGS[sym], days, spans: days <= 30 } : undefined;
  return mkRow(sym, lastClose(sym), score, tier, vrp, { ...o, move: dayMovePct(sym), er });
}

const board: AmBoardRow[] = [
  row("NVDA", 88, "S", "rich", { group: "AI / Semis", beta: 1.7, ivr: 58, relVol: 1.4 }),
  row("AVGO", 84, "S", "rich", { group: "AI / Semis", beta: 1.4, ivr: 52, relVol: 1.2 }),
  row("TSM", 82, "A", "fair", { group: "AI / Semis", beta: 1.1, ivr: 41, relVol: 1.0 }),
  row("MU", 76, "A", "rich", { group: "Memory", beta: 1.5, ivr: 61, relVol: 1.6 }),
  row("LRCX", 81, "A", "fair", { group: "Semi Equip", beta: 1.3, ivr: 47, relVol: 1.1 }),
  row("SOFI", 71, "A", "rich", { group: "Fintech", beta: 1.6, ivr: 55, relVol: 1.3 }),
  row("INTC", 58, "B", "fair", { group: "Semis", beta: 1.0, ivr: 38, relVol: 0.9 }),
  row("GLW", 63, "B", "fair", { group: "Optical", beta: 1.1, ivr: 44, relVol: 1.0 }),
];

function groupOf(group: string): AmVrpGroup {
  const members = board.filter((m) => m.group === group);
  const rich = members.filter((m) => m.vrp === "rich").length;
  const fair = members.filter((m) => m.vrp === "fair").length;
  const thin = members.filter((m) => m.vrp === "thin").length;
  const richest = [...members].sort((a, b) => (b.vrpRatio ?? 0) - (a.vrpRatio ?? 0))[0]?.sym ?? "";
  return { group, n: members.length, rich, fair, thin, richest, members };
}

// The day's actual biggest movers across the board plus the gated names, so a
// "gainer" is never a stock that fell.
const GATED: Record<string, string> = { CCL: "Travel", AA: "Materials", HL: "Miners" };
const moverPool: AmMover[] = [
  ...board.map((r) => ({ sym: r.sym, move: r.move, last: r.last, vrp: r.vrp, uptrend: r.trend.uptrend, gated: false, group: r.group })),
  ...Object.entries(GATED).map(([sym, group]) => ({ sym, move: dayMovePct(sym), last: lastClose(sym), vrp: "thin" as Vrp, uptrend: false, gated: true, group })),
];
const movers: { gainers: AmMover[]; losers: AmMover[] } = {
  gainers: moverPool.filter((m) => m.move > 0).sort((a, b) => b.move - a.move).slice(0, 3),
  losers: moverPool.filter((m) => m.move < 0).sort((a, b) => a.move - b.move).slice(0, 3),
};

// Regime exactly as am_report.py derives it: the VIX band, contango vs
// backwardation from VIX against VIX3M, and "deploy" unless the curve is
// inverted or VIX is 20+.
const BANDS: [number, string, string][] = [
  [12, "Extreme Greed", "40–50%"],
  [15, "Greed", "30–40%"],
  [20, "Slight Fear", "20–25%"],
  [25, "Fear", "10–15%"],
  [30, "Very Fearful", "5–10%"],
  [Infinity, "Extreme Fear", "0–5%"],
];
const [, band, cashRange] = BANDS.find(([hi]) => M.vix < hi) ?? BANDS[BANDS.length - 1];
const backwardation = M.vix > M.vix3m;

// Earnings inside the next two weeks, from the real calendar.
const landmines = Object.keys(EXAMPLE_EARNINGS)
  .map((sym) => ({ sym, erDate: EXAMPLE_EARNINGS[sym], erDays: daysToEarnings(sym) }))
  .filter((l): l is { sym: string; erDate: string; erDays: number } => l.erDays != null && l.erDays <= 14)
  .sort((a, b) => a.erDays - b.erDays);

export const exampleAmReport: AmReport = {
  meta: {
    asOf: new Date().toISOString(),
    source: "example",
    count: 36,
    passed: board.length,
    earningsLoaded: true,
    marketOpen: true,
    ladderAsOf: new Date(Date.now() - 60_000).toISOString(),
    ladderNextAt: new Date(Date.now() + 4 * 60_000).toISOString(),
    ladderCadence: "base",
  },
  regime: {
    vix: M.vix,
    vix3m: M.vix3m,
    termStructure: backwardation ? "backwardation" : "contango",
    band,
    cashRange,
    volWeather: backwardation || M.vix >= 20 ? "hold" : "deploy",
    futures: [
      { sym: "ES", pct: M.esPct },
      { sym: "NQ", pct: M.nqPct },
    ],
    s5fi: M.s5fi,
    s5fiSlopeWk: M.s5fiSlopeWk,
  },
  board,
  movers,
  vrpGroups: [groupOf("AI / Semis"), groupOf("Memory"), groupOf("Semi Equip"), groupOf("Fintech"), groupOf("Semis"), groupOf("Optical")],
  landmines,
  steerClear: [
    { sym: "CCL", fails: ["below 200DMA", "downtrend"] },
    { sym: "AA", fails: ["thin OI", "wide spreads"] },
    { sym: "HL", fails: ["IV too low", "below 200DMA"] },
  ],
};
