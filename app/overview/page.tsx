// /overview: the wide-screen home — positions table, sector concentration,
// ticker chart and return calculator behind one icon rail. Fetches
// everything once server-side and hands it down, so switching tabs is
// instant client state. Accepts ?symbol= to open straight onto the chart.
import { getSnapshot } from "@/lib/snapshot";
import { getSectorMap } from "@/lib/sectors";
import { computePortfolioRisk } from "@/lib/portfolio-risk";
import { getApproved } from "@/lib/approved";
import { accountLabel } from "@/lib/account-shared";
import { OverviewShell } from "@/components/overview/OverviewShell";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ symbol?: string }> }) {
  const { symbol } = await searchParams;
  const [snap, sectors] = await Promise.all([getSnapshot(), getSectorMap()]);
  const risk = computePortfolioRisk(snap, sectors);

  const options = snap.accounts.flatMap((a) =>
    (snap.data[a.id]?.options ?? []).map((o) => ({ ...o, sourceLabel: accountLabel(a) })),
  );
  const held = new Set<string>();
  for (const acct of Object.values(snap.data)) {
    for (const e of acct.equities) held.add(e.symbol.toUpperCase());
    for (const o of acct.options) held.add(o.symbol.toUpperCase());
  }
  const watchlist = [...new Set([...getApproved(), ...held])].sort();
  const initialSymbol = symbol && /^[A-Za-z][A-Za-z0-9.\-]{0,9}$/.test(symbol) ? symbol.toUpperCase() : undefined;

  return <OverviewShell options={options} risk={risk} watchlist={watchlist} initialSymbol={initialSymbol} />;
}
