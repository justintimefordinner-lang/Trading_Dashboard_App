"use client";

// Cash plan: a stacked bar of when CSP collateral is scheduled to free up (by DTE
// bucket), each bar segmented by how much cushion the position still has to its
// strike. Reds/oranges are exposed collateral; greens/blue are well out of the money.
// Tapping a bar selects that DTE window so the positions list above can filter to it.
import { Card } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { compactMoney } from "@/components/OptionRow";
import {
  cspCollateral,
  cspRiskBand,
  CSP_RISK_BG,
  CSP_RISK_LABEL,
  daysToExpiry,
  fmtMoney,
  isCashSettledIndex,
  type CspRiskBand,
} from "@/lib/calc";
import type { OptionPosition } from "@/lib/types";

// DTE buckets, soonest first. Exported so the parent filters by the same edges.
export const CASH_BUCKETS: { label: string; test: (d: number) => boolean }[] = [
  { label: "≤7d", test: (d) => d <= 7 },
  { label: "8–14d", test: (d) => d <= 14 },
  { label: "15–30d", test: (d) => d <= 30 },
  { label: "31–45d", test: (d) => d <= 45 },
  { label: "46d+", test: () => true },
];
export function cashBucketIndex(dte: number): number {
  for (let i = 0; i < CASH_BUCKETS.length; i++) if (CASH_BUCKETS[i].test(dte)) return i;
  return CASH_BUCKETS.length - 1;
}

// Render order for the stacked segments: safest → riskiest, so a tall blue top
// reads as "well covered". Colors/labels come from the shared maps in calc.
const BAND_ORDER: CspRiskBand[] = ["wide", "safe", "low", "near", "atrisk", "na"];

const H = 132; // px chart height

export function CspCashPlan({
  csps,
  selected = null,
  onSelect,
}: {
  csps: OptionPosition[];
  selected?: number | null;
  onSelect?: (i: number | null) => void;
}) {
  const items = csps.filter((o) => !isCashSettledIndex(o.symbol) && cspCollateral(o) > 0);
  if (items.length === 0) return null;

  const cols = CASH_BUCKETS.map(() => ({ total: 0, count: 0, bands: {} as Record<string, number> }));
  let exposed = 0; // collateral in the ITM or ≤5% bands
  for (const o of items) {
    const dte = Math.max(daysToExpiry(o.expiration), 0);
    const bk = cspRiskBand(o);
    const coll = cspCollateral(o);
    const c = cols[cashBucketIndex(dte)];
    c.total += coll;
    c.count += 1;
    c.bands[bk] = (c.bands[bk] ?? 0) + coll;
    if (bk === "atrisk" || bk === "near") exposed += coll;
  }
  const maxTotal = Math.max(...cols.map((c) => c.total), 1);
  const totalColl = items.reduce((s, o) => s + cspCollateral(o), 0);
  const usedBands = BAND_ORDER.filter((b) => cols.some((c) => (c.bands[b] ?? 0) > 0));

  return (
    <Card className="mt-3 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">Cash plan</span>
        <span className="text-[11px] text-muted">
          {selected != null ? "tap the bar again to clear" : "tap a bar to filter positions"}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-muted">
        <Amt>{fmtMoney(totalColl)}</Amt> committed
        {exposed > 0 && (
          <>
            {" · "}
            <span className="text-rose-300">
              <Amt>{fmtMoney(exposed)}</Amt> exposed
            </span>{" "}
            (ITM / ≤5%)
          </>
        )}
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {cols.map((c, i) => {
          const isSel = selected === i;
          const dim = selected != null && !isSel;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect?.(c.total > 0 && !isSel ? i : null)}
              aria-pressed={isSel}
              className={`flex flex-col items-center transition-opacity ${dim ? "opacity-40" : "opacity-100"} ${
                c.total > 0 ? "active:opacity-70" : "cursor-default"
              }`}
            >
              <div className="mb-1 h-3 text-[9px] tabular text-muted">{c.total > 0 ? compactMoney(c.total) : ""}</div>
              <div className="relative w-full" style={{ height: H }}>
                <div
                  className={`absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-md ${
                    isSel ? "ring-2 ring-inset ring-sky-400/70" : ""
                  }`}
                >
                  {BAND_ORDER.map((band) => {
                    const v = c.bands[band] ?? 0;
                    if (v <= 0) return null;
                    const h = (v / maxTotal) * H;
                    return (
                      <div
                        key={band}
                        className={`flex items-center justify-center ${CSP_RISK_BG[band]}`}
                        style={{ height: h }}
                      >
                        {h >= 14 && (
                          <span className="text-[8px] font-semibold leading-none text-white/90">{compactMoney(v)}</span>
                        )}
                      </div>
                    );
                  })}
                  {c.total === 0 && <div className="h-1 w-full rounded bg-surface-2" />}
                </div>
              </div>
              <div className={`mt-1 text-[9px] ${isSel ? "font-semibold text-sky-300" : "text-muted"}`}>
                {CASH_BUCKETS[i].label}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {usedBands.map((b) => (
          <span key={b} className="flex items-center gap-1 text-[10px] text-muted">
            <span className={`h-2 w-2 rounded-sm ${CSP_RISK_BG[b]}`} />
            {CSP_RISK_LABEL[b]}
          </span>
        ))}
      </div>
    </Card>
  );
}
