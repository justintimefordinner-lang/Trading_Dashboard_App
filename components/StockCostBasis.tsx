"use client";

// P&L "Missing cost basis" card. Some stock sales were opened before the app's
// transaction history (~58 days), so there's no cost basis to compute the gain —
// the bridge surfaces them here. The user types a blended $/share (from Schwab);
// it's stored (write-only into the app's own data/), and the bridge turns the sale
// into a real closed-stock round-trip on its next rebuild.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import type { UnresolvedStock } from "@/lib/bridge-files";

export function StockCostBasis({ unresolved }: { unresolved: UnresolvedStock[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<UnresolvedStock[]>(unresolved);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});

  if (rows.length === 0) return null;

  async function save(u: UnresolvedStock) {
    const raw = vals[u.id] ?? "";
    const cps = Number(raw);
    if (!raw.trim() || !Number.isFinite(cps) || cps < 0) {
      setErr((e) => ({ ...e, [u.id]: "Enter a valid cost per share." }));
      return;
    }
    setBusy(u.id);
    setErr((e) => ({ ...e, [u.id]: "" }));
    try {
      const r = await fetch("/api/stocks/cost-basis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, costPerShare: cps }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || "Save failed.");
      setRows((rs) => rs.filter((x) => x.id !== u.id));
      router.refresh();
    } catch (e) {
      setErr((er) => ({ ...er, [u.id]: e instanceof Error ? e.message : "Save failed." }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mt-3 px-4 py-4">
      <p className="text-sm font-semibold">Missing cost basis</p>
      <p className="mt-1 text-xs text-muted">
        {rows.length} stock {rows.length === 1 ? "sale was" : "sales were"} closed but opened before your
        data history, so there&apos;s no cost basis to compute the gain. Enter your blended average cost
        per share (from Schwab) and it&apos;ll count in your P&amp;L.
      </p>
      <div className="mt-3 space-y-2.5">
        {rows.map((u) => {
          const cps = Number(vals[u.id]);
          const total = vals[u.id]?.trim() && Number.isFinite(cps) ? cps * u.shares : null;
          return (
            <div key={u.id} className="rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
              <div className="text-xs">
                <span className="font-semibold">{u.symbol}</span>{" "}
                <span className="text-muted">
                  {u.side === "short" ? "covered" : "sold"} {u.shares.toLocaleString()} sh @ $
                  {u.soldAt.toFixed(2)} on {u.closeDate}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">$</span>
                  <input
                    inputMode="decimal"
                    placeholder="cost / share"
                    value={vals[u.id] ?? ""}
                    onChange={(e) => setVals((v) => ({ ...v, [u.id]: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 pl-5 text-sm text-text outline-none ring-emerald-400/40 focus:ring-2"
                  />
                </div>
                <button
                  onClick={() => save(u)}
                  disabled={busy === u.id}
                  className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 active:bg-emerald-500/25 disabled:opacity-60"
                >
                  {busy === u.id ? "Saving…" : "Save"}
                </button>
              </div>
              {total != null && (
                <p className="mt-1 text-[11px] text-muted">
                  = ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} total cost basis
                </p>
              )}
              {err[u.id] && <p className="mt-1 text-[11px] text-rose-400">{err[u.id]}</p>}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-muted/70">
        Applies on the next data refresh (~1 min). Stored — you only enter it once.
      </p>
    </Card>
  );
}
