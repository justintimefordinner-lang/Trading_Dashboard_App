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
        totalValue: 630350,
        equityValue: 211533,
        optionsValue: -680,
        cryptoValue: 24205,
        cash: 395292,
        buyingPower: 345000,
        optionsBuyingPower: 460000,
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
          symbol: "AAPL", name: "Apple", qty: 200, avgCost: 258, price: 333.08, dayChange: 0.81, bbSigma: 0.4,
          priceHistory: [328.21, 319.97, 316.22, 315.34, 326.57, 332.27, 333.08],
          gamma: { flip: 330, callWall: 350, putWall: 320, net: "pos" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 340, delta: 0.31, mark: 4.41, premPct: 1.33, annPct: 35, oi: 30100, bbSigma: 1.2 },
            { targetDte: 21, dte: 21, strike: 350, delta: 0.27, mark: 5.44, premPct: 1.63, annPct: 28, oi: 22400, bbSigma: 1.6 },
            { targetDte: 30, dte: 30, strike: 360, delta: 0.24, mark: 6.68, premPct: 2.00, annPct: 24, oi: 41800, bbSigma: 2.0 },
          ],
        },
        {
          // Underwater against a 25 basis — the ladder's strikes still clear cost, so
          // a call written here would exit at a gain even though the position is red.
          symbol: "SOFI", name: "SoFi Technologies", qty: 500, avgCost: 23, price: 17.65, dayChange: 0.33, bbSigma: -0.8,
          priceHistory: [18.51, 18.22, 18.01, 17.33, 17.21, 17.32, 17.65],
          gamma: { flip: 17.5, callWall: 20.5, putWall: 16, net: "pos" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 24.5, delta: 0.14, mark: 0.17, premPct: 0.95, annPct: 25, oi: 41200, bbSigma: 2.3 },
            { targetDte: 21, dte: 21, strike: 25, delta: 0.12, mark: 0.22, premPct: 1.27, annPct: 22, oi: 55800, bbSigma: 2.7 },
            { targetDte: 30, dte: 30, strike: 26, delta: 0.11, mark: 0.29, premPct: 1.64, annPct: 20, oi: 55800, bbSigma: 3.0 },
          ],
        },
        {
          symbol: "GLW", name: "Corning", qty: 200, avgCost: 113, price: 143.60, dayChange: -22.80, bbSigma: 0.6,
          priceHistory: [146.00, 154.30, 165.96, 168.46, 163.12, 166.40, 143.60],
          gamma: { flip: 145, callWall: 160, putWall: 135, net: "pos" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 150, delta: 0.32, mark: 3.16, premPct: 2.20, annPct: 57, oi: 8400, bbSigma: 1.1 },
            { targetDte: 21, dte: 21, strike: 155, delta: 0.27, mark: 3.88, premPct: 2.70, annPct: 47, oi: 5100, bbSigma: 1.6 },
            { targetDte: 30, dte: 30, strike: 160, delta: 0.23, mark: 4.60, premPct: 3.20, annPct: 39, oi: 6700, bbSigma: 2.1 },
          ],
        },
        {
          // Also underwater — the ladder's strikes above basis are the ones that
          // matter here, which exercises the "above avg cost" styling.
          symbol: "IREN", name: "IREN", qty: 400, avgCost: 49, price: 43.17, dayChange: -0.66, bbSigma: -0.9,
          priceHistory: [41.65, 44.68, 46.93, 45.37, 43.64, 43.83, 43.17],
          gamma: { flip: 43, callWall: 49, putWall: 39, net: "neg" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 52, delta: 0.24, mark: 1.13, premPct: 2.63, annPct: 69, oi: 14200, bbSigma: 1.6 },
            { targetDte: 21, dte: 21, strike: 54, delta: 0.20, mark: 1.39, premPct: 3.22, annPct: 56, oi: 9800, bbSigma: 2.0 },
            { targetDte: 30, dte: 30, strike: 57, delta: 0.17, mark: 1.65, premPct: 3.82, annPct: 46, oi: 7300, bbSigma: 2.4 },
          ],
        },
        {
          symbol: "PLTR", name: "Palantir", qty: 200, avgCost: 144, price: 173.31, dayChange: 6.08, bbSigma: 1.4,
          priceHistory: [182.53, 174.33, 170.30, 169.53, 165.86, 167.23, 173.31],
          gamma: { flip: 175, callWall: 195, putWall: 160, net: "pos" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 185, delta: 0.30, mark: 4.19, premPct: 2.42, annPct: 63, oi: 22100, bbSigma: 1.5 },
            { targetDte: 21, dte: 21, strike: 190, delta: 0.27, mark: 5.06, premPct: 2.92, annPct: 51, oi: 31400, bbSigma: 1.9 },
            { targetDte: 30, dte: 30, strike: 195, delta: 0.24, mark: 6.16, premPct: 3.56, annPct: 43, oi: 18900, bbSigma: 2.2 },
          ],
        },
        // < 100 sh: no covered-call ladder (exercises the "can't write a call" path).
        { symbol: "MU", name: "Micron Technology", qty: 60, avgCost: 746, price: 924.03, dayChange: -51.23, bbSigma: 0.8, priceHistory: [958.16, 1016.59, 1000.26, 1027.77, 977.41, 975.26, 924.03] },
      ],
      crypto: [
        { symbol: "BTC", name: "Bitcoin", qty: 0.25, avgCost: 52000, price: 76973 },
        { symbol: "ETH", name: "Ethereum", qty: 2, avgCost: 2100, price: 2481 },
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
        { id: "ex-o1", kind: "csp", symbol: "SOFI", optionType: "put", side: "short", qty: 1, strike: 16, expiration: isoDay(20), entryPerShare: 0.69, mark: 0.14, delta: -0.12, gamma: 0.08, vega: 0.03, theta: 0.015, iv: 0.58, breakeven: 15.31, underlyingPrice: 17.65, underlyingChange: 0.33, underlyingClose: 17.32, underlyingLive: 17.65, dayValueChange: 10.3, bbSigma: -1.4, chanceOfProfitShort: 0.88, openedAt: isoDay(-38), erDate: isoDay(46) },
        { id: "ex-o2", kind: "csp", symbol: "MU", optionType: "put", side: "short", qty: 1, strike: 950, expiration: isoDay(27), entryPerShare: 25.33, mark: 39.95, delta: -0.56, gamma: 0.002, vega: 1.35, theta: 1.10, iv: 0.62, breakeven: 924.67, underlyingPrice: 924.03, underlyingChange: -51.23, underlyingClose: 975.26, underlyingLive: 924.03, dayValueChange: -114.7, bbSigma: -0.9, chanceOfProfitShort: 0.44, openedAt: isoDay(-43), erDate: isoDay(12) },
        { id: "ex-o3", kind: "csp", symbol: "CDE", optionType: "put", side: "short", qty: 1, strike: 18, expiration: isoDay(34), entryPerShare: 0.74, mark: 0.52, delta: -0.22, gamma: 0.05, vega: 0.04, theta: 0.011, iv: 0.61, breakeven: 17.26, underlyingPrice: 19.88, underlyingChange: -0.70, underlyingClose: 20.58, underlyingLive: 19.88, dayValueChange: 7.6, bbSigma: -0.5, chanceOfProfitShort: 0.78, openedAt: isoDay(-32), erDate: null },
        { id: "ex-o11", kind: "csp", symbol: "IREN", optionType: "put", side: "short", qty: 1, strike: 39, expiration: isoDay(13), entryPerShare: 1.46, mark: 0.21, delta: -0.09, gamma: 0.02, vega: 0.05, theta: 0.02, iv: 0.74, breakeven: 37.54, underlyingPrice: 43.17, underlyingChange: -0.66, underlyingClose: 43.83, underlyingLive: 43.17, dayValueChange: 14.4, bbSigma: -1.7, chanceOfProfitShort: 0.91, openedAt: isoDay(-29), erDate: null },
        { id: "ex-o12", kind: "csp", symbol: "INTC", optionType: "put", side: "short", qty: 1, strike: 92, expiration: isoDay(27), entryPerShare: 2.86, mark: 2.05, delta: -0.28, gamma: 0.01, vega: 0.19, theta: 0.06, iv: 0.51, breakeven: 89.14, underlyingPrice: 97.19, underlyingChange: -5.75, underlyingClose: 102.94, underlyingLive: 97.19, dayValueChange: -34.5, bbSigma: -0.7, chanceOfProfitShort: 0.72, openedAt: isoDay(-19), erDate: isoDay(31) },
        { id: "ex-o13", kind: "csp", symbol: "GLW", optionType: "put", side: "short", qty: 1, strike: 135, expiration: isoDay(41), entryPerShare: 5.56, mark: 4.31, delta: -0.25, gamma: 0.006, vega: 0.34, theta: 0.09, iv: 0.36, breakeven: 129.44, underlyingPrice: 143.60, underlyingChange: -22.80, underlyingClose: 166.40, underlyingLive: 143.60, dayValueChange: -21.1, bbSigma: -0.6, chanceOfProfitShort: 0.75, openedAt: isoDay(-12), erDate: null },
        { id: "ex-o14", kind: "csp", symbol: "CLS", optionType: "put", side: "short", qty: 1, strike: 290, expiration: isoDay(34), entryPerShare: 11.62, mark: 9.06, delta: -0.27, gamma: 0.004, vega: 0.58, theta: 0.21, iv: 0.57, breakeven: 278.38, underlyingPrice: 316.08, underlyingChange: -30.47, underlyingClose: 346.55, underlyingLive: 316.08, dayValueChange: -101.3, bbSigma: -0.5, chanceOfProfitShort: 0.73, openedAt: isoDay(-24), erDate: null },
        // A second cohort of CSPs on larger-cap names, so the screen shows the range
        // of strike sizes a real book carries rather than only small-dollar tickers.
        { id: "ex-o15", kind: "csp", symbol: "AMAT", optionType: "put", side: "short", qty: 1, strike: 400, expiration: isoDay(28), entryPerShare: 12.02, mark: 13.66, delta: -0.31, gamma: 0.004, vega: 0.62, theta: 0.44, iv: 0.38, breakeven: 387.98, underlyingPrice: 424.21, underlyingChange: -32.28, underlyingClose: 456.49, underlyingLive: 424.21, dayValueChange: -60.8, bbSigma: -0.5, chanceOfProfitShort: 0.69, openedAt: isoDay(-9), erDate: null },
        { id: "ex-o16", kind: "csp", symbol: "COHR", optionType: "put", side: "short", qty: 1, strike: 260, expiration: isoDay(21), entryPerShare: 8.46, mark: 16.67, delta: -0.42, gamma: 0.008, vega: 0.47, theta: 0.46, iv: 0.52, breakeven: 251.54, underlyingPrice: 266.50, underlyingChange: -38.87, underlyingClose: 305.37, underlyingLive: 266.50, dayValueChange: -140.5, bbSigma: -1.1, chanceOfProfitShort: 0.58, openedAt: isoDay(-14), erDate: null },
        { id: "ex-o17", kind: "csp", symbol: "LRCX", optionType: "put", side: "short", qty: 1, strike: 260, expiration: isoDay(21), entryPerShare: 8.68, mark: 9.56, delta: -0.33, gamma: 0.006, vega: 0.51, theta: 0.38, iv: 0.41, breakeven: 251.32, underlyingPrice: 273.49, underlyingChange: -24.73, underlyingClose: 298.22, underlyingLive: 273.49, dayValueChange: 22.0, bbSigma: -0.3, chanceOfProfitShort: 0.67, openedAt: isoDay(-11), erDate: null },
        { id: "ex-o18", kind: "csp", symbol: "CRDO", optionType: "put", side: "short", qty: 1, strike: 135, expiration: isoDay(14), entryPerShare: 4.70, mark: 7.18, delta: -0.30, gamma: 0.007, vega: 0.33, theta: 1.26, iv: 0.68, breakeven: 130.30, underlyingPrice: 150.09, underlyingChange: -12.86, underlyingClose: 162.95, underlyingLive: 150.09, dayValueChange: -26.1, bbSigma: -0.7, chanceOfProfitShort: 0.70, openedAt: isoDay(-7), erDate: null },
        // Through its strike — lands in the Assignment-risk bucket.
        { id: "ex-o19", kind: "csp", symbol: "CCL", optionType: "put", side: "short", qty: 1, strike: 23, expiration: isoDay(28), entryPerShare: 0.48, mark: 1.15, delta: -0.53, gamma: 0.09, vega: 0.03, theta: 0.02, iv: 0.44, breakeven: 22.52, underlyingPrice: 22.56, underlyingChange: -0.19, underlyingClose: 22.75, underlyingLive: 22.56, dayValueChange: 13.2, bbSigma: -1.5, chanceOfProfitShort: 0.47, openedAt: isoDay(-16), erDate: null },
        // Most of the premium already harvested — remaining yield annualizes ~22%, so
        // this one reads as Rollable.
        { id: "ex-o20", kind: "csp", symbol: "DRAM", optionType: "put", side: "short", qty: 1, strike: 45, expiration: isoDay(28), entryPerShare: 1.42, mark: 0.77, delta: -0.13, gamma: 0.02, vega: 0.07, theta: 0.04, iv: 0.56, breakeven: 43.58, underlyingPrice: 54.80, underlyingChange: -4.30, underlyingClose: 59.10, underlyingLive: 54.80, dayValueChange: 18.4, bbSigma: -1.3, chanceOfProfitShort: 0.87, openedAt: isoDay(-22), erDate: null },
        // Five contracts against the 500 SOFI shares — fully covered. The strike sits
        // below the 25 cost basis, so the Stocks page will show it as a call written
        // under water rather than one that exits at a gain.
        { id: "ex-o21", kind: "covered-call", symbol: "SOFI", optionType: "call", side: "short", qty: 5, strike: 19.5, expiration: isoDay(20), entryPerShare: 0.58, mark: 0.38, delta: 0.28, gamma: 0.06, vega: 0.02, theta: 0.012, iv: 0.55, breakeven: 20.08, underlyingPrice: 17.65, underlyingChange: 0.33, underlyingClose: 17.32, underlyingLive: 17.65, dayValueChange: -35.5, bbSigma: 1.9, chanceOfProfitShort: 0.72, openedAt: isoDay(-13) },
        { id: "ex-o4", kind: "leap-call", symbol: "NVDA", optionType: "call", side: "long", qty: 2, strike: 175, expiration: isoDay(146), entryPerShare: 33.90, mark: 47.36, delta: 0.71, gamma: 0.004, vega: 0.82, theta: -0.09, iv: 0.47, breakeven: 208.90, underlyingPrice: 210.96, underlyingChange: -7.33, underlyingClose: 218.29, underlyingLive: 210.96, dayValueChange: -149.3, bbSigma: 0.7, openedAt: isoDay(-194) },
        { id: "ex-o5", kind: "leap-put-hedge", symbol: "SMH", optionType: "put", side: "long", qty: 1, strike: 500, expiration: isoDay(209), entryPerShare: 29.95, mark: 23.77, delta: -0.31, gamma: 0.002, vega: 1.42, theta: -0.11, iv: 0.29, breakeven: 470.05, underlyingPrice: 541.50, underlyingChange: -27.03, underlyingClose: 568.53, underlyingLive: 541.50, dayValueChange: 65.7, bbSigma: 0.9, openedAt: isoDay(-143) },
        { id: "ex-o6", kind: "covered-call", symbol: "AAPL", optionType: "call", side: "short", qty: 2, strike: 340, expiration: isoDay(20), entryPerShare: 6.57, mark: 4.68, delta: 0.32, gamma: 0.008, vega: 0.41, theta: 0.12, iv: 0.26, breakeven: 346.57, underlyingPrice: 333.08, underlyingChange: 0.81, underlyingClose: 332.27, underlyingLive: 333.08, dayValueChange: 66.8, bbSigma: 1.5, chanceOfProfitShort: 0.68, openedAt: isoDay(-35) },
        { id: "ex-o7", kind: "put-spread", symbol: "GOOGL", optionType: "put", side: "short", qty: 1, strike: 330, expiration: isoDay(34), entryPerShare: 11.55, mark: 8.16, delta: -0.31, gamma: 0.005, vega: 0.62, theta: 0.17, iv: 0.31, breakeven: 318.45, underlyingPrice: 349.39, underlyingChange: 10.89, underlyingClose: 338.50, underlyingLive: 349.39, dayValueChange: 55.7, bbSigma: 0.4, chanceOfProfitShort: 0.69, openedAt: isoDay(-39) },
        { id: "ex-o8", kind: "put-spread", symbol: "GOOGL", optionType: "put", side: "long", qty: 1, strike: 320, expiration: isoDay(34), entryPerShare: 7.30, mark: 4.96, delta: -0.19, gamma: 0.004, vega: 0.48, theta: -0.11, iv: 0.33, breakeven: 312.70, underlyingPrice: 349.39, underlyingChange: 10.89, underlyingClose: 338.50, underlyingLive: 349.39, dayValueChange: -34.5, bbSigma: 0.1, openedAt: isoDay(-39) },
        { id: "ex-o9", kind: "call-spread", symbol: "NVDA", optionType: "call", side: "short", qty: 2, strike: 225, expiration: isoDay(34), entryPerShare: 8.25, mark: 6.78, delta: 0.38, gamma: 0.006, vega: 0.55, theta: 0.14, iv: 0.45, breakeven: 233.25, underlyingPrice: 210.96, underlyingChange: -7.33, underlyingClose: 218.29, underlyingLive: 210.96, dayValueChange: 94.3, bbSigma: 0.7, chanceOfProfitShort: 0.62, openedAt: isoDay(-51) },
        { id: "ex-o10", kind: "call-spread", symbol: "NVDA", optionType: "call", side: "long", qty: 2, strike: 235, expiration: isoDay(34), entryPerShare: 5.01, mark: 3.98, delta: 0.27, gamma: 0.005, vega: 0.47, theta: -0.10, iv: 0.47, breakeven: 240.01, underlyingPrice: 210.96, underlyingChange: -7.33, underlyingClose: 218.29, underlyingLive: 210.96, dayValueChange: -62.9, bbSigma: 0.7, openedAt: isoDay(-51) },
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
        totalValue: 65703,
        equityValue: 50151,
        optionsValue: -948,
        cryptoValue: 0,
        cash: 16500,
        buyingPower: 16500,
        optionsBuyingPower: 16500,
      },
      equities: [
        { symbol: "GOOGL", name: "Alphabet", qty: 100, avgCost: 261, price: 349.39, dayChange: 10.89, bbSigma: 0.4, priceHistory: [342.48, 338.46, 338.36, 330.65, 332.60, 338.50, 349.39], gamma: { flip: 350, callWall: 370, putWall: 330, net: "pos" }, coveredCalls: [ { targetDte: 21, dte: 21, strike: 370, delta: 0.28, mark: 6.18, premPct: 1.77, annPct: 31, oi: 12800, bbSigma: 1.5 } ] },
        { symbol: "AMZN", name: "Amazon", qty: 60, avgCost: 192, price: 253.54, dayChange: -3.24, bbSigma: 0.5, priceHistory: [258.90, 258.51, 256.97, 252.40, 251.89, 256.78, 253.54] },
      ],
      options: [
        { id: "ex-ira1", kind: "csp", symbol: "TSM", optionType: "put", side: "short", qty: 1, strike: 390, expiration: isoDay(27), entryPerShare: 11.77, mark: 9.48, delta: -0.26, gamma: 0.003, vega: 0.71, theta: 0.24, iv: 0.37, breakeven: 378.23, underlyingPrice: 418.01, underlyingChange: -15.23, underlyingClose: 433.24, underlyingLive: 418.01, dayValueChange: 41.9, bbSigma: -0.4, chanceOfProfitShort: 0.74, openedAt: isoDay(-36), erDate: isoDay(25) },
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

