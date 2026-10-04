// On-demand daily chart for one ticker: two years of OHLC from Yahoo Finance's
// public chart endpoint (the bridge has no on-request path — it runs on a
// timer — and the app itself has no Schwab access), every indicator computed
// here, and the dealer-gamma walls folded in from the bridge's snapshot when
// the ticker is one you hold. Example mode returns the synthetic fixture so a
// public demo never reaches out to Yahoo.
//
// GET /api/chart?symbol=GLW → ChartData (lib/chart-indicators.ts) or { error }.
import { isExampleMode } from "@/lib/example-mode";
import { exampleChartData } from "@/lib/example";
import { getSnapshot } from "@/lib/snapshot";
import { buildChartData, type ChartData } from "@/lib/chart-indicators";
import { fetchYahooBars } from "@/lib/yahoo-bars";

export const dynamic = "force-dynamic";

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const CACHE_TTL_MS = 10 * 60 * 1000; // Yahoo rate-limits; a chart doesn't change inside ten minutes
const cache = new Map<string, { at: number; data: ChartData }>();

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("symbol") ?? "";
  const symbol = raw.trim().toUpperCase();
  if (!TICKER_RE.test(symbol)) {
    return Response.json({ error: "Enter a ticker like GLW or BRK.B." }, { status: 400 });
  }

  if (await isExampleMode()) return Response.json(exampleChartData(symbol));

  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Response.json(hit.data);

  let fetched: Awaited<ReturnType<typeof fetchYahooBars>>;
  try {
    fetched = await fetchYahooBars(symbol);
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "Yahoo Finance timed out." : "Couldn't reach Yahoo Finance.";
    return Response.json({ error: msg }, { status: 502 });
  }
  if ("error" in fetched) return Response.json({ error: fetched.error }, { status: 404 });

  // Gamma walls: the bridge writes them onto held equities (≥100 shares) in the
  // snapshot, so a held name gets its walls for free; anything else has none.
  let walls: { callWall: number | null; putWall: number | null; gammaFlip: number | null } = { callWall: null, putWall: null, gammaFlip: null };
  try {
    const snap = await getSnapshot();
    for (const acct of Object.values(snap.data)) {
      const eq = acct.equities.find((e) => e.symbol.toUpperCase() === symbol && e.gamma);
      if (eq?.gamma) {
        walls = { callWall: eq.gamma.callWall, putWall: eq.gamma.putWall, gammaFlip: eq.gamma.flip };
        break;
      }
    }
  } catch {
    // no snapshot — chart without walls
  }

  const data = buildChartData(symbol, fetched.bars, {
    companyName: fetched.companyName,
    spotPrice: fetched.spotPrice,
    ...walls,
    asOf: new Date().toISOString(),
  });
  cache.set(symbol, { at: Date.now(), data });
  return Response.json(data);
}
