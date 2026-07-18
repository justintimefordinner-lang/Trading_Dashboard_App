// Ask the bridge to generate a fresh Schwab login URL. Write-only: this just
// drops an empty marker into reauth_inbox/. The bridge (auto_push loop) sees it,
// generates the URL, and publishes it back through the app's own data/ folder
// (read via /api/schwab/status). The app never touches the App Key here.
import { requestReauthStart } from "@/lib/bridge-files";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    requestReauthStart();
  } catch {
    return Response.json({ ok: false, error: "Could not start re-authentication." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
