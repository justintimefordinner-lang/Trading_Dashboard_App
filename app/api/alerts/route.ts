// Signal alerts. GET returns the last scan (starting a fresh one in the
// background when it's over four hours old) plus whether a scan is running;
// POST starts a scan now. Example mode answers from the synthetic fixture.
import { demoBlocked } from "@/lib/demo";
import { isExampleMode } from "@/lib/example-mode";
import { alertsRunning, exampleAlerts, isStale, readAlerts, refreshAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  if (await isExampleMode()) return Response.json({ alerts: exampleAlerts(), running: false });
  const alerts = readAlerts();
  if (isStale(alerts) && !alertsRunning()) void refreshAlerts().catch(() => {});
  return Response.json({ alerts, running: alertsRunning() });
}

export async function POST() {
  const blocked = demoBlocked();
  if (blocked) return blocked;
  if (await isExampleMode()) return Response.json({ ok: false, error: "Example mode — switch it off to scan real prices." });
  void refreshAlerts().catch(() => {});
  return Response.json({ ok: true, running: true });
}
