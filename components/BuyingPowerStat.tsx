"use client";

// Home-screen liquidity tile that mirrors the VIX "portfolio fit" margin toggle:
//  • Liquidity + options BP  → shows Options buying power (+ margin utilization, no cash)
//  • Liquidity only          → shows Cash instead (no options BP, no margin line)
import { Stat } from "@/components/ui";
import { Amt } from "@/components/privacy";
import { fmtMoney } from "@/lib/calc";
import { useMarginMode } from "@/components/margin-mode";

export function BuyingPowerStat({
  optionsBuyingPower,
  uncommittedCash,
  marginUsed,
  totalValue,
}: {
  optionsBuyingPower: number;
  uncommittedCash: number;
  marginUsed: number;
  totalValue: number;
}) {
  const { marginAware } = useMarginMode();
  const share = (v: number) => (totalValue > 0 ? `${Math.round((v / totalValue) * 100)}%` : "0%");

  // Liquidity only → genuine free cash (calc.freeCashValue: net of CSP/spread
  // collateral, incl. money-market sweep), the same figure as the Cash pie slice.
  // No buying power, no margin line.
  if (!marginAware) {
    return (
      <Stat label="Uncommitted cash" value={<Amt>{fmtMoney(uncommittedCash)}</Amt>} pct={share(uncommittedCash)} />
    );
  }

  // Margin-aware → options buying power with its margin-utilization line (no cash).
  const marginPct = totalValue > 0 ? marginUsed / totalValue : 0;
  const marginColor =
    marginPct >= 0.28 ? "text-rose-400" : marginPct >= 0.2 ? "text-orange-400" : "text-muted";
  return (
    <Stat
      label="Options buying power"
      value={<Amt>{fmtMoney(optionsBuyingPower)}</Amt>}
      pct={share(optionsBuyingPower)}
      sub={
        <>
          <Amt>{`$${Math.round(marginUsed / 1000)}K`}</Amt> <span className="font-semibold">used margin</span>{" "}
          <span className={marginColor}>{Math.round(marginPct * 100)}%</span>
        </>
      }
    />
  );
}
