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
import { CostBasisAlert } from "@/components/CostBasisAlert";
import { ReconcileSchwab } from "@/components/ReconcileSchwab";
import type { AppClosed } from "@/lib/reconcile";
import { accountLabel } from "@/lib/account-shared";
import { ManualStockEntry } from "@/components/ManualStockEntry";
import { readUnresolvedStocks, readManualStockSales, readManualCostBases } from "@/lib/bridge-files";
import { EnteredCostBases } from "@/components/EnteredCostBases";
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
    { key: "stock", label: "Stocks", items: stockF.closed.map((r) => ({ pnl: r.realizedPnl, date: r.closedAt, sym: r.symbol, strikeLabel: `${px(r.avgOpen)} → ${px(r.avgClose)}${r.manualBasis && !r.manualEntry ? " · cost entered by hand" : ""}`, openedAt: r.openedAt, daysHeld: r.daysHeld })) },
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
  // Fully user-added sales that predate the data window entirely.
  const manualSales = readManualStockSales();
  // Cost bases already on file, so a mistyped one can be reviewed and corrected.
  const enteredBases = readManualCostBases();
  // Everything typed in by hand that Reconcile can check against Schwab's lots: cost
  // bases for sales the bridge found, and whole sales added from scratch.
  const reconcileEntered = [
    ...enteredBases.map((e) => ({ ...e, kind: "basis" as const })),
    ...manualSales.map((s) => ({ id: s.id, kind: "sale" as const, symbol: s.symbol, shares: s.shares, soldAt: s.proceedsPerShare, closeDate: s.soldDate, costPerShare: s.costPerShare, acquiredDate: s.acquiredDate || null })),
  ];
  // Every closed round-trip, flattened for the Schwab reconcile (compares by symbol and month).
  // Positions closed by hand in a manual account were held at another broker, so
  // they have no place in a comparison with Schwab.
  const atSchwab = (r: { id: string }) => !r.id.startsWith("manual:");
  const appClosed: AppClosed[] = [
    ...cspF.closed.filter(atSchwab).map((r) => ({ kind: "csp" as const, symbol: r.symbol, openedAt: r.openedAt, closedAt: r.closedAt, realizedPnl: r.realizedPnl, outcome: r.outcome, accountId: r.accountId })),
    ...coveredF.closed.filter(atSchwab).map((r) => ({ kind: "covered" as const, symbol: r.symbol, openedAt: r.openedAt, closedAt: r.closedAt, realizedPnl: r.realizedPnl, outcome: r.outcome, accountId: r.accountId })),
    ...spreadF.closed.filter(atSchwab).map((r) => ({ kind: "spread" as const, symbol: r.symbol, openedAt: r.openedAt, closedAt: r.closedAt, realizedPnl: r.realizedPnl, outcome: r.outcome, accountId: r.accountId })),
    ...leapF.closed.filter(atSchwab).map((r) => ({ kind: "leap" as const, symbol: r.symbol, openedAt: r.openedAt, closedAt: r.closedAt, realizedPnl: r.realizedPnl, outcome: r.outcome, accountId: r.accountId })),
    ...stockF.closed.filter(atSchwab).map((r) => ({ kind: "stock" as const, symbol: r.symbol, openedAt: r.openedAt, closedAt: r.closedAt, realizedPnl: r.realizedPnl, outcome: r.outcome, accountId: r.accountId, manual: !!(r.manualBasis || r.manualEntry), shares: r.shares })),
  ];
  const reconcileAccounts = snap.accounts.map((a) => ({ id: a.id, label: `${accountLabel(a)} ${a.mask}` }));

  return (
    <main className="px-4 tablet:px-6" data-wide="1">
      <ShowAmounts>
        <PageHeader
          title="Profit & Loss"
          subtitle={`${account.nickname ?? account.mask} · realized and open by strategy`}
          right={
            <div className="flex items-center gap-2">
              {hasHistory && <ReconcileSchwab records={appClosed} accounts={reconcileAccounts} unresolved={unresolved} entered={reconcileEntered} />}
              <CostBasisAlert unresolved={unresolved} />
              <BuildHistory hasHistory={hasHistory} />
            </div>
          }
        />
        {!hasHistory && (
          <p className="mt-3 rounded-xl border border-border bg-surface px-4 py-3 text-center text-xs text-muted">
            No closed trades yet — tap <span className="font-medium text-text">Build history</span> above to
            pull your realized trades from Schwab.
          </p>
        )}
        <ManualStockEntry sales={manualSales} />
        <EnteredCostBases entries={enteredBases} />
        <PnlView realized={realized} open={open} />
      </ShowAmounts>
    </main>
  );
}
