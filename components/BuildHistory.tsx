"use client";

// P&L "Build history" button — occupies the header slot the example button used
// to. New users have an empty P&L; this pulls their realized trade history from
// Schwab via the bridge.
//
// Write-only, same model as the Schwab connect flow: the app drops a marker and
// reads a one-way status from its OWN data/ folder — it never touches the
// bridge's secrets. If history already exists, clicking asks to confirm a rebuild
// first; a dialog surfaces the result when it finishes.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

interface Status {
  status: "idle" | "running" | "done" | "error";
  counts: Record<string, number> | null;
  error: string | null;
  updatedAt: string | null;
}
type Modal = "none" | "confirm" | "running" | "done" | "error";

const TIMEOUT_MS = 180_000; // room for the full ~2-year backfill before warning

function friendly(err: string | null): string {
  const e = (err || "").toLowerCase();
  if (e.includes("token") || e.includes("credential") || e.includes("reconnect") || e.includes("auth"))
    return "Connect your Schwab account first (Settings → Schwab connection).";
  if (e.includes("no linked")) return "No linked Schwab accounts found.";
  return err || "History rebuild failed.";
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

const BREAKDOWN: { key: string; label: string }[] = [
  { key: "csp", label: "CSPs" },
  { key: "covered", label: "Covered" },
  { key: "leap", label: "LEAPs" },
  { key: "spread", label: "Spreads" },
  { key: "stock", label: "Stocks" },
];

export function BuildHistory({ hasHistory }: { hasHistory: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal>("none");
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const baseline = useRef<string | null>(null); // status timestamp at kickoff; ignore anything older

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
      if (s.updatedAt && s.updatedAt === baseline.current) return; // stale pre-start snapshot
      if (s.status === "done") {
        stopPolling();
        setBusy(false);
        setCounts(s.counts);
        setModal("done");
        router.refresh();
      } else if (s.status === "error") {
        stopPolling();
        setBusy(false);
        setErrMsg(friendly(s.error));
        setModal("error");
      } else if (Date.now() - startedAt.current > TIMEOUT_MS) {
        stopPolling();
        setBusy(false);
        setErrMsg("Still working after a while — make sure the bridge service is running.");
        setModal("error");
      }
    }, 3000);
  }, [router, stopPolling]);

  // Resume the UI if a rebuild is already running (e.g. navigated away and back).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/history/status", { cache: "no-store" });
        if (!r.ok) return;
        const s = (await r.json()) as Status;
        if (!cancelled && s.status === "running") {
          setBusy(true);
          setModal("running");
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

  const doStart = useCallback(async () => {
    setBusy(true);
    setModal("running");
    setErrMsg("");
    try {
      // Snapshot the current status timestamp so a leftover "done" from a prior
      // run isn't mistaken for this one finishing instantly.
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
      setBusy(false);
      setErrMsg(e instanceof Error ? e.message : "Failed to start.");
      setModal("error");
    }
  }, [beginPolling]);

  function handleClick() {
    if (busy) {
      setModal("running"); // reopen progress if they tap again mid-build
      return;
    }
    if (hasHistory) setModal("confirm");
    else void doStart();
  }

  const total = counts?.total ?? null;

  return (
    <>
      <button
        onClick={handleClick}
        title="Build your trade history from Schwab"
        className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-border transition-colors active:bg-surface"
      >
        <ClockIcon />
        <span>{busy ? "Building…" : "Build history"}</span>
      </button>

      {modal !== "none" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
            onClick={() => setModal("none")}
          >
            <div
              className="w-full max-w-xs rounded-2xl bg-surface-2 p-5 ring-1 ring-border"
              onClick={(e) => e.stopPropagation()}
            >
              {modal === "confirm" && (
                <>
                  <div className="text-sm font-semibold text-text">Trade history already built</div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    You already have history, and it stays current on its own — the bridge pulls new closed
                    trades every cycle. A full rebuild usually isn&apos;t needed; do it only if history looks
                    incomplete or you&apos;ve switched accounts. It can take a minute and pauses other updates.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setModal("none")}
                      className="flex-1 rounded-lg bg-surface py-2 text-sm font-medium text-muted active:opacity-70"
                    >
                      Keep it
                    </button>
                    <button
                      onClick={() => void doStart()}
                      className="flex-1 rounded-lg bg-emerald-500/20 py-2 text-sm font-semibold text-emerald-200 active:opacity-70"
                    >
                      Rebuild anyway
                    </button>
                  </div>
                </>
              )}

              {modal === "running" && (
                <>
                  <div className="text-sm font-semibold text-text">Building trade history…</div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    Pulling your closed trades from Schwab (up to ~2 years). This can take a minute — you can
                    close this and keep using the app; we&apos;ll pop back up when it&apos;s done.
                  </p>
                  <div className="mt-4">
                    <button
                      onClick={() => setModal("none")}
                      className="w-full rounded-lg bg-surface py-2 text-sm font-medium text-muted active:opacity-70"
                    >
                      Continue in background
                    </button>
                  </div>
                </>
              )}

              {modal === "done" && (
                <>
                  <div className="text-sm font-semibold text-emerald-300">✓ Trade history built</div>
                  <p className="mt-1.5 text-xs text-muted">
                    {total != null ? (
                      <>
                        Imported <span className="font-semibold text-text">{total}</span> closed round-trip
                        {total === 1 ? "" : "s"}.
                      </>
                    ) : (
                      "Your realized history is ready."
                    )}
                  </p>
                  {counts && (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                      {BREAKDOWN.filter((b) => (counts[b.key] ?? 0) > 0).map((b) => (
                        <span key={b.key}>
                          {b.label} <span className="tabular font-medium text-text">{counts[b.key]}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-4">
                    <button
                      onClick={() => setModal("none")}
                      className="w-full rounded-lg bg-emerald-500/20 py-2 text-sm font-semibold text-emerald-200 active:opacity-70"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}

              {modal === "error" && (
                <>
                  <div className="text-sm font-semibold text-rose-300">Couldn&apos;t build history</div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{errMsg}</p>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setModal("none")}
                      className="flex-1 rounded-lg bg-surface py-2 text-sm font-medium text-muted active:opacity-70"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => void doStart()}
                      className="flex-1 rounded-lg bg-emerald-500/20 py-2 text-sm font-semibold text-emerald-200 active:opacity-70"
                    >
                      Try again
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
