"use client";

// A true Back affordance: returns to the actual previous screen (at its restored
// scroll + expansion state), not a fixed parent route. Falls back to `href` when
// there's no in-app history to go back to — e.g. the page was deep-linked or
// opened as the first entry in the tab — so Back never strands you or exits the app.
import { useRouter } from "next/navigation";

export function BackLink({ href = "/", label = "Back" }: { href?: string; label?: string }) {
  const router = useRouter();

  const onClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(href);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-border active:bg-surface"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
      {label}
    </button>
  );
}
