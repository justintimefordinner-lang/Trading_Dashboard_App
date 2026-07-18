"use client";

// Settings page content: a small accordion-style menu. Each top-level item is
// collapsed by default and expands on tap, so the page can grow more sections
// later without turning into one long scroll of unrelated controls.
import { useState, type ReactNode } from "react";
import { setIvSkew } from "@/lib/simConfig";
import { SchwabConnect } from "@/components/SchwabConnect";

function MenuItem({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          {subtitle && <span className="mt-0.5 block text-xs text-muted">{subtitle}</span>}
        </span>
        <span className="shrink-0 text-muted">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="border-t border-border px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

interface Intervals {
  appMinutes: number;
  sheetsMinutes: number;
  historyMinutes: number;
  researchMinutes: number;
  amReportMinutes: number;
  amLadderMinutes: number;
}

const INTERVAL_FIELDS: Array<{ key: keyof Intervals; label: string; hint: string }> = [
  { key: "appMinutes", label: "Portfolio snapshot", hint: "Positions, balances, LEAPs/CSPs — the main dashboard data." },
  { key: "sheetsMinutes", label: "Google Sheets", hint: "Push of the summary/positions tabs to your Google Sheet." },
  { key: "historyMinutes", label: "Trade history", hint: "Closed-trade / transaction history sync." },
  { key: "researchMinutes", label: "Research", hint: "Approved-stock screener and signal refresh." },
  { key: "amReportMinutes", label: "Morning Brief", hint: "Full rebuild of the daily brief." },
  { key: "amLadderMinutes", label: "Put ladder", hint: "Lighter intraday premium refresh." },
];

function inputClass() {
  return "w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-muted/60 outline-none ring-emerald-400/40 focus:ring-2";
}

function labelClass() {
  return "mb-1 block text-xs font-medium text-muted";
}

function IntervalsSection({ initialIntervals }: { initialIntervals: Intervals }) {
  const [intervals, setIntervals] = useState<Intervals>(initialIntervals);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intervals),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed.");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <form onSubmit={save}>
      <p className="text-xs text-muted">
        In minutes. Applies automatically within a few seconds — no restart needed. Set to 0 to
        pause that refresh entirely (existing data stays as-is until you raise it again).
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {INTERVAL_FIELDS.map(({ key, label, hint }) => (
          <div key={key} className="col-span-2 sm:col-span-1">
            <label className={labelClass()} htmlFor={key}>{label}</label>
            <input
              id={key}
              type="number"
              min={0}
              step={0.5}
              className={inputClass()}
              value={intervals[key]}
              onChange={(e) =>
                setIntervals((prev) => ({ ...prev, [key]: e.target.value === "" ? 0 : Number(e.target.value) }))
              }
            />
            <p className="mt-1 text-[11px] text-muted">{hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-full bg-emerald-500/15 px-4 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 active:bg-emerald-500/25 disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Save intervals"}
        </button>
        {status === "saved" && <span className="text-xs text-emerald-400">Saved — takes effect within ~5s.</span>}
        {status === "error" && <span className="text-xs text-rose-400">{error}</span>}
      </div>
    </form>
  );
}

function SkewSection({ initialSkew }: { initialSkew: number }) {
  const [skew, setSkew] = useState(initialSkew);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const STEP = 0.1;

  async function change(next: number) {
    const clamped = Math.min(3, Math.max(0, Math.round(next * 10) / 10));
    setSkew(clamped);
    setIvSkew(clamped);
    setStatus("saving");
    try {
      const res = await fetch("/api/sim-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ivSkew: clamped }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Save failed.");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div>
      <p className="text-xs text-muted">
        The after-hours Simulate what-if assumes IV moves this many vol points per 1% underlying move
        (down {"→"} IV up), tapering for longer-dated legs. 0 = spot-only {"Δ"}/{"Γ"}, no
        vol term. Saved to your data and used everywhere Simulate is turned on.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-amber-500/15 py-1 pl-0.5 pr-1 text-sm font-medium text-amber-100/90 ring-1 ring-inset ring-amber-500/40">
          <button
            onClick={() => change(skew - STEP)}
            className="px-2 leading-none text-amber-200/70 active:text-amber-100"
            aria-label="Lower IV skew"
          >
            {"−"}
          </button>
          <span className="tabular-nums whitespace-nowrap px-1">
            {skew === 0 ? "IV off" : "skew " + skew.toFixed(1)}
          </span>
          <button
            onClick={() => change(skew + STEP)}
            className="px-2 leading-none text-amber-200/70 active:text-amber-100"
            aria-label="Raise IV skew"
          >
            +
          </button>
        </div>
        {status === "saving" && <span className="text-xs text-muted">Saving…</span>}
        {status === "saved" && <span className="text-xs text-emerald-400">Saved.</span>}
        {status === "error" && <span className="text-xs text-rose-400">Save failed.</span>}
      </div>
    </div>
  );
}

export function SettingsForm({
  initialIntervals,
  initialSkew,
}: {
  initialIntervals: Intervals;
  initialSkew: number;
}) {
  return (
    <div className="space-y-3">
      <MenuItem title="Schwab connection" subtitle="Set up or reconnect your account" defaultOpen>
        <SchwabConnect />
      </MenuItem>
      <MenuItem title="Refresh intervals" subtitle="How often each data source updates">
        <IntervalsSection initialIntervals={initialIntervals} />
      </MenuItem>
      <MenuItem title="Simulate skew" subtitle="After-hours what-if IV assumption">
        <SkewSection initialSkew={initialSkew} />
      </MenuItem>
    </div>
  );
}
