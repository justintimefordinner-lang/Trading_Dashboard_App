"use client";

// Left navigation rail for the Tablet layout. Same six sections as the
// BottomNav (shared TABS), with labels, plus the things the phone header
// tucks behind icons: hide amounts, Settings, and the layout switch.
// Rendered by the root layout on every route; hidden unless <html> carries
// data-layout="tablet" (see lib/layout-mode.ts).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "@/components/BottomNav";
import { HideButton } from "@/components/privacy";
import { LayoutToggle } from "@/components/LayoutToggle";

export function SideRail() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-[188px] shrink-0 flex-col gap-1.5 border-r border-border bg-surface px-3 pb-3.5 pt-4 tablet:flex">
      <Link href="/" className="mb-3 flex items-center gap-2.5 px-2">
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-gradient-to-br from-emerald-400 to-sky-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0e14" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 17l5-6 4 4 7-9" />
          </svg>
        </span>
        <span className="text-sm font-bold tracking-tight">Portfolio</span>
      </Link>

      <nav aria-label="Sections" className="flex flex-col gap-0.5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition-colors ${
                active ? "bg-emerald-500/10 text-emerald-400" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <Icon active={active} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex gap-1.5">
          <HideButton />
          <Link
            href="/settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-border px-2 py-1.5 text-[11px] font-medium transition-colors ${
              pathname.startsWith("/settings") ? "text-emerald-400" : "text-muted hover:text-text"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            Settings
          </Link>
        </div>
        <div className="px-0.5 text-[10px] uppercase tracking-wider text-muted">Layout</div>
        <LayoutToggle compact />
      </div>
    </aside>
  );
}
