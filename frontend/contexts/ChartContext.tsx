"use client";
import { createContext, useContext, useState, useCallback } from "react";

interface ChartContextValue {
  openChart: (ticker: string) => void;
  closeChart: () => void;
  activeTicker: string | null;
}

const ChartContext = createContext<ChartContextValue>({
  openChart: () => {},
  closeChart: () => {},
  activeTicker: null,
});

export function ChartProvider({ children }: { children: React.ReactNode }) {
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const openChart  = useCallback((t: string) => setActiveTicker(t.toUpperCase()), []);
  const closeChart = useCallback(() => setActiveTicker(null), []);

  return (
    <ChartContext.Provider value={{ openChart, closeChart, activeTicker }}>
      {children}
    </ChartContext.Provider>
  );
}

export function useChart() {
  return useContext(ChartContext);
}
