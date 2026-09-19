"use client";

// P&L header action: reconcile the app's realized P&L against Schwab's own
// Realized Gain/Loss report. The report is read in the browser (never
// uploaded), compared by symbol and by month, and every difference gets a
// plain reason. Nothing here changes a P&L number. The one thing it can write
// is cost bases for sales the app couldn't cost, taken from the report's lots
// and saved through the same endpoint the cost-basis prompt uses.
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { parseSchwabRealized, type SchwabReport } from "@/lib/schwab-realized";
import { proposeCostBasis, reconcile, type AppClosed, type EnteredBasis, type UnresolvedSale } from "@/lib/reconcile";

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const btn = "rounded-full bg-emerald-500/15 px-4 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 active:bg-emerald-500/25 disabled:opacity-50";
const quiet = "rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-border hover:text-text";

export function ReconcileSchwab({
  records,
  accounts,
  unresolved,
  entered = [],
}: {
  records: AppClosed[];
  accounts: { id: string; label: string }[];
  unresolved: UnresolvedSale[];
  entered?: EnteredBasis[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<SchwabReport | null>(null);
  const [fileName, setFileName] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [err, setErr] = useState("");
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);
  const [corrected, setCorrected] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stamped = records.some((r) => r.accountId);
  const result = useMemo(() => (report ? reconcile(report, records, accountId || null) : null), [report, records, accountId]);
  const basis = useMemo(() => (report ? proposeCostBasis(unresolved.filter((u) => u.costPerShare == null), report.lots, entered) : null), [report, unresolved, entered]);

  async function onFile(file: File) {
    setErr("");
    setApplied(null);
    setCorrected(null);
    const parsed = parseSchwabRealized(await file.text());
    if ("error" in parsed) return setErr(parsed.error);
    setFileName(file.name);
    setReport(parsed);
  }

  async function applyBasis() {
    if (!basis) return;
    setApplying(true);
    let ok = 0;
    for (const p of basis.proposals) {
      const res = await fetch("/api/stocks/cost-basis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, costPerShare: p.costPerShare, acquiredDate: p.acquiredDate ?? "" }),
      });
      if (res.ok) ok += 1;
    }
    setApplying(false);
    setApplied(ok);
    router.refresh();
  }

  // Replace hand-entered cost bases with the cost of the lots Schwab actually sold.
  async function applyCorrections() {
    if (!basis) return;
    setApplying(true);
    let ok = 0;
    for (const c of basis.corrections) {
      const res = await fetch("/api/stocks/cost-basis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, costPerShare: c.costPerShare, acquiredDate: c.acquiredDate ?? "" }),
      });
      if (res.ok) ok += 1;
    }
    setApplying(false);
    setCorrected(ok);
    router.refresh();
  }

  const pctOff = result && result.schwab.total !== 0 ? Math.abs((result.app.total - result.schwab.total) / result.schwab.total) : 0;

  return (
    <>
      <button onClick={() => setOpen(true)} title="Compare realized P&L with Schwab's Realized Gain/Loss report" className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-border active:bg-surface">
        Reconcile
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reconcile-title">
            <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface-2 p-5 text-xs ring-1 ring-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="reconcile-title" className="text-sm font-semibold">Reconcile with Schwab</h3>
                  <p className="mt-0.5 text-[11px] text-muted">{report ? `${fileName} · ${report.account ?? "account"} · ${result?.from} to ${result?.to}` : "Check the app's realized P&L against Schwab's own report"}</p>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-text">✕</button>
              </div>

              {!report && (
                <div className="mt-4 space-y-3">
                  <p className="text-muted">
                    On schwab.com: <span className="text-text">Accounts → History → Realized Gain/Loss</span>, pick the account and date range, then{" "}
                    <span className="text-text">Export</span>. Schwab asks what to export:
                  </p>
                  {/* The export dialog's two choices, drawn rather than screenshotted so it
                      reads in this theme. Only the right-hand one has the individual lots. */}
                  <div className="grid grid-cols-2 gap-2" aria-label="Choose Export Details Only in Schwab's export dialog">
                    <div className="rounded-xl border border-border bg-surface p-3 opacity-60">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">Export Summary Only</span>
                        <span className="grid h-4 w-4 place-items-center rounded-full ring-1 ring-inset ring-border text-[10px] text-muted">✕</span>
                      </div>
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-muted">
                        <li>No individual lots</li>
                        <li>No opening dates</li>
                      </ul>
                      <div className="mt-2 text-[11px] font-medium text-rose-300">Not this one</div>
                    </div>
                    <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">Export Details Only</span>
                        <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-400 text-[10px] font-bold text-[#0a0e14]">✓</span>
                      </div>
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-muted">
                        <li>Includes individual lots</li>
                        <li>Includes opening dates</li>
                      </ul>
                      <div className="mt-2 text-[11px] font-medium text-emerald-300">Choose this</div>
                    </div>
                  </div>
                  <p className="text-muted">
                    Then pick that CSV here. It is read in this browser and never uploaded; nothing about your P&amp;L changes.
                  </p>
                  <p className="text-muted">
                    Schwab&apos;s report is a tax document: it nets fees, folds an assigned option&apos;s premium into the shares, and disallows wash-sale losses.
                    The app reports economic P&amp;L. They should agree by symbol; where they don&apos;t, this says why.
                  </p>
                  <input ref={fileRef} id="reconcile-file" type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                  <button onClick={() => fileRef.current?.click()} className={btn}>Choose the Realized Gain/Loss CSV</button>
                  {err && <p className="text-rose-400">{err}</p>}
                </div>
              )}

              {report && result && (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-muted" htmlFor="reconcile-account">Compare against</label>
                    <select id="reconcile-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="rounded-xl border border-border bg-surface px-2 py-1 text-xs text-text">
                      <option value="">All accounts in the app</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                    <button onClick={() => { setReport(null); setErr(""); }} className={quiet}>Another file</button>
                  </div>
                  {accountId && !stamped && (
                    <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">
                      The closed trades on file don&apos;t carry an account yet. Update the bridge and press Build history once, then the per-account filter works.
                    </p>
                  )}
                  {accountId !== "" && stamped && result.app.unstamped > 0 && (
                    <p className="text-muted">{result.app.unstamped} closed trades have no account on them (manual entries) and are left out of a per-account comparison.</p>
                  )}

                  {/* Totals */}
                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-surface text-[10px] uppercase tracking-wide text-muted">
                          <th className="px-3 py-1.5 text-left font-medium">Realized</th>
                          <th className="px-3 py-1.5 text-right font-medium">Schwab</th>
                          <th className="px-3 py-1.5 text-right font-medium">App</th>
                          <th className="px-3 py-1.5 text-right font-medium">App − Schwab</th>
                        </tr>
                      </thead>
                      <tbody className="tabular">
                        {([
                          ["Options", result.schwab.options, result.app.options],
                          ["Stock", result.schwab.stock, result.app.stock],
                          ["Total", result.schwab.total, result.app.total],
                        ] as [string, number, number][]).map(([label, s, a]) => (
                          <tr key={label} className={`border-t border-border ${label === "Total" ? "font-semibold" : ""}`}>
                            <td className="px-3 py-1.5">{label}</td>
                            <td className="px-3 py-1.5 text-right">{money(s)}</td>
                            <td className="px-3 py-1.5 text-right">{money(a)}</td>
                            <td className={`px-3 py-1.5 text-right ${Math.abs(a - s) <= 5 ? "text-muted" : a - s >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{signed(a - s)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={pctOff <= 0.005 ? "text-emerald-400" : pctOff <= 0.02 ? "text-amber-300" : "text-rose-300"}>
                    {pctOff <= 0.005
                      ? `In agreement: within ${(pctOff * 100).toFixed(2)}% across ${result.schwab.lots} Schwab lots and ${result.app.records} app trades.`
                      : `Off by ${(pctOff * 100).toFixed(1)}%. ${result.matchedSymbols} symbols agree; ${result.bySymbol.length} don't, listed below largest first.`}
                  </p>

                  {/* What was set aside: Schwab lots from before the app's history begins */}
                  {result.historyStart && result.beforeHistory.lots > 0 && (
                    <p className="rounded-lg bg-surface px-3 py-2 text-muted ring-1 ring-inset ring-border">
                      Compared from <span className="text-text">{result.historyStart}</span>, the earliest trade the app has. This report also holds{" "}
                      {result.beforeHistory.lots.toLocaleString()} {result.beforeHistory.lots === 1 ? "lot" : "lots"} closed before then, worth{" "}
                      <span className="text-text">{money(result.beforeHistory.gain)}</span> ({money(result.beforeHistory.options)} options, {money(result.beforeHistory.stock)} stock).
                      Schwab&apos;s API doesn&apos;t reach back that far, so they are left out of every figure here rather than counted against the app.
                      For a like-for-like check, export from {result.historyStart} onward.
                    </p>
                  )}

                  {/* Cost basis from the report */}
                  {basis && (basis.proposals.length > 0 || basis.unmatched.length > 0) && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <div className="font-medium text-amber-200">
                        {basis.proposals.length} of {basis.proposals.length + basis.unmatched.length} sales missing a cost basis can be filled from this report
                        {basis.proposals.length > 0 && <> — worth {signed(basis.proposals.reduce((s, p) => s + p.gain, 0))} of realized P&amp;L</>}
                      </div>
                      {basis.proposals.length > 0 && (
                        <>
                          <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto tabular text-muted">
                            {basis.proposals.map((p) => (
                              <li key={p.id}>
                                <span className="font-semibold text-text" data-ticker={p.symbol}>{p.symbol}</span> {p.shares} sh sold {p.closeDate} @ ${p.soldAt.toFixed(2)} → cost ${p.costPerShare.toFixed(2)}
                                {p.acquiredDate ? `, bought ${p.acquiredDate}` : ""} · <span className={p.gain >= 0 ? "text-emerald-400" : "text-rose-400"}>{signed(p.gain)}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-2 flex items-center gap-2">
                            <button onClick={applyBasis} disabled={applying || applied !== null} className={btn}>
                              {applying ? "Saving…" : applied !== null ? `Saved ${applied}` : `Use these ${basis.proposals.length} cost bases`}
                            </button>
                            {applied !== null && <span className="text-muted">The bridge books them on its next rebuild, within a minute or two.</span>}
                          </div>
                        </>
                      )}
                      {basis.unmatched.length > 0 && (
                        <p className="mt-2 text-muted">Not in this report: {basis.unmatched.map((u) => `${u.symbol} ${u.closeDate}`).join(", ")}. Try a report covering those dates.</p>
                      )}
                    </div>
                  )}

                  {/* Cost bases typed in by hand that Schwab's lots disagree with */}
                  {basis && (basis.corrections.length > 0 || corrected !== null) && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      {basis.corrections.length > 0 ? (
                        <>
                          <div className="font-medium text-amber-200">
                            {basis.corrections.length} cost {basis.corrections.length === 1 ? "basis you entered doesn't" : "bases you entered don't"} match Schwab&apos;s lots — worth{" "}
                            {signed(basis.corrections.reduce((s, c) => s + c.delta, 0))} of realized P&amp;L
                          </div>
                          <p className="mt-1 text-[11px] text-muted">
                            Schwab&apos;s figure is the cost of the specific shares it sold. When only part of a position is sold that is usually not the position&apos;s average cost, which is the easy number to type.
                          </p>
                          <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto tabular text-muted">
                            {basis.corrections.map((c) => (
                              <li key={c.id}>
                                <span className="font-semibold text-text" data-ticker={c.symbol}>{c.symbol}</span> {c.shares} sh sold {c.closeDate} @ ${c.soldAt.toFixed(2)}: you entered ${c.enteredCost.toFixed(2)}, Schwab used{" "}
                                <span className="text-text">${c.costPerShare.toFixed(2)}</span> · <span className={c.delta >= 0 ? "text-emerald-400" : "text-rose-400"}>{signed(c.delta)}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-2">
                            <button onClick={applyCorrections} disabled={applying} className={btn}>
                              {applying ? "Saving…" : `Use Schwab's cost for ${basis.corrections.length === 1 ? "this sale" : `these ${basis.corrections.length}`}`}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="text-emerald-300">
                          Corrected {corrected} cost {corrected === 1 ? "basis" : "bases"}. The bridge re-books {corrected === 1 ? "it" : "them"} on its next rebuild, within a minute or two.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Differences by symbol */}
                  {result.bySymbol.length > 0 && (
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{pctOff <= 0.005 ? "Small differences — nothing to do" : "Where they differ"}</div>
                      <p className="mb-2 text-[11px] text-muted">
                        {pctOff <= 0.005
                          ? "These are tax-versus-economic and rounding differences: wash sales, how an assigned option's premium is spread over the shares, fee allocation on multi-fill orders. Worth a look only if one grows."
                          : "Work from the top. \"Needs a cost basis\", and a cost you typed that Schwab disagrees with, are fixed with the amber boxes above. \"Booked as expired\" or \"not in the app\" usually clears with Build history, which re-pulls a year of Schwab activity. Shares bought before that reach need \"Add a stock sale\". Wash-sale lines need nothing."}
                      </p>
                      <ul className="divide-y divide-border rounded-xl border border-border">
                        {result.bySymbol.slice(0, 40).map((d) => (
                          <li key={`${d.side}-${d.symbol}`} className="px-3 py-2">
                            <div className="flex items-baseline justify-between gap-2 tabular">
                              <span>
                                <span className="font-semibold" data-ticker={d.symbol}>{d.symbol}</span> <span className="text-muted">{d.side}</span>
                              </span>
                              <span className="text-muted">
                                Schwab {money(d.schwab)} · app {money(d.app)} · <span className={d.diff >= 0 ? "text-emerald-400" : "text-rose-400"}>{signed(d.diff)}</span>
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted">{d.reason}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* By month */}
                  <details className="rounded-xl border border-border bg-surface p-3">
                    <summary className="cursor-pointer font-medium">By month</summary>
                    <table className="mt-2 w-full border-collapse tabular">
                      <tbody>
                        {result.byMonth.map((m) => (
                          <tr key={m.month} className="border-t border-border/60">
                            <td className="py-1 text-muted">{m.month}</td>
                            <td className="py-1 text-right">{money(m.schwab)}</td>
                            <td className="py-1 text-right">{money(m.app)}</td>
                            <td className={`py-1 text-right ${Math.abs(m.diff) <= 5 ? "text-muted" : m.diff >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{signed(m.diff)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>

                  {result.washSales.lots > 0 && (
                    <p className="text-muted">
                      Schwab flagged {result.washSales.lots} wash-sale {result.washSales.lots === 1 ? "lot" : "lots"} and disallowed{" "}
                      <span className="text-text">{money(result.washSales.disallowed)}</span>{" "}
                      of loss. That loss isn&apos;t gone: it moves into the
                      replacement shares&apos; basis and shows up when they&apos;re sold. The app&apos;s economic P&amp;L counts it now, so it will read that much lower than Schwab until then.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
