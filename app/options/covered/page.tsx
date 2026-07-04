import { BackLink, PageHeader } from "@/components/ui";
import { ShowAmounts } from "@/components/privacy";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { StrategyTypeView } from "@/components/StrategyTypeView";
import { getSnapshot } from "@/lib/snapshot";
import { getSelectedAccount } from "@/lib/account";
import { getClosedCovered } from "@/lib/covered-closed";
import { getClosedSpreads } from "@/lib/spreads-closed";
import { parseClosedWindow } from "@/lib/date-range";
import type { OptionPosition } from "@/lib/types";

export const dynamic = "force-dynamic";

const isCovered = (o: OptionPosition) => o.kind === "covered-call";

export default async function OptionsCoveredPage({ searchParams }: { searchParams: Promise<{ view?: string; range?: string; months?: string }> }) {
  const { view, range, months } = await searchParams;
  const { mode: closedMode, months: closedMonths } = parseClosedWindow(range, months);
  const snap = await getSnapshot();
  const { id, data } = await getSelectedAccount(snap);
  const closedCovered = (await getClosedCovered()).closed;
  const closedSpreads = (await getClosedSpreads()).closed;
  const open = data.options.filter(isCovered);

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
        <StrategyTypeView
          type="covered"
          open={open}
          closedCovered={closedCovered}
          closedSpreads={closedSpreads}
          initialStatus={view === "closed" ? "closed" : "open"}
          closedMode={closedMode}
          closedMonths={closedMonths}
        />
      </ShowAmounts>
    </main>
  );
}
