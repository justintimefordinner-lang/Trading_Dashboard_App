// Merge several accounts' data into one AccountData for the Combined View.
// Pure — no fs, no React — so the server resolver and any test share it.
//
// Rules:
// - summary: every dollar figure is summed.
// - equities: one row per symbol — shares summed, average cost share-weighted,
//   price and the per-symbol enrichments (covered-call ladders, gamma walls,
//   Bollinger σ, price history) taken from the first account that has them.
// - options: concatenated as-is; an identical contract held in two accounts
//   keeps both rows, with the second's id suffixed so React keys stay unique.
// - valueHistory: summed per label (date). An account missing a date carries
//   its last earlier value forward, so the curve doesn't dip where one bridge
//   simply hadn't written a point yet.
// - crypto: concatenated.
import type { AccountData, CryptoHolding, Equity, OptionPosition, PortfolioSummary, ValuePoint } from "./types";

function sumSummaries(parts: PortfolioSummary[]): PortfolioSummary {
  const out: PortfolioSummary = { totalValue: 0, equityValue: 0, optionsValue: 0, cryptoValue: 0, cash: 0, buyingPower: 0 };
  let obp: number | undefined;
  for (const s of parts) {
    out.totalValue += s.totalValue ?? 0;
    out.equityValue += s.equityValue ?? 0;
    out.optionsValue += s.optionsValue ?? 0;
    out.cryptoValue += s.cryptoValue ?? 0;
    out.cash += s.cash ?? 0;
    out.buyingPower += s.buyingPower ?? 0;
    if (s.optionsBuyingPower != null) obp = (obp ?? 0) + s.optionsBuyingPower;
  }
  if (obp != null) out.optionsBuyingPower = obp;
  return out;
}

function mergeEquities(parts: Equity[][]): Equity[] {
  const bySymbol = new Map<string, Equity & { _cost: number }>();
  for (const list of parts) {
    for (const e of list) {
      const key = e.symbol.toUpperCase();
      const cur = bySymbol.get(key);
      if (!cur) {
        bySymbol.set(key, { ...e, _cost: e.qty * e.avgCost });
        continue;
      }
      cur.qty += e.qty;
      cur._cost += e.qty * e.avgCost;
      cur.avgCost = cur.qty ? cur._cost / cur.qty : 0;
      // Keep the first non-empty enrichment; fill gaps from later accounts.
      cur.coveredCalls = cur.coveredCalls ?? e.coveredCalls;
      cur.gamma = cur.gamma ?? e.gamma;
      cur.bbSigma = cur.bbSigma ?? e.bbSigma;
      cur.priceHistory = cur.priceHistory ?? e.priceHistory;
      cur.dayChange = cur.dayChange ?? e.dayChange;
    }
  }
  return [...bySymbol.values()].map((row) => {
    const { _cost, ...e } = row;
    void _cost; // only needed while accumulating
    return e;
  });
}

function mergeOptions(parts: OptionPosition[][]): OptionPosition[] {
  const seen = new Map<string, number>();
  const out: OptionPosition[] = [];
  for (const list of parts) {
    for (const o of list) {
      const n = (seen.get(o.id) ?? 0) + 1;
      seen.set(o.id, n);
      out.push(n === 1 ? o : { ...o, id: `${o.id}#${n}` });
    }
  }
  return out;
}

function mergeHistory(parts: ValuePoint[][]): ValuePoint[] {
  const labels = new Set<string>();
  const maps = parts.map((list) => {
    const m = new Map<string, number>();
    for (const p of list) {
      m.set(p.label, p.value);
      labels.add(p.label);
    }
    return m;
  });
  const ordered = [...labels].sort();
  const carry = new Array<number>(maps.length).fill(0);
  return ordered.map((label) => {
    let total = 0;
    maps.forEach((m, i) => {
      const v = m.get(label);
      if (v != null) carry[i] = v;
      total += carry[i];
    });
    return { label, value: Math.round(total * 100) / 100 };
  });
}

export function combineAccountData(parts: AccountData[]): AccountData {
  const crypto = parts.flatMap((p) => p.crypto ?? []) as CryptoHolding[];
  return {
    summary: sumSummaries(parts.map((p) => p.summary)),
    equities: mergeEquities(parts.map((p) => p.equities)),
    options: mergeOptions(parts.map((p) => p.options)),
    valueHistory: mergeHistory(parts.map((p) => p.valueHistory ?? [])),
    ...(crypto.length > 0 ? { crypto } : {}),
  };
}
