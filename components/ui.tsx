// Small presentational building blocks shared across pages. Server components.
import type { ReactNode } from "react";
import Link from "next/link";
import { Amt } from "./privacy";

/** Header affordance that returns to a parent route (default: the dashboard). */
export function BackLink({ href = "/", label = "Back" }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-border active:bg-surface"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
      {label}
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 px-4 pb-3 pt-4 backdrop-blur">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
        </div>
        {right}
      </div>
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-surface ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  pct,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "pos" | "neg";
  /** Optional badge, e.g. share of portfolio. Stays visible when amounts are hidden. */
  pct?: ReactNode;
}) {
  const toneClass =
    tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : "text-text";
  return (
    <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
        {pct !== undefined && (
          <span className="tabular rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted ring-1 ring-inset ring-border">
            {pct}
          </span>
        )}
      </div>
      <div className={`tabular mt-1 text-lg font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export function Pill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}

export function Delta({ value, pct }: { value: number; pct?: number }) {
  const pos = value >= 0;
  const sign = pos ? "+" : "−";
  const abs = Math.abs(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return (
    <span className={`tabular font-medium ${pos ? "text-emerald-400" : "text-rose-400"}`}>
      {sign}
      <Amt>{abs}</Amt>
      {pct !== undefined && (
        <span className="ml-1 text-xs opacity-80">
          ({sign}
          {Math.abs(pct * 100).toFixed(1)}%)
        </span>
      )}
    </span>
  );
}
