// Ask the bridge to rebuild the full trade history from Schwab. Write-only: this
// just drops a marker into the bridge's task_inbox/. The bridge (auto_push loop)
// runs `sync_trade_history --full` and reports progress back through the app's
// own data/ folder (read via /api/history/status).
import { requestHistoryBackfill } from "@/lib/bridge-files";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    requestHistoryBackfill();
  } catch {
    return Response.json({ ok: false, error: "Could not start the history rebuild." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
