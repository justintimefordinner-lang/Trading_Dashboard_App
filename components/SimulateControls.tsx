"use client";

// Simulate on/off toggle. The IV-skew value is now set globally on the Settings
// page (persisted to data/sim-config.json and seeded into the shared store on
// load), so there is no per-corner skew stepper here anymore.
import { SimulateToggle } from "@/components/SimulateToggle";

export function SimulateControls({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <SimulateToggle on={on} onToggle={onToggle} disabled={disabled} />
    </div>
  );
}
