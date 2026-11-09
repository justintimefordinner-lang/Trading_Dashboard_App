import { BackLink, Card, PageHeader, SectionTitle } from "@/components/ui";
import { ShowAmounts } from "@/components/privacy";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { PortfolioFit } from "@/components/PortfolioFit";
import { PostureStats } from "@/components/PostureStats";
import { MesCard, VixIndicators } from "@/components/VixIndicators";
import { getMesQuote } from "@/lib/mes-data";
import { appFeed, type FeedStatus } from "@/lib/refresh-status";
import { DataRefresh } from "@/components/DataRefresh";
import { SensaTickerLinks } from "@/components/SensaLinks";
import { getSnapshot } from "@/lib/snapshot";
import { getSelectedAccount } from "@/lib/account";
import { getVixSnapshot } from "@/lib/vix-data";
import { assessVix, REGIME_COLORS, type Regime } from "@/lib/vix";
import { assessVxn, compareVixVxn, VXN_REGIME_COLORS, type VxnRegime } from "@/lib/vxn";
import { freeCashValue } from "@/lib/calc";

export const dynamic = "force-dynamic";

const BANDS: { label: string; lo: number; hi: number; regime: Regime }[] = [
  { label: "<12", lo: 0, hi: 12, regime: "extreme-greed" },
  { label: "12–15", lo: 12, hi: 15, regime: "greed" },
  { label: "15–20", lo: 15, hi: 20, regime: "slight-fear" },
  { label: "20–30", lo: 20, hi: 30, regime: "fear" },
  { label: ">30", lo: 30, hi: 40, regime: "extreme-fear" },
];

const VXN_BANDS: { label: string; lo: number; hi: number; regime: VxnRegime }[] = [
  { label: "<15", lo: 0, hi: 15, regime: "complacency" },
  { label: "15–19", lo: 15, hi: 19, regime: "grind-zone" },
  { label: "19–25", lo: 19, hi: 25, regime: "slight-fear" },
  { label: "25–30", lo: 25, hi: 30, regime: "fear" },
  { label: "30–35", lo: 30, hi: 35, regime: "very-fear" },
  { label: "35+", lo: 35, hi: 45, regime: "extreme-fear" },
];

export default async function VixPage() {
  const feed = await appFeed(); // the data badge: next refresh, or Login needed / failed
  const snap = await getSnapshot();
  const { id, data } = await getSelectedAccount(snap);
  const vix = getVixSnapshot(snap.meta.source === "example");
  // Independent of the bridge (straight from Yahoo), so it renders even when
  // there's no VIX snapshot; null on any failure just drops the section.
  const mes = await getMesQuote();

  return (
    <main className="px-4">
      <ShowAmounts>
        <PageHeader
          title="VIX/VXN"
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <AccountSwitcher accounts={snap.accounts} selectedId={id} />
              <span>
                ·{" "}
                {vix
                  ? `VIX ${vix.inputs.vix.toFixed(2)}${vix.inputs.vxn != null ? ` / VXN ${vix.inputs.vxn.toFixed(2)}` : ""}`
                  : "no data"}
              </span>
            </span>
          }
          right={<BackLink />}
        />
        <SensaTickerLinks symbol="VIX" pages={["overview", "chart-analysis", "seasonals"]} label="Sensa Market · VIX" className="mt-2" />

        {!vix ? (
          <Card className="mt-4 px-4 py-5 text-center text-sm text-muted">
            No VIX snapshot found. Run the data bridge to refresh the volatility posture.
          </Card>
        ) : (
          <VixBody
            feed={feed}
            vix={vix}
            uncommitted={freeCashValue(data.summary, data.equities, data.options)}
            totalValue={data.summary.totalValue}
            optionsBuyingPower={data.summary.optionsBuyingPower ?? 0}
            mes={mes}
          />
        )}

      </ShowAmounts>
    </main>
  );
}

function VixBody({
  feed,
  mes,
  vix,
  uncommitted,
  totalValue,
  optionsBuyingPower,
}: {
  vix: NonNullable<ReturnType<typeof getVixSnapshot>>;
  uncommitted: number; // free cash (calc.freeCashValue)
  totalValue: number;
  optionsBuyingPower: number;
  mes?: Awaited<ReturnType<typeof getMesQuote>>;
  feed: FeedStatus;
}) {
  const a = assessVix(vix);
  const tone = REGIME_COLORS[a.regime];
  const markerPct = Math.min(100, Math.max(0, (a.vix / 40) * 100));
  const vxnA = vix.inputs.vxn != null ? assessVxn(vix.inputs.vxn) : null;
  const vxnTone = vxnA ? VXN_REGIME_COLORS[vxnA.regime] : null;
  const vxnMarkerPct = vxnA ? Math.min(100, Math.max(0, (vxnA.vxn / 45) * 100)) : 0;
  const divergence = vxnA ? compareVixVxn(a.regime, vxnA.regime) : null;
  const divergenceTone = divergence == null || divergence.tilt === "aligned" ? "text-muted" : divergence.tilt === "tech-hotter" ? "text-amber-300" : "text-sky-300";

  return (
    <>
      {/* Hero */}
      <Card className="mt-4 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted">VIX · 30-day implied vol</div>
            <div className="tabular mt-0.5 text-4xl font-bold">{a.vix.toFixed(2)}</div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tone.chip}`}>{a.regimeLabel}</span>
        </div>

        {/* Regime scale */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-[9px] font-semibold uppercase tracking-wide">
            <span className="text-sky-300">← Greed (hold cash)</span>
            <span className="text-rose-300">Fear (deploy) →</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-sky-500/40 via-emerald-500/40 to-rose-500/50" />
            <div className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${markerPct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-muted">
            {BANDS.map((b) => (
              <span key={b.label} className={b.regime === a.regime ? "font-semibold text-text" : ""}>
                {b.label}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-muted">
            Low VIX = greed (market rich, hold more cash); high VIX = fear (deploy into the
            premium). The cash target steps down as the VIX rises.
          </p>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-muted">{a.marketRead}</p>

        {vxnA && vxnTone && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-muted">VXN · Nasdaq-100 implied vol</div>
                <div className="tabular mt-0.5 text-2xl font-bold">{vxnA.vxn.toFixed(2)}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${vxnTone.chip}`}>{vxnA.regimeLabel}</span>
            </div>

            {/* Regime scale — same treatment as VIX's own, VXN's own bands */}
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[9px] font-semibold uppercase tracking-wide">
                <span className="text-sky-300">← Complacency (hold cash)</span>
                <span className="text-rose-300">Fear (deploy) →</span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-sky-500/40 via-emerald-500/40 to-rose-500/50" />
                <div className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${vxnMarkerPct}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[9px] text-muted">
                {VXN_BANDS.map((b) => (
                  <span key={b.label} className={b.regime === vxnA.regime ? "font-semibold text-text" : ""}>
                    {b.label}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-muted">
                Same idea as VIX, shifted ~4pts up for Nasdaq-100&rsquo;s structurally richer vol —
                low VXN means tech/growth options are cheap, high VXN means tech-specific fear is
                elevated and premium is fat.
              </p>
            </div>

            <p className="mt-3 text-[12px] leading-relaxed text-muted">{vxnA.marketRead}</p>
            {divergence && <p className={`mt-2 text-[11px] leading-relaxed ${divergenceTone}`}>{divergence.note}</p>}
          </div>
        )}
      </Card>

      {/* Posture — framework target band + where you actually sit */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <PostureStats
          a={a}
          uncommitted={uncommitted}
          totalValue={totalValue}
          optionsBuyingPower={optionsBuyingPower}
        />
      </div>

      {/* S&P futures — the overnight drift, open by default, right above the call to action. */}
      <div className="mt-3">
        <MesCard mes={mes} />
      </div>

      {/* Action */}
      <SectionTitle>What to do now</SectionTitle>
      <Card className={`px-4 py-3`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${tone.bar}`} />
          <span className="text-sm font-semibold">{a.action}</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">{a.cspAction}</p>
        {a.notes.length > 0 && (
          <ul className="mt-2 space-y-1.5 border-t border-border pt-2 text-[11px] leading-relaxed text-muted">
            {a.notes.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Portfolio fit */}
      <SectionTitle>Your portfolio fit</SectionTitle>
      <PortfolioFit a={a} uncommitted={uncommitted} totalValue={totalValue} optionsBuyingPower={optionsBuyingPower} />

      {/* Indicator panel */}
      <SectionTitle>Indicator panel</SectionTitle>
      <p className="-mt-1 mb-2 px-1 text-[11px] text-muted">Tap any row for what it means and where it sits.</p>
      <VixIndicators a={a} mes={mes} vxn={vix.inputs.vxn} />

      {/* Cheat sheet */}
      <SectionTitle>Cheat sheet</SectionTitle>
      <Card className="px-4 py-3 text-[11px] leading-relaxed">
        <p className="font-medium text-text">VIX Cash Allocation framework — more fear, more deployed. The cash target falls as the VIX rises.</p>
        <ul className="mt-2 space-y-1 text-muted">
          <li><span className="text-text">&lt;12</span> Extreme Greed · 40–50% cash / 50–60% invested</li>
          <li><span className="text-text">12–15</span> Greed · 30–40% cash / 60–70% invested</li>
          <li><span className="text-text">15–20</span> Slight Fear · 20–25% cash / 75–80% invested</li>
          <li><span className="text-text">20–25</span> Fear · 10–15% cash / 85–90% invested</li>
          <li><span className="text-text">25–30</span> Very Fearful · 5–10% cash / 90–95% invested</li>
          <li><span className="text-text">&gt;30</span> Extreme Fear · 0–5% cash / 95–100% invested</li>
        </ul>
      </Card>

      <Card className="mt-2 px-4 py-3 text-[11px] leading-relaxed">
        <p className="font-medium text-text">VXN Cash Allocation — same idea, shifted ~4pts above VIX for Nasdaq-100&rsquo;s structurally richer vol.</p>
        <ul className="mt-2 space-y-1 text-muted">
          <li><span className="text-text">&lt;15</span> Complacency · 40–50% cash / 50–60% invested</li>
          <li><span className="text-text">15–19</span> Grind Zone · 30–40% cash / 60–70% invested</li>
          <li><span className="text-text">19–25</span> Slight Fear · 20–30% cash / 70–80% invested</li>
          <li><span className="text-text">25–30</span> Fear · 10–20% cash / 80–90% invested</li>
          <li><span className="text-text">30–35</span> Very Fearful · 5–10% cash / 90–95% invested</li>
          <li><span className="text-text">35+</span> Extreme Fear · 0–5% cash / 95–100% invested</li>
        </ul>
        <p className="mt-2 border-t border-border pt-2 text-[10px] text-muted">
          Percentile-matched to the VIX bands using 10yrs of Cboe data — slide toward each zone&rsquo;s low end as VXN rises. Not financial advice.
        </p>
      </Card>

      <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted">
        Not financial advice — a rules-based framework from your context doc, applied to the
        snapshot. {a.confidence === "reduced" && `Reduced confidence: ${a.missing.join("; ")} not in the data feed. `}
        Source: {vix.source}. As of {vix.asof}.
        <DataRefresh status={feed} />
      </p>
    </>
  );
}
