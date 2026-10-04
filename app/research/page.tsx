import Link from "next/link";
import { Card, PageHeader, SectionTitle, Pill } from "@/components/ui";
import { ResearchView } from "@/components/ResearchView";
import { getApproved } from "@/lib/approved";
import { getResearch } from "@/lib/research";
import { getSnapshot } from "@/lib/snapshot";
import type { Holding } from "@/lib/research-types";
import { readSuggestions, traderPresent } from "@/lib/trader";
import { exampleAlerts, readAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

const PLAYBOOK = [
  {
    title: "Bullish — CSPs / LEAPs / Bull Puts",
    color: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    criteria: [
      "Low on the Bollinger band (%B near/under the lower band)",
      "RSI oversold (gradient — deeper = stronger)",
      "MACD turning up (histogram positive / rising)",
      "CSPs & Bull Puts weight the dip; LEAPs weight the MACD turn",
    ],
  },
  {
    title: "Bearish — Bear Calls",
    color: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
    criteria: [
      "High on the Bollinger band (%B near/over the upper band)",
      "RSI overbought (gradient — higher = stronger)",
      "MACD rolling over (histogram negative / falling)",
      "Defined-risk credit above resistance on an approved name",
    ],
  },
  {
    title: "Covered Calls — on holdings",
    color: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
    criteria: [
      "Stock you hold, ≥100 shares (one contract per 100)",
      "Price at/above your cost basis (called-away exit isn't a loss)",
      "Overbought / near the upper band — sell calls into strength",
      "Score is that toppiness; basis cushion shown as context",
    ],
  },
];

// Aggregate held equities across all accounts into one holding per symbol
// (summed shares, share-weighted average cost).
function aggregateHoldings(data: Record<string, { equities: { symbol: string; qty: number; avgCost: number; price: number }[] }>): Holding[] {
  const acc = new Map<string, { qty: number; costQty: number; price: number }>();
  for (const account of Object.values(data)) {
    for (const e of account.equities ?? []) {
      const cur = acc.get(e.symbol) ?? { qty: 0, costQty: 0, price: e.price };
      cur.qty += e.qty;
      cur.costQty += e.qty * e.avgCost;
      cur.price = e.price;
      acc.set(e.symbol, cur);
    }
  }
  return [...acc.entries()].map(([symbol, v]) => ({
    symbol,
    qty: v.qty,
    avgCost: v.qty ? v.costQty / v.qty : 0,
    price: v.price,
  }));
}

// Valid deep-link targets for ?vehicle= (the tab keys, including the Covered tab).
const VEHICLE_KEYS = new Set(["CSP", "LEAP", "Bull Put Spread", "Bear Call Spread", "Covered"]);

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>;
}) {
  const { vehicle } = await searchParams;
  const initialVehicle = vehicle && VEHICLE_KEYS.has(vehicle) ? vehicle : undefined;
  const snap = await getSnapshot();
  const data = getResearch(snap.meta.source === "example");
  const holdings = aggregateHoldings(snap.data);
  const approved = getApproved();
  const sortedApproved = [...approved].sort((a, b) => a.localeCompare(b));
  // Only installs running the optional trader service have its file; everyone else never sees the card.
  const trader = traderPresent() ? readSuggestions() : null;
  const traderOpen = trader?.suggestions.filter((s) => s.status === "new").length ?? 0;
  const alerts = snap.meta.source === "example" ? exampleAlerts() : readAlerts();
  const lastSession = alerts ? alerts.events.filter((e) => e.date === alerts.lastBar) : null;
  const alertsToday = lastSession ? lastSession.length : null;
  const alertsCrosses = lastSession ? lastSession.filter((e) => e.kind === "cross").length : 0;

  return (
    <main className="px-4">
      <PageHeader
        title={
          <>
            Research{" "}
            <span className="ml-1 align-middle text-xs font-medium text-yellow-400">
              Incomplete Development
            </span>
          </>
        }
        subtitle={`Approved universe · ${approved.length} names${data ? "" : " · sync pending"}`}
      />

      {/* Chart a Ticker — on-demand 2-year chart for any symbol, not just the roster. */}
      <Link href="/chart" className="mt-3 block active:opacity-80">
        <Card className="flex items-center justify-between gap-3 bg-violet-500/5 px-4 py-3 ring-1 ring-inset ring-violet-500/25">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-violet-200">Chart a Ticker</div>
            <div className="text-[11px] text-muted">2-year chart · Bollinger, SMA 50/200, MACD, RSI, walls</div>
          </div>
          <span className="shrink-0 text-sm font-medium text-violet-300">Open ›</span>
        </Card>
      </Link>

      {/* Signal alerts — chart signals (crosses, MACD, RSI, bands) across the approved list. */}
      <Link href="/alerts" className="mt-2 block active:opacity-80">
        <Card className="flex items-center justify-between gap-3 bg-amber-500/5 px-4 py-3 ring-1 ring-inset ring-amber-500/25">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-amber-200">Signal alerts</div>
            <div className="text-[11px] text-muted">
              {alertsToday == null
                ? "Golden / death crosses, 200-day, MACD, RSI, Bollinger · every approved name"
                : `${alertsToday} signal${alertsToday === 1 ? "" : "s"} last session${alertsCrosses ? ` · ${alertsCrosses} golden/death cross${alertsCrosses === 1 ? "" : "es"}` : ""} · every approved name`}
            </div>
          </div>
          <span className="shrink-0 text-sm font-medium text-amber-300">Open ›</span>
        </Card>
      </Link>

      {/* Quant scan — the wheel study's 4%-target put rule over the approved list. */}
      <Link href="/quant" className="mt-2 block active:opacity-80">
        <Card className="flex items-center justify-between gap-3 bg-emerald-500/5 px-4 py-3 ring-1 ring-inset ring-emerald-500/25">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-emerald-200">Quant CSP scan</div>
            <div className="text-[11px] text-muted">Backtested rule · lowest-delta put paying ≥4% per 30 days · every approved name</div>
          </div>
          <span className="shrink-0 text-sm font-medium text-emerald-300">Open ›</span>
        </Card>
      </Link>

      {/* Quant portfolio check — the same study's management rules against what is held. */}
      <Link href="/quant/portfolio" className="mt-2 block active:opacity-80">
        <Card className="flex items-center justify-between gap-3 bg-sky-500/5 px-4 py-3 ring-1 ring-inset ring-sky-500/25">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-sky-200">Quant portfolio check</div>
            <div className="text-[11px] text-muted">Your positions against the rules · close at 50% · cash-secured · 10% per name · calls and LEAPS on shares</div>
          </div>
          <span className="shrink-0 text-sm font-medium text-sky-300">Open ›</span>
        </Card>
      </Link>

      {/* Trader — only when the trader service is installed (its suggestions file exists). */}
      {trader && (
        <Link href="/trader" className="mt-2 block active:opacity-80">
          <Card className="flex items-center justify-between gap-3 bg-amber-500/5 px-4 py-3 ring-1 ring-inset ring-amber-500/25">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-amber-200">Trader</div>
              <div className="text-[11px] text-muted">
                {traderOpen === 0 ? "No open suggestions" : `${traderOpen} open suggestion${traderOpen === 1 ? "" : "s"}`} · rules applied once a day
                in the entry window · Run now any time
              </div>
            </div>
            <span className="shrink-0 text-sm font-medium text-amber-300">Open ›</span>
          </Card>
        </Link>
      )}

      <ResearchView data={data} symbols={sortedApproved} holdings={holdings} initialVehicle={initialVehicle} />

      <SectionTitle>Screening playbook</SectionTitle>
      <div className="space-y-3">
        {PLAYBOOK.map((p) => (
          <Card key={p.title} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Pill className={p.color}>{p.title}</Pill>
            </div>
            <ul className="mt-3 space-y-1.5">
              {p.criteria.map((c) => (
                <li key={c} className="flex items-start gap-2 text-xs text-muted">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                  {c}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted">
        Scores are a 0–100 gradient blended from Bollinger %B, RSI(14) and MACD(12/26/9) on the
        daily timeframe, with the live quote folded into today&apos;s candle. Covered calls also
        gate on your holdings and cost basis. Tune thresholds in{" "}
        <span className="font-mono">indicators.py</span>; edit the roster in{" "}
        <span className="font-mono">lib/approved-stocks.ts</span>.
      </p>
    </main>
  );
}
