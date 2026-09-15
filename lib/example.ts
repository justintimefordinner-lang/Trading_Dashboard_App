// A complete, self-consistent EXAMPLE portfolio used by "Example" mode so the
// app can be demoed to others without exposing real values. Every view is
// exercised: all option kinds (with full greeks + underlying live/close so
// Simulate and Top Movers work), equities enriched with covered-call ladders,
// gamma walls, Bollinger σ and 7-day price history, crypto, a value history,
// two accounts (so the account switcher shows), and closed round-trips in each
// bucket spread across recent months. Tickers are drawn from the approved
// universe so the CSP board / research / holdings-overlap flags look authentic.
// Numbers are invented but internally consistent (the summary adds up).
import type {
  Snapshot,
  ClosedCSPFile,
  ClosedLeapFile,
  ClosedCoveredFile,
  ClosedSpreadFile,
  ClosedStockFile,
  SectorEntry,
  SectorsFile,
} from "./types";
import { buildChartData, type ChartData } from "./chart-indicators";

const ACC = "EX000000"; // primary margin account
const IRA = "EX000001"; // second account, to exercise the account switcher

// Dates are derived from today rather than written down, so the demo always reads
// as a snapshot of right now: expirations stay in the future, days-to-expiry and
// annualized yields stay sensible, and the closed trades stay recent. Hardcoding
// them means the whole dataset silently rots the moment the calendar passes it.
const DAY_MS = 86_400_000;
const isoDay = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
const NOW_ISO = new Date().toISOString();

export const exampleSnapshot: Snapshot = {
  meta: {
    generatedAt: NOW_ISO,
    pricesAsOf: `${isoDay(0)} close`,
    source: "example",
    coveredCallsNextAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  },
  accounts: [
    { id: ACC, mask: "••••0000", type: "margin", brokerageType: "individual", nickname: "Individual", isDefault: true },
    { id: IRA, mask: "••••0001", type: "cash", brokerageType: "individual", nickname: "Roth IRA", isDefault: false },
  ],
  data: {
    [ACC]: {
      // equityValue tracks the holdings below (qty x price), and the four buckets sum
      // to totalValue so the allocation donut reconciles.
      //
      // totalValue is set so free cash lands at 18% of the account: the app derives
      // that slice as total minus everything deployed (equities, LEAP/hedge value, CSP
      // collateral, spread risk, crypto), which here comes to ~539k. The cash line
      // itself also covers the ~288k of collateral those thirteen puts secure — a
      // cash-secured book that showed less cash than collateral would misrepresent it.
      summary: {
        totalValue: 657160,
        equityValue: 212040,
        optionsValue: 14020,
        cryptoValue: 25010,
        cash: 406090,
        buyingPower: 360000,
        optionsBuyingPower: 480000,
      },
      // Prices are a real market reading, so the demo shows plausible levels rather
      // than invented ones. Cost bases are chosen to give a mix of winners and
      // losers — SOFI and IREN sit underwater, which the P&L and Stocks pages should
      // both be able to show.
      equities: [
        // ≥100 sh carry covered-call ladders whose strikes sit ABOVE cost basis, so
        // the Stocks "write a call" green flag lights up for the ones with no CC
        // written yet. AAPL has one open (see options), so it shows a CC count instead.
        {
          symbol: "AAPL", name: "Apple", qty: 200, avgCost: 240, price: 309.35, dayChange: -1.95, bbSigma: 0.4,
          priceHistory: [303.2, 306.8, 305.4, 309.9, 312.6, 311.3, 309.35],
          gamma: { flip: 310, callWall: 330, putWall: 295, net: "pos" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 320, delta: 0.31, mark: 4.10, premPct: 1.33, annPct: 35, oi: 30100, bbSigma: 1.2 },
            { targetDte: 21, dte: 21, strike: 325, delta: 0.27, mark: 5.05, premPct: 1.63, annPct: 28, oi: 22400, bbSigma: 1.6 },
            { targetDte: 30, dte: 30, strike: 330, delta: 0.24, mark: 6.20, premPct: 2.00, annPct: 24, oi: 41800, bbSigma: 2.0 },
          ],
        },
        {
          // Underwater against a 25 basis — the ladder's strikes still clear cost, so
          // a call written here would exit at a gain even though the position is red.
          symbol: "SOFI", name: "SoFi Technologies", qty: 500, avgCost: 25, price: 18.91, dayChange: 0.99, bbSigma: -0.8,
          priceHistory: [17.4, 17.9, 17.6, 18.2, 18.5, 17.92, 18.91],
          gamma: { flip: 19, callWall: 22, putWall: 17, net: "pos" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 26, delta: 0.14, mark: 0.18, premPct: 0.95, annPct: 25, oi: 41200, bbSigma: 2.3 },
            { targetDte: 21, dte: 21, strike: 27, delta: 0.12, mark: 0.24, premPct: 1.27, annPct: 22, oi: 55800, bbSigma: 2.7 },
            { targetDte: 30, dte: 30, strike: 28, delta: 0.11, mark: 0.31, premPct: 1.64, annPct: 20, oi: 55800, bbSigma: 3.0 },
          ],
        },
        {
          symbol: "GLW", name: "Corning", qty: 200, avgCost: 118, price: 149.84, dayChange: -1.61, bbSigma: 0.6,
          priceHistory: [144.8, 147.2, 146.1, 149.9, 152.4, 151.45, 149.84],
          gamma: { flip: 150, callWall: 165, putWall: 140, net: "pos" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 155, delta: 0.32, mark: 3.30, premPct: 2.20, annPct: 57, oi: 8400, bbSigma: 1.1 },
            { targetDte: 21, dte: 21, strike: 160, delta: 0.27, mark: 4.05, premPct: 2.70, annPct: 47, oi: 5100, bbSigma: 1.6 },
            { targetDte: 30, dte: 30, strike: 165, delta: 0.23, mark: 4.80, premPct: 3.20, annPct: 39, oi: 6700, bbSigma: 2.1 },
          ],
        },
        {
          // Also underwater — the ladder's strikes above basis are the ones that
          // matter here, which exercises the "above avg cost" styling.
          symbol: "IREN", name: "IREN", qty: 400, avgCost: 48, price: 41.88, dayChange: -0.72, bbSigma: -0.9,
          priceHistory: [40.1, 41.6, 40.9, 42.8, 43.4, 42.60, 41.88],
          gamma: { flip: 42, callWall: 48, putWall: 38, net: "neg" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 50, delta: 0.24, mark: 1.10, premPct: 2.63, annPct: 69, oi: 14200, bbSigma: 1.6 },
            { targetDte: 21, dte: 21, strike: 52.5, delta: 0.20, mark: 1.35, premPct: 3.22, annPct: 56, oi: 9800, bbSigma: 2.0 },
            { targetDte: 30, dte: 30, strike: 55, delta: 0.17, mark: 1.60, premPct: 3.82, annPct: 46, oi: 7300, bbSigma: 2.4 },
          ],
        },
        {
          symbol: "PLTR", name: "Palantir", qty: 200, avgCost: 150, price: 179.94, dayChange: 5.98, bbSigma: 1.4,
          priceHistory: [168.2, 172.6, 170.8, 175.4, 177.9, 173.96, 179.94],
          gamma: { flip: 180, callWall: 200, putWall: 165, net: "pos" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 190, delta: 0.30, mark: 4.35, premPct: 2.42, annPct: 63, oi: 22100, bbSigma: 1.5 },
            { targetDte: 21, dte: 21, strike: 195, delta: 0.27, mark: 5.25, premPct: 2.92, annPct: 51, oi: 31400, bbSigma: 1.9 },
            { targetDte: 30, dte: 30, strike: 200, delta: 0.24, mark: 6.40, premPct: 3.56, annPct: 43, oi: 18900, bbSigma: 2.2 },
          ],
        },
        // < 100 sh: no covered-call ladder (exercises the "can't write a call" path).
        { symbol: "MU", name: "Micron Technology", qty: 60, avgCost: 780, price: 966.78, dayChange: -7.55, bbSigma: 0.8, priceHistory: [938.4, 951.2, 946.8, 962.5, 978.1, 974.33, 966.78] },
      ],
      crypto: [
        { symbol: "BTC", name: "Bitcoin", qty: 0.25, avgCost: 52000, price: 77270 },
        { symbol: "ETH", name: "Ethereum", qty: 2, avgCost: 2100, price: 2846 },
      ],
      // One of every OptionKind. underlyingLive ≠ underlyingClose so Simulate is
      // enabled; dayValueChange + underlyingChange feed Top Movers; shorts carry
      // chanceOfProfitShort; CSPs carry erDate so the -ER flag shows.
      // The CSPs are written so all three insight buckets have something in them —
      // the At risk / Rollable / Hold filter chips are a big part of this screen:
      //   SOFI, IREN — most premium harvested, remaining yield annualizes under 25% → "Rollable"
      //   MU         — through the strike on delta                                 → "Assignment risk"
      //   CDE, INTC, GLW, CLS, TSM — premium still working, well OTM               → "Hold"
      options: [
        { id: "ex-o1", kind: "csp", symbol: "SOFI", optionType: "put", side: "short", qty: 1, strike: 17, expiration: isoDay(20), entryPerShare: 0.74, mark: 0.15, delta: -0.12, gamma: 0.08, vega: 0.03, theta: 0.015, iv: 0.58, breakeven: 16.26, underlyingPrice: 18.91, underlyingChange: 0.99, underlyingClose: 17.92, underlyingLive: 18.91, dayValueChange: 11.0, bbSigma: -1.4, chanceOfProfitShort: 0.88, openedAt: isoDay(-38), erDate: isoDay(46) },
        { id: "ex-o2", kind: "csp", symbol: "MU", optionType: "put", side: "short", qty: 1, strike: 990, expiration: isoDay(27), entryPerShare: 26.50, mark: 41.80, delta: -0.56, gamma: 0.002, vega: 1.35, theta: 1.10, iv: 0.62, breakeven: 963.50, underlyingPrice: 966.78, underlyingChange: -7.55, underlyingClose: 974.33, underlyingLive: 966.78, dayValueChange: -120.0, bbSigma: -0.9, chanceOfProfitShort: 0.44, openedAt: isoDay(-43), erDate: isoDay(12) },
        { id: "ex-o3", kind: "csp", symbol: "CDE", optionType: "put", side: "short", qty: 1, strike: 19, expiration: isoDay(34), entryPerShare: 0.78, mark: 0.55, delta: -0.22, gamma: 0.05, vega: 0.04, theta: 0.011, iv: 0.61, breakeven: 18.22, underlyingPrice: 20.97, underlyingChange: -0.14, underlyingClose: 21.11, underlyingLive: 20.97, dayValueChange: 8.0, bbSigma: -0.5, chanceOfProfitShort: 0.78, openedAt: isoDay(-32), erDate: null },
        { id: "ex-o11", kind: "csp", symbol: "IREN", optionType: "put", side: "short", qty: 1, strike: 38, expiration: isoDay(13), entryPerShare: 1.42, mark: 0.20, delta: -0.09, gamma: 0.02, vega: 0.05, theta: 0.02, iv: 0.74, breakeven: 36.58, underlyingPrice: 41.88, underlyingChange: -0.72, underlyingClose: 42.60, underlyingLive: 41.88, dayValueChange: 14.0, bbSigma: -1.7, chanceOfProfitShort: 0.91, openedAt: isoDay(-29), erDate: null },
        { id: "ex-o12", kind: "csp", symbol: "INTC", optionType: "put", side: "short", qty: 1, strike: 85, expiration: isoDay(27), entryPerShare: 2.65, mark: 1.90, delta: -0.28, gamma: 0.01, vega: 0.19, theta: 0.06, iv: 0.51, breakeven: 82.35, underlyingPrice: 90.07, underlyingChange: -2.06, underlyingClose: 92.13, underlyingLive: 90.07, dayValueChange: -32.0, bbSigma: -0.7, chanceOfProfitShort: 0.72, openedAt: isoDay(-19), erDate: isoDay(31) },
        { id: "ex-o13", kind: "csp", symbol: "GLW", optionType: "put", side: "short", qty: 1, strike: 140, expiration: isoDay(41), entryPerShare: 5.80, mark: 4.50, delta: -0.25, gamma: 0.006, vega: 0.34, theta: 0.09, iv: 0.36, breakeven: 134.20, underlyingPrice: 149.84, underlyingChange: -1.61, underlyingClose: 151.45, underlyingLive: 149.84, dayValueChange: -22.0, bbSigma: -0.6, chanceOfProfitShort: 0.75, openedAt: isoDay(-12), erDate: null },
        { id: "ex-o14", kind: "csp", symbol: "CLS", optionType: "put", side: "short", qty: 1, strike: 270, expiration: isoDay(34), entryPerShare: 10.90, mark: 8.50, delta: -0.27, gamma: 0.004, vega: 0.58, theta: 0.21, iv: 0.57, breakeven: 259.10, underlyingPrice: 296.55, underlyingChange: -5.45, underlyingClose: 302.00, underlyingLive: 296.55, dayValueChange: -95.0, bbSigma: -0.5, chanceOfProfitShort: 0.73, openedAt: isoDay(-24), erDate: null },
        // A second cohort of CSPs on larger-cap names, so the screen shows the range
        // of strike sizes a real book carries rather than only small-dollar tickers.
        { id: "ex-o15", kind: "csp", symbol: "AMAT", optionType: "put", side: "short", qty: 1, strike: 460, expiration: isoDay(28), entryPerShare: 13.85, mark: 15.73, delta: -0.31, gamma: 0.004, vega: 0.62, theta: 0.44, iv: 0.38, breakeven: 446.15, underlyingPrice: 488.61, underlyingChange: -7.60, underlyingClose: 496.21, underlyingLive: 488.61, dayValueChange: -70.0, bbSigma: -0.5, chanceOfProfitShort: 0.69, openedAt: isoDay(-9), erDate: null },
        { id: "ex-o16", kind: "csp", symbol: "COHR", optionType: "put", side: "short", qty: 1, strike: 280, expiration: isoDay(21), entryPerShare: 9.03, mark: 17.80, delta: -0.42, gamma: 0.008, vega: 0.47, theta: 0.46, iv: 0.52, breakeven: 270.97, underlyingPrice: 284.61, underlyingChange: -5.42, underlyingClose: 290.03, underlyingLive: 284.61, dayValueChange: -150.0, bbSigma: -1.1, chanceOfProfitShort: 0.58, openedAt: isoDay(-14), erDate: null },
        { id: "ex-o17", kind: "csp", symbol: "LRCX", optionType: "put", side: "short", qty: 1, strike: 295, expiration: isoDay(21), entryPerShare: 9.85, mark: 10.85, delta: -0.33, gamma: 0.006, vega: 0.51, theta: 0.38, iv: 0.41, breakeven: 285.15, underlyingPrice: 310.34, underlyingChange: -0.19, underlyingClose: 310.53, underlyingLive: 310.34, dayValueChange: 25.0, bbSigma: -0.3, chanceOfProfitShort: 0.67, openedAt: isoDay(-11), erDate: null },
        { id: "ex-o18", kind: "csp", symbol: "CRDO", optionType: "put", side: "short", qty: 1, strike: 210, expiration: isoDay(14), entryPerShare: 7.20, mark: 11.00, delta: -0.30, gamma: 0.007, vega: 0.33, theta: 1.26, iv: 0.68, breakeven: 202.80, underlyingPrice: 229.79, underlyingChange: -1.56, underlyingClose: 231.35, underlyingLive: 229.79, dayValueChange: -40.0, bbSigma: -0.7, chanceOfProfitShort: 0.70, openedAt: isoDay(-7), erDate: null },
        // Through its strike — lands in the Assignment-risk bucket.
        { id: "ex-o19", kind: "csp", symbol: "CCL", optionType: "put", side: "short", qty: 1, strike: 26, expiration: isoDay(28), entryPerShare: 0.54, mark: 1.31, delta: -0.53, gamma: 0.09, vega: 0.03, theta: 0.02, iv: 0.44, breakeven: 25.46, underlyingPrice: 25.60, underlyingChange: 0.23, underlyingClose: 25.37, underlyingLive: 25.60, dayValueChange: 15.0, bbSigma: -1.5, chanceOfProfitShort: 0.47, openedAt: isoDay(-16), erDate: null },
        // Most of the premium already harvested — remaining yield annualizes ~22%, so
        // this one reads as Rollable.
        { id: "ex-o20", kind: "csp", symbol: "DRAM", optionType: "put", side: "short", qty: 1, strike: 48, expiration: isoDay(28), entryPerShare: 1.51, mark: 0.82, delta: -0.13, gamma: 0.02, vega: 0.07, theta: 0.04, iv: 0.56, breakeven: 46.49, underlyingPrice: 58.16, underlyingChange: 0.58, underlyingClose: 57.58, underlyingLive: 58.16, dayValueChange: 19.5, bbSigma: -1.3, chanceOfProfitShort: 0.87, openedAt: isoDay(-22), erDate: null },
        // Five contracts against the 500 SOFI shares — fully covered. The strike sits
        // below the 25 cost basis, so the Stocks page will show it as a call written
        // under water rather than one that exits at a gain.
        { id: "ex-o21", kind: "covered-call", symbol: "SOFI", optionType: "call", side: "short", qty: 5, strike: 21, expiration: isoDay(20), entryPerShare: 0.62, mark: 0.41, delta: 0.28, gamma: 0.06, vega: 0.02, theta: 0.012, iv: 0.55, breakeven: 21.62, underlyingPrice: 18.91, underlyingChange: 0.99, underlyingClose: 17.92, underlyingLive: 18.91, dayValueChange: -38.0, bbSigma: 1.9, chanceOfProfitShort: 0.72, openedAt: isoDay(-13) },
        { id: "ex-o4", kind: "leap-call", symbol: "NVDA", optionType: "call", side: "long", qty: 2, strike: 180, expiration: isoDay(146), entryPerShare: 34.50, mark: 48.20, delta: 0.71, gamma: 0.004, vega: 0.82, theta: -0.09, iv: 0.47, breakeven: 214.50, underlyingPrice: 214.72, underlyingChange: -2.13, underlyingClose: 216.85, underlyingLive: 214.72, dayValueChange: -152.0, bbSigma: 0.7, openedAt: isoDay(-194) },
        { id: "ex-o5", kind: "leap-put-hedge", symbol: "SMH", optionType: "put", side: "long", qty: 1, strike: 520, expiration: isoDay(209), entryPerShare: 31.00, mark: 24.60, delta: -0.31, gamma: 0.002, vega: 1.42, theta: -0.11, iv: 0.29, breakeven: 489.00, underlyingPrice: 560.42, underlyingChange: -2.23, underlyingClose: 562.65, underlyingLive: 560.42, dayValueChange: 68.0, bbSigma: 0.9, openedAt: isoDay(-143) },
        { id: "ex-o6", kind: "covered-call", symbol: "AAPL", optionType: "call", side: "short", qty: 2, strike: 320, expiration: isoDay(20), entryPerShare: 6.10, mark: 4.35, delta: 0.32, gamma: 0.008, vega: 0.41, theta: 0.12, iv: 0.26, breakeven: 326.10, underlyingPrice: 309.35, underlyingChange: -1.95, underlyingClose: 311.30, underlyingLive: 309.35, dayValueChange: 62.0, bbSigma: 1.5, chanceOfProfitShort: 0.68, openedAt: isoDay(-35) },
        { id: "ex-o7", kind: "put-spread", symbol: "GOOGL", optionType: "put", side: "short", qty: 1, strike: 330, expiration: isoDay(34), entryPerShare: 11.40, mark: 8.05, delta: -0.31, gamma: 0.005, vega: 0.62, theta: 0.17, iv: 0.31, breakeven: 318.60, underlyingPrice: 344.82, underlyingChange: 4.15, underlyingClose: 340.67, underlyingLive: 344.82, dayValueChange: 55.0, bbSigma: 0.4, chanceOfProfitShort: 0.69, openedAt: isoDay(-39) },
        { id: "ex-o8", kind: "put-spread", symbol: "GOOGL", optionType: "put", side: "long", qty: 1, strike: 320, expiration: isoDay(34), entryPerShare: 7.20, mark: 4.90, delta: -0.19, gamma: 0.004, vega: 0.48, theta: -0.11, iv: 0.33, breakeven: 312.80, underlyingPrice: 344.82, underlyingChange: 4.15, underlyingClose: 340.67, underlyingLive: 344.82, dayValueChange: -34.0, bbSigma: 0.1, openedAt: isoDay(-39) },
        { id: "ex-o9", kind: "call-spread", symbol: "NVDA", optionType: "call", side: "short", qty: 2, strike: 230, expiration: isoDay(34), entryPerShare: 8.40, mark: 6.90, delta: 0.38, gamma: 0.006, vega: 0.55, theta: 0.14, iv: 0.45, breakeven: 238.40, underlyingPrice: 214.72, underlyingChange: -2.13, underlyingClose: 216.85, underlyingLive: 214.72, dayValueChange: 96.0, bbSigma: 0.7, chanceOfProfitShort: 0.62, openedAt: isoDay(-51) },
        { id: "ex-o10", kind: "call-spread", symbol: "NVDA", optionType: "call", side: "long", qty: 2, strike: 240, expiration: isoDay(34), entryPerShare: 5.10, mark: 4.05, delta: 0.27, gamma: 0.005, vega: 0.47, theta: -0.10, iv: 0.47, breakeven: 245.10, underlyingPrice: 214.72, underlyingChange: -2.13, underlyingClose: 216.85, underlyingLive: 214.72, dayValueChange: -64.0, bbSigma: 0.7, openedAt: isoDay(-51) },
      ],
      valueHistory: [
        { label: "Jul", value: 150000 },
        { label: "Aug", value: 158000 },
        { label: "Sep", value: 152000 },
        { label: "Oct", value: 165000 },
        { label: "Nov", value: 172000 },
        { label: "Dec", value: 169000 },
        { label: "Jan", value: 181000 },
        { label: "Feb", value: 188000 },
        { label: "Mar", value: 179000 },
        { label: "Apr", value: 186000 },
        { label: "May", value: 189000 },
        { label: "Jun", value: 191610 },
      ],
    },
    [IRA]: {
      summary: {
        totalValue: 48250,
        equityValue: 31250,
        optionsValue: 500,
        cryptoValue: 0,
        cash: 16500,
        buyingPower: 16500,
        optionsBuyingPower: 16500,
      },
      equities: [
        { symbol: "GOOGL", name: "Alphabet", qty: 100, avgCost: 258, price: 344.82, dayChange: 4.15, bbSigma: 0.4, priceHistory: [332.6, 337.4, 335.1, 341.8, 344.2, 340.67, 344.82], gamma: { flip: 345, callWall: 365, putWall: 325, net: "pos" }, coveredCalls: [ { targetDte: 21, dte: 21, strike: 365, delta: 0.28, mark: 6.10, premPct: 1.77, annPct: 31, oi: 12800, bbSigma: 1.5 } ] },
        { symbol: "AMZN", name: "Amazon", qty: 60, avgCost: 196, price: 258.63, dayChange: -1.48, bbSigma: 0.5, priceHistory: [251.2, 254.8, 253.1, 257.4, 261.0, 260.11, 258.63] },
      ],
      options: [
        { id: "ex-ira1", kind: "csp", symbol: "TSM", optionType: "put", side: "short", qty: 1, strike: 390, expiration: isoDay(27), entryPerShare: 11.80, mark: 9.50, delta: -0.26, gamma: 0.003, vega: 0.71, theta: 0.24, iv: 0.37, breakeven: 378.20, underlyingPrice: 418.95, underlyingChange: 2.95, underlyingClose: 416.00, underlyingLive: 418.95, dayValueChange: 42.0, bbSigma: -0.4, chanceOfProfitShort: 0.74, openedAt: isoDay(-36), erDate: isoDay(25) },
      ],
      valueHistory: [
        { label: "Jan", value: 41000 },
        { label: "Feb", value: 43500 },
        { label: "Mar", value: 42200 },
        { label: "Apr", value: 45100 },
        { label: "May", value: 46800 },
        { label: "Jun", value: 48250 },
      ],
    },
  },
};

const META = { generatedAt: NOW_ISO, source: "example" as const };

export const exampleCspFile: ClosedCSPFile = {
  meta: META,
  closed: [
    { id: "ex-c1", symbol: "SOFI", name: "SoFi Technologies", strike: 24, expiration: isoDay(-8), openedAt: isoDay(-53), closedAt: isoDay(-8), contracts: 2, creditPerShare: 0.95, creditReceived: 190, costToClose: 0, realizedPnl: 190, outcome: "expired", daysHeld: 45, collateral: 4800, returnOnCollateral: 0.0396, annualized: 0.354 },
    { id: "ex-c2", symbol: "MU", name: "Micron Technology", strike: 95, expiration: isoDay(-12), openedAt: isoDay(-57), closedAt: isoDay(-19), contracts: 1, creditPerShare: 3.0, creditReceived: 300, costToClose: 80, realizedPnl: 220, outcome: "closed_profit", daysHeld: 38, collateral: 9500, returnOnCollateral: 0.0232, annualized: 0.223 },
    { id: "ex-c3", symbol: "NVDA", name: "NVIDIA", strike: 95, expiration: isoDay(-34), openedAt: isoDay(-77), closedAt: isoDay(-34), contracts: 1, creditPerShare: 2.4, creditReceived: 240, costToClose: 0, realizedPnl: 240, outcome: "expired", daysHeld: 43, collateral: 9500, returnOnCollateral: 0.0253, annualized: 0.214 },
    { id: "ex-c4", symbol: "SOFI", name: "SoFi Technologies", strike: 26, expiration: isoDay(-61), openedAt: isoDay(-96), closedAt: isoDay(-61), contracts: 3, creditPerShare: 1.15, creditReceived: 345, costToClose: 0, realizedPnl: 345, outcome: "expired", daysHeld: 35, collateral: 7800, returnOnCollateral: 0.0442, annualized: 0.521 },
    { id: "ex-c5", symbol: "CLS", name: "Celestica", strike: 120, expiration: isoDay(-89), openedAt: isoDay(-120), closedAt: isoDay(-96), contracts: 1, creditPerShare: 3.5, creditReceived: 350, costToClose: 520, realizedPnl: -170, outcome: "closed_loss", daysHeld: 24, collateral: 12000, returnOnCollateral: -0.0142, annualized: -0.215 },
    { id: "ex-c6", symbol: "INTC", name: "Intel", strike: 22, expiration: isoDay(-3), openedAt: isoDay(-31), closedAt: isoDay(-3), contracts: 4, creditPerShare: 0.55, creditReceived: 220, costToClose: 0, realizedPnl: 220, outcome: "expired", daysHeld: 28, collateral: 8800, returnOnCollateral: 0.025, annualized: 0.326 },
    { id: "ex-c7", symbol: "IREN", name: "IREN", strike: 15, expiration: isoDay(-24), openedAt: isoDay(-45), closedAt: isoDay(-15), contracts: 3, creditPerShare: 0.71, creditReceived: 213, costToClose: 42, realizedPnl: 171, outcome: "closed_profit", daysHeld: 30, collateral: 4500, returnOnCollateral: 0.038, annualized: 0.462 },
    { id: "ex-c8", symbol: "GLW", name: "Corning", strike: 45, expiration: isoDay(-6), openedAt: isoDay(-40), closedAt: isoDay(-6), contracts: 2, creditPerShare: 1.35, creditReceived: 270, costToClose: 0, realizedPnl: 270, outcome: "expired", daysHeld: 34, collateral: 9000, returnOnCollateral: 0.03, annualized: 0.322 },
  ],
};

export const exampleLeapFile: ClosedLeapFile = {
  meta: META,
  closed: [
    { id: "ex-l1", symbol: "NVDA", name: "NVIDIA", optionType: "call", strike: 70, expiration: isoDay(-66), openedAt: isoDay(-215), closedAt: isoDay(-90), contracts: 1, entryPerShare: 22, costBasis: 2200, proceeds: 5600, realizedPnl: 3400, outcome: "closed_profit", daysHeld: 125, returnPct: 1.545, annualized: 4.51 },
    { id: "ex-l2", symbol: "MU", name: "Micron Technology", optionType: "call", strike: 80, expiration: isoDay(146), openedAt: isoDay(-179), closedAt: isoDay(-110), contracts: 1, entryPerShare: 28, costBasis: 2800, proceeds: 2100, realizedPnl: -700, outcome: "closed_loss", daysHeld: 69, returnPct: -0.25, annualized: -0.83 },
    { id: "ex-l3", symbol: "AAPL", name: "Apple", optionType: "call", strike: 160, expiration: isoDay(118), openedAt: isoDay(-170), closedAt: isoDay(-78), contracts: 1, entryPerShare: 30, costBasis: 3000, proceeds: 4200, realizedPnl: 1200, outcome: "closed_profit", daysHeld: 92, returnPct: 0.4, annualized: 1.59 },
  ],
};

export const exampleCoveredFile: ClosedCoveredFile = {
  meta: META,
  closed: [
    { id: "ex-cc1", symbol: "AAPL", name: "Apple", strike: 200, expiration: isoDay(-11), openedAt: isoDay(-42), closedAt: isoDay(-11), contracts: 2, creditPerShare: 3.0, creditReceived: 600, costToClose: 0, realizedPnl: 600, outcome: "expired", daysHeld: 31, returnOnNotional: 0.015, annualized: 0.177 },
    { id: "ex-cc2", symbol: "CLS", name: "Celestica", strike: 130, expiration: isoDay(-25), openedAt: isoDay(-48), closedAt: isoDay(-25), contracts: 1, creditPerShare: 5.0, creditReceived: 500, costToClose: 0, realizedPnl: 500, outcome: "expired", daysHeld: 23, returnOnNotional: 0.0385, annualized: 0.611 },
    { id: "ex-cc3", symbol: "NVDA", name: "NVIDIA", strike: 130, expiration: isoDay(-52), openedAt: isoDay(-82), closedAt: isoDay(-67), contracts: 1, creditPerShare: 4.0, creditReceived: 400, costToClose: 650, realizedPnl: -250, outcome: "closed_loss", daysHeld: 15, returnOnNotional: -0.0192, annualized: -0.468 },
    { id: "ex-cc4", symbol: "INTC", name: "Intel", strike: 25, expiration: isoDay(-9), openedAt: isoDay(-34), closedAt: isoDay(-9), contracts: 2, creditPerShare: 0.5, creditReceived: 100, costToClose: 0, realizedPnl: 100, outcome: "expired", daysHeld: 25, returnOnNotional: 0.02, annualized: 0.292 },
  ],
};

export const exampleSpreadFile: ClosedSpreadFile = {
  meta: META,
  closed: [
    { id: "ex-s1", symbol: "GOOGL", name: "Alphabet", optionType: "put", shortStrike: 160, longStrike: 150, width: 10, expiration: isoDay(-14), openedAt: isoDay(-52), closedAt: isoDay(-14), contracts: 1, isCredit: true, netCreditPerShare: 3.0, netOpen: 300, netClose: 0, realizedPnl: 300, maxRisk: 700, outcome: "closed_profit", daysHeld: 38, returnOnRisk: 0.429, annualized: 4.12 },
    { id: "ex-s2", symbol: "NVDA", name: "NVIDIA", optionType: "call", shortStrike: 140, longStrike: 150, width: 10, expiration: isoDay(-58), openedAt: isoDay(-90), closedAt: isoDay(-65), contracts: 2, isCredit: true, netCreditPerShare: 2.5, netOpen: 500, netClose: 900, realizedPnl: -400, maxRisk: 1500, outcome: "closed_loss", daysHeld: 26, returnOnRisk: -0.267, annualized: -3.74 },
    { id: "ex-s3", symbol: "AAPL", name: "Apple", optionType: "put", shortStrike: 210, longStrike: 200, width: 10, expiration: isoDay(-21), openedAt: isoDay(-48), closedAt: isoDay(-21), contracts: 1, isCredit: true, netCreditPerShare: 2.2, netOpen: 220, netClose: 0, realizedPnl: 220, maxRisk: 780, outcome: "closed_profit", daysHeld: 27, returnOnRisk: 0.282, annualized: 3.81 },
  ],
};

export const exampleStockFile: ClosedStockFile = {
  meta: META,
  closed: [
    { id: "ex-st1", symbol: "NVDA", name: "NVIDIA", side: "long", shares: 100, avgOpen: 95, avgClose: 128, costBasis: 9500, proceeds: 12800, realizedPnl: 3300, outcome: "closed_profit", openedAt: isoDay(-131), closedAt: isoDay(-36), daysHeld: 95, returnPct: 0.347, annualized: 1.33 },
    { id: "ex-st2", symbol: "MU", name: "Micron Technology", side: "long", shares: 100, avgOpen: 100, avgClose: 92, costBasis: 10000, proceeds: 9200, realizedPnl: -800, outcome: "closed_loss", openedAt: isoDay(-95), closedAt: isoDay(-57), daysHeld: 38, returnPct: -0.08, annualized: -0.77 },
    { id: "ex-st3", symbol: "AAPL", name: "Apple", side: "long", shares: 50, avgOpen: 175, avgClose: 205, costBasis: 8750, proceeds: 10250, realizedPnl: 1500, outcome: "closed_profit", openedAt: isoDay(-121), closedAt: isoDay(-11), daysHeld: 110, returnPct: 0.171, annualized: 0.568 },
    { id: "ex-st4", symbol: "SOFI", name: "SoFi Technologies", side: "long", shares: 300, avgOpen: 22.4, avgClose: 27.8, costBasis: 6720, proceeds: 8340, realizedPnl: 1620, outcome: "closed_profit", openedAt: isoDay(-109), closedAt: isoDay(-5), daysHeld: 120, returnPct: 0.368, annualized: 1.12 },
    { id: "ex-st5", symbol: "CLS", name: "Celestica", side: "long", shares: 60, avgOpen: 115, avgClose: 108, costBasis: 6900, proceeds: 6480, realizedPnl: -420, outcome: "closed_loss", openedAt: isoDay(-72), closedAt: isoDay(-46), daysHeld: 26, returnPct: -0.0609, annualized: -0.85 },
  ],
};

// Ticker → sector map (data/sectors.json) for every name the example snapshot
// holds. Deliberately semiconductor-heavy so the Portfolio Risk screen's sector
// cap shows a real breach in the demo, and DRAM is left out so the
// "Unclassified" bucket and its override hint have something to show.
const sectorEntry = (sector: string | null, industry: string | null = null, quoteType = "EQUITY"): SectorEntry => ({
  sector,
  industry,
  quoteType,
  asof: NOW_ISO,
});
export const exampleSectors: SectorsFile = {
  asof: NOW_ISO,
  tickers: {
    AAPL: sectorEntry("Technology", "Consumer Electronics"),
    AMAT: sectorEntry("Technology", "Semiconductor Equipment & Materials"),
    AMZN: sectorEntry("Consumer Cyclical", "Internet Retail"),
    CCL: sectorEntry("Consumer Cyclical", "Travel Services"),
    CDE: sectorEntry("Basic Materials", "Gold"),
    CLS: sectorEntry("Technology", "Electronic Components"),
    COHR: sectorEntry("Technology", "Scientific & Technical Instruments"),
    CRDO: sectorEntry("Technology", "Semiconductors"),
    GLW: sectorEntry("Technology", "Electronic Components"),
    GOOGL: sectorEntry("Communication Services", "Internet Content & Information"),
    INTC: sectorEntry("Technology", "Semiconductors"),
    IREN: sectorEntry("Financial Services", "Capital Markets"),
    LRCX: sectorEntry("Technology", "Semiconductor Equipment & Materials"),
    MU: sectorEntry("Technology", "Semiconductors"),
    NVDA: sectorEntry("Technology", "Semiconductors"),
    PLTR: sectorEntry("Technology", "Software - Infrastructure"),
    SMH: sectorEntry("ETF / Index Fund", null, "ETF"),
    SOFI: sectorEntry("Financial Services", "Credit Services"),
    TSM: sectorEntry("Technology", "Semiconductors"),
  },
  overrides: {},
};

// Chart-a-Ticker chart (app/api/chart) demo data. The route never reaches out
// to Yahoo in example mode; it returns this fake-but-internally-consistent
// series instead, seeded off the symbol's own characters so different tickers
// look distinct rather than one line relabeled. Indicators are computed from
// the fake closes by the same code the real route uses.
const CHART_DAYS = 504; // ~2 trading years

function chartTradingDates(days: number): string[] {
  const dates: string[] = [];
  let offset = 0;
  while (dates.length < days) {
    offset -= 1;
    const d = new Date(Date.now() + offset * DAY_MS);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(d.toISOString().slice(0, 10));
  }
  return dates.reverse();
}

function chartWalk(startValue: number, seedOffset: number, days: number): number[] {
  const values: number[] = [];
  let value = startValue;
  const amplitude = startValue * 0.012;
  for (let day = 0; day < days; day++) {
    const noise = Math.sin((day + seedOffset) * 0.35) * amplitude + Math.sin((day + seedOffset) * 1.3) * amplitude * 0.4;
    value = Math.max(startValue * 0.2, value * 1.0006 + noise);
    values.push(Math.round(value * 100) / 100);
  }
  return values;
}

export function exampleChartData(symbol: string): ChartData {
  const dates = chartTradingDates(CHART_DAYS);
  const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const startValue = 40 + (seed % 200);
  const close = chartWalk(startValue, seed, CHART_DAYS);
  const open = close.map((c, i) => (i === 0 ? c : Math.round(close[i - 1] * (1 + Math.sin(i * 0.5) * 0.004) * 100) / 100));
  const high = close.map((c, i) => Math.round(Math.max(c, open[i]) * (1 + Math.abs(Math.sin(i * 0.9)) * 0.006) * 100) / 100);
  const low = close.map((c, i) => Math.round(Math.min(c, open[i]) * (1 - Math.abs(Math.cos(i * 0.9)) * 0.006) * 100) / 100);
  const spot = close[close.length - 1];
  return buildChartData(symbol, { dates, open, high, low, close }, {
    companyName: `${symbol} Corp (example)`,
    spotPrice: spot,
    callWall: Math.round((spot * 1.05) / 5) * 5,
    putWall: Math.round((spot * 0.95) / 5) * 5,
    gammaFlip: Math.round(spot * 1.01 * 100) / 100,
    asOf: NOW_ISO,
  });
}
