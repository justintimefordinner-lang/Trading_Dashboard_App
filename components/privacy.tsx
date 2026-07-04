"use client";

// "Example mode" toggle. Replaces the old hide/mask behavior: instead of masking
// figures, the whole app renders a self-consistent EXAMPLE dataset (see
// lib/example.ts) so it can be shown to others without exposing real values while
// keeping every feature fully functional. The button sets a cookie and refreshes
// so server-rendered values swap too.
import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

const COOKIE = "exampleMode";
const EXIT_PIN = "1111"; // PIN required to leave example mode and reveal real data

// ---- Legacy no-op shims kept so existing imports/usages don't need edits.
export function PrivacyProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function ShowAmounts({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export const usePrivacy = () => ({ hidden: false, toggle: () => {} });

/** Passthrough now that values are swapped at the data layer in example mode. */
export function Amt({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className}>{children}</span>;
}

function readCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c === `${COOKIE}=1`);
}

/** Toggles example mode for demos. Exported also as HideButton for back-compat.
 *  Entering the demo is free; leaving it (revealing real data) requires a PIN. */
export function ExampleButton() {
  const [on, setOn] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [err, setErr] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => setOn(readCookie()), []);

  const setMode = (next: boolean) => {
    document.cookie = `${COOKIE}=${next ? "1" : "0"}; path=/; max-age=${next ? 31536000 : 0}; SameSite=Lax`;
    setOn(next);
    // Full reload (not a soft router.refresh) so the server re-renders with the
    // new cookie reliably in production and on mobile browsers.
    window.location.reload();
  };

  const handleClick = () => {
    if (on) {
      setDigits(["", "", "", ""]);
      setErr(false);
      setPinOpen(true);
      setTimeout(() => boxes.current[0]?.focus(), 50);
    } else {
      setMode(true); // entering example mode is free
    }
  };

  const submit = (code: string) => {
    if (code === EXIT_PIN) {
      setPinOpen(false);
      setMode(false);
    } else {
      setErr(true);
      setDigits(["", "", "", ""]);
      boxes.current[0]?.focus();
    }
  };

  const onDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setErr(false);
    if (d && i < 3) boxes.current[i + 1]?.focus();
    if (next.every((x) => x !== "")) submit(next.join(""));
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
  };

  return (
    <>
      <button
        onClick={handleClick}
        aria-pressed={on}
        title={on ? "Switch back to real data (PIN required)" : "Show example data for a demo"}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors active:bg-surface ${
          on ? "bg-amber-500/15 text-amber-300 ring-amber-500/30" : "bg-surface-2 text-muted ring-border"
        }`}
      >
        <Beaker />
        <span>{on ? "Example on" : "Example"}</span>
      </button>

      {pinOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          onClick={() => setPinOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-surface-2 p-5 ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-text">Enter PIN</div>
            <div className="mb-4 mt-0.5 text-xs text-muted">Required to switch back to real data.</div>
            <div className="flex justify-center gap-2.5">
              {[0, 1, 2, 3].map((i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxes.current[i] = el;
                  }}
                  value={digits[i]}
                  onChange={(e) => onDigit(i, e.target.value)}
                  onKeyDown={(e) => onKey(i, e)}
                  inputMode="numeric"
                  type="password"
                  autoComplete="off"
                  maxLength={1}
                  className={`h-12 w-11 rounded-lg bg-surface text-center text-lg font-semibold text-text outline-none ring-1 ring-inset transition-colors ${
                    err ? "ring-rose-500/60" : "ring-border focus:ring-2 focus:ring-sky-500/50"
                  }`}
                />
              ))}
            </div>
            {err && <div className="mt-3 text-center text-xs text-rose-400">Incorrect PIN — try again</div>}
            <button
              onClick={() => setPinOpen(false)}
              className="mt-4 w-full rounded-lg bg-surface px-3 py-2 text-xs font-medium text-muted ring-1 ring-inset ring-border active:opacity-70"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// Back-compat alias: pages still import { HideButton }.
export { ExampleButton as HideButton };

function Beaker() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 3h6" />
      <path d="M10 3v6.5L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.5V3" />
      <path d="M7.5 14h9" />
    </svg>
  );
}
