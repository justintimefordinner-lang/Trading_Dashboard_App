import { PageHeader, Card } from "@/components/ui";
import { AmReportView } from "@/components/AmReportView";
import { getAmReport } from "@/lib/am-report";
import { getRefreshStatus } from "@/lib/refresh-status";
import { DataRefresh } from "@/components/DataRefresh";
import { BriefingRefresh } from "@/components/BriefingRefresh";

export const dynamic = "force-dynamic";

function asOfLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" });
  } catch {
    return iso;
  }
}

export default function BriefingPage() {
  const report = getAmReport();

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
      {report ? (
        <AmReportView report={report} />
      ) : (
        <Card className="mt-3 px-4 py-4 text-[12px] leading-relaxed text-muted">
          No briefing yet. Run <span className="font-mono">python am_report.py</span> (or add it to auto_push) to
          build the regime gate, CSP board, VRP heat map, and gamma walls from your Schwab market data.
        </Card>
      )}
    </main>
  );
}
