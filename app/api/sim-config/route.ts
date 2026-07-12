// Simulate-skew editor endpoint. GET returns the current skew; POST sets it
// ({ ivSkew: number }). Writes data/sim-config.json — seeded into the client
// store on load and read by the after-hours Simulate what-if. Mirrors the
// approved-stocks editor route.
import { getSimSkew, saveSimSkew } from "@/lib/sim-skew";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ivSkew: getSimSkew() });
}

export async function POST(req: Request) {
  let body: { ivSkew?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof body.ivSkew !== "number" || !Number.isFinite(body.ivSkew)) {
    return Response.json({ error: "ivSkew must be a number" }, { status: 400 });
  }
  return Response.json({ ivSkew: saveSimSkew(body.ivSkew) });
}
