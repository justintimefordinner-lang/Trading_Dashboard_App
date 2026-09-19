"use client";

// P&L "Cost bases you entered" card. Once a sale has both a cost and an acquired
// date it leaves the "needs a cost basis" prompt for good — which used to mean a
// mistyped number could never be looked at again, let alone fixed. This lists
// every basis on file with the P&L it produces, and lets each one be corrected
// or removed. Same write-only path as the prompt (POST /api/stocks/cost-basis);
// the bridge re-books the sale on its next history rebuild.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import type { EnteredCostBasis } from "@/lib/bridge-files";

const money = (n: number) => `${n < 0 ? "−" : "+"}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function EnteredCostBases({ entries }: { entries: EnteredCostBasis[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<EnteredCostBasis[]>(entries);
  const [editing, setEditing] = useState<string | null>(null);
  const [cost, setCost] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  if (rows.length === 0) return null;

  function startEdit(e: EnteredCostBasis) {
    setEditing(e.id);
    setCost(String(e.costPerShare));
    setDate(e.acquiredDate ?? "");
    setErr("");
    setNote("");
  }

  async function save(e: EnteredCostBasis) {
    const cps = Number(cost);
    if (!cost.trim() || !Number.isFinite(cps) || cps < 0) return setErr("Enter a valid cost per share.");
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/stocks/cost-basis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, costPerShare: cps, acquiredDate: date.trim() || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || "Save failed.");
      setRows((rs) => rs.map((x) => (x.id === e.id ? { ...x, costPerShare: cps, acquiredDate: date.trim() || null } : x)));
      setEditing(null);
      setNote("Saved. Your P&L picks it up on the next data refresh, within a minute or two.");
      router.refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: EnteredCostBasis) {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/stocks/cost-basis", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || "Remove failed.");
      setRows((rs) => rs.filter((x) => x.id !== e.id));
      setEditing(null);
      setNote("Removed. The sale goes back to needing a cost basis on the next data refresh.");
      router.refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Remove failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-3 px-4 py-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span>
          <span className="block text-sm font-semibold">Cost bases you entered</span>
          <span className="mt-0.5 block text-xs text-muted">
            {rows.length} stock {rows.length === 1 ? "sale uses" : "sales use"} a cost you typed in. Review or correct them here.
          </span>
        </span>
        <span className="shrink-0 text-muted">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted">
            The right number is the cost of the shares Schwab actually sold: on Schwab&apos;s Realized Gain/Loss page,{" "}
            <span className="text-text">Cost Basis ÷ Quantity</span> for that sale. It is often not your average cost —
            Schwab picks specific tax lots. Reconcile checks these against a Schwab export for you.
          </p>
          {rows.map((e) => {
            const gain = (e.soldAt - e.costPerShare) * e.shares;
            const isEditing = editing === e.id;
            return (
              <div key={e.id} className="rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span>
                    <span className="font-semibold" data-ticker={e.symbol}>{e.symbol}</span>{" "}
                    <span className="text-muted">
                      {e.shares.toLocaleString()} sh sold {e.closeDate} @ ${e.soldAt.toFixed(2)}
                    </span>
                  </span>
                  {!isEditing && (
                    <button onClick={() => startEdit(e)} className="shrink-0 text-[11px] text-muted underline">
                      Edit
                    </button>
                  )}
                </div>
                {!isEditing && (
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] tabular text-muted">
                    <span>cost ${e.costPerShare.toFixed(2)} / sh</span>
                    <span>{e.acquiredDate ? `acquired ${e.acquiredDate}` : <span className="text-amber-400/80">no acquired date → short-term</span>}</span>
                    <span className={gain >= 0 ? "text-emerald-400" : "text-rose-400"}>{money(gain)}</span>
                  </div>
                )}
                {isEditing && (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">$</span>
                        <input
                          inputMode="decimal"
                          aria-label="Cost per share"
                          value={cost}
                          onChange={(ev) => setCost(ev.target.value)}
                          className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 pl-5 text-sm text-text outline-none ring-emerald-400/40 focus:ring-2"
                        />
                      </div>
                      <input
                        type="date"
                        aria-label="Acquired date"
                        value={date}
                        onChange={(ev) => setDate(ev.target.value)}
                        className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none ring-emerald-400/40 focus:ring-2"
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => save(e)}
                        disabled={busy}
                        className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 active:bg-emerald-500/25 disabled:opacity-60"
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setEditing(null)} className="text-[11px] text-muted underline">
                        Cancel
                      </button>
                      <button onClick={() => remove(e)} disabled={busy} className="ml-auto text-[11px] text-rose-300 underline disabled:opacity-60">
                        Remove this cost basis
                      </button>
                    </div>
                    {err && <p className="mt-1 text-[11px] text-rose-400">{err}</p>}
                  </>
                )}
              </div>
            );
          })}
          {note && <p className="text-[11px] text-emerald-300/90">{note}</p>}
        </div>
      )}
    </Card>
  );
}
