// Signal events read off a ChartData — the same series the Chart-a-Ticker chart
// draws, so an alert always matches what the chart shows. Pure.
//
// One event per day a condition STARTS (a cross, not every day above/below):
//   cross     50-day SMA crossing the 200-day (golden / death)
//   sma200    close crossing the 200-day SMA
//   macd      MACD line crossing its signal line (12/26/9)
//   rsi       RSI(14) dropping under 30 / rising over 70
//   bollinger close finishing outside the 20-day, 2σ band
import type { ChartData } from "./chart-indicators";

export type SignalKind = "cross" | "sma200" | "macd" | "rsi" | "bollinger";

export interface SignalEvent {
  symbol: string;
  date: string; // YYYY-MM-DD, the bar the signal appeared on
  kind: SignalKind;
  dir: "bull" | "bear";
  label: string;
  detail: string;
  close: number;
}

export const SIGNAL_KINDS: { key: SignalKind; label: string }[] = [
  { key: "cross", label: "Golden / death cross" },
  { key: "sma200", label: "200-day" },
  { key: "macd", label: "MACD" },
  { key: "rsi", label: "RSI" },
  { key: "bollinger", label: "Bollinger" },
];

const f2 = (n: number) => n.toFixed(2);

/** Every signal on the last `lookback` bars, oldest first. */
export function detectSignals(d: ChartData, lookback = 20): SignalEvent[] {
  const out: SignalEvent[] = [];
  const n = d.close.length;
  const from = Math.max(1, n - lookback);
  const ev = (i: number, kind: SignalKind, dir: "bull" | "bear", label: string, detail: string) =>
    out.push({ symbol: d.symbol, date: d.dates[i], kind, dir, label, detail, close: d.close[i] });

  for (let i = from; i < n; i++) {
    const c = d.close[i], pc = d.close[i - 1];

    const s50 = d.sma50[i], s200 = d.sma200[i], p50 = d.sma50[i - 1], p200 = d.sma200[i - 1];
    if (s50 != null && s200 != null && p50 != null && p200 != null) {
      if (p50 <= p200 && s50 > s200) ev(i, "cross", "bull", "Golden cross", `50-day ${f2(s50)} crossed above the 200-day ${f2(s200)}`);
      else if (p50 >= p200 && s50 < s200) ev(i, "cross", "bear", "Death cross", `50-day ${f2(s50)} crossed below the 200-day ${f2(s200)}`);
    }

    if (s200 != null && p200 != null) {
      if (pc <= p200 && c > s200) ev(i, "sma200", "bull", "Above the 200-day", `Closed ${f2(c)}, above the 200-day ${f2(s200)}`);
      else if (pc >= p200 && c < s200) ev(i, "sma200", "bear", "Below the 200-day", `Closed ${f2(c)}, below the 200-day ${f2(s200)}`);
    }

    const ml = d.macd.line[i], ms = d.macd.signal[i], pl = d.macd.line[i - 1], ps = d.macd.signal[i - 1];
    if (ml != null && ms != null && pl != null && ps != null) {
      const zone = ml >= 0 ? "above zero" : "below zero";
      if (pl <= ps && ml > ms) ev(i, "macd", "bull", "MACD bullish cross", `MACD ${f2(ml)} crossed above its signal ${f2(ms)} (${zone})`);
      else if (pl >= ps && ml < ms) ev(i, "macd", "bear", "MACD bearish cross", `MACD ${f2(ml)} crossed below its signal ${f2(ms)} (${zone})`);
    }

    const r = d.rsi14[i], pr = d.rsi14[i - 1];
    if (r != null && pr != null) {
      if (pr >= 30 && r < 30) ev(i, "rsi", "bull", "RSI oversold", `RSI fell to ${r.toFixed(0)}, under 30`);
      else if (pr <= 70 && r > 70) ev(i, "rsi", "bear", "RSI overbought", `RSI rose to ${r.toFixed(0)}, over 70`);
    }

    const b = d.bollinger[i], pb = d.bollinger[i - 1];
    if (b && pb) {
      if (pc >= pb.lower && c < b.lower) ev(i, "bollinger", "bull", "Below the lower band", `Closed ${f2(c)}, under the lower band ${f2(b.lower)}`);
      else if (pc <= pb.upper && c > b.upper) ev(i, "bollinger", "bear", "Above the upper band", `Closed ${f2(c)}, over the upper band ${f2(b.upper)}`);
    }
  }
  return out;
}
