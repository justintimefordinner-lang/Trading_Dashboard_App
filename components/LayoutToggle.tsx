"use client";

// Auto / Phone / Tablet segmented switch. Used in the side rail and on the
// Settings page; both write the same localStorage key (lib/layout-mode.ts),
// and the boot script re-applies the layout the moment it changes.
import { useEffect, useState } from "react";
import { LAYOUT_EVENT, readLayoutMode, writeLayoutMode, type LayoutMode } from "@/lib/layout-mode";

const OPTIONS: { key: LayoutMode; label: string; title: string }[] = [
  { key: "auto", label: "Auto", title: "Tablet on wide screens, phone otherwise" },
  { key: "phone", label: "Phone", title: "Always the phone layout" },
  { key: "tablet", label: "Tablet", title: "Always the 1024px canvas with the side rail" },
];

export function LayoutToggle({ compact = false }: { compact?: boolean }) {
  // Server renders "auto"; the real value arrives on mount so the markup matches.
  const [mode, setMode] = useState<LayoutMode>("auto");
  useEffect(() => {
    const sync = () => setMode(readLayoutMode());
    sync();
    window.addEventListener(LAYOUT_EVENT, sync);
    return () => window.removeEventListener(LAYOUT_EVENT, sync);
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Layout"
      className={`flex rounded-lg border border-border bg-surface-2 p-0.5 font-medium ${compact ? "text-[10.5px]" : "text-[11px]"}`}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={mode === o.key}
          title={o.title}
          onClick={() => {
            writeLayoutMode(o.key);
            setMode(o.key);
          }}
          className={`flex-1 rounded-md px-2 py-1 transition-colors ${
            mode === o.key ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
