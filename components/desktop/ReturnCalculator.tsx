"use client";

// A standalone premium-return calculator for a short put or covered call,
// built around the question a short-DTE trade raises: "is this premium
// pulling its weight compared to a longer-dated one?"
//
// Annualization is the same 365-day basis lib/calc.ts uses (DAYS_PER_YEAR),
// so the answers here agree with the positions table. Collateral is taken
// NET of the credit received, since the credit lands at open.
//
// Ported from jttyeung's fork (components/desktop/ReturnCalculator.tsx on
// her staging branch); her backend-saved monthly target is replaced by a
// local default with a localStorage override.
import { useEffect, useMemo, useState } from "react";
import { DAYS_PER_YEAR, fmtMoney } from "@/lib/calc";

const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;

// The DTE ladder the comparison table walks: weekly, two- and three-week,
// monthly, and a 45-day upper bound.
const DTE_LADDER = [7, 14, 21, 30, 45];

// A calculator-local monthly target: a what-if, kept apart from anything the
// dashboard paces against.
const TARGET_KEY = "calcMonthlyTargetPct";
const DEFAULT_TARGET_PCT = 3;

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Premium needed for a given monthly rate on NET collateral: solving
// prem / (K - prem) = x for prem.
function requiredPremiumAt(strike: number, monthlyTarget: number, dte: number): number {
  const x = monthlyTarget * (dte / DAYS_PER_MONTH);
  return (strike * x) / (1 + x);
}

function pct(v: number, digits = 2): string {
  return `${v >= 0 ? "" : "-"}${Math.abs(v * 100).toFixed(digits)}%`;
}

export function ReturnCalculator({ defaultCapitalBase = null }: { defaultCapitalBase?: number | null }) {
  const [strike, setStrike] = useState("100");
  const [premium, setPremium] = useState("1.50");
  const [contracts, setContracts] = useState("1");
  const [dte, setDte] = useState("7");

  const [targetMonthlyPct, setTargetMonthlyPct] = useState(DEFAULT_TARGET_PCT);
  const [targetDraft, setTargetDraft] = useState(String(DEFAULT_TARGET_PCT));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TARGET_KEY);
      const v = raw ? parseFloat(raw) : NaN;
      if (Number.isFinite(v) && v > 0) {
        setTargetMonthlyPct(v);
        setTargetDraft(String(v));
      }
    } catch {
      /* storage unavailable — keep the default */
    }
  }, []);

  // Commit on blur (and Enter). A bad value reverts rather than leaving the
  // whole page computing against NaN.
  function commitTarget() {
    const parsed = parseFloat(targetDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setTargetDraft(String(targetMonthlyPct));
      return;
    }
    setTargetMonthlyPct(parsed);
    try {
      localStorage.setItem(TARGET_KEY, String(parsed));
    } catch {
      /* not persisted, but the session still uses it */
    }
  }

  const r = useMemo(() => {
    const k = num(strike);
    const p = num(premium);
    const n = Math.max(1, num(contracts) || 1);
    const d = Math.max(1, num(dte) || 1);

    const credit = p * 100 * n;
    // NET collateral: the credit lands at open, so a $62 put posting $6,200
    // really ties up $6,140.
    const collateral = k - p > 0 ? (k - p) * 100 * n : 0;
    const ror = collateral > 0 ? credit / collateral : 0;

    return {
      credit,
      collateral,
      ror,
      monthly: ror * (DAYS_PER_MONTH / d),
      annual: ror * (DAYS_PER_YEAR / d),
      perDay: d > 0 ? credit / d : 0,
      dte: d,
      strike: k,
      contracts: n,
    };
  }, [strike, premium, contracts, dte]);

  const target = targetMonthlyPct / 100;
  const meets = r.monthly >= target;

  // What premium the SAME strike would need at each DTE to clear the monthly
  // target — the direct answer to "am I being paid enough to go short-dated?"
  const ladder = useMemo(() => {
    return DTE_LADDER.map((d) => {
      const x = target * (d / DAYS_PER_MONTH);
      const requiredPremium = (r.strike * x) / (1 + x);
      return { dte: d, requiredPremium, requiredCredit: requiredPremium * 100 * r.contracts };
    });
  }, [target, r.strike, r.contracts]);

  const field = "w-full rounded-md bg-surface-2 px-3 py-2 text-sm tabular ring-1 ring-inset ring-border";
  const label = "mb-1 block text-[11px] uppercase tracking-wide text-muted";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={label} htmlFor="calc-strike">Strike</label>
            <input id="calc-strike" className={field} inputMode="decimal" value={strike} onChange={(e) => setStrike(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="calc-premium">Premium / share</label>
            <input id="calc-premium" className={field} inputMode="decimal" value={premium} onChange={(e) => setPremium(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="calc-contracts">Contracts</label>
            <input id="calc-contracts" className={field} inputMode="numeric" value={contracts} onChange={(e) => setContracts(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="calc-dte">DTE</label>
            <input id="calc-dte" className={field} inputMode="numeric" value={dte} onChange={(e) => setDte(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Credit" value={fmtMoney(r.credit)} sub={`${fmtMoney(r.perDay)}/day`} />
          <Stat label="Collateral" value={fmtMoney(r.collateral)} sub="net of credit received" />
          <Stat label="Return on capital" value={pct(r.ror)} sub={`over ${r.dte} DTE`} />
          <Stat label="Annualized" value={pct(r.annual, 1)} sub="365-day basis" tone={r.annual > 0 ? "pos" : undefined} />
        </div>

        <div className={`mt-4 rounded-xl border p-3 ${meets ? "border-pos/30 bg-pos/10" : "border-neg/30 bg-neg/10"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm">
              <span className="text-muted">Monthly equivalent</span>{" "}
              <span className={`text-lg font-bold tabular ${meets ? "text-pos" : "text-neg"}`}>{pct(r.monthly)}</span>
            </span>
            <span className="text-xs text-muted">
              {meets ? "clears" : "short of"} your {targetMonthlyPct.toFixed(2)}%/month target
            </span>
          </div>
          {!meets && r.strike > 0 && (
            <p className="mt-1 text-xs text-muted">
              At {r.dte} DTE you&apos;d need{" "}
              <span className="font-semibold text-text">{fmtMoney(requiredPremiumAt(r.strike, target, r.dte))}</span>/share
              {" "}({fmtMoney(requiredPremiumAt(r.strike, target, r.dte) * 100 * r.contracts)} total) to get there.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="flex flex-wrap items-center gap-1 text-sm font-semibold text-text">
          Premium needed to hit
          <input
            aria-label="Monthly target percent"
            className="w-16 rounded-md bg-surface-2 px-2 py-0.5 text-sm tabular ring-1 ring-inset ring-border"
            inputMode="decimal"
            value={targetDraft}
            onChange={(e) => setTargetDraft(e.target.value)}
            onBlur={commitTarget}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          %/month
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          At a {fmtMoney(r.strike)} strike. Shorter DTE needs less premium in absolute terms, but more per day — this is the
          comparison worth making before taking a weekly over a monthly.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="py-2 font-medium">DTE</th>
              <th className="py-2 text-right font-medium">Premium / share</th>
              <th className="py-2 text-right font-medium">Credit</th>
              <th className="py-2 text-right font-medium">Your premium</th>
            </tr>
          </thead>
          <tbody>
            {ladder.map((row) => {
              const isCurrent = row.dte === r.dte;
              const clears = num(premium) >= row.requiredPremium;
              return (
                <tr key={row.dte} className={`border-b border-border/60 ${isCurrent ? "bg-surface-2/60" : ""}`}>
                  <td className="py-2 tabular">
                    {row.dte}
                    {isCurrent && <span className="ml-1 text-[10px] text-muted">(yours)</span>}
                  </td>
                  <td className="py-2 text-right tabular">{fmtMoney(row.requiredPremium)}</td>
                  <td className="py-2 text-right tabular text-muted">{fmtMoney(row.requiredCredit)}</td>
                  <td className={`py-2 text-right tabular ${clears ? "text-pos" : "text-neg"}`}>{clears ? "clears" : "short"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <IncomeTargetTable defaultCapitalBase={defaultCapitalBase} />
    </div>
  );
}

// IncomeTargetTable answers the portfolio-level question rather than the
// per-trade one: for a given account size, what monthly rate does each level
// of monthly income actually require? The annual column COMPOUNDS,
// (1 + monthly)^12 − 1, deliberately unlike the 365/DTE simple annualization
// of the trade calculator above; the two answer different questions.
const STORE_KEY = "incomeTargetInputs";

function IncomeTargetTable({ defaultCapitalBase }: { defaultCapitalBase: number | null }) {
  const [portfolio, setPortfolio] = useState("");
  const [step, setStep] = useState("5000");
  const [touched, setTouched] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { portfolio?: string; step?: string };
        if (saved.portfolio) {
          setPortfolio(saved.portfolio);
          setTouched(true);
        }
        if (saved.step) setStep(saved.step);
      }
    } catch {
      /* absent or malformed — fall through to the defaults */
    }
    setRestored(true);
  }, []);

  // Only persist after the restore pass, so the initial empty state can't
  // overwrite what was saved.
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ portfolio, step }));
    } catch {
      /* private window or storage disabled — the table still works */
    }
  }, [portfolio, step, restored]);

  // With nothing saved, open on the real portfolio value rather than a placeholder.
  useEffect(() => {
    if (restored && !touched && defaultCapitalBase != null && defaultCapitalBase > 0) {
      setPortfolio(String(Math.round(defaultCapitalBase)));
    }
  }, [defaultCapitalBase, touched, restored]);

  const p = num(portfolio);
  const s = Math.max(1, num(step) || 1);

  const rows = useMemo(() => {
    if (p <= 0) return [];
    return Array.from({ length: 10 }, (_, i) => {
      const income = s * (i + 1);
      const monthly = income / p;
      return { income, monthly, annual: Math.pow(1 + monthly, 12) - 1 };
    });
  }, [p, s]);

  const field = "w-full rounded-md bg-surface-2 px-3 py-2 text-sm tabular ring-1 ring-inset ring-border";
  const label = "mb-1 block text-[11px] uppercase tracking-wide text-muted";

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-text">Income target by portfolio size</h3>
      <p className="mt-0.5 text-xs text-muted">
        What monthly rate each level of monthly income requires. Annual compounds month over month, unlike the per-trade
        figure above.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-sm">
        <div>
          <label className={label} htmlFor="calc-portfolio">Portfolio value</label>
          <input
            id="calc-portfolio"
            className={field}
            inputMode="decimal"
            value={portfolio}
            placeholder="850000"
            onChange={(e) => {
              setTouched(true);
              setPortfolio(e.target.value);
            }}
          />
        </div>
        <div>
          <label className={label} htmlFor="calc-step">Step</label>
          <input id="calc-step" className={field} inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} />
        </div>
      </div>

      {p <= 0 && <p className="mt-3 text-xs text-muted">Enter a portfolio value to see the table.</p>}

      {p > 0 && (
        <>
          <div className="mt-3 text-xs text-muted">Based on {fmtMoney(p)}:</div>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 font-medium">$/mo</th>
                <th className="py-2 text-right font-medium">Monthly rate</th>
                <th className="py-2 text-right font-medium">Annual (compounded)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.income} className="border-b border-border/60">
                  <td className="py-2 tabular">{fmtMoney(row.income)}</td>
                  <td className="py-2 text-right tabular">{pct(row.monthly)}</td>
                  <td className="py-2 text-right tabular text-muted">{pct(row.annual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`tabular text-lg font-bold ${tone === "pos" ? "text-pos" : "text-text"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted">{sub}</div>}
    </div>
  );
}
