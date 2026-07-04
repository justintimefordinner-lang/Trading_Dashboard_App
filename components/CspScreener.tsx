"use client";

// Interactive CSP results: sort (by premium yield, annualized, score, win%),
// filter (delta band, source), grouped by ticker with one line per strike across
// the ~0.20–0.30 delta range. Each line shows strike, premium, and premium yield
// (premium ÷ collateral) as a %.
import { useMemo, useState } from "react";
import type { CSPCandidate } from "@/lib/types";
import {
  annualizedReturn,
  collateral,
  periodReturn,
  premium,
  scoreBand,
  scoreCandidate,
} from "@/lib/csp-model";
import { fmtMoney } from "@/lib/calc";
import { MiniBar } from "@/components/charts";

type SortKey = "yield" | "annualized" | "score" | "capital";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "yield", label: "Yield %" },
  { key: "annualized", label: "Annualized" },
  { key: "score", label: "Score" },
  { key: "capital", label: "Capital ↑" },
];
const DELTAS = [
  { key: "all", label: "All Δ", max: 1 },
  { key: "30", label: "Δ ≤ .30", max: 0.305 },
  { key: "25", label: "Δ ≤ .25", max: 0.255 },
];
const SOURCES = [
  { key: "all", label: "All" },
  { key: "holding", label: "Held" },
  { key: "discovered", label: "Found" },
];

function metric(c: CSPCandidate, key: SortKey): number {
  if (key === "yield") return periodReturn(c);
  if (key === "annualized") return annualizedReturn(c);
  if (key === "capital") return collateral(c);
  return scoreCandidate(c).total;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtExp(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="tabular text-right">{v}</dd>
    </div>
  );
}

function entryNote(c: CSPCandidate): string {
  const odds = Math.round(c.delta * 100);
  if (c.delta <= 0.2) return `Conservative strike (~${odds}% assignment odds) — pure income.`;
  if (c.delta <= 0.27) return `Balanced strike (~${odds}% assignment odds) — solid premium, high probability of profit.`;
  return `Higher-delta strike (~${odds}% assignment odds) — richer premium, but more likely you'd buy shares at $${c.strike}.`;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
        active ? "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40" : "bg-surface-2 text-muted ring-border active:bg-surface"
      }`}
    >
      {children}
    </button>
  );
}

export function CspScreener({ candidates }: { candidates: CSPCandidate[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("yield");
  const [deltaKey, setDeltaKey] = useState("all");
  const [sourceKey, setSourceKey] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const deltaMax = DELTAS.find((d) => d.key === deltaKey)!.max;
    const rows = candidates.filter(
      (c) => c.delta <= deltaMax && (sourceKey === "all" || c.source === sourceKey),
    );
    const bySym = new Map<string, CSPCandidate[]>();
    for (const c of rows) {
      if (!bySym.has(c.symbol)) bySym.set(c.symbol, []);
      bySym.get(c.symbol)!.push(c);
    }
    const asc = sortKey === "capital"; // less capital is "better"
    const out = [...bySym.entries()].map(([symbol, lines]) => {
      const vals = lines.map((c) => metric(c, sortKey));
      const best = asc ? Math.min(...vals) : Math.max(...vals);
      // sub-group by expiration (the 2 closest to 30 days), nearest-first
      const byExp = new Map<string, CSPCandidate[]>();
      for (const l of lines) {
        if (!byExp.has(l.expiration)) byExp.set(l.expiration, []);
        byExp.get(l.expiration)!.push(l);
      }
      const exps = [...byExp.entries()]
        .map(([expiration, ls]) => ({ expiration, dte: ls[0].dte, lines: ls.sort((a, b) => a.strike - b.strike) }))
        .sort((a, b) => a.dte - b.dte);
      return { symbol, lines, exps, best };
    });
    out.sort((a, b) => (asc ? a.best - b.best : b.best - a.best));
    return out;
  }, [candidates, sortKey, deltaKey, sourceKey]);

  return (
    <div>
      {/* controls */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted">Sort</span>
          {SORTS.map((s) => (
            <Chip key={s.key} active={sortKey === s.key} onClick={() => setSortKey(s.key)}>
              {s.label}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted">Filter</span>
          {DELTAS.map((d) => (
            <Chip key={d.key} active={deltaKey === d.key} onClick={() => setDeltaKey(d.key)}>
              {d.label}
            </Chip>
          ))}
          <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
          {SOURCES.map((s) => (
            <Chip key={s.key} active={sourceKey === s.key} onClick={() => setSourceKey(s.key)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* groups */}
      <div className="mt-3 space-y-3">
        {groups.map(({ symbol, lines, exps }) => {
          const top = lines.reduce((a, b) => (scoreCandidate(b).total > scoreCandidate(a).total ? b : a));
          const band = scoreBand(scoreCandidate(top).total);
          const c0 = lines[0];
          return (
            <div key={symbol} className="overflow-hidden rounded-2xl border border-border bg-surface">
              {/* ticker header */}
              <div className="flex items-center justify-between gap-2 px-4 pt-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{symbol}</span>
                    <span className="truncate text-[11px] text-muted">{c0.name}</span>
                    {c0.source === "discovered" && (
                      <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30">
                        found
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    ${c0.underlyingPrice.toFixed(2)} · {c0.sector} · RSI {c0.technical.rsi?.toFixed(0) ?? "—"}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${band.chip}`}>
                  {scoreCandidate(top).total}
                </span>
              </div>

              {exps.map((eg) => (
                <div key={eg.expiration} className="border-t border-border">
                  {/* expiration sub-header */}
                  <div className="flex items-center gap-2 px-4 pb-1 pt-2">
                    <span
                      className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
                      title="Closest expiration to the ~30-day target"
                    >
                      {eg.dte}d
                    </span>
                    <span className="text-[11px] text-muted">{fmtExp(eg.expiration)} expiry</span>
                  </div>
                  {/* column header */}
                  <div className="grid grid-cols-[1.2fr_0.6fr_1fr_1.1fr_0.8fr_1.3fr] gap-1 border-b border-border px-4 pb-1 text-[10px] uppercase tracking-wide text-muted">
                    <span>Strike</span>
                    <span className="text-right">Δ</span>
                    <span className="text-right">Prem</span>
                    <span className="text-right">Yield</span>
                    <span className="text-right">Ann.</span>
                    <span className="text-right">Capital</span>
                  </div>
                  {/* rows */}
                  {eg.lines.map((c) => {
                const open = openId === c.id;
                const yld = periodReturn(c) * 100;
                const coll = collateral(c);
                return (
                  <div key={c.id} className="border-b border-border last:border-0">
                    <button
                      onClick={() => setOpenId(open ? null : c.id)}
                      className="grid w-full grid-cols-[1.2fr_0.6fr_1fr_1.1fr_0.8fr_1.3fr] items-center gap-1 px-4 py-2.5 text-left active:bg-surface-2"
                    >
                      <span className="tabular text-sm font-medium">${c.strike}</span>
                      <span className="tabular text-right text-xs text-muted">{c.delta.toFixed(2)}</span>
                      <span className="tabular text-right text-xs">{fmtMoney(premium(c), { cents: true })}</span>
                      <span className="tabular text-right text-sm font-semibold text-emerald-400">{yld.toFixed(2)}%</span>
                      <span className="tabular text-right text-xs text-muted">{(annualizedReturn(c) * 100).toFixed(0)}%</span>
                      <span className="tabular text-right text-xs font-medium">${(coll / 1000).toFixed(1)}k</span>
                    </button>

                    {open && (
                      <div className="bg-surface-2/40 px-4 pb-3 pt-2">
                        <dl className="space-y-1.5 text-[11px]">
                          <Row k="Premium" v={`${fmtMoney(premium(c), { cents: true })} (${c.mark.toFixed(2)}/sh × 100)`} />
                          <Row k="Collateral" v={`${fmtMoney(collateral(c))} (cash to secure)`} />
                          <Row k="Premium yield" v={`${yld.toFixed(2)}% — premium ÷ collateral`} />
                          <Row k="Annualized" v={`${(annualizedReturn(c) * 100).toFixed(1)}% (×365/${c.dte}d)`} />
                          <Row k="Breakeven" v={`$${(c.strike - c.mark).toFixed(2)} (strike − premium)`} />
                          <Row k="Expiry" v={`${c.expiration} · ${c.dte} DTE`} />
                          <Row k="Δ / Win prob / IV" v={`${c.delta.toFixed(2)} · ${Math.round(c.chanceOfProfitShort * 100)}% · ${(c.iv * 100).toFixed(0)}%`} />
                          <Row k="Liquidity" v={`OI ${c.openInterest.toLocaleString()} · spread $${(c.ask - c.bid).toFixed(2)}`} />
                        </dl>

                        <div className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted">Score breakdown</div>
                        <div className="space-y-1">
                          {scoreCandidate(c).components.map((comp) => (
                            <div key={comp.key} className="flex items-center gap-2">
                              <span className="w-20 shrink-0 text-[10px] text-muted">{comp.label}</span>
                              <div className="flex-1">
                                <MiniBar
                                  pct={(comp.score ?? 0) / 100}
                                  color={comp.score === null ? "#3a4358" : comp.score >= 70 ? "#34d399" : comp.score >= 45 ? "#60a5fa" : "#fb7185"}
                                />
                              </div>
                              <span className="tabular w-7 shrink-0 text-right text-[10px] text-muted">
                                {comp.score === null ? "n/a" : Math.round(comp.score)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex items-start gap-2 rounded-lg bg-sky-500/10 p-2 text-[11px] text-sky-200 ring-1 ring-inset ring-sky-500/20">
                          <span>
                            <span className="font-semibold">Entry: </span>
                            {entryNote(c)} Sell-to-open yourself, then manage at ~50% max profit or ~21 DTE; verify no earnings/ex-div before {c.expiration}.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
