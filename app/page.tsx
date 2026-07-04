import Link from "next/link";
import { Card, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { Donut } from "@/components/charts";
import { HoldingsTable } from "@/components/HoldingsTable";
import { TopMovers } from "@/components/TopMovers";
import { HomeHeroSim } from "@/components/HomeHeroSim";
import type { DonutSlice } from "@/components/charts";
import { Amt, HideButton } from "@/components/privacy";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { PortfolioFit } from "@/components/PortfolioFit";
import { AvailableCash } from "@/components/AvailableCash";
import { getSnapshot } from "@/lib/snapshot";
import { getSelectedAccount } from "@/lib/account";
import { getVixSnapshot } from "@/lib/vix-data";
import { getRefreshStatus } from "@/lib/refresh-status";
import { DataRefresh } from "@/components/DataRefresh";
import { assessVix, REGIME_COLORS } from "@/lib/vix";
import {
  cspCollateral,
  equityPnl,
  equityValue,
  fmtMoney,
  isCashEquivalent,
  isCashSettledIndex,
  optionMarketValue,
  optionPnl,
  spreadRiskCapital,
} from "@/lib/calc";

export const dynamic = "force-dynamic";

// Compact data timestamp: "2026-06-17 23:29 Mountain Daylight Time" → "06/17/26 23:29".
function fmtDataStamp(pricesAsOf: string): string {
  const m = pricesAsOf.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
  if (!m) return pricesAsOf;
  const [, y, mo, d, hm] = m;
  return `${mo}/${d}/${y.slice(2)} ${hm}`;
}

export default async function HomePage() {
  const snap = await getSnapshot();
  const { accounts, meta } = snap;
  const { id, data } = await getSelectedAccount(snap);
  const { summary, equities, options, valueHistory } = data;

  const vixSnap = getVixSnapshot();
  const vix = vixSnap ? assessVix(vixSnap) : null;

  // Allocation by capital deployed — break "Options" into its strategies. LEAP &
  // hedge by market value; CSPs by collateral (the cash securing them), carved out
  // of cash so "Cash (free)" is what's truly uncommitted. Slices sum to total.
  const leapCallsValue = options.filter((o) => o.kind === "leap-call").reduce((s, o) => s + optionMarketValue(o), 0);
  const hedgeValue = options.filter((o) => o.kind === "leap-put-hedge").reduce((s, o) => s + optionMarketValue(o), 0);
  const cspCollateralValue = options
    .filter((o) => o.kind === "csp" && !isCashSettledIndex(o.symbol))
    .reduce((s, o) => s + cspCollateral(o), 0);
  const cspCount = options.filter((o) => o.kind === "csp" && !isCashSettledIndex(o.symbol)).length;
  const spreadRisk = spreadRiskCapital(options);
  // Capital deployed in options strategies: long LEAP/hedge value + CSP collateral
  // + spread defined risk. (Distinct from summary.optionsValue, the net mark.)
  const optionsCapital = leapCallsValue + hedgeValue + cspCollateralValue + spreadRisk;
  // Leverage tracker: total positional value (Stocks market value + Options capital) vs
  // the account's liquid value. The gap is financed by margin. % is margin ÷ liquid value
  // — orange above 20%, red at 28%+, keeping under a 30% self-imposed ceiling.
  const totalExposure = summary.equityValue + optionsCapital;
  const marginUsed = Math.max(0, totalExposure - summary.totalValue);
  const marginPct = summary.totalValue > 0 ? marginUsed / summary.totalValue : 0;
  const marginColor = marginPct >= 0.28 ? "text-rose-400" : marginPct >= 0.2 ? "text-orange-400" : "text-muted";
  const freeCash = Math.max(
    0,
    summary.totalValue - summary.equityValue - leapCallsValue - hedgeValue - cspCollateralValue - spreadRisk - summary.cryptoValue,
  );
  // Money-market / sweep funds (e.g. SWGXX) report as equity positions but are
  // really cash. Pull them out of Stocks and into the Cash slice.
  const moneyMarketValue = equities
    .filter((e) => isCashEquivalent(e.symbol))
    .reduce((s, e) => s + equityValue(e), 0);
  const stocksValue = Math.max(0, summary.equityValue - moneyMarketValue);
  const cashValue = freeCash + moneyMarketValue;
  // Liquid cash including money-market/sweep funds (e.g. SWGXX), fed to the fit so
  // "Available" reflects all liquid cash, not just the brokerage cash line.
  const liquidCash = summary.cash + moneyMarketValue;
  const allocation: DonutSlice[] = [
    { label: "Stocks", value: stocksValue, color: "#34d399" },
    { label: "LEAPs", value: leapCallsValue, color: "#a78bfa" },
    { label: "CSPs", value: cspCollateralValue, color: "#38bdf8" },
    { label: "Spreads", value: spreadRisk, color: "#fb923c" },
    { label: "Hedges", value: hedgeValue, color: "#fb7185" },
    { label: "Cash", value: cashValue, color: "#94a3b8" },
    { label: "Crypto", value: summary.cryptoValue, color: "#fbbf24" },
  ].filter((s) => s.value > 0);
  // Per-slice "out of band" flags (red) for the legend.
  const sliceFlag = (label: string, pct: number) =>
    (label === "Stocks" && pct > 0.25) || (label === "LEAPs" && pct > 0.15) || (label === "CSPs" && pct < 0.55);

  // Holdings-by-ticker table: capital per ticker across EVERY strategy — stock
  // value + CSP collateral + LEAP/hedge market value + spread defined risk. (Covered
  // calls add nothing; the shares are already in stock value.) % is share of the
  // whole account, so a ticker you only touch via CSPs/LEAPs still shows up. Each
  // ticker keeps its per-strategy split so the row can expand and link out.
  const STRAT_META: Record<string, { label: string; route: string }> = {
    stock: { label: "Stock", route: "/stocks" },
    csp: { label: "CSPs", route: "/options/csp" },
    leap: { label: "LEAPs", route: "/options/leap" },
    spread: { label: "Spreads", route: "/options/spread" },
  };
  const byTicker = new Map<string, Map<string, number>>();
  const addCap = (sym: string, key: string, v: number) => {
    if (v <= 0) return;
    const m = byTicker.get(sym) ?? new Map<string, number>();
    m.set(key, (m.get(key) ?? 0) + v);
    byTicker.set(sym, m);
  };
  for (const e of equities) if (!isCashEquivalent(e.symbol)) addCap(e.symbol, "stock", equityValue(e));
  for (const o of options) {
    if (o.kind === "leap-call" || o.kind === "leap-put-hedge") addCap(o.symbol, "leap", optionMarketValue(o));
    else if (o.kind === "csp" && !isCashSettledIndex(o.symbol)) addCap(o.symbol, "csp", cspCollateral(o));
  }
  for (const sym of new Set(
    options.filter((o) => o.kind === "put-spread" || o.kind === "call-spread").map((o) => o.symbol),
  )) {
    addCap(sym, "spread", spreadRiskCapital(options.filter((o) => o.symbol === sym && (o.kind === "put-spread" || o.kind === "call-spread"))));
  }
  const holdings = [...byTicker.entries()]
    .map(([symbol, m]) => {
      const value = [...m.values()].reduce((s, v) => s + v, 0);
      const breakout = [...m.entries()]
        .map(([key, v]) => ({ key, label: STRAT_META[key]?.label ?? key, value: v, route: STRAT_META[key]?.route ?? "/" }))
        .sort((a, b) => b.value - a.value);
      return { symbol, value, pct: summary.totalValue > 0 ? value / summary.totalValue : 0, breakout };
    })
    .sort((a, b) => b.value - a.value);

  const equityPnlTotal = equities.reduce((s, e) => s + equityPnl(e), 0);
  const optionsPnlTotal = options.reduce((s, o) => s + optionPnl(o), 0);

  const first = valueHistory[0].value;
  const last = valueHistory[valueHistory.length - 1].value;
  const trendPct = (last - first) / first;

  const share = (v: number) => `${Math.round((v / summary.totalValue) * 100)}%`;

  return (
    <main className="px-4">
      <PageHeader
        title="Portfolio"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <AccountSwitcher accounts={accounts} selectedId={id} />
            <span>As of {fmtDataStamp(meta.pricesAsOf)}</span>
            <DataRefresh nextAt={getRefreshStatus().app?.nextAt} />
          </span>
        }
        right={
          <div className="flex flex-col items-center gap-2">
            {vix?.s5fi != null && (
              <span className="tabular text-[11px] leading-none text-muted">
                S5FI:{" "}
                <span
                  className={`font-semibold ${
                    vix.s5fi >= 80 ? "text-red-400" : vix.s5fi >= 75 ? "text-orange-400" : "text-text"
                  }`}
                >
                  {vix.s5fi.toFixed(1)}
                </span>
              </span>
            )}
            <HideButton />
          </div>
        }
      />

      {/* Hero */}
      <HomeHeroSim
        totalValue={summary.totalValue}
        options={options}
        valueHistory={valueHistory}
        trailingDelta={last - first}
        trendPct={trendPct}
      />

      {/* Balances — Stocks/Options/Crypto drill into their summaries */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/stocks" className="block active:opacity-80">
          <Stat
            label="Stocks ›"
            value={<Amt>{fmtMoney(summary.equityValue)}</Amt>}
            sub={<><Amt>{`${equityPnlTotal >= 0 ? "+" : "−"}${fmtMoney(Math.abs(equityPnlTotal))}`}</Amt> unreal.</>}
            tone={equityPnlTotal >= 0 ? "pos" : "neg"}
            pct={share(summary.equityValue)}
          />
        </Link>
        <Link href="/options" className="block active:opacity-80">
          <Stat
            label="Options ›"
            value={<Amt>{fmtMoney(optionsCapital)}</Amt>}
            sub={<><Amt>{`${optionsPnlTotal >= 0 ? "+" : "−"}${fmtMoney(Math.abs(optionsPnlTotal))}`}</Amt> unreal.</>}
            tone={optionsPnlTotal >= 0 ? "pos" : "neg"}
            pct={share(optionsCapital)}
          />
        </Link>
        <Stat
          label="Options buying power"
          value={<Amt>{fmtMoney(summary.optionsBuyingPower ?? summary.buyingPower)}</Amt>}
          sub={
            <>
              <Amt>{fmtMoney(summary.cash)}</Amt> cash · <Amt>{`$${Math.round(marginUsed / 1000)}K`}</Amt> margin{" "}
              <span className={marginColor}>{Math.round(marginPct * 100)}%</span>
            </>
          }
          pct={share(summary.cash)}
        />
        <Link href="/crypto" className="block active:opacity-80">
          <Stat
            label="Crypto ›"
            value={<Amt>{fmtMoney(summary.cryptoValue)}</Amt>}
            sub="aggregate"
            pct={share(summary.cryptoValue)}
          />
        </Link>
      </div>

      {/* Quick access — CSPs are the core strategy, so surface them up top. */}
      <Link href="/options/csp" className="mt-3 block active:opacity-80">
        <Card className="flex items-center justify-between gap-3 bg-sky-500/5 px-4 py-3 ring-1 ring-inset ring-sky-500/25">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-sky-200">Cash-secured puts</div>
            <div className="text-[11px] text-muted">
              {cspCount} open · <Amt>{fmtMoney(cspCollateralValue)}</Amt> collateral
            </div>
          </div>
          <span className="shrink-0 text-sm font-medium text-sky-300">Open ›</span>
        </Card>
      </Link>

      {/* Top movers — day's change in net market value per ticker */}
      <TopMovers equities={equities} options={options} />

      {/* VIX regime + portfolio fit — one concept (the regime sets how your cash
          should be positioned), so they share a card that taps through to /vix. */}
      {vix && (
        <>
          <SectionTitle>Volatility &amp; Positioning</SectionTitle>
          <Card className="divide-y divide-border">
            <Link href="/vix" className="block active:opacity-80">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-muted">VIX</span>
                  <span className="tabular text-lg font-bold leading-none">{vix.vix.toFixed(1)}</span>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${REGIME_COLORS[vix.regime].chip}`}>
                  {vix.regimeLabel}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">Target: {vix.cashRange} Cash</div>
                  <AvailableCash
                    cash={liquidCash}
                    totalValue={summary.totalValue}
                    cspCollateral={cspCollateralValue}
                    spreadRisk={spreadRisk}
                    optionsBuyingPower={summary.optionsBuyingPower ?? 0}
                    targetLow={vix.targetReserveLow}
                    targetHigh={vix.targetReserveHigh}
                  />
                </div>
                <span className="shrink-0 text-muted">›</span>
              </div>
            </Link>
            {/* Outside the Link so the reserve-base toggle and breakdown don't navigate. */}
            <div className="px-4 py-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Your portfolio</div>
              <PortfolioFit
                a={vix}
                cash={liquidCash}
                totalValue={summary.totalValue}
                cspCollateral={cspCollateralValue}
                spreadRisk={spreadRisk}
                optionsBuyingPower={summary.optionsBuyingPower ?? 0}
                bare
              />
            </div>
          </Card>
        </>
      )}

      {/* Allocation */}
      <SectionTitle>Allocation</SectionTitle>
      <Card className="px-4 py-4">
        <div className="flex items-center gap-4">
          <Donut slices={allocation} centerTop={<Amt>{fmtMoney(summary.totalValue)}</Amt>} centerBottom="total" />
          <ul className="flex-1 space-y-2">
            {allocation.map((s) => {
              const pct = s.value / summary.totalValue;
              const flag = sliceFlag(s.label, pct);
              return (
                <li key={s.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className={`tabular ${flag ? "font-semibold text-red-400" : "text-muted"}`}>
                      {(pct * 100).toFixed(0)}%
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="mt-3 border-t border-border pt-2 text-[11px] leading-relaxed text-muted">
          Options broken out by capital deployed — LEAP &amp; hedge by market value, CSPs by collateral, spreads by
          defined risk. “Cash” includes money-market/sweep funds (e.g. SWGXX) and excludes the cash securing your CSPs.{" "}
          <span className="text-red-400">Red</span> = out of band (Stocks &gt;25%, LEAPs &gt;15%, CSPs &lt;55%).
        </p>
      </Card>

      {/* Holdings by ticker */}
      <p className="mb-2 mt-3 px-1 text-[11px] text-muted">
        Capital per ticker (stocks + CSPs + LEAPs + spreads) — <span className="font-medium text-orange-300">over 10%</span> and{" "}
        <span className="font-medium text-emerald-300">under 5%</span> of your account highlighted.
      </p>
      <HoldingsTable rows={holdings} />

      <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted">
        Data is a live snapshot from your Schwab account. The trend line fills in as
        history accumulates. Read-only — this app never places trades.
      </p>
    </main>
  );
}
