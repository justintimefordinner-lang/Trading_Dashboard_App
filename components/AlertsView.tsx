"use client";

// The Signal alerts list: newest first, grouped by day, filterable by signal and
// time window, held names marked. Events newer than the last visit get a "new"
// tag (the last-seen bar date lives in localStorage — a per-device convenience).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AlertsFile } from "@/lib/alerts";
import { SIGNAL_KINDS, type SignalKind } from "@/lib/chart-signals";

const SEEN_KEY = "alertsSeenBar";
const WINDOWS = [
  { key: 1, label: "Last session" },
  { key: 7, label: "1 week" },
  { key: 30, label: "20 sessions" },
] as const;

function daysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function AlertsView({
  initial,
  held,
  initialRunning,
  example,
}: {
  initial: AlertsFile | null;
  held: string[];
  initialRunning: boolean;
  example: boolean;
}) {
  const [data, setData] = useState<AlertsFile | null>(initial);
  const [running, setRunning] = useState(initialRunning || (!example && !initial));
  const [kinds, setKinds] = useState<Set<SignalKind>>(new Set(SIGNAL_KINDS.map((k) => k.key)));
  const [windowDays, setWindowDays] = useState<number>(7);
  const [heldOnly, setHeldOnly] = useState(false);
  const [seenBar, setSeenBar] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const heldSet = useMemo(() => new Set(held), [held]);

  // Remember what this device has seen; events after it are "new".
  useEffect(() => {
    try {
      setSeenBar(localStorage.getItem(SEEN_KEY));
      if (data?.lastBar) localStorage.setItem(SEEN_KEY, data.lastBar);
    } catch {
      // storage blocked — no "new" tags
    }
  }, [data?.lastBar]);

  // While a scan runs, poll for the result.
  useEffect(() => {
    if (!running) return;
    let tries = 0;
    const id = setInterval(async () => {
      tries++;
      try {
        const j = (await (await fetch("/api/alerts")).json()) as { alerts: AlertsFile | null; running: boolean };
        if (j.alerts) setData(j.alerts);
        if (!j.running || tries > 60) setRunning(false);
      } catch {
        if (tries > 60) setRunning(false);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [running]);

  async function refresh() {
    setMsg("");
    try {
      const j = await (await fetch("/api/alerts", { method: "POST" })).json();
      if (j.ok === false) setMsg(j.error || "Couldn't start a scan");
      else setRunning(true);
    } catch {
      setMsg("Couldn't reach the server");
    }
  }

  const events = useMemo(() => {
    if (!data) return [];
    const from = daysBefore(data.lastBar, windowDays === 1 ? 0 : windowDays);
    return data.events.filter((e) => kinds.has(e.kind) && e.date >= from && (!heldOnly || heldSet.has(e.symbol)));
  }, [data, kinds, windowDays, heldOnly, heldSet]);

  const byDay = useMemo(() => {
    const m = new Map<string, typeof events>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m.entries()];
  }, [events]);

  const crosses = events.filter((e) => e.kind === "cross");

  const chip = (on: boolean) =>
    `whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors ${
      on ? "bg-sky-500/20 text-sky-200 ring-sky-500/40" : "text-muted ring-border active:bg-surface-2/60"
    }`;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-muted">
        <span>
          {data
            ? `${data.scanned} names · bars to ${fmtDay(data.lastBar)} · scanned ${new Date(data.asOf).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
            : running
              ? "First scan running — about a minute for the whole list…"
              : "No scan yet."}
          {data && data.failed.length > 0 && ` · no data for ${data.failed.join(", ")}`}
        </span>
        {!example && (
          <button onClick={refresh} disabled={running} className={chip(false) + " disabled:opacity-60"}>
            {running ? "Scanning…" : "Refresh"}
          </button>
        )}
      </div>
      {msg && <p className="mt-1 px-1 text-[10px] text-rose-400">{msg}</p>}

      <div className="mt-2 flex gap-1 overflow-x-auto no-scrollbar">
        {WINDOWS.map((w) => (
          <button key={w.key} onClick={() => setWindowDays(w.key)} className={chip(windowDays === w.key)}>
            {w.label}
          </button>
        ))}
        <button onClick={() => setHeldOnly((h) => !h)} className={chip(heldOnly)}>
          Held only
        </button>
      </div>
      <div className="mt-1.5 flex gap-1 overflow-x-auto no-scrollbar">
        {SIGNAL_KINDS.map((k) => (
          <button
            key={k.key}
            onClick={() =>
              setKinds((cur) => {
                const next = new Set(cur);
                if (next.has(k.key)) next.delete(k.key);
                else next.add(k.key);
                return next;
              })
            }
            className={chip(kinds.has(k.key))}
          >
            {k.label}
          </button>
        ))}
      </div>

      {crosses.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <div className="text-[11px] font-semibold text-amber-200">Golden / death crosses in this window</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {crosses.map((e) => (
              <Link key={`${e.symbol}-${e.date}`} href={`/chart?symbol=${e.symbol}`} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${e.dir === "bull" ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}>
                {e.symbol} {e.dir === "bull" ? "golden" : "death"} · {fmtDay(e.date)}
              </Link>
            ))}
          </div>
        </div>
      )}

      {data && events.length === 0 && (
        <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-5 text-center text-sm text-muted">No signals match these filters.</div>
      )}

      {byDay.map(([day, list]) => (
        <div key={day} className="mt-3">
          <div className="mb-1 flex items-center gap-2 px-1">
            <span className="text-[11px] font-semibold">{fmtDay(day)}</span>
            {seenBar && day > seenBar && <span className="rounded bg-sky-500/20 px-1 text-[9px] font-semibold uppercase text-sky-200">new</span>}
            <span className="text-[10px] text-muted">{list.length}</span>
          </div>
          <div className="divide-y divide-border rounded-xl border border-border bg-surface">
            {list.map((e) => (
              <Link key={`${e.symbol}-${e.kind}-${e.date}`} href={`/chart?symbol=${e.symbol}`} className="flex items-center gap-2 px-3 py-2 active:bg-surface-2/60">
                <span className="w-12 shrink-0 text-sm font-semibold">{e.symbol}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${e.dir === "bull" ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}>{e.label}</span>
                    {heldSet.has(e.symbol) && <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-300">held</span>}
                  </div>
                  <div className="tabular mt-0.5 truncate text-[10px] text-muted">{e.detail}</div>
                </div>
                <span className="shrink-0 text-[11px] text-muted">›</span>
              </Link>
            ))}
          </div>
        </div>
      ))}

      <p className="mt-4 px-1 text-[10px] leading-relaxed text-muted">
        One alert per day a signal starts: 50/200-day cross, close crossing the 200-day, MACD (12/26/9) crossing its signal, RSI(14)
        under 30 or over 70, close outside the 20-day 2σ Bollinger band. Daily bars from Yahoo Finance, the same ones Chart a Ticker
        uses; today&apos;s bar is provisional until the close. Information only — the backtests found chart-timing rules didn&apos;t
        improve the wheel. Tap a row to open its chart.
      </p>
    </div>
  );
}
