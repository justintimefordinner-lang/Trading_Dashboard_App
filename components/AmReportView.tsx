"use client";

// Briefing tab — renders data/am_report.json: the regime gate up top, the ranked
// CSP board (tap a row for the full read), the VRP heat map by group, and a
// collapsible steer-clear list of names that failed the gates.
import { Fragment, useState } from "react";
import { Card } from "@/components/ui";
import { DataRefresh } from "@/components/DataRefresh";
import { TIER_STYLE, VRP_STYLE } from "@/lib/am-report-types";
import type { AmReport, AmBoardRow, AmVrpGroup, AmMover } from "@/lib/am-report-types";
import { classifyS5fi, classifyS5fiTrend, type S5fiZone, type S5fiTrend } from "@/lib/vix";

function pctClass(v: number): string {
  return v >= 0 ? "text-emerald-400" : "text-rose-400";
}
function signed(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function annClass(v: number | null | undefined): string {
  if (v == null) return "text-muted";
  if (v >= 30) return "text-emerald-300";
  if (v >= 20) return "text-emerald-400";
  return "text-muted";
}
// BB position color: for a short put, deeper below the 20-day mean (more negative σ)
// is a safer, more mean-reversion-friendly strike; near the mean is close to money.
function bbClass(sigma: number | null | undefined): string {
  if (sigma == null) return "text-muted";
  if (sigma <= -2) return "text-emerald-300"; // at / below the lower band
  if (sigma <= -1) return "text-sky-300";
  if (sigma < 0.5) return "text-amber-300"; // near the mean / money
  return "text-rose-300";
}
function timeOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

const S5_BRIEF_COLOR: Record<S5fiZone, string> = {
  oversold: "text-emerald-300",
  rebuilding: "text-sky-300",
  noTrend: "text-amber-300",
  constructive: "text-sky-300",
  overbought: "text-rose-300",
};
const S5_BRIEF_LABEL: Record<S5fiZone, string> = {
  oversold: "oversold",
  rebuilding: "rebuilding",
  noTrend: "no trend",
  constructive: "constructive",
  overbought: "overbought",
};
const S5_BRIEF_ARROW: Record<S5fiTrend, string> = { strength: "↑", sideways: "→", weakness: "↓" };

// Slim 0–100 breadth bar (5 zones, white marker) for the regime card — a compact
// echo of the VIX-tab S5FI scale. Segment widths match the 20/37/58/80 cuts.
function BreadthBar({ value }: { value: number }) {
  const zones = [
    { w: 20, color: "bg-emerald-500/55" },
    { w: 17, color: "bg-emerald-500/30" },
    { w: 21, color: "bg-amber-500/50" },
    { w: 22, color: "bg-orange-500/50" },
    { w: 20, color: "bg-rose-500/55" },
  ];
  const pos = Math.max(0, Math.min(100, value));
  return (
    <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
      <div className="flex h-full w-full">
        {zones.map((z, i) => (
          <div key={i} className={z.color} style={{ width: `${z.w}%` }} />
        ))}
      </div>
      <div
        className="absolute top-1/2 h-2.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-1 ring-black/40"
        style={{ left: `${pos}%` }}
      />
    </div>
  );
}

function RegimeBanner({ r }: { r: AmReport["regime"] }) {
  const deploy = r.volWeather === "deploy";
  const backward = r.termStructure === "backwardation";
  const s5 = r.s5fi ?? null;
  const s5zone = s5 != null ? classifyS5fi(s5) : null;
  const s5slope = r.s5fiSlopeWk ?? null;
  const s5trend = s5slope != null ? classifyS5fiTrend(s5slope) : null;
  const s5trendColor = s5trend === "strength" ? "text-emerald-300" : s5trend === "weakness" ? "text-rose-300" : "text-muted";
  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-muted">VIX</span>
          <span className="tabular text-lg font-bold leading-none">{r.vix?.toFixed(1) ?? "—"}</span>
        </div>
        {r.band && (
          <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-text ring-1 ring-inset ring-border">
            {r.band}{r.cashRange ? ` · cash ${r.cashRange}` : ""}
          </span>
        )}
        <span
          className={`ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
            deploy ? "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40" : "bg-amber-500/20 text-amber-200 ring-amber-500/40"
          }`}
        >
          {deploy ? "DEPLOY" : "HOLD DRY POWDER"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {r.vix3m != null && (
          <span>
            Term:{" "}
            <span className={backward ? "font-semibold text-rose-300" : "text-text"}>
              {backward ? "backwardation" : "contango"}
            </span>{" "}
            (VIX {r.vix?.toFixed(1)} / 3M {r.vix3m.toFixed(1)})
          </span>
        )}
        {r.futures.map((f) => (
          <span key={f.sym}>
            {f.sym} <span className={pctClass(f.pct)}>{signed(f.pct)}</span>
          </span>
        ))}
      </div>
      {s5 != null && s5zone && (
        <div className="mt-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span>Breadth (S5FI)</span>
            <span className={`tabular font-semibold ${S5_BRIEF_COLOR[s5zone]}`}>{s5.toFixed(0)}</span>
            <span className={S5_BRIEF_COLOR[s5zone]}>· {S5_BRIEF_LABEL[s5zone]}</span>
            {s5trend && (
              <span className={s5trendColor}>
                {S5_BRIEF_ARROW[s5trend]} {s5trend === "strength" ? "strength" : s5trend === "weakness" ? "weakness" : "sideways"}
              </span>
            )}
          </div>
          <BreadthBar value={s5} />
        </div>
      )}
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
        {backward
          ? "Vol stressed — smaller size, sell further OTM."
          : deploy
            ? "Vol calm / normalizing — premium-selling friendly."
            : "Vol elevated — hold dry powder until it settles."}
      </p>
    </Card>
  );
}

function BoardRow({ row }: { row: AmBoardRow }) {
  const [open, setOpen] = useState(false);
  const g = row.gamma;
  const c = row.chain;
  return (
    <div className="px-3 py-2.5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
        <span className={`tabular w-7 shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-bold ring-1 ring-inset ${TIER_STYLE[row.tier]}`}>
          {row.tier}
        </span>
        <span className="w-12 shrink-0 text-sm font-semibold">{row.sym}</span>
        <span className="tabular w-7 shrink-0 text-[11px] text-muted">{Math.round(row.score)}</span>
        <span className={`w-8 shrink-0 text-[11px] font-medium ${VRP_STYLE[row.vrp]}`}>{row.vrp}</span>
        <span className="flex-1" />
        <span className="tabular w-11 shrink-0 text-right text-[11px] text-muted">{c ? `${c.premPct.toFixed(2)}%` : "—"}</span>
        <span className={`tabular w-12 shrink-0 text-right text-[11px] ${annClass(c?.annPct)}`}>{c?.annPct != null ? `${c.annPct.toFixed(1)}%` : "—"}</span>
        <span className="tabular w-14 shrink-0 text-right text-[11px] text-muted">{g?.putWall != null ? `$${g.putWall}` : "—"}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-surface-2/50 px-3 py-2">
          {row.fails.length > 0 && (
            <div className="mb-2 rounded bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-300">
              Gated out · {row.fails.join(" · ")}
            </div>
          )}
          {row.ladder.length > 0 && (
            <div className="mb-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted/80">
                Put ladder{c ? ` · ${c.exp} · ${c.dte}d` : ""}
              </div>
              <div className="grid grid-cols-[1.7rem_0.95fr_0.85fr_0.9fr_0.9fr_0.9fr_0.9fr] gap-x-1.5 text-[11px]">
                <span className="text-[9px] uppercase text-muted/70">Δ</span>
                <span className="text-right text-[9px] uppercase text-muted/70">Strike</span>
                <span className="text-right text-[9px] uppercase text-muted/70">BBσ</span>
                <span className="text-right text-[9px] uppercase text-muted/70">Prem%</span>
                <span className="text-right text-[9px] uppercase text-muted/70">Pad %</span>
                <span className="text-right text-[9px] uppercase text-muted/70">Ann%</span>
                <span className="text-right text-[9px] uppercase text-muted/70">OI</span>
                {row.ladder.map((L) => (
                  <Fragment key={L.dTarget}>
                    <span className="font-medium text-text">{Math.round(Math.abs(L.delta) * 100)}Δ</span>
                    <span className="tabular text-right text-text">${L.strike}</span>
                    <span className={`tabular text-right ${bbClass(L.bbSigma)}`}>
                      {L.bbSigma != null ? `${L.bbSigma > 0 ? "+" : ""}${L.bbSigma.toFixed(1)}` : "—"}
                    </span>
                    <span className="tabular text-right text-text">{L.premPct.toFixed(2)}</span>
                    <span className="tabular text-right text-muted">{row.last ? `${((L.strike - row.last) / row.last * 100).toFixed(1)}%` : "—"}</span>
                    <span className={`tabular text-right ${annClass(L.annPct)}`}>{L.annPct != null ? L.annPct.toFixed(1) : "—"}</span>
                    <span className="tabular text-right text-muted">{L.oi.toLocaleString()}</span>
                  </Fragment>
                ))}
              </div>
              <div className="mt-1 text-[9px] leading-snug text-muted/60">
                BBσ = strike’s std-devs from the 20-day mean · −2 = lower Bollinger band (deeper = further OTM)
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-[11px] text-muted">
            <span>Trend strength</span><span className="text-right text-text">{Math.round(row.trend.strength)} · {row.trend.pctAbove200 >= 0 ? "+" : ""}{row.trend.pctAbove200.toFixed(1)}% vs 200DMA</span>
            <span>18-mo return</span><span className={`text-right ${pctClass(row.trend.ret18mo)}`}>{signed(row.trend.ret18mo)}</span>
            <span>IV / RV</span><span className="text-right text-text">{row.iv != null ? `${Math.round(row.iv * 100)} / ${Math.round((row.rv ?? 0) * 100)}` : "—"}{row.vrpRatio ? ` (×${row.vrpRatio})` : ""}</span>
            <span>IV Rank</span><span className="text-right text-text">{row.ivr != null ? `${Math.round(row.ivr)} (vs 1y)` : `building${row.ivrSamples ? ` ${row.ivrSamples}` : ""}`}</span>
            <span>Rel volume</span><span className="text-right text-text">{row.relVol != null ? `${row.relVol.toFixed(2)}×` : "—"}</span>
            <span>Beta</span><span className="text-right text-text">{row.beta?.toFixed(2) ?? "—"}</span>
            {row.erDate && (<><span>Earnings</span><span className={`text-right ${row.erSpansPut ? "text-amber-300" : "text-text"}`}>{row.erDate}{row.erDays != null ? ` · ${row.erDays}d` : ""}{row.erSpansPut ? " · spans put" : ""}</span></>)}
            {g && (<><span>Gamma</span><span className="text-right text-text">{g.net === "pos" ? "positive" : "negative"} · flip {g.flip != null ? `$${g.flip}` : "—"} · wall ${g.callWall ?? "—"}/{g.putWall ?? "—"}</span></>)}
            <span>Group</span><span className="text-right text-text">{row.group}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function HeatGroup({ g }: { g: AmVrpGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px]"
      >
        <span className="w-3 shrink-0 text-muted">{open ? "▾" : "▸"}</span>
        <span className="w-24 shrink-0 truncate font-medium">{g.group}</span>
        <span className="flex flex-1 items-center gap-1">
          {g.rich > 0 && <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-200">{g.rich} rich</span>}
          {g.fair > 0 && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-muted">{g.fair} fair</span>}
          {g.thin > 0 && <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-200">{g.thin} thin</span>}
        </span>
        <span className="tabular shrink-0 text-right text-muted">{g.richest}</span>
      </button>
      {open && (
        <div className="divide-y divide-border/50 border-t border-border/60 bg-surface-2/30">
          {g.members.map((m) => (
            <BoardRow key={m.sym} row={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MoverRow({ m }: { m: AmMover }) {
  const up = m.move >= 0;
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 text-[11px] ${m.gated ? "opacity-60" : ""}`}>
      <span className="w-12 shrink-0 font-semibold">{m.sym}</span>
      <span className={`tabular w-14 shrink-0 font-medium ${up ? "text-emerald-400" : "text-rose-400"}`}>
        {up ? "+" : ""}{m.move.toFixed(2)}%
      </span>
      <span className="tabular flex-1 text-right text-muted">{m.last != null ? `$${m.last}` : "—"}</span>
      <span className={`w-9 shrink-0 text-right text-[10px] ${VRP_STYLE[m.vrp]}`}>{m.vrp}</span>
      <span className="w-16 shrink-0 text-right text-[9px] uppercase tracking-wide">
        {m.gated ? <span className="text-muted/70">gated</span>
          : m.uptrend ? <span className="text-emerald-300/80">uptrend</span>
          : <span className="text-amber-300/80">below trend</span>}
      </span>
    </div>
  );
}

function Movers({ movers }: { movers: NonNullable<AmReport["movers"]> }) {
  if (movers.gainers.length === 0 && movers.losers.length === 0) return null;
  return (
    <>
      <h3 className="mb-2 mt-5 px-1 text-sm font-semibold">Biggest movers</h3>
      <p className="mb-2 px-1 text-[10px] text-muted">
        Latest session, your approved roster · down-and-still-in-uptrend = CSP dip · below-trend = falling knife
      </p>
      <Card className="p-0">
        <div className="px-3 pt-2 text-[9px] font-semibold uppercase tracking-wide text-emerald-300/80">▲ Gainers</div>
        <div className="divide-y divide-border/50">
          {movers.gainers.map((m) => <MoverRow key={m.sym} m={m} />)}
        </div>
        <div className="mt-1 border-t border-border px-3 pt-2 text-[9px] font-semibold uppercase tracking-wide text-rose-300/80">▼ Losers</div>
        <div className="divide-y divide-border/50">
          {movers.losers.map((m) => <MoverRow key={m.sym} m={m} />)}
        </div>
      </Card>
    </>
  );
}

export function AmReportView({ report }: { report: AmReport }) {
  const [showSteer, setShowSteer] = useState(false);
  const sample = report.meta.source === "sample";

  return (
    <div>
      {sample && (
        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          Sample data — run <span className="font-mono">python am_report.py</span> to populate with live Schwab data.
        </p>
      )}

      <div className="mt-3">
        <RegimeBanner r={report.regime} />
      </div>

      {report.movers && <Movers movers={report.movers} />}

      <h3 className="mb-2 mt-5 px-1 text-sm font-semibold">CSP Board</h3>
      <p className="mb-2 px-1 text-[10px] text-muted">
        Approved names past the wheel gates · ranked by tier then setup score · tap a row for the ladder
        {report.meta.ladderAsOf && (
          <>
            {" · premiums "}
            {report.meta.marketOpen === false ? "" : "live "}
            {timeOnly(report.meta.ladderAsOf)}
            {report.meta.marketOpen !== false && report.meta.ladderNextAt && (
              <DataRefresh nextAt={report.meta.ladderNextAt} cadence={report.meta.ladderCadence} />
            )}
            {report.meta.marketOpen === false && (
              <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
                Market closed{report.meta.earlyClose ? ` · early close ${report.meta.earlyClose}` : ""}
              </span>
            )}
            {report.meta.marketOpen === true && report.meta.earlyClose && (
              <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200/90">
                Early close {report.meta.earlyClose}
              </span>
            )}
          </>
        )}
      </p>
      {report.board.length === 0 ? (
        <Card className="px-4 py-5 text-center text-sm text-muted">No names cleared the gates today.</Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          <div className="flex items-center gap-2 px-3 py-1.5 text-[9px] uppercase tracking-wide text-muted">
            <span className="w-7 shrink-0 text-center">Tier</span>
            <span className="w-12 shrink-0">Tkr</span>
            <span className="w-7 shrink-0">Scr</span>
            <span className="w-8 shrink-0">VRP</span>
            <span className="flex-1" />
            <span className="w-11 shrink-0 text-right">30D%</span>
            <span className="w-12 shrink-0 text-right">Ann%</span>
            <span className="w-14 shrink-0 text-right">P-Wall</span>
          </div>
          {report.board.map((row) => (
            <BoardRow key={row.sym} row={row} />
          ))}
        </Card>
      )}

      {report.meta.earningsLoaded === false && (
        <p className="mt-2 px-1 text-[10px] text-amber-300/90">
          ⚠ No earnings data loaded — the earnings gate is off. Run <span className="font-mono">python fetch_earnings.py</span> (or add data/earnings.json).
        </p>
      )}

      {report.landmines && report.landmines.length > 0 && (
        <>
          <h3 className="mb-1 mt-5 px-1 text-sm font-semibold text-amber-200">⚠ Landmines</h3>
          <p className="mb-2 px-1 text-[10px] text-muted">Approved names pulled OFF the board — earnings inside the danger window</p>
          <Card className="divide-y divide-border p-0">
            {report.landmines.map((lm) => (
              <div key={lm.sym} className="flex items-center justify-between px-3 py-2 text-[11px]">
                <span className="font-semibold">{lm.sym}</span>
                <span className="text-right text-amber-300">
                  Earnings {lm.erDate ?? "soon"}{lm.erDays != null ? ` · ${lm.erDays}d` : ""}
                </span>
              </div>
            ))}
          </Card>
        </>
      )}

      {report.vrpGroups.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 px-1 text-sm font-semibold">Premium heat map</h3>
          <p className="mb-2 px-1 text-[10px] text-muted">Where premium is actually fat — VRP (IV vs realized) by group · tap a group for its names</p>
          <Card className="divide-y divide-border p-0">
            {report.vrpGroups.map((g) => (
              <HeatGroup key={g.group} g={g} />
            ))}
          </Card>
        </>
      )}

      {report.steerClear.length > 0 && (
        <div className="mt-5">
          <button
            onClick={() => setShowSteer((s) => !s)}
            className="flex w-full items-center justify-between px-1 text-sm font-semibold"
          >
            <span>Steer clear ({report.steerClear.length})</span>
            <span className="text-muted">{showSteer ? "▴" : "▾"}</span>
          </button>
          {showSteer && (
            <Card className="mt-2 divide-y divide-border p-0">
              {report.steerClear.map((s) => (
                <div key={s.sym} className="flex items-center justify-between px-3 py-2 text-[11px]">
                  <span className="font-medium">{s.sym}</span>
                  <span className="text-right text-muted">{s.fails.join(" · ")}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold">How to read this</h3>
        <dl className="mt-2 space-y-2 text-[11px] leading-relaxed text-muted">
          <div>
            <span className="font-medium text-text">Score (0–100)</span> — setup quality, a weighted blend:
            trend strength 40% · VRP 28% · option liquidity 22% · beta 10%. Premium is only a tiebreaker, so a
            high score means a clean wheel setup, not just fat premium.
          </div>
          <div>
            <span className="font-medium text-text">VRP</span> — volatility risk premium, IV ÷ RV.{" "}
            <span className="text-emerald-300">Rich</span> (≥ 1.2) means options are pricing more movement than
            the stock has actually shown — you&apos;re being overpaid to sell.{" "}
            <span className="text-rose-300">Thin</span> (≤ 0.9) means underpaid.
          </div>
          <div>
            <span className="font-medium text-text">IV / RV</span> — implied volatility (what the options market
            expects ahead) over realized volatility (what the stock actually did, ~20 sessions). Their ratio is
            the VRP above.
          </div>
          <div>
            <span className="font-medium text-text">IV Rank</span> — where current IV sits within its own past
            year (0 = yearly low, 100 = yearly high). VRP asks &ldquo;rich vs the stock&rsquo;s recent moves&rdquo;; IVR asks
            &ldquo;rich vs its own history.&rdquo; This self-logs daily and reads &ldquo;building&rdquo; until ~20 sessions accumulate.
          </div>
          <div>
            <span className="font-medium text-text">Rel volume</span> — the latest session&rsquo;s volume vs its
            20-day average. Above 1× means unusual activity (often around news or a move).
          </div>
          <div>
            <span className="font-medium text-text">ER badge / Landmines</span> — an amber{" "}
            <span className="text-amber-200">ER</span> means the ~30-day put would span the next earnings report.
            Names with earnings inside ~7 sessions are pulled off the board entirely and listed under Landmines.
          </div>
          <div>
            <span className="font-medium text-text">Beta</span> — how much the stock moves relative to the S&amp;P
            500 (1.0 = moves with the market, &gt; 1 = more). Higher beta pays fatter premium but swings harder.
          </div>
          <div>
            <span className="font-medium text-text">Gamma</span> — dealer-hedging structure from option open
            interest: the <span className="text-text">put wall</span> (support floor), the{" "}
            <span className="text-text">call wall</span> (resistance), and the{" "}
            <span className="text-text">flip</span> (where hedging shifts from damping moves to amplifying them).
            Positive net is price-stabilizing; negative is gap-prone.
          </div>
        </dl>
      </div>

      <p className="mt-3 px-1 text-[10px] leading-relaxed text-muted">
        Market data only — never touches account data. Flow / dark-pool layer omitted (requires a paid feed).
        Gamma walls are a naive open-interest model, not dealer-confirmed.
      </p>
    </div>
  );
}
