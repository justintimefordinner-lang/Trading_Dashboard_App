// Client-side call for the Chart-a-Ticker chart. Unlike jttyeung's fork, which
// talks to a separate chart daemon on its own port, this app serves the chart
// from its own route handler (app/api/chart/route.ts): same origin as the page,
// so it works from a phone over Tailscale, on the Pi, and on the Vercel demo
// alike with no extra process to run.
export type { BollingerPoint, ChartData, Cross } from "./chart-indicators";
import type { ChartData } from "./chart-indicators";

export async function fetchChart(symbol: string): Promise<ChartData> {
  const res = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
  let body: (ChartData & { error?: string }) | { error?: string } | null = null;
  try {
    body = (await res.json()) as ChartData & { error?: string };
  } catch {
    body = null;
  }
  if (!res.ok || !body || "error" in body && body.error) {
    throw new Error(body && "error" in body && body.error ? body.error : `chart failed for ${symbol} (${res.status})`);
  }
  return body as ChartData;
}
