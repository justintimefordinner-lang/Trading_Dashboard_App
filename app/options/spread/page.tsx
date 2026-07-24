import { BackLink, PageHeader } from "@/components/ui";
import { ShowAmounts } from "@/components/privacy";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { StrategyTypeView } from "@/components/StrategyTypeView";
import { TickerBar } from "@/components/TickerBar";
import { getRefreshStatus } from "@/lib/refresh-status";
import { DataRefresh } from "@/components/DataRefresh";
import { getSnapshot } from "@/lib/snapshot";
import { getSelectedAccount } from "@/lib/account";
import { getClosedCovered } from "@/lib/covered-closed";
import { getClosedSpreads } from "@/lib/spreads-closed";
import { parseClosedWindow } from "@/lib/date-range";
import type { OptionPosition } from "@/lib/types";

export const dynamic = "force-dynamic";

const isSpread = (o: OptionPosition) => o.kind === "put-spread" || o.kind === "call-spread";

export default async function OptionsSpreadPage({ searchParams }: { searchParams: Promise<{ view?: string; range?: string; months?: string; symbol?: string }> }) {
  const { view, range, months, symbol } = await searchParams;
  const { mode: closedMode, months: closedMonths } = parseClosedWindow(range, months);
  const snap = await getSnapshot();
  const { id, data } = await getSelectedAccount(snap);
  const closedCovered = (await getClosedCovered()).closed;
  const closedSpreads = (await getClosedSpreads()).closed;
  const sym = symbol?.toUpperCase();
  const allSpreads = data.options.filter(isSpread);
  const tickers = [...new Set(allSpreads.map((o) => o.symbol.toUpperCase()))].sort();
  const open = allSpreads.filter((o) => !sym || o.symbol.toUpperCase() === sym);

  return (
    <main className="px-4">
      <ShowAmounts>
        <PageHeader
          title="Spreads"
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <AccountSwitcher accounts={snap.accounts} selectedId={id} />
              <span>· {open.length} legs open</span>
              <DataRefresh nextAt={getRefreshStatus().app?.nextAt} />
            </span>
          }
          right={<BackLink />}
        />
        <TickerBar tickers={tickers} active={sym} base="/options/spread" />
        <StrategyTypeView
          type="spread"
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
