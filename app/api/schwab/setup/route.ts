// First-run setup: deposit the Schwab App Key + Secret into the bridge's
// credentials.env (WHOLESALE write — never read back). type=password field on
// the client; nothing is logged or echoed. This is the app's only write of the
// secrets, and it never reads them again.
import { writeCredentials } from "@/lib/bridge-files";

export const dynamic = "force-dynamic";

interface SetupBody {
  appKey?: string;
  appSecret?: string;
  callbackUrl?: string;
}

export async function POST(req: Request) {
  let body: SetupBody;
  try {
    body = (await req.json()) as SetupBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const appKey = (body.appKey || "").trim();
  const appSecret = body.appSecret || "";
  const callbackUrl = (body.callbackUrl || "").trim();

  if (!appKey || !appSecret) {
    return Response.json(
      { ok: false, error: "App Key and App Secret are both required." },
      { status: 400 },
    );
  }
  if (callbackUrl && !/^https?:\/\//i.test(callbackUrl)) {
    return Response.json(
      { ok: false, error: "Callback URL must start with http(s)://" },
      { status: 400 },
    );
  }

  try {
    writeCredentials(appKey, appSecret, callbackUrl || undefined);
  } catch {
    // Deliberately generic — never surface a filesystem path that could leak
    // where secrets live.
    return Response.json({ ok: false, error: "Could not save credentials." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
