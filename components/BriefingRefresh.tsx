"use client";

// Morning Brief "Refresh" button. Write-only, same model as Build history: taps
// drop a marker in the bridge's task_inbox/ (via /api/briefing/refresh); the bridge
// runs am_report.main(force=True) and writes a sanitized report-status.json into the
// app's own data/ folder, which we poll (/api/briefing/status). On a fresh "done"
// we soft-refresh the page so the rebuilt brief appears. Never touches secrets.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Status {
  status: "idle" | "running" | "done" | "error";
  error: string | null;
  updatedAt: string | null;
}
type Phase = "idle" | "working" | "done" | "error";

const TIMEOUT_MS = 90_000; // am_report pulls market data — give it room

function friendly(err: string | null): string {
  const e = (err || "").toLowerCase();
  if (e.includes("token") || e.includes("credential") || e.includes("reconnect") || e.includes("auth"))
    return "Connect your Schwab account first (Settings → Schwab connection).";
  return err || "Refresh failed.";
}

export function BriefingRefresh() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const baseline = useRef<string | null>(null); // status timestamp at kickoff; ignore anything older

  const stop = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const beginPolling = useCallback(() => {
    stop();
    startedAt.current = Date.now();
    pollRef.current = setInterval(async () => {
      let s: Status | null = null;
      try {
        const r = await fetch("/api/briefing/status", { cache: "no-store" });
        if (r.ok) s = (await r.json()) as Status;
      } catch {
        return;
      }
      if (!s) return;
      const fresh = !!s.updatedAt && s.updatedAt !== baseline.current;
      if (s.status === "done" && fresh) {
        stop();
        setPhase("done");
        router.refresh();
        setTimeout(() => setPhase("idle"), 2500);
      } else if (s.status === "error" && fresh) {
        stop();
        setErrMsg(friendly(s.error));
        setPhase("error");
        setTimeout(() => setPhase("idle"), 6000);
      } else if (Date.now() - startedAt.current > TIMEOUT_MS) {
        stop();
        setErrMsg("Still working — make sure the bridge service is running.");
        setPhase("error");
        setTimeout(() => setPhase("idle"), 6000);
      }
    }, 3000);
  }, [router, stop]);

  // Resume the spinner if a refresh is already running (navigated away and back).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/briefing/status", { cache: "no-store" });
        if (!r.ok) return;
        const s = (await r.json()) as Status;
        if (!cancelled && s.status === "running") {
          baseline.current = s.updatedAt;
          setPhase("working");
          beginPolling();
        }
      } catch {
        /* no status yet — fine */
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [beginPolling, stop]);

  const start = useCallback(async () => {
    if (phase === "working") return;
    setPhase("working");
    setErrMsg("");
    try {
      // Snapshot the current status timestamp so a leftover "done"/"error" from a
      // prior run isn't mistaken for this one finishing instantly.
      try {
        const r0 = await fetch("/api/briefing/status", { cache: "no-store" });
        baseline.current = r0.ok ? ((await r0.json()) as Status).updatedAt : null;
      } catch {
        baseline.current = null;
      }
      const r = await fetch("/api/briefing/refresh", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || "Could not start.");
      beginPolling();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Failed to start.");
      setPhase("error");
      setTimeout(() => setPhase("idle"), 6000);
    }
  }, [phase, beginPolling]);

  const working = phase === "working";
  const label = phase === "done" ? "Updated" : phase === "error" ? "Failed" : working ? "Refreshing…" : "Refresh";

  return (
    <button
      onClick={() => void start()}
      disabled={working}
      title={phase === "error" ? errMsg : "Rebuild the morning brief from live market data"}
      className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-border transition-colors active:bg-surface disabled:opacity-80"
      aria-label="Refresh morning brief"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={working ? "animate-spin" : ""}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      <span className={phase === "done" ? "text-emerald-400" : phase === "error" ? "text-rose-400" : ""}>{label}</span>
    </button>
  );
}
