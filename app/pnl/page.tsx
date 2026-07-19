import { PageHeader } from "@/components/ui";
import { ShowAmounts } from "@/components/privacy";
import { getSnapshot } from "@/lib/snapshot";
import { getSelectedAccount } from "@/lib/account";
import { getClosedCsps } from "@/lib/csp-closed";
import { getClosedLeaps } from "@/lib/leaps-closed";
import { getClosedCovered } from "@/lib/covered-closed";
import { getClosedSpreads } from "@/lib/spreads-closed";
import { getClosedStocks } from "@/lib/stocks-closed";
import { optionPnl, equityPnl, daysBetween } from "@/lib/calc";
import { PnlView, type BucketInput } from "@/components/PnlView";
import { BuildHistory } from "@/components/BuildHistory";
import { StockCostBasis } from "@/components/StockCostBasis";
import { readUnresolvedStocks } from "@/lib/bridge-files";
import type { OptionKind } from "@/lib/types";

export const dynamic = "force-dynamic";

// Map each open-option kind to a P&L bucket key (matches the realized buckets).
const KIND_KEY: Record<OptionKind, string> = {
  csp: "csp",
  "leap-call": "leap",
  "leap-put-hedge": "leap",
  "covered-call": "covered",
  "put-spread": "spread",
  "call-spread": "spread",
  other: "other",
};

// Compact price: "$80", "$80.5", "$1,234.56" — no forced trailing zeros.
const px = (n: number) => "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function PnlPage() {
  const snap = await getSnapshot();
  const { id, account, data } = await getSelectedAccount(snap);

  // Realized — closed round-trips per strategy bucket.
  const [cspF, coveredF, spreadF, leapF, stockF] = await Promise.all([
    getClosedCsps(),
    getClosedCovered(),
    getClosedSpreads(),
    getClosedLeaps(),
    getClosedStocks(),
  ]);
  const realized: BucketInput[] = [
    { key: "csp", label: "CSPs", items: cspF.closed.map((r) => ({ pnl: r.realizedPnl, date: r.closedAt, sym: r.symbol, strikeLabel: `$${r.strike}`, openedAt: r.openedAt, daysHeld: r.daysHeld })) },
    { key: "covered", label: "Covered calls", items: coveredF.closed.map((r) => ({ pnl: r.realizedPnl, date: r.closedAt, sym: r.symbol, strikeLabel: `$${r.strike}`, openedAt: r.openedAt, daysHeld: r.daysHeld })) },
    { key: "spread", label: "Spreads", items: spreadF.closed.map((r) => ({ pnl: r.realizedPnl, date: r.closedAt, sym: r.symbol, strikeLabel: `$${r.shortStrike}/${r.longStrike}`, openedAt: r.openedAt, daysHeld: r.daysHeld })) },
    { key: "leap", label: "LEAPs", items: leapF.closed.map((r) => ({ pnl: r.realizedPnl, date: r.closedAt, sym: r.symbol, strikeLabel: `$${r.strike}`, openedAt: r.openedAt, daysHeld: r.daysHeld })) },
    { key: "stock", label: "Stocks", items: stockF.closed.map((r) => ({ pnl: r.realizedPnl, date: r.closedAt, sym: r.symbol, strikeLabel: `${px(r.avgOpen)} → ${px(r.avgClose)}`, openedAt: r.openedAt, daysHeld: r.daysHeld })) },
  ];

  // Open — current unrealized mark-to-market per bucket.
  const openByKey: Record<string, { pnl: number; sym?: string; strikeLabel?: string; openedAt?: string; daysHeld?: number }[]> = {};
  for (const o of data.options) {
    const key = KIND_KEY[o.kind] ?? "other";
    (openByKey[key] ??= []).push({
      pnl: optionPnl(o),
      sym: o.symbol,
      strikeLabel: `$${o.strike}`,
      openedAt: o.openedAt,
      daysHeld: o.openedAt ? daysBetween(o.openedAt) : undefined,
    });
  }
  const open: BucketInput[] = [
    { key: "csp", label: "CSPs", items: openByKey.csp ?? [] },
    { key: "covered", label: "Covered calls", items: openByKey.covered ?? [] },
    { key: "spread", label: "Spreads", items: openByKey.spread ?? [] },
    { key: "leap", label: "LEAPs", items: openByKey.leap ?? [] },
    { key: "stock", label: "Stocks", items: data.equities.map((e) => ({ pnl: equityPnl(e), sym: e.symbol, strikeLabel: `${px(e.avgCost)} → ${px(e.price)}` })) },
    { key: "other", label: "Other", items: openByKey.other ?? [] },
  ];

  // New users have no closed round-trips yet — offer a one-time Schwab backfill.
  const hasHistory = realized.some((b) => b.items.length > 0);
  // Stock sales the bridge couldn't auto-cost (bought before our data history).
  const unresolved = readUnresolvedStocks();

  return (
    <main className="px-4">
      <ShowAmounts>
        <PageHeader
          title="Profit & Loss"
          subtitle={`${account.nickname ?? account.mask} · realized and open by strategy`}
          right={<BuildHistory hasHistory={hasHistory} />}
        />
        {!hasHistory && (
          <p className="mt-3 rounded-xl border border-border bg-surface px-4 py-3 text-center text-xs text-muted">
            No closed trades yet — tap <span className="font-medium text-text">Build history</span> above to
            pull your realized trades from Schwab.
          </p>
        )}
        <StockCostBasis unresolved={unresolved} />
        <PnlView realized={realized} open={open} />
      </ShowAmounts>
    </main>
  );
}
