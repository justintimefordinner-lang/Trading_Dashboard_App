// Desktop shell for a genuinely different surface: a wide, sortable/groupable
// positions table, not the mobile phone-frame app. app/layout.tsx already
// skips the phone-frame chrome for any /desktop path (see proxy.ts).
import { getSnapshot } from "@/lib/snapshot";
import { accountLabel } from "@/lib/account-shared";
import { PositionsTable } from "@/components/desktop/PositionsTable";

export const dynamic = "force-dynamic";

export default async function DesktopPage() {
  const snap = await getSnapshot();
  // Every account, each option tagged with its account label, so the table
  // can group and sort by source.
  const options = snap.accounts.flatMap((a) =>
    (snap.data[a.id]?.options ?? []).map((o) => ({ ...o, sourceLabel: accountLabel(a) })),
  );

  return (
    <main className="min-h-screen w-full bg-bg px-6 py-6 text-text">
      <PositionsTable options={options} />
    </main>
  );
}
