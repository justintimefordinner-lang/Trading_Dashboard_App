"use client";

// Simulate toggle + a gear that reveals the auto-skew IV control on demand. Tucking the
// skew stepper behind the gear keeps the corner clean when you flip Simulate on — the
// adjuster only appears when you go looking for it, and closes itself when Simulate turns
// off so it never pops up unbidden. The stepper reads/writes the shared simConfig store,
// so every Simulate section on the page re-prices against the same IV assumption.
import { useState, useEffect } from "react";
import { SimulateToggle } from "@/components/SimulateToggle";
import { useIvSkew } from "@/lib/simConfig";

const STEP = 0.1;

export function SimulateControls({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const [skew, setSkew] = useIvSkew();
  const [showSkew, setShowSkew] = useState(false);
  const show = on && !disabled;

  // Don't carry the open panel across a Simulate off→on cycle — each activation starts clean.
  useEffect(() => {
    if (!on) setShowSkew(false);
  }, [on]);

  return (
    <div className="inline-flex items-center gap-1.5">
      {show && showSkew && (
        <div
          className="inline-flex items-center gap-0.5 rounded-lg bg-amber-500/15 py-1 pl-0.5 pr-1 text-[11px] font-medium text-amber-100/90 ring-1 ring-inset ring-amber-500/40"
          title="Auto-skew: assumed IV change in vol points per 1% move at ~1-month tenor (down → IV up). Longer-dated legs (LEAPs) taper automatically. 0 = spot-only Δ/Γ."
        >
          <button
            onClick={() => setSkew(skew - STEP)}
            className="px-1.5 leading-none text-amber-200/70 active:text-amber-100"
            aria-label="Lower IV skew"
          >
            −
          </button>
          <span className="tabular-nums whitespace-nowrap">
            {skew === 0 ? "IV off" : `skew ${skew.toFixed(1)}`}
          </span>
          <button
            onClick={() => setSkew(skew + STEP)}
            className="px-1.5 leading-none text-amber-200/70 active:text-amber-100"
            aria-label="Raise IV skew"
          >
            +
          </button>
        </div>
      )}
      {show && (
        <button
          onClick={() => setShowSkew((v) => !v)}
          title="IV skew settings"
          aria-label="IV skew settings"
          aria-pressed={showSkew}
          className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-lg ring-1 ring-inset transition-colors ${
            showSkew
              ? "bg-amber-500/25 text-amber-100 ring-amber-500/50"
              : "bg-surface-2 text-muted ring-border active:bg-surface-2/70"
          }`}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}
      <SimulateToggle on={on} onToggle={onToggle} disabled={disabled} />
    </div>
  );
}
