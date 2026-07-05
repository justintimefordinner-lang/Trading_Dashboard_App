"use client";

// Shared, adjustable knob for the after-hours Simulate what-if. A single global
// assumption (not per-view) so every Simulate section on a page re-prices against
// the same IV scenario. Deliberately NOT persisted — like the Simulate toggles
// themselves, it resets to the default on a full reload.
//
// `ivSkew` is the auto-skew strength: the assumed IV change in VOL POINTS per 1%
// underlying move, applied inversely (a down move raises IV, an up move crushes it).
// 0 disables the vol term entirely, so Simulate falls back to the pure Δ/Γ estimate.
import { useSyncExternalStore } from "react";

const DEFAULT_SKEW = 0.7; // ~0.7 vol points of IV per 1% move — a tunable starting point
let ivSkew = DEFAULT_SKEW;

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function setIvSkew(v: number) {
  ivSkew = Math.min(3, Math.max(0, Math.round(v * 10) / 10));
  listeners.forEach((l) => l());
}

/** Read/write the shared skew from a client component. */
export function useIvSkew(): [number, (v: number) => void] {
  const v = useSyncExternalStore(
    subscribe,
    () => ivSkew,
    () => DEFAULT_SKEW, // server snapshot (stable for hydration)
  );
  return [v, setIvSkew];
}
