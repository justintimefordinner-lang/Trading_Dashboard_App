"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function StopwatchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`-mt-px inline-block shrink-0 ${className}`}
    >
      <path d="M9 2h6" />
      <path d="M12 2v2" />
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9.5v3.5l2 2" />
    </svg>
  );
}

// Live count to the next data refresh, off a `nextAt` ISO timestamp written by the
// pusher. Ticks each second; shows minutes (the "#"), drops to seconds in the last
// minute. When it expires it does a soft `router.refresh()` — re-runs the server
// component and re-reads the JSON, no full reload/flicker — so the screen tracks the
// file automatically. Stops auto-refreshing if the data is very stale (pusher down).
export function DataRefresh({
  nextAt,
  cadence,
  autoRefresh = true,
}: {
  nextAt?: string;
  cadence?: "fast" | "base";
  autoRefresh?: boolean;
}) {
  const router = useRouter();
  const [now, setNow] = useState<number>(() => Date.now());
  const lastRefresh = useRef<number>(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = nextAt ? new Date(nextAt).getTime() : NaN;
  const valid = !Number.isNaN(target);
  const expiredForMs = valid ? now - target : 0;
  // only auto-refresh in the window just after expiry (≤5 min); beyond that the
  // pusher is probably stopped, so don't loop forever.
  const justExpired = valid && expiredForMs >= 0 && expiredForMs <= 300_000;

  useEffect(() => {
    if (!autoRefresh || !justExpired) return;
    if (now - lastRefresh.current > 8_000) {
      lastRefresh.current = now;
      router.refresh();
    }
  }, [autoRefresh, justExpired, now, router]);

  if (!valid) return null;
  const secs = Math.round((target - now) / 1000);
  const text =
    secs > 0 ? (secs < 60 ? `${secs}s` : `${Math.ceil(secs / 60)}m`) : expiredForMs <= 300_000 ? "updating…" : "stale";
  const hot = cadence === "fast";

  return (
    <span
      title={hot ? "Fast cadence — active tape" : "Next data refresh"}
      className={`ml-1.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 align-middle text-[9px] font-semibold tabular ${
        hot ? "bg-rose-500/20 text-rose-200" : "bg-surface-2 text-muted"
      }`}
    >
      <StopwatchIcon /> {text}
    </span>
  );
}
