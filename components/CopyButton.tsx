"use client";

import { useState } from "react";

// Copies `text` to the clipboard. Tries the async Clipboard API, then falls back to
// a hidden-textarea + execCommand — needed because the app is served over plain HTTP
// (Tailscale), where navigator.clipboard is usually unavailable.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label = "Copy trade summary" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(text);
    setState(ok ? "ok" : "fail");
    setTimeout(() => setState("idle"), 1600);
  };
  return (
    <button
      onClick={onClick}
      className={`mt-3 w-full rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors active:bg-surface ${
        state === "ok"
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
          : state === "fail"
            ? "border-rose-500/40 bg-rose-500/15 text-rose-200"
            : "border-border bg-surface-2 text-text"
      }`}
    >
      {state === "ok" ? "✓ Copied" : state === "fail" ? "Copy failed — long-press to select" : label}
    </button>
  );
}
