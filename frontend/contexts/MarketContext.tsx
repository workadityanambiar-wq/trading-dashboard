"use client";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type MarketKey = "spx" | "nifty50" | "nifty500";

export interface MarketOption {
  key:         string;
  label:       string;
  flag:        string;
  region:      "us" | "india";
  description: string;
  disabled?:   boolean;
}

export const MARKETS: MarketOption[] = [
  // ── Active ──────────────────────────────────────────────────────────────────
  { key: "spx",      label: "S&P 500",     flag: "🇺🇸", region: "us",    description: "503 stocks · NASDAQ / NYSE" },
  { key: "nifty50",  label: "Nifty 50",    flag: "🇮🇳", region: "india", description: "50 large-cap stocks · NSE" },
  { key: "nifty500", label: "Nifty 500",   flag: "🇮🇳", region: "india", description: "500 stocks · NSE" },
  // ── Future ready ────────────────────────────────────────────────────────────
  { key: "ndx",       label: "Nasdaq 100",  flag: "🇺🇸", region: "us",    description: "Coming soon", disabled: true },
  { key: "dji",       label: "Dow Jones",   flag: "🇺🇸", region: "us",    description: "Coming soon", disabled: true },
  { key: "rut",       label: "Russell 2000",flag: "🇺🇸", region: "us",    description: "Coming soon", disabled: true },
  { key: "bankNifty", label: "Bank Nifty",  flag: "🇮🇳", region: "india", description: "Coming soon", disabled: true },
  { key: "sensex",    label: "Sensex",      flag: "🇮🇳", region: "india", description: "Coming soon", disabled: true },
];

const BENCHMARKS: Record<MarketKey, string> = {
  spx:      "^GSPC",
  nifty50:  "^NSEI",
  nifty500: "^NSEI",
};

const VIX_TICKERS: Record<MarketKey, string> = {
  spx:      "^VIX",
  nifty50:  "^INDIAVIX",
  nifty500: "^INDIAVIX",
};

// ── Context type ──────────────────────────────────────────────────────────────

interface MarketContextValue {
  market:       MarketKey;
  setMarket:    (m: MarketKey) => void;
  marketOption: MarketOption;
  isIndia:      boolean;
  isUS:         boolean;
  currency:     "USD" | "INR";
  currencySymbol: "$" | "₹";
  benchmark:    string;
  vixTicker:    string;
}

const MarketContext = createContext<MarketContextValue>({
  market:         "spx",
  setMarket:      () => {},
  marketOption:   MARKETS[0],
  isIndia:        false,
  isUS:           true,
  currency:       "USD",
  currencySymbol: "$",
  benchmark:      "^GSPC",
  vixTicker:      "^VIX",
});

// ── localStorage helper (safe SSR) ───────────────────────────────────────────

function readStoredMarket(): MarketKey {
  if (typeof window === "undefined") return "spx";
  const v = localStorage.getItem("ae-market");
  if (v === "spx" || v === "nifty50" || v === "nifty500") return v;
  return "spx";
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function MarketProvider({ children }: { children: ReactNode }) {
  const [market, setMarketState] = useState<MarketKey>(readStoredMarket);

  const setMarket = useCallback((m: MarketKey) => {
    setMarketState(m);
    if (typeof window !== "undefined") localStorage.setItem("ae-market", m);
  }, []);

  const isIndia        = market === "nifty50" || market === "nifty500";
  const isUS           = !isIndia;
  const currency       = isIndia ? "INR" : "USD";
  const currencySymbol = isIndia ? "₹" : "$";
  const benchmark      = BENCHMARKS[market];
  const vixTicker      = VIX_TICKERS[market];
  const marketOption   = MARKETS.find(m => m.key === market) ?? MARKETS[0];

  return (
    <MarketContext.Provider value={{
      market, setMarket, marketOption, isIndia, isUS,
      currency, currencySymbol, benchmark, vixTicker,
    }}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  return useContext(MarketContext);
}
