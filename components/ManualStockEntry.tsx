"use client";

// P&L "Add a stock sale" card — for closed stock sales that predate the bridge's
// data window entirely (so they never appear as cost-basis orphans, e.g. shares
// held for years then sold before the app started capturing). The user enters the
// sale straight from their Schwab realized-gains report; it's stored write-only in
// the app's own data/manual_stock_sales.json and the bridge books it as a closed
// long round-trip (correct short/long-term from the acquired/sold dates) on rebuild.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import type { ManualStockSale } from "@/lib/bridge-files";

const money = (n: number) => "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const blank = { symbol: "", shares: "", proceedsPerShare: "", costPerShare: "", acquiredDate: "", soldDate: "" };
const DAY = 86_400_000;

export function ManualStockEntry({ sales }: { sales: ManualStockSale[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ManualStockSale[]>(sales);
  const [f, setF] = useState({ ...blank });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof typeof blank, v: string) => setF((s) => ({ ...s, [k]: v }));

  const sh = Number(f.shares);
  const pr = Number(f.proceedsPerShare);
  const co = Number(f.costPerShare);
  const preview =
    f.shares && f.proceedsPerShare && f.costPerShare && Number.isFinite(sh) && Number.isFinite(pr) && Number.isFinite(co)
      ? (pr - co) * sh
      : null;
  const term =
    f.acquiredDate && f.soldDate
      ? new Date(f.soldDate).getTime() - new Date(f.acquiredDate).getTime() > 365 * DAY
        ? "long-term"
        : "short-term"
      : null;

  async function add() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/stocks/manual-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: f.symbol,
          shares: sh,
          proceedsPerShare: pr,
          costPerShare: co,
          acquiredDate: f.acquiredDate,
          soldDate: f.soldDate,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || "Save failed.");
      setRows((rs) => [d.sale as ManualStockSale, ...rs]);
      setF({ ...blank });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setRows((rs) => rs.filter((x) => x.id !== id));
    try {
      await fetch(`/api/stocks/manual-sale?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      router.refresh();
    } catch {
      /* best effort */
    }
  }

  const field =
    "w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none ring-emerald-400/40 focus:ring-2";

  return (
    <Card className="mt-3 px-4 py-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between">
        <span className="text-sm font-semibold">Add a stock sale</span>
        <span className="text-xs text-muted">
          {rows.length > 0 ? `${rows.length} added` : "not in your history?"} <span className="ml-1">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <>
          <p className="mt-2 text-xs text-muted">
            For sales that predate your data window (held years, sold before the app was tracking) — enter it from
            your Schwab realized-gains report and it&apos;ll count in the right short/long-term bucket.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <input className={field} placeholder="Ticker" value={f.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} />
            <input className={field} inputMode="decimal" placeholder="Shares" value={f.shares} onChange={(e) => set("shares", e.target.value)} />
            <input className={field} inputMode="decimal" placeholder="Proceeds / share" value={f.proceedsPerShare} onChange={(e) => set("proceedsPerShare", e.target.value)} />
            <input className={field} inputMode="decimal" placeholder="Cost / share" value={f.costPerShare} onChange={(e) => set("costPerShare", e.target.value)} />
            <label className="flex flex-col gap-0.5 text-[10px] text-muted">
              Acquired
              <input className={field} type="date" value={f.acquiredDate} onChange={(e) => set("acquiredDate", e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px] text-muted">
              Sold
              <input className={field} type="date" value={f.soldDate} onChange={(e) => set("soldDate", e.target.value)} />
            </label>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-[11px] text-muted">
              {preview != null && (
                <span className={preview >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {preview >= 0 ? "+" : "−"}
                  {money(Math.abs(preview))}
                </span>
              )}
              {term && <span className="ml-1">· {term}</span>}
            </div>
            <button
              onClick={add}
              disabled={busy}
              className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 active:bg-emerald-500/25 disabled:opacity-60"
            >
              {busy ? "Adding…" : "Add sale"}
            </button>
          </div>
          {err && <p className="mt-1 text-[11px] text-rose-400">{err}</p>}

          {rows.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-border pt-2">
              {rows.map((s) => {
                const pl = (s.proceedsPerShare - s.costPerShare) * s.shares;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted">
                      <span className="font-semibold text-text">{s.symbol}</span> {s.shares.toLocaleString()} sh · {s.acquiredDate} → {s.soldDate}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={pl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {pl >= 0 ? "+" : "−"}
                        {money(Math.abs(pl))}
                      </span>
                      <button onClick={() => remove(s.id)} aria-label="Remove" className="text-muted hover:text-rose-400">
                        ✕
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-[10px] leading-snug text-muted/70">Applies on the next data refresh (~1 min).</p>
        </>
      )}
    </Card>
  );
}
