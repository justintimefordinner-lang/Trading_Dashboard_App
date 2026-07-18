// One-way status read: returns the sanitized schwab-auth.json the bridge writes
// into this app's own data/ folder. Contains no secrets — just whether setup is
// done, whether a token exists, the current auth-flow state, and (only while a
// login is pending) the Schwab login URL to open.
import { readAuthStatus } from "@/lib/bridge-files";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(readAuthStatus());
}
