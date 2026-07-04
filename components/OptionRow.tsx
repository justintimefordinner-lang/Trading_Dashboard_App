"use client";

// Expandable option row for the Options overview list. Collapsed: symbol/strike,
// exp/DTE/Δ, value, P/L. Tapped open: the full detail — CSPs mirror the CSP-tab
// cards; LEAPs/hedges get the parallel long-option breakdown (incl. long-term-
// gains status).
import { useState } from "react";
import type { ReactNode } from "react";
import { Amt } from "@/components/privacy";
import { MiniBar } from "@/components/charts";
import { CopyButton } from "@/components/CopyButton";
import { formatPositionCopy } from "@/lib/position-copy";
import type { OptionPosition } from "@/lib/types";
import {
  capturedPct,
  cspAnnualizedReturn,
  cspCollateral,
  cspInsight,
  cspPremiumYield,
  cspRemainingAnnualized,
  cspRemainingPremium,
  cspRemainingYield,
  cspRiskBand,
  cspToStrike,
  cspEarningsFlag,
  bbSigmaText,
  bbSigmaZone,
  bbSigmaColor,
  CSP_RISK_TEXT,
  daysBetween,
  daysToExpiry,
  fmtMoney,
  fmtPct,
  LEVEL_STYLES,
  longTermDate,
  optionBasis,
  optionMarketValue,
  optionPnl,
  optionPnlPct,
} from "@/lib/calc";

// Shared column template so the header (in OpenGroupCard) and the rows line up.
export const CSP_COLS = "grid grid-cols-[1.0fr_0.7fr_0.4fr_0.76fr_0.76fr_0.8fr_0.72fr_0.68fr] items-center gap-x-1";
// LEAP table: Ticker · DTE · Value · P/L % · P/L $ · Δ.
export const LEAP_COLS = "grid grid-cols-[1.35fr_0.5fr_0.9fr_0.82fr_0.9fr_0.6fr] items-center gap-x-1";
export const compactMoney = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1000) return `$${(n / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
};
// P/L %: green highlight once ≥50% of the premium is captured; red when underwater.
export function plPctClass(p: number): string {
  if (p > 0.5) return "bg-emerald-500/25 text-emerald-100";
  if (p < 0) return "text-rose-400";
  return "";
}
// LEAPs hit green at a lower bar — any gain over +10% on cost; red when underwater.
function leapPlPctClass(p: number): string {
  if (p > 0.1) return "bg-emerald-500/25 text-emerald-100";
  if (p < 0) return "text-rose-400";
  return "";
}
// Yr % gradient: red <20%, orange <25%, yellow <30%, then light→green→dark green→blue.
export function yrClass(y: number): string {
  if (y < 0.2) return "bg-rose-500/25 text-rose-100";
  if (y < 0.25) return "bg-orange-500/25 text-orange-100";
  if (y < 0.3) return "bg-amber-400/25 text-amber-50";
  if (y < 0.4) return "bg-emerald-500/15 text-emerald-200";
  if (y < 0.55) return "bg-emerald-500/30 text-emerald-100";
  if (y < 0.75) return "bg-emerald-600/45 text-emerald-50";
  return "bg-sky-500/30 text-sky-100";
}

// Compact before→after for a tight collapsed cell under Simulate: the real value
// struck through (tiny) sits above the projected value. Collapses to just the
// projected value when nothing changed, or when not simulating.
export function SimCell({ show, real, children }: { show: boolean; real: ReactNode; children: ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <span className="flex flex-col items-end gap-0.5 leading-none">
      <span className="tabular text-[9px] font-normal text-muted/50 line-through">{real}</span>
      {children}
    </span>
  );
}

export function OptionRow({ o, real, sim }: { o: OptionPosition; real?: OptionPosition; sim?: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((v) => !v);
  const dte = daysToExpiry(o.expiration);
  const pnl = optionPnl(o);
  // Under Simulate, `o` is the projected position and `real` its pre-sim counterpart,
  // so the P/L cells can show the real value struck through above the projected one.
  const simActive = !!(sim && real);
  const realPnl = real ? optionPnl(real) : pnl;
  const showPnl = simActive && Math.abs(pnl - realPnl) >= 0.005;

  // CSPs (and covered calls — same short-premium ledger) render as a compact
  // table row; indicators move into the expanded detail.
  if (o.kind === "csp" || o.kind === "covered-call") {
    const coll = cspCollateral(o);
    const pnlPct = optionPnlPct(o);
    const realPnlPct = real ? optionPnlPct(real) : pnlPct;
    const showPct = simActive && Math.abs(pnlPct - realPnlPct) >= 0.00005;
    const toStrike = cspToStrike(o);
    const lastPx = o.underlyingPrice && o.underlyingPrice > 0 ? o.underlyingPrice : null;
    // Yr % = how hard the collateral is working *now*: annualized return on the
    // current mark (remaining premium), not the original credit. Action catalyst —
    // low means most premium is captured, so close/roll and redeploy.
    const yearlyPct = cspRemainingAnnualized(o);
    return (
      <div>
        <button onClick={toggle} className={`${CSP_COLS} w-full px-3 py-2.5 text-left text-[11px] active:bg-surface-2`}>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className={`truncate font-semibold ${CSP_RISK_TEXT[cspRiskBand(o)]}`}>{o.symbol}</span>
              {(() => {
                const er = cspEarningsFlag(o.expiration, o.erDate);
                return er ? (
                  <span
                    className={`shrink-0 text-[10px] font-bold ${er === "spans" ? "text-rose-500" : "text-orange-400"}`}
                    title={er === "spans" ? "Put spans earnings" : "Earnings within 7 days of expiry"}
                  >
                    -ER
                  </span>
                ) : null;
              })()}
            </div>
            <div className="truncate text-[10px] text-muted">${o.strike} · ×{o.qty}</div>
          </div>
          <span className={`tabular text-right ${bbSigmaColor(o.bbSigma)}`}>
            {o.bbSigma == null ? "—" : `${o.bbSigma > 0 ? "+" : ""}${o.bbSigma.toFixed(1)}`}
          </span>
          <span className="tabular text-right">{dte}</span>
          <span className="tabular text-right">
            <Amt>{compactMoney(coll)}</Amt>
          </span>
          <SimCell show={showPct} real={<>{realPnlPct >= 0 ? "+" : ""}{(realPnlPct * 100).toFixed(0)}%</>}>
            <span className={`tabular justify-self-end rounded px-1 py-0.5 ${plPctClass(pnlPct)}`}>
              {pnlPct >= 0 ? "+" : ""}
              {(pnlPct * 100).toFixed(0)}%
            </span>
          </SimCell>
          <SimCell show={showPnl} real={<Amt>{`${realPnl >= 0 ? "+" : "−"}${compactMoney(Math.abs(realPnl))}`}</Amt>}>
            <span className={`tabular text-right ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              <Amt>{`${pnl >= 0 ? "+" : "−"}${compactMoney(Math.abs(pnl))}`}</Amt>
            </span>
          </SimCell>
          <div className="text-right">
            <div className={`tabular ${toStrike != null && toStrike < 0 ? "text-rose-400" : ""}`}>
              {toStrike == null ? "—" : `${(toStrike * 100).toFixed(1)}%`}
            </div>
            <div className="tabular text-[10px] text-muted">
              {lastPx == null ? "—" : `$${lastPx >= 100 ? Math.round(lastPx).toLocaleString() : lastPx.toFixed(2)}`}
            </div>
          </div>
          <span className={`tabular justify-self-end rounded px-1 py-0.5 ${yrClass(yearlyPct)}`}>{(yearlyPct * 100).toFixed(1)}%</span>
        </button>
        {open && <CspDetail o={o} />}
      </div>
    );
  }

  // LEAP / hedge — compact table row; indicators move into the expanded detail.
  const val = optionMarketValue(o);
  const pnlPct = optionPnlPct(o);
  const realPnlPct = real ? optionPnlPct(real) : pnlPct;
  const showPct = simActive && Math.abs(pnlPct - realPnlPct) >= 0.00005;
  return (
    <div>
      <button onClick={toggle} className={`${LEAP_COLS} w-full px-3 py-2.5 text-left text-[11px] active:bg-surface-2`}>
        <div className="min-w-0">
          <div className="truncate font-semibold">{o.symbol}</div>
          <div className="truncate text-[10px] text-muted">${o.strike}{o.optionType === "put" ? "P" : "C"} · ×{o.qty}</div>
        </div>
        <span className="tabular text-right">{dte}</span>
        <span className="tabular text-right">
          <Amt>{compactMoney(val)}</Amt>
        </span>
        <SimCell show={showPct} real={<>{realPnlPct >= 0 ? "+" : ""}{(realPnlPct * 100).toFixed(0)}%</>}>
          <span className={`tabular justify-self-end rounded px-1 py-0.5 ${leapPlPctClass(pnlPct)}`}>
            {pnlPct >= 0 ? "+" : ""}
            {(pnlPct * 100).toFixed(0)}%
          </span>
        </SimCell>
        <SimCell show={showPnl} real={<Amt>{`${realPnl >= 0 ? "+" : "−"}${compactMoney(Math.abs(realPnl))}`}</Amt>}>
          <span className={`tabular text-right ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            <Amt>{`${pnl >= 0 ? "+" : "−"}${compactMoney(Math.abs(pnl))}`}</Amt>
          </span>
        </SimCell>
        <span className="tabular text-right">{o.delta.toFixed(2)}</span>
      </button>
      {open && <LeapDetail o={o} />}
    </div>
  );
}

function CspDetail({ o }: { o: OptionPosition }) {
  const ins = cspInsight(o);
  const s = LEVEL_STYLES[ins.level];
  const dte = daysToExpiry(o.expiration);
  const cap = capturedPct(o);
  const pl = optionPnl(o);
  const credit = optionBasis(o);
  const value = optionMarketValue(o);
  const coll = cspCollateral(o);
  const premYield = cspPremiumYield(o);
  const daysHeld = o.openedAt ? daysBetween(o.openedAt) : null;
  const termDays = o.openedAt ? daysToExpiry(o.expiration, o.openedAt) : null;
  // Full-credit annualized = the yield locked in at entry: original premium ÷
  // collateral, annualized over the ORIGINAL term (open→expiry), so it stays
  // fixed over the trade's life. Falls back to remaining DTE if openedAt unknown.
  const annualized = termDays && termDays > 0 ? premYield * (360 / termDays) : cspAnnualizedReturn(o);
  const returnToDate = coll > 0 ? pl / coll : 0;
  const annToDate = daysHeld && daysHeld > 0 ? returnToDate * (360 / daysHeld) : null;
  const remPrem = cspRemainingPremium(o);
  const remYield = cspRemainingYield(o);
  const remAnn = cspRemainingAnnualized(o);

  return (
    <div className="border-t border-border bg-surface-2/40 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm font-medium">
        <span>
          {o.symbol} <span className="text-muted">${o.strike} {o.optionType}{o.qty > 1 ? ` ×${o.qty}` : ""}</span>
        </span>
        {ins.level !== "hold" && (
          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${s.chip}`}>
            <span className={`h-1 w-1 rounded-full ${s.dot}`} />
            {ins.label}
          </span>
        )}
      </div>
      <dl className="space-y-1.5 text-xs">
        <Row k="Opened" v={o.openedAt ? `${o.openedAt} (${daysHeld}d ago)` : "—"} />
        <Row k="Expires" v={`${o.expiration} (${dte} DTE${termDays ? ` · ${termDays}d term` : ""})`} />
        {o.erDate && (() => {
          const er = cspEarningsFlag(o.expiration, o.erDate);
          const erDte = daysToExpiry(o.erDate);
          return (
            <Row
              k="Next earnings"
              v={
                <span className={er === "spans" ? "text-rose-400" : er === "near" ? "text-orange-400" : ""}>
                  {o.erDate} ({erDte}d){er === "spans" ? " · put spans earnings" : er === "near" ? " · within 7d of expiry" : " · clears expiry"}
                </span>
              }
            />
          );
        })()}
        <Row k="Contracts" v={`${o.qty} (×100 = ${o.qty * 100} sh)`} />
        <Row k="Credit received" v={<><Amt>{fmtMoney(credit)}</Amt> <span className="text-muted">(${o.entryPerShare.toFixed(2)}/sh)</span></>} />
        <Row k="Cost to buy-to-close" v={<><Amt>{fmtMoney(value)}</Amt> <span className="text-muted">(${o.mark.toFixed(2)}/sh)</span></>} />
        <Row k="P/L if closed now" v={<span className={pl >= 0 ? "text-emerald-400" : "text-rose-400"}><Amt>{`${pl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(pl))}`}</Amt> ({Math.round(cap * 100)}% of max)</span>} />
        <Row k="Collateral" v={<><Amt>{fmtMoney(coll)}</Amt> <span className="text-muted">cash-secured</span></>} />
        {o.bbSigma != null && (
          <Row
            k="Strike vs BB"
            v={<span className={bbSigmaColor(o.bbSigma)}>{bbSigmaText(o.bbSigma)} · {bbSigmaZone(o.bbSigma)}</span>}
          />
        )}
        <Row k="Premium yield" v={`${(premYield * 100).toFixed(2)}% of collateral`} />
        <Row k="Annualized (full credit)" v={fmtPct(annualized, 1)} />
        <Row k="Remaining value" v={<><Amt>{fmtMoney(remPrem)}</Amt> <span className="text-muted">(${o.mark.toFixed(2)}/sh uncaptured)</span></>} />
        <Row k="Return on remaining" v={`${(remYield * 100).toFixed(2)}% of collateral · ${fmtPct(remAnn, 0)} annualized`} />
        <Row k="Return to date" v={`${returnToDate >= 0 ? "+" : ""}${(returnToDate * 100).toFixed(2)}%${annToDate != null ? ` · ${fmtPct(annToDate, 0)} annualized` : ""}`} />
        <Row k="Win prob / Δ / IV" v={`${o.chanceOfProfitShort ? Math.round(o.chanceOfProfitShort * 100) + "%" : "—"} · ${o.delta.toFixed(2)} · ${(o.iv * 100).toFixed(0)}%`} />
      </dl>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-muted">Premium captured</span>
          <span className="tabular">{Math.round(cap * 100)}%</span>
        </div>
        <MiniBar pct={cap} color={cap >= 0.5 ? "#34d399" : cap >= 0 ? "#60a5fa" : "#fb7185"} />
      </div>
      {ins.level !== "hold" && (
        <div className={`mt-3 flex items-start gap-2 rounded-lg p-2 text-xs ${s.chip}`}>
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
          <span><span className="font-semibold">{ins.label}:</span> {ins.detail}</span>
        </div>
      )}
      <CopyButton text={formatPositionCopy(o)} />
    </div>
  );
}

function LeapDetail({ o }: { o: OptionPosition }) {
  const dte = daysToExpiry(o.expiration);
  const months = Math.round(dte / 30);
  const val = optionMarketValue(o);
  const cost = optionBasis(o);
  const pl = optionPnl(o);
  const plPct = optionPnlPct(o);
  const daysHeld = o.openedAt ? daysBetween(o.openedAt) : null;
  const ltDate = o.openedAt ? longTermDate(o.openedAt) : null;
  const daysToLt = ltDate ? daysToExpiry(ltDate) : null;
  const isHedge = o.kind === "leap-put-hedge";

  return (
    <div className="border-t border-border bg-surface-2/40 px-4 py-3">
      <dl className="space-y-1.5 text-xs">
        <Row k="Opened" v={o.openedAt ? `${o.openedAt} (${daysHeld}d ago)` : "—"} />
        <Row
          k="Long-term gains"
          v={
            daysToLt == null
              ? "—"
              : daysToLt <= 0
                ? <span className="text-emerald-400">✓ long-term</span>
                : `${daysToLt}d away (${ltDate})`
          }
        />
        <Row k="Expires" v={`${o.expiration} (${dte} DTE · ~${months}mo)`} />
        <Row k="Type" v={isHedge ? "Protective put (hedge)" : "Long call (LEAP)"} />
        <Row k="Contracts" v={`${o.qty} (×100 = ${o.qty * 100} sh)`} />
        <Row k="Cost basis" v={<><Amt>{fmtMoney(cost)}</Amt> <span className="text-muted">(${o.entryPerShare.toFixed(2)}/sh)</span></>} />
        <Row k="Market value" v={<><Amt>{fmtMoney(val)}</Amt> <span className="text-muted">(${o.mark.toFixed(2)}/sh)</span></>} />
        <Row k="P/L" v={<span className={pl >= 0 ? "text-emerald-400" : "text-rose-400"}><Amt>{`${pl >= 0 ? "+" : "−"}${fmtMoney(Math.abs(pl))}`}</Amt> ({fmtPct(plPct, 0)})</span>} />
        <Row k="Δ / IV / Breakeven" v={`${o.delta.toFixed(2)} · ${(o.iv * 100).toFixed(0)}% · $${o.breakeven.toFixed(0)}`} />
      </dl>
      <CopyButton text={formatPositionCopy(o)} />
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
