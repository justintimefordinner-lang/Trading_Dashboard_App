"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/types";
import { ACCOUNT_COOKIE, accountLabel } from "@/lib/account-shared";

// Cross-app jump: this dashboard and its sibling run on adjacent ports on the
// same host (Schwab :3000, Wheel Toolkit :3001). Keep whatever host you're on
// (LAN IP, Tailscale, hostname) and just swap the port. Self-configuring from
// the current port, so this file is identical in both apps.
const OTHER_APP: Record<string, { port: string; label: string }> = {
  "3000": { port: "3001", label: "Robinhood" },
  "3001": { port: "3000", label: "Schwab" },
};

export function AccountSwitcher({
  accounts,
  selectedId,
}: {
  accounts: Account[];
  selectedId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState<{ label: string; href: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const { hostname, port, protocol } = window.location;
    const target = OTHER_APP[port];
    if (target) setOther({ label: target.label, href: `${protocol}//${hostname}:${target.port}` });
  }, []);

  const current = accounts.find((a) => a.id === selectedId) ?? accounts[0];

  function select(id: string) {
    document.cookie = `${ACCOUNT_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
    setOpen(false);
    if (id !== selectedId) router.refresh();
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1 text-xs font-medium text-muted active:text-text"
      >
        <span className="text-text">{accountLabel(current)}</span>
        <span>{current.mask}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-xl shadow-black/40"
        >
          {accounts.map((a) => {
            const active = a.id === current.id;
            return (
              <button
                key={a.id}
                role="option"
                aria-selected={active}
                onClick={() => select(a.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left active:bg-surface-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {accountLabel(a)}
                    {a.isDefault && (
                      <span className="rounded bg-surface-2 px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted">
                        default
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted">
                    {a.mask} · {a.type}
                  </div>
                </div>
                {active && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-emerald-400"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}

          {other && (
            <a
              href={other.href}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-sm font-medium text-sky-300 active:bg-surface-2"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d="M7 4 3 8l4 4" />
                <path d="M3 8h13" />
                <path d="m17 20 4-4-4-4" />
                <path d="M21 16H8" />
              </svg>
              Switch to {other.label}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
