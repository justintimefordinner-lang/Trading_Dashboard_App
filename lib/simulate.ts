// After-hours "Simulate" engine.
//
// Once the regular session closes, Schwab stops re-pricing options — the mark, delta,
// gamma, and vega freeze at the 4:00 print — but the underlying keeps trading in extended
// hours. This re-prices each option from the underlying's move since the close using the
// second-order Taylor expansion of value in the underlying price, plus an optional
// volatility term:
//
//     ΔV ≈ Δ·ΔS + ½·Γ·ΔS²  +  Vega·ΔIV        (per share, holding time constant)
//
// where ΔS = live underlying − regular-session close. IV isn't observable after hours
// (options don't trade), so ΔIV is *assumed*: an auto-skew estimate derived from the move
// itself — a down move raises IV, an up move crushes it — scaled by a user-set strength
// (`ivSkew`, vol points per 1% move). ivSkew = 0 drops the vol term, recovering the pure
// Δ/Γ estimate. The projected mark, underlying price, and (drifted) delta are written back
// onto a *clone*, so every existing calc recomputes for free. During regular hours ΔS ≈ 0,
// so the whole transform is a no-op.
import type { OptionPosition } from "./types";
import { daysToExpiry } from "./calc";

/** Simulate scenario knobs. `ivSkew` = assumed IV change in VOL POINTS per 1% underlying
 *  move, at the reference tenor (~1 month), before the per-leg tenor taper. 0 = spot-only. */
export interface SimOpts {
  ivSkew?: number;
}

// Tenor at which `ivSkew` is taken as-is. Longer-dated legs taper below it (see autoIvShift).
const REF_DAYS = 30;

export function underlyingMove(o: OptionPosition): number | null {
  if (o.underlyingClose == null || o.underlyingLive == null) return null;
  return o.underlyingLive - o.underlyingClose;
}

/** Auto-skew ΔIV for one leg, in vol points. Derived from the leg's own % move and the
 *  shared skew strength, then tapered by tenor: implied-vol reactivity to spot falls
 *  roughly like 1/√T, so a weekly's IV whips around while a LEAP's barely flinches on a
 *  daily wiggle. The knob is calibrated at ~REF_DAYS; legs dated longer get √(REF_DAYS/DTE)
 *  of it (never more than the knob), so one setting keeps both short puts and LEAPs sane.
 *  A down move (negative return) yields a positive IV shift. */
export function autoIvShift(o: OptionPosition, ds: number, ivSkew: number): number {
  const s = o.underlyingClose ?? 0;
  if (!ivSkew || s <= 0) return 0;
  const dte = Math.max(daysToExpiry(o.expiration), 1);
  const tenorScale = Math.sqrt(REF_DAYS / Math.max(dte, REF_DAYS));
  const retPct = (ds / s) * 100; // e.g. -2 for a -2% move
  return -ivSkew * tenorScale * retPct; // vol points; down move → +IV
}

/** Clone the position re-priced to the current underlying (and, if ivSkew > 0, the
 *  auto-skewed IV). Passthrough (unchanged) when we have no close/live reference or the
 *  underlying hasn't moved.
 *
 *  `opts` is typed to also accept a number so the function can be handed straight to
 *  Array.map — which injects the element index as the 2nd argument — without a type error.
 *  A numeric (or missing) opts just means "no IV scenario": spot-only Δ/Γ. */
export function simulatePosition(o: OptionPosition, opts?: SimOpts | number): OptionPosition {
  const ds = underlyingMove(o);
  if (ds == null || ds === 0) return o;
  const g = o.gamma ?? 0;
  let projMark = o.mark + o.delta * ds + 0.5 * g * ds * ds; // spot terms (Δ, Γ)

  // Vol term: Vega · ΔIV, with ΔIV auto-estimated from the move. Vega is exported per
  // vol-point (Schwab convention), matching autoIvShift's vol-point units.
  const ivSkew = opts && typeof opts === "object" ? (opts.ivSkew ?? 0) : 0;
  const dIv = autoIvShift(o, ds, ivSkew);
  if (dIv !== 0 && o.vega) projMark += o.vega * dIv;

  projMark = Math.max(0, projMark);
  const projDelta = o.delta + g * ds;
  return { ...o, mark: projMark, delta: projDelta, underlyingPrice: o.underlyingLive ?? o.underlyingPrice };
}

/** True when at least one position has a real (non-trivial) after-hours move to project
 *  — used to decide whether the Simulate toggle has anything to show. */
export function hasSimulatableMove(positions: OptionPosition[], eps = 0.005): boolean {
  return positions.some((o) => {
    const m = underlyingMove(o);
    return m != null && Math.abs(m) >= eps;
  });
}
