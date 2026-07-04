"use client";

// Shared "before → after" value for Simulate mode: keeps the real value dimmed +
// struck through, shows the projected value, then the Δ. Collapses to a plain value
// when nothing changed (static fields like premium/collateral, or no after-hours
// move), so it's safe to wrap any summary stat. Used by the Options summary page and
// each per-strategy page's summary cards.
import { Amt } from "@/components/privacy";
import { fmtMoney } from "@/lib/calc";

export function SimValue({ oldV, newV, signed }: { oldV: number; newV: number; signed?: boolean }) {
  const fmt = (v: number) => (signed ? `${v >= 0 ? "+" : "−"}${fmtMoney(Math.abs(v))}` : fmtMoney(v));
  const delta = newV - oldV;
  const color = signed ? (newV >= 0 ? "text-emerald-400" : "text-rose-400") : "";
  if (Math.abs(delta) < 0.005) {
    return (
      <span className={color}>
        <Amt>{fmt(newV)}</Amt>
      </span>
    );
  }
  const dColor = delta >= 0 ? "text-emerald-400" : "text-rose-400";
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-sm font-normal text-muted/50 line-through">
        <Amt>{fmt(oldV)}</Amt>
      </span>
      <span className={color}>
        <Amt>{fmt(newV)}</Amt>
      </span>
      <span className={`text-[11px] font-normal ${dColor}`}>
        ({delta >= 0 ? "+" : "−"}
        <Amt>{fmtMoney(Math.abs(delta))}</Amt>)
      </span>
    </span>
  );
}
