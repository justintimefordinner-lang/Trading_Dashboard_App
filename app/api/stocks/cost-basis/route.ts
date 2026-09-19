// Save a user-entered cost basis for a stock sale the bridge couldn't auto-cost
// (the purchase predates the ~58-day transaction window). Merged into
// manual_cost_basis.json in the app's own data/ folder; the bridge reads it on its
// next rebuild and produces a proper closed-stock round-trip. POST also corrects an
// entry already on file (same id); DELETE removes one, which sends the sale back to
// the "needs a cost basis" list.
import { demoBlocked } from "@/lib/demo";
import { deleteManualCostBasis, saveManualCostBasis } from "@/lib/bridge-files";

export const dynamic = "force-dynamic";

interface Body {
  id?: string;
  costPerShare?: number;
  acquiredDate?: string;
}

export async function POST(req: Request) {
  const blocked = demoBlocked();
  if (blocked) return blocked;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const id = (body.id || "").trim();
  const cps = body.costPerShare;
  if (!id) {
    return Response.json({ ok: false, error: "Missing sale id." }, { status: 400 });
  }
  if (typeof cps !== "number" || !Number.isFinite(cps) || cps < 0) {
    return Response.json({ ok: false, error: "Cost per share must be a number ≥ 0." }, { status: 400 });
  }
  const acquired = (body.acquiredDate || "").trim();
  if (acquired && !/^\d{4}-\d{2}-\d{2}$/.test(acquired)) {
    return Response.json({ ok: false, error: "Acquired date must be YYYY-MM-DD." }, { status: 400 });
  }
  try {
    saveManualCostBasis(id, cps, acquired || null);
  } catch {
    return Response.json({ ok: false, error: "Could not save the cost basis." }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const blocked = demoBlocked();
  if (blocked) return blocked;
  let id = "";
  try {
    id = (((await req.json()) as Body).id || "").trim();
  } catch {
    id = "";
  }
  if (!id) return Response.json({ ok: false, error: "Missing sale id." }, { status: 400 });
  try {
    deleteManualCostBasis(id);
  } catch {
    return Response.json({ ok: false, error: "Could not remove the cost basis." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
