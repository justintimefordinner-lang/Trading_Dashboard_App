// The Quant scan's variables, chosen on the /quant page. The study's values are
// the defaults; anything the user changes is written to data/quant-settings.json.
// Two kinds of setting live here:
//   * the pick rule (yield target, delta cap, expiry, close-at) — the bridge's
//     quant_scan.py reads it at the start of every scan; the trader always uses
//     the study's pick, which the scan writes beside it;
//   * sizing (per-name cap, stretch, VIX margin, VIX cash reserve, extra margin
//     per account) — this page, the portfolio check and the trader all follow it.
// Delete the file (Reset) and the study's values are back. Server-only.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/data-dirs";

export const QUANT_SETTINGS_PATH = path.join(DATA_DIR, "quant-settings.json");

export interface QuantParams {
  targetYield: number; // of the strike, per yieldDays (0.04 = 4%)
  yieldDays: number;
  maxDelta: number;
  expMin: number; // days to expiry, inclusive
  expMax: number;
  expTarget: number; // use the expiration closest to this many days; 0 = best put across the window
  maxSpread: number; // skip quotes whose (ask − bid) / mid is above this (0.5 = 50%); backtested neutral at 50%, tighter costs return
  closeAtPct: number; // close a put once this % of the credit is captured
  maxPerTicker: number; // of buying power (0.10 = 10%)
  tickerBand: number; // stretch allowed for one more contract (0.05 = 5%)
  vixMargin: boolean; // size against the VIX-scaled margin allowance (0 under 20, 5% per 5 points, cap 35%)
  vixCash: boolean; // hold back the VIX framework's cash reserve (the band on the VIX page) from deployable cash
  // Extra margin per account, in dollars, added to that account's base (buying
  // power and free cash). For long-term holdings the user won't sell: margin
  // against them keeps the wheel's capital from sitting idle. Keyed by account id.
  extraMargin: Record<string, number>;
}

/** Combo 87 v2 with 0.75Δ LEAPS: the backtest's best. */
export const STUDY_DEFAULTS: QuantParams = {
  targetYield: 0.04,
  yieldDays: 30,
  maxDelta: 0.35,
  expMin: 28,
  expMax: 42,
  expTarget: 35, // the backtest used the expiration closest to 35 days (±7)
  maxSpread: 0.5,
  closeAtPct: 50,
  maxPerTicker: 0.1,
  tickerBand: 0.05,
  vixMargin: true,
  vixCash: false, // the study ran with VIX sizing off: fully deployed whatever the VIX
  extraMargin: {},
};

/** The rule's own variables (not sizing): what makes a scan "custom". */
export const RULE_KEYS = ["targetYield", "yieldDays", "maxDelta", "expMin", "expMax", "expTarget", "maxSpread", "closeAtPct"] as const;

/** Extra margin set for one account, in dollars (0 when none). */
export function extraMarginFor(params: QuantParams, accountId: string | null | undefined): number {
  return (accountId && params.extraMargin?.[accountId]) || 0;
}

type NumericKey = Exclude<keyof QuantParams, "vixMargin" | "vixCash" | "extraMargin">;

// Sane ranges, so a typo can't ask the bridge for 400% a month or a 900-day put.
const RANGES: Record<NumericKey, [number, number]> = {
  targetYield: [0.005, 0.2],
  yieldDays: [7, 90],
  maxDelta: [0.05, 0.6],
  expMin: [1, 180],
  expMax: [1, 180],
  expTarget: [0, 180],
  maxSpread: [0.05, 9.99],
  closeAtPct: [10, 95],
  maxPerTicker: [0.01, 0.5],
  tickerBand: [0, 0.25],
};

export function validateQuantParams(raw: Partial<Record<keyof QuantParams, unknown>>): { params?: QuantParams; error?: string } {
  const out: QuantParams = { ...STUDY_DEFAULTS, extraMargin: {} };
  for (const key of Object.keys(RANGES) as NumericKey[]) {
    const v = raw[key];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    const [lo, hi] = RANGES[key];
    if (!Number.isFinite(n) || n < lo || n > hi) return { error: `${key} must be between ${lo} and ${hi}.` };
    out[key] = key === "yieldDays" || key === "expMin" || key === "expMax" || key === "expTarget" || key === "closeAtPct" ? Math.round(n) : n;
  }
  const flag = (v: unknown) => v === true || v === "true" || v === 1;
  if (raw.vixMargin !== undefined && raw.vixMargin !== null) out.vixMargin = flag(raw.vixMargin);
  if (raw.vixCash !== undefined && raw.vixCash !== null) out.vixCash = flag(raw.vixCash);
  if (raw.extraMargin && typeof raw.extraMargin === "object") {
    for (const [acct, v] of Object.entries(raw.extraMargin as Record<string, unknown>)) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return { error: "Extra margin must be a dollar amount of 0 or more." };
      if (n > 0) out.extraMargin[acct] = Math.round(n);
    }
  }
  if (out.expMin > out.expMax) return { error: "The shortest expiry can't be after the longest." };
  if (out.expTarget && (out.expTarget < out.expMin || out.expTarget > out.expMax)) return { error: "The target expiry must sit inside the expiry window (or be 0)." };
  return { params: out };
}

export function readQuantSettings(): { params: QuantParams; custom: boolean } {
  try {
    const parsed = JSON.parse(fs.readFileSync(QUANT_SETTINGS_PATH, "utf8")) as Partial<QuantParams>;
    const { params } = validateQuantParams(parsed);
    // "Custom" means the pick rule or the sizing differs from the study; extra
    // margin is the account's own business and doesn't count.
    if (params) {
      const withoutMargin = (p: QuantParams) => JSON.stringify({ ...p, extraMargin: undefined });
      return { params, custom: withoutMargin(params) !== withoutMargin(STUDY_DEFAULTS) };
    }
  } catch {
    /* absent or malformed: the study's rule */
  }
  return { params: STUDY_DEFAULTS, custom: false };
}

export function writeQuantSettings(params: QuantParams): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${QUANT_SETTINGS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...params, updatedAt: new Date().toISOString() }, null, 2));
  fs.renameSync(tmp, QUANT_SETTINGS_PATH);
}

/** Back to the study's values. Extra margin per account is kept: it describes the
 *  account (holdings the user won't sell), not the rule. */
export function resetQuantSettings(): void {
  const keep = readQuantSettings().params.extraMargin;
  if (Object.keys(keep).length > 0) {
    writeQuantSettings({ ...STUDY_DEFAULTS, extraMargin: keep });
    return;
  }
  try {
    fs.unlinkSync(QUANT_SETTINGS_PATH);
  } catch {
    /* already the defaults */
  }
}
