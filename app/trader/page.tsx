import { notFound } from "next/navigation";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { ShowAmounts } from "@/components/privacy";
import { TraderList } from "@/components/TraderList";
import { TraderRunButton } from "@/components/TraderRunButton";
import { PaperTrades } from "@/components/PaperTrades";
import { orderSuggestions, readPaper, readSuggestions, traderPresent } from "@/lib/trader";
import { Amt } from "@/components/privacy";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString()}`;

export const dynamic = "force-dynamic";

// Only installs running the trader service have this page: it keys off the
// file that service writes. Everyone else gets the app's 404.
export default async function TraderPage() {
  if (!traderPresent()) notFound();
  const doc = readSuggestions();
  const m = doc?.meta;
  const asOf = m ? new Date(m.asOf) : null;
  const paper = readPaper();
  const pm = paper?.meta;
  const paperPnl = pm ? pm.totalValue - pm.startingCash : 0;

  return (
    <main className="px-4" data-wide="1">
      <ShowAmounts>
        <PageHeader
          title="Trader"
          subtitle={
            m
              ? `${m.active} open suggestion${m.active === 1 ? "" : "s"} · last pass ${asOf?.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}${m.paused ? " · paused" : ""}${m.ntfy ? "" : " · ntfy not set"}`
              : "No passes yet"
          }
          right={<BackLink />}
        />
        <div className="mt-3 flex items-center justify-end">
          <TraderRunButton />
        </div>
        <Card className="mt-3 px-4 py-3 text-[11px] leading-relaxed text-muted">
          Stage 1: suggestions only. For every account{m?.accounts?.length ? ` (${m.accounts.join(", ")})` : ""} the trader checks puts
          for the 50% close every 15 minutes all session, and at the top of each entry hour ({m?.window ?? "11:00–15:00 ET hourly"}) it
          re-runs the Quant scan and suggests every new put, covered call and note the rules allow. Each account lists its new puts
          first, numbered in the order they get capital (no earnings inside the put first, then rank), then closes, calls and notes.{" "}
          <span className="text-emerald-300">Run now</span> does a full pass any time, any day. Anything new goes to your phone, named
          for its account, and is logged here. Mark each one <span className="text-emerald-300">good</span> or{" "}
          <span className="text-rose-300">bad</span> as you review, <span className="text-sky-300">placed it</span> if you traded it
          yourself, or <span className="text-text">skip</span> to stop the reminders. That record is what decides when the next stage —
          placing orders after your approval — is ready. Nothing here places a trade.
        </Card>
        {pm && (
          <Card className="mt-3 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{pm.label} · paper</div>
                <div className="text-[11px] text-muted">
                  The rules traded for pretend money, booked as a manual account. Pick it in the account switcher for positions and P&amp;L.
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold tabular">
                  <Amt>{money(pm.totalValue)}</Amt>
                </div>
                <div className={`text-[11px] tabular ${paperPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  <Amt>{signed(paperPnl)}</Amt> on {money(pm.startingCash)}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
              <span>
                cash <Amt>{money(pm.cash)}</Amt>
              </span>
              <span>{pm.puts} puts</span>
              <span>{pm.calls} calls</span>
              <span>{pm.shareLots} share lots</span>
              <span>{pm.trades} trades</span>
              {!pm.priced && <span className="text-amber-300">not priced by the bridge yet</span>}
            </div>
            <PaperTrades trades={paper!.trades} />
          </Card>
        )}
        <div className="mt-3">
          <TraderList initial={orderSuggestions(doc?.suggestions ?? [], m?.accounts ?? [])} />
        </div>
      </ShowAmounts>
    </main>
  );
}
