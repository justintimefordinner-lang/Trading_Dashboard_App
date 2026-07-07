"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "idle" | "requesting" | "pending" | "updated";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// Absolute run time as MM/DD/YY HH:MM in Mountain time (America/Denver), so it reads
// the same regardless of the viewer's device zone.
function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d
    .toLocaleString("en-US", {
      timeZone: "America/Denver",
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", "");
}

/** Read-only "Updated Xm ago" freshness chip; live-updates every 30s. */
export function Freshness({ generatedAt }: { generatedAt: string }) {
  const [rel, setRel] = useState(() => relativeTime(generatedAt));
  useEffect(() => {
    const id = setInterval(() => setRel(relativeTime(generatedAt)), 30_000);
    return () => clearInterval(id);
  }, [generatedAt]);
  return (
    <span
      className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-border"
      title={`Snapshot generated ${generatedAt}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      Updated <span suppressHydrationWarning>{rel}</span>
    </span>
  );
}

export function RefreshButton({ generatedAt }: { generatedAt: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [baseline] = useState(generatedAt);
  const stamp = fmtStamp(generatedAt);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Distinguish a real tap from a swipe (pull-to-refresh): a drag that started on
  // the button must NOT queue a Claude refresh — only a deliberate tap does.
  const draggedRef = useRef(false);
  const startYRef = useRef(0);

  // on mount, reflect any already-pending request
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => {
        if (s.pending) {
          setPhase("pending");
          startPolling();
        }
      })
      .catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await (await fetch("/api/status")).json();
        if (s.generatedAt && s.generatedAt !== baseline) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase("updated");
          router.refresh();
          setTimeout(() => setPhase("idle"), 2500);
        }
      } catch {
        // ignore transient errors
      }
    }, 3000);
  }

  async function requestRefresh() {
    if (phase === "requesting" || phase === "pending") return;
    setPhase("requesting");
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      if (!res.ok) throw new Error();
      setPhase("pending");
      startPolling();
    } catch {
      setPhase("idle");
    }
  }

  // Only a clean tap queues a refresh; a swipe (e.g. pull-to-refresh that began
  // on the button) is ignored, so reloading the page never pulls from Claude.
  function handleClick() {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    requestRefresh();
  }

  const spinning = phase === "requesting" || phase === "pending";
  const label =
    phase === "updated"
      ? "Updated"
      : phase === "pending"
        ? "Awaiting Claude…"
        : phase === "requesting"
          ? "Requesting…"
          : `Updated ${stamp}`;

  return (
    <button
      onClick={handleClick}
      onTouchStart={(e) => {
        draggedRef.current = false;
        startYRef.current = e.touches[0]?.clientY ?? 0;
      }}
      onTouchMove={(e) => {
        if (Math.abs((e.touches[0]?.clientY ?? 0) - startYRef.current) > 8) draggedRef.current = true;
      }}
      disabled={spinning}
      className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-border active:bg-surface disabled:opacity-80"
      aria-label="Refresh portfolio data"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={spinning ? "animate-spin" : ""}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      <span className={phase === "updated" ? "text-emerald-400" : ""} suppressHydrationWarning>{label}</span>
    </button>
  );
}
