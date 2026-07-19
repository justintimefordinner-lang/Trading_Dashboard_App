// One-way status read for the trade-history backfill. Returns the sanitized
// history-status.json the bridge writes into this app's own data/ folder
// (status: idle | running | done | error, plus per-bucket counts on done).
import { readHistoryStatus } from "@/lib/bridge-files";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(readHistoryStatus());
}
