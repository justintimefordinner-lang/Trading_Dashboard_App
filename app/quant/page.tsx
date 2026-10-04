import Link from "next/link";
import { BackLink, Card, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { Amt, ShowAmounts } from "@/components/privacy";
import { QuantScanButton } from "@/components/QuantScanButton";
import { QuantSettings } from "@/components/QuantSettings";
import { extraMarginFor, readQuantSettings, STUDY_DEFAULTS } from "@/lib/quant-settings";
import { byTraderRank, rankPick, type QuantRank } from "@/lib/quant-rank";
import { getSnapshot } from "@/lib/snapshot";
import { accountLabel, COMBINED_ID, getCombineIds, getSelectedAccount } from "@/lib/account";
import { getVixSnapshot } from "@/lib/vix-data";
import { assessVix } from "@/lib/vix";
import { getQuantScan, quantCapacity, quantFit, type QuantFit, type QuantRow, type QuantScan } from "@/lib/quant";
import { cspEarningsFlag, fmtMoney } from "@/lib/calc";
import { getAmReport } from "@/lib/am-report";
import type { AmBoardRow } from "@/lib/am-report-types";

export const dynamic = "force-dynamic";

const pct = (n: number, d = 1) => `${n.toFixed(d)}%`;
const money0 = (n: number) => fmtMoney(n);

function Flag({ tone, children, title }: { tone: "amber" | "rose" | "sky" | "muted"; children: React.ReactNode; title?: string }) {
  const cls = {
    amber: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
    rose: "bg-rose-500/10 text-rose-300 ring-rose-500/25",
    sky: "bg-sky-500/10 text-sky-300 ring-sky-500/25",
    muted: "bg-surface-2 text-muted ring-border",
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${cls}`}>
      {children}
    </span>
  );
}

// Earnings mark, the way the Brief does it: a small ER on the ticker when the put
// spans the report (rose) or the report lands within a week after expiry (orange);
// the date and days sit in the hover title.
function erFlag(row: QuantRow, exp: string | undefined) {
  return exp ? cspEarningsFlag(exp, row.erDate) : null;
}
function erTitle(row: QuantRow, exp: string | undefined): string | undefined {
  const f = erFlag(row, exp);
  if (!f) return undefined;
  const when = `${row.erDate}${row.erDays != null ? ` · ${row.erDays}d` : ""}`;
  return f === "spans" ? `Put spans earnings ${when}` : `Earnings within 7 days after expiry ${when}`;
}
function ErMark({ row, exp }: { row: QuantRow; exp: string | undefined }) {
  const f = erFlag(row, exp);
  if (!f) return null;
  return <sup className={`ml-0.5 text-[7px] font-bold uppercase ${f === "spans" ? "text-rose-400" : "text-orange-400"}`}>ER</sup>;
}

// The Brief's tier + score for a name, as it shows on the CSP board.
const TIER_CLS: Record<string, string> = {
  S: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  A: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  B: "bg-surface-2 text-muted ring-border",
};
function BriefScore({ b }: { b: AmBoardRow | null }) {
  if (!b) return <span className="text-[10px] text-muted" title="The Brief hasn't scored this name yet (it scores the approved list each run)">no Brief score</span>;
  const failed = b.fails.length > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${failed ? "bg-surface-2 text-muted ring-border line-through decoration-rose-400/60" : TIER_CLS[b.tier] ?? TIER_CLS.B}`}
      title={`Brief screen: tier ${b.tier}, score ${Math.round(b.score)} · trend ${b.trend.uptrend ? "up" : "not up"} · VRP ${b.vrp}${b.ivr != null ? ` · IV rank ${Math.round(b.ivr)}` : ""}${failed ? ` · off the board: ${b.fails.join(", ")}` : ""}`}
    >
      {b.tier} · {Math.round(b.score)}
      <span className="font-normal opacity-80">{failed ? "off board" : b.vrp !== "n/a" ? b.vrp : ""}</span>
    </span>
  );
}

function RankBadge({ r }: { r: QuantRank }) {
  const cls = r.score >= 65 ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : r.score >= 45 ? "bg-sky-500/15 text-sky-300 ring-sky-500/30" : "bg-surface-2 text-muted ring-border";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${cls}`}
      title={`The Auto Trader's rank: spread ${r.spreadPct != null ? `${Math.round(r.spreadPct)}% of mid` : "unknown"} (40%), delta needed to reach the target (35%), IV/RV ${r.vrpRatio != null ? r.vrpRatio.toFixed(2) : "unknown"} (25%). ${r.perRound > 1 ? `Takes ${r.perRound} contracts a round when cash is short.` : "One contract a round when cash is short."}`}
    >
      rank {Math.round(r.score)}
    </span>
  );
}

function PickCard({ row, fit, P, brief, rank }: { row: QuantRow; fit: QuantFit | null; P: QuantScan["meta"]["params"] | undefined; brief: AmBoardRow | null; rank: QuantRank | null }) {
  const p = row.pick!;
  return (
    <Card className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-semibold" data-ticker={row.sym} title={erTitle(row, p.exp)}>
            {row.sym}
            <ErMark row={row} exp={p.exp} />
          </span>{" "}
          <span className="text-xs text-muted">
            {row.price != null ? `$${row.price.toFixed(2)}` : ""}
          </span>{" "}
          {rank && <RankBadge r={rank} />} <BriefScore b={brief} />
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-emerald-300">{pct(p.yield30, 1)} <span className="text-[10px] font-medium text-emerald-300/70">per 30 days</span></div>
          <div className="text-[10px] text-muted">{pct((p.mark / p.strike) * 100, 1)} for this {p.dte}-day put · target {P ? (P.targetYield * 100).toFixed(0) : 4}% per 30</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-x-2 gap-y-1 text-[11px] tabular">
        <div><span className="text-muted">Sell</span> <span className="text-text">${p.strike} put</span></div>
        <div><span className="text-muted">Exp</span> <span className="text-text">{p.exp.slice(5)}</span> <span className="text-muted">({p.dte}d)</span></div>
        <div><span className="text-muted">Δ</span> <span className="text-text">{p.delta.toFixed(2)}</span></div>
        <div><span className="text-muted">Mid</span> <span className="text-text">${p.mark.toFixed(2)}</span> <span className="text-muted">({p.bid.toFixed(2)}–{p.ask.toFixed(2)})</span></div>
        <div><span className="text-muted">Below</span> <span className="text-text">{p.belowSpotPct != null ? pct(p.belowSpotPct) : "—"}</span></div>
        <div><span className="text-muted">OI</span> <span className="text-text">{p.oi.toLocaleString()}</span></div>
        <div><span className="text-muted">Spread</span> <span className={p.spreadPct != null && p.spreadPct > 15 ? "text-amber-300" : "text-text"}>{p.spreadPct != null ? pct(p.spreadPct, 0) : "—"}</span></div>
        <div><span className="text-muted">Close at</span> <span className="text-text">${(p.mark / 2).toFixed(2)}</span></div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {fit && (
          <Flag tone={fit.contracts > 0 ? "sky" : "muted"} title={`How many of this put the rules allow right now: the smallest of free cash, room under the ${money0(fit.perTickerCap)} per-name cap (${money0(fit.committed)} already in this name) and room under buying power, divided by the ${money0(p.collateral)} one contract needs`}>
            {fit.contracts > 0 ? (
              <>
                up to {fit.contracts} contract{fit.contracts === 1 ? "" : "s"} · <Amt>{money0(p.collateral)}</Amt> each · <Amt>{money0(p.premium * fit.contracts)}</Amt> credit
              </>
            ) : (
              <>0 contracts fit · <Amt>{money0(p.collateral)}</Amt> each</>
            )}
          </Flag>
        )}
        {fit?.full && <Flag tone="amber" title={`${money0(fit.committed)} of a ${money0(fit.perTickerCap)} per-name cap is already in this name (shares, puts, LEAPS)`}>position full</Flag>}
        {fit?.held && !fit.full && <Flag tone="muted" title={`${money0(fit.committed)} already in this name`}>already held · add</Flag>}
        {fit?.cashShort && <Flag tone="rose" title="Free cash (after margin allowance and collateral already pledged) can't secure one contract">cash short</Flag>}
        {p.oi < 200 && <Flag tone="muted" title="Thin open interest">thin</Flag>}
      </div>
    </Card>
  );
}

// Collateral-per-contract bands for the capital filter. "fits" = what free cash
// can secure right now, which is usually the question.
const BANDS: { key: string; label: string; max: (freeCash: number) => number }[] = [
  { key: "fits", label: "fits free cash", max: (f) => f },
  { key: "5k", label: "≤ $5k", max: () => 5_000 },
  { key: "10k", label: "≤ $10k", max: () => 10_000 },
  { key: "25k", label: "≤ $25k", max: () => 25_000 },
  { key: "50k", label: "≤ $50k", max: () => 50_000 },
  { key: "all", label: "all", max: () => Infinity },
];

function qs(base: { earnings?: string; cap?: string; sort?: string }, patch: Partial<typeof base>): string {
  const q = new URLSearchParams();
  const v = { ...base, ...patch };
  if (v.earnings === "show") q.set("earnings", "show");
  if (v.cap && v.cap !== "fits") q.set("cap", v.cap);
  if (v.sort && v.sort !== "rank") q.set("sort", v.sort);
  const s = q.toString();
  return `/quant${s ? `?${s}` : ""}`;
}

export default async function QuantPage({ searchParams }: { searchParams: Promise<{ earnings?: string; cap?: string; sort?: string }> }) {
  // Names with a report inside the put's life are listed after the rest, the way
  // the Auto Trader queues them: the backtest traded through earnings, and
  // skipping them cost about 15 points a year.
  const params = await searchParams;
  const { earnings } = params;
  const skipEarnings = true;
  const snap = await getSnapshot();
  const example = snap.meta.source === "example";
  const { id: accountId, account, data } = await getSelectedAccount(snap);
  const scan = getQuantScan(example);
  const vixSnap = getVixSnapshot(example);
  const vix = vixSnap?.inputs.vix ?? null;
  // The rule's variables: the study's unless changed in Settings (the gear). The
  // scan on file may predate a change; the trader keeps the study's rule regardless.
  const settings = example ? { params: STUDY_DEFAULTS, custom: false } : readQuantSettings();
  const P = settings.params;
  // With the VIX margin allowance off, capacity is cash-secured only. With the VIX
  // cash allocation on, the VIX page's reserve for today's band is held back.
  // Extra margin set for this account (the Combined View adds up its accounts').
  const combined = accountId === COMBINED_ID;
  const extraMargin = combined ? (await getCombineIds(snap)).reduce((s, i) => s + extraMarginFor(P, i), 0) : extraMarginFor(P, accountId);
  const rawCap = quantCapacity(data, P.vixMargin ? vix : null, extraMargin);
  const reservePct = P.vixCash && vixSnap ? assessVix(vixSnap).targetReservePct : 0;
  const reserve = reservePct * rawCap.totalValue;
  const cap = reserve > 0 ? { ...rawCap, freeCash: Math.max(0, rawCap.freeCash - reserve) } : rawCap;

  // Order: the Auto Trader's rank by default (spread, cushion, IV/RV — the order it
  // hands out capital), or the Brief's score, or yield.
  const report = getAmReport(example);
  const board = new Map((report?.screened ?? report?.board ?? []).map((b) => [b.sym, b]));
  const vrpOf = (s: string) => board.get(s)?.vrpRatio ?? null;
  const sortBy = params.sort === "yield" ? "yield" : params.sort === "score" ? "score" : "rank";
  const traderOrder = byTraderRank(vrpOf);
  const byScore = (a: QuantRow, b: QuantRow) => {
    if (sortBy === "rank") return traderOrder(a, b);
    const sa = board.get(a.sym)?.score ?? -1;
    const sb = board.get(b.sym)?.score ?? -1;
    return sortBy === "score" && sb !== sa ? sb - sa : (b.pick?.yield30 ?? 0) - (a.pick?.yield30 ?? 0);
  };
  const rankOf = (r: QuantRow) => (r.pick ? rankPick(r.pick, vrpOf(r.sym)) : null);

  // Capital band: collateral per contract against what free cash can secure.
  const band = BANDS.find((b) => b.key === (params.cap ?? "fits")) ?? BANDS[0];
  const capMax = band.max(Math.max(0, cap.freeCash));

  const qualifying = scan ? scan.rows.filter((r) => r.pick) : [];
  const inBand = qualifying.filter((r) => (r.pick?.collateral ?? Infinity) <= capMax);
  const overBand = qualifying.length - inBand.length;
  const picks = (skipEarnings ? inBand.filter((r) => !r.erInWindow) : inBand).sort(byScore);
  const earningsSkipped = (skipEarnings ? inBand.filter((r) => r.erInWindow) : []).sort(byScore);
  const misses = scan ? scan.rows.filter((r) => !r.pick) : [];
  // Settings that reach the bridge (the VIX toggle is this page's alone): stale when the scan on file used other values.
  const bridgeKeys = ["targetYield", "yieldDays", "maxDelta", "expMin", "expMax", "expTarget", "closeAtPct"] as const;
  const scanParams = (scan?.meta.params ?? {}) as Partial<Record<(typeof bridgeKeys)[number], number>>;
  const scanStale = !!scan && !example && bridgeKeys.some((k) => scanParams[k] !== undefined && scanParams[k] !== P[k]);
  const fits = new Map(qualifying.map((r) => [r.sym, scan ? quantFit(r, data, cap, P) : null]));
  const asOf = scan ? new Date(scan.meta.asOf) : null;
  const view = { earnings, cap: band.key, sort: sortBy };

  return (
    <main className="px-4" data-wide="1">
      <ShowAmounts>
        <PageHeader
          title="Quant CSP scan"
          subtitle={scan ? `${scan.meta.qualifying} of ${scan.meta.universe} approved names pay the target · ${asOf?.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "No scan yet"}
          right={<BackLink />}
        />

        {/* Actions on their own row: three buttons beside the title squeezed it to one word a line on a phone. */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <QuantSettings current={P} defaults={STUDY_DEFAULTS} custom={settings.custom} demo={example} accountId={combined ? null : accountId} accountName={accountLabel(account)} />
          <QuantScanButton demo={example} />
        </div>

        {/* The rule, in one card, so nobody has to trust the list blind. */}
        <Card className="mt-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill className={`shrink-0 whitespace-nowrap ${settings.custom ? "bg-amber-500/10 text-amber-300 ring-amber-500/20" : "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"}`}>
              {settings.custom ? "Your rule" : "The rule"}
            </Pill>
            <span className="text-[11px] text-muted">
              {settings.custom ? "changed from the study's values in Settings; the trader keeps the study's rule" : "from the wheel backtests, 2022–2026 + 2023 hold-out"}
            </span>
            {scanStale && <span className="text-[11px] text-amber-300">· the scan on file used other values — press Scan now</span>}
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            <li>· Sell the <span className="text-text">lowest-delta</span> put paying <span className="text-text">≥ {(P.targetYield * 100).toFixed(1).replace(/\.0$/, "")}% of the strike per {P.yieldDays} days</span> (at the mid), never above <span className="text-text">{P.maxDelta} delta</span>.</li>
            <li>· {P.expTarget ? <>The expiration <span className="text-text">closest to {P.expTarget} days</span> ({P.expMin}–{P.expMax} days out)</> : <>Any expiration <span className="text-text">{P.expMin}–{P.expMax} days</span> out</>}; ties go to the higher yield. Skip the name if nothing pays.</li>
            <li>· <span className="text-text">Close at {P?.closeAtPct ?? 50}%</span> of the credit, even late in the put&apos;s life. Take assignment; buy a ~0.75Δ LEAPS on it.</li>
            <li>· Up to <span className="text-text">{P ? Math.round(P.maxPerTicker * 100) : 10}% of buying power per name</span> (a {P ? Math.round((P.maxPerTicker + P.tickerBand) * 100) : 15}% stretch allocation lets one more contract on when a name is under its cap). {P.vixMargin ? "Margin allowance scales with the VIX: 0 under 20, then 5% per 5 points, capped at 35%." : "VIX margin allowance off: cash-secured only (the study used the allowance)."}</li>
            <li>· When cash is short, names go in the <span className="text-text">Auto Trader&apos;s order</span>: no earnings inside the put first, then its rank. The trader sells the study&apos;s pick and follows these sizing settings.</li>
          </ul>
        </Card>

        {/* What this account can take on. */}
        <Card className="mt-3 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{account.nickname ?? account.mask} · capacity</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular sm:grid-cols-4">
            <div><span className="text-muted">Total</span> <Amt>{money0(cap.totalValue)}</Amt></div>
            <div><span className="text-muted">Free cash</span> <Amt className={cap.freeCash < 0 ? "text-rose-400" : ""}>{money0(cap.freeCash)}</Amt></div>
            <div><span className="text-muted">Collateral</span> <Amt>{money0(cap.putObligations)}</Amt> <span className="text-muted">CSPs + spread risk</span></div>
            <div><span className="text-muted">Per-name cap</span> <Amt>{money0((P?.maxPerTicker ?? 0.1) * cap.buyingPower)}</Amt></div>
            <div className="col-span-2 sm:col-span-4 text-muted">
              VIX {vix != null ? vix.toFixed(1) : "—"} → margin allowance {P.vixMargin ? `${Math.round(cap.margin * 100)}%` : "off (Settings)"}
              {cap.extraMargin > 0 && <> · extra margin <Amt>{money0(cap.extraMargin)}</Amt></>} · buying power <Amt>{money0(cap.buyingPower)}</Amt>
              {reserve > 0 && (
                <>
                  {" "}· VIX cash reserve {Math.round(reservePct * 100)}% (<Amt>{money0(reserve)}</Amt>) held back
                </>
              )}
            </div>
          </div>
        </Card>

        {!scan && (
          <Card className="mt-3 px-4 py-4 text-center text-xs text-muted">
            No scan on file yet. Press <span className="font-medium text-text">Scan now</span> — the bridge pulls one chain per approved name (about a minute) and the list appears here.
          </Card>
        )}

        {scan && (
          <>
            <SectionTitle
              action={earningsSkipped.length > 0 ? <span className="text-[11px] text-muted">{earningsSkipped.length} with earnings before expiry listed last</span> : undefined}
            >
              Recommended CSPs
            </SectionTitle>

            {/* Capital band + ordering. Chips, so the choice reads at a glance. */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-muted">Collateral per contract:</span>
              {BANDS.map((b) => (
                <Link
                  key={b.key}
                  href={qs(view, { cap: b.key })}
                  className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${b.key === band.key ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : "bg-surface-2 text-muted ring-border"}`}
                >
                  {b.key === "fits" ? `${b.label} (${money0(Math.max(0, cap.freeCash))})` : b.label}
                </Link>
              ))}
              <span className="ml-auto text-muted">
                order:{" "}
                <Link href={qs(view, { sort: "rank" })} className={sortBy === "rank" ? "text-text underline" : "underline"}>trader rank</Link>
                {" · "}
                <Link href={qs(view, { sort: "score" })} className={sortBy === "score" ? "text-text underline" : "underline"}>Brief score</Link>
                {" · "}
                <Link href={qs(view, { sort: "yield" })} className={sortBy === "yield" ? "text-text underline" : "underline"}>yield</Link>
              </span>
            </div>
            {overBand > 0 && (
              <p className="mb-2 px-1 text-[11px] text-muted">
                {overBand} more {overBand === 1 ? "name pays" : "names pay"} the target but {overBand === 1 ? "needs" : "need"} more collateral than this band — widen it to see {overBand === 1 ? "it" : "them"}.
              </p>
            )}
            {picks.length === 0 && (
              <Card className="px-4 py-4 text-center text-xs text-muted">
                {qualifying.length === 0
                  ? "Nothing on the approved list pays the target right now. That is the rule working: it sits out when premium is thin."
                  : "Nothing in this capital band. Widen it above."}
              </Card>
            )}
            <div className="space-y-2.5 tablet:grid tablet:grid-cols-2 tablet:gap-3 tablet:space-y-0">
              {picks.map((r) => (
                <PickCard key={r.sym} row={r} fit={fits.get(r.sym) ?? null} P={P} brief={board.get(r.sym) ?? null} rank={rankOf(r)} />
              ))}
            </div>

            {earningsSkipped.length > 0 && (
              <>
                <SectionTitle>Earnings inside the put&apos;s life: queued last</SectionTitle>
                <p className="mb-2 px-1 text-[11px] text-muted">These pay the target but report before the put expires. The backtest traded through earnings (skipping them cost about 15 points a year), so they still qualify; the Auto Trader sells them after the names above when cash is short.</p>
                <div className="space-y-2.5 tablet:grid tablet:grid-cols-2 tablet:gap-3 tablet:space-y-0">
                  {earningsSkipped.map((r) => (
                    <PickCard key={r.sym} row={r} fit={fits.get(r.sym) ?? null} P={P} brief={board.get(r.sym) ?? null} rank={rankOf(r)} />
                  ))}
                </div>
              </>
            )}

            {misses.length > 0 && (
              <>
                <SectionTitle>Not paying the target</SectionTitle>
                <Card className="divide-y divide-border px-0 py-0">
                  {misses.map((r) => (
                    <div key={r.sym} className="flex items-baseline justify-between gap-3 px-4 py-2 text-xs">
                      <span>
                        <span className="font-semibold" data-ticker={r.sym} title={erTitle(r, r.best?.exp)}>
                          {r.sym}
                          <ErMark row={r} exp={r.best?.exp} />
                        </span>{" "}
                        <span className="text-muted">{r.price != null ? `$${r.price.toFixed(2)}` : ""}</span>
                      </span>
                      <span className="text-right text-[11px] text-muted tabular">
                        {r.reason === "low" && r.best
                          ? <>best under {P?.maxDelta ?? 0.35}Δ: ${r.best.strike} {r.best.exp.slice(5)} at <span className="text-text">{pct(r.best.yield30)}</span> per 30 days ({r.best.delta.toFixed(2)}Δ)</>
                          : r.reason === "no_puts"
                            ? "no puts in the window"
                            : r.reason === "no_chain"
                              ? "no chain returned"
                              : r.reason}
                      </span>
                    </div>
                  ))}
                </Card>
              </>
            )}
          </>
        )}

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted">
          Yields use the mid price, about where a working limit order fills; the bid–ask is shown beside it. Nothing here places a trade. The backtest&apos;s basket was
          picked with hindsight, so treat the rule as a filter for names you already approve of, not a forecast; without the study&apos;s
          five biggest winners, its returns roughly halved.
        </p>
      </ShowAmounts>
    </main>
  );
}
