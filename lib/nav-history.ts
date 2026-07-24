"use client";

// Back/Forward vs. fresh-forward navigation detection, so view-state and scroll
// only restore on Back — navigating forward into a page shows it in its default
// state (collapsed, top), not however you last left it.
//
// We do NOT monkey-patch history.pushState/replaceState: Next's App Router owns
// those for its own router, and wrapping them breaks router init (dead handlers,
// no hydration). Instead we listen only for `popstate` — the one event a
// Back/Forward traversal fires — set a flag the restore logic reads at mount, and
// clear it once per route change via markNavigationHandled() (called from the
// always-mounted ScrollArea after restores have run). A fresh Link navigation
// fires no popstate, so the flag stays cleared and nothing restores.

let pendingPop = false;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    pendingPop = true;
  });
}

/** True when the current route render is the result of a Back/Forward traversal. */
export function wasBackNavigation(): boolean {
  return pendingPop;
}

/**
 * Clear the Back/Forward flag. Call once per route change, AFTER restore effects
 * have read it (a passive effect, which runs after all layout effects), so the
 * next fresh navigation is not mistaken for a Back.
 */
export function markNavigationHandled(): void {
  pendingPop = false;
}
