"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/options", label: "Options", icon: OptionsIcon },
  { href: "/pnl", label: "P&L", icon: PnlIcon },
  { href: "/vix", label: "VIX", icon: VixIcon },
  { href: "/briefing", label: "Brief", icon: BriefIcon },
  { href: "/research", label: "Research", icon: SearchIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur sm:static sm:shrink-0"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-emerald-400" : "text-muted hover:text-text"
                }`}
              >
                <Icon active={active} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type IconProps = { active?: boolean };
const stroke = (active?: boolean) => ({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: active ? 2.2 : 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

function HomeIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke(active)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}
function OptionsIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke(active)}>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}
function VixIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke(active)}>
      <path d="M3 12h3l2 6 4-14 3 9 2-4h4" />
    </svg>
  );
}
function SearchIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke(active)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function PnlIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke(active)}>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" />
      <rect x="13" y="8" width="3" height="10" />
      <path d="m7 9 4-4 3 3 4-5" />
    </svg>
  );
}
function BriefIcon({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke(active)}>
      <path d="M3 18h18" />
      <path d="M5 18a7 7 0 0 1 14 0" />
      <path d="M12 3v3M4 8l1.5 1.5M20 8l-1.5 1.5" />
    </svg>
  );
}
