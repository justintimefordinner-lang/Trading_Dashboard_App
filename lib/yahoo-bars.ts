// Two years of daily OHLC from Yahoo Finance's public chart endpoint. Shared by
// the Chart-a-Ticker route and the signal alerts scan (the bridge has no
// on-request path and the app itself has no Schwab access).
//
// Server-only (network).
import type { Bars } from "./chart-indicators";

// Yahoo's chart JSON, only the parts read here.
interface YahooChart {
  chart?: {
    result?: {
      meta?: { longName?: string; shortName?: string; regularMarketPrice?: number; exchangeTimezoneName?: string };
      timestamp?: number[];
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }[] };
    }[];
    error?: { code?: string; description?: string } | null;
  };
}

export type YahooBars =
  | { bars: Bars; companyName?: string; spotPrice: number | null }
  | { error: string };

function toDateInZone(tsSec: number, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD; the exchange zone keeps a bar on its own trading day.
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(tsSec * 1000));
  } catch {
    return new Date(tsSec * 1000).toISOString().slice(0, 10);
  }
}

export async function fetchYahooBars(symbol: string): Promise<YahooBars> {
  const yf = symbol.replace(".", "-"); // Schwab's BRK.B is Yahoo's BRK-B
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yf)}?range=2y&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (portfolio-dashboard chart)", Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 404) return { error: `No price history for ${symbol}.` };
  if (!res.ok) return { error: `Yahoo Finance answered ${res.status} for ${symbol}.` };
  const json = (await res.json()) as YahooChart;
  const r = json.chart?.result?.[0];
  if (!r || json.chart?.error) return { error: json.chart?.error?.description ?? `No price history for ${symbol}.` };
  const q = r.indicators?.quote?.[0];
  const ts = r.timestamp ?? [];
  if (!q || ts.length === 0) return { error: `No price history for ${symbol}.` };

  const tz = r.meta?.exchangeTimezoneName || "America/New_York";
  const dates: string[] = [];
  const open: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const close: number[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue; // a holiday/partial bar
    dates.push(toDateInZone(ts[i], tz));
    open.push(o);
    high.push(h);
    low.push(l);
    close.push(c);
  }
  if (close.length < 30) return { error: `Not enough history to chart ${symbol}.` };
  return {
    bars: { dates, open, high, low, close },
    companyName: r.meta?.longName || r.meta?.shortName || undefined,
    spotPrice: r.meta?.regularMarketPrice ?? null,
  };
}
