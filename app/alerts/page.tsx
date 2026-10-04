import { BackLink, PageHeader } from "@/components/ui";
import { AlertsView } from "@/components/AlertsView";
import { alertsRunning, exampleAlerts, isStale, readAlerts, refreshAlerts } from "@/lib/alerts";
import { isExampleMode } from "@/lib/example-mode";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

// Signal alerts: golden/death crosses, 200-day, MACD, RSI and Bollinger signals
// across the approved list, read off the same series Chart-a-Ticker draws.
export default async function AlertsPage() {
  const example = await isExampleMode();
  const alerts = example ? exampleAlerts() : readAlerts();
  if (!example && isStale(alerts) && !alertsRunning()) void refreshAlerts().catch(() => {});

  const snap = await getSnapshot();
  const held = new Set<string>();
  for (const acct of Object.values(snap.data)) {
    for (const e of acct.equities) held.add(e.symbol.toUpperCase());
    for (const o of acct.options) held.add(o.symbol.toUpperCase());
  }

  return (
    <main className="px-4">
      <PageHeader
        title="Signal alerts"
        subtitle="Approved list · daily chart signals · last 20 sessions"
        right={<BackLink />}
      />
      <AlertsView initial={alerts} held={[...held]} initialRunning={!example && alertsRunning()} example={example} />
    </main>
  );
}
