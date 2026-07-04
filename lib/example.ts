// A complete, self-consistent EXAMPLE portfolio used by "Example" mode so the
// app can be demoed to others without exposing real values. Every view is
// exercised: all option kinds, equities, crypto, a value history, and closed
// round-trips in each bucket spread across recent months (so charts populate).
// Numbers are invented but internally consistent (the summary adds up).
import type {
  Snapshot,
  ClosedCSPFile,
  ClosedLeapFile,
  ClosedCoveredFile,
  ClosedSpreadFile,
  ClosedStockFile,
} from "./types";

const ACC = "EX000000";

export const exampleSnapshot: Snapshot = {
  meta: { generatedAt: "2026-06-18T20:00:00Z", pricesAsOf: "2026-06-18 close", source: "example" },
  accounts: [
    { id: ACC, mask: "••••0000", type: "margin", brokerageType: "individual", nickname: "Example", isDefault: true },
  ],
  data: {
    [ACC]: {
      summary: {
        totalValue: 204760,
        equityValue: 114000,
        optionsValue: 8360,
        cryptoValue: 22400,
        cash: 60000,
        buyingPower: 75000,
        optionsBuyingPower: 120000,
      },
      equities: [
        { symbol: "AAPL", name: "Apple", qty: 200, avgCost: 150, price: 210 },
        { symbol: "MSFT", name: "Microsoft", qty: 60, avgCost: 350, price: 430 },
        { symbol: "NVDA", name: "NVIDIA", qty: 150, avgCost: 80, price: 128 },
        { symbol: "AMD", name: "Advanced Micro Devices", qty: 120, avgCost: 110, price: 135 },
        { symbol: "SOFI", name: "SoFi Technologies", qty: 800, avgCost: 9, price: 13.5 },
      ],
      crypto: [
        { symbol: "BTC", name: "Bitcoin", qty: 0.25, avgCost: 40000, price: 64000 },
        { symbol: "ETH", name: "Ethereum", qty: 2, avgCost: 2000, price: 3200 },
      ],
      options: [
        { id: "ex-o1", kind: "csp", symbol: "SOFI", optionType: "put", side: "short", qty: 2, strike: 12, expiration: "2026-08-21", entryPerShare: 0.55, mark: 0.3, delta: -0.22, theta: 0.01, iv: 0.52, breakeven: 11.45, underlyingPrice: 13.2, chanceOfProfitShort: 0.78, openedAt: "2026-06-02" },
        { id: "ex-o2", kind: "csp", symbol: "AMD", optionType: "put", side: "short", qty: 1, strike: 125, expiration: "2026-08-21", entryPerShare: 3.2, mark: 0.8, delta: -0.28, theta: 0.04, iv: 0.46, breakeven: 121.8, underlyingPrice: 138, chanceOfProfitShort: 0.72, openedAt: "2026-05-28" },
        { id: "ex-o3", kind: "leap-call", symbol: "NVDA", optionType: "call", side: "long", qty: 2, strike: 100, expiration: "2027-01-15", entryPerShare: 38, mark: 45, delta: 0.72, theta: -0.03, iv: 0.5, breakeven: 138, openedAt: "2026-02-10" },
        { id: "ex-o4", kind: "leap-put-hedge", symbol: "SPY", optionType: "put", side: "long", qty: 1, strike: 500, expiration: "2027-03-19", entryPerShare: 12, mark: 9, delta: -0.3, theta: -0.02, iv: 0.18, breakeven: 488, openedAt: "2026-04-01" },
        { id: "ex-o5", kind: "covered-call", symbol: "AAPL", optionType: "call", side: "short", qty: 2, strike: 230, expiration: "2026-08-21", entryPerShare: 4.2, mark: 3.1, delta: 0.34, theta: 0.05, iv: 0.28, breakeven: 234.2, underlyingPrice: 226, chanceOfProfitShort: 0.66, openedAt: "2026-06-05" },
        { id: "ex-o6", kind: "put-spread", symbol: "MSFT", optionType: "put", side: "short", qty: 1, strike: 400, expiration: "2026-09-18", entryPerShare: 6, mark: 4.2, delta: -0.3, theta: 0.03, iv: 0.3, breakeven: 394, openedAt: "2026-06-01" },
        { id: "ex-o7", kind: "put-spread", symbol: "MSFT", optionType: "put", side: "long", qty: 1, strike: 380, expiration: "2026-09-18", entryPerShare: 3, mark: 2, delta: -0.18, theta: 0.02, iv: 0.32, breakeven: 377, openedAt: "2026-06-01" },
        { id: "ex-o8", kind: "call-spread", symbol: "NVDA", optionType: "call", side: "short", qty: 2, strike: 140, expiration: "2026-09-18", entryPerShare: 5, mark: 6, delta: 0.4, theta: 0.04, iv: 0.48, breakeven: 145, openedAt: "2026-05-20" },
        { id: "ex-o9", kind: "call-spread", symbol: "NVDA", optionType: "call", side: "long", qty: 2, strike: 150, expiration: "2026-09-18", entryPerShare: 2.5, mark: 3.2, delta: 0.28, theta: 0.03, iv: 0.5, breakeven: 152.5, openedAt: "2026-05-20" },
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
        { label: "Apr", value: 194000 },
        { label: "May", value: 200000 },
        { label: "Jun", value: 204630 },
      ],
    },
  },
};

const META = { generatedAt: "2026-06-18T20:00:00Z", source: "example" as const };

export const exampleCspFile: ClosedCSPFile = {
  meta: META,
  closed: [
    { id: "ex-c1", symbol: "SOFI", name: "SoFi Technologies", strike: 11, expiration: "2026-02-20", openedAt: "2026-01-06", closedAt: "2026-02-20", contracts: 2, creditPerShare: 0.48, creditReceived: 96, costToClose: 0, realizedPnl: 96, outcome: "expired", daysHeld: 45, collateral: 2200, returnOnCollateral: 0.0436, annualized: 0.354 },
    { id: "ex-c2", symbol: "AMD", name: "Advanced Micro Devices", strike: 120, expiration: "2026-03-20", openedAt: "2026-02-02", closedAt: "2026-03-12", contracts: 1, creditPerShare: 3.0, creditReceived: 300, costToClose: 80, realizedPnl: 220, outcome: "closed_profit", daysHeld: 38, collateral: 12000, returnOnCollateral: 0.0183, annualized: 0.176 },
    { id: "ex-c3", symbol: "NVDA", name: "NVIDIA", strike: 95, expiration: "2026-04-17", openedAt: "2026-03-05", closedAt: "2026-04-17", contracts: 1, creditPerShare: 2.4, creditReceived: 240, costToClose: 0, realizedPnl: 240, outcome: "expired", daysHeld: 43, collateral: 9500, returnOnCollateral: 0.0253, annualized: 0.214 },
    { id: "ex-c4", symbol: "SOFI", name: "SoFi Technologies", strike: 12, expiration: "2026-05-15", openedAt: "2026-04-10", closedAt: "2026-05-15", contracts: 3, creditPerShare: 0.6, creditReceived: 180, costToClose: 0, realizedPnl: 180, outcome: "expired", daysHeld: 35, collateral: 3600, returnOnCollateral: 0.05, annualized: 0.521 },
    { id: "ex-c5", symbol: "AMD", name: "Advanced Micro Devices", strike: 130, expiration: "2026-06-19", openedAt: "2026-05-12", closedAt: "2026-06-05", contracts: 1, creditPerShare: 3.5, creditReceived: 350, costToClose: 520, realizedPnl: -170, outcome: "closed_loss", daysHeld: 24, collateral: 13000, returnOnCollateral: -0.0131, annualized: -0.199 },
  ],
};

export const exampleLeapFile: ClosedLeapFile = {
  meta: META,
  closed: [
    { id: "ex-l1", symbol: "NVDA", name: "NVIDIA", optionType: "call", strike: 70, expiration: "2026-06-18", openedAt: "2026-01-15", closedAt: "2026-05-20", contracts: 1, entryPerShare: 22, costBasis: 2200, proceeds: 5600, realizedPnl: 3400, outcome: "closed_profit", daysHeld: 125, returnPct: 1.545, annualized: 4.51 },
    { id: "ex-l2", symbol: "AMD", name: "Advanced Micro Devices", optionType: "call", strike: 90, expiration: "2027-01-15", openedAt: "2026-02-20", closedAt: "2026-04-30", contracts: 1, entryPerShare: 28, costBasis: 2800, proceeds: 2100, realizedPnl: -700, outcome: "closed_loss", daysHeld: 69, returnPct: -0.25, annualized: -0.83 },
    { id: "ex-l3", symbol: "AAPL", name: "Apple", optionType: "call", strike: 160, expiration: "2026-12-18", openedAt: "2026-03-01", closedAt: "2026-06-01", contracts: 1, entryPerShare: 30, costBasis: 3000, proceeds: 4200, realizedPnl: 1200, outcome: "closed_profit", daysHeld: 92, returnPct: 0.4, annualized: 1.59 },
  ],
};

export const exampleCoveredFile: ClosedCoveredFile = {
  meta: META,
  closed: [
    { id: "ex-cc1", symbol: "AAPL", name: "Apple", strike: 200, expiration: "2026-02-20", openedAt: "2026-01-20", closedAt: "2026-02-20", contracts: 2, creditPerShare: 3.0, creditReceived: 600, costToClose: 0, realizedPnl: 600, outcome: "expired", daysHeld: 31, returnOnNotional: 0.015, annualized: 0.177 },
    { id: "ex-cc2", symbol: "MSFT", name: "Microsoft", strike: 420, expiration: "2026-03-20", openedAt: "2026-02-25", closedAt: "2026-03-20", contracts: 1, creditPerShare: 5.0, creditReceived: 500, costToClose: 0, realizedPnl: 500, outcome: "expired", daysHeld: 23, returnOnNotional: 0.0119, annualized: 0.189 },
    { id: "ex-cc3", symbol: "NVDA", name: "NVIDIA", strike: 130, expiration: "2026-04-17", openedAt: "2026-03-18", closedAt: "2026-04-02", contracts: 1, creditPerShare: 4.0, creditReceived: 400, costToClose: 650, realizedPnl: -250, outcome: "closed_loss", daysHeld: 15, returnOnNotional: -0.0192, annualized: -0.468 },
    { id: "ex-cc4", symbol: "AMD", name: "Advanced Micro Devices", strike: 140, expiration: "2026-05-15", openedAt: "2026-04-20", closedAt: "2026-05-15", contracts: 1, creditPerShare: 3.5, creditReceived: 350, costToClose: 0, realizedPnl: 350, outcome: "expired", daysHeld: 25, returnOnNotional: 0.025, annualized: 0.365 },
  ],
};

export const exampleSpreadFile: ClosedSpreadFile = {
  meta: META,
  closed: [
    { id: "ex-s1", symbol: "MSFT", name: "Microsoft", optionType: "put", shortStrike: 400, longStrike: 380, width: 20, expiration: "2026-03-20", openedAt: "2026-02-10", closedAt: "2026-03-20", contracts: 1, isCredit: true, netCreditPerShare: 3.0, netOpen: 300, netClose: 0, realizedPnl: 300, maxRisk: 1700, outcome: "closed_profit", daysHeld: 38, returnOnRisk: 0.176, annualized: 1.7 },
    { id: "ex-s2", symbol: "NVDA", name: "NVIDIA", optionType: "call", shortStrike: 140, longStrike: 150, width: 10, expiration: "2026-04-17", openedAt: "2026-03-15", closedAt: "2026-04-10", contracts: 2, isCredit: true, netCreditPerShare: 2.5, netOpen: 500, netClose: 900, realizedPnl: -400, maxRisk: 1500, outcome: "closed_loss", daysHeld: 26, returnOnRisk: -0.267, annualized: -3.74 },
    { id: "ex-s3", symbol: "AAPL", name: "Apple", optionType: "put", shortStrike: 210, longStrike: 200, width: 10, expiration: "2026-05-15", openedAt: "2026-04-18", closedAt: "2026-05-15", contracts: 1, isCredit: true, netCreditPerShare: 2.2, netOpen: 220, netClose: 0, realizedPnl: 220, maxRisk: 780, outcome: "closed_profit", daysHeld: 27, returnOnRisk: 0.282, annualized: 3.81 },
  ],
};

export const exampleStockFile: ClosedStockFile = {
  meta: META,
  closed: [
    { id: "ex-st1", symbol: "NVDA", name: "NVIDIA", side: "long", shares: 100, avgOpen: 95, avgClose: 128, costBasis: 9500, proceeds: 12800, realizedPnl: 3300, outcome: "closed_profit", openedAt: "2026-01-10", closedAt: "2026-04-15", daysHeld: 95, returnPct: 0.347, annualized: 1.33 },
    { id: "ex-st2", symbol: "AMD", name: "Advanced Micro Devices", side: "long", shares: 100, avgOpen: 120, avgClose: 110, costBasis: 12000, proceeds: 11000, realizedPnl: -1000, outcome: "closed_loss", openedAt: "2026-02-15", closedAt: "2026-03-25", daysHeld: 38, returnPct: -0.083, annualized: -0.8 },
    { id: "ex-st3", symbol: "AAPL", name: "Apple", side: "long", shares: 50, avgOpen: 175, avgClose: 205, costBasis: 8750, proceeds: 10250, realizedPnl: 1500, outcome: "closed_profit", openedAt: "2026-01-20", closedAt: "2026-05-10", daysHeld: 110, returnPct: 0.171, annualized: 0.568 },
    { id: "ex-st4", symbol: "SOFI", name: "SoFi Technologies", side: "long", shares: 500, avgOpen: 9.5, avgClose: 13, costBasis: 4750, proceeds: 6500, realizedPnl: 1750, outcome: "closed_profit", openedAt: "2026-02-01", closedAt: "2026-06-01", daysHeld: 120, returnPct: 0.368, annualized: 1.12 },
    { id: "ex-st5", symbol: "MSFT", name: "Microsoft", side: "long", shares: 30, avgOpen: 410, avgClose: 395, costBasis: 12300, proceeds: 11850, realizedPnl: -450, outcome: "closed_loss", openedAt: "2026-03-10", closedAt: "2026-04-05", daysHeld: 26, returnPct: -0.0366, annualized: -0.51 },
  ],
};
