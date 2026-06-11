"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ExternalLink, Star, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import { api } from "@/lib/api";
import { useChart } from "@/contexts/ChartContext";
import { useWatchlist } from "@/hooks/useWatchlist";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Interval = "60" | "D" | "W" | "M";

const INTERVALS: { value: Interval; label: string }[] = [
  { value: "60", label: "1H" },
  { value: "D",  label: "D"  },
  { value: "W",  label: "W"  },
  { value: "M",  label: "M"  },
];

// ── Small helpers ────────────────────────────────────────────────────────────

function pct(v: number | null) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}
function fmt(v: number | null, dec = 1) {
  return v == null ? "—" : v.toFixed(dec);
}
function statColor(v: number | null) {
  if (v == null) return "text-text-muted";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-text-muted";
}

const SETUP_COLOR: Record<string, string> = {
  "Early Breakout":             "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  "Volatility Squeeze":         "text-amber-400   border-amber-500/40   bg-amber-500/10",
  "Momentum Continuation":      "text-blue-400    border-blue-500/40    bg-blue-500/10",
  "Institutional Accumulation": "text-purple-400  border-purple-500/40  bg-purple-500/10",
  "Mean Reversion Bounce":      "text-teal-400    border-teal-500/40    bg-teal-500/10",
  "Failed Breakdown Reversal":  "text-orange-400  border-orange-500/40  bg-orange-500/10",
};

// ── Stats strip shown above the chart ───────────────────────────────────────

function StatsStrip({ ticker }: { ticker: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["stock-detail", ticker],
    queryFn: () => api.getStockDetail(ticker),
    staleTime: 3 * 60 * 1000,
    retry: false,
  });
  const { has, add, remove, mounted } = useWatchlist();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface-2/40 text-xs text-text-muted">
        <RefreshCw size={11} className="animate-spin" />
        Loading stats…
      </div>
    );
  }
  if (!data) return null;

  const sig   = data.signals;
  const up    = sig.chg_1d != null && sig.chg_1d >= 0;
  const setup = SETUP_COLOR[sig.setup];
  const rsiColor = sig.rsi == null ? "text-text-muted"
    : sig.rsi > 70 ? "text-red-400" : sig.rsi < 35 ? "text-blue-400" : "text-text-primary";
  const isWatched = mounted && has(ticker);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 border-b border-border bg-surface-2/30 text-xs">
      {/* Price */}
      <div className="flex items-center gap-2">
        <span className="text-base font-bold font-mono text-text-primary">
          ${data.price?.toFixed(2) ?? "—"}
        </span>
        <span className={cn("flex items-center gap-0.5 font-mono font-medium text-sm",
          up ? "text-emerald-400" : "text-red-400"
        )}>
          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {pct(sig.chg_1d)}
        </span>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-border" />

      {/* Setup */}
      {sig.setup !== "No Setup" && setup && (
        <span className={cn("px-2 py-0.5 rounded border text-[10px] font-semibold", setup)}>
          {sig.setup}
        </span>
      )}

      {/* Stage */}
      {sig.stage != null && (
        <span className={cn("font-medium",
          sig.stage === 2 ? "text-emerald-400" :
          sig.stage === 3 ? "text-amber-400"   :
          sig.stage === 4 ? "text-red-400"     : "text-text-muted"
        )}>
          S{sig.stage}
        </span>
      )}

      {/* Key stats */}
      <span className="text-text-muted">RSI: <span className={rsiColor}>{fmt(sig.rsi, 0)}</span></span>
      <span className="text-text-muted">RS/SPY: <span className={statColor(sig.rs_spy_20d)}>{pct(sig.rs_spy_20d)}</span></span>
      {sig.vol_surge != null && (
        <span className="text-text-muted">Vol: <span className={sig.vol_surge >= 1.5 ? "text-amber-400" : "text-text-primary"}>{sig.vol_surge.toFixed(1)}×</span></span>
      )}
      {sig.confluence_score != null && (
        <span className="text-text-muted">Score: <span className={sig.confluence_score >= 65 ? "text-emerald-400" : sig.confluence_score >= 45 ? "text-amber-400" : "text-red-400"}>
          {Math.round(sig.confluence_score)}
        </span></span>
      )}
      {sig.dist_52w_high != null && (
        <span className="text-text-muted">52W Hi: <span className={statColor(sig.dist_52w_high)}>
          {pct(sig.dist_52w_high)}
        </span></span>
      )}

      {/* Watchlist toggle — pushed right */}
      {mounted && (
        <button
          onClick={() => isWatched ? remove(ticker) : add(ticker)}
          className="ml-auto flex items-center gap-1 text-text-muted hover:text-amber-400 transition-colors"
          title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
        >
          <Star size={12} className={isWatched ? "fill-amber-400 text-amber-400" : ""} strokeWidth={1.5} />
          <span className="text-[10px]">{isWatched ? "Watching" : "Watch"}</span>
        </button>
      )}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export function ChartModal() {
  const { activeTicker, closeChart } = useChart();
  const [interval, setInterval] = useState<Interval>("D");

  // close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") closeChart(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [closeChart]);

  // reset interval when ticker changes
  useEffect(() => { setInterval("D"); }, [activeTicker]);

  if (!activeTicker) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={closeChart}
    >
      <div
        className="relative w-full max-w-5xl flex flex-col rounded-xl border border-border bg-surface shadow-2xl overflow-hidden"
        style={{ maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Title bar ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-base text-text-primary">{activeTicker}</span>

            {/* Interval switcher */}
            <div className="flex rounded border border-border overflow-hidden text-[10px]">
              {INTERVALS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setInterval(value)}
                  className={cn(
                    "px-2.5 py-1 transition-colors border-r border-border last:border-0",
                    interval === value
                      ? "bg-accent text-white"
                      : "bg-surface-2 text-text-muted hover:text-text-primary"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/stock/${activeTicker}`}
              onClick={closeChart}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
            >
              <ExternalLink size={12} />
              Full detail
            </Link>
            <button
              onClick={closeChart}
              className="p-1 text-text-muted hover:text-text-primary transition-colors rounded hover:bg-surface-2"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Stats strip (fetches stock detail) ───────────────────────── */}
        <div className="shrink-0">
          <StatsStrip ticker={activeTicker} />
        </div>

        {/* ── Chart ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0">
          <TradingViewWidget
            key={`${activeTicker}-${interval}`}
            symbol={activeTicker}
            height={520}
            interval={interval}
            hideSideToolbar={false}
            allowSymbolChange={false}
          />
        </div>
      </div>
    </div>
  );
}
