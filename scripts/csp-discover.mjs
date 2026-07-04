// CSP discovery scanner — finds premium-rich, CSP-friendly names by computing the
// "starter signals" (RSI(14), SMA50/200, support) plus historical volatility (a
// premium-richness proxy) from Yahoo daily candles. No auth needed.
//
// Usage:
//   node scripts/csp-discover.mjs                 → built-in shortlist
//   node scripts/csp-discover.mjs sp500           → full S&P 500 (scripts/sp500.json)
//   node scripts/csp-discover.mjs AMD MU FSLR ...  → explicit tickers
//
// Output: qualifiers ranked by HV (richest premium first). Feed the top names to
// the Robinhood MCP option screen and write data/csp-candidates.json. See REFRESH.md.
//
// This is the BROAD scanner (fast, no MCP). Per-candidate technicals for the app
// are recomputed from the connector via get_equity_historicals → compute-technicals.mjs.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { computeTechnicals } from "../lib/indicators.mjs";

const __dir = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_UNIVERSE = ["AMD", "MU", "FSLR", "ON", "CRWD", "UBER", "MRNA", "DELL"];

// CSP-entry gates: quality uptrend + a pullback that isn't a freefall.
const GATES = {
  rsiMin: 30, // not in freefall
  rsiMax: 60, // pulled back / neutral, not overbought
  requireAboveSma200: true, // uptrend structure intact (don't sell puts in downtrends)
  maxPctAboveSma50: 15,
  minPctAboveSma50: -8,
};

const TOP = 40; // cap qualifier output

async function fetchCandles(symbol) {
  const ySym = symbol.replace(/_/g, "-");
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=1d&range=1y`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error("no data");
  const q = r.indicators.quote[0];
  const closes = [];
  const lows = [];
  for (let i = 0; i < (r.timestamp || []).length; i++) {
    if (q.close?.[i] != null) {
      closes.push(q.close[i]);
      lows.push(q.low?.[i] ?? q.close[i]);
    }
  }
  return { closes, lows };
}

const round = (n) => (n == null ? null : Math.round(n * 100) / 100);

async function analyze(symbol) {
  const { closes, lows } = await fetchCandles(symbol);
  const t = computeTechnicals({ closes, lows });
  const pass =
    t.rsi != null && t.rsi >= GATES.rsiMin && t.rsi <= GATES.rsiMax &&
    (!GATES.requireAboveSma200 || t.aboveSma200 === true) &&
    t.pctFromSma50 != null && t.pctFromSma50 <= GATES.maxPctAboveSma50 && t.pctFromSma50 >= GATES.minPctAboveSma50;
  return {
    symbol,
    price: t.price,
    hvPct: round((t.hv ?? 0) * 100),
    rsi: t.rsi,
    pctFromSma50: t.pctFromSma50,
    aboveSma200: t.aboveSma200,
    support20: t.support20,
    pass,
  };
}

// run with bounded concurrency
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          out[idx] = await fn(items[idx]);
        } catch (e) {
          out[idx] = { symbol: items[idx], error: String(e.message || e) };
        }
      }
    }),
  );
  return out;
}

const arg = process.argv.slice(2);
let universe = DEFAULT_UNIVERSE;
if (arg[0] === "sp500") universe = JSON.parse(fs.readFileSync(path.join(__dir, "sp500.json"), "utf8"));
else if (arg.length) universe = arg;

const results = await mapLimit(universe, 8, analyze);
const ok = results.filter((r) => r && !r.error);
const qualified = ok.filter((r) => r.pass).sort((a, b) => (b.hvPct ?? 0) - (a.hvPct ?? 0));
const errors = results.filter((r) => r && r.error).length;

console.log(
  JSON.stringify(
    {
      gates: GATES,
      scanned: universe.length,
      ok: ok.length,
      errors,
      qualifiedCount: qualified.length,
      // richest-premium first
      qualified: qualified.slice(0, TOP),
    },
    null,
    2,
  ),
);
