"use client";

// P&L header alert for stock sales missing a cost basis. Instead of the input
// card always taking up space on the page, we show a small amber warning button
// next to "Build history"; tapping it pops the card out as a modal. The button
// (and modal) disappear once every sale has a basis. See StockCostBasis for the
// input card itself and the write-only save path.
import { useState } from "react";
import { createPortal } from "react-dom";
import type { UnresolvedStock } from "@/lib/bridge-files";
import { StockCostBasis } from "@/components/StockCostBasis";

function WarnIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function CostBasisAlert({ unresolved }: { unresolved: UnresolvedStock[] }) {
  const [open, setOpen] = useState(false);
  const n = unresolved.length;
  if (n === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`${n} stock ${n === 1 ? "sale needs" : "sales need"} a cost basis`}
        aria-label={`${n} stock ${n === 1 ? "sale needs" : "sales need"} a cost basis`}
        className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 ring-1 ring-inset ring-amber-500/40 transition-colors active:bg-amber-500/25"
      >
        <WarnIcon />
        <span className="tabular">{n}</span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setOpen(false)}
          >
            <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="mb-1 flex justify-end">
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-inset ring-border active:opacity-70"
                >
                  ✕
                </button>
              </div>
              <StockCostBasis unresolved={unresolved} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
