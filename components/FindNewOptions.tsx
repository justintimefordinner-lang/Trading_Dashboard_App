"use client";

// "Find new" options — the live CSP screener and the curated LEAP ideas behind a
// type toggle. Ported from the CSP/LEAP "Find New" tabs onto the Options route.
import { useState } from "react";
import Link from "next/link";
import { Card, SectionTitle, Pill } from "@/components/ui";
import { CspScreener } from "@/components/CspScreener";
import type { CSPCandidate, ResearchIdea } from "@/lib/types";

type TypeKey = "csp" | "leap";

export function FindNewOptions({
  candidates,
  candidatesMeta,
  ideas,
  initialType = "csp",
}: {
  candidates: CSPCandidate[];
  candidatesMeta: { dteBasis: string; pricesAsOf: string };
  ideas: ResearchIdea[];
  initialType?: TypeKey;
}) {
  const [type, setType] = useState<TypeKey>(initialType);
  return (
    <div>
      <div className="mt-4 flex gap-1 rounded-xl border border-border bg-surface p-1">
        {(["csp", "leap"] as TypeKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
              type === t ? "bg-surface-2 text-text" : "text-muted active:bg-surface-2/50"
            }`}
          >
            {t === "csp" ? "Cash-Secured Puts" : "LEAPS"}
          </button>
        ))}
      </div>
      {type === "csp" ? <CspNew candidates={candidates} meta={candidatesMeta} /> : <LeapNew ideas={ideas} />}
    </div>
  );
}

function CspNew({ candidates, meta }: { candidates: CSPCandidate[]; meta: { dteBasis: string; pricesAsOf: string } }) {
  return (
    <div className="mt-4">
      {candidates.length === 0 ? (
        <Card className="px-4 py-5 text-center text-sm text-muted">
          No candidates yet. Ask Claude Code to run the CSP screen.
        </Card>
      ) : (
        <>
          <p className="mb-2 px-1 text-[11px] text-muted">
            ~0.20–0.30Δ puts, the two expirations nearest 30 days. {meta.dteBasis}, prices{" "}
            {meta.pricesAsOf}. Yield = premium ÷ collateral · capital = strike × 100. Tap a row for full detail.
          </p>
          <CspScreener candidates={candidates} />
        </>
      )}

      <SectionTitle>Disclaimers</SectionTitle>
      <Card className="px-4 py-3">
        <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted">
          <li>Not financial advice. This is a rules-based screen; you are responsible for your own trades.</li>
          <li>Options involve substantial risk, including loss of the entire investment.</li>
          <li>Past performance and screener scores do not guarantee future results.</li>
          <li>Assignment can occur any time before expiration — don&apos;t assume European-style behavior.</li>
          <li>A CSP carries full downside: if the stock falls hard, you&apos;re still obligated to buy at the strike.</li>
          <li>This app never places trades — sell-to-open in Robinhood yourself.</li>
        </ul>
      </Card>
    </div>
  );
}

function LeapNew({ ideas }: { ideas: ResearchIdea[] }) {
  return (
    <div className="mt-4">
      {ideas.length === 0 ? (
        <Card className="px-4 py-5 text-center text-sm text-muted">No LEAP ideas yet.</Card>
      ) : (
        <>
          <p className="mb-2 px-1 text-[11px] text-muted">
            Curated long-dated call ideas (deep-ITM, 12+ months out). A live scored screen — like the
            CSP screen — can be wired in next; for now these are watchlist candidates.
          </p>
          <Card className="divide-y divide-border">
            {ideas.map((idea) => (
              <Link key={idea.symbol} href="/research" className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-[11px] font-bold">
                  {idea.symbol}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{idea.name}</div>
                  <div className="truncate text-[11px] text-muted">{idea.thesis}</div>
                </div>
                <Pill className="bg-violet-500/10 text-violet-300 ring-violet-500/20">{idea.signal}</Pill>
              </Link>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Disclaimers</SectionTitle>
      <Card className="px-4 py-3">
        <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted">
          <li>Not financial advice. You are responsible for your own trades.</li>
          <li>LEAPS carry full premium risk — a long call can expire worthless.</li>
          <li>Deep-ITM ≠ safe: high delta means large dollar moves with the underlying.</li>
          <li>Roll before ~12 months to expiry to stay ahead of theta acceleration.</li>
          <li>This app never places trades — buy-to-open in Robinhood yourself.</li>
        </ul>
      </Card>
    </div>
  );
}
