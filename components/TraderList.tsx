"use client";

// The Trader page's list: each suggestion with its reasoning and four verdict
// buttons. A verdict is written to the app's own data folder; the trader picks
// it up on its next pass and stops pushing that suggestion. Nothing here
// places an order.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { Amt } from "@/components/privacy";
import type { Suggestion, SuggestionStatus } from "@/lib/trader";

const KIND_LABEL: Record<Suggestion["kind"], string> = { csp: "New CSP", close: "Close at 50%", cc: "Covered call", note: "Note" };
const KIND_CLS: Record<Suggestion["kind"], string> = {
  csp: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
  close: "bg-sky-500/10 text-sky-300 ring-sky-500/25",
  cc: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
  note: "bg-surface-2 text-muted ring-border",
};
const STATUS_CLS: Record<SuggestionStatus, string> = {
  new: "", good: "text-emerald-400", bad: "text-rose-400", done: "text-sky-300", skip: "text-muted", expired: "text-muted",
};
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });

export function TraderList({ initial }: { initial: Suggestion[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [showOld, setShowOld] = useState(false);

  async function mark(key: string, status: SuggestionStatus) {
    setBusy(key);
    try {
      const r = await fetch("/api/trader/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, status }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || "Save failed.");
      setRows((rs) => rs.map((s) => (s.key === key ? { ...s, status } : s)));
      router.refresh();
    } catch {
      // leave the row as it was; the next page load shows the truth
    } finally {
      setBusy(null);
    }
  }

  // Rows arrive ordered by account, then new puts (ranked queue order), closes, calls, notes.
  const live = rows.filter((s) => s.status === "new");
  const judged = rows.filter((s) => s.status !== "new");
  // Queue position of each open new put within its account: #1 gets capital first.
  const queuePos = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const s of live) {
    if (s.kind !== "csp") continue;
    const n = (seen.get(s.account ?? "") ?? 0) + 1;
    seen.set(s.account ?? "", n);
    queuePos.set(s.key, n);
  }

  const Row = ({ s }: { s: Suggestion }) => (
    <Card className={`px-4 py-3 ${s.status === "new" ? "" : "opacity-80"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className={`mr-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${KIND_CLS[s.kind]}`}>
            {KIND_LABEL[s.kind]}
            {queuePos.has(s.key) && <span className="ml-1 tabular">#{queuePos.get(s.key)}</span>}
          </span>
          {s.kind === "csp" && s.rank != null && (
            <span className="mr-1.5 inline-flex rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium tabular text-muted ring-1 ring-inset ring-border" title="The trader's rank: spread (40%), delta needed to reach the target (35%), IV/RV (25%). Names with earnings inside the put queue after the rest.">
              rank {Math.round(s.rank)}
            </span>
          )}
          {s.account && <span className="mr-1.5 inline-flex rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted ring-1 ring-inset ring-border">{s.account}</span>}
          <span className="text-sm font-semibold" data-ticker={s.symbol !== "—" ? s.symbol : undefined}>{s.title}</span>
        </div>
        {s.amount != null && (
          <div className="shrink-0 text-xs tabular text-muted">
            <Amt>{money(s.amount)}</Amt>
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{s.detail}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
        <span>rule · {s.rule}</span>
        <span>seen {when(s.firstSeen)}</span>
        {s.pushedAt && <span>pushed {when(s.pushedAt)}</span>}
        {s.status !== "new" && <span className={STATUS_CLS[s.status]}>{s.status}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(["good", "bad", "done", "skip"] as const).map((st) => (
          <button
            key={st}
            onClick={() => mark(s.key, s.status === st ? "new" : st)}
            disabled={busy === s.key}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset disabled:opacity-50 ${
              s.status === st ? "bg-surface-2 text-text ring-border" : "text-muted ring-border hover:text-text"
            }`}
            title={
              st === "good" ? "A suggestion I would take" : st === "bad" ? "A suggestion I would not take — say why in your notes" : st === "done" ? "I placed this trade myself" : "Not this one; stop reminding me"
            }
          >
            {st === "done" ? "placed it" : st}
          </button>
        ))}
      </div>
    </Card>
  );

  return (
    <>
      {live.length === 0 && <Card className="px-4 py-4 text-center text-xs text-muted">Nothing suggested right now. Closes are checked every 15 minutes; new entries at the top of each entry hour, or on Run now.</Card>}
      <div className="space-y-2.5 tablet:grid tablet:grid-cols-2 tablet:gap-3 tablet:space-y-0">
        {live.map((s) => (
          <Row key={s.key} s={s} />
        ))}
      </div>
      {judged.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowOld((v) => !v)} className="text-[11px] text-muted underline">
            {showOld ? "Hide" : "Show"} {judged.length} judged or expired
          </button>
          {showOld && (
            <div className="mt-2 space-y-2.5 tablet:grid tablet:grid-cols-2 tablet:gap-3 tablet:space-y-0">
              {judged.map((s) => (
                <Row key={s.key} s={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
