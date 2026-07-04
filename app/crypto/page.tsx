import { BackLink, Card, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { Amt, ShowAmounts } from "@/components/privacy";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { getSnapshot } from "@/lib/snapshot";
import { getSelectedAccount } from "@/lib/account";
import { getRefreshStatus } from "@/lib/refresh-status";
import { DataRefresh } from "@/components/DataRefresh";
import { cryptoValue, fmtMoney } from "@/lib/calc";

export const dynamic = "force-dynamic";

export default async function CryptoPage() {
  const snap = await getSnapshot();
  const { id, data } = await getSelectedAccount(snap);
  const holdings = [...(data.crypto ?? [])].sort((a, b) => cryptoValue(b) - cryptoValue(a));
  const aggregate = data.summary.cryptoValue;
  const holdingsValue = holdings.reduce((s, c) => s + cryptoValue(c), 0);

  return (
    <main className="px-4">
      <ShowAmounts>
        <PageHeader
          title="Crypto"
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <AccountSwitcher accounts={snap.accounts} selectedId={id} />
              <span>· {holdings.length ? `${holdings.length} coins` : "aggregate"}</span>
            </span>
          }
          right={<BackLink />}
        />

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat label="Crypto value" value={<Amt>{fmtMoney(aggregate)}</Amt>} sub="from snapshot" />
          <Stat
            label="Share of portfolio"
            value={`${data.summary.totalValue > 0 ? Math.round((aggregate / data.summary.totalValue) * 100) : 0}%`}
            sub="of total value"
          />
        </div>

        {holdings.length > 0 ? (
          <>
            <SectionTitle>Holdings</SectionTitle>
            <Card className="divide-y divide-border">
              {holdings.map((c) => {
                const val = cryptoValue(c);
                const share = holdingsValue > 0 ? Math.round((val / holdingsValue) * 100) : 0;
                return (
                  <div key={c.symbol} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[11px] font-bold">
                      {c.symbol.slice(0, 4)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.symbol}</div>
                      <div className="truncate text-[11px] text-muted">
                        {c.name} · {c.qty.toLocaleString("en-US", { maximumFractionDigits: 8 })} @ <Amt>{`$${c.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</Amt>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tabular text-sm font-medium">
                        <Amt>{fmtMoney(val)}</Amt>
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted">{share}%</div>
                    </div>
                  </div>
                );
              })}
            </Card>
          </>
        ) : (
          <Card className="mt-4 px-4 py-5 text-sm text-muted">
            <p className="font-medium text-text">No per-coin breakdown yet</p>
            <p className="mt-1 text-[12px] leading-relaxed">
              Schwab brokerage accounts don&apos;t hold crypto, so this feed reports a zero
              aggregate. If you track crypto elsewhere, those holdings would need to be added
              to the snapshot separately.
            </p>
          </Card>
        )}

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted">
          Read-only — this app never trades. Crypto totals come from the portfolio snapshot
          ({snap.meta.pricesAsOf})<DataRefresh nextAt={getRefreshStatus().app?.nextAt} />.
        </p>
      </ShowAmounts>
    </main>
  );
}
