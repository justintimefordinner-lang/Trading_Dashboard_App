// Domain models for the portfolio app.
// Data is loaded from data/*.json (written by the data bridge) at runtime, with a
// built-in example dataset as a fallback. The shapes below are the contract the UI
// relies on, independent of where the data comes from.

export interface Account {
  id: string;
  mask: string; // last-4 masked id, e.g. "••••0000"
  type: string; // "margin" | "cash"
  brokerageType: string; // "individual"
  nickname?: string;
  isDefault: boolean;
}

export interface PortfolioSummary {
  totalValue: number;
  equityValue: number;
  optionsValue: number;
  cryptoValue: number;
  cash: number;
  buyingPower: number;
  optionsBuyingPower?: number; // Schwab options buying power (deployable, net of collateral)
}

export interface Equity {
  symbol: string;
  name: string;
  qty: number;
  avgCost: number; // average cost per share
  price: number; // latest close per share
  dayChange?: number | null; // per-share $ move today (vs prior close), for Top Movers
  coveredCalls?: CoveredCallQuote[]; // ~30Δ call premiums at 14/21/30 DTE (holdings ≥100 sh)
}

// One ~30-delta covered-call quote at a target tenor, written by the bridge for held
// stock of ≥100 shares. Premiums refresh on a short cache during market hours.
export interface CoveredCallQuote {
  targetDte: number; // requested tenor (14 | 21 | 30)
  dte: number; // actual days to the chosen expiration
  strike: number;
  delta: number;
  mark: number; // premium per share to sell the call
  premPct: number; // mark ÷ spot, %
  annPct: number | null; // premPct annualized (×365/dte)
  oi: number;
}

export interface CryptoHolding {
  symbol: string; // e.g. "BTC"
  name: string; // e.g. "Bitcoin"
  qty: number;
  avgCost?: number; // average cost per unit (optional — connector may not supply)
  price: number; // latest price per unit
}

// Extended to carry every category the Schwab bridge (export_to_app.py)
// classifies. The original three (csp / leap-call / leap-put-hedge) still drive
// the CSP and LEAPS tabs; the rest flow through the data so nothing is dropped
// and get their own surfaces incrementally.
export type OptionKind =
  | "leap-call"
  | "leap-put-hedge"
  | "csp"
  | "covered-call"
  | "put-spread"
  | "call-spread"
  | "other";

export interface OptionPosition {
  id: string;
  kind: OptionKind;
  symbol: string;
  optionType: "call" | "put";
  side: "long" | "short";
  qty: number;
  strike: number;
  expiration: string; // ISO yyyy-mm-dd
  entryPerShare: number; // premium per share at entry (cost basis); positive magnitude
  mark: number; // current mark per share
  delta: number;
  gamma?: number | null; // dΔ/dS (long-option convention), for the Simulate projection
  vega?: number | null; // dV/dσ per vol-point (long-option convention), for the Simulate IV-shift term
  theta: number;
  iv: number; // implied volatility (decimal, e.g. 0.61)
  breakeven: number;
  underlyingPrice?: number; // current price of the underlying (for "to strike")
  underlyingChange?: number | null; // underlying per-share $ move today (Top Movers)
  underlyingClose?: number | null; // regular-session close — Simulate reference price
  underlyingLive?: number | null; // current/after-hours last — Simulate target price
  dayValueChange?: number | null; // this leg's signed $ value move today (Top Movers)
  bbSigma?: number | null; // strike's σ from the underlying's 20-day mean (−2 = lower BB)
  chanceOfProfitShort?: number; // 0..1, for short positions
  openedAt?: string; // ISO date the position was opened (held positions only)
  erDate?: string | null; // next earnings date (ISO) for the underlying, if known
}

export interface ValuePoint {
  label: string;
  value: number;
}

export interface ResearchIdea {
  symbol: string;
  name: string;
  strategy: "csp" | "leap";
  thesis: string;
  signal: string; // short tag, e.g. "IV rank 62%"
  watch: boolean;
}

// ---- CSP screener model ----------------------------------------------------
/**
 * A screened cash-secured-put candidate. Raw inputs only — the composite score
 * is computed at render time by lib/csp-model.ts so the breakdown is always
 * visible. Fields the data bridge can't supply (IV Rank, technicals,
 * event calendar) are nullable and the score renormalizes over what's present.
 */
export interface CSPCandidate {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  underlyingPrice: number;
  strike: number;
  expiration: string; // ISO yyyy-mm-dd
  dte: number;
  bid: number;
  ask: number;
  mark: number; // per share
  delta: number; // assignment proxy, magnitude (e.g. 0.21)
  theta: number;
  iv: number; // decimal (absolute IV)
  openInterest: number;
  volume: number;
  chanceOfProfitShort: number; // 0..1
  fundamentals: {
    largeCap: boolean | null;
    sp500: boolean | null;
    profitable: boolean | null;
  };
  ivRank: number | null; // 0..100; null = no historical-IV feed
  technical: {
    aboveSma50: boolean | null;
    rsi: number | null;
    strikeBelowSupport: boolean | null;
  };
  flags: {
    earningsBeforeExp: boolean | null; // null = unverified (no earnings feed)
    exDivBeforeExp: boolean | null;
  };
  source?: "holding" | "discovered"; // how the name entered the screen
  instrumentId?: string;
}

export interface CSPCandidatesFile {
  meta: {
    generatedAt: string;
    pricesAsOf: string;
    dteBasis: string; // human note, e.g. "as of 2026-06-15"
    universe: string;
    note?: string;
  };
  candidates: CSPCandidate[];
}

// A closed cash-secured-put round-trip (reconstructed from option order history).
export interface ClosedCSP {
  id: string;
  symbol: string;
  name: string;
  strike: number;
  expiration: string;
  openedAt: string;
  closedAt: string;
  contracts: number;
  creditPerShare: number;
  creditReceived: number; // $ credit at open
  costToClose: number; // $ debit to buy-to-close (0 if expired)
  realizedPnl: number; // $
  outcome: "closed_profit" | "closed_loss" | "expired";
  daysHeld: number;
  collateral: number;
  returnOnCollateral: number; // decimal
  annualized: number; // decimal
}

export interface ClosedCSPFile {
  meta: { generatedAt: string; source: string; note?: string };
  closed: ClosedCSP[];
}

// A closed long-LEAP round-trip (reconstructed from option order history).
export interface ClosedLeap {
  id: string;
  symbol: string;
  name: string;
  optionType: "call" | "put";
  strike: number;
  expiration: string;
  openedAt: string;
  closedAt: string;
  contracts: number;
  entryPerShare: number; // debit paid per share at open
  costBasis: number; // $ paid at open
  proceeds: number; // $ received at close (0 if expired worthless)
  realizedPnl: number; // proceeds − costBasis
  outcome: "closed_profit" | "closed_loss" | "expired";
  daysHeld: number;
  returnPct: number; // realizedPnl ÷ costBasis (decimal)
  annualized: number; // decimal
}

export interface ClosedLeapFile {
  meta: { generatedAt: string; source: string; note?: string };
  closed: ClosedLeap[];
}

// A closed covered-call round-trip (short call written against stock).
export interface ClosedCoveredCall {
  id: string;
  symbol: string;
  name: string;
  strike: number;
  expiration: string;
  openedAt: string;
  closedAt: string;
  contracts: number;
  creditPerShare: number;
  creditReceived: number; // $ collected at open
  costToClose: number; // $ to buy-to-close (0 if expired)
  realizedPnl: number;
  outcome: "closed_profit" | "closed_loss" | "expired";
  daysHeld: number;
  returnOnNotional: number; // realizedPnl ÷ (strike × 100 × contracts), decimal
  annualized: number; // decimal
}

export interface ClosedCoveredFile {
  meta: { generatedAt: string; source: string; note?: string };
  closed: ClosedCoveredCall[];
}

// A closed vertical-spread round-trip (short + long leg, same expiration).
export interface ClosedSpread {
  id: string;
  symbol: string;
  name: string;
  optionType: "call" | "put";
  shortStrike: number;
  longStrike: number;
  width: number;
  expiration: string;
  openedAt: string;
  closedAt: string;
  contracts: number;
  isCredit: boolean;
  netCreditPerShare: number; // signed per share: + credit, − debit
  netOpen: number; // $ net received(+)/paid(−) at open
  netClose: number; // $ net to close (signed)
  realizedPnl: number;
  maxRisk: number; // defined risk in $
  outcome: "closed_profit" | "closed_loss" | "expired";
  daysHeld: number;
  returnOnRisk: number; // realizedPnl ÷ maxRisk, decimal
  annualized: number; // decimal
}

export interface ClosedSpreadFile {
  meta: { generatedAt: string; source: string; note?: string };
  closed: ClosedSpread[];
}

// A closed stock round-trip (FIFO buys→sells, or short cover).
export interface ClosedStock {
  id: string;
  symbol: string;
  name: string;
  side: "long" | "short";
  shares: number;
  avgOpen: number; // avg fill at the opening side
  avgClose: number; // avg fill at the closing side
  costBasis: number; // $ at open
  proceeds: number; // $ at close
  realizedPnl: number;
  outcome: "closed_profit" | "closed_loss";
  openedAt: string;
  closedAt: string;
  daysHeld: number;
  returnPct: number; // realizedPnl ÷ costBasis (decimal)
  annualized: number; // decimal
}

export interface ClosedStockFile {
  meta: { generatedAt: string; source: string; note?: string };
  closed: ClosedStock[];
}

export interface SnapshotMeta {
  generatedAt: string; // ISO timestamp the data was pulled
  pricesAsOf: string; // human label, e.g. "2026-06-12 close"
  source: string; // "schwab-bridge" | "seed"
}

/** Per-account market data. */
export interface AccountData {
  summary: PortfolioSummary;
  equities: Equity[];
  options: OptionPosition[];
  valueHistory: ValuePoint[];
  /**
   * Per-coin crypto holdings. Optional: the data bridge exposes no
   * crypto-positions read tool, so this is absent unless seeded by hand. When
   * absent, the UI falls back to summary.cryptoValue (aggregate only).
   */
  crypto?: CryptoHolding[];
}

/**
 * The live, refreshable market data the UI renders. Produced by the data bridge
 * and written to data/snapshot.json.
 *
 * `data` is keyed by account id (see `accounts[].id`).
 */
export interface Snapshot {
  meta: SnapshotMeta;
  accounts: Account[];
  data: Record<string, AccountData>;
}
