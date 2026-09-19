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
import { EXAMPLE_CLOSES, EXAMPLE_EARNINGS } from "./example-market";

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
        totalValue: 675830,
        equityValue: 220880,
        optionsValue: -1117,
        cryptoValue: 25606,
        cash: 430461,
        buyingPower: 370000,
        optionsBuyingPower: 493000,
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
          symbol: "AAPL", name: "Apple", qty: 200, avgCost: 260, price: 336.13, dayChange: -0.87, bbSigma: 0.4,
          priceHistory: [326.57, 332.27, 333.08, 331.34, 332.41, 337.00, 336.13],
          gamma: { flip: 340, callWall: 360, putWall: 330, net: "pos" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 340, delta: 0.31, mark: 4.45, premPct: 1.33, annPct: 35, oi: 30100, bbSigma: 1.2 },
            { targetDte: 21, dte: 21, strike: 350, delta: 0.27, mark: 5.49, premPct: 1.63, annPct: 28, oi: 22400, bbSigma: 1.6 },
            { targetDte: 30, dte: 30, strike: 360, delta: 0.24, mark: 6.74, premPct: 2.00, annPct: 24, oi: 41800, bbSigma: 2.0 },
          ],
        },
        {
          // Underwater against a 25 basis — the ladder's strikes still clear cost, so
          // a call written here would exit at a gain even though the position is red.
          symbol: "SOFI", name: "SoFi Technologies", qty: 500, avgCost: 22, price: 16.96, dayChange: 0.23, bbSigma: -0.8,
          priceHistory: [17.21, 17.32, 17.65, 17.07, 16.84, 16.73, 16.96],
          gamma: { flip: 17, callWall: 20, putWall: 15.5, net: "pos" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 23.5, delta: 0.14, mark: 0.16, premPct: 0.95, annPct: 25, oi: 41200, bbSigma: 2.3 },
            { targetDte: 21, dte: 21, strike: 24, delta: 0.12, mark: 0.21, premPct: 1.27, annPct: 22, oi: 55800, bbSigma: 2.7 },
            { targetDte: 30, dte: 30, strike: 25, delta: 0.11, mark: 0.28, premPct: 1.64, annPct: 20, oi: 55800, bbSigma: 3.0 },
          ],
        },
        {
          symbol: "GLW", name: "Corning", qty: 200, avgCost: 118, price: 150.13, dayChange: 2.33, bbSigma: 0.6,
          priceHistory: [163.12, 166.40, 143.60, 143.57, 144.16, 147.80, 150.13],
          gamma: { flip: 150, callWall: 165, putWall: 140, net: "pos" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 155, delta: 0.32, mark: 3.30, premPct: 2.20, annPct: 57, oi: 8400, bbSigma: 1.1 },
            { targetDte: 21, dte: 21, strike: 160, delta: 0.27, mark: 4.06, premPct: 2.70, annPct: 47, oi: 5100, bbSigma: 1.6 },
            { targetDte: 30, dte: 30, strike: 165, delta: 0.23, mark: 4.81, premPct: 3.20, annPct: 39, oi: 6700, bbSigma: 2.1 },
          ],
        },
        {
          // Also underwater — the ladder's strikes above basis are the ones that
          // matter here, which exercises the "above avg cost" styling.
          symbol: "IREN", name: "IREN", qty: 400, avgCost: 53, price: 46.68, dayChange: 3.20, bbSigma: -0.9,
          priceHistory: [43.64, 43.83, 43.17, 41.58, 42.62, 43.48, 46.68],
          gamma: { flip: 47, callWall: 53, putWall: 42, net: "neg" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 56, delta: 0.24, mark: 1.22, premPct: 2.63, annPct: 69, oi: 14200, bbSigma: 1.6 },
            { targetDte: 21, dte: 21, strike: 58, delta: 0.20, mark: 1.50, premPct: 3.22, annPct: 56, oi: 9800, bbSigma: 2.0 },
            { targetDte: 30, dte: 30, strike: 62, delta: 0.17, mark: 1.78, premPct: 3.82, annPct: 46, oi: 7300, bbSigma: 2.4 },
          ],
        },
        {
          symbol: "PLTR", name: "Palantir", qty: 200, avgCost: 148, price: 177.64, dayChange: 1.40, bbSigma: 1.4,
          priceHistory: [165.86, 167.23, 173.31, 172.56, 174.34, 176.24, 177.64],
          gamma: { flip: 180, callWall: 200, putWall: 160, net: "pos" },
          coveredCalls: [
            { targetDte: 14, dte: 14, strike: 190, delta: 0.30, mark: 4.29, premPct: 2.42, annPct: 63, oi: 22100, bbSigma: 1.5 },
            { targetDte: 21, dte: 21, strike: 195, delta: 0.27, mark: 5.19, premPct: 2.92, annPct: 51, oi: 31400, bbSigma: 1.9 },
            { targetDte: 30, dte: 30, strike: 200, delta: 0.24, mark: 6.31, premPct: 3.56, annPct: 43, oi: 18900, bbSigma: 2.2 },
          ],
        },
        // < 100 sh: no covered-call ladder (exercises the "can't write a call" path).
        { symbol: "MU", name: "Micron Technology", qty: 60, avgCost: 820, price: 1015.80, dayChange: 38.30, bbSigma: 0.8, priceHistory: [977.41, 975.26, 924.03, 927.60, 926.55, 977.50, 1015.80] },
      ],
      crypto: [
        { symbol: "BTC", name: "Bitcoin", qty: 0.25, avgCost: 52000, price: 81336 },
        { symbol: "ETH", name: "Ethereum", qty: 2, avgCost: 2100, price: 2636 },
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
        { id: "ex-o1", kind: "csp", symbol: "SOFI", optionType: "put", side: "short", qty: 1, strike: 15.5, expiration: isoDay(20), entryPerShare: 0.66, mark: 0.13, delta: -0.12, gamma: 0.08, vega: 0.03, theta: 0.015, iv: 0.58, breakeven: 14.84, underlyingPrice: 16.96, underlyingChange: 0.23, underlyingClose: 16.73, underlyingLive: 16.96, dayValueChange: 2.8, bbSigma: -1.4, chanceOfProfitShort: 0.88, openedAt: isoDay(-38), erDate: EXAMPLE_EARNINGS.SOFI },
        { id: "ex-o2", kind: "csp", symbol: "MU", optionType: "put", side: "short", qty: 1, strike: 1050, expiration: isoDay(27), entryPerShare: 27.85, mark: 43.92, delta: -0.56, gamma: 0.002, vega: 1.35, theta: 1.10, iv: 0.62, breakeven: 1022.15, underlyingPrice: 1015.80, underlyingChange: 38.30, underlyingClose: 977.50, underlyingLive: 1015.80, dayValueChange: 2144.8, bbSigma: -0.9, chanceOfProfitShort: 0.44, openedAt: isoDay(-43), erDate: EXAMPLE_EARNINGS.MU },
        { id: "ex-o3", kind: "csp", symbol: "CDE", optionType: "put", side: "short", qty: 1, strike: 18, expiration: isoDay(34), entryPerShare: 0.74, mark: 0.52, delta: -0.22, gamma: 0.05, vega: 0.04, theta: 0.011, iv: 0.61, breakeven: 17.26, underlyingPrice: 19.76, underlyingChange: -0.22, underlyingClose: 19.98, underlyingLive: 19.76, dayValueChange: -4.8, bbSigma: -0.5, chanceOfProfitShort: 0.78, openedAt: isoDay(-32), erDate: EXAMPLE_EARNINGS.CDE },
        { id: "ex-o11", kind: "csp", symbol: "IREN", optionType: "put", side: "short", qty: 1, strike: 42, expiration: isoDay(13), entryPerShare: 1.58, mark: 0.23, delta: -0.09, gamma: 0.02, vega: 0.05, theta: 0.02, iv: 0.74, breakeven: 40.42, underlyingPrice: 46.68, underlyingChange: 3.20, underlyingClose: 43.48, underlyingLive: 46.68, dayValueChange: 28.8, bbSigma: -1.7, chanceOfProfitShort: 0.91, openedAt: isoDay(-29), erDate: EXAMPLE_EARNINGS.IREN },
        { id: "ex-o12", kind: "csp", symbol: "INTC", optionType: "put", side: "short", qty: 1, strike: 105, expiration: isoDay(27), entryPerShare: 3.20, mark: 2.29, delta: -0.28, gamma: 0.01, vega: 0.19, theta: 0.06, iv: 0.51, breakeven: 101.80, underlyingPrice: 108.60, underlyingChange: -0.20, underlyingClose: 108.80, underlyingLive: 108.60, dayValueChange: -5.6, bbSigma: -0.7, chanceOfProfitShort: 0.72, openedAt: isoDay(-19), erDate: EXAMPLE_EARNINGS.INTC },
        { id: "ex-o13", kind: "csp", symbol: "GLW", optionType: "put", side: "short", qty: 1, strike: 140, expiration: isoDay(41), entryPerShare: 5.81, mark: 4.51, delta: -0.25, gamma: 0.006, vega: 0.34, theta: 0.09, iv: 0.36, breakeven: 134.19, underlyingPrice: 150.13, underlyingChange: 2.33, underlyingClose: 147.80, underlyingLive: 150.13, dayValueChange: 58.2, bbSigma: -0.6, chanceOfProfitShort: 0.75, openedAt: isoDay(-12), erDate: EXAMPLE_EARNINGS.GLW },
        { id: "ex-o14", kind: "csp", symbol: "CLS", optionType: "put", side: "short", qty: 1, strike: 310, expiration: isoDay(34), entryPerShare: 12.23, mark: 9.53, delta: -0.27, gamma: 0.004, vega: 0.58, theta: 0.21, iv: 0.57, breakeven: 297.77, underlyingPrice: 332.63, underlyingChange: 2.69, underlyingClose: 329.94, underlyingLive: 332.63, dayValueChange: 72.6, bbSigma: -0.5, chanceOfProfitShort: 0.73, openedAt: isoDay(-24), erDate: EXAMPLE_EARNINGS.CLS },
        // A second cohort of CSPs on larger-cap names, so the screen shows the range
        // of strike sizes a real book carries rather than only small-dollar tickers.
        { id: "ex-o15", kind: "csp", symbol: "AMAT", optionType: "put", side: "short", qty: 1, strike: 420, expiration: isoDay(28), entryPerShare: 12.60, mark: 14.32, delta: -0.31, gamma: 0.004, vega: 0.62, theta: 0.44, iv: 0.38, breakeven: 407.40, underlyingPrice: 444.57, underlyingChange: 27.17, underlyingClose: 417.40, underlyingLive: 444.57, dayValueChange: 842.3, bbSigma: -0.5, chanceOfProfitShort: 0.69, openedAt: isoDay(-9), erDate: EXAMPLE_EARNINGS.AMAT },
        { id: "ex-o16", kind: "csp", symbol: "COHR", optionType: "put", side: "short", qty: 1, strike: 310, expiration: isoDay(21), entryPerShare: 10.07, mark: 19.85, delta: -0.42, gamma: 0.008, vega: 0.47, theta: 0.46, iv: 0.52, breakeven: 299.93, underlyingPrice: 317.36, underlyingChange: 21.38, underlyingClose: 295.98, underlyingLive: 317.36, dayValueChange: 898.0, bbSigma: -1.1, chanceOfProfitShort: 0.58, openedAt: isoDay(-14), erDate: EXAMPLE_EARNINGS.COHR },
        { id: "ex-o17", kind: "csp", symbol: "LRCX", optionType: "put", side: "short", qty: 1, strike: 270, expiration: isoDay(21), entryPerShare: 9.14, mark: 10.07, delta: -0.33, gamma: 0.006, vega: 0.51, theta: 0.38, iv: 0.41, breakeven: 260.86, underlyingPrice: 288.11, underlyingChange: 18.80, underlyingClose: 269.31, underlyingLive: 288.11, dayValueChange: 620.4, bbSigma: -0.3, chanceOfProfitShort: 0.67, openedAt: isoDay(-11), erDate: EXAMPLE_EARNINGS.LRCX },
        { id: "ex-o18", kind: "csp", symbol: "CRDO", optionType: "put", side: "short", qty: 1, strike: 160, expiration: isoDay(14), entryPerShare: 5.51, mark: 8.41, delta: -0.30, gamma: 0.007, vega: 0.33, theta: 1.26, iv: 0.68, breakeven: 154.49, underlyingPrice: 175.89, underlyingChange: 7.64, underlyingClose: 168.25, underlyingLive: 175.89, dayValueChange: 229.2, bbSigma: -0.7, chanceOfProfitShort: 0.70, openedAt: isoDay(-7), erDate: EXAMPLE_EARNINGS.CRDO },
        // Through its strike — lands in the Assignment-risk bucket.
        { id: "ex-o19", kind: "csp", symbol: "CCL", optionType: "put", side: "short", qty: 1, strike: 22.5, expiration: isoDay(28), entryPerShare: 0.46, mark: 1.11, delta: -0.53, gamma: 0.09, vega: 0.03, theta: 0.02, iv: 0.44, breakeven: 22.04, underlyingPrice: 21.84, underlyingChange: -0.33, underlyingClose: 22.17, underlyingLive: 21.84, dayValueChange: -17.5, bbSigma: -1.5, chanceOfProfitShort: 0.47, openedAt: isoDay(-16), erDate: EXAMPLE_EARNINGS.CCL },
        // Most of the premium already harvested — remaining yield annualizes ~22%, so
        // this one reads as Rollable.
        { id: "ex-o20", kind: "csp", symbol: "DRAM", optionType: "put", side: "short", qty: 1, strike: 49, expiration: isoDay(28), entryPerShare: 1.54, mark: 0.84, delta: -0.13, gamma: 0.02, vega: 0.07, theta: 0.04, iv: 0.56, breakeven: 47.46, underlyingPrice: 59.61, underlyingChange: 1.83, underlyingClose: 57.78, underlyingLive: 59.61, dayValueChange: 23.8, bbSigma: -1.3, chanceOfProfitShort: 0.87, openedAt: isoDay(-22), erDate: null },
        // Five contracts against the 500 SOFI shares — fully covered. The strike sits
        // below the 25 cost basis, so the Stocks page will show it as a call written
        // under water rather than one that exits at a gain.
        { id: "ex-o21", kind: "covered-call", symbol: "SOFI", optionType: "call", side: "short", qty: 5, strike: 18.5, expiration: isoDay(20), entryPerShare: 0.56, mark: 0.37, delta: 0.28, gamma: 0.06, vega: 0.02, theta: 0.012, iv: 0.55, breakeven: 19.06, underlyingPrice: 16.96, underlyingChange: 0.23, underlyingClose: 16.73, underlyingLive: 16.96, dayValueChange: -32.2, bbSigma: 1.9, chanceOfProfitShort: 0.72, openedAt: isoDay(-13) },
        { id: "ex-o4", kind: "leap-call", symbol: "NVDA", optionType: "call", side: "long", qty: 2, strike: 185, expiration: isoDay(146), entryPerShare: 35.72, mark: 49.90, delta: 0.71, gamma: 0.004, vega: 0.82, theta: -0.09, iv: 0.47, breakeven: 220.72, underlyingPrice: 222.27, underlyingChange: 2.93, underlyingClose: 219.34, underlyingLive: 222.27, dayValueChange: 416.1, bbSigma: 0.7, openedAt: isoDay(-194) },
        { id: "ex-o5", kind: "leap-put-hedge", symbol: "SMH", optionType: "put", side: "long", qty: 1, strike: 530, expiration: isoDay(209), entryPerShare: 31.69, mark: 25.15, delta: -0.31, gamma: 0.002, vega: 1.42, theta: -0.11, iv: 0.29, breakeven: 498.31, underlyingPrice: 573.00, underlyingChange: 12.39, underlyingClose: 560.61, underlyingLive: 573.00, dayValueChange: -384.1, bbSigma: 0.9, openedAt: isoDay(-143) },
        { id: "ex-o6", kind: "covered-call", symbol: "AAPL", optionType: "call", side: "short", qty: 2, strike: 340, expiration: isoDay(20), entryPerShare: 6.63, mark: 4.72, delta: 0.32, gamma: 0.008, vega: 0.41, theta: 0.12, iv: 0.26, breakeven: 346.63, underlyingPrice: 336.13, underlyingChange: -0.87, underlyingClose: 337.00, underlyingLive: 336.13, dayValueChange: 55.7, bbSigma: 1.5, chanceOfProfitShort: 0.68, openedAt: isoDay(-35) },
        { id: "ex-o7", kind: "put-spread", symbol: "GOOGL", optionType: "put", side: "short", qty: 1, strike: 330, expiration: isoDay(34), entryPerShare: 11.55, mark: 8.16, delta: -0.31, gamma: 0.005, vega: 0.62, theta: 0.17, iv: 0.31, breakeven: 318.45, underlyingPrice: 349.54, underlyingChange: 2.21, underlyingClose: 347.33, underlyingLive: 349.54, dayValueChange: 68.5, bbSigma: 0.4, chanceOfProfitShort: 0.69, openedAt: isoDay(-39) },
        { id: "ex-o8", kind: "put-spread", symbol: "GOOGL", optionType: "put", side: "long", qty: 1, strike: 320, expiration: isoDay(34), entryPerShare: 7.30, mark: 4.96, delta: -0.19, gamma: 0.004, vega: 0.48, theta: -0.11, iv: 0.33, breakeven: 312.70, underlyingPrice: 349.54, underlyingChange: 2.21, underlyingClose: 347.33, underlyingLive: 349.54, dayValueChange: -42.0, bbSigma: 0.1, openedAt: isoDay(-39) },
        { id: "ex-o9", kind: "call-spread", symbol: "NVDA", optionType: "call", side: "short", qty: 2, strike: 235, expiration: isoDay(34), entryPerShare: 8.69, mark: 7.14, delta: 0.38, gamma: 0.006, vega: 0.55, theta: 0.14, iv: 0.45, breakeven: 243.69, underlyingPrice: 222.27, underlyingChange: 2.93, underlyingClose: 219.34, underlyingLive: 222.27, dayValueChange: -222.7, bbSigma: 0.7, chanceOfProfitShort: 0.62, openedAt: isoDay(-51) },
        { id: "ex-o10", kind: "call-spread", symbol: "NVDA", optionType: "call", side: "long", qty: 2, strike: 250, expiration: isoDay(34), entryPerShare: 5.28, mark: 4.19, delta: 0.27, gamma: 0.005, vega: 0.47, theta: -0.10, iv: 0.47, breakeven: 255.28, underlyingPrice: 222.27, underlyingChange: 2.93, underlyingClose: 219.34, underlyingLive: 222.27, dayValueChange: 158.2, bbSigma: 0.7, openedAt: isoDay(-51) },
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
        totalValue: 65691,
        equityValue: 50177,
        optionsValue: -986,
        cryptoValue: 0,
        cash: 16500,
        buyingPower: 16500,
        optionsBuyingPower: 16500,
      },
      equities: [
        { symbol: "GOOGL", name: "Alphabet", qty: 100, avgCost: 261, price: 349.54, dayChange: 2.21, bbSigma: 0.4, priceHistory: [332.60, 338.50, 349.39, 344.98, 342.87, 347.33, 349.54], gamma: { flip: 350, callWall: 370, putWall: 330, net: "pos" }, coveredCalls: [ { targetDte: 21, dte: 21, strike: 370, delta: 0.28, mark: 6.18, premPct: 1.77, annPct: 31, oi: 12800, bbSigma: 1.5 } ] },
        { symbol: "AMZN", name: "Amazon", qty: 60, avgCost: 192, price: 253.71, dayChange: 2.52, bbSigma: 0.5, priceHistory: [251.89, 256.78, 253.54, 248.42, 245.96, 251.19, 253.71] },
      ],
      options: [
        { id: "ex-ira1", kind: "csp", symbol: "TSM", optionType: "put", side: "short", qty: 1, strike: 410, expiration: isoDay(27), entryPerShare: 12.24, mark: 9.86, delta: -0.26, gamma: 0.003, vega: 0.71, theta: 0.24, iv: 0.37, breakeven: 397.76, underlyingPrice: 434.67, underlyingChange: 4.41, underlyingClose: 430.26, underlyingLive: 434.67, dayValueChange: 114.7, bbSigma: -0.4, chanceOfProfitShort: 0.74, openedAt: isoDay(-36), erDate: EXAMPLE_EARNINGS.TSM },
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
    { id: "ex-c1", symbol: "SOFI", name: "SoFi Technologies", strike: 15.5, expiration: isoDay(-8), openedAt: isoDay(-53), closedAt: isoDay(-8), contracts: 2, creditPerShare: 0.36, creditReceived: 72, costToClose: 0, realizedPnl: 72, outcome: "expired", daysHeld: 45, collateral: 3100, returnOnCollateral: 0.0232, annualized: 0.188 },
    { id: "ex-c2", symbol: "MU", name: "Micron Technology", strike: 850, expiration: isoDay(-12), openedAt: isoDay(-57), closedAt: isoDay(-19), contracts: 1, creditPerShare: 18.61, creditReceived: 1861, costToClose: 553, realizedPnl: 1308, outcome: "closed_profit", daysHeld: 38, collateral: 85000, returnOnCollateral: 0.0154, annualized: 0.148 },
    { id: "ex-c3", symbol: "NVDA", name: "NVIDIA", strike: 180, expiration: isoDay(-34), openedAt: isoDay(-77), closedAt: isoDay(-34), contracts: 1, creditPerShare: 3.08, creditReceived: 308, costToClose: 0, realizedPnl: 308, outcome: "expired", daysHeld: 43, collateral: 18000, returnOnCollateral: 0.0171, annualized: 0.145 },
    { id: "ex-c4", symbol: "SOFI", name: "SoFi Technologies", strike: 16, expiration: isoDay(-61), openedAt: isoDay(-96), closedAt: isoDay(-61), contracts: 3, creditPerShare: 0.33, creditReceived: 99, costToClose: 0, realizedPnl: 99, outcome: "expired", daysHeld: 35, collateral: 4800, returnOnCollateral: 0.0206, annualized: 0.215 },
    { id: "ex-c5", symbol: "CLS", name: "Celestica", strike: 340, expiration: isoDay(-89), openedAt: isoDay(-120), closedAt: isoDay(-96), contracts: 1, creditPerShare: 6.57, creditReceived: 657, costToClose: 128, realizedPnl: 529, outcome: "closed_profit", daysHeld: 24, collateral: 34000, returnOnCollateral: 0.0156, annualized: 0.237 },
    { id: "ex-c6", symbol: "INTC", name: "Intel", strike: 85, expiration: isoDay(-3), openedAt: isoDay(-31), closedAt: isoDay(-3), contracts: 4, creditPerShare: 1.38, creditReceived: 552, costToClose: 0, realizedPnl: 552, outcome: "expired", daysHeld: 28, collateral: 34000, returnOnCollateral: 0.0162, annualized: 0.212 },
    { id: "ex-c7", symbol: "IREN", name: "IREN", strike: 36, expiration: isoDay(-8), openedAt: isoDay(-45), closedAt: isoDay(-15), contracts: 3, creditPerShare: 1.05, creditReceived: 315, costToClose: 21, realizedPnl: 294, outcome: "closed_profit", daysHeld: 30, collateral: 10800, returnOnCollateral: 0.0272, annualized: 0.331 },
    { id: "ex-c8", symbol: "GLW", name: "Corning", strike: 145, expiration: isoDay(-6), openedAt: isoDay(-40), closedAt: isoDay(-6), contracts: 2, creditPerShare: 2.03, creditReceived: 406, costToClose: 0, realizedPnl: 406, outcome: "expired", daysHeld: 34, collateral: 29000, returnOnCollateral: 0.014, annualized: 0.15 },
  ],
};

export const exampleLeapFile: ClosedLeapFile = {
  meta: META,
  closed: [
    { id: "ex-l1", symbol: "NVDA", name: "NVIDIA", optionType: "call", strike: 145, expiration: isoDay(-66), openedAt: isoDay(-215), closedAt: isoDay(-90), contracts: 1, entryPerShare: 59.75, costBasis: 5975, proceeds: 7449, realizedPnl: 1474, outcome: "closed_profit", daysHeld: 125, returnPct: 0.247, annualized: 0.72 },
    { id: "ex-l2", symbol: "GOOGL", name: "Alphabet", optionType: "call", strike: 230, expiration: isoDay(146), openedAt: isoDay(-179), closedAt: isoDay(-110), contracts: 1, entryPerShare: 86.58, costBasis: 8658, proceeds: 16957, realizedPnl: 8299, outcome: "closed_profit", daysHeld: 69, returnPct: 0.959, annualized: 5.07 },
    { id: "ex-l3", symbol: "AAPL", name: "Apple", optionType: "call", strike: 200, expiration: isoDay(118), openedAt: isoDay(-170), closedAt: isoDay(-78), contracts: 1, entryPerShare: 76.39, costBasis: 7639, proceeds: 12552, realizedPnl: 4913, outcome: "closed_profit", daysHeld: 92, returnPct: 0.643, annualized: 2.55 },
  ],
};

export const exampleCoveredFile: ClosedCoveredFile = {
  meta: META,
  closed: [
    { id: "ex-cc1", symbol: "AAPL", name: "Apple", strike: 340, expiration: isoDay(-11), openedAt: isoDay(-42), closedAt: isoDay(-11), contracts: 2, creditPerShare: 2.29, creditReceived: 458, costToClose: 0, realizedPnl: 458, outcome: "expired", daysHeld: 31, returnOnNotional: 0.0067, annualized: 0.079 },
    { id: "ex-cc2", symbol: "CLS", name: "Celestica", strike: 350, expiration: isoDay(-25), openedAt: isoDay(-48), closedAt: isoDay(-25), contracts: 1, creditPerShare: 4.18, creditReceived: 418, costToClose: 0, realizedPnl: 418, outcome: "expired", daysHeld: 23, returnOnNotional: 0.0119, annualized: 0.19 },
    { id: "ex-cc3", symbol: "NVDA", name: "NVIDIA", strike: 210, expiration: isoDay(-52), openedAt: isoDay(-82), closedAt: isoDay(-67), contracts: 1, creditPerShare: 2.11, creditReceived: 211, costToClose: 406, realizedPnl: -195, outcome: "closed_loss", daysHeld: 15, returnOnNotional: -0.0093, annualized: -0.226 },
    { id: "ex-cc4", symbol: "INTC", name: "Intel", strike: 110, expiration: isoDay(-9), openedAt: isoDay(-34), closedAt: isoDay(-9), contracts: 2, creditPerShare: 1.18, creditReceived: 236, costToClose: 0, realizedPnl: 236, outcome: "expired", daysHeld: 25, returnOnNotional: 0.0107, annualized: 0.157 },
  ],
};

export const exampleSpreadFile: ClosedSpreadFile = {
  meta: META,
  closed: [
    { id: "ex-s1", symbol: "GOOGL", name: "Alphabet", optionType: "put", shortStrike: 310, longStrike: 290, width: 20, expiration: isoDay(-14), openedAt: isoDay(-52), closedAt: isoDay(-14), contracts: 1, isCredit: true, netCreditPerShare: 5.6, netOpen: 560, netClose: 0, realizedPnl: 560, maxRisk: 1440, outcome: "closed_profit", daysHeld: 38, returnOnRisk: 0.389, annualized: 3.74 },
    { id: "ex-s2", symbol: "NVDA", name: "NVIDIA", optionType: "call", shortStrike: 225, longStrike: 235, width: 10, expiration: isoDay(-58), openedAt: isoDay(-90), closedAt: isoDay(-65), contracts: 2, isCredit: true, netCreditPerShare: 2.8, netOpen: 560, netClose: 200, realizedPnl: 360, maxRisk: 1440, outcome: "closed_profit", daysHeld: 25, returnOnRisk: 0.25, annualized: 3.65 },
    { id: "ex-s3", symbol: "AAPL", name: "Apple", optionType: "put", shortStrike: 290, longStrike: 270, width: 20, expiration: isoDay(-21), openedAt: isoDay(-48), closedAt: isoDay(-21), contracts: 1, isCredit: true, netCreditPerShare: 5.6, netOpen: 560, netClose: 0, realizedPnl: 560, maxRisk: 1440, outcome: "closed_profit", daysHeld: 27, returnOnRisk: 0.389, annualized: 5.26 },
  ],
};

export const exampleStockFile: ClosedStockFile = {
  meta: META,
  closed: [
    { id: "ex-st1", symbol: "NVDA", name: "NVIDIA", side: "long", shares: 100, avgOpen: 219.44, avgClose: 225.16, costBasis: 21944, proceeds: 22516, realizedPnl: 572, outcome: "closed_profit", openedAt: isoDay(-131), closedAt: isoDay(-36), daysHeld: 95, returnPct: 0.026, annualized: 0.1 },
    { id: "ex-st2", symbol: "MU", name: "Micron Technology", side: "long", shares: 10, avgOpen: 1020.76, avgClose: 920.95, costBasis: 10208, proceeds: 9210, realizedPnl: -998, outcome: "closed_loss", openedAt: isoDay(-95), closedAt: isoDay(-57), daysHeld: 38, returnPct: -0.098, annualized: -0.94 },
    { id: "ex-st3", symbol: "AAPL", name: "Apple", side: "long", shares: 50, avgOpen: 304.99, avgClose: 316.22, costBasis: 15250, proceeds: 15811, realizedPnl: 562, outcome: "closed_profit", openedAt: isoDay(-121), closedAt: isoDay(-11), daysHeld: 110, returnPct: 0.037, annualized: 0.12 },
    { id: "ex-st4", symbol: "SOFI", name: "SoFi Technologies", side: "long", shares: 300, avgOpen: 17.74, avgClose: 17.65, costBasis: 5322, proceeds: 5295, realizedPnl: -27, outcome: "closed_loss", openedAt: isoDay(-109), closedAt: isoDay(-5), daysHeld: 104, returnPct: -0.005, annualized: -0.02 },
    { id: "ex-st5", symbol: "CLS", name: "Celestica", side: "long", shares: 60, avgOpen: 354.78, avgClose: 371.15, costBasis: 21287, proceeds: 22269, realizedPnl: 982, outcome: "closed_profit", openedAt: isoDay(-72), closedAt: isoDay(-46), daysHeld: 26, returnPct: 0.046, annualized: 0.65 },
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
// to Yahoo in example mode; it returns this internally-consistent
// series instead: real recent closes where the demo has them, on top of a walk seeded off the symbol so tickers
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
  let close = chartWalk(startValue, seed, CHART_DAYS);
  // Where real closes are on file, the recent stretch of the chart IS the real
  // tape, and the older synthetic part is scaled to run into it. The chart then
  // ends at the same price the rest of the demo quotes.
  const real = EXAMPLE_CLOSES[symbol];
  if (real?.length) {
    const tail = real.slice(-Math.min(real.length, CHART_DAYS - 1));
    const head = close.slice(0, CHART_DAYS - tail.length);
    const k = tail[0] / head[head.length - 1];
    close = [...head.map((v) => Math.round(v * k * 100) / 100), ...tail];
  }
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


