"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, FACTOR_OPTIONS, type BacktestConfig, type BacktestResult } from "@/lib/api";
import { EquityCurve } from "@/components/charts/EquityCurve";
import { DrawdownChart } from "@/components/charts/DrawdownChart";
import { MonthlyReturnsHeatmap } from "@/components/charts/MonthlyReturnsHeatmap";
import { RollingSharpChart } from "@/components/charts/RollingSharpChart";
import { StatsTable } from "@/components/tables/StatsTable";
import { cn, formatPct } from "@/lib/utils";
import { Play, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";

// ── Config form state ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: BacktestConfig = {
  factor: "momentum_12_1",
  top_n: 50,
  cost_bps: 10,
  start_date: "2019-01-01",
};

// ── Stat highlight cards ──────────────────────────────────────────────────────

function KpiCard({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className={cn("text-xl font-semibold font-mono", positive ? "text-positive" : "text-negative")}>
        {value}
      </div>
    </div>
  );
}

function ResultKpis({ r }: { r: BacktestResult }) {
  const s = r.stats;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      <KpiCard label="Total Return" value={s.total_return != null ? formatPct(s.total_return) : "—"} positive={(s.total_return ?? 0) >= 0} />
      <KpiCard label="CAGR" value={s.cagr != null ? formatPct(s.cagr) : "—"} positive={(s.cagr ?? 0) >= 0} />
      <KpiCard label="Sharpe" value={s.sharpe?.toFixed(2) ?? "—"} positive={(s.sharpe ?? 0) >= 1} />
      <KpiCard label="Sortino" value={s.sortino?.toFixed(2) ?? "—"} positive={(s.sortino ?? 0) >= 1} />
      <KpiCard label="Max Drawdown" value={s.max_drawdown != null ? formatPct(s.max_drawdown) : "—"} positive={false} />
      <KpiCard label="Alpha (ann.)" value={s.alpha != null ? formatPct(s.alpha) : "—"} positive={(s.alpha ?? 0) >= 0} />
      <KpiCard label="Info Ratio" value={s.information_ratio?.toFixed(2) ?? "—"} positive={(s.information_ratio ?? 0) >= 0.5} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BacktestPage() {
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG);

  const { mutate, data, isPending, error } = useMutation({
    mutationFn: api.runBacktest,
  });

  function set<K extends keyof BacktestConfig>(key: K, val: BacktestConfig[K]) {
    setConfig((c) => ({ ...c, [key]: val }));
  }

  return (
    <div className="space-y-5 max-w-screen-2xl">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold">Strategy Backtester</h1>
        <p className="text-xs text-text-muted mt-0.5">
          Cross-sectional long-only · equal-weight · monthly rebalance
        </p>
      </div>

      {/* Config panel */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Factor */}
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Signal</label>
            <div className="flex gap-1">
              {FACTOR_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => set("factor", f.value)}
                  className={cn(
                    "px-2.5 py-1.5 rounded text-xs transition-colors",
                    config.factor === f.value
                      ? "bg-accent text-white"
                      : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Top N */}
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Top N stocks</label>
            <div className="flex gap-1">
              {[10, 25, 50, 100].map((n) => (
                <button
                  key={n}
                  onClick={() => set("top_n", n)}
                  className={cn(
                    "px-2.5 py-1.5 rounded text-xs transition-colors w-10",
                    config.top_n === n
                      ? "bg-accent text-white"
                      : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Cost bps */}
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Cost (bps)</label>
            <div className="flex gap-1">
              {[0, 5, 10, 20].map((c) => (
                <button
                  key={c}
                  onClick={() => set("cost_bps", c)}
                  className={cn(
                    "px-2.5 py-1.5 rounded text-xs transition-colors w-10",
                    config.cost_bps === c
                      ? "bg-accent text-white"
                      : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Start date */}
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Start date</label>
            <input
              type="date"
              value={config.start_date}
              onChange={(e) => set("start_date", e.target.value)}
              className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          {/* Run button */}
          <button
            onClick={() => mutate(config)}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-1.5 rounded bg-accent hover:bg-accent/90 text-white text-xs font-medium transition-colors disabled:opacity-60"
          >
            {isPending ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Play size={13} />
            )}
            {isPending ? "Running..." : "Run Backtest"}
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
          Computing strategy returns...
        </div>
      )}

      {/* Results */}
      {data && !isPending && (
        <div className="space-y-5">
          {/* KPI cards */}
          <ResultKpis r={data} />

          <div className="text-xs text-text-muted">
            {data.n_dates} trading days · {data.n_tickers_available} stocks in universe ·{" "}
            {data.config.top_n} held per rebalance · {data.config.cost_bps} bps cost
          </div>

          {/* Equity curve */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-sm font-medium mb-1">Equity Curve</div>
            <div className="text-xs text-text-muted mb-4">Cumulative return vs SPY</div>
            <EquityCurve data={data.equity_curve} height={300} />
          </div>

          {/* Drawdown */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-sm font-medium mb-1">Drawdown</div>
            <div className="text-xs text-text-muted mb-4">Underwater equity chart</div>
            <DrawdownChart data={data.drawdown_series} height={180} />
          </div>

          {/* Monthly heatmap + Rolling Sharpe side by side */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-1">Monthly Returns</div>
              <div className="text-xs text-text-muted mb-4">Calendar heatmap</div>
              <MonthlyReturnsHeatmap data={data.monthly_returns} />
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-1">Rolling 12-Month Sharpe</div>
              <div className="text-xs text-text-muted mb-4">252-day rolling window</div>
              <RollingSharpChart data={data.rolling_sharpe} height={220} />
            </div>
          </div>

          {/* Full stats table */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-sm font-medium mb-4">Full Statistics</div>
            <StatsTable stats={data.stats} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!data && !isPending && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-text-muted gap-3">
          <TrendingUp size={32} strokeWidth={1} />
          <div className="text-sm">Configure and run a backtest above</div>
          <div className="text-xs">S&P 500 universe · momentum, low-vol, or custom signal</div>
        </div>
      )}
    </div>
  );
}
