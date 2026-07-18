"use client";

// Schwab connection: first-run setup (App Key + Secret) and the weekly
// re-authentication, entirely from the dashboard.
//
// Security model (see lib/bridge-files.ts + the bridge's reauth.py): this
// component only ever POSTs data INTO the bridge (credentials, a "start"
// request, the pasted redirect URL) and reads a sanitized status back from the
// app's OWN data/ folder. It never reads the bridge's secret files. The App
// Secret is held only transiently in this form and cleared right after saving.
import { useCallback, useEffect, useState } from "react";

interface Status {
  configured: boolean;
  hasToken: boolean;
  authStatus: "needs_setup" | "needs_login" | "awaiting_login" | "connected" | "error" | "idle";
  authorizationUrl: string | null;
  error: string | null;
  updatedAt: string | null;
}

function inputClass() {
  return "w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-muted/60 outline-none ring-emerald-400/40 focus:ring-2";
}
function labelClass() {
  return "mb-1 block text-xs font-medium text-muted";
}
function pillButton() {
  return "rounded-full bg-emerald-500/15 px-4 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 active:bg-emerald-500/25 disabled:opacity-60";
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || "Request failed.");
  return data;
}

export function SchwabConnect() {
  const [status, setStatus] = useState<Status | null>(null);
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState("");
  const [busy, setBusy] = useState<null | "setup" | "start" | "submit">(null);
  const [msg, setMsg] = useState<null | { kind: "ok" | "err"; text: string }>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/schwab/status", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as Status);
    } catch {
      // status file may not exist yet on a brand-new install — leave as loading
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  async function saveSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy("setup");
    setMsg(null);
    try {
      await postJson("/api/schwab/setup", { appKey, appSecret, callbackUrl });
      setAppSecret(""); // don't keep the secret around after it's been deposited
      await postJson("/api/schwab/reauth-start");
      setMsg({ kind: "ok", text: "Saved. Generating your Schwab login link…" });
      await refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setBusy(null);
    }
  }

  async function startReconnect() {
    setBusy("start");
    setMsg(null);
    try {
      await postJson("/api/schwab/reauth-start");
      setMsg({ kind: "ok", text: "Generating your Schwab login link…" });
      await refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Failed." });
    } finally {
      setBusy(null);
    }
  }

  async function submitRedirect(e: React.FormEvent) {
    e.preventDefault();
    setBusy("submit");
    setMsg(null);
    try {
      await postJson("/api/schwab/reauth-submit", { url: redirectUrl });
      setRedirectUrl("");
      setMsg({ kind: "ok", text: "Finishing sign-in… data resumes within a minute." });
      await refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Failed." });
    } finally {
      setBusy(null);
    }
  }

  if (!status) {
    return <p className="text-xs text-muted">Checking connection…</p>;
  }

  const s = status.authStatus;
  const needsSetup = !status.configured || s === "needs_setup";
  const awaiting = s === "awaiting_login" && !!status.authorizationUrl;
  const connected = s === "connected";

  return (
    <div className="space-y-4">
      {/* status line */}
      <div className="flex items-center gap-2 text-xs">
        <span
          className={
            "inline-block h-2 w-2 rounded-full " +
            (connected ? "bg-emerald-400" : awaiting ? "bg-amber-400" : needsSetup ? "bg-muted" : "bg-rose-400")
          }
        />
        <span className="text-muted">
          {connected
            ? "Connected to Schwab."
            : awaiting
              ? "Waiting for you to log in and paste the redirect URL."
              : needsSetup
                ? "Not set up yet — add your Schwab App Key and Secret."
                : "Not connected — reconnect to resume live data."}
        </span>
      </div>

      {/* 1) First-run setup */}
      {needsSetup && (
        <form onSubmit={saveSetup} className="space-y-3">
          <p className="text-xs text-muted">
            One time: paste your Schwab <strong>App Key</strong> and <strong>App Secret</strong> from{" "}
            developer.schwab.com. They&apos;re written straight into the bridge and never read back or shown again.
          </p>
          <div>
            <label className={labelClass()} htmlFor="schwab-appkey">App Key</label>
            <input
              id="schwab-appkey"
              className={inputClass()}
              autoComplete="off"
              value={appKey}
              onChange={(e) => setAppKey(e.target.value)}
              placeholder="e.g. hubyqeGuk8n…"
            />
          </div>
          <div>
            <label className={labelClass()} htmlFor="schwab-appsecret">App Secret</label>
            <input
              id="schwab-appsecret"
              type="password"
              className={inputClass()}
              autoComplete="off"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button type="button" className="text-[11px] text-muted underline" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "Hide" : "Advanced"} — callback URL
          </button>
          {showAdvanced && (
            <div>
              <label className={labelClass()} htmlFor="schwab-callback">Callback URL</label>
              <input
                id="schwab-callback"
                className={inputClass()}
                autoComplete="off"
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
                placeholder="https://127.0.0.1:8182"
              />
              <p className="mt-1 text-[11px] text-muted">
                Must exactly match the callback registered on your Schwab app. Leave blank for the default.
              </p>
            </div>
          )}

          <button type="submit" disabled={busy === "setup"} className={pillButton()}>
            {busy === "setup" ? "Saving…" : "Save & start login"}
          </button>
        </form>
      )}

      {/* 2) Reconnect (configured, but no active login yet) */}
      {!needsSetup && !awaiting && (
        <div className="space-y-2">
          <button onClick={startReconnect} disabled={busy === "start"} className={pillButton()}>
            {busy === "start" ? "Starting…" : connected ? "Reconnect Schwab" : "Connect Schwab"}
          </button>
          <p className="text-[11px] text-muted">
            Schwab tokens expire about weekly. Reconnect generates a fresh login link.
          </p>
        </div>
      )}

      {/* 3) Awaiting login — show the link and the paste box */}
      {awaiting && (
        <form onSubmit={submitRedirect} className="space-y-3">
          <ol className="list-decimal space-y-2 pl-4 text-xs text-muted">
            <li>
              <a
                href={status.authorizationUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-emerald-300 underline"
              >
                Log in to Schwab ↗
              </a>{" "}
              and approve access. Your browser will warn about the certificate on 127.0.0.1 — that&apos;s expected.
            </li>
            <li>
              The page won&apos;t load (that&apos;s normal). Copy the <strong>entire address</strong> from the address
              bar — it looks like <code className="text-[10px]">https://127.0.0.1:8182/?code=…</code>
            </li>
            <li>Paste it below and finish.</li>
          </ol>
          <textarea
            className={inputClass() + " h-20 font-mono text-[11px]"}
            placeholder="https://127.0.0.1:8182/?code=…&state=…"
            value={redirectUrl}
            onChange={(e) => setRedirectUrl(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy === "submit"} className={pillButton()}>
              {busy === "submit" ? "Finishing…" : "Finish sign-in"}
            </button>
            <button type="button" className="text-[11px] text-muted underline" onClick={startReconnect}>
              Regenerate link
            </button>
          </div>
        </form>
      )}

      {/* messages */}
      {msg && (
        <p className={"text-xs " + (msg.kind === "ok" ? "text-emerald-400" : "text-rose-400")}>{msg.text}</p>
      )}
      {status.error && s === "error" && <p className="text-xs text-rose-400">{status.error}</p>}
    </div>
  );
}
