import Link from "next/link";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { ShowAmounts } from "@/components/privacy";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { StocksView } from "@/components/StocksView";
import { TickerBar } from "@/components/TickerBar";
import { getRefreshStatus } from "@/lib/refresh-status";
import { DataRefresh } from "@/components/DataRefresh";
import { getSnapshot } from "@/lib/snapshot";
import { getSelectedAccount } from "@/lib/account";
import { getClosedStocks } from "@/lib/stocks-closed";
import { parseClosedWindow } from "@/lib/date-range";

export const dynamic = "force-dynamic";

export default async function StocksPage({ searchParams }: { searchParams: Promise<{ view?: string; range?: string; months?: string; symbol?: string }> }) {
  const { view, range, months, symbol } = await searchParams;
  const { mode: closedMode, months: closedMonths } = parseClosedWindow(range, months);
  const snap = await getSnapshot();
  const { id, data } = await getSelectedAccount(snap);
  const closed = (await getClosedStocks()).closed;
  const sym = symbol?.toUpperCase();
  const tickers = [...new Set(data.equities.map((e) => e.symbol.toUpperCase()))].sort();
  const equities = sym ? data.equities.filter((e) => e.symbol.toUpperCase() === sym) : data.equities;

  return (
    <main className="px-4">
      <ShowAmounts>
        <PageHeader
          title="Stocks"
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <AccountSwitcher accounts={snap.accounts} selectedId={id} />
              <span>· {equities.length} holdings</span>
            </span>
          }
          right={<BackLink />}
        />
        <TickerBar tickers={tickers} active={sym} base="/stocks" />
        <StocksView equities={equities} closed={closed} initialStatus={view === "closed" ? "closed" : "open"} statusFromUrl={view === "open" || view === "closed"} closedMode={closedMode} closedMonths={closedMonths} laddersNextAt={snap.meta.coveredCallsNextAt ?? undefined} coveredCalls={data.options.filter((o) => o.kind === "covered-call")} />

        <Link href="/research?vehicle=Covered" className="mt-3 block active:opacity-80">
          <Card className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium">
              Find covered calls <span className="font-normal text-muted">in Research</span>
            </span>
            <span className="text-muted">›</span>
          </Card>
        </Link>

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted">
          Per-share price is from the latest snapshot ({snap.meta.pricesAsOf})
          <DataRefresh nextAt={getRefreshStatus().app?.nextAt} />. Open percentages are
          unrealized return on cost; closed are realized round-trips.
        </p>
      </ShowAmounts>
    </main>
  );
}
