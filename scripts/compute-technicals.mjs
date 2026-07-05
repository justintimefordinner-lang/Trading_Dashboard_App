// Computes CSP technical signals from get_equity_historicals output.
//
// The data bridge is the canonical source for technicals. the data bridge pulls
// `get_equity_historicals` (interval=day, ≥50 trading days), saves the closes
// (and optional lows) per symbol to a JSON file in this shape:
//
//   [ { "symbol": "AAPL", "strike": 275, "closes": [..], "lows": [..] }, ... ]
//
// then runs:  node scripts/compute-technicals.mjs <path>
//
// Output: technicals per symbol, ready to drop into data/csp-candidates.json
// (technical = { aboveSma50, rsi, strikeBelowSupport }).
import fs from "node:fs";
import { computeTechnicals } from "../lib/indicators.mjs";

const path = process.argv[2] || "data/_hist.json";
const input = JSON.parse(fs.readFileSync(path, "utf8"));

const out = input.map((s) => {
  const t = computeTechnicals(s);
  return {
    symbol: s.symbol,
    strike: s.strike ?? null,
    technical: { aboveSma50: t.aboveSma50, rsi: t.rsi, strikeBelowSupport: t.strikeBelowSupport },
    context: { price: t.price, sma50: t.sma50, sma200: t.sma200, aboveSma200: t.aboveSma200, support20: t.support20, bars: s.closes.length },
  };
});

console.log(JSON.stringify(out, null, 2));
