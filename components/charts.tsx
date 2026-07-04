// Dependency-free SVG charts. Pure server components (no hooks), so they render
// on the server and ship zero client JS.
import type { ReactNode } from "react";
import type { ValuePoint } from "@/lib/types";

// ---- Area sparkline ------------------------------------------------------
export function Sparkline({
  data,
  width = 360,
  height = 120,
  positive = true,
}: {
  data: ValuePoint[];
  width?: number;
  height?: number;
  positive?: boolean;
}) {
  const pad = 6;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (width - pad * 2) / (data.length - 1);
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span);
  const x = (i: number) => pad + i * stepX;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;
  const color = positive ? "#34d399" : "#fb7185";
  const id = `spark-${positive ? "p" : "n"}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" role="img" aria-label="Portfolio value trend">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ---- Donut / allocation --------------------------------------------------
export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  slices,
  size = 168,
  thickness = 22,
  centerTop,
  centerBottom,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerTop?: ReactNode;
  centerBottom?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
        {slices.map((s) => {
          const frac = s.value / total;
          const dash = frac * c;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      {(centerTop || centerBottom) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerTop && <span className="tabular text-lg font-semibold">{centerTop}</span>}
          {centerBottom && <span className="text-[11px] text-muted">{centerBottom}</span>}
        </div>
      )}
    </div>
  );
}

// ---- Horizontal proportion bar -------------------------------------------
export function MiniBar({ pct, color = "#34d399" }: { pct: number; color?: string }) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full" style={{ width: `${clamped * 100}%`, background: color }} />
    </div>
  );
}
