import { BackLink, PageHeader } from "@/components/ui";
import { ShowAmounts } from "@/components/privacy";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { StrategyTypeView } from "@/components/StrategyTypeView";
import { TickerBar } from "@/components/TickerBar";
import { getSnapshot } from "@/lib/snapshot";
import { getSelectedAccount } from "@/lib/account";
import { getClosedCovered } from "@/lib/covered-closed";
import { getClosedSpreads } from "@/lib/spreads-closed";
import { parseClosedWindow } from "@/lib/date-range";
import type { OptionPosition } from "@/lib/types";

export const dynamic = "force-dynamic";

const isCovered = (o: OptionPosition) => o.kind === "covered-call";

export default async function OptionsCoveredPage({ searchParams }: { searchParams: Promise<{ view?: string; range?: string; months?: string; symbol?: string }> }) {
  const { view, range, months, symbol } = await searchParams;
  const { mode: closedMode, months: closedMonths } = parseClosedWindow(range, months);
  const sym = symbol?.toUpperCase();
  const snap = await getSnapshot();
  const { id, data } = await getSelectedAccount(snap);
  const allCovered = data.options.filter(isCovered);
  const tickers = [...new Set(allCovered.map((o) => o.symbol.toUpperCase()))].sort();
  const open = allCovered.filter((o) => !sym || o.symbol.toUpperCase() === sym);
  const closedCovered = (await getClosedCovered()).closed.filter((c) => !sym || c.symbol.toUpperCase() === sym);
  const closedSpreads = (await getClosedSpreads()).closed.filter((c) => !sym || c.symbol.toUpperCase() === sym);

  return (
    <main className="px-4">
      <ShowAmounts>
        <PageHeader
          title="Covered Calls"
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <AccountSwitcher accounts={snap.accounts} selectedId={id} />
              <span>· {open.length} open</span>
            </span>
          }
          right={<BackLink />}
        />
        <TickerBar tickers={tickers} active={sym} base="/options/covered" />
        <StrategyTypeView
          type="covered"
          open={open}
          closedCovered={closedCovered}
          closedSpreads={closedSpreads}
          initialStatus={view === "closed" ? "closed" : "open"}
          statusFromUrl={view === "open" || view === "closed"}
          closedMode={closedMode}
          closedMonths={closedMonths}
        />
      </ShowAmounts>
    </main>
  );
}
