"use client";

import { Fragment, type ReactNode } from "react";
import { usePersistentState } from "@/lib/view-state";
import { Card } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import type { VixAssessment, Regime, S5fiZone, S5fiTrend } from "@/lib/vix";

// ---------------------------------------------------------------------------
// Scale primitive — colored zone segments with the current value as a marker,
// zone labels aligned beneath each segment (active one highlighted).
// ---------------------------------------------------------------------------
type Zone = { upTo: number; color: string; label: string };

function ScaleBar({
  min,
  max,
  zones,
  value,
  tick,
}: {
  min: number;
  max: number;
  zones: Zone[];
  value: number | null;
  tick?: number; // optional reference line (e.g. 1.0 for IVTS, or VIX on a vol scale)
}) {
  const span = max - min || 1;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));
  const widths = zones.map((z, i) => {
    const lo = i === 0 ? min : zones[i - 1].upTo;
    return ((Math.min(z.upTo, max) - lo) / span) * 100;
  });
  const activeIdx =
    value == null ? -1 : zones.findIndex((z, i) => value < z.upTo || i === zones.length - 1);

  return (
    <div className="mt-2">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full">
        <div className="flex h-full w-full">
          {zones.map((z, i) => (
            <div key={i} className={z.color} style={{ width: `${widths[i]}%` }} />
          ))}
        </div>
        {tick != null && (
          <div
            className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-text/45"
            style={{ left: `${pos(tick)}%` }}
          />
        )}
        {value != null && (
          <div
            className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-1 ring-black/40"
            style={{ left: `${pos(value)}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex text-[8.5px] leading-tight">
        {zones.map((z, i) => (
          <div
            key={i}
            style={{ width: `${widths[i]}%` }}
            className={`px-0.5 text-center ${i === activeIdx ? "font-semibold text-text" : "text-muted"}`}
          >
            {z.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-indicator color helpers
// ---------------------------------------------------------------------------
const REGIME_TEXT: Record<Regime, string> = {
  "extreme-greed": "text-sky-300",
  greed: "text-sky-300",
  "slight-fear": "text-emerald-300",
  fear: "text-amber-300",
  "very-fear": "text-orange-300",
  "extreme-fear": "text-rose-300",
};

const VIX_ZONES: Zone[] = [
  { upTo: 12, color: "bg-sky-600/50", label: "<12" },
  { upTo: 15, color: "bg-sky-500/45", label: "12–15" },
  { upTo: 20, color: "bg-emerald-500/45", label: "15–20" },
  { upTo: 30, color: "bg-amber-500/45", label: "20–30" },
  { upTo: 40, color: "bg-rose-500/55", label: ">30" },
];

interface IndRow {
  key: string;
  name: string;
  meaning: string;
  available: boolean;
  value: string;
  band: string;
  valueColor: string;
  blurb: string;
  scale?: ReactNode;
  reading?: ReactNode; // color-coded "right now" interpretation
}

function buildRows(a: VixAssessment): IndRow[] {
  const rows: IndRow[] = [];
  const vix = a.vix;

  // 1 — VIX level
  rows.push({
    key: "vix",
    name: "VIX level",
    meaning: "Regime anchor — sets base reserve",
    available: true,
    value: vix.toFixed(2),
    band: a.regimeLabel,
    valueColor: REGIME_TEXT[a.regime],
    blurb:
      "The VIX is the market's expected 30-day volatility, priced from S&P 500 options. It's the anchor of the cash framework: low VIX means options are cheap and the crowd is complacent, so you hold more cash; high VIX means fear is elevated and premium is fat, so you deploy. Your reserve target steps directly off the band it lands in.",
    scale: <ScaleBar min={0} max={40} zones={VIX_ZONES} value={vix} />,
    reading: (
      <span className={REGIME_TEXT[a.regime]}>
        Now {vix.toFixed(2)} — {a.regimeLabel.toLowerCase()}.
      </span>
    ),
  });

  // 2 — Realized vol
  const rv = a.realizedVol;
  rows.push({
    key: "rv",
    name: "Realized vol",
    meaning: "Annualized SPY vol (20d) — the yardstick",
    available: rv != null,
    value: rv != null ? `${rv.toFixed(1)}%` : "n/a",
    band: rv != null ? `vs VIX ${vix.toFixed(1)}` : "",
    valueColor: "text-text",
    blurb:
      "Realized vol is how much the S&P 500 actually moved over the last 20 sessions, annualized. It's the yardstick implied vol is measured against — when the VIX (what option buyers pay) sits above realized (what actually happened), you're being overpaid to sell. The gap between the two is the VRP below. The line marks where the VIX sits on the same scale.",
    scale: rv != null ? <ScaleBar min={0} max={40} zones={VIX_ZONES} value={rv} tick={vix} /> : undefined,
    reading:
      rv != null ? (
        <span>
          Now {rv.toFixed(1)}% realized vs {vix.toFixed(1)} implied —{" "}
          <span className={vix - rv >= 1.5 ? "text-emerald-300" : "text-amber-300"}>
            {(vix - rv).toFixed(1)} pt gap
          </span>
          .
        </span>
      ) : undefined,
  });

  // 3 — VRP
  const vrp = a.vrp;
  const edgeColor = a.edge === "fat" ? "text-emerald-300" : a.edge === "ok" ? "text-sky-300" : "text-rose-300";
  rows.push({
    key: "vrp",
    name: "VRP (VIX − RV)",
    meaning: "The edge — is the premium worth selling?",
    available: vrp != null,
    value: vrp != null ? `${vrp >= 0 ? "+" : ""}${vrp.toFixed(1)} pts` : "n/a",
    band: a.edge ?? "",
    valueColor: vrp != null ? edgeColor : "text-text",
    blurb:
      "Variance risk premium — the VIX minus realized vol, in points. It's the edge: positive means implied is richer than realized, so selling premium pays. Thin (under 1.5) means the cushion has compressed; fat (over 4) means you're well paid. Negative means you'd be underpaid for the risk you're taking — stand down.",
    scale:
      vrp != null ? (
        <ScaleBar
          min={-4}
          max={10}
          value={vrp}
          tick={0}
          zones={[
            { upTo: 1.5, color: "bg-rose-500/50", label: "thin" },
            { upTo: 4, color: "bg-sky-500/45", label: "ok" },
            { upTo: 10, color: "bg-emerald-500/45", label: "fat" },
          ]}
        />
      ) : undefined,
    reading:
      vrp != null ? (
        <span className={edgeColor}>
          Now {vrp >= 0 ? "+" : ""}
          {vrp.toFixed(1)} pts — {a.edge} edge.
        </span>
      ) : undefined,
  });

  // 4 — IVTS
  const ivts = a.ivts;
  const back = ivts != null && ivts > 1.0;
  const ivtsColor = ivts == null ? "text-text" : back ? (ivts > 1.1 ? "text-rose-300" : "text-amber-300") : "text-emerald-300";
  rows.push({
    key: "ivts",
    name: "IVTS (VIX/VIX3M)",
    meaning: "Term structure — over 1.0 = backwardation",
    available: ivts != null,
    value: ivts != null ? ivts.toFixed(3) : "n/a",
    band: a.termStructure ? a.termStructure.replace("_", " ") : "",
    valueColor: ivtsColor,
    blurb:
      "Term structure — the 30-day VIX divided by the 3-month. Below 1.0 (contango) is the normal, calm state: near-term vol is cheaper than longer-dated. Above 1.0 (backwardation) means near-term fear has spiked above the horizon — acute stress, and historically the better moment to lean in once it starts to roll back over.",
    scale:
      ivts != null ? (
        <ScaleBar
          min={0.8}
          max={1.2}
          value={ivts}
          tick={1.0}
          zones={[
            { upTo: 0.9, color: "bg-emerald-600/50", label: "deep contango" },
            { upTo: 1.0, color: "bg-emerald-500/40", label: "contango" },
            { upTo: 1.1, color: "bg-amber-500/45", label: "backwardation" },
            { upTo: 1.2, color: "bg-rose-500/55", label: "deep" },
          ]}
        />
      ) : undefined,
    reading:
      ivts != null ? (
        <span className={ivtsColor}>
          Now {ivts.toFixed(3)} — {(a.termStructure ?? "").replace("_", " ")}
          {back ? " (near-term stress)" : " (calm)"}.
        </span>
      ) : undefined,
  });

  // 5 — VIX9D
  const v9 = a.vix9d;
  const frontLoaded = v9 != null && v9 > vix;
  rows.push({
    key: "vix9d",
    name: "VIX9D (9-day)",
    meaning: "Near-term vol — above VIX = front-end stress",
    available: v9 != null,
    value: v9 != null ? v9.toFixed(2) : "n/a",
    band: v9 != null ? (frontLoaded ? "front-loaded" : "calm front") : "",
    valueColor: v9 == null ? "text-text" : frontLoaded ? "text-amber-300" : "text-emerald-300",
    blurb:
      "The 9-day VIX — implied vol for the coming ~two weeks. Read it against the 30-day VIX: below it (the normal upward slope) means no acute near-term catalyst is priced; above it means the market sees a near-term event or shock and is bidding short-dated protection. A useful early flag, but secondary to the 30-day framework. The line marks the 30-day VIX.",
    scale: v9 != null ? <ScaleBar min={0} max={40} zones={VIX_ZONES} value={v9} tick={vix} /> : undefined,
    reading:
      v9 != null ? (
        <span className={frontLoaded ? "text-amber-300" : "text-emerald-300"}>
          Now {v9.toFixed(2)} vs VIX {vix.toFixed(2)} — {frontLoaded ? "front-loaded, near-term stress" : "calm front end"}.
        </span>
      ) : undefined,
  });

  // 6 — VVIX
  const vv = a.vvix;
  const sm = a.sizeMultiplier;
  const vvColor =
    vv == null ? "text-text" : sm === 1 ? "text-emerald-300" : sm === 0.75 ? "text-amber-300" : sm === 0.5 ? "text-orange-300" : "text-rose-300";
  rows.push({
    key: "vvix",
    name: "VVIX",
    meaning: "Vol-of-vol — the tail governor / size cap",
    available: vv != null,
    value: vv != null ? vv.toFixed(1) : "n/a",
    band: vv != null && sm != null ? `size ×${sm}` : "",
    valueColor: vvColor,
    blurb:
      "Vol-of-vol — how fast the VIX itself moves, priced from options on the VIX. It's the tail governor on size: a calm vol surface lets you run full size, but a jumpy one means the next spike could be violent, so the framework trims. The steps: under 90 → full size (×1); 90–110 → ×0.75; 110–120 → ×0.5; above 120 → ×0.25. It caps how much you put on, not whether — direction is still the VIX's call. VVIX usually runs in the 90s–100s, so a reading in the 80s is on the calm side.",
    scale:
      vv != null ? (
        <ScaleBar
          min={70}
          max={140}
          value={vv}
          zones={[
            { upTo: 90, color: "bg-emerald-500/45", label: "×1" },
            { upTo: 110, color: "bg-amber-500/45", label: "×0.75" },
            { upTo: 120, color: "bg-orange-500/50", label: "×0.5" },
            { upTo: 140, color: "bg-rose-500/55", label: "×0.25" },
          ]}
        />
      ) : undefined,
    reading:
      vv != null ? (
        <span className={vvColor}>
          Now {vv.toFixed(1)} — full size cap ×{sm}.
        </span>
      ) : undefined,
  });

  // 7 — SKEW
  const sk = a.skew;
  const skColor = sk == null ? "text-text" : sk >= 150 ? "text-rose-300" : sk >= 135 ? "text-amber-300" : "text-emerald-300";
  rows.push({
    key: "skew",
    name: "SKEW",
    meaning: "Crash-hedge pricing — how bid the left tail is",
    available: sk != null,
    value: sk != null ? sk.toFixed(0) : "n/a",
    band: sk != null ? (sk >= 150 ? "rich tail bid" : sk >= 135 ? "elevated" : "normal") : "",
    valueColor: skColor,
    blurb:
      "CBOE SKEW prices the left tail — how much extra traders pay for far-out-of-the-money crash puts versus at-the-money options. Around 100 is a normal bell curve; higher means fatter tail risk is being priced in. Treat it as context, not a trigger: SKEW is noisy and can stay elevated for long stretches, so weight it lightly.",
    scale:
      sk != null ? (
        <ScaleBar
          min={100}
          max={170}
          value={sk}
          zones={[
            { upTo: 135, color: "bg-emerald-500/45", label: "normal" },
            { upTo: 150, color: "bg-amber-500/45", label: "elevated" },
            { upTo: 170, color: "bg-rose-500/55", label: "rich" },
          ]}
        />
      ) : undefined,
    reading:
      sk != null ? (
        <span className={skColor}>
          Now {sk.toFixed(0)} — {sk >= 150 ? "rich tail bid" : sk >= 135 ? "elevated tail pricing" : "normal tail pricing"}.
        </span>
      ) : undefined,
  });

  // 8 — S5FI (breadth: % of S&P 500 above their 50-day SMA)
  const s5 = a.s5fi;
  const s5zone = a.s5fiZone;
  const s5trend = a.s5fiTrend;
  const S5_ZONE_COLOR: Record<S5fiZone, string> = {
    oversold: "text-emerald-300",
    rebuilding: "text-sky-300",
    noTrend: "text-amber-300",
    constructive: "text-sky-300",
    overbought: "text-rose-300",
  };
  const S5_ZONE_BAND: Record<S5fiZone, string> = {
    oversold: "oversold",
    rebuilding: "rebuilding",
    noTrend: "no trend",
    constructive: "constructive",
    overbought: "overbought",
  };
  const S5_ZONE_READ: Record<S5fiZone, string> = {
    oversold: "oversold — a mean-reversion buying zone",
    rebuilding: "below the danger zone, breadth rebuilding",
    noTrend: "no-trend chop — breadth gives no edge",
    constructive: "broad participation",
    overbought: "overbought — shore up cash",
  };
  const S5_TREND_READ: Record<S5fiTrend, string> = {
    strength: "rising (market strength)",
    sideways: "flat (sideways)",
    weakness: "falling (market weakness)",
  };
  const S5_TREND_SHORT: Record<S5fiTrend, string> = {
    strength: "rising",
    sideways: "flat",
    weakness: "falling",
  };
  const s5weekly = a.s5fiWeekly;
  const s5slope = a.s5fiSlopeWk;
  const s5slopeColor = s5slope == null ? "text-muted" : s5slope >= 0 ? "text-emerald-300" : "text-rose-300";
  rows.push({
    key: "s5fi",
    name: "S5FI",
    meaning: "S&P 500 % above 50-day avg — breadth",
    available: s5 != null,
    value: s5 != null ? s5.toFixed(1) : "n/a",
    band: s5 != null && s5zone ? S5_ZONE_BAND[s5zone] : "",
    valueColor: s5 == null || !s5zone ? "text-text" : S5_ZONE_COLOR[s5zone],
    blurb:
      "S5FI ($SPXA50R) is the share of S&P 500 stocks trading above their own 50-day moving average — a breadth gauge of how broad the trend is, not just where the index sits. Below 20 is washed-out / oversold, historically a mean-reversion buying zone; above 80 is overbought — broad participation that's a spot to shore up cash. The 37–58 middle is a no-trend chop zone where breadth gives no edge. Read it with the weekly slope: a steep up slope is broad strength, flat is sideways, a steep down slope is broadening weakness.",
    scale:
      s5 != null ? (
        <>
          <ScaleBar
            min={0}
            max={100}
            value={s5}
            zones={[
              { upTo: 20, color: "bg-emerald-500/50", label: "oversold" },
              { upTo: 37, color: "bg-emerald-500/30", label: "low" },
              { upTo: 58, color: "bg-amber-500/45", label: "no trend" },
              { upTo: 80, color: "bg-orange-500/45", label: "high" },
              { upTo: 100, color: "bg-rose-500/55", label: "overbought" },
            ]}
          />
          {s5weekly && s5weekly.length >= 3 && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
                <span>Weekly closes · last {s5weekly.length}w</span>
                {s5slope != null && (
                  <span className={s5slopeColor}>
                    slope {s5slope >= 0 ? "+" : ""}
                    {s5slope.toFixed(1)}/wk{s5trend ? ` · ${S5_TREND_SHORT[s5trend]}` : ""}
                  </span>
                )}
              </div>
              <div className="h-12 overflow-hidden rounded-md bg-surface/50 px-1 ring-1 ring-inset ring-border">
                <Sparkline
                  data={s5weekly.map((v, idx) => ({ label: `w${idx + 1}`, value: v }))}
                  height={48}
                  positive={(s5slope ?? 0) >= 0}
                />
              </div>
            </div>
          )}
        </>
      ) : undefined,
    reading:
      s5 != null && s5zone ? (
        <span className={S5_ZONE_COLOR[s5zone]}>
          Now {s5.toFixed(1)} — {S5_ZONE_READ[s5zone]}
          {s5trend ? `; weekly trend ${S5_TREND_READ[s5trend]}` : ""}.
        </span>
      ) : undefined,
  });

  return rows;
}

export function VixIndicators({ a }: { a: VixAssessment }) {
  const [open, setOpen] = usePersistentState<string | null>("vix-indicator-open", null);
  const rows = buildRows(a);

  return (
    <Card className="divide-y divide-border">
      {rows.map((r) => {
        const isOpen = open === r.key;
        return (
          <Fragment key={r.key}>
            <button
              type="button"
              disabled={!r.available}
              onClick={() => setOpen(isOpen ? null : r.key)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${r.available ? "active:bg-surface-2" : "opacity-55"}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {r.name}
                  {r.available && (
                    <span className={`text-[10px] text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                  )}
                </div>
                <div className="truncate text-[11px] text-muted">{r.meaning}</div>
              </div>
              <div className="text-right">
                <div className={`tabular text-sm font-semibold ${r.valueColor}`}>{r.value}</div>
                {r.band && <div className="text-[10px] text-muted">{r.band}</div>}
              </div>
            </button>
            {isOpen && r.available && (
              <div className="bg-surface-2/40 px-4 py-3">
                <p className="text-[12px] leading-relaxed text-muted">{r.blurb}</p>
                {r.scale}
                {r.reading && <p className="mt-2 text-[12px] font-medium">{r.reading}</p>}
              </div>
            )}
          </Fragment>
        );
      })}
    </Card>
  );
}
