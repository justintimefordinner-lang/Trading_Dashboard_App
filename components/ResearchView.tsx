"use client";

// The Research workspace. Top: vehicle tabs (CSPs / LEAPs / Bull Puts / Bear
// Calls / Covered) listing the strongest candidates for each. Bottom: the full
// approved roster, tinted by each name's dominant signal, with an Edit mode to
// add/remove tickers (persisted via /api/approved; both app and Python read it).
import { useState } from "react";
import { VEHICLES, topCandidates, coveredCandidates, dominant, hasData } from "@/lib/research-types";
import type { ResearchFile, TickerData, Holding } from "@/lib/research-types";

function scoreClass(score: number, dir: "bullish" | "bearish"): string {
  if (score >= 65) return dir === "bullish" ? "bg-emerald-500/25 text-emerald-100" : "bg-rose-500/25 text-rose-100";
  if (score >= 40) return dir === "bullish" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300";
  return "bg-surface-2 text-muted";
}

function ccBadgeClass(score: number): string {
  if (score >= 65) return "bg-amber-500/25 text-amber-100";
  if (score >= 40) return "bg-amber-500/15 text-amber-300";
  return "bg-surface-2 text-muted";
}

function chipTint(t: TickerData): string {
  const d = dominant(t);
  if (d.score >= 65) return d.direction === "bullish" ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/40 bg-rose-500/10";
  if (d.score >= 40) return d.direction === "bullish" ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-rose-500/25 bg-rose-500/[0.06]";
  return "border-border bg-surface";
}

function Crit({ ok, dir, children }: { ok: boolean; dir: "bullish" | "bearish"; children: React.ReactNode }) {
  const on = dir === "bearish" ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/20 text-emerald-200";
  return <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${ok ? on : "bg-surface-2 text-muted/70"}`}>{children}</span>;
}

export function ResearchView({
  data,
  symbols,
  holdings,
  initialVehicle,
}: {
  data: ResearchFile | null;
  symbols: readonly string[];
  holdings: Holding[];
  initialVehicle?: string;
}) {
  const [vehicle, setVehicle] = useState<string>(initialVehicle ?? VEHICLES[0].key);
  const [q, setQ] = useState("");
  const [approved, setApproved] = useState<string[]>([...symbols]);
  const [editing, setEditing] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function mutate(action: "add" | "remove", symbol: string) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, symbol }),
      });
      const json = await res.json();
      if (Array.isArray(json.symbols)) setApproved(json.symbols);
      else setErr(json.error || "Update failed");
    } catch {
      setErr("Couldn't reach the server");
    } finally {
      setBusy(false);
    }
  }

  const onAdd = async () => {
    const u = addInput.trim().toUpperCase();
    if (!u || busy) return;
    if (approved.includes(u)) {
      setAddInput("");
      return;
    }
    await mutate("add", u);
    setAddInput("");
  };

  const query = q.trim().toUpperCase();
  const sortedApproved = [...approved].sort((a, b) => a.localeCompare(b));
  const gridSyms = query ? sortedApproved.filter((s) => s.includes(query)) : sortedApproved;

  const approvedSection = (
    <>
      <div className="mt-5 mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">All approved</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted">{approved.length} names</span>
          <button
            onClick={() => setEditing((e) => !e)}
            className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition-colors ${
              editing ? "bg-sky-500/20 text-sky-200 ring-sky-500/40" : "text-muted ring-border active:bg-surface-2/60"
            }`}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mb-2">
          <div className="flex items-center gap-2">
            <input
              value={addInput}
              onChange={(e) => setAddInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAdd();
              }}
              placeholder="Add ticker (e.g. NVDA)"
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm uppercase text-text placeholder:normal-case placeholder:text-muted focus:outline-none"
            />
            <button
              onClick={onAdd}
              disabled={busy || !addInput.trim()}
              className="rounded-lg bg-sky-500/20 px-3 py-2 text-sm font-medium text-sky-200 ring-1 ring-inset ring-sky-500/40 active:bg-sky-500/30 disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {err && <p className="mt-1 px-1 text-[10px] text-rose-400">{err}</p>}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-muted">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter approved tickers…"
          className="w-full bg-transparent text-text placeholder:text-muted focus:outline-none"
        />
        {q && <button onClick={() => setQ("")} className="shrink-0 text-muted active:opacity-60">✕</button>}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {gridSyms.map((s) => {
          const t = data ? data.tickers[s] : undefined;
          const ok = hasData(t);
          const d = ok ? dominant(t) : null;
          return (
            <div
              key={s}
              className={`relative flex flex-col items-center justify-center rounded-lg border px-2 py-2 ${ok ? chipTint(t) : "border-border bg-surface"}`}
            >
              {editing && (
                <button
                  onClick={() => mutate("remove", s)}
                  disabled={busy}
                  aria-label={`Remove ${s}`}
                  className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500/90 text-[9px] text-white active:bg-rose-600 disabled:opacity-50"
                >
                  ✕
                </button>
              )}
              <span className="text-sm font-semibold">{s}</span>
              <span className="tabular text-[9px] text-muted">
                {ok && d ? (d.direction === "bullish" ? `▲ ${d.score}` : `▼ ${d.score}`) : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-[10px] text-muted">
        {editing
          ? "Tap ✕ to remove · newly added names get scored on the next research sync."
          : "Chip tint = dominant signal (green bullish / red bearish), number = score. Tap a vehicle above for its ranked list."}
      </p>
    </>
  );

  if (!data) {
    return (
      <div>
        <p className="mt-3 rounded-xl border border-border bg-surface px-3 py-3 text-[12px] leading-relaxed text-muted">
          No research data yet. Run <span className="font-mono">python research_sync.py</span> (or let auto_push refresh)
          to compute the indicator scores. You can still curate the approved list below.
        </p>
        {approvedSection}
      </div>
    );
  }

  const isCovered = vehicle === "Covered";
  const active = VEHICLES.find((v) => v.key === vehicle);
  const candidates = isCovered ? [] : topCandidates(data.tickers, vehicle);
  const covered = isCovered ? coveredCandidates(holdings, data.tickers) : [];
  const tabs = [...VEHICLES.map((v) => ({ key: v.key, label: v.label })), { key: "Covered", label: "Covered" }];

  return (
    <div>
      <div className="mt-3 flex gap-1 overflow-x-auto no-scrollbar rounded-xl border border-border bg-surface p-1">
        {tabs.map((v) => (
          <button
            key={v.key}
            onClick={() => setVehicle(v.key)}
            className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
              vehicle === v.key ? "bg-surface-2 text-text" : "text-muted active:bg-surface-2/50"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {isCovered ? (
        <>
          <p className="mt-2 px-1 text-[10px] text-muted">
            Held names <span className="text-text">at/above cost basis</span> and overbought / near the upper band — sell calls into strength · as of {data.meta.asOf}
          </p>
          {covered.length === 0 ? (
            <div className="mt-2 rounded-xl border border-border bg-surface px-4 py-5 text-center text-sm text-muted">
              {holdings.length === 0
                ? "No stock holdings found in the latest snapshot."
                : "No holdings are overbought above basis right now."}
            </div>
          ) : (
            <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface">
              {covered.map((c, i) => {
                const bear = c.t.setup.bear;
                return (
                  <div key={c.symbol} className="flex items-center gap-2 px-3 py-2.5">
                    <span className="w-4 text-right text-[11px] text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold">{c.symbol}</span>
                        <span className={`tabular rounded px-1.5 py-0.5 text-[10px] font-semibold ${ccBadgeClass(c.ccScore)}`}>{c.ccScore}</span>
                        <span className={`tabular text-[10px] ${c.vsBasis >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {c.vsBasis >= 0 ? "+" : "−"}{Math.abs(c.vsBasis * 100).toFixed(0)}% vs basis
                        </span>
                      </div>
                      <div className="tabular mt-0.5 text-[10px] text-muted">
                        {c.contracts} contract{c.contracts === 1 ? "" : "s"} · basis ${c.avgCost.toFixed(2)} · RSI {Math.round(c.t.rsi)} · %B {Math.round(c.t.pctB * 100)} · ${c.price}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Crit ok dir="bearish">basis</Crit>
                      <Crit ok={!!bear.bbHigh} dir="bearish">BB</Crit>
                      <Crit ok={!!bear.rsiOverbought} dir="bearish">RSI</Crit>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 px-1 text-[10px] text-muted">
            Strongest <span className="text-text">{active?.label}</span> candidates · ranked by {active?.direction} score · as of {data.meta.asOf}
          </p>
          {candidates.length === 0 ? (
            <div className="mt-2 rounded-xl border border-border bg-surface px-4 py-5 text-center text-sm text-muted">
              No {active?.label} candidates above threshold right now.
            </div>
          ) : (
            <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface">
              {candidates.map((c, i) => {
                const t = c.t;
                const bull = active?.direction === "bullish";
                const side = bull ? t.setup.bull : t.setup.bear;
                const macdOk = bull ? t.macdBullish : t.macdBearish;
                const dir = active?.direction ?? "bullish";
                return (
                  <div key={c.symbol} className="flex items-center gap-2 px-3 py-2.5">
                    <span className="w-4 text-right text-[11px] text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold">{c.symbol}</span>
                        <span className={`tabular rounded px-1.5 py-0.5 text-[10px] font-semibold ${scoreClass(c.score, dir)}`}>{c.score}</span>
                        {t.setup.signal?.strength === "strong" && (
                          <span className={`text-[9px] font-semibold uppercase tracking-wide ${bull ? "text-emerald-300" : "text-rose-300"}`}>strong</span>
                        )}
                      </div>
                      <div className="tabular mt-0.5 text-[10px] text-muted">
                        %B {Math.round(t.pctB * 100)} · RSI {Math.round(t.rsi)} · MACD {macdOk ? "▲" : "▼"} · ${t.price}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Crit ok={bull ? !!side.bbLow : !!side.bbHigh} dir={dir}>BB</Crit>
                      <Crit ok={bull ? !!side.rsiOversold : !!side.rsiOverbought} dir={dir}>RSI</Crit>
                      <Crit ok={macdOk} dir={dir}>MACD</Crit>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {approvedSection}
    </div>
  );
}
