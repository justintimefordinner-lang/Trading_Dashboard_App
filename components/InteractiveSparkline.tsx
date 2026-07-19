"use client";

// Scrubbable version of the home hero's area sparkline. Same visual as the pure
// server <Sparkline>, but press-and-drag (touch or mouse) moves a crosshair along
// the series and reports the touched index via onScrub, so the parent can show the
// "was" value and %-change at that point in the past. Releasing reports null.
//
// Drag tracking is done with WINDOW listeners attached on press-down (not element
// handlers): once you're dragging, the move/up events fire on window regardless of
// where the finger goes, so leaving the chart bounds — or moving fast — never drops
// the gesture. touch-action:none + preventDefault stop the page from scrolling
// while you scrub.
//
// The SVG stretches horizontally (preserveAspectRatio="none"), so the crosshair and
// dot are HTML overlays positioned by percentage (round dot, crisp line at any
// width); the path stroke uses non-scaling-stroke so it doesn't fatten.
import { useRef, useState } from "react";
import type { ValuePoint } from "@/lib/types";

export function InteractiveSparkline({
  data,
  positive = true,
  width = 360,
  height = 120,
  onScrub,
}: {
  data: ValuePoint[];
  positive?: boolean;
  width?: number;
  height?: number;
  onScrub?: (idx: number | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const pad = 6;
  const n = data.length;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = n > 1 ? (width - pad * 2) / (n - 1) : 0;
  const yv = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span);
  const xi = (i: number) => pad + i * stepX;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${xi(i).toFixed(1)},${yv(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${xi(n - 1).toFixed(1)},${height - pad} L${xi(0).toFixed(1)},${height - pad} Z`;
  const color = positive ? "#34d399" : "#fb7185";
  const gid = `ispark-${positive ? "p" : "n"}`;
  const interactive = n >= 2;

  const idxFrom = (clientX: number): number | null => {
    const el = wrapRef.current;
    if (!el || !interactive) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(frac * (n - 1));
  };

  const beginScrub = (e: React.PointerEvent) => {
    if (!interactive) return;
    e.preventDefault();

    const apply = (clientX: number) => {
      const i = idxFrom(clientX);
      if (i === null) return;
      setActive(i);
      onScrub?.(i);
    };
    apply(e.clientX); // press registers immediately

    const move = (ev: PointerEvent) => {
      ev.preventDefault(); // hold off page scroll while dragging
      apply(ev.clientX);
    };
    const end = () => {
      setActive(null);
      onScrub?.(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const fracPct = active !== null ? (active / (n - 1)) * 100 : 0;
  const topPct = active !== null ? (yv(data[active].value) / height) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className="relative select-none"
      style={interactive ? { touchAction: "none" } : undefined}
      onPointerDown={interactive ? beginScrub : undefined}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Portfolio value trend — press and drag to see past values"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {active !== null && (
        <>
          <div className="pointer-events-none absolute inset-y-0 w-px bg-white/25" style={{ left: `${fracPct}%` }} />
          <div
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${fracPct}%`,
              top: `${topPct}%`,
              backgroundColor: color,
              boxShadow: "0 0 0 2px rgba(10,12,16,0.85)",
            }}
          />
        </>
      )}
    </div>
  );
}
