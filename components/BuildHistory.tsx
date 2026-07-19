"use client";

// P&L "Build trade history" control. New users start with an empty P&L; this
// pulls their realized history from Schwab via the bridge.
//
// Write-only, same model as the Schwab connect flow: the button POSTs a trigger
// that drops a marker into the bridge, and progress comes back one-way from the
// app's own data/ folder (/api/history/status). The app never reads the bridge's
// secrets. Shown as a prominent card when there's no history yet, or a small
// "rebuild" link once there is.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

interface Status {
  status: "idle" | "running" | "done" | "error";
  counts: Record<string, number> | null;
  error: string | null;
  updatedAt: string | null;
}

function friendly(err: string | null): string {
  const e = (err || "").toLowerCase();
  if (e.includes("token") || e.includes("credential") || e.includes("reconnect") || e.includes("auth")) {
    return "Connect your Schwab account first (Settings → Schwab connection).";
  }
  if (e.includes("no linked")) return "No linked Schwab accounts found.";
  return err || "History rebuild failed.";
}

const TIMEOUT_MS = 180_000; // give the full ~2-year backfill room before warning

export function BuildHistory({ hasHistory }: { hasHistory: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<null | { kind: "ok" | "err" | "info"; text: string }>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  // The updatedAt of the status file at the moment we kicked off, so we ignore a
  // stale "done"/"error" left over from a previous rebuild until the bridge writes
  // a fresh status for THIS request.
  const baseline = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const beginPolling = useCallback(() => {
    stopPolling();
    startedAt.current = Date.now();
    pollRef.current = setInterval(async () => {
      let s: Status | null = null;
      try {
        const r = await fetch("/api/history/status", { cache: "no-store" });
        if (r.ok) s = (await r.json()) as Status;
      } catch {
        return;
      }
      if (!s) return;
      if (s.updatedAt && s.updatedAt === baseline.current) return; // pre-start snapshot — wait for a fresh write
      if (s.status === "done") {
        stopPolling();
        setRunning(false);
        const total = s.counts?.total;
        setMsg({ kind: "ok", text: total != null ? `Built ${total} closed trade${total === 1 ? "" : "s"}. Refreshing…` : "Done. Refreshing…" });
        router.refresh();
      } else if (s.status === "error") {
        stopPolling();
        setRunning(false);
        setMsg({ kind: "err", text: friendly(s.error) });
      } else if (Date.now() - startedAt.current > TIMEOUT_MS) {
        stopPolling();
        setRunning(false);
        setMsg({ kind: "err", text: "Still working after a while — make sure the bridge service is running." });
      }
    }, 3000);
  }, [router, stopPolling]);

  // On mount, resume the UI if a rebuild is already in progress (e.g. navigated away and back).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/history/status", { cache: "no-store" });
        if (!r.ok) return;
        const s = (await r.json()) as Status;
        if (!cancelled && s.status === "running") {
          setRunning(true);
          setMsg({ kind: "info", text: "Building your trade history from Schwab…" });
          beginPolling();
        }
      } catch {
        /* no status yet — fine */
      }
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [beginPolling, stopPolling]);

  async function start() {
    setRunning(true);
    setMsg({ kind: "info", text: "Building your trade history from Schwab… this can take a minute." });
    try {
      // Snapshot the current status timestamp so we don't mistake a leftover
      // "done" from a previous run for this one completing instantly.
      try {
        const r0 = await fetch("/api/history/status", { cache: "no-store" });
        baseline.current = r0.ok ? ((await r0.json()) as Status).updatedAt : null;
      } catch {
        baseline.current = null;
      }
      const r = await fetch("/api/history/backfill", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || "Could not start.");
      beginPolling();
    } catch (e) {
      setRunning(false);
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to start." });
    }
  }

  const msgClass = (k: "ok" | "err" | "info") =>
    k === "err" ? "text-rose-400" : k === "ok" ? "text-emerald-400" : "text-muted";

  // New user: prominent card.
  if (!hasHistory) {
    return (
      <Card className="mt-3 px-4 py-4">
        <p className="text-sm font-semibold">No closed trades yet</p>
        <p className="mt-1 text-xs text-muted">
          Pull your realized trade history straight from Schwab — closed round-trips, assignments, and cost
          basis going back ~2 years. It&apos;s a one-time build; after that it stays current automatically.
        </p>
        <button
          onClick={start}
          disabled={running}
          className="mt-3 rounded-full bg-emerald-500/15 px-4 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 active:bg-emerald-500/25 disabled:opacity-60"
        >
          {running ? "Building…" : "Build trade history from Schwab"}
        </button>
        {msg && <p className={`mt-2 text-xs ${msgClass(msg.kind)}`}>{msg.text}</p>}
      </Card>
    );
  }

  // Existing user: compact rebuild affordance.
  return (
    <div className="mt-2 flex items-center justify-end gap-2">
      {msg && <span className={`text-[11px] ${msgClass(msg.kind)}`}>{msg.text}</span>}
      <button
        onClick={start}
        disabled={running}
        className="text-[11px] text-muted underline underline-offset-2 active:opacity-70 disabled:opacity-60"
      >
        {running ? "Rebuilding…" : "↻ Rebuild trade history"}
      </button>
    </div>
  );
}
