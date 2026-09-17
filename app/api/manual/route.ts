// Manual positions: read and edit data/manual_positions.json. The bridge prices
// whatever is in that file each cycle (see lib/manual-positions.ts). All
// writes are plain JSON from the Settings page; nothing here contacts a broker.
import { demoBlocked } from "@/lib/demo";
import {
  addPositions,
  deleteAccount,
  deletePosition,
  readManualFile,
  upsertAccount,
  validatePosition,
  type NewManualPosition,
} from "@/lib/manual-positions";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(readManualFile());
}

export async function POST(req: Request) {
  const blocked = demoBlocked();
  if (blocked) return blocked;
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const action = String(b.action ?? "");
  try {
    if (action === "account") {
      const label = String(b.label ?? "").trim().slice(0, 40);
      if (!label) return Response.json({ ok: false, error: "Give the account a name." }, { status: 400 });
      const cash = Number(b.cash ?? 0);
      if (!Number.isFinite(cash) || cash < 0) return Response.json({ ok: false, error: "Cash must be a number ≥ 0." }, { status: 400 });
      const acct = upsertAccount({ id: b.id ? String(b.id) : undefined, label, cash });
      return Response.json({ ok: true, account: acct });
    }
    if (action === "delete-account") {
      deleteAccount(String(b.id ?? ""));
      return Response.json({ ok: true });
    }
    if (action === "add" || action === "import") {
      const accountId = String(b.accountId ?? "");
      const raw = Array.isArray(b.rows) ? (b.rows as Record<string, unknown>[]) : [];
      if (raw.length === 0) return Response.json({ ok: false, error: "Nothing to add." }, { status: 400 });
      if (raw.length > 500) return Response.json({ ok: false, error: "That's more than 500 rows — split the file." }, { status: 400 });
      const rows: NewManualPosition[] = [];
      const errors: string[] = [];
      for (const r of raw) {
        const v = validatePosition(r);
        if (v.row) rows.push(v.row);
        else if (v.error) errors.push(v.error);
      }
      if (rows.length === 0) return Response.json({ ok: false, error: errors[0] ?? "No valid rows." }, { status: 400 });
      const acct = addPositions(accountId, rows, action === "import" && b.replace === true);
      return Response.json({ ok: true, added: rows.length, skipped: errors, account: acct });
    }
    if (action === "delete") {
      deletePosition(String(b.accountId ?? ""), String(b.id ?? ""));
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Could not save." }, { status: 500 });
  }
}
