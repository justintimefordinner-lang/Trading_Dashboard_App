"use client";

// Scrubbable version of the home hero's area sparkline. Same visual as the pure
// server <Sparkline>, but press-and-drag (touch or mouse) moves a crosshair along
// the series and reports the touched index via onScrub, so the parent can show the
// "was" value and %-change at that point in the past. Releasing reports null.
//
// The SVG stretches horizontally (preserveAspectRatio="none"), so the crosshair,
// dot and any markers are HTML overlays positioned by percentage — that keeps the
// dot round and the line crisp regardless of width. The path stroke uses
// non-scaling-stroke so it doesn't fatten on wide screens.
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
  const down = useRef(false);
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

  const idxFrom = (clientX: number): number | null => {
    const el = wrapRef.current;
    if (!el || n < 2) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(frac * (n - 1));
  };

  const set = (clientX: number) => {
    const i = idxFrom(clientX);
    if (i === null || i === active) return;
    setActive(i);
    onScrub?.(i);
  };
  const end = () => {
    down.current = false;
    if (active === null) return;
    setActive(null);
    onScrub?.(null);
  };

  const fracPct = active !== null ? (active / (n - 1)) * 100 : 0;
  const topPct = active !== null ? (yv(data[active].value) / height) * 100 : 0;
  const interactive = n >= 2;

  return (
    <div
      ref={wrapRef}
      className="relative select-none"
      style={interactive ? { touchAction: "none" } : undefined}
      onPointerDown={
        interactive
          ? (e) => {
              down.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              set(e.clientX);
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (e) => {
              if (down.current) set(e.clientX);
            }
          : undefined
      }
      onPointerUp={interactive ? end : undefined}
      onPointerCancel={interactive ? end : undefined}
      onPointerLeave={interactive ? end : undefined}
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
