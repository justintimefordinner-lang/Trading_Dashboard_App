"use client";

// Settings → Combine views: pick which accounts the Combined View merges.
// Toggling a checkbox saves straight to the "combineAccounts" cookie; "View
// combined" switches the account selection to the merged view and goes Home.
// With nothing ticked the Combined View disappears from the account switcher.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ACCOUNT_COOKIE, COMBINE_COOKIE, COMBINED_ID, writeClientCookie } from "@/lib/account-shared";

export interface CombineAccountOption {
  id: string;
  label: string;
  mask: string;
  type: string;
}

export function CombineViews({
  accounts,
  initialIds,
  combinedSelected,
}: {
  accounts: CombineAccountOption[];
  initialIds: string[];
  combinedSelected: boolean;
}) {
  const router = useRouter();
  const [ids, setIds] = useState<Set<string>>(() => new Set(initialIds));
  const [pending, startTransition] = useTransition();

  function persist(next: Set<string>) {
    setIds(next);
    writeClientCookie(COMBINE_COOKIE, next.size > 0 ? [...next].join(",") : null);
    // If the combined view is what's currently showing and it just lost every
    // member, fall back to the default account rather than an empty page.
    if (next.size === 0 && combinedSelected) writeClientCookie(ACCOUNT_COOKIE, null);
    startTransition(() => router.refresh());
  }

  function toggle(id: string) {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persist(next);
  }

  function selectAll() {
    persist(new Set(accounts.map((a) => a.id)));
  }

  function viewCombined() {
    writeClientCookie(ACCOUNT_COOKIE, COMBINED_ID);
    startTransition(() => router.push("/"));
  }

  if (accounts.length < 2) {
    return (
      <p className="text-xs text-muted">
        Only one account is linked. Combining needs at least two — add a second Schwab login (see the bridge's
        README) and it will appear here.
      </p>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted">
        Tick the accounts to merge. A <span className="font-medium text-text">Combined View</span> entry then
        appears in the account switcher on every page, summing balances, holdings, positions and the value
        history across them.
      </p>

      <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
        {accounts.map((a) => {
          const on = ids.has(a.id);
          return (
            <li key={a.id}>
              <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{a.label}</span>
                  <span className="block text-[11px] text-muted">
                    {a.mask} · {a.type}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(a.id)}
                  disabled={pending}
                  className="h-5 w-5 shrink-0 accent-emerald-500"
                  aria-label={`Include ${a.label} in the combined view`}
                />
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={viewCombined}
          disabled={pending || ids.size === 0}
          className="rounded-lg bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-300 ring-1 ring-inset ring-sky-500/30 disabled:opacity-40 active:opacity-70"
        >
          {combinedSelected ? "Back to Combined View" : "View combined"}
        </button>
        {ids.size < accounts.length && (
          <button type="button" onClick={selectAll} disabled={pending} className="text-xs text-muted active:opacity-60">
            Select all
          </button>
        )}
        <span className="ml-auto text-[11px] text-muted">
          {ids.size === 0 ? "Off" : `${ids.size} of ${accounts.length} accounts`}
        </span>
      </div>
    </div>
  );
}
