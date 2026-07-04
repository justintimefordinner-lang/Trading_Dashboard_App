"use client";

// One open-positions group: a titled card of expandable OptionRows plus a
// strategy-appropriate subtotal ledger. CSPs read as a cashflow ledger
// (collateral / premium / cost / realized-if-closed); long groups (LEAP calls,
// hedges) read as cost-basis / current-value / net-change. Shared by the
// per-type Options view so CSPs and LEAPs render identically.
import type { ReactNode } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { OptionRow, CSP_COLS, LEAP_COLS } from "@/components/OptionRow";
import { Amt } from "@/components/privacy";
import { fmtMoney, fmtPct, optionBasis, optionMarketValue, optionPnl } from "@/lib/calc";
import type { OptionPosition } from "@/lib/types";

const CSP_HEADERS: { key: string; label: string; right?: boolean }[] = [
  { key: "ticker", label: "Ticker" },
  { key: "bb", label: "BBσ", right: true },
  { key: "dte", label: "DTE", right: true },
  { key: "coll", label: "Coll", right: true },
  { key: "plpct", label: "P/L %", right: true },
  { key: "pldollar", label: "P/L $", right: true },
  { key: "tostrike", label: "To Strk", right: true },
  { key: "yr", label: "Yr %", right: true },
];

const LEAP_HEADERS: { key: string; label: string; right?: boolean }[] = [
  { key: "ticker", label: "Ticker" },
  { key: "dte", label: "DTE", right: true },
  { key: "value", label: "Value", right: true },
  { key: "plpct", label: "P/L %", right: true },
  { key: "pldollar", label: "P/L $", right: true },
  { key: "delta", label: "Δ", right: true },
];

export function OpenGroupCard({
  title,
  note,
  items,
  variant,
  action,
  emptyLabel = "No positions.",
  sort,
  onSort,
  realById,
  sim,
}: {
  title: string;
  note?: string;
  items: OptionPosition[];
  variant: "csp" | "long";
  action?: ReactNode;
  emptyLabel?: string;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  realById?: Map<string, OptionPosition>;
  sim?: boolean;
}) {
  const groupValue = items.reduce((s, o) => s + optionMarketValue(o), 0);
  // CSP ledger: premium collected − current cost to buy-to-close = realized gain if closed.
  // (Collateral total lives in the top-level card, so it's omitted here.)
  const cspPremium = items.reduce((s, o) => s + optionBasis(o), 0);
  const cspGain = cspPremium - groupValue;
  // Long ledger: cost basis → current value → net change.
  const groupCost = items.reduce((s, o) => s + optionBasis(o), 0);
  const groupNet = items.reduce((s, o) => s + optionPnl(o), 0);
  const groupNetPct = groupCost > 0 ? groupNet / groupCost : 0;

  return (
    <div>
      <SectionTitle action={action}>
        {title} <span className="font-normal text-muted">· {items.length}</span>
      </SectionTitle>
      {note && items.length > 0 && <p className="-mt-1 mb-2 px-1 text-[11px] text-muted">{note}</p>}
      {items.length === 0 ? (
        <Card className="px-4 py-5 text-center text-sm text-muted">{emptyLabel}</Card>
      ) : (
      <Card className="divide-y divide-border">
        {(() => {
          const cols = variant === "csp" ? CSP_COLS : LEAP_COLS;
          const headers = variant === "csp" ? CSP_HEADERS : LEAP_HEADERS;
          return (
            <div className={`${cols} px-3 py-1.5 text-[9px] font-medium uppercase tracking-wide`}>
              {headers.map((h) => {
                const active = sort?.key === h.key;
                return (
                  <button
                    key={h.key}
                    onClick={() => onSort?.(h.key)}
                    className={`flex items-center gap-0.5 ${h.right ? "justify-end" : "justify-start"} ${active ? "text-text" : "text-muted"} active:opacity-60`}
                  >
                    {h.label}
                    {active && <span>{sort!.dir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                );
              })}
            </div>
          );
        })()}
        {items.map((o) => (
          <OptionRow key={o.id} o={o} real={realById?.get(o.id)} sim={sim} />
        ))}
        {variant === "csp" ? (
          <div className="space-y-1 px-4 py-2.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted">Total premium collected</span>
              <span className="tabular font-medium">
                <Amt>{fmtMoney(cspPremium)}</Amt>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">− Current cost to close</span>
              <span className="tabular font-medium">
                −<Amt>{fmtMoney(groupValue)}</Amt>
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-1">
              <span className="font-medium">Realized gain if closed</span>
              <span className={`tabular font-semibold ${cspGain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                <Amt>{`${cspGain >= 0 ? "+" : "−"}${fmtMoney(Math.abs(cspGain))}`}</Amt>
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-1 px-4 py-2.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted">Cost basis</span>
              <span className="tabular font-medium">
                <Amt>{fmtMoney(groupCost)}</Amt>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Current value</span>
              <span className="tabular font-medium">
                <Amt>{fmtMoney(groupValue)}</Amt>
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-1">
              <span className="font-medium">Net change</span>
              <span className={`tabular font-semibold ${groupNet >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                <Amt>{`${groupNet >= 0 ? "+" : "−"}${fmtMoney(Math.abs(groupNet))}`}</Amt>
                <span className="ml-1 font-normal text-muted">({fmtPct(groupNetPct, 1)})</span>
              </span>
            </div>
          </div>
        )}
      </Card>
      )}
    </div>
  );
}
