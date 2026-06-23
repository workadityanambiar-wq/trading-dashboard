"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  api,
  type OptimizeRequest,
  type OptimizeResponse,
  type PortfolioMetrics,
} from "@/lib/api";
import { EfficientFrontier } from "@/components/charts/EfficientFrontier";
import { CorrelationHeatmap } from "@/components/charts/CorrelationHeatmap";
import { cn, formatPct } from "@/lib/utils";
import { Play, RefreshCw, PieChart } from "lucide-react";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";
import { PageGuide } from "@/components/PageGuide";

const METHODS = [
  { value: "equal_weight", label: "Equal Weight" },
  { value: "max_sharpe", label: "Max Sharpe" },
  { value: "min_volatility", label: "Min Vol" },
  { value: "hrp", label: "HRP" },
];

const METHOD_COLORS: Record<string, string> = {
  equal_weight: "#94a3b8",
  max_sharpe: "#22c55e",
  min_volatility: "#6366f1",
  hrp: "#f59e0b",
};

const DEFAULT_TICKERS = "AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA,JPM,JNJ,XOM";

// ── Metrics card for one method ───────────────────────────────────────────────

function MethodCard({
  method,
  label,
  metrics,
  selected,
  onClick,
}: {
  method: string;
  label: string;
  metrics: PortfolioMetrics;
  selected: boolean;
  onClick: () => void;
}) {
  const color = METHOD_COLORS[method] ?? "#fff";
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors w-full",
        selected ? "border-accent bg-surface" : "border-border bg-surface hover:border-accent/50"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center">
        <div>
          <div className="text-text-muted text-[10px]">Ret</div>
          <div
            className="text-xs font-mono font-semibold"
            style={{ color: metrics.expected_return >= 0 ? "#22c55e" : "#ef4444" }}
          >
            {formatPct(metrics.expected_return)}
          </div>
        </div>
        <div>
          <div className="text-text-muted text-[10px]">Vol</div>
          <div className="text-xs font-mono font-semibold text-text-primary">
            {formatPct(metrics.volatility)}
          </div>
        </div>
        <div>
          <div className="text-text-muted text-[10px]">Sharpe</div>
          <div
            className="text-xs font-mono font-semibold"
            style={{ color: metrics.sharpe >= 1 ? "#22c55e" : metrics.sharpe >= 0 ? "#f59e0b" : "#ef4444" }}
          >
            {metrics.sharpe.toFixed(2)}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Allocation weight bar ─────────────────────────────────────────────────────

function AllocationTable({
  allocations,
  method,
}: {
  allocations: Record<string, number>;
  method: string;
}) {
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const sorted = Object.entries(allocations).sort((a, b) => b[1] - a[1]);
  const color = METHOD_COLORS[method] ?? "#6366f1";

  return (
    <>
    <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
      {sorted.map(([ticker, w]) => (
        <div key={ticker} onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${ticker}`, color })}
          className="flex items-center gap-2 text-xs cursor-pointer hover:opacity-80 transition-opacity">
          <span className="w-12 text-right font-mono text-text-primary shrink-0">{ticker}</span>
          <div className="flex-1 bg-surface-2 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(w * 100).toFixed(1)}%`, background: color }}
            />
          </div>
          <span className="w-12 font-mono text-text-muted text-right shrink-0">
            {(w * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
    <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [tickerInput, setTickerInput] = useState(DEFAULT_TICKERS);
  const [selectedMethods, setSelectedMethods] = useState<string[]>(["equal_weight", "max_sharpe", "min_volatility", "hrp"]);
  const [maxWeight, setMaxWeight] = useState(0.25);
  const [startDate, setStartDate] = useState("2019-01-01");
  const [activeMethod, setActiveMethod] = useState<string>("max_sharpe");

  const { mutate, data, isPending, error } = useMutation({
    mutationFn: api.optimizePortfolio,
    onSuccess: (d) => {
      const methods = Object.keys(d.allocations);
      if (methods.includes("max_sharpe")) setActiveMethod("max_sharpe");
      else if (methods.length) setActiveMethod(methods[0]);
    },
  });

  function toggleMethod(m: string) {
    setSelectedMethods((prev) =>
      prev.includes(m) ? (prev.length > 1 ? prev.filter((x) => x !== m) : prev) : [...prev, m]
    );
  }

  function runOptimize() {
    const tickers = tickerInput
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    const req: OptimizeRequest = {
      tickers,
      methods: selectedMethods,
      max_weight: maxWeight,
      start_date: startDate,
    };
    mutate(req);
  }

  const activeAlloc = data?.allocations[activeMethod] ?? {};
  const activeMetrics = data?.metrics[activeMethod];

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <PageGuide
        title="Portfolio Optimizer — Guide"
        subtitle="Mean-variance and hierarchical risk parity optimization with efficient frontier"
        steps={[
          { title: "Enter Your Tickers", detail: "Type a comma-separated list of tickers in the input box (e.g. AAPL,MSFT,GOOGL,NVDA,JPM). The default is a diversified 10-stock portfolio. Use 5-20 assets for best results." },
          { title: "Select the Time Period", detail: "The lookback period (1Y, 3Y, 5Y) determines how much historical return data is used to estimate the covariance matrix. Longer periods are more stable but may not reflect recent market structure." },
          { title: "Choose an Optimization Method", detail: "Equal Weight: all positions equal. Max Sharpe: maximizes risk-adjusted return. Min Volatility: minimizes portfolio standard deviation. HRP: Hierarchical Risk Parity — allocates risk equally across clusters of correlated assets." },
          { title: "Run Optimization", detail: "Click the Run Optimization button. All four methods run simultaneously so you can compare them on the Efficient Frontier chart and metrics cards." },
          { title: "Interpret Results", detail: "Review the Sharpe ratio, CAGR, Max Drawdown, and Volatility for each method. Click a method card to highlight that portfolio on the Efficient Frontier chart. The correlation heatmap shows how diversified your portfolio is." },
        ]}
        howItWorks={[
          { title: "Data Collection", detail: "Historical daily returns are fetched from Yahoo Finance for all tickers in the portfolio. Returns are computed as log returns for numerical stability." },
          { title: "Covariance Matrix", detail: "The annualized covariance matrix is estimated from historical daily returns. The matrix captures how much assets move together — low off-diagonal values mean better diversification." },
          { title: "Max Sharpe Optimization", detail: "Uses scipy.optimize.minimize with the negative Sharpe ratio as the objective function. Constraints: weights sum to 1, all weights >= 0 (long-only)." },
          { title: "HRP Algorithm", detail: "Hierarchical Risk Parity clusters assets by correlation, then allocates risk inversely proportional to variance within each cluster. It's more robust to estimation error than mean-variance methods." },
          { title: "Efficient Frontier", detail: "The frontier is traced by running min-variance optimization at 50 equally spaced target return levels. The resulting risk/return pairs form the frontier curve." },
        ]}
        tips={[
          "HRP typically produces the most robust out-of-sample results because it doesn't rely on expected return estimates.",
          "If tickers are highly correlated (e.g. all tech), the optimizer will concentrate weight in the lowest-vol asset — diversify your input list.",
          "Use the correlation heatmap to identify which pairs drive the most diversification benefit.",
        ]}
      />
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold">Portfolio Optimizer</h1>
        <p className="text-xs text-text-muted mt-0.5">
          Mean-variance optimization · Equal Weight · Min Volatility · HRP · Efficient Frontier
        </p>
      </div>

      {/* Config */}
      <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
        {/* Tickers */}
        <div className="space-y-1">
          <label className="text-xs text-text-muted">Tickers (comma-separated)</label>
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            placeholder="AAPL, MSFT, GOOGL, ..."
            className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent font-mono"
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {/* Methods */}
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Methods</label>
            <div className="flex gap-1 flex-wrap">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => toggleMethod(m.value)}
                  className={cn(
                    "px-2.5 py-1.5 rounded text-xs transition-colors",
                    selectedMethods.includes(m.value)
                      ? "text-white"
                      : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                  )}
                  style={
                    selectedMethods.includes(m.value)
                      ? { background: METHOD_COLORS[m.value] }
                      : {}
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Max weight */}
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Max weight / position</label>
            <div className="flex gap-1">
              {[0.10, 0.15, 0.20, 0.25, 0.50].map((w) => (
                <button
                  key={w}
                  onClick={() => setMaxWeight(w)}
                  className={cn(
                    "px-2.5 py-1.5 rounded text-xs transition-colors w-12",
                    maxWeight === w
                      ? "bg-accent text-white"
                      : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                  )}
                >
                  {(w * 100).toFixed(0)}%
                </button>
              ))}
            </div>
          </div>

          {/* Start date */}
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          {/* Run button */}
          <button
            onClick={runOptimize}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-1.5 rounded bg-accent hover:bg-accent/90 text-white text-xs font-medium transition-colors disabled:opacity-60"
          >
            {isPending ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
            {isPending ? "Optimizing..." : "Optimize"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded border border-red-900/40 bg-red-950/20 text-red-400 text-xs p-3">
          {(error as Error).message}
        </div>
      )}

      {/* Loading */}
      {isPending && (
        <div className="flex items-center gap-2 justify-center py-16 text-text-muted text-sm">
          <RefreshCw size={14} className="animate-spin" />
          Running optimization...
        </div>
      )}

      {/* Results */}
      {data && !isPending && (
        <div className="space-y-5">
          {/* Info bar */}
          <div className="text-xs text-text-muted">
            {data.tickers_used.length} tickers used
            {data.tickers_missing.length > 0 && (
              <span className="text-yellow-500 ml-2">
                · Missing: {data.tickers_missing.join(", ")}
              </span>
            )}
            <span className="ml-2">
              · {data.price_history_start} to {data.price_history_end}
            </span>
          </div>

          {/* Method cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(data.metrics).map(([method, metrics]) => {
              const label = METHODS.find((m) => m.value === method)?.label ?? method;
              return (
                <MethodCard
                  key={method}
                  method={method}
                  label={label}
                  metrics={metrics}
                  selected={activeMethod === method}
                  onClick={() => setActiveMethod(method)}
                />
              );
            })}
          </div>

          {/* Efficient frontier + allocations */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-1">Efficient Frontier</div>
              <div className="text-xs text-text-muted mb-4">
                Risk vs. return — portfolio points overlaid
              </div>
              <EfficientFrontier
                frontier={data.frontier}
                portfolios={data.metrics}
                height={300}
              />
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-medium">Allocations</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {METHODS.find((m) => m.value === activeMethod)?.label ?? activeMethod} weights
                  </div>
                </div>
                {activeMetrics && (
                  <div className="flex gap-3 text-xs font-mono">
                    <span className="text-text-muted">
                      {formatPct(activeMetrics.expected_return)}{" "}
                      <span className="text-text-muted/60">ret</span>
                    </span>
                    <span className="text-text-muted">
                      {formatPct(activeMetrics.volatility)}{" "}
                      <span className="text-text-muted/60">vol</span>
                    </span>
                    <span
                      style={{
                        color:
                          activeMetrics.sharpe >= 1
                            ? "#22c55e"
                            : activeMetrics.sharpe >= 0
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    >
                      {activeMetrics.sharpe.toFixed(2)}{" "}
                      <span className="text-text-muted/60">sr</span>
                    </span>
                  </div>
                )}
              </div>
              <AllocationTable allocations={activeAlloc} method={activeMethod} />
            </div>
          </div>

          {/* Correlation heatmap */}
          {data.correlation?.tickers?.length >= 2 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-1">Correlation Matrix</div>
              <div className="text-xs text-text-muted mb-4">
                Pairwise daily return correlation of holdings
              </div>
              <CorrelationHeatmap data={data.correlation} />
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!data && !isPending && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-text-muted gap-3">
          <PieChart size={32} strokeWidth={1} />
          <div className="text-sm">Enter tickers and optimize a portfolio</div>
          <div className="text-xs">Compares equal weight, max Sharpe, min vol, and HRP</div>
        </div>
      )}
    </div>
  );
}
