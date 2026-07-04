// Derived metrics, formatting, and the rule-based insight engine.
// All "what should I do" logic lives here so it can be tested and grown.
import type { CryptoHolding, Equity, OptionPosition } from "./types";

const MULT = 100; // standard options contract multiplier

// Current local calendar date (YYYY-MM-DD), evaluated per call so "days to
// expiry" / "days held" track the real clock instead of a value frozen at server
// start. Date-only, so timezone offsets don't shift the day count.
function nowISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---- formatting ----------------------------------------------------------
export function fmtMoney(n: number, opts: { cents?: boolean; sign?: boolean } = {}): string {
  const { cents = false, sign = false } = opts;
  const s = n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  return sign && n > 0 ? `+${s}` : s;
}

export function fmtPct(n: number, digits = 1): string {
  const v = (n * 100).toFixed(digits);
  return `${n > 0 ? "+" : ""}${v}%`;
}

export function fmtNum(n: number, digits = 2): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

// ---- equities ------------------------------------------------------------
export function equityValue(e: Equity): number {
  return e.qty * e.price;
}
export function equityCost(e: Equity): number {
  return e.qty * e.avgCost;
}
export function equityPnl(e: Equity): number {
  return equityValue(e) - equityCost(e);
}
export function equityPnlPct(e: Equity): number {
  const c = equityCost(e);
  return c === 0 ? 0 : equityPnl(e) / c;
}

// ---- crypto --------------------------------------------------------------
export function cryptoValue(c: CryptoHolding): number {
  return c.qty * c.price;
}

// ---- options -------------------------------------------------------------
/** Market value magnitude (always positive dollar size of the contracts). */
export function optionMarketValue(o: OptionPosition): number {
  return o.mark * MULT * o.qty;
}
/** Cost basis magnitude (premium paid for longs, credit received for shorts). */
export function optionBasis(o: OptionPosition): number {
  return o.entryPerShare * MULT * o.qty;
}
/** Unrealized P/L, sign-aware for long vs short. */
export function optionPnl(o: OptionPosition): number {
  const mv = optionMarketValue(o);
  const basis = optionBasis(o);
  return o.side === "long" ? mv - basis : basis - mv;
}
export function optionPnlPct(o: OptionPosition): number {
  const basis = optionBasis(o);
  return basis === 0 ? 0 : optionPnl(o) / basis;
}
/** Contribution of a position to net options value (long +, short -). */
export function optionNetValue(o: OptionPosition): number {
  return o.side === "long" ? optionMarketValue(o) : -optionMarketValue(o);
}

export function daysToExpiry(expiration: string, from: string = nowISO()): number {
  const a = new Date(`${expiration}T00:00:00Z`).getTime();
  const b = new Date(`${from}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

// Earnings risk for a short put against the underlying's next report.
//  • "spans"  — earnings falls on/before expiration (the put is held through the
//               report). The acute case → shown red.
//  • "near"   — earnings lands within 7 days AFTER expiration. The put clears the
//               report, but barely; relevant when rolling, and earnings dates drift,
//               so it's a heads-up → shown orange.
// Past earnings (already reported) return null.
export type CspErFlag = "spans" | "near";
export function cspEarningsFlag(
  expiration: string,
  erDate: string | null | undefined,
  from: string = nowISO(),
): CspErFlag | null {
  if (!erDate) return null;
  const er = new Date(`${erDate.slice(0, 10)}T00:00:00Z`).getTime();
  const exp = new Date(`${expiration}T00:00:00Z`).getTime();
  const today = new Date(`${from}T00:00:00Z`).getTime();
  if (er < today) return null; // already reported
  if (er <= exp) return "spans";
  return (er - exp) / 86_400_000 <= 7 ? "near" : null;
}

/** For a short premium-selling position: fraction of credit already captured. */
export function capturedPct(o: OptionPosition): number {
  if (o.entryPerShare === 0) return 0;
  return (o.entryPerShare - o.mark) / o.entryPerShare;
}

/** Cash a CSP ties up (strike × 100 × contracts). */
export function cspCollateral(o: OptionPosition): number {
  return o.strike * MULT * o.qty;
}

// Cushion from the underlying to the strike (to-strike %). Positive = out of
// the money (safe), negative = in the money (assignment risk). For short puts
// that's down to the strike; for short calls it's up to the strike (sign
// flips so the safe/at-risk meaning holds either way). Null when we don't
// have an underlying mark.
export function cspToStrike(o: OptionPosition): number | null {
  const up = o.underlyingPrice;
  if (!up || up <= 0) return null;
  return o.optionType === "call" ? (o.strike - up) / up : (up - o.strike) / up;
}

// Bollinger position of a strike: σ from the underlying's 20-day mean (−2 = lower
// band, 0 = mean, +2 = upper band), computed by the bridge. For a short put, further
// below the mean (more negative σ) is a deeper, more mean-reversion-friendly strike.
export function bbSigmaText(sigma: number | null | undefined): string {
  if (sigma == null) return "—";
  return `${sigma > 0 ? "+" : ""}${sigma.toFixed(1)}σ`;
}
export function bbSigmaZone(sigma: number | null | undefined): string {
  if (sigma == null) return "";
  if (sigma <= -2) return "below lower band";
  if (sigma <= -1) return "lower band";
  if (sigma < 1) return "near mean";
  if (sigma < 2) return "upper band";
  return "above upper band";
}
export function bbSigmaColor(sigma: number | null | undefined): string {
  if (sigma == null) return "text-muted";
  if (sigma <= -2) return "text-emerald-400";
  if (sigma <= -1) return "text-sky-400";
  if (sigma < 0.5) return "text-amber-400";
  return "text-rose-400";
}

// Shared risk banding by to-strike cushion — the single source for both the cash
// plan's stacked bars and the colored ticker names in the CSP list.
export type CspRiskBand = "wide" | "safe" | "low" | "near" | "atrisk" | "na";
export function cspRiskBand(o: OptionPosition): CspRiskBand {
  const t = cspToStrike(o);
  if (t == null) return "na";
  if (t < 0) return "atrisk";
  if (t < 0.05) return "near";
  if (t < 0.15) return "low";
  if (t < 0.2) return "safe";
  return "wide";
}
export const CSP_RISK_LABEL: Record<CspRiskBand, string> = {
  wide: "20%+", safe: "15–20%", low: "5–15%", near: "≤5%", atrisk: "ITM", na: "n/a",
};
// Bar fills (saturated).
export const CSP_RISK_BG: Record<CspRiskBand, string> = {
  wide: "bg-sky-500", safe: "bg-emerald-700", low: "bg-emerald-500", near: "bg-orange-400", atrisk: "bg-rose-500", na: "bg-slate-500",
};
// Text equivalents — kept legible on the dark surface (deep greens lifted).
export const CSP_RISK_TEXT: Record<CspRiskBand, string> = {
  wide: "text-sky-400", safe: "text-emerald-500", low: "text-emerald-400", near: "text-orange-400", atrisk: "text-rose-400", na: "text-text",
};

// Cash-settled index options (SPX, NDX, RUT, VIX, …) are margined, not secured
// by their full notional — so a short index put doesn't tie up strike×100 in cash
// the way an equity CSP does. Counting that notional as "collateral" wildly
// overstates capital deployed (a single SPXW 6465p = $646,500), so the collateral
// metrics exclude these.
const CASH_SETTLED_INDEXES = new Set([
  "SPX", "SPXW", "XSP", "NDX", "NDXP", "RUT", "RUTW", "MRUT", "VIX", "VIXW", "DJX", "OEX", "XEO", "NANOS",
]);
export function isCashSettledIndex(symbol: string): boolean {
  return CASH_SETTLED_INDEXES.has(symbol.toUpperCase());
}

// Money-market / sweep funds (e.g. Schwab SWGXX) report as positions but are
// really cash. Recognize the common ones, plus the 5-letter "…XX" pattern most
// sweep funds use, so they're treated as cash rather than a stock holding.
const CASH_EQUIVALENT_TICKERS = new Set([
  "SWGXX", "SWVXX", "SNVXX", "SNSXX", "SNAXX", "SCOXX", "SWPXX", "SUTXX", "SGUXX",
  "SPAXX", "FDRXX", "FZFXX", "SPRXX", "VMFXX", "VMRXX", "VUSXX",
]);
export function isCashEquivalent(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return CASH_EQUIVALENT_TICKERS.has(s) || /^[A-Z]{3}XX$/.test(s);
}
/** Max premium yield on collateral if the put expires worthless (credit ÷ collateral). */
export function cspPremiumYield(o: OptionPosition): number {
  return o.strike === 0 ? 0 : o.entryPerShare / o.strike;
}

/** Total cash equity CSPs tie up (cash-settled index puts excluded — margined). */
export function cspCollateralTotal(options: OptionPosition[]): number {
  return options
    .filter((o) => o.kind === "csp" && !isCashSettledIndex(o.symbol))
    .reduce((s, o) => s + cspCollateral(o), 0);
}

/**
 * Defined-risk capital of open vertical spreads. Pairs each short leg with a
 * long leg of the same underlying + option type + expiration (different strike),
 * mirroring the Sheets classify_positions valuation: a credit spread risks
 * (width − net credit); a debit spread risks the net debit paid.
 */
export function spreadRiskCapital(options: OptionPosition[]): number {
  const legs = options.filter((o) => o.kind === "put-spread" || o.kind === "call-spread");
  const groups = new Map<string, OptionPosition[]>();
  for (const o of legs) {
    const k = `${o.symbol}|${o.optionType}|${o.expiration}`;
    const g = groups.get(k);
    if (g) g.push(o);
    else groups.set(k, [o]);
  }
  let total = 0;
  for (const group of groups.values()) {
    const shorts = group.filter((o) => o.side === "short");
    const longs = group.filter((o) => o.side === "long");
    for (const s of shorts) {
      const li = longs.findIndex((l) => l.strike !== s.strike);
      if (li === -1) continue;
      const [l] = longs.splice(li, 1);
      const qty = Math.min(s.qty, l.qty);
      const netCredit = s.entryPerShare - l.entryPerShare; // per share, signed
      const width = Math.abs(s.strike - l.strike);
      const riskPerShare = netCredit >= 0 ? Math.max(width - netCredit, 0) : l.entryPerShare - s.entryPerShare;
      total += riskPerShare * MULT * qty;
    }
  }
  return total;
}
/**
 * Date a long position first qualifies for long-term capital gains. The IRS rule
 * is "held MORE than one year," so the first eligible day is one year + one day
 * after the open date.
 */
export function longTermDate(openedAtISO: string): string {
  const d = new Date(`${openedAtISO}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Days between two ISO dates (from → to), e.g. days held = daysBetween(openedAt, today). */
export function daysBetween(fromISO: string, toISO: string = nowISO()): number {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
/** Annualized return on the collateral if the put expires worthless.
 *  360-day convention, over remaining DTE — matches the CSP table's Yr % column. */
export function cspAnnualizedReturn(o: OptionPosition): number {
  const credit = optionBasis(o);
  const collateral = cspCollateral(o);
  const dte = Math.max(daysToExpiry(o.expiration), 1);
  return (credit / collateral) * (360 / dte);
}

/**
 * Premium not yet realized on a short put — the mark you'd still keep if it
 * expires worthless from here. Equal to the buy-to-close cost (mark × 100 × qty).
 */
export function cspRemainingPremium(o: OptionPosition): number {
  return optionMarketValue(o);
}
/** Return on collateral from the remaining (uncaptured) premium (mark ÷ strike). */
export function cspRemainingYield(o: OptionPosition): number {
  return o.strike === 0 ? 0 : o.mark / o.strike;
}
/** Annualized return on the remaining premium over the days left to expiry. */
export function cspRemainingAnnualized(o: OptionPosition): number {
  const dte = Math.max(daysToExpiry(o.expiration), 1);
  return cspRemainingYield(o) * (360 / dte);
}

// ---- insight engine ------------------------------------------------------
export type InsightLevel = "manage" | "roll" | "watch" | "hold";

export interface Insight {
  level: InsightLevel;
  label: string; // short action tag
  detail: string; // one-line rationale
}

const LEVEL_RANK: Record<InsightLevel, number> = { manage: 3, roll: 2, watch: 1, hold: 0 };

export function cspInsight(o: OptionPosition): Insight {
  const dte = daysToExpiry(o.expiration);
  const cap = capturedPct(o);
  const remAnn = cspRemainingAnnualized(o); // the row's "Yr%" — annualized return on remaining premium
  const itm = Math.abs(o.delta) >= 0.5;

  if (itm) {
    return {
      level: "manage",
      label: "Assignment risk",
      detail: `In the money (Δ ${o.delta.toFixed(2)}). Roll down & out for a credit, or accept assignment if you want the shares.`,
    };
  }
  // Rollable once the remaining premium's annualized return (the Yr% column) has
  // decayed below 25% — the collateral isn't working hard enough; harvest & redeploy.
  if (remAnn < 0.25) {
    return {
      level: "roll",
      label: "Rollable",
      detail: `Remaining premium annualizes to ${Math.round(remAnn * 100)}% (below 25%). Roll or close to redeploy the collateral.`,
    };
  }
  return {
    level: "hold",
    label: "Hold",
    detail: `${dte} DTE, ${Math.round(cap * 100)}% captured, ${Math.round(remAnn * 100)}% annualized on remaining. Let theta work.`,
  };
}

export function leapInsight(o: OptionPosition): Insight {
  const dte = daysToExpiry(o.expiration);
  const pnlPct = optionPnlPct(o);

  if (o.kind === "leap-put-hedge") {
    return {
      level: "hold",
      label: "Hedge",
      detail: `Protective put (Δ ${o.delta.toFixed(2)}). Insurance on NVDA — size, don't chase.`,
    };
  }
  if (dte < 365) {
    return {
      level: "roll",
      label: "Roll out",
      detail: `${dte} DTE — under 12 months. Roll further out before theta accelerates.`,
    };
  }
  if (o.delta >= 0.85) {
    // Tax-aware: a deep-ITM roll-up is warranted, but if the contract can still
    // comfortably reach the 1-year mark, defer the roll so the gain stays long-term.
    const wait = holdForLongTerm(o);
    if (wait) {
      return {
        level: "watch",
        label: "Hold for long-term",
        detail: `Deep ITM (Δ ${o.delta.toFixed(2)}) — a roll-up is warranted, but hold ${wait.days}d to ${wait.date} to clear the 1-year mark, then roll up to reset risk while keeping the gain long-term.`,
      };
    }
    return {
      level: "manage",
      label: "Roll up",
      detail: `Deep ITM (Δ ${o.delta.toFixed(2)}). Roll up to pull capital off the table and reset risk.`,
    };
  }
  if (o.delta < 0.6) {
    return {
      level: "watch",
      label: "Low delta",
      detail: `Δ ${o.delta.toFixed(2)} — thin stock-like exposure. Consider rolling to a higher-delta strike.`,
    };
  }
  if (pnlPct >= 0.5) {
    return {
      level: "watch",
      label: "Up big",
      detail: `${fmtPct(pnlPct)} — consider trimming or rolling up to lock gains.`,
    };
  }
  return { level: "hold", label: "Hold", detail: `${dte} DTE, Δ ${o.delta.toFixed(2)}. On track.` };
}

// Days-to-expiry at which theta decay is steep enough that it's no longer worth
// holding a long LEAP purely to clear the 1-year long-term-gains mark.
export const THETA_FLOOR_DTE = 90;

/**
 * For a long position that would otherwise warrant a roll: should the roll be
 * held off to capture long-term capital gains? Returns `{ days, date }` (days
 * until it turns long-term + that date) when it's worth waiting — a long
 * position, not yet long-term, that can comfortably reach the 1-year mark with
 * ≥ THETA_FLOOR_DTE days of life still left. Returns null (i.e. roll now) when
 * it can't reach a year before expiry, or theta would be too steep by then.
 */
export function holdForLongTerm(o: OptionPosition): { days: number; date: string } | null {
  if (o.side !== "long" || !o.openedAt) return null;
  const date = longTermDate(o.openedAt);
  const days = daysToExpiry(date);
  if (days <= 0) return null; // already long-term — nothing to wait for
  const dteAtLongTerm = daysToExpiry(o.expiration) - days;
  if (dteAtLongTerm < THETA_FLOOR_DTE) return null; // expiry too soon / theta too steep → roll now
  return { days, date };
}

export function insightFor(o: OptionPosition): Insight {
  return o.kind === "csp" ? cspInsight(o) : leapInsight(o);
}

export function compareInsight(a: Insight, b: Insight): number {
  return LEVEL_RANK[b.level] - LEVEL_RANK[a.level];
}

export const LEVEL_STYLES: Record<InsightLevel, { dot: string; text: string; chip: string }> = {
  manage: { dot: "bg-rose-500", text: "text-rose-400", chip: "bg-rose-500/15 text-rose-300 ring-rose-500/30" },
  roll: { dot: "bg-amber-500", text: "text-amber-400", chip: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  watch: { dot: "bg-sky-500", text: "text-sky-400", chip: "bg-sky-500/15 text-sky-300 ring-sky-500/30" },
  hold: { dot: "bg-emerald-500", text: "text-emerald-400", chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
};

// ---- home action center --------------------------------------------------
export interface AlertItem {
  level: InsightLevel;
  title: string;
  body: string;
  href: string;
}

export function buildAlerts(options: OptionPosition[]): AlertItem[] {
  const alerts: AlertItem[] = [];

  for (const o of options.filter((x) => x.kind === "csp")) {
    const ins = cspInsight(o);
    if (ins.level === "manage" || ins.level === "roll") {
      // manage = assignment risk, roll = rollable (<30% credit left). Deep-link
      // to the CSP view with the matching filter pre-applied.
      const filter = ins.level === "manage" ? "atrisk" : "rollable";
      alerts.push({
        level: ins.level,
        title: `${o.symbol} $${o.strike}p — ${ins.label}`,
        body: ins.detail,
        href: `/options/csp?filter=${filter}`,
      });
    }
  }

  // expirations within 14 days
  const soon = options.filter((o) => {
    const d = daysToExpiry(o.expiration);
    return d >= 0 && d <= 14;
  });
  if (soon.length) {
    alerts.push({
      level: "watch",
      title: `${soon.length} position${soon.length > 1 ? "s" : ""} expiring ≤ 14 days`,
      body: soon.map((o) => `${o.symbol} ${o.expiration}`).join(", "),
      href: "/options",
    });
  }

  for (const o of options.filter((x) => x.kind === "leap-call")) {
    const ins = leapInsight(o);
    // Surface roll-up actions and the tax-aware "hold to long-term, then roll" case.
    // leapInsight already defers the roll-up to long-term when it's worth waiting.
    if (ins.level === "manage" || ins.label === "Hold for long-term") {
      alerts.push({ level: ins.level, title: `${o.symbol} LEAP — ${ins.label}`, body: ins.detail, href: "/options" });
    }
  }

  return alerts.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
}
