// One-way status read for the Morning Brief refresh. Returns the sanitized
// report-status.json the bridge writes into this app's own data/ folder
// (status: idle | running | done | error).
import { readReportStatus } from "@/lib/bridge-files";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(readReportStatus());
}
