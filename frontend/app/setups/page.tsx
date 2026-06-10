"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type SetupName, type RegimeResponse, type SetupWinRateStat } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RefreshCw, ChevronLeft, ChevronRight, TrendingUp, Zap, BarChart2, Activity, Calendar, FlaskConical, ChevronDown } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const SETUP_META: Record<SetupName, { color: string; bg: string; border: string; desc: string }> = {
  "Early Breakout":            { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", desc: "RS rising + near resistance + volume expanding" },
  "Volatility Squeeze":        { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   desc: "ATR/BB compressed — coiled spring" },
  "Momentum Continuation":     { color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30",    desc: "Stage 2 uptrend + MACD bullish + strong RS" },
  "Institutional Accumulation":{ color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/30",  desc: "Heavy volume without price drop — smart money" },
  "Mean Reversion Bounce":     { color: "text-teal-400",    bg: "bg-teal-500/10",    border: "border-teal-500/30",    desc: "RSI < 35 + near support — oversold snap-back" },
  "Failed Breakdown Reversal": { color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30",  desc: "Down >25% from high but RS improving" },
  "No Setup":                  { color: "text-text-muted",  bg: "bg-surface",        border: "border-border",         desc: "" },
};

const STAGE_META: Record<number, { label: string; color: string }> = {
  1: { label: "S1 Base",     color: "text-text-muted" },
  2: { label: "S2 Uptrend",  color: "text-emerald-400" },
  3: { label: "S3 Topping",  color: "text-amber-400" },
  4: { label: "S4 Downtrend",color: "text-red-400" },
};

const REGIME_META: Record<string, { color: string; bg: string; ring: string }> = {
  "Strong Trend": { color: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30" },
  "Choppy":       { color: "text-amber-400",   bg: "bg-amber-500/10",   ring: "ring-amber-500/30" },
  "Bear":         { color: "text-orange-400",  bg: "bg-orange-500/10",  ring: "ring-orange-500/30" },
  "Panic":        { color: "text-red-400",     bg: "bg-red-500/10",     ring: "ring-red-500/30" },
};

const SETUPS: SetupName[] = [
  "Early Breakout",
  "Volatility Squeeze",
  "Momentum Continuation",
  "Institutional Accumulation",
  "Mean Reversion Bounce",
  "Failed Breakdown Reversal",
];

const SORT_OPTIONS = [
  { value: "confluence_score",  label: "Confluence" },
  { value: "breakout_score",    label: "Breakout" },
  { value: "rs_spy_20d",        label: "RS vs SPY" },
  { value: "rs_sector_20d",     label: "RS vs Sector" },
  { value: "sector_vs_spy_20d", label: "Sector vs SPY" },
  { value: "vol_surge",         label: "Volume" },
  { value: "rsi",               label: "RSI" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}

function num(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return v.toFixed(dec);
}

function eventBadge(daysToEarn: number | null, daysToOpex: number | null) {
  if (daysToEarn != null && daysToEarn >= 0 && daysToEarn <= 7) {
    const hot = daysToEarn <= 2;
    return (
      <span
        className={cn(
          "px-1.5 py-0.5 rounded border text-xs font-medium",
          hot
            ? "text-red-400 border-red-500/40 bg-red-500/10"
            : "text-amber-400 border-amber-500/40 bg-amber-500/10",
        )}
        title={`Earnings in ${daysToEarn} day${daysToEarn === 1 ? "" : "s"} — high event risk`}
      >
        E{daysToEarn}d
      </span>
    );
  }
  if (daysToOpex != null && daysToOpex <= 2) {
    return (
      <span
        className="px-1.5 py-0.5 rounded border text-xs font-medium text-amber-400 border-amber-500/40 bg-amber-500/10"
        title={`Monthly options expiry in ${daysToOpex} day${daysToOpex === 1 ? "" : "s"}`}
      >
        OX{daysToOpex}d
      </span>
    );
  }
  return <span className="text-text-muted text-xs">—</span>;
}

function scoreBar(v: number | null) {
  const val = v ?? 0;
  const color = val >= 70 ? "bg-emerald-500" : val >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.round(val)}%` }} />
      </div>
      <span className={cn("text-xs tabular-nums font-medium",
        val >= 70 ? "text-emerald-400" : val >= 50 ? "text-amber-400" : "text-red-400"
      )}>{Math.round(val)}</span>
    </div>
  );
}

// ── Win-rate panel ────────────────────────────────────────────────────────────

const SETUP_ORDER: SetupName[] = [
  "Early Breakout",
  "Volatility Squeeze",
  "Momentum Continuation",
  "Institutional Accumulation",
  "Mean Reversion Bounce",
  "Failed Breakdown Reversal",
];

function WinRatesPanel() {
  const [open, setOpen]         = useState(false);
  const [computing, setComputing] = useState(false);
  const pollRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["setup-winrates"],
    queryFn:  () => api.getSetupWinRates(),
    staleTime: 60 * 60 * 1000,
    enabled: open,
  });

  // Poll every 8s while backend is computing
  useEffect(() => {
    if (data?.status === "computing") {
      pollRef.current = setTimeout(() => refetch(), 8000);
    }
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [data, refetch]);

  const handleCompute = useCallback(async () => {
    setComputing(true);
    await api.getSetupWinRates(true);
    setComputing(false);
    refetch();
  }, [refetch]);

  const isComputing = data?.status === "computing" || computing;
  const results     = data?.results;

  function wr(v?: number) {
    if (v == null) return <span className="text-text-muted">—</span>;
    const pct = (v * 100).toFixed(1);
    const col  = v >= 0.6 ? "text-emerald-400" : v >= 0.5 ? "text-amber-400" : "text-red-400";
    return <span className={cn("font-medium tabular-nums", col)}>{pct}%</span>;
  }

  function ret(v?: number) {
    if (v == null) return <span className="text-text-muted">—</span>;
    const pct = (v * 100).toFixed(1);
    return (
      <span className={cn("tabular-nums", v >= 0 ? "text-emerald-400" : "text-red-400")}>
        {v >= 0 ? "+" : ""}{pct}%
      </span>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Header — always visible */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <FlaskConical size={13} className="text-accent" />
          <span className="text-sm font-medium">Historical Setup Win Rates</span>
          {results && (
            <span className="text-xs text-text-muted ml-1">5y S&P 500 · month-end sampling</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isComputing && (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <RefreshCw size={10} className="animate-spin" /> Computing…
            </span>
          )}
          <ChevronDown size={14} className={cn("text-text-muted transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {/* Compute button */}
          {!results && !isComputing && (
            <div className="flex items-center gap-3 text-sm text-text-muted">
              <span>No cached data. Run the backtest to see win rates.</span>
              <button
                onClick={handleCompute}
                disabled={isComputing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border hover:border-accent hover:text-text-primary transition-colors"
              >
                <FlaskConical size={11} />
                Run Backtest
              </button>
            </div>
          )}

          {isComputing && !results && (
            <p className="text-xs text-text-muted">
              Computing 5 years of setup history across S&P 500… this takes ~30–60 seconds.
            </p>
          )}

          {/* Results table */}
          {results && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 text-left text-text-muted font-medium">Setup</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Trades</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Win% 5d</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Win% 10d</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Win% 20d</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Avg 10d</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Median 10d</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Expect. 10d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SETUP_ORDER.map((name) => {
                      const s: SetupWinRateStat | undefined = results[name];
                      const meta = SETUP_META[name];
                      return (
                        <tr key={name} className="border-b border-border/40 hover:bg-surface-2/40">
                          <td className="py-2 pr-4">
                            <span className={cn("font-medium", meta?.color ?? "text-text-primary")}>{name}</span>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-text-muted">
                            {s?.n_10d ?? "—"}
                          </td>
                          <td className="py-2 px-3 text-right">{wr(s?.win_rate_5d)}</td>
                          <td className="py-2 px-3 text-right">{wr(s?.win_rate_10d)}</td>
                          <td className="py-2 px-3 text-right">{wr(s?.win_rate_20d)}</td>
                          <td className="py-2 px-3 text-right">{ret(s?.avg_ret_10d)}</td>
                          <td className="py-2 px-3 text-right">{ret(s?.median_ret_10d)}</td>
                          <td className="py-2 px-3 text-right">{ret(s?.expectancy_10d)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between text-xs text-text-muted pt-1">
                <span>Win% ≥60% <span className="text-emerald-400">■</span> · ≥50% <span className="text-amber-400">■</span> · &lt;50% <span className="text-red-400">■</span></span>
                <button
                  onClick={handleCompute}
                  disabled={isComputing}
                  className="flex items-center gap-1 hover:text-text-primary transition-colors"
                >
                  <RefreshCw size={10} className={isComputing ? "animate-spin" : ""} />
                  Recompute
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Regime card ───────────────────────────────────────────────────────────────

function RegimeCard({ data }: { data: RegimeResponse }) {
  const meta = REGIME_META[data.regime] ?? REGIME_META["Choppy"];
  return (
    <div className={cn("rounded-lg border p-4 ring-1", meta.bg, meta.ring)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={13} className={meta.color} />
            <span className="text-xs text-text-muted uppercase tracking-wider">Market Regime</span>
          </div>
          <div className={cn("text-lg font-semibold mb-1", meta.color)}>{data.regime}</div>
          <p className="text-xs text-text-muted leading-relaxed">{data.description}</p>
          <div className="mt-2 text-xs text-text-primary/80 italic">
            Strategy: {data.best_strategy}
          </div>
        </div>
        <div className="shrink-0 grid grid-cols-2 gap-x-5 gap-y-1.5 text-xs text-right">
          {data.vix != null && (
            <><span className="text-text-muted">VIX</span><span className={cn("font-medium", data.vix > 25 ? "text-red-400" : data.vix > 18 ? "text-amber-400" : "text-emerald-400")}>{data.vix.toFixed(1)}</span></>
          )}
          {data.spy_vs_50d != null && (
            <><span className="text-text-muted">SPY/50D</span><span className={cn("font-medium", data.spy_vs_50d > 0 ? "text-emerald-400" : "text-red-400")}>{data.spy_vs_50d > 0 ? "+" : ""}{data.spy_vs_50d.toFixed(1)}%</span></>
          )}
          {data.spy_vs_200d != null && (
            <><span className="text-text-muted">SPY/200D</span><span className={cn("font-medium", data.spy_vs_200d > 0 ? "text-emerald-400" : "text-red-400")}>{data.spy_vs_200d > 0 ? "+" : ""}{data.spy_vs_200d.toFixed(1)}%</span></>
          )}
          {data.breadth_above_50d != null && (
            <><span className="text-text-muted">Breadth 50D</span><span className={cn("font-medium", data.breadth_above_50d > 60 ? "text-emerald-400" : data.breadth_above_50d > 40 ? "text-amber-400" : "text-red-400")}>{data.breadth_above_50d.toFixed(0)}%</span></>
          )}
          {data.breadth_above_200d != null && (
            <><span className="text-text-muted">Breadth 200D</span><span className={cn("font-medium", data.breadth_above_200d > 55 ? "text-emerald-400" : data.breadth_above_200d > 35 ? "text-amber-400" : "text-red-400")}>{data.breadth_above_200d.toFixed(0)}%</span></>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SetupsPage() {
  const [setupFilter, setSetupFilter]       = useState<string>("");
  const [stageFilter, setStageFilter]       = useState<string>("");
  const [sortBy, setSortBy]                 = useState("confluence_score");
  const [page, setPage]                     = useState(1);
  const [fetchingEvents, setFetchingEvents] = useState(false);
  const PAGE_SIZE = 50;

  const handlePrefetchEvents = useCallback(async () => {
    setFetchingEvents(true);
    try { await api.prefetchEvents("sp500"); } catch {}
    setFetchingEvents(false);
  }, []);

  const regimeQuery = useQuery({
    queryKey: ["regime"],
    queryFn:  () => api.getRegime(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const setupsQuery = useQuery({
    queryKey: ["setups", setupFilter, stageFilter, sortBy, page],
    queryFn:  () => api.getSetups({
      universe:     "sp500",
      setup_filter: setupFilter,
      stage_filter: stageFilter,
      sort_by:      sortBy,
      desc:         true,
      page,
      page_size:    PAGE_SIZE,
    }),
    staleTime: 2 * 60 * 1000,
  });

  const handleSetupFilter = useCallback((s: string) => {
    setSetupFilter(s === setupFilter ? "" : s);
    setPage(1);
  }, [setupFilter]);

  const handleStageFilter = useCallback((s: string) => {
    setStageFilter(s === stageFilter ? "" : s);
    setPage(1);
  }, [stageFilter]);

  const data      = setupsQuery.data;
  const total     = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;

  return (
    <div className="space-y-4 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Setup Engine</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Stocks with actionable setups — ranked by confluence
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.as_of && <span className="text-xs text-text-muted">As of {data.as_of}</span>}
          <button
            onClick={handlePrefetchEvents}
            disabled={fetchingEvents}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
            title="Fetch earnings dates for S&P 500 (runs in background)"
          >
            <Calendar size={12} className={fetchingEvents ? "animate-pulse" : ""} />
            {fetchingEvents ? "Fetching…" : "Fetch Earnings"}
          </button>
          <button
            onClick={() => { setupsQuery.refetch(); regimeQuery.refetch(); }}
            disabled={setupsQuery.isFetching}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <RefreshCw size={12} className={setupsQuery.isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Regime card */}
      {regimeQuery.data && <RegimeCard data={regimeQuery.data} />}
      {regimeQuery.isLoading && (
        <div className="h-24 rounded-lg border border-border bg-surface animate-pulse" />
      )}

      {/* Historical win rates */}
      <WinRatesPanel />

      {/* Setup filter pills */}
      <div className="flex flex-wrap gap-2">
        {SETUPS.map((s) => {
          const m = SETUP_META[s];
          const active = setupFilter === s;
          return (
            <button
              key={s}
              onClick={() => handleSetupFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs border transition-all",
                active ? cn(m.color, m.bg, m.border) : "border-border text-text-muted hover:text-text-primary hover:border-border/80"
              )}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Stage filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-text-muted mr-1">Stage</span>
          {[1, 2, 3, 4].map((s) => {
            const m = STAGE_META[s];
            const active = stageFilter === String(s);
            return (
              <button
                key={s}
                onClick={() => handleStageFilter(String(s))}
                className={cn(
                  "px-2.5 py-1 rounded text-xs border transition-colors",
                  active
                    ? cn("border-accent bg-surface-2", m.color)
                    : "border-border text-text-muted hover:text-text-primary"
                )}
              >
                S{s}
              </button>
            );
          })}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-text-muted">Sort</span>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            className="bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {total > 0 && (
          <span className="text-xs text-text-muted">{total} setups found</span>
        )}
      </div>

      {/* Loading */}
      {setupsQuery.isLoading && (
        <div className="flex items-center gap-2 text-text-muted text-sm py-12 justify-center">
          <RefreshCw size={14} className="animate-spin" />
          Computing setups...
        </div>
      )}

      {/* Table */}
      {data && data.results.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Ticker</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Setup</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Stage</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Confluence</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Breakout</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Price</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">1D</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">RSI</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">RS/SPY</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">RS/Sect</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Sect/SPY</th>
                <th className="px-3 py-2.5 text-center text-text-muted font-medium" title="Stock outperforms sector AND sector outperforms market">3×RS</th>
                <th className="px-3 py-2.5 text-center text-text-muted font-medium" title="E=Earnings days away · OX=Options expiry days away">Events</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Vol×</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">52W Dist</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Entry</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Stop</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Target</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">R:R</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((row, i) => {
                const sm   = SETUP_META[row.setup] ?? SETUP_META["No Setup"];
                const stm  = row.stage ? STAGE_META[row.stage] : null;
                const isEven = i % 2 === 0;
                return (
                  <tr
                    key={row.ticker}
                    className={cn(
                      "border-b border-border/50 hover:bg-surface-2/50 transition-colors",
                      isEven ? "bg-transparent" : "bg-surface/30"
                    )}
                  >
                    {/* Ticker */}
                    <td className="px-3 py-2.5 font-medium text-text-primary">{row.ticker}</td>

                    {/* Setup badge */}
                    <td className="px-3 py-2.5">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs border", sm.color, sm.bg, sm.border)}>
                        {row.setup}
                      </span>
                    </td>

                    {/* Stage */}
                    <td className="px-3 py-2.5">
                      {stm ? (
                        <span className={cn("text-xs font-medium", stm.color)}>{stm.label}</span>
                      ) : <span className="text-text-muted">—</span>}
                    </td>

                    {/* Confluence score bar */}
                    <td className="px-3 py-2.5">{scoreBar(row.confluence_score)}</td>

                    {/* Breakout score bar */}
                    <td className="px-3 py-2.5">{scoreBar(row.breakout_score)}</td>

                    {/* Price */}
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-primary">
                      {row.price != null ? `$${row.price.toFixed(2)}` : "—"}
                    </td>

                    {/* 1D change */}
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.chg_1d == null ? "text-text-muted" :
                      row.chg_1d > 0 ? "text-emerald-400" : row.chg_1d < 0 ? "text-red-400" : "text-text-muted"
                    )}>
                      {pct(row.chg_1d)}
                    </td>

                    {/* RSI */}
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.rsi == null ? "text-text-muted" :
                      row.rsi > 70 ? "text-red-400" : row.rsi < 30 ? "text-emerald-400" : "text-text-primary"
                    )}>
                      {num(row.rsi, 0)}
                    </td>

                    {/* RS vs SPY */}
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.rs_spy_20d == null ? "text-text-muted" :
                      row.rs_spy_20d > 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {pct(row.rs_spy_20d)}
                    </td>

                    {/* RS vs Sector */}
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.rs_sector_20d == null ? "text-text-muted" :
                      row.rs_sector_20d > 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {pct(row.rs_sector_20d)}
                    </td>

                    {/* Sector vs SPY */}
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.sector_vs_spy_20d == null ? "text-text-muted" :
                      row.sector_vs_spy_20d > 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {pct(row.sector_vs_spy_20d)}
                    </td>

                    {/* Triple RS badge */}
                    <td className="px-3 py-2.5 text-center">
                      {row.triple_rs ? (
                        <span
                          className="inline-block text-emerald-400 font-bold text-xs tracking-tighter"
                          title="Stock outperforms sector AND sector outperforms SPY"
                        >
                          ↑↑↑
                        </span>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </td>

                    {/* Event risk */}
                    <td className="px-3 py-2.5 text-center">
                      {eventBadge(row.days_to_earnings, row.days_to_opex)}
                    </td>

                    {/* Volume surge */}
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.vol_surge == null ? "text-text-muted" :
                      row.vol_surge > 2 ? "text-emerald-400" : row.vol_surge > 1.3 ? "text-amber-400" : "text-text-muted"
                    )}>
                      {row.vol_surge != null ? `${row.vol_surge.toFixed(1)}×` : "—"}
                    </td>

                    {/* Distance from 52W high */}
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.dist_52w_high == null ? "text-text-muted" :
                      row.dist_52w_high > -0.05 ? "text-emerald-400" :
                      row.dist_52w_high > -0.15 ? "text-amber-400" : "text-text-muted"
                    )}>
                      {pct(row.dist_52w_high)}
                    </td>

                    {/* Trade plan */}
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-primary">
                      {row.entry != null ? `$${row.entry.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-400">
                      {row.stop != null ? `$${row.stop.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-400">
                      {row.target != null ? `$${row.target.toFixed(2)}` : "—"}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums font-medium",
                      row.rr == null ? "text-text-muted" :
                      row.rr >= 2 ? "text-emerald-400" : row.rr >= 1 ? "text-amber-400" : "text-red-400"
                    )}>
                      {row.rr != null ? `${row.rr.toFixed(1)}×` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty */}
      {data && data.results.length === 0 && !setupsQuery.isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-2">
          <Zap size={28} strokeWidth={1} />
          <div className="text-sm">No setups match the current filters</div>
          <div className="text-xs">Try removing a filter or refreshing</div>
        </div>
      )}

      {/* Legend */}
      {data && data.results.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-text-muted border border-border bg-surface rounded p-3">
          <div><span className="font-medium text-text-primary">Confluence</span> = trend + RS + momentum + vol + squeeze (0–100)</div>
          <div><span className="font-medium text-text-primary">Breakout</span> = squeeze + RS + 52W proximity + vol surge (0–100)</div>
          <div><span className="font-medium text-text-primary">RS/Sect</span> = stock outperformance vs its sector ETF (20d)</div>
          <div><span className="font-medium text-text-primary">Sect/SPY</span> = sector ETF outperformance vs SPY (20d)</div>
          <div><span className="font-medium text-text-primary">↑↑↑</span> Triple RS: stock &gt; sector &gt; market — strongest momentum stack</div>
          <div><span className="font-medium text-text-primary">E2d</span> = earnings in 2 days (red ≤2d, amber ≤7d) · <span className="font-medium text-text-primary">OX1d</span> = monthly OPEX tomorrow</div>
          <div><span className="font-medium text-text-primary">Stop/Target</span> = ATR-based (2× ATR stop · 3× ATR target)</div>
          <div><span className="font-medium text-text-primary">Stage</span>: S2 Uptrend is the highest-quality entry zone</div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-text-muted pt-1">
          <span>Page {page} of {totalPages} · {total} setups</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || setupsQuery.isFetching}
              className="p-1.5 rounded border border-border hover:border-accent disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || setupsQuery.isFetching}
              className="p-1.5 rounded border border-border hover:border-accent disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
