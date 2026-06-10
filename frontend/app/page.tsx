"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { IndexCard } from "@/components/IndexCard";
import { SectorHeatmap } from "@/components/charts/SectorHeatmap";
import { BreadthPanel } from "@/components/BreadthPanel";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import { RefreshCw } from "lucide-react";

type Period = "change_1d" | "change_1w" | "change_1m" | "change_3m" | "change_ytd";
const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "change_1d", label: "1D" },
  { value: "change_1w", label: "1W" },
  { value: "change_1m", label: "1M" },
  { value: "change_3m", label: "3M" },
  { value: "change_ytd", label: "YTD" },
];

export default function OverviewPage() {
  const [activeTicker, setActiveTicker] = useState("SPY");
  const [heatPeriod, setHeatPeriod] = useState<Period>("change_1d");
  const queryClient = useQueryClient();

  const refreshMutation = useMutation({
    mutationFn: api.forceRefresh,
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries(), 3000);
    },
  });

  const { data: overview, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["overview"],
    queryFn: api.getOverview,
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted text-sm">
        <RefreshCw size={14} className="animate-spin mr-2" />
        Loading market data...
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex items-center justify-center h-64 text-negative text-sm">
        Failed to load market data. Is the backend running?
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Market Overview</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Indices, sector performance, and breadth
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            title="Re-fetch all prices from yfinance"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-border bg-surface-2 text-text-muted hover:text-text-primary disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={11} className={refreshMutation.isPending ? "animate-spin" : ""} />
            {refreshMutation.isPending ? "Fetching…" : "Live Update"}
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Index Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {overview.indices.map((idx) => (
          <IndexCard
            key={idx.ticker}
            data={idx}
            active={activeTicker === idx.ticker}
            onClick={() => setActiveTicker(idx.ticker)}
          />
        ))}
      </div>

      {/* Chart + Breadth */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">{activeTicker}</span>
            <span className="text-[10px] text-text-muted/60">Powered by TradingView</span>
          </div>
          <TradingViewWidget
            key={activeTicker}
            symbol={activeTicker}
            height={340}
            allowSymbolChange={false}
          />
        </div>
        <BreadthPanel data={overview.breadth} />
      </div>

      {/* Sector Heatmap */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium">Sectors</span>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => setHeatPeriod(p.value)}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  heatPeriod === p.value
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <SectorHeatmap sectors={overview.sectors} period={heatPeriod} />
      </div>
    </div>
  );
}
