"use client";

// Top Movers — the day's change in NET MARKET VALUE per ticker (not lifetime P&L),
// aggregating ALL exposure to a ticker (shares + every option leg). Two rows of five:
// top row is the day's biggest gainers (most positive top-left → smallest gainer
// top-right); bottom row is the biggest losers (smallest drop bottom-left → biggest
// drop bottom-right). Data comes from the bridge: equities carry `dayChange`
// (per-share), options carry `dayValueChange` (this leg's signed $ move today) and
// `underlyingChange` (the underlying's per-share move).
import { Card, SectionTitle } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { compactMoney } from "@/components/OptionRow";
import { equityValue, isCashEquivalent, optionMarketValue } from "@/lib/calc";
import type { Equity, OptionPosition } from "@/lib/types";

type Mover = {
  symbol: string;
  dayValue: number; // net $ change in market value today (the ranking metric)
  netValue: number; // signed net market value now (short options negative)
  underlyingPrice: number | null;
  underlyingChange: number | null; // underlying per-share $ move today
};

function priceStr(p: number): string {
  return p >= 100 ? Math.round(p).toLocaleString() : p.toFixed(2);
}

function Tile({ m }: { m: Mover }) {
  const up = m.dayValue >= 0;
  const uc = m.underlyingChange;
  const uUp = (uc ?? 0) >= 0;
  return (
    <div className="overflow-hidden rounded-lg bg-surface-2">
      <div className={`h-1 ${up ? "bg-emerald-500" : "bg-rose-500"}`} />
      <div className="px-1.5 py-1.5">
        <div className="flex items-baseline justify-between gap-0.5">
          <span className="truncate text-[11px] font-bold text-text">{m.symbol}</span>
          <span className={`shrink-0 tabular text-[11px] font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>
            <Amt>{`${m.dayValue < 0 ? "−" : ""}${compactMoney(Math.abs(m.dayValue))}`}</Amt>
          </span>
        </div>
        <div className="mt-0.5 truncate text-right tabular text-[9px] leading-tight">
          {uc == null ? (
            <span className="text-muted">{m.underlyingPrice != null ? `$${priceStr(m.underlyingPrice)}` : "—"}</span>
          ) : (
            <>
              <span className={uUp ? "text-emerald-400" : "text-rose-400"}>
                {uUp ? "▲" : "▼"} ({Math.abs(uc).toFixed(2)})
              </span>{" "}
              <span className="text-text">{m.underlyingPrice != null ? priceStr(m.underlyingPrice) : ""}</span>
            </>
          )}
        </div>
        <div className="truncate text-right tabular text-[9px] leading-tight">
          {m.netValue >= 0 ? (
            <span className="text-emerald-400">
              <Amt>{compactMoney(m.netValue)}</Amt>
            </span>
          ) : (
            <span className="text-rose-400">
              (<Amt>{compactMoney(Math.abs(m.netValue))}</Amt>)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TopMovers({ equities, options }: { equities: Equity[]; options: OptionPosition[] }) {
  const agg = new Map<string, Mover>();
  const get = (sym: string): Mover => {
    let m = agg.get(sym);
    if (!m) {
      m = { symbol: sym, dayValue: 0, netValue: 0, underlyingPrice: null, underlyingChange: null };
      agg.set(sym, m);
    }
    return m;
  };

  for (const e of equities) {
    if (isCashEquivalent(e.symbol)) continue;
    const m = get(e.symbol);
    m.dayValue += (e.qty || 0) * (e.dayChange ?? 0);
    m.netValue += equityValue(e);
    if (m.underlyingPrice == null && e.price) m.underlyingPrice = e.price;
    if (m.underlyingChange == null && e.dayChange != null) m.underlyingChange = e.dayChange;
  }
  for (const o of options) {
    if (isCashEquivalent(o.symbol)) continue;
    const m = get(o.symbol);
    m.dayValue += o.dayValueChange ?? 0;
    m.netValue += (o.side === "short" ? -1 : 1) * optionMarketValue(o);
    if (m.underlyingPrice == null && o.underlyingPrice) m.underlyingPrice = o.underlyingPrice;
    if (m.underlyingChange == null && o.underlyingChange != null) m.underlyingChange = o.underlyingChange;
  }

  const all = [...agg.values()].filter((m) => Math.abs(m.dayValue) >= 0.005);
  // Gainers: most positive first (top-left) → smallest gainer (top-right).
  const gainers = all.filter((m) => m.dayValue > 0).sort((a, b) => b.dayValue - a.dayValue).slice(0, 4);
  // Losers: take the 5 biggest drops (most negative first), then display least-negative
  // first so bottom-left is the smallest of the top-5 drops and bottom-right the biggest.
  const losers = all
    .filter((m) => m.dayValue < 0)
    .sort((a, b) => a.dayValue - b.dayValue)
    .slice(0, 4)
    .sort((a, b) => b.dayValue - a.dayValue);

  const hasAny = gainers.length > 0 || losers.length > 0;

  return (
    <div className="mt-4">
      <SectionTitle>
        Top Movers <span className="font-normal text-muted">· today</span>
      </SectionTitle>
      {!hasAny ? (
        <Card className="px-4 py-4 text-center text-sm text-muted">No price moves in your holdings yet today.</Card>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            {gainers.map((m) => (
              <Tile key={m.symbol} m={m} />
            ))}
          </div>
          {losers.length > 0 && (
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {losers.map((m) => (
                <Tile key={m.symbol} m={m} />
              ))}
            </div>
          )}
          <p className="mt-2 px-1 text-[10px] leading-snug text-muted">
            Day’s change in each ticker’s net market value (all shares + options) — biggest gain top-left, biggest drop
            bottom-right.
          </p>
        </>
      )}
    </div>
  );
}
