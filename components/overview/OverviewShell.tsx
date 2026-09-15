"use client";

// /overview: the wide-screen home. One icon rail switches between the
// positions table, sector concentration, the ticker chart and the return
// calculator, all fetched once server-side and handed down here, so a tab
// switch is instant client state, never a navigation.
//
// Ported from jttyeung's fork (components/overview/OverviewShell.tsx on her
// staging branch), keeping the tabs this bridge can feed.
import { useEffect, useState } from "react";
import type { PortfolioRisk } from "@/lib/types";
import { PositionsTable, type SourcedOption } from "@/components/desktop/PositionsTable";
import { ReturnCalculator } from "@/components/desktop/ReturnCalculator";
import { SecurityChart } from "@/components/SecurityChart";
import { PortfolioRiskView } from "@/components/PortfolioRiskView";

type Tab = "positions" | "risk" | "chart" | "calculator";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  {
    key: "positions",
    label: "Positions",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M9 9v11" />
      </svg>
    ),
  },
  {
    key: "risk",
    label: "Sectors",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-9-9" />
        <path d="M12 3v9h9" />
      </svg>
    ),
  },
  {
    key: "chart",
    label: "Chart",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l5-5 4 3 5-7 4 4" />
        <path d="M3 21h18" />
      </svg>
    ),
  },
  {
    key: "calculator",
    label: "Calculator",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
      </svg>
    ),
  },
];

const TAB_KEY = "overviewActiveTab";

function loadTab(): Tab {
  try {
    const raw = localStorage.getItem(TAB_KEY);
    if (raw === "positions" || raw === "risk" || raw === "chart" || raw === "calculator") return raw;
  } catch {
    /* ignore */
  }
  return "positions";
}

const HEADINGS: Record<Tab, { title: string; subtitle: string }> = {
  positions: { title: "Open Positions", subtitle: "Every live option position across every linked account." },
  risk: { title: "Sector Concentration", subtitle: "Capital per sector across every account, against the per-sector cap." },
  chart: {
    title: "Lookup a Ticker",
    subtitle: "2 years of daily candles with Bollinger Bands, MACD, RSI, 50/200-day SMA with golden/death cross markers, and call/put walls for names you hold.",
  },
  calculator: {
    title: "Return Calculator",
    subtitle: "Premium against DTE — what a trade actually earns per month and per year.",
  },
};

export function OverviewShell({
  options,
  risk,
  watchlist,
  initialSymbol,
}: {
  options: SourcedOption[];
  risk: PortfolioRisk;
  watchlist: string[];
  initialSymbol?: string;
}) {
  const [tab, setTab] = useState<Tab>(initialSymbol ? "chart" : "positions");
  useEffect(() => {
    if (!initialSymbol) setTab(loadTab());
  }, [initialSymbol]);

  function selectTab(next: Tab) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const heading = HEADINGS[tab];

  return (
    // min-h-full, not h-full, so the rail's sticky positioning has the whole
    // content height to travel within on a long table.
    <div className="flex min-h-full w-full">
      <nav className="sticky top-0 flex h-[100dvh] w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            title={t.label}
            aria-label={t.label}
            aria-current={tab === t.key}
            className={`flex w-12 flex-col items-center gap-1 rounded-xl py-2.5 text-[9px] font-medium transition-colors ${
              tab === t.key ? "bg-accent/20 text-accent" : "text-muted hover:bg-surface-2 hover:text-text"
            }`}
          >
            {t.icon}
          </button>
        ))}
        <a
          href="/"
          title="Phone view"
          aria-label="Phone view"
          className="mt-auto flex w-12 flex-col items-center gap-1 rounded-xl py-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M11 18h2" />
          </svg>
        </a>
      </nav>

      <main className="min-w-0 flex-1 px-6 py-6">
        <div className="mb-4 rounded-xl bg-header-box px-4 py-3 pr-40">
          <h1 className="text-lg font-semibold text-header-box-text">{heading.title}</h1>
          <p className="text-sm text-header-box-text/70">{heading.subtitle}</p>
        </div>

        {tab === "positions" && <PositionsTable options={options} />}
        {tab === "risk" && (
          <div className="max-w-2xl">
            <PortfolioRiskView risk={risk} />
          </div>
        )}
        {/* Always mounted (just hidden): a chart search builds a real
            lightweight-charts instance, and the calculator holds inputs —
            neither should be thrown away on a tab switch. */}
        <div className={tab === "chart" ? "" : "hidden"}>
          <SecurityChart watchlist={watchlist} initialSymbol={initialSymbol} />
        </div>
        <div className={tab === "calculator" ? "max-w-3xl" : "hidden"}>
          <ReturnCalculator defaultCapitalBase={risk.portfolioValue} />
        </div>
      </main>
    </div>
  );
}
