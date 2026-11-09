"use client";

// On-demand 2-year daily chart: candles + Bollinger Bands + 50/200-day SMA
// overlaid on the main pane (with golden/death cross markers where the two
// SMAs cross), call/put-wall + gamma-flip reference lines for held names, and
// MACD/RSI in their own panes underneath. Data comes from this app's own
// /api/chart route (see lib/chart-api.ts), computed fresh per search.
//
// Ported from jttyeung's fork (components/desktop/SecurityChart.tsx on her
// staging branch); the example-mode branch moved server-side into the route.
import { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  CrosshairMode,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import { Card } from "@/components/ui";
import { SensaTickerLinks } from "@/components/SensaLinks";
import { fetchChart, type ChartData } from "@/lib/chart-api";

const UP_COLOR = "#34d399";
const DOWN_COLOR = "#f87171";
// A distinct green from UP_COLOR — Call Wall used to share the exact same
// shade as up-candles/the Last Close line, which read as "one thing," not
// three. Teal reads as clearly green without being interchangeable with them.
const CALL_WALL_COLOR = "#0d9488";
const BAND_COLOR = "#60a5fa";
const SMA50_COLOR = "#c084fc";
const SMA200_COLOR = "#f59e0b";
const MACD_LINE_COLOR = "#60a5fa";
// Light gray, not orange — orange is also SMA200's color one pane up.
const MACD_SIGNAL_COLOR = "#9ca3af";
const RSI_COLOR = "#a78bfa";
const CHART_HEIGHT = 720; // total across the three panes; split 5:3:2 below

function toTime(dateStr: string): UTCTimestamp {
  // lightweight-charts wants a UTC seconds timestamp for a daily bar —
  // parsing as UTC midnight (not local) avoids an off-by-one-day shift
  // for anyone west of UTC.
  return (Date.parse(dateStr + "T00:00:00Z") / 1000) as UTCTimestamp;
}

export function SecurityChart({ watchlist, initialSymbol }: { watchlist: string[]; initialSymbol?: string }) {
  const [symbolInput, setSymbolInput] = useState(initialSymbol ?? "");
  const [activeSymbol, setActiveSymbol] = useState<string | null>(initialSymbol ?? null);
  const [data, setData] = useState<ChartData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  function search(symbol: string) {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    setActiveSymbol(s);
    setSymbolInput(s);
  }

  // A deep link that changes while this page is already mounted (the hold-a-
  // ticker gesture used from the chart page itself) re-runs the search.
  useEffect(() => {
    if (initialSymbol) search(initialSymbol);
  }, [initialSymbol]);

  useEffect(() => {
    if (!activeSymbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchChart(activeSymbol)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSymbol]);

  useEffect(() => {
    if (!data || !containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: "transparent" }, textColor: "#9ca3af" },
      grid: { vertLines: { color: "#27272a" }, horzLines: { color: "#27272a" } },
      rightPriceScale: { borderColor: "#3f3f46" },
      timeScale: { borderColor: "#3f3f46", timeVisible: false },
      // Magnet mode snaps the horizontal line to each bar's close instead of
      // tracking the cursor; Normal lets both lines follow the pointer.
      crosshair: { mode: CrosshairMode.Normal },
      // The container div has no CSS height of its own; lightweight-charts
      // sizes off this at creation time and the panes split it below.
      height: CHART_HEIGHT,
    });
    chartRef.current = chart;

    const times = data.dates.map(toTime);

    // --- Pane 0: candles + Bollinger Bands + SMAs + wall lines ---
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderVisible: false,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });
    candleSeries.setData(
      times.map((time, i) => ({
        time,
        open: data.open[i],
        high: data.high[i],
        low: data.low[i],
        close: data.close[i],
      })),
    );

    const bandSeries: ISeriesApi<"Line">[] = [];
    (["upper", "mid", "lower"] as const).forEach((key, idx) => {
      const s = chart.addSeries(LineSeries, {
        color: BAND_COLOR,
        lineWidth: 1,
        lineStyle: idx === 1 ? 2 : 0, // mid band dashed, upper/lower solid
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      s.setData(
        times
          .map((time, i) => ({ time, value: data.bollinger[i]?.[key] }))
          .filter((p): p is { time: UTCTimestamp; value: number } => p.value != null),
      );
      bandSeries.push(s);
    });

    const sma50Series = chart.addSeries(LineSeries, {
      color: SMA50_COLOR,
      lineWidth: 1,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    sma50Series.setData(
      times
        .map((time, i) => ({ time, value: data.sma50[i] }))
        .filter((p): p is { time: UTCTimestamp; value: number } => p.value != null),
    );

    const sma200Series = chart.addSeries(LineSeries, {
      color: SMA200_COLOR,
      lineWidth: 2,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    sma200Series.setData(
      times
        .map((time, i) => ({ time, value: data.sma200[i] }))
        .filter((p): p is { time: UTCTimestamp; value: number } => p.value != null),
    );

    // Golden cross (50-day SMA crossing above the 200-day) / death cross
    // (crossing below) — every occurrence in the window. Placed on the candle
    // series so the marker sits relative to real price action.
    const crossMarkers: SeriesMarker<UTCTimestamp>[] = data.crosses.map((c) => ({
      time: toTime(c.date),
      position: c.type === "golden" ? "belowBar" : "aboveBar",
      color: c.type === "golden" ? UP_COLOR : DOWN_COLOR,
      shape: c.type === "golden" ? "arrowUp" : "arrowDown",
      text: c.type === "golden" ? "✨ Golden Cross" : "💀 Death Cross",
    }));
    createSeriesMarkers(candleSeries, crossMarkers);

    for (const [price, title, color] of [
      [data.callWall, "Call Wall", CALL_WALL_COLOR],
      [data.putWall, "Put Wall", DOWN_COLOR],
      [data.gammaFlip, "Gamma Flip", "#a1a1aa"],
    ] as const) {
      if (price == null) continue;
      candleSeries.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: 3, // dotted
        axisLabelVisible: true,
        title,
      });
    }

    // --- Pane 1: MACD ---
    const histSeries = chart.addSeries(
      HistogramSeries,
      { color: "#52525b", priceLineVisible: false, lastValueVisible: false },
      1,
    );
    histSeries.setData(
      times
        .map((time, i) => {
          const v = data.macd.histogram[i];
          if (v == null) return null;
          return { time, value: v, color: v >= 0 ? UP_COLOR : DOWN_COLOR };
        })
        .filter((p): p is { time: UTCTimestamp; value: number; color: string } => p != null),
    );
    const macdLineSeries = chart.addSeries(LineSeries, { color: MACD_LINE_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, 1);
    macdLineSeries.setData(
      times
        .map((time, i) => ({ time, value: data.macd.line[i] }))
        .filter((p): p is { time: UTCTimestamp; value: number } => p.value != null),
    );
    const macdSignalSeries = chart.addSeries(LineSeries, { color: MACD_SIGNAL_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, 1);
    macdSignalSeries.setData(
      times
        .map((time, i) => ({ time, value: data.macd.signal[i] }))
        .filter((p): p is { time: UTCTimestamp; value: number } => p.value != null),
    );

    // --- Pane 2: RSI(14), with 30/70 reference lines ---
    const rsiSeries = chart.addSeries(LineSeries, { color: RSI_COLOR, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, 2);
    rsiSeries.setData(
      times
        .map((time, i) => ({ time, value: data.rsi14[i] }))
        .filter((p): p is { time: UTCTimestamp; value: number } => p.value != null),
    );
    rsiSeries.createPriceLine({ price: 70, color: "#52525b", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "70" });
    rsiSeries.createPriceLine({ price: 30, color: "#52525b", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "30" });

    // lightweight-charts v5 sizes panes by relative stretch factor; 5:3:2
    // (main:MACD:RSI) keeps MACD readable.
    const panes = chart.panes();
    if (panes[0]) panes[0].setStretchFactor(5);
    if (panes[1]) panes[1].setStretchFactor(3);
    if (panes[2]) panes[2].setStretchFactor(2);

    chart.timeScale().fitContent();

    const resize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

  // Nothing until at least one character is typed, then at most a handful of
  // prefix matches — enough to save typing without the dropdown swallowing
  // the screen on a phone.
  const suggestions = useMemo(() => {
    const q = symbolInput.trim().toUpperCase();
    if (!q) return [];
    return watchlist.filter((t) => t.startsWith(q) && t !== q).slice(0, 6);
  }, [watchlist, symbolInput]);

  const lastUp = data ? data.close[data.close.length - 1] >= data.open[data.open.length - 1] : true;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-1 py-2">
        <input
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && search(symbolInput)}
          placeholder="Search any ticker (e.g. GLW)"
          list="chart-watchlist-suggestions"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="w-48 rounded-md bg-surface-2 px-3 py-1.5 text-sm ring-1 ring-inset ring-border placeholder:text-muted"
        />
        <datalist id="chart-watchlist-suggestions">
          {suggestions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button
          onClick={() => search(symbolInput)}
          className="rounded-md bg-surface-2 px-3 py-1.5 text-sm font-medium ring-1 ring-inset ring-border active:opacity-70"
        >
          Chart
        </button>
        {loading && <span className="text-xs text-muted">loading…</span>}
        {error && <span className="text-xs text-rose-400">{error}</span>}
      </div>

      {data && (
        <Card className="mt-1 px-2 py-2">
          <div className="mb-1 flex items-center justify-between px-2 text-xs text-muted">
            <span className="min-w-0 truncate">
              <span className="font-medium text-text">{data.symbol}</span>
              {data.companyName && <span className="ml-1.5 truncate">{data.companyName}</span>}
            </span>
            <span className="tabular shrink-0">${data.spotPrice.toFixed(2)}</span>
          </div>
          {/* The same name on Sensa Market, one tap away from the chart the long-press lands on. */}
          <SensaTickerLinks symbol={data.symbol} className="mb-1.5 px-2" />
          <div className="mb-1 flex flex-wrap items-center gap-3 px-2 text-xs text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3" style={{ backgroundColor: SMA50_COLOR }} />
              SMA 50
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3" style={{ backgroundColor: SMA200_COLOR }} />
              SMA 200
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3" style={{ backgroundColor: BAND_COLOR }} />
              Bollinger 20
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3" style={{ backgroundColor: lastUp ? UP_COLOR : DOWN_COLOR }} />
              Last Close
            </span>
            {data.callWall == null && data.putWall == null && (
              <span className="text-[10px]">walls appear for held names (≥100 sh)</span>
            )}
          </div>
          <div ref={containerRef} />
        </Card>
      )}

      {!data && !loading && !error && (
        <Card className="mt-1 px-4 py-8 text-center text-sm text-muted">
          Search a ticker above for a 2-year daily chart with Bollinger Bands, MACD, RSI, 50/200-day SMA with
          golden/death cross markers, and call/put walls for names you hold.
        </Card>
      )}
    </div>
  );
}
