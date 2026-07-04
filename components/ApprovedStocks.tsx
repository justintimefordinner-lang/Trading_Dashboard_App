"use client";

// The approved universe as a filterable grid of tickers. Each chip is a slot the
// condition layer will later light up (a flag dot / badge when a setup triggers);
// for now it's the clean roster of names we're allowed to trade.
import { useState } from "react";

export function ApprovedStocks({ symbols }: { symbols: readonly string[] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toUpperCase();
  const shown = query ? symbols.filter((s) => s.includes(query)) : symbols;

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-muted">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter approved tickers…"
          className="w-full bg-transparent text-text placeholder:text-muted focus:outline-none"
        />
        {q && (
          <button onClick={() => setQ("")} className="shrink-0 text-muted active:opacity-60">
            ✕
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 px-1 text-[11px] text-muted">No approved tickers match “{q}”.</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {shown.map((s) => (
            <div
              key={s}
              className="flex items-center justify-center rounded-lg border border-border bg-surface px-2.5 py-2.5 text-sm font-semibold tracking-wide"
            >
              {s}
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 px-1 text-[11px] text-muted">
        {query ? `${shown.length} of ${symbols.length} shown` : `${symbols.length} approved names`}
      </p>
    </div>
  );
}
