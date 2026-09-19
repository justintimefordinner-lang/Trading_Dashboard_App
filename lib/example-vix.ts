// Example-mode VIX/volatility snapshot. Feeds the VIX tab and the home
// "Volatility & Positioning" card when there's no bridge writing data/vix.json —
// a public demo deployment, most of all.
//
// Every level is a real reading from one close (lib/example-market.ts), so the
// posture the app derives from them — regime band, cash target, VRP, the breadth
// read — is a genuine example of the framework at work, not an invented one.
// asof is stamped at load so the demo reads as current.
import { EXAMPLE_MARKET as M } from "./example-market";
import type { VixSnapshot } from "./vix";

export const exampleVix: VixSnapshot = {
  asof: new Date().toISOString(),
  source: "example",
  inputs: {
    vix: M.vix,
    vix9d: M.vix9d,
    vix3m: M.vix3m,
    vvix: M.vvix,
    skew: M.skew,
    realizedVol20: M.realizedVol20,
    realizedVol30: M.realizedVol30,
    realizedVolBasis: "SPY 20/30-day close-to-close",
    // Share of S&P 500 names above their own 50-day SMA, with the recent weekly closes.
    s5fi: M.s5fi,
    s5fiSlopeWk: M.s5fiSlopeWk,
    s5fiWeekly: M.s5fiWeekly,
    // Nasdaq-100 Volatility Index, for the VIX/VXN divergence read in lib/vxn.ts.
    vxn: M.vxn,
  },
};
