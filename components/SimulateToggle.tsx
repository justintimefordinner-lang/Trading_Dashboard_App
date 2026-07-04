"use client";

// Toggle for the after-hours Simulate mode. Amber = "projected / what-if", kept
// visually distinct from the real green/red position data. Disabled (and explains
// why) when there's no after-hours underlying move to project.
export function SimulateToggle({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      title={
        disabled
          ? "No after-hours underlying move to simulate right now"
          : "Re-price options from the current underlying price (after-hours estimate)"
      }
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors ${
        disabled
          ? "cursor-default bg-surface-2 text-muted/40 ring-border"
          : on
            ? "bg-amber-500/25 text-amber-100 ring-amber-500/50"
            : "bg-surface-2 text-muted ring-border active:bg-surface-2/70"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on && !disabled ? "bg-amber-400" : "bg-muted/40"}`} />
      {on ? "Simulating" : "Simulate"}
    </button>
  );
}
