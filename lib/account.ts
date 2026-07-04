// Resolves which account the user is viewing. Selection is stored in an
// "account" cookie (set by the client AccountSwitcher) so it persists across
// tabs and reloads. Falls back to the default account.
import { cookies } from "next/headers";
import type { Account, AccountData, Snapshot } from "./types";
import { ACCOUNT_COOKIE } from "./account-shared";

export { ACCOUNT_COOKIE, accountLabel } from "./account-shared";

export async function getSelectedAccountId(snap: Snapshot): Promise<string> {
  const store = await cookies();
  const id = store.get(ACCOUNT_COOKIE)?.value;
  if (id && snap.data[id]) return id;
  return (snap.accounts.find((a) => a.isDefault) ?? snap.accounts[0]).id;
}

export async function getSelectedAccount(
  snap: Snapshot,
): Promise<{ id: string; account: Account; data: AccountData }> {
  const id = await getSelectedAccountId(snap);
  const account = snap.accounts.find((a) => a.id === id) ?? snap.accounts[0];
  return { id, account, data: snap.data[id] };
}
