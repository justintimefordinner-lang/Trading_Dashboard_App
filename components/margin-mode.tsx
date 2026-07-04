"use client";

// Persisted toggle for whether the VIX "portfolio fit" counts options buying
// power on top of liquidity (for margin users) or liquidity only. Defaults ON;
// stored in localStorage so it survives navigation and reloads. Shared by the
// home card and the VIX page.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = { marginAware: boolean; setMarginAware: (v: boolean) => void };

const MarginModeContext = createContext<Ctx>({ marginAware: true, setMarginAware: () => {} });
const KEY = "marginAware";

export function MarginModeProvider({ children }: { children: ReactNode }) {
  const [marginAware, setState] = useState(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v != null) setState(v === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const setMarginAware = (v: boolean) => {
    setState(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  return <MarginModeContext.Provider value={{ marginAware, setMarginAware }}>{children}</MarginModeContext.Provider>;
}

export function useMarginMode() {
  return useContext(MarginModeContext);
}
