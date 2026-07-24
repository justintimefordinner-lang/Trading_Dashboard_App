import { BackLink, PageHeader } from "@/components/ui";
import { ShowAmounts } from "@/components/privacy";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { OptionsTypeView, type CspFilter } from "@/components/OptionsTypeView";
import { TickerBar } from "@/components/TickerBar";
import { getRefreshStatus } from "@/lib/refresh-status";
import { DataRefresh } from "@/components/DataRefresh";
import { getSnapshot } from "@/lib/snapshot";
import { getSelectedAccount } from "@/lib/account";
import { getEarnings } from "@/lib/earnings";
import { getClosedCsps } from "@/lib/csp-closed";
import { getClosedLeaps } from "@/lib/leaps-closed";
import { parseClosedWindow } from "@/lib/date-range";
import type { OptionPosition } from "@/lib/types";

export const dynamic = "force-dynamic";

const isCsp = (o: OptionPosition) => o.kind === "csp";

function toCspFilter(v: string | undefined): CspFilter | undefined {
  return v === "atrisk" || v === "rollable" || v === "hold" ? v : undefined;
}

export default async function OptionsCspPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; view?: string; range?: string; months?: string; symbol?: string }>;
}) {
  const { filter, view, range, months, symbol } = await searchParams;
  const { mode: closedMode, months: closedMonths } = parseClosedWindow(range, months);
  const snap = await getSnapshot();
  const { id, data } = await getSelectedAccount(snap);
  const earnings = getEarnings();
  const sym = symbol?.toUpperCase();
  const allCsps = data.options.filter(isCsp);
  const tickers = [...new Set(allCsps.map((o) => o.symbol.toUpperCase()))].sort();
  const open = allCsps
    .filter((o) => !sym || o.symbol.toUpperCase() === sym)
    .map((o) => ({ ...o, erDate: earnings[o.symbol.toUpperCase()] ?? null }));
  const closedCsps = (await getClosedCsps()).closed;
  const closedLeaps = (await getClosedLeaps()).closed;

  return (
    <main className="px-4">
      <ShowAmounts>
        <PageHeader
          title="Cash-Secured Puts"
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <AccountSwitcher accounts={snap.accounts} selectedId={id} />
              <span>· {open.length} open</span>
              <DataRefresh nextAt={getRefreshStatus().app?.nextAt} />
            </span>
          }
          right={<BackLink />}
        />
        <TickerBar tickers={tickers} active={sym} base="/options/csp" />
        <OptionsTypeView
          type="csp"
          open={open}
          closedCsps={closedCsps}
          closedLeaps={closedLeaps}
          initialCspFilter={toCspFilter(filter)}
          initialStatus={view === "closed" ? "closed" : "open"}
          statusFromUrl={view === "open" || view === "closed"}
          closedMode={closedMode}
          closedMonths={closedMonths}
        />
      </ShowAmounts>
    </main>
  );
}
