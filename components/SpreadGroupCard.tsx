"use client";

// One open-spreads group: a sortable table of complete verticals (legs combined)
// plus a credit ledger. Mirrors the CSP table — collateral becomes the spread's
// capital at risk, and Yr% is the annualized return on the remaining spread value
// (the close/roll catalyst for credit spreads).
import { usePersistentState } from "@/lib/view-state";
import type { ReactNode } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { compactMoney, plPctClass, yrClass, SimCell } from "@/components/OptionRow";
import { daysBetween, daysToExpiry, fmtMoney, fmtPct, bbSigmaText, bbSigmaZone, bbSigmaColor } from "@/lib/calc";
import { type Spread } from "@/lib/spread";
import { CopyButton } from "@/components/CopyButton";
import { formatSpreadCopy } from "@/lib/position-copy";

// Spread · Last · DTE · Risk · P/L % · P/L $ · To Strk · Yr %
export const SPREAD_COLS = "grid grid-cols-[1.3fr_0.7fr_0.4fr_0.72fr_0.66fr_0.72fr_0.64fr_0.6fr] items-center gap-x-1";

const SPREAD_HEADERS: { key: string; label: string; right?: boolean }[] = [
  { key: "ticker", label: "Spread" },
  { key: "bb", label: "BBσ", right: true },
  { key: "dte", label: "DTE", right: true },
  { key: "risk", label: "Risk", right: true },
  { key: "plpct", label: "P/L %", right: true },
  { key: "pldollar", label: "P/L $", right: true },
  { key: "tostrike", label: "To Strk", right: true },
  { key: "yr", label: "Yr %", right: true },
];

export function SpreadGroupCard({
  title,
  note,
  spreads,
  emptyLabel = "No open spreads.",
  sort,
  onSort,
  action,
  realById,
  sim,
}: {
  title: string;
  note?: string;
  spreads: Spread[];
  emptyLabel?: string;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  action?: ReactNode;
  realById?: Map<string, Spread>;
  sim?: boolean;
}) {
  const credit = spreads.reduce((s, x) => s + x.maxProfit, 0);
  const curValue = spreads.reduce((s, x) => s + x.netMark * 100 * x.qty, 0);
  const gain = credit - curValue;

  return (
    <div>
      <SectionTitle action={action}>
        {title} <span className="font-normal text-muted">· {spreads.length}</span>
      </SectionTitle>
      {note && spreads.length > 0 && <p className="-mt-1 mb-2 px-1 text-[11px] text-muted">{note}</p>}
      {spreads.length === 0 ? (
        <Card className="px-4 py-5 text-center text-sm text-muted">{emptyLabel}</Card>
      ) : (
        <Card className="divide-y divide-border">
          <div className={`${SPREAD_COLS} px-3 py-1.5 text-[9px] font-medium uppercase tracking-wide`}>
            {SPREAD_HEADERS.map((h) => {
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
          {spreads.map((sp) => (
            <SpreadRow key={sp.id} sp={sp} real={realById?.get(sp.id)} sim={sim} />
          ))}
          <div className="space-y-1 px-4 py-2.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted">Total credit collected</span>
              <span className="tabular font-medium">
                <Amt>{fmtMoney(credit)}</Amt>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">− Current cost to close</span>
              <span className="tabular font-medium">
                −<Amt>{fmtMoney(curValue)}</Amt>
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-1">
              <span className="font-medium">Realized gain if closed</span>
              <span className={`tabular font-semibold ${gain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                <Amt>{`${gain >= 0 ? "+" : "−"}${fmtMoney(Math.abs(gain))}`}</Amt>
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function SpreadRow({ sp, real, sim }: { sp: Spread; real?: Spread; sim?: boolean }) {
  const [open, setOpen] = usePersistentState(`spreadrow:${sp.id}`, false);
  const simActive = !!(sim && real);
  const showPnl = simActive && Math.abs(sp.pnl - real!.pnl) >= 0.005;
  const showPct = simActive && Math.abs(sp.pnlPct - real!.pnlPct) >= 0.00005;
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${SPREAD_COLS} w-full px-3 py-2.5 text-left text-[11px] active:bg-surface-2`}
      >
        <div className="min-w-0">
          <div className="truncate font-semibold">{sp.symbol}</div>
          <div className="truncate text-[10px] text-muted">
            ${sp.shortStrike}/${sp.longStrike} · ×{sp.qty}
          </div>
        </div>
        <span className={`tabular text-right ${bbSigmaColor(sp.short.bbSigma)}`}>
          {sp.short.bbSigma == null ? "—" : `${sp.short.bbSigma > 0 ? "+" : ""}${sp.short.bbSigma.toFixed(1)}`}
        </span>
        <span className={`tabular ${sp.dte <= 21 ? "justify-self-end rounded px-1 py-0.5 bg-emerald-500/25 text-emerald-100" : "text-right"}`}>{sp.dte}</span>
        <span className="tabular text-right">
          <Amt>{compactMoney(sp.collateral)}</Amt>
        </span>
        <SimCell show={showPct} real={<>{real!.pnlPct >= 0 ? "+" : ""}{(real!.pnlPct * 100).toFixed(0)}%</>}>
          <span className={`tabular justify-self-end rounded px-1 py-0.5 ${plPctClass(sp.pnlPct)}`}>
            {sp.pnlPct >= 0 ? "+" : ""}
            {(sp.pnlPct * 100).toFixed(0)}%
          </span>
        </SimCell>
        <SimCell show={showPnl} real={<Amt>{`${real!.pnl >= 0 ? "+" : "−"}${compactMoney(Math.abs(real!.pnl))}`}</Amt>}>
          <span className={`tabular text-right ${sp.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            <Amt>{`${sp.pnl >= 0 ? "+" : "−"}${compactMoney(Math.abs(sp.pnl))}`}</Amt>
          </span>
        </SimCell>
        <div className="text-right">
          <div className={`tabular ${sp.toStrike != null && sp.toStrike < 0 ? "text-rose-400" : ""}`}>
            {sp.toStrike == null ? "—" : `${(sp.toStrike * 100).toFixed(1)}%`}
          </div>
          <div className="tabular text-[10px] text-muted">
            {sp.underlyingPrice && sp.underlyingPrice > 0 ? `$${sp.underlyingPrice >= 100 ? Math.round(sp.underlyingPrice).toLocaleString() : sp.underlyingPrice.toFixed(2)}` : "—"}
          </div>
        </div>
        <span className={`tabular justify-self-end rounded px-1 py-0.5 ${yrClass(sp.yr)}`}>
          {(sp.yr * 100).toFixed(1)}%
        </span>
      </button>
      {open && <SpreadDetail sp={sp} />}
    </div>
  );
}

function SpreadDetail({ sp }: { sp: Spread }) {
  const daysHeld = sp.openedAt ? daysBetween(sp.openedAt) : null;
  const termDays = sp.openedAt ? daysToExpiry(sp.expiration, sp.openedAt) : null;
  const months = Math.round(sp.dte / 30);
  const curValue = sp.netMark * 100 * sp.qty;
  const openingYield = sp.collateral > 0 ? sp.maxProfit / sp.collateral : 0;
  const openingAnn =
    termDays && termDays > 0
      ? openingYield * (360 / termDays)
      : sp.dte > 0
        ? openingYield * (360 / sp.dte)
        : 0;
  const typeLabel =
    sp.optionType === "put" ? "Bull put (credit) spread" : "Bear call (credit) spread";

  return (
    <div className="border-t border-border bg-surface-2/40 px-4 py-3">
      <dl className="space-y-1.5 text-xs">
        <Row k="Structure" v={`$${sp.shortStrike} / $${sp.longStrike} ${sp.optionType} · ×${sp.qty}`} />
        <Row k="Type" v={typeLabel} />
        <Row k="Opened" v={sp.openedAt ? `${sp.openedAt} (${daysHeld}d ago)` : "—"} />
        <Row k="Expires" v={`${sp.expiration} (${sp.dte} DTE${termDays ? ` · ${termDays}d term` : ""} · ~${months}mo)`} />
        <Row
          k="Net credit"
          v={<><Amt>{fmtMoney(sp.maxProfit)}</Amt> <span className="text-muted">(${sp.netCredit.toFixed(2)}/sh)</span></>}
        />
        <Row k="Width" v={`$${sp.width.toFixed(2)} wide`} />
        <Row k="Max profit" v={<span className="text-emerald-400"><Amt>{fmtMoney(sp.maxProfit)}</Amt></span>} />
        <Row k="Max loss (risk)" v={<span className="text-rose-400"><Amt>{fmtMoney(sp.maxLoss)}</Amt></span>} />
        <Row
          k="Cost to close now"
          v={<><Amt>{fmtMoney(curValue)}</Amt> <span className="text-muted">(${sp.netMark.toFixed(2)}/sh)</span></>}
        />
        <Row
          k="P/L if closed now"
          v={
            <span className={sp.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
              <Amt>{`${sp.pnl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(sp.pnl))}`}</Amt> ({Math.round(sp.pnlPct * 100)}% of max)
            </span>
          }
        />
        <Row k="Opening yield" v={`${(openingYield * 100).toFixed(1)}% of risk · ${fmtPct(openingAnn, 0)} annualized`} />
        <Row k="Return on remaining" v={`${(sp.remainingYield * 100).toFixed(1)}% of risk · ${fmtPct(sp.yr, 0)} annualized`} />
        <Row k="Breakeven" v={`$${sp.breakeven.toFixed(2)}`} />
        <Row
          k="To short strike"
          v={sp.toStrike == null ? "—" : <span className={sp.toStrike < 0 ? "text-rose-400" : ""}>{`${(sp.toStrike * 100).toFixed(1)}%`}{sp.underlyingPrice ? ` (px $${sp.underlyingPrice.toFixed(2)})` : ""}</span>}
        />
        {sp.short.bbSigma != null && (
          <Row
            k="Short strike vs BB"
            v={<span className={bbSigmaColor(sp.short.bbSigma)}>{bbSigmaText(sp.short.bbSigma)} · {bbSigmaZone(sp.short.bbSigma)}</span>}
          />
        )}
        <div className="!mt-2 border-t border-border pt-2 text-[11px] text-muted">
          <div className="flex items-center justify-between">
            <span>Short ${sp.short.strike} {sp.optionType}</span>
            <span className="tabular">${sp.short.entryPerShare.toFixed(2)} → ${sp.short.mark.toFixed(2)} · Δ {sp.short.delta.toFixed(2)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between">
            <span>Long ${sp.long.strike} {sp.optionType}</span>
            <span className="tabular">${sp.long.entryPerShare.toFixed(2)} → ${sp.long.mark.toFixed(2)} · Δ {sp.long.delta.toFixed(2)}</span>
          </div>
        </div>
      </dl>
      <CopyButton text={formatSpreadCopy(sp)} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="tabular text-right">{v}</dd>
    </div>
  );
}
