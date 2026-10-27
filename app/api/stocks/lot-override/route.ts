// Save which lots a stock sale sold, taken from Schwab's Realized Gain/Loss report
// in Reconcile, for a sale the bridge matched first-in-first-out. Stored in
// stock_lot_overrides.json in the app's own data/ folder and applied when closed
// stocks are loaded. POST replaces any earlier override for the same sale; DELETE
// removes one, which puts the bridge's cost back.
import { demoBlocked } from "@/lib/demo";
import { deleteLotOverride, saveLotOverride } from "@/lib/bridge-files";
import { overrideKey, type OverrideLot } from "@/lib/lot-overrides";

export const dynamic = "force-dynamic";

interface Body {
  symbol?: string;
  closeDate?: string;
  accountId?: string | null;
  shares?: number;
  closePrice?: number;
  lots?: OverrideLot[];
  key?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export async function POST(req: Request) {
  const blocked = demoBlocked();
  if (blocked) return blocked;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const symbol = (body.symbol || "").trim().toUpperCase();
  const closeDate = (body.closeDate || "").trim();
  const accountId = body.accountId ? String(body.accountId) : null;
  const lots = Array.isArray(body.lots) ? body.lots : [];
  if (!symbol || !ISO.test(closeDate)) return Response.json({ ok: false, error: "Missing symbol or sale date." }, { status: 400 });
  if (!num(body.shares) || body.shares <= 0 || !num(body.closePrice) || body.closePrice < 0) {
    return Response.json({ ok: false, error: "Shares and sale price must be numbers." }, { status: 400 });
  }
  const clean = lots.map((l) => ({ shares: l?.shares, costPerShare: l?.costPerShare, acquiredDate: l?.acquiredDate && ISO.test(l.acquiredDate) ? l.acquiredDate : null }));
  if (clean.length === 0 || clean.some((l) => !num(l.shares) || l.shares <= 0 || !num(l.costPerShare) || l.costPerShare < 0)) {
    return Response.json({ ok: false, error: "Each lot needs shares and a cost per share." }, { status: 400 });
  }
  const total = clean.reduce((s, l) => s + (l.shares as number), 0);
  if (Math.abs(total - body.shares) > 1e-3) return Response.json({ ok: false, error: "The lots don't add up to the sale." }, { status: 400 });
  try {
    saveLotOverride({ key: overrideKey(symbol, closeDate, accountId), symbol, closeDate, accountId, shares: body.shares, closePrice: body.closePrice, lots: clean as OverrideLot[] });
  } catch {
    return Response.json({ ok: false, error: "Could not save the lots." }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const blocked = demoBlocked();
  if (blocked) return blocked;
  let key = "";
  try {
    key = (((await req.json()) as Body).key || "").trim();
  } catch {
    key = "";
  }
  if (!key) return Response.json({ ok: false, error: "Missing sale key." }, { status: 400 });
  try {
    deleteLotOverride(key);
  } catch {
    return Response.json({ ok: false, error: "Could not remove the lots." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
