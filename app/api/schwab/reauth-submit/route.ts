// Deposit the pasted post-login redirect URL for the bridge to exchange for a
// token. Write-only: the URL (which carries a one-time auth code) is written to
// reauth_inbox/redirect_url and consumed by the bridge. Never logged.
import { submitRedirectUrl } from "@/lib/bridge-files";

export const dynamic = "force-dynamic";

interface SubmitBody {
  url?: string;
}

export async function POST(req: Request) {
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const url = (body.url || "").trim();
  if (!url || !url.includes("code=")) {
    return Response.json(
      { ok: false, error: "Paste the full redirect URL — it should contain ?code=..." },
      { status: 400 },
    );
  }

  try {
    submitRedirectUrl(url);
  } catch {
    return Response.json({ ok: false, error: "Could not submit the redirect URL." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
