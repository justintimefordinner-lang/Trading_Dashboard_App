import { Card, PageHeader, SectionTitle, Pill } from "@/components/ui";
import { ResearchView } from "@/components/ResearchView";
import { getApproved } from "@/lib/approved";
import { getResearch } from "@/lib/research";
import { getSnapshot } from "@/lib/snapshot";
import type { Holding } from "@/lib/research-types";

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
  const data = getResearch();
  const snap = await getSnapshot();
  const holdings = aggregateHoldings(snap.data);
  const approved = getApproved();
  const sortedApproved = [...approved].sort((a, b) => a.localeCompare(b));

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
