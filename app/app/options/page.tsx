import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { Donut } from "@/components/charts";
import type { DonutSlice } from "@/components/charts";
import { RefreshButton } from "@/components/RefreshButton";
import { Amt, ShowAmounts } from "@/components/privacy";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { getSnapshot } from "@/lib/snapshot";
import { getSelectedAccount } from "@/lib/account";
import { cspCollateral, fmtMoney, optionMarketValue } from "@/lib/calc";
import { OptionsSummarySim } from "@/components/OptionsSummarySim";
import type { OptionPosition } from "@/lib/types";

const CSP_COLOR = "#38bdf8"; // sky — matches the CSP side accent
const LEAP_COLOR = "#a78bfa"; // violet — matches the LEAP side accent

export const dynamic = "force-dynamic";

const isCsp = (o: OptionPosition) => o.kind === "csp";
const isLeap = (o: OptionPosition) => o.kind === "leap-call" || o.kind === "leap-put-hedge";

// One tappable "side" — the whole column highlights on press so it's clear you're
// drilling into that entire strategy, not a single metric.
export default async function OptionsPage() {
  const snap = await getSnapshot();
  const { id, data } = await getSelectedAccount(snap);
  const { options } = data;

  const sum = (os: OptionPosition[], f: (o: OptionPosition) => number) => os.reduce((s, o) => s + f(o), 0);
  const csps = options.filter(isCsp);
  const leaps = options.filter(isLeap);

  // Strategy allocation by capital deployed: CSP collateral (cash-secured) vs
  // current LEAP market value. (Raw CSP contract value would read ~2% and hide
  // how much capital the wheel actually ties up.)
  const cspCapital = sum(csps, cspCollateral);
  const leapCapital = sum(leaps, optionMarketValue);
  const stratTotal = cspCapital + leapCapital;
  const allocation: DonutSlice[] = [
    { label: "CSPs", value: cspCapital, color: CSP_COLOR },
    { label: "LEAPs", value: leapCapital, color: LEAP_COLOR },
  ];

  return (
    <main className="px-4">
      <ShowAmounts>
        <PageHeader
          title="Options"
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <AccountSwitcher accounts={snap.accounts} selectedId={id} />
              <span>· {options.length} positions</span>
            </span>
          }
          right={<RefreshButton generatedAt={snap.meta.generatedAt} />}
        />

        {/* Strategy allocation — CSP vs LEAP share of deployed capital */}
        {options.length > 0 && (
          <Card className="mt-4 px-4 py-4">
            <div className="flex items-center gap-4">
              <Donut slices={allocation} centerTop={<Amt>{fmtMoney(stratTotal)}</Amt>} centerBottom="capital" />
              <ul className="flex-1 space-y-3">
                {allocation.map((s) => {
                  const pct = stratTotal > 0 ? s.value / stratTotal : 0;
                  return (
                    <li key={s.label}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                          {s.label}
                        </span>
                        <span className="tabular font-semibold">{Math.round(pct * 100)}%</span>
                      </div>
                      <div className="tabular mt-0.5 pl-[18px] text-[11px] text-muted">
                        <Amt>{fmtMoney(s.value)}</Amt>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="mt-3 border-t border-border pt-2 text-[11px] leading-relaxed text-muted">
              Share of capital deployed by strategy — CSP collateral (cash-secured) vs current LEAP market value.
            </p>
          </Card>
        )}

        {/* All options + per-strategy cards + after-hours Simulate toggle */}
        <OptionsSummarySim options={options} />

        <SectionTitle>How this works</SectionTitle>
        <p className="-mt-1 px-1 text-[11px] leading-relaxed text-muted">
          Tap the <span className="text-sky-300">CSP</span> or <span className="text-violet-300">LEAP</span> side to open
          a focused view — positions default to <span className="text-text">Open</span>; flip the toggle to{" "}
          <span className="text-text">Closed</span> for that type&apos;s realized round-trips, and find new ideas from
          inside that view. Keeps the page glanceable no matter how many positions you carry.
        </p>
      </ShowAmounts>
    </main>
  );
}
