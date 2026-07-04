// Client-safe account helpers (no server-only imports like next/headers), so
// both the client AccountSwitcher and the server account resolver can use them.
import type { Account } from "./types";

export const ACCOUNT_COOKIE = "account";

/** Display label for an account, e.g. "Agentic" or "Individual". */
export function accountLabel(a: Account): string {
  if (a.nickname) return a.nickname;
  return a.brokerageType.charAt(0).toUpperCase() + a.brokerageType.slice(1);
}
