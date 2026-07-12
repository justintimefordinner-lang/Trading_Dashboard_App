import { BackLink, PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/SettingsForm";
import { BRIDGE_ENV_PATH } from "@/lib/bridge-dir";
import { readEnvFile } from "@/lib/env-file";
import { getSimSkew } from "@/lib/sim-skew";

export const dynamic = "force-dynamic";

function secToMin(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n / 60 : fallback;
}

export default async function SettingsPage() {
  const env = readEnvFile(BRIDGE_ENV_PATH);

  return (
    <main className="px-4">
      <PageHeader title="Settings" subtitle="Refresh intervals & Simulate" right={<BackLink />} />
      <div className="mt-4 pb-6">
        <SettingsForm
          initialIntervals={{
            appMinutes: secToMin(env.APP_PUSH_INTERVAL, 1),
            sheetsMinutes: secToMin(env.SHEETS_PUSH_INTERVAL, 5),
            historyMinutes: secToMin(env.HISTORY_PUSH_INTERVAL, 1),
            researchMinutes: secToMin(env.RESEARCH_PUSH_INTERVAL, 15),
            amReportMinutes: secToMin(env.AM_REPORT_PUSH_INTERVAL, 30),
            amLadderMinutes: secToMin(env.AM_LADDER_PUSH_INTERVAL, 5),
          }}
          initialSkew={getSimSkew()}
        />
      </div>
    </main>
  );
}
