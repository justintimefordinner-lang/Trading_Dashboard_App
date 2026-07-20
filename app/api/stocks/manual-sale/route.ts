// Add or remove a fully user-entered closed stock sale (one that predates the
// bridge's data window, so it never appears as an orphan). Stored in the app's own
// data/manual_stock_sales.json; the bridge reads it on rebuild and books it as a
// closed long round-trip with the given acquired/sold dates (→ correct short/long-term).
import { addManualStockSale, deleteManualStockSale } from "@/lib/bridge-files";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const symbol = String(b.symbol ?? "").trim().toUpperCase();
  const shares = Number(b.shares);
  const proceedsPerShare = Number(b.proceedsPerShare);
  const costPerShare = Number(b.costPerShare);
  const acquiredDate = String(b.acquiredDate ?? "").trim();
  const soldDate = String(b.soldDate ?? "").trim();

  if (!symbol || !/^[A-Z.]{1,8}$/.test(symbol)) {
    return Response.json({ ok: false, error: "Enter a valid ticker symbol." }, { status: 400 });
  }
  if (!Number.isFinite(shares) || shares <= 0) {
    return Response.json({ ok: false, error: "Shares must be greater than 0." }, { status: 400 });
  }
  for (const [v, label] of [
    [proceedsPerShare, "Proceeds per share"],
    [costPerShare, "Cost per share"],
  ] as const) {
    if (!Number.isFinite(v) || v < 0) {
      return Response.json({ ok: false, error: `${label} must be a number ≥ 0.` }, { status: 400 });
    }
  }
  if (!ISO.test(acquiredDate) || !ISO.test(soldDate)) {
    return Response.json({ ok: false, error: "Dates must be YYYY-MM-DD." }, { status: 400 });
  }
  if (soldDate < acquiredDate) {
    return Response.json({ ok: false, error: "Sold date can't be before the acquired date." }, { status: 400 });
  }
  try {
    const row = addManualStockSale({ symbol, shares, proceedsPerShare, costPerShare, acquiredDate, soldDate });
    return Response.json({ ok: true, sale: row });
  } catch {
    return Response.json({ ok: false, error: "Could not save the sale." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "Missing id." }, { status: 400 });
  try {
    deleteManualStockSale(id);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "Could not remove the sale." }, { status: 500 });
  }
}
