"use client";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CoiledSpringSignal } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RefreshCw, ChevronLeft, ChevronRight, Crosshair, TrendingUp, Volume2 } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}

function num(v: number | null, dec = 2): string {
  if (v == null) return "—";
  return v.toFixed(dec);
}

function clr(v: number | null, invert = false): string {
  if (v == null) return "text-text-muted";
  const pos = invert ? v < 0 : v > 0;
  return pos ? "text-emerald-400" : "text-red-400";
}

function eventBadge(daysToEarn: number | null, daysToOpex: number | null) {
  const badges: React.ReactNode[] = [];
  if (daysToEarn != null) {
    if (daysToEarn <= 2)
      badges.push(<span key="e" className="ml-1 px-1 rounded text-[10px] bg-red-500/20 text-red-400 font-bold">E{daysToEarn}d</span>);
    else if (daysToEarn <= 7)
      badges.push(<span key="e" className="ml-1 px-1 rounded text-[10px] bg-amber-500/20 text-amber-400 font-bold">E{daysToEarn}d</span>);
  }
  if (daysToOpex != null && daysToOpex <= 2)
    badges.push(<span key="ox" className="ml-1 px-1 rounded text-[10px] bg-amber-500/20 text-amber-400 font-bold">OX{daysToOpex}d</span>);
  return badges.length ? <>{badges}</> : null;
}

// Score bar — green gradient, width proportional to score
function ScoreBar({ score }: { score: number }) {
  const w = Math.round(Math.max(0, Math.min(100, score)));
  const color = w >= 75 ? "bg-emerald-500" : w >= 60 ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs tabular-nums text-text-primary">{w}</span>
    </div>
  );
}

// Tightness bar — purple when compressed
function TightBar({ pctile }: { pctile: number | null }) {
  if (pctile == null) return <span className="text-text-muted">—</span>;
  const w = Math.round((1 - pctile) * 100); // invert: low pctile = tight = high bar
  const color = w >= 70 ? "bg-violet-500" : w >= 40 ? "bg-slate-500" : "bg-red-600/60";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs tabular-nums text-text-muted">{(pctile * 100).toFixed(0)}th</span>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: "coiled_spring_score", label: "Coil Score" },
  { value: "breakout_score",      label: "Breakout Score" },
  { value: "rs_spy_20d",          label: "RS vs SPY" },
  { value: "dist_52w_high",       label: "Dist 52W High" },
  { value: "accum_score",         label: "Accumulation" },
  { value: "vol_surge",           label: "Volume" },
  { value: "rsi",                 label: "RSI" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PreBreakoutPage() {
  const [page, setPage]         = useState(1);
  const [sortBy, setSortBy]     = useState("coiled_spring_score");
  const [minScore, setMinScore] = useState(55);
  const [universe, setUniverse] = useState("sp500");

  const queryKey = ["prebreakout", universe, minScore, sortBy, page];

  const { data, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      api.getPreBreakout({ universe, min_score: minScore, sort_by: sortBy, desc: true, page, page_size: 50 }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const handleRefresh = useCallback(() => {
    setPage(1);
    refetch();
  }, [refetch]);

  const results  = data?.results ?? [];
  const total    = data?.total ?? 0;
  const pages    = data?.pages ?? 1;
  const asOf     = data?.as_of;
  const uniSize  = data?.universe_size ?? 0;

  return (
    <div className="flex flex-col gap-6 p-6 min-h-0">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Crosshair size={18} className="text-violet-400" />
            <h1 className="text-lg font-semibold text-text-primary">Pre-Breakout Screener</h1>
          </div>
          <p className="text-xs text-text-muted">
            Coiled-spring stocks: tight range · drying volume · near 52W high · Stage 2 uptrend
          </p>
        </div>

        <div className="flex items-center gap-2">
          {asOf && <span className="text-xs text-text-muted">as of {asOf}</span>}
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="p-2 rounded-md bg-surface-2 hover:bg-surface-2/80 text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Universe */}
        <select
          value={universe}
          onChange={e => { setUniverse(e.target.value); setPage(1); }}
          className="text-xs bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-text-primary focus:outline-none"
        >
          <option value="sp500">S&P 500</option>
          <option value="sp1500">S&P 1500</option>
          <option value="nifty50">Nifty 50</option>
          <option value="euro_top">Europe Top 40</option>
          <option value="etfs">Popular ETFs</option>
          <option value="all_cached">All Cached</option>
        </select>

        {/* Min score */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted">Min Score</span>
          {[50, 55, 60, 65, 70].map(s => (
            <button
              key={s}
              onClick={() => { setMinScore(s); setPage(1); }}
              className={cn(
                "px-2 py-1 rounded text-xs transition-colors",
                minScore === s
                  ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                  : "bg-surface-2 text-text-muted hover:text-text-primary border border-transparent"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => { setSortBy(e.target.value); setPage(1); }}
          className="text-xs bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-text-primary focus:outline-none ml-auto"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 text-xs text-text-muted">
        <span>
          <span className="text-text-primary font-semibold">{total}</span> coiled springs
          {uniSize > 0 && <> / {uniSize} scanned</>}
        </span>
        <span className="text-text-muted">·</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Score ≥ 75 (strong)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" /> Score 60–74
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-violet-500" /> Tight range bar
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left px-3 py-2.5 text-text-muted font-medium w-24">Ticker</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">Price</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">1d</th>
              <th className="px-3 py-2.5 text-text-muted font-medium">Coil Score</th>
              <th className="px-3 py-2.5 text-text-muted font-medium" title="BB Width Percentile — lower = more compressed">BB Tight</th>
              <th className="px-3 py-2.5 text-text-muted font-medium" title="ATR Percentile — lower = quieter">ATR Tight</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium" title="Volume Surge (1.0 = avg, <0.8 = drying)">Vol</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium" title="Distance from 52-Week High">52W Hi</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium" title="20-day RS vs SPY">RS/SPY</th>
              <th className="text-center px-3 py-2.5 text-text-muted font-medium" title="Triple RS: stock > sector > market">3×RS</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium" title="Accumulation Score">Accum</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">RSI</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">Breakout</th>
              <th className="px-3 py-2.5 text-text-muted font-medium">Events</th>
            </tr>
          </thead>
          <tbody>
            {isFetching && results.length === 0 && (
              <tr>
                <td colSpan={14} className="text-center py-12 text-text-muted">
                  <RefreshCw size={16} className="animate-spin inline mr-2" />
                  Scanning {uniSize > 0 ? uniSize : "…"} stocks…
                </td>
              </tr>
            )}
            {!isFetching && results.length === 0 && (
              <tr>
                <td colSpan={14} className="text-center py-12 text-text-muted">
                  No coiled springs found with score ≥ {minScore}. Try lowering the minimum score.
                </td>
              </tr>
            )}
            {results.map((r: CoiledSpringSignal, i: number) => (
              <tr
                key={r.ticker}
                className={cn(
                  "border-b border-border/50 hover:bg-surface-2/50 transition-colors",
                  i % 2 === 0 ? "bg-surface" : "bg-surface/50"
                )}
              >
                {/* Ticker */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-text-primary">{r.ticker}</span>
                    {r.nr7 && (
                      <span className="px-1 rounded text-[10px] bg-violet-500/20 text-violet-300 font-bold" title="Narrowest range in 7 days">NR7</span>
                    )}
                    {eventBadge(r.days_to_earnings, r.days_to_opex)}
                  </div>
                </td>

                {/* Price */}
                <td className="px-3 py-2 text-right text-text-primary tabular-nums">
                  {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                </td>

                {/* 1d */}
                <td className={cn("px-3 py-2 text-right tabular-nums", clr(r.chg_1d))}>
                  {pct(r.chg_1d)}
                </td>

                {/* Coil score */}
                <td className="px-3 py-2">
                  <ScoreBar score={r.coiled_spring_score} />
                </td>

                {/* BB tightness */}
                <td className="px-3 py-2">
                  <TightBar pctile={r.bb_width_pct} />
                </td>

                {/* ATR tightness */}
                <td className="px-3 py-2">
                  <TightBar pctile={r.atr_pct} />
                </td>

                {/* Volume surge */}
                <td className={cn("px-3 py-2 text-right tabular-nums", r.vol_surge != null && r.vol_surge < 0.8 ? "text-violet-400" : "text-text-muted")}>
                  <div className="flex items-center justify-end gap-0.5">
                    {r.vol_surge != null && r.vol_surge < 0.8 && <Volume2 size={10} className="text-violet-400" />}
                    {num(r.vol_surge)}×
                  </div>
                </td>

                {/* 52W high */}
                <td className={cn("px-3 py-2 text-right tabular-nums", r.dist_52w_high != null && r.dist_52w_high > -0.05 ? "text-emerald-400" : "text-text-muted")}>
                  {pct(r.dist_52w_high)}
                </td>

                {/* RS vs SPY */}
                <td className={cn("px-3 py-2 text-right tabular-nums", clr(r.rs_spy_20d))}>
                  {pct(r.rs_spy_20d)}
                </td>

                {/* Triple RS */}
                <td className="px-3 py-2 text-center">
                  {r.triple_rs ? (
                    <span className="text-emerald-400 font-bold" title="Stock outperforms sector, sector outperforms market">↑↑↑</span>
                  ) : (
                    <span className="text-text-muted text-[10px]">—</span>
                  )}
                </td>

                {/* Accumulation */}
                <td className={cn("px-3 py-2 text-right tabular-nums", clr(r.accum_score))}>
                  {num(r.accum_score)}
                </td>

                {/* RSI */}
                <td className={cn(
                  "px-3 py-2 text-right tabular-nums",
                  r.rsi != null && r.rsi > 50 && r.rsi < 70 ? "text-emerald-400" :
                  r.rsi != null && r.rsi >= 70 ? "text-amber-400" : "text-text-muted"
                )}>
                  {num(r.rsi, 0)}
                </td>

                {/* Breakout score */}
                <td className="px-3 py-2 text-right tabular-nums text-text-muted">
                  {r.breakout_score != null ? Math.round(r.breakout_score) : "—"}
                </td>

                {/* Events */}
                <td className="px-3 py-2 text-text-muted text-[11px]">
                  {r.earnings_date ? (
                    <span title={`Earnings: ${r.earnings_date}`}>
                      {r.days_to_earnings != null ? `E in ${r.days_to_earnings}d` : r.earnings_date}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>Page {page} of {pages} · {total} results</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
              className="p-1.5 rounded bg-surface-2 hover:bg-surface-2/80 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages || isFetching}
              className="p-1.5 rounded bg-surface-2 hover:bg-surface-2/80 disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 p-4 rounded-lg border border-border bg-surface text-xs text-text-muted space-y-1.5">
        <div className="font-medium text-text-primary mb-2 flex items-center gap-1.5">
          <TrendingUp size={12} />
          How to read the coiled-spring screen
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1">
          <span><span className="text-violet-300 font-medium">Coil Score</span> — composite of tightness, volume dry-up, proximity to 52W high, Stage 2, RS</span>
          <span><span className="text-violet-300 font-medium">BB Tight</span> — Bollinger Band width percentile vs history (lower % = more compressed)</span>
          <span><span className="text-violet-300 font-medium">ATR Tight</span> — ATR percentile vs history (lower % = quieter price action)</span>
          <span><span className="text-violet-300 font-medium">Vol ↓</span> — volume below 1.0× avg = contracting (coiling phase). Purple icon = very dry</span>
          <span><span className="text-emerald-400 font-medium">52W Hi</span> — within 5% of high (green) means stock held up while coiling</span>
          <span><span className="text-violet-300 font-medium">NR7</span> badge — narrowest daily range in 7 sessions: highest compression signal</span>
          <span><span className="text-emerald-400 font-medium">↑↑↑</span> — Triple RS: stock beats sector ETF, sector ETF beats SPY (all on 20-day basis)</span>
          <span><span className="text-amber-400 font-medium">E#d</span> / <span className="text-red-400 font-medium">E2d</span> — earnings in # days. Red = ≤ 2d (binary risk event)</span>
        </div>
      </div>
    </div>
  );
}
