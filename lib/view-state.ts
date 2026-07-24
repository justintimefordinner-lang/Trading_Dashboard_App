"use client";

// Per-route view-state persistence. App Router unmounts a page when you navigate
// away and remounts it fresh on Back, so plain useState (expanded rows, sort,
// tab) is lost. These hooks mirror that state into sessionStorage keyed by the
// current path, so returning to a page — via Back or by tapping into it again —
// restores exactly where you were. State lives for the tab session and clears on
// reload, matching the app's "resume this session" behavior.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// useLayoutEffect on the client (rehydrate before paint → no collapse-then-expand
// flash); a no-op on the server to avoid the SSR warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function scopedKey(pathname: string, key: string): string {
  return `vs:${pathname}:${key}`;
}

function readSession<T>(storageKey: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(storageKey);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * useState that survives unmount by persisting to sessionStorage, scoped to the
 * current route. SSR-safe: the first render always returns `initial` (matching
 * the server HTML), then a layout effect rehydrates the stored value before the
 * browser paints. Writes happen only through the returned setter, so a remount
 * never clobbers stored state with the initial value.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const pathname = usePathname();
  const storageKey = scopedKey(pathname, key);
  const [value, setValue] = useState<T>(initial);
  // Keep the latest initial without forcing the rehydrate effect to re-run on
  // every render when callers pass a fresh object/array literal.
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useIsoLayoutEffect(() => {
    setValue(readSession(storageKey, initialRef.current));
  }, [storageKey]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(resolved));
        } catch {
          /* storage full / disabled — degrade to in-memory only */
        }
        return resolved;
      });
    },
    [storageKey],
  );

  return [value, set];
}

/**
 * The expand/collapse pattern shared by every list view: a set of open row ids
 * with a toggle. Backed by usePersistentState (stored as an array), so expansions
 * are restored on Back. Drop-in for the old `useState<Set<string>>(new Set())`
 * plus its hand-rolled toggle.
 */
export function usePersistentSet(key: string): {
  open: Set<string>;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
} {
  const [ids, setIds] = usePersistentState<string[]>(key, []);
  const open = useMemo(() => new Set(ids), [ids]);
  const toggle = useCallback(
    (id: string) => setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [setIds],
  );
  const has = useCallback((id: string) => open.has(id), [open]);
  return { open, has, toggle };
}
