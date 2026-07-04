import { BackLink, PageHeader } from "@/components/ui";
import { ShowAmounts } from "@/components/privacy";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { OptionsTypeView } from "@/components/OptionsTypeView";
import { TickerBar } from "@/components/TickerBar";
import { getRefreshStatus } from "@/lib/refresh-status";
import { DataRefresh } from "@/components/DataRefresh";
import { getSnapshot } from "@/lib/snapshot";
import { getSelectedAccount } from "@/lib/account";
import { getClosedCsps } from "@/lib/csp-closed";
import { getClosedLeaps } from "@/lib/leaps-closed";
import { parseClosedWindow } from "@/lib/date-range";
import type { OptionPosition } from "@/lib/types";

export const dynamic = "force-dynamic";

const isLeap = (o: OptionPosition) => o.kind === "leap-call" || o.kind === "leap-put-hedge";

export default async function OptionsLeapPage({ searchParams }: { searchParams: Promise<{ view?: string; range?: string; months?: string; symbol?: string }> }) {
  const { view, range, months, symbol } = await searchParams;
  const { mode: closedMode, months: closedMonths } = parseClosedWindow(range, months);
  const snap = await getSnapshot();
  const { id, data } = await getSelectedAccount(snap);
  const sym = symbol?.toUpperCase();
  const allLeaps = data.options.filter(isLeap);
  const tickers = [...new Set(allLeaps.map((o) => o.symbol.toUpperCase()))].sort();
  const open = allLeaps.filter((o) => !sym || o.symbol.toUpperCase() === sym);
  const closedCsps = (await getClosedCsps()).closed;
  const closedLeaps = (await getClosedLeaps()).closed;

  return (
    <main className="px-4">
      <ShowAmounts>
        <PageHeader
          title="LEAPs"
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <AccountSwitcher accounts={snap.accounts} selectedId={id} />
              <span>· {open.length} open</span>
              <DataRefresh nextAt={getRefreshStatus().app?.nextAt} />
            </span>
          }
          right={<BackLink />}
        />
        <TickerBar tickers={tickers} active={sym} base="/options/leap" />
        <OptionsTypeView type="leap" open={open} closedCsps={closedCsps} closedLeaps={closedLeaps} initialStatus={view === "closed" ? "closed" : "open"} closedMode={closedMode} closedMonths={closedMonths} />
      </ShowAmounts>
    </main>
  );
}
