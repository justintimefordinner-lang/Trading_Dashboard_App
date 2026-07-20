// Ask the bridge to rebuild the Morning Brief (am_report) right now. Write-only:
// this just drops a marker into the bridge's task_inbox/. The bridge (auto_push
// loop) runs am_report.main(force=True) and reports progress back through the
// app's own data/ folder (read via /api/briefing/status).
import { requestReportRefresh } from "@/lib/bridge-files";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    requestReportRefresh();
  } catch {
    return Response.json({ ok: false, error: "Could not start the brief refresh." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
