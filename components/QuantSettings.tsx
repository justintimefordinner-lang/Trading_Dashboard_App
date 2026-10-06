"use client";

// The gear at the top of the Quant scan: a popover to change the rule's variables.
// Saving writes data/quant-settings.json; the bridge reads it on its next scan
// (Save & scan asks for one right away) and the trader follows the scan's params.
// Reset puts the study's values back (extra margin per account is kept).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { QuantParams } from "@/lib/quant-settings";

type NumericKey = Exclude<keyof QuantParams, "vixMargin" | "vixCash" | "extraMargin">;
type Field = { key: NumericKey; label: string; hint: string; scale: number; step: number; min: number; max: number };
const FIELDS: Field[] = [
  { key: "targetYield", label: "Target yield", hint: "% of the strike per yield period", scale: 100, step: 0.5, min: 0.5, max: 20 },
  { key: "yieldDays", label: "Yield period", hint: "days the yield is scaled to", scale: 1, step: 1, min: 7, max: 90 },
  { key: "maxDelta", label: "Max delta", hint: "never sell a put above this", scale: 1, step: 0.05, min: 0.05, max: 0.6 },
  { key: "expMin", label: "Shortest expiry", hint: "days out", scale: 1, step: 1, min: 1, max: 180 },
  { key: "expMax", label: "Longest expiry", hint: "days out", scale: 1, step: 1, min: 1, max: 180 },
  { key: "expTarget", label: "Target expiry", hint: "closest expiry to this; 0 = any in the window", scale: 1, step: 1, min: 0, max: 180 },
  { key: "maxSpread", label: "Max spread", hint: "% of the mid; wider quotes are skipped", scale: 100, step: 5, min: 5, max: 999 },
  { key: "closeAtPct", label: "Close at", hint: "% of the credit captured", scale: 1, step: 5, min: 10, max: 95 },
  { key: "maxPerTicker", label: "Max per name", hint: "% of buying power", scale: 100, step: 1, min: 1, max: 50 },
  { key: "tickerBand", label: "Stretch", hint: "% more for one extra contract", scale: 100, step: 1, min: 0, max: 25 },
];

export function QuantSettings({
  current,
  defaults,
  custom,
  demo = false,
  accountId = null,
  accountName = "",
}: {
  current: QuantParams;
  defaults: QuantParams;
  custom: boolean;
  demo?: boolean;
  accountId?: string | null; // the account being viewed; null in the Combined View
  accountName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<NumericKey, string>>(() => toForm(current));
  const [vixMargin, setVixMargin] = useState<boolean>(current.vixMargin);
  const [vixCash, setVixCash] = useState<boolean>(current.vixCash);
  const [extra, setExtra] = useState<string>(() => String((accountId && current.extraMargin?.[accountId]) || 0));
  const [busy, setBusy] = useState<"save" | "scan" | "reset" | null>(null);
  const [msg, setMsg] = useState("");
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVals(toForm(current));
    setVixMargin(current.vixMargin);
    setVixCash(current.vixCash);
    setExtra(String((accountId && current.extraMargin?.[accountId]) || 0));
  }, [current, accountId]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toForm(p: QuantParams): Record<NumericKey, string> {
    return Object.fromEntries(FIELDS.map((f) => [f.key, String(round(p[f.key] * f.scale))])) as Record<NumericKey, string>;
  }
  function fromForm(): Partial<Record<keyof QuantParams, unknown>> {
    // Extra margin is per account: change only this account's entry, keep the rest.
    const extraMargin = { ...(current.extraMargin ?? {}) };
    if (accountId) {
      const n = Math.max(0, Number(extra) || 0);
      if (n > 0) extraMargin[accountId] = n;
      else delete extraMargin[accountId];
    }
    return { ...(Object.fromEntries(FIELDS.map((f) => [f.key, Number(vals[f.key]) / f.scale])) as Partial<Record<NumericKey, number>>), vixMargin, vixCash, extraMargin };
  }

  async function send(body: Record<string, unknown>, kind: "save" | "scan" | "reset") {
    setBusy(kind);
    setMsg("");
    try {
      const r = await fetch("/api/quant/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || d.ok === false) throw new Error(d.error || "Could not save.");
      setMsg(kind === "reset" ? "Study defaults restored." : kind === "scan" ? "Saved. Scanning with these values…" : "Saved. The next scan uses these values.");
      router.refresh();
      if (kind !== "scan") setTimeout(() => setOpen(false), 900);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={box} className="relative">
      {open && <div className="fixed inset-0 z-40 bg-black/40" aria-hidden="true" />}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={demo}
        title={demo ? "The demo uses the study's rule" : "Choose the scan's variables"}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-80 ${
          custom ? "bg-amber-500/10 text-amber-300 ring-amber-500/25" : "bg-surface-2 text-muted ring-border"
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span>{custom ? "Custom rule" : "Settings"}</span>
      </button>

      {open && (
        // Anchored to the viewport, not the button: a panel hung off a button near
        // the screen edge ran off the side on a phone. Backdrop tap closes it.
        <div className="fixed inset-x-3 top-20 z-50 mx-auto max-h-[80vh] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-3 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Scan variables</div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-xs text-muted">
              ✕
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="block text-[11px] text-text">{f.label}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={vals[f.key]}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="mt-0.5 w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm tabular text-text"
                />
                <span className="block text-[10px] text-muted">
                  {f.hint} · study {round(defaults[f.key] * f.scale)}
                </span>
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-start gap-2 text-[11px]">
            <input type="checkbox" checked={vixMargin} onChange={(e) => setVixMargin(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="text-text">Follow the VIX margin allowance</span>
              <span className="block text-[10px] text-muted">
                Size against buying power that grows with the VIX: nothing under 20, 5% per 5 points, capped at 35%. Off, every account is cash-secured only. Study: on.
              </span>
            </span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-[11px]">
            <input type="checkbox" checked={vixCash} onChange={(e) => setVixCash(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="text-text">Follow the VIX cash allocation</span>
              <span className="block text-[10px] text-muted">
                Hold back the VIX page&apos;s cash reserve (the band for today&apos;s VIX) from what the scan can deploy. Study: off, fully deployed whatever the VIX.
              </span>
            </span>
          </label>
          <div className="mt-3 rounded-lg border border-border bg-surface-2/50 px-2.5 py-2">
            <span className="block text-[11px] text-text">Extra margin{accountId && accountName ? ` · ${accountName}` : ""}</span>
            {accountId ? (
              <>
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-sm text-muted">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={1000}
                    value={extra}
                    onChange={(e) => setExtra(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm tabular text-text"
                  />
                </div>
                <span className="mt-1 block text-[10px] leading-relaxed text-muted">
                  Added to this account&apos;s base, its buying power and free cash, on top of the VIX allowance. Use it for long-term holdings you won&apos;t sell: margin against them keeps the wheel&apos;s capital working. The scan, the portfolio check and the Auto Trader all use it. Study: $0.
                </span>
              </>
            ) : (
              <span className="mt-1 block text-[10px] text-muted">Set per account: switch to a single account to change it. The Combined View adds up its accounts&apos; amounts.</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => send({ params: fromForm() }, "save")} disabled={busy !== null} className="rounded-full bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-300 ring-1 ring-inset ring-sky-500/30 disabled:opacity-50">
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            <button onClick={() => send({ params: fromForm(), scan: true }, "scan")} disabled={busy !== null} className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/25 disabled:opacity-50">
              {busy === "scan" ? "Saving…" : "Save & scan"}
            </button>
            <button onClick={() => send({ reset: true }, "reset")} disabled={busy !== null || !custom} className="ml-auto text-[11px] text-muted underline disabled:no-underline disabled:opacity-50">
              {busy === "reset" ? "Resetting…" : "Reset to study"}
            </button>
          </div>
          {msg && <div className="mt-2 text-[11px] text-muted">{msg}</div>}
          <div className="mt-2 text-[10px] leading-relaxed text-muted">
            The bridge reads the pick rule at the start of its next scan. Sizing (per-name cap, stretch, the VIX toggles, extra margin) applies to this page, the portfolio check and the Auto Trader; the trader always sells the backtest&apos;s pick.
          </div>
        </div>
      )}
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
