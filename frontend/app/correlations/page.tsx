"use client";
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CorrPair, type CorrelationsResponse } from "@/lib/api";
import { CorrelationHeatmap } from "@/components/charts/CorrelationHeatmap";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageGuide } from "@/components/PageGuide";

// ── Options ───────────────────────────────────────────────────────────────────

const UNIVERSES = [
  { value: "sectors",  label: "Sectors & ETFs", desc: "11 sector ETFs + SPY, QQQ, IWM, GLD, TLT" },
  { value: "sp500",    label: "S&P 500",        desc: "Top/bottom 30 by 3M return" },
  { value: "etfs",     label: "Popular ETFs",   desc: "Top/bottom 30 popular ETFs" },
  { value: "nifty50",  label: "Nifty 50",       desc: "India top 50" },
  { value: "euro_top", label: "Europe",         desc: "Euro Stoxx top 40" },
  { value: "custom",   label: "Custom",         desc: "Enter tickers below" },
];

const PERIODS = [
  { value: 21,  label: "1M"  },
  { value: 63,  label: "3M"  },
  { value: 126, label: "6M"  },
  { value: 252, label: "1Y"  },
];

const TOP_N_OPTIONS = [15, 20, 30, 40, 50];

// ── Helpers ───────────────────────────────────────────────────────────────────

function corrColor(v: number): string {
  if (v >= 0.7) return "text-indigo-400";
  if (v >= 0.4) return "text-blue-400";
  if (v >= 0.1) return "text-text-muted";
  if (v >= -0.1) return "text-text-muted";
  return "text-red-400";
}

function avgCorrLabel(v: number): { label: string; color: string } {
  if (v >= 0.65) return { label: "High — low diversification",  color: "text-red-400"    };
  if (v >= 0.45) return { label: "Moderate",                    color: "text-amber-400"  };
  if (v >= 0.25) return { label: "Low — good diversification",  color: "text-emerald-400"};
  return                 { label: "Very low",                   color: "text-emerald-400"};
}

// ── Pair table ────────────────────────────────────────────────────────────────

function PairTable({ pairs, title, icon }: { pairs: CorrPair[]; title: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-text-primary mb-3">
        {icon}
        {title}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted border-b border-border">
            <th className="text-left pb-2 font-normal">Pair</th>
            <th className="text-right pb-2 font-normal w-16">Corr.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {pairs.map((p, i) => (
            <tr key={i} className="hover:bg-surface-2 transition-colors">
              <td className="py-1.5 font-mono">
                <span className="text-text-primary">{p.t1}</span>
                <span className="text-text-muted mx-1">/</span>
                <span className="text-text-primary">{p.t2}</span>
              </td>
              <td className={cn("py-1.5 text-right font-mono font-semibold", corrColor(p.corr))}>
                {p.corr >= 0 ? "+" : ""}{p.corr.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CorrelationsPage() {
  const [universe,   setUniverse]   = useState("sectors");
  const [periodDays, setPeriodDays] = useState(63);
  const [topN,       setTopN]       = useState(30);
  const [customInput, setCustomInput] = useState("");
  const [customTickers, setCustomTickers] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const activeUniverse = universe === "custom" && customTickers
    ? customTickers
    : universe === "custom"
    ? "sectors"  // fallback until user enters tickers
    : universe;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey:  ["correlations", activeUniverse, periodDays, topN],
    queryFn:   () => api.getCorrelations({
      universe:    activeUniverse,
      period_days: periodDays,
      top_n:       topN,
    }),
    staleTime: 5 * 60 * 1000,
    enabled:   !(universe === "custom" && !customTickers),
  });

  function applyCustom() {
    const raw = customInput.trim().toUpperCase();
    if (!raw) return;
    setCustomTickers(raw.split(/[\s,]+/).filter(Boolean).join(","));
  }

  const avgMeta = data ? avgCorrLabel(data.avg_correlation) : null;

  return (
    <div className="space-y-5 max-w-screen-xl">
      <PageGuide
        title="Correlation Matrix — Guide"
        subtitle="Rolling correlation heatmap for diversification and risk analysis"
        steps={[
          { title: "Select a Universe", detail: "Choose Sectors & ETFs for a broad market view, S&P 500 for large caps, Popular ETFs for asset class correlations, Nifty 50 for Indian markets, Europe for European stocks, or Custom to enter your own tickers." },
          { title: "Pick a Time Period", detail: "The correlation period (1M, 3M, 6M, 1Y) controls how much history is used. Short periods (1M) capture recent regime correlations; longer periods (1Y) show structural relationships." },
          { title: "Read the Heatmap", detail: "The heatmap shows pairwise correlations. Dark blue = strong positive correlation (+1). Dark red = strong negative correlation (-1). White/light = uncorrelated (0). The diagonal is always +1 (each asset with itself)." },
          { title: "Find Diversifiers", detail: "Look for asset pairs with correlation near 0 or negative (green cells) — these are true portfolio diversifiers. GLD and TLT often show negative correlation to SPY in risk-off periods." },
          { title: "Sort and Filter", detail: "Click any row or column header to reorder the matrix by that asset. Use the search filter in Custom mode to select specific pairs of interest." },
        ]}
        howItWorks={[
          { title: "Rolling Correlation", detail: "For each pair of assets, the Pearson correlation coefficient is computed from their daily log return series over the selected period. The matrix is symmetric." },
          { title: "Color Scale", detail: "Correlations range from -1 to +1. The color scale maps this to a red-white-blue gradient. Values above 0.7 in blue indicate assets that tend to move together — diversification is minimal." },
          { title: "Regime Sensitivity", detail: "Correlations are not static — in market stress events, most risky assets' correlations converge to +1 (they all fall together). Short-period heatmaps will capture this regime shift faster than long-period ones." },
          { title: "Custom Universe", detail: "In Custom mode, you can enter any list of valid Yahoo Finance tickers. The backend fetches their price history and computes the correlation matrix on the fly." },
        ]}
        tips={[
          "A portfolio where most pairwise correlations are above 0.7 provides almost no diversification benefit — you're holding the same risk in multiple forms.",
          "Check correlations at 1M during market selloffs to see how your 'diversifiers' actually behave in a crisis.",
          "GLD's correlation to equities flips from slightly positive in calm markets to negative in panics — it's a true crisis hedge.",
        ]}
      />
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-base font-semibold">Correlation Explorer</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {data
              ? `${data.n_stocks} instruments · ${data.period_days}D returns · as of ${data.as_of ?? "—"} · hierarchically clustered`
              : "Select universe and period to compute correlations"}
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 rounded bg-surface-2 border border-border text-text-muted hover:text-text-primary disabled:opacity-50"
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Universe */}
        <div className="space-y-1">
          <div className="text-xs text-text-muted">Universe</div>
          <div className="flex gap-1 flex-wrap">
            {UNIVERSES.map(({ value, label }) => (
              <button key={value} onClick={() => setUniverse(value)}
                className={cn(
                  "px-2.5 py-1.5 rounded text-xs transition-colors",
                  universe === value
                    ? "bg-accent text-white"
                    : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                )}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Period */}
        <div className="space-y-1">
          <div className="text-xs text-text-muted">Period</div>
          <div className="flex gap-1">
            {PERIODS.map(({ value, label }) => (
              <button key={value} onClick={() => setPeriodDays(value)}
                className={cn(
                  "px-2.5 py-1.5 rounded text-xs transition-colors w-10",
                  periodDays === value
                    ? "bg-accent text-white"
                    : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                )}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Top N — only for non-sectors */}
        {universe !== "sectors" && universe !== "custom" && (
          <div className="space-y-1">
            <div className="text-xs text-text-muted">Top N</div>
            <div className="flex gap-1">
              {TOP_N_OPTIONS.map((n) => (
                <button key={n} onClick={() => setTopN(n)}
                  className={cn(
                    "px-2.5 py-1.5 rounded text-xs transition-colors w-10",
                    topN === n
                      ? "bg-accent text-white"
                      : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                  )}
                >{n}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Custom ticker input */}
      {universe === "custom" && (
        <div className="flex gap-2 items-center">
          <input
            ref={inputRef}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            placeholder="AAPL, MSFT, NVDA, TSLA…"
            className="flex-1 max-w-md bg-surface-2 border border-border rounded px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
          />
          <button
            onClick={applyCustom}
            className="px-3 py-1.5 rounded bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors"
          >
            Apply
          </button>
          {customTickers && (
            <span className="text-xs text-text-muted">
              {customTickers.split(",").length} tickers
            </span>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-text-muted text-sm gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Computing correlations…
        </div>
      )}

      {/* No data prompt for custom */}
      {universe === "custom" && !customTickers && !isLoading && (
        <div className="flex items-center justify-center py-20 text-text-muted text-sm">
          Enter tickers above and click Apply
        </div>
      )}

      {data && data.tickers.length > 0 && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-xs text-text-muted mb-1">Avg Correlation</div>
              <div className={cn("text-xl font-semibold font-mono", avgMeta?.color)}>
                {data.avg_correlation >= 0 ? "+" : ""}{data.avg_correlation.toFixed(2)}
              </div>
              <div className="text-xs text-text-muted mt-1">{avgMeta?.label}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-xs text-text-muted mb-1">Instruments</div>
              <div className="text-xl font-semibold font-mono text-text-primary">{data.n_stocks}</div>
              <div className="text-xs text-text-muted mt-1">{data.period_days}D return window</div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-xs text-text-muted mb-1">Highest Corr.</div>
              {data.most_correlated[0] ? (
                <>
                  <div className="text-sm font-mono font-semibold text-indigo-400">
                    +{data.most_correlated[0].corr.toFixed(2)}
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    {data.most_correlated[0].t1} / {data.most_correlated[0].t2}
                  </div>
                </>
              ) : <div className="text-text-muted text-sm">—</div>}
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-xs text-text-muted mb-1">Best Diversifier</div>
              {data.least_correlated[0] ? (
                <>
                  <div className={cn("text-sm font-mono font-semibold",
                    data.least_correlated[0].corr < 0 ? "text-red-400" : "text-emerald-400")}>
                    {data.least_correlated[0].corr >= 0 ? "+" : ""}
                    {data.least_correlated[0].corr.toFixed(2)}
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    {data.least_correlated[0].t1} / {data.least_correlated[0].t2}
                  </div>
                </>
              ) : <div className="text-text-muted text-sm">—</div>}
            </div>
          </div>

          {/* Heatmap */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-sm font-medium mb-1">Correlation Matrix</div>
            <div className="text-xs text-text-muted mb-4">
              Sorted by hierarchical clustering · hover a cell for exact value
            </div>
            <CorrelationHeatmap data={{ tickers: data.tickers, matrix: data.matrix }} />
          </div>

          {/* Pair tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PairTable
              title="Most Correlated Pairs"
              pairs={data.most_correlated}
              icon={<TrendingUp size={12} className="text-indigo-400" />}
            />
            <PairTable
              title="Best Diversifiers (Least Correlated)"
              pairs={data.least_correlated}
              icon={<TrendingDown size={12} className="text-emerald-400" />}
            />
          </div>
        </>
      )}

      {data && data.tickers.length === 0 && !isLoading && (
        <div className="flex items-center justify-center py-20 text-text-muted text-sm">
          {data.message ?? "No price data cached for this universe — run the Screener or Setups to prefetch prices."}
        </div>
      )}
    </div>
  );
}
