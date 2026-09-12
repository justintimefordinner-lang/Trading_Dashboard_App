"use client";

// Fixed corner control for the wide-surface pages' light/dark/auto theme
// (see theme-mode.tsx) — rendered once in app/layout.tsx's wide-surface
// branch so it's present on /desktop and /overview without each page
// needing its own copy. Ported from jttyeung's fork.
import { useThemeMode, type ThemeMode } from "@/components/theme-mode";

const OPTIONS: { key: ThemeMode; label: string; icon: React.ReactNode }[] = [
  {
    key: "light",
    label: "Light",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    key: "auto",
    label: "Auto",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    key: "dark",
    label: "Dark",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
      </svg>
    ),
  },
];

export function ThemeToggle() {
  const { mode, setMode } = useThemeMode();

  return (
    <div
      className="fixed right-4 top-4 z-50 flex items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-sm"
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => setMode(o.key)}
          title={o.label}
          aria-label={o.label}
          role="radio"
          aria-checked={mode === o.key}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
            mode === o.key ? "bg-accent/20 text-accent" : "text-muted hover:bg-surface-2 hover:text-text"
          }`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
