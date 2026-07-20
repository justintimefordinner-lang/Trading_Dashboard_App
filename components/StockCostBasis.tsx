"use client";

// P&L "Cost basis" card. Some stock sales were opened before the app's transaction
// history, so the bridge can't compute the gain (no cost basis) or the holding
// period (no acquired date, so it can't tell short- vs long-term). It surfaces them
// here; the user supplies a blended $/share (from Schwab) and, to classify the sale
// short vs long-term, the acquired date. Both are stored write-only into the app's
// own data/, and the bridge turns the sale into a real closed-stock round-trip on
// its next rebuild. A row that already has a cost but no date reappears here with
// the cost pre-filled, just needing the date.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import type { UnresolvedStock } from "@/lib/bridge-files";

export function StockCostBasis({ unresolved }: { unresolved: UnresolvedStock[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<UnresolvedStock[]>(unresolved);
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(unresolved.filter((u) => u.costPerShare != null).map((u) => [u.id, String(u.costPerShare)])),
  );
  const [dates, setDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(unresolved.filter((u) => u.acquiredDate).map((u) => [u.id, u.acquiredDate as string])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [savedShort, setSavedShort] = useState<Record<string, boolean>>({});

  if (rows.length === 0) return null;

  async function save(u: UnresolvedStock) {
    const raw = vals[u.id] ?? "";
    const cps = Number(raw);
    if (!raw.trim() || !Number.isFinite(cps) || cps < 0) {
      setErr((e) => ({ ...e, [u.id]: "Enter a valid cost per share." }));
      return;
    }
    const acq = (dates[u.id] ?? "").trim();
    setBusy(u.id);
    setErr((e) => ({ ...e, [u.id]: "" }));
    try {
      const r = await fetch("/api/stocks/cost-basis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, costPerShare: cps, acquiredDate: acq || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || "Save failed.");
      if (acq) {
        // Cost + date = fully resolved → it drops off the list on rebuild.
        setRows((rs) => rs.filter((x) => x.id !== u.id));
      } else {
        // Cost saved but no date → counts now, but as short-term until dated.
        setSavedShort((s) => ({ ...s, [u.id]: true }));
      }
      router.refresh();
    } catch (e) {
      setErr((er) => ({ ...er, [u.id]: e instanceof Error ? e.message : "Save failed." }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mt-3 px-4 py-4">
      <p className="text-sm font-semibold">Cost basis &amp; holding period</p>
      <p className="mt-1 text-xs text-muted">
        {rows.length} stock {rows.length === 1 ? "sale was" : "sales were"} opened before your data history.
        Enter the blended cost per share (from Schwab) so it counts in your P&amp;L, and the date you acquired
        the shares so it&apos;s classified short- vs long-term. The date is what puts long-held sales in your
        long-term gains.
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
                <input
                  type="date"
                  aria-label="Acquired date"
                  title="Date you acquired the shares (for short/long-term)"
                  value={dates[u.id] ?? ""}
                  onChange={(e) => setDates((v) => ({ ...v, [u.id]: e.target.value }))}
                  className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none ring-emerald-400/40 focus:ring-2"
                />
                <button
                  onClick={() => save(u)}
                  disabled={busy === u.id}
                  className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 active:bg-emerald-500/25 disabled:opacity-60"
                >
                  {busy === u.id ? "Saving…" : "Save"}
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                {total != null && <span>= ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} cost basis</span>}
                {!(dates[u.id] ?? "").trim() && <span className="text-amber-400/80">no date → counts as short-term</span>}
              </div>
              {savedShort[u.id] && !(dates[u.id] ?? "").trim() && (
                <p className="mt-1 text-[11px] text-emerald-300/90">Saved as short-term — add an acquired date to mark it long-term.</p>
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
