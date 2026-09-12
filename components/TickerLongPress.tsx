"use client";

// Hold any ticker, anywhere in the app, for HOLD_MS (1.8s) and it opens in Lookup a
// Ticker (/chart?symbol=…). One global listener rather than per-component
// wiring: on pointer-down it reads the word under the finger straight from the
// DOM text (caretPositionFromPoint), and if that word looks like a ticker the
// hold timer starts. Moving, lifting, scrolling or a second finger cancels it.
//
// What counts as a ticker: 1–5 upper-case letters/digits, optional ".X" class
// suffix (BRK.B), as written in the DOM — Tailwind's `uppercase` only changes
// rendering, so an "OPTIONS" label is still "Options" in the text and never
// matches — minus a short stoplist of upper-case jargon the UI uses (CSP,
// LEAP, VIX…). A component can also opt in precisely with data-ticker="MU" on
// any wrapper, which wins over the text lookup.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const HOLD_MS = 1800;
const HINT_AFTER_MS = 450; // show the "hold to chart" pill once the press is clearly deliberate
const MOVE_TOLERANCE_PX = 12;
const TICKER_RE = /^[A-Z][A-Z0-9]{0,4}(\.[A-Z])?$/;
// Upper-case words the UI writes that are not tickers. Real tickers that
// happen to be words (ALL, CASH, F…) are rare in this app's text, so a
// short list beats a whitelist that would miss names from Research or the Brief.
const STOPLIST = new Set([
  "CSP", "CSPS", "CC", "CCS", "LEAP", "LEAPS", "PUT", "PUTS", "CALL", "CALLS", "PMCC",
  "VIX", "VXN", "VVIX", "SKEW", "MES", "ES", "SPX", "NDX", "RUT", "S5FI",
  "DTE", "DIT", "APY", "ROR", "ROI", "IV", "IVR", "OI", "ATM", "OTM", "ITM", "BE", "PL",
  "SMA", "EMA", "RSI", "MACD", "BB", "OTU", "BTC", "ETH", "USD", "ETF", "IRA", "ROTH",
  "AM", "PM", "ET", "EST", "EDT", "UTC", "YTD", "MTD", "QTD", "N", "A", "NA", "OK", "ID",
  "ALL", "MAX", "MIN", "AVG", "NET", "NEW", "EXP", "TOTAL", "CASH", "HOLD", "BUY", "SELL",
]);

function tickerAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;
  if (el.closest("input, textarea, select, [contenteditable='true'], [data-no-ticker-hold]")) return null;

  const tagged = el.closest<HTMLElement>("[data-ticker]");
  if (tagged?.dataset.ticker) {
    const t = tagged.dataset.ticker.trim().toUpperCase();
    return TICKER_RE.test(t) ? t : null;
  }

  // The text node and character offset under the point.
  let node: Node | null = null;
  let offset = 0;
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof doc.caretPositionFromPoint === "function") {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) {
      node = p.offsetNode;
      offset = p.offset;
    }
  } else if (typeof doc.caretRangeFromPoint === "function") {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  }

  let text: string;
  if (node && node.nodeType === Node.TEXT_NODE) {
    text = node.textContent ?? "";
  } else {
    // No caret support: fall back to a short leaf element's own text.
    text = (el.textContent ?? "").trim();
    if (text.length > 8) return null;
    offset = 0;
  }

  const isTokenChar = (ch: string) => /[A-Za-z0-9.]/.test(ch);
  let s = Math.min(offset, text.length);
  let e = s;
  while (s > 0 && isTokenChar(text[s - 1])) s--;
  while (e < text.length && isTokenChar(text[e])) e++;
  if (e === s && s > 0 && isTokenChar(text[s - 1])) s--; // caret sat just past the word
  const token = text.slice(s, e).replace(/^\.+|\.+$/g, "");
  if (!TICKER_RE.test(token) || STOPLIST.has(token)) return null;
  return token;
}

export function TickerLongPress() {
  const router = useRouter();
  const [hint, setHint] = useState<{ symbol: string } | null>(null);

  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let hintTimer: ReturnType<typeof setTimeout> | null = null;
    let press: { x: number; y: number; symbol: string; el: HTMLElement; prevSelect: string } | null = null;
    let suppressClick = false;

    const cancel = () => {
      if (holdTimer) clearTimeout(holdTimer);
      if (hintTimer) clearTimeout(hintTimer);
      holdTimer = hintTimer = null;
      if (press) {
        press.el.style.userSelect = press.prevSelect;
        press.el.style.webkitUserSelect = press.prevSelect;
        (press.el.style as CSSStyleDeclaration & { webkitTouchCallout?: string }).webkitTouchCallout = "";
      }
      press = null;
      setHint(null);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (press) {
        cancel(); // a second finger — not a hold
        return;
      }
      const symbol = tickerAt(e.clientX, e.clientY);
      if (!symbol) return;
      // Style the enclosing link when there is one: iOS raises its callout for
      // the <a>, not the span inside it.
      const target = e.target as HTMLElement;
      const el = target.closest<HTMLElement>("a, button") ?? target;
      press = { x: e.clientX, y: e.clientY, symbol, el, prevSelect: el.style.userSelect };
      // Keep iOS/Android from starting text selection or the link callout mid-hold.
      el.style.userSelect = "none";
      el.style.webkitUserSelect = "none";
      (el.style as CSSStyleDeclaration & { webkitTouchCallout?: string }).webkitTouchCallout = "none";

      hintTimer = setTimeout(() => setHint({ symbol }), HINT_AFTER_MS);
      holdTimer = setTimeout(() => {
        const target = press?.symbol;
        cancel();
        if (!target) return;
        suppressClick = true; // the release that follows would otherwise click through to a link
        setTimeout(() => {
          suppressClick = false;
        }, 800);
        try {
          navigator.vibrate?.(15);
        } catch {
          // no haptics — fine
        }
        router.push(`/chart?symbol=${encodeURIComponent(target)}`);
      }, HOLD_MS);
    };

    const onMove = (e: PointerEvent) => {
      if (!press) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE_PX) cancel();
    };
    const onEnd = () => {
      if (press) cancel();
    };
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const onContextMenu = (e: Event) => {
      if (press) e.preventDefault();
    };
    const onScroll = () => {
      if (press) cancel();
    };

    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onEnd, { passive: true });
    window.addEventListener("pointercancel", onEnd, { passive: true });
    window.addEventListener("click", onClickCapture, true);
    window.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      cancel();
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [router]);

  if (!hint) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-[calc(5.25rem_+_env(safe-area-inset-bottom))] z-50 flex justify-center px-4 sm:bottom-20"
    >
      <div className="w-56 overflow-hidden rounded-full bg-surface-2/95 text-center shadow-lg ring-1 ring-inset ring-border backdrop-blur">
        <div className="px-3 py-1.5 text-[11px] text-muted">
          Keep holding to chart <span className="font-semibold text-text">{hint.symbol}</span>
        </div>
        <div className="h-0.5 w-full bg-border">
          <div className="h-full bg-violet-400" style={{ animation: `hold-fill ${HOLD_MS - HINT_AFTER_MS}ms linear forwards` }} />
        </div>
      </div>
    </div>
  );
}
