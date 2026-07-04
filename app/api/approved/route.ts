// Approved-list editor endpoint. GET returns the current list; POST mutates it
// ({ action: "add" | "remove" | "set", symbol?, symbols? }) and returns the new
// list. Writes data/approved-stocks.json, which the app and Python both read.
import { getApproved, addApproved, removeApproved, saveApproved } from "@/lib/approved";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ symbols: getApproved() });
}

export async function POST(req: Request) {
  let body: { action?: string; symbol?: string; symbols?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  let symbols: string[];
  switch (body.action) {
    case "add":
      symbols = addApproved(body.symbol ?? "");
      break;
    case "remove":
      symbols = removeApproved(body.symbol ?? "");
      break;
    case "set":
      symbols = saveApproved(Array.isArray(body.symbols) ? body.symbols : []);
      break;
    default:
      return Response.json({ error: "unknown action" }, { status: 400 });
  }
  return Response.json({ symbols });
}
