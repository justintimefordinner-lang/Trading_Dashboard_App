import { PageHeader, Card } from "@/components/ui";
import { AmReportView } from "@/components/AmReportView";
import { getAmReport } from "@/lib/am-report";
import { getSnapshot } from "@/lib/snapshot";
import { getSelectedAccount } from "@/lib/account";
import { computeHoldings, underweightTickers } from "@/lib/holdings";
import { getRefreshStatus } from "@/lib/refresh-status";
import { DataRefresh } from "@/components/DataRefresh";
import { BriefingRefresh } from "@/components/BriefingRefresh";
import { SensaSiteLinks } from "@/components/SensaLinks";

export const dynamic = "force-dynamic";

function asOfLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" });
  } catch {
    return iso;
  }
}

export default async function BriefingPage() {
  const snap = await getSnapshot();
  const { data } = await getSelectedAccount(snap);
  const report = getAmReport(snap.meta.source === "example");
  // Names sitting under 8.5% of the selected account — the Brief green-flags any
  // CSP-board row that's also underweight (the same overlap the Portfolio page marks).
  const underweight = underweightTickers(computeHoldings(data));
  // Everything you already hold in any form (stock or option) — used to spot
  // high-conviction board names you DON'T own yet.
  const book = Array.from(
    new Set([...data.equities.map((e) => e.symbol.toUpperCase()), ...data.options.map((o) => o.symbol.toUpperCase())]),
  );

  return (
    <main className="px-4">
      <PageHeader
        title="Morning Brief"
        subtitle={
          report ? (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span>Pre-open · {report.meta.passed} on board · {asOfLabel(report.meta.asOf)}</span>
              <DataRefresh nextAt={getRefreshStatus().am_report?.nextAt} />
            </span>
          ) : (
            "Run am_report.py to build the report"
          )
        }
        right={report ? <BriefingRefresh /> : undefined}
      />
      {/* The market-wide reads Sensa Market keeps that the Brief does not: who is buying. */}
      <SensaSiteLinks pages={["cashflow", "sector-heatmap", "inside-trade", "institutional-investor", "political-trades"]} className="mt-2" />
      {report ? (
        <AmReportView report={report} underweight={underweight} book={book} />
      ) : (
        <Card className="mt-3 px-4 py-4 text-[12px] leading-relaxed text-muted">
          No briefing yet. Run <span className="font-mono">python am_report.py</span> (or add it to auto_push) to
          build the regime gate, CSP board, VRP heat map, and gamma walls from your Schwab market data.
        </Card>
      )}
    </main>
  );
}
