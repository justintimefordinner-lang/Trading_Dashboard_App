"use client";

// The app's single scroll container. The shell is a fixed-height flex column and
// this inner panel is what actually scrolls (the document itself never does), so
// Next's built-in scroll restoration — which drives window scroll — can't help.
// This restores each route's scroll position on return (Back or re-entry), keyed
// by path in sessionStorage, to match the persisted expand/sort state.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function readSaved(pathname: string): number {
  try {
    const raw = sessionStorage.getItem(`scroll:${pathname}`);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function ScrollArea({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Last known user scroll offset. The container is reused across routes, so when
  // the incoming page swaps in, the browser resets scrollTop to 0 and fires a
  // scroll event; this ref lets us save the *outgoing* offset before that lands.
  const lastTop = useRef(0);
  const prevPath = useRef<string | null>(null);
  const pathname = usePathname();

  // On route change (a layout effect, so it runs synchronously during commit —
  // before the browser's async content-swap scroll-to-0 event): save the outgoing
  // page's offset, then restore the incoming page's. The follow-up rAF re-applies
  // once persisted rows have re-opened and grown the container a frame later.
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prevPath.current !== null && prevPath.current !== pathname) {
      try {
        sessionStorage.setItem(`scroll:${prevPath.current}`, String(lastTop.current));
      } catch {
        /* ignore */
      }
    }
    prevPath.current = pathname;
    const saved = readSaved(pathname);
    lastTop.current = saved;
    // Re-apply across a few ticks: the page's persisted rows re-open a frame or
    // two later and grow the container, so an early set can land short. Each pass
    // only nudges forward (scrollTop < saved) so it never fights a user who has
    // already started scrolling back up. rAF covers the common case; the timeouts
    // are a fallback for when rAF is delayed (e.g. a backgrounded tab).
    const apply = () => {
      const node = ref.current;
      if (node && node.scrollTop < saved) node.scrollTop = saved;
    };
    apply();
    const raf = requestAnimationFrame(apply);
    const t1 = setTimeout(apply, 60);
    const t2 = setTimeout(apply, 160);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname]);

  // Track the offset on every scroll (synchronously into the ref) and persist it
  // throttled, so a hard reload or tab-hide keeps the position too. Route-change
  // saves are handled above; here we always write under the active path.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      lastTop.current = el.scrollTop;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try {
          sessionStorage.setItem(`scroll:${prevPath.current ?? pathname}`, String(lastTop.current));
        } catch {
          /* ignore */
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
