// Sync the approved list from a Google Sheet. GET returns the saved sheet link.
// POST { action: "preview", url } reads the sheet and returns what would change;
// POST { action: "add" | "replace", url } applies it ("add" keeps names that are
// only in the app, "replace" makes the app match the sheet) and saves the link.
import { demoBlocked } from "@/lib/demo";
import { getApproved, addManyApproved, saveApproved } from "@/lib/approved";
import { fetchSheetTickers, getSheetSource, saveSheetSource } from "@/lib/approved-sheet";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ source: getSheetSource() });
}

export async function POST(req: Request) {
  const blocked = demoBlocked();
  if (blocked) return blocked;
  let body: { action?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const url = String(body.url ?? "").trim();
  let sheet: string[];
  try {
    sheet = await fetchSheetTickers(url);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't read the sheet" }, { status: 400 });
  }

  const current = getApproved();
  const added = sheet.filter((s) => !current.includes(s));
  const removed = current.filter((s) => !sheet.includes(s));

  switch (body.action) {
    case "preview":
      return Response.json({ sheet, added, removed });
    case "add":
    case "replace": {
      const symbols = body.action === "replace" ? saveApproved(sheet) : addManyApproved(sheet);
      saveSheetSource({ url, syncedAt: new Date().toISOString(), count: sheet.length });
      return Response.json({ symbols, added, removed: body.action === "replace" ? removed : [] });
    }
    default:
      return Response.json({ error: "unknown action" }, { status: 400 });
  }
}
