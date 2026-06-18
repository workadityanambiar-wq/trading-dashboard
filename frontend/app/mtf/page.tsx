"use client";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type MTFSignal } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RefreshCw, ChevronLeft, ChevronRight, AlignCenter } from "lucide-react";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}

function clr(v: number | null): string {
  if (v == null) return "text-text-muted";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-text-muted";
}

// Traffic-light dots showing which timeframes are bullish
function AlignDots({ wk, d, st, wkSig, dSig, stSig }: {
  wk: boolean; d: boolean; st: boolean;
  wkSig: number; dSig: number; stSig: number;
}) {
  const dot = (bull: boolean, sig: number, label: string) => (
    <div className="flex flex-col items-center gap-0.5" title={`${label}: ${sig}/3 signals bullish`}>
      <div className={cn(
        "w-3 h-3 rounded-full border",
        bull
          ? "bg-emerald-500 border-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
          : sig > 0
            ? "bg-amber-500/40 border-amber-500/60"
            : "bg-surface-2 border-border"
      )} />
      <span className="text-[9px] text-text-muted leading-none">{label}</span>
    </div>
  );
  return (
    <div className="flex items-end gap-2">
      {dot(wk, wkSig, "W")}
      {dot(d,  dSig,  "D")}
      {dot(st, stSig, "ST")}
    </div>
  );
}

// Alignment badge
function AlignBadge({ n }: { n: number }) {
  const cfg = {
    3: { label: "3/3", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
    2: { label: "2/3", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
    1: { label: "1/3", cls: "bg-slate-500/20 text-slate-400 border-slate-500/40" },
    0: { label: "0/3", cls: "bg-surface-2 text-text-muted border-border" },
  }[n] ?? { label: `${n}/3`, cls: "bg-surface-2 text-text-muted border-border" };
  return (
    <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-bold tabular-nums", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// Score bar
function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-text-muted text-xs">—</span>;
  const w = Math.round(Math.max(0, Math.min(100, score)));
  const color = w >= 75 ? "bg-emerald-500" : w >= 55 ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs tabular-nums text-text-primary">{w}</span>
    </div>
  );
}

const SETUP_COLOR: Record<string, string> = {
  "Early Breakout":             "text-emerald-400",
  "Volatility Squeeze":         "text-amber-400",
  "Momentum Continuation":      "text-blue-400",
  "Institutional Accumulation": "text-purple-400",
  "Mean Reversion Bounce":      "text-teal-400",
  "Failed Breakdown Reversal":  "text-orange-400",
  "No Setup":                   "text-text-muted",
};

const SORT_OPTIONS = [
  { value: "mtf_score",       label: "MTF Score" },
  { value: "mtf_alignment",   label: "Alignment" },
  { value: "rs_spy_20d",      label: "RS vs SPY" },
  { value: "confluence_score",label: "Confluence" },
  { value: "rsi",             label: "RSI" },
  { value: "dist_52w_high",   label: "52W High Dist" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MTFPage() {
  const [page, setPage]         = useState(1);
  const [minAlign, setMinAlign] = useState(2);
  const [drawer, setDrawer]     = useState<DrawerConfig | null>(null);
  const [sortBy, setSortBy]     = useState("mtf_score");
  const [universe, setUniverse] = useState("sp500");

  const queryKey = ["mtf", universe, minAlign, sortBy, page];

  const { data, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      api.getMTFAlignment({ universe, min_align: minAlign, sort_by: sortBy, desc: true, page, page_size: 50 }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const handleRefresh = useCallback(() => { setPage(1); refetch(); }, [refetch]);

  const results  = data?.results ?? [];
  const total    = data?.total ?? 0;
  const pages    = data?.pages ?? 1;
  const asOf     = data?.as_of;
  const uniSize  = data?.universe_size ?? 0;

  // Alignment distribution from current results
  const full3  = results.filter(r => r.mtf_alignment === 3).length;
  const two3   = results.filter(r => r.mtf_alignment === 2).length;

  return (
    <div className="flex flex-col gap-5 p-6 min-h-0">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AlignCenter size={18} className="text-blue-400" />
            <h1 className="text-lg font-semibold text-text-primary">Multi-Timeframe Alignment</h1>
          </div>
          <p className="text-xs text-text-muted">
            Stocks where Weekly, Daily, and Short-term trends all agree bullish
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

        {/* Min alignment */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted">Min Alignment</span>
          {[3, 2, 1].map(n => (
            <button
              key={n}
              onClick={() => { setMinAlign(n); setPage(1); }}
              className={cn(
                "px-2.5 py-1 rounded text-xs border transition-colors",
                minAlign === n
                  ? n === 3 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                             : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-surface-2 text-text-muted border-border hover:text-text-primary"
              )}
            >
              {n}/3
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

      {/* Stats */}
      <div className="flex gap-5 text-xs text-text-muted">
        <span><span className="text-text-primary font-semibold">{total}</span> stocks aligned · {uniSize > 0 ? `${uniSize} scanned` : "…"}</span>
        {total > 0 && <>
          <span className="text-text-muted">·</span>
          <span><span className="text-emerald-400 font-semibold">{full3}</span> full 3/3</span>
          <span><span className="text-amber-400 font-semibold">{two3}</span> at 2/3</span>
        </>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left px-3 py-2.5 text-text-muted font-medium">Ticker</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">Price</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">1d</th>
              <th className="px-3 py-2.5 text-text-muted font-medium" title="W=Weekly  D=Daily  ST=Short-term. Green=bullish, amber=partial, grey=bearish">Alignment</th>
              <th className="px-3 py-2.5 text-text-muted font-medium">MTF Score</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">RS/SPY</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">RS/Sect</th>
              <th className="text-center px-3 py-2.5 text-text-muted font-medium">3×RS</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">RSI</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">Vol×</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">50D dist</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">200D dist</th>
              <th className="text-right px-3 py-2.5 text-text-muted font-medium">52W Hi</th>
              <th className="px-3 py-2.5 text-text-muted font-medium">Setup</th>
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
                  No stocks with {minAlign}/3 alignment. Try lowering the filter.
                </td>
              </tr>
            )}
            {results.map((r: MTFSignal, i: number) => (
              <tr
                key={r.ticker}
                onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${r.ticker}`, color: "#6366f1" })}
                className={cn(
                  "border-b border-border/50 hover:bg-surface-2/50 transition-colors cursor-pointer",
                  i % 2 === 0 ? "bg-surface" : "bg-surface/50"
                )}
              >
                {/* Ticker */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-text-primary">{r.ticker}</span>
                    <AlignBadge n={r.mtf_alignment} />
                  </div>
                </td>

                {/* Price */}
                <td className="px-3 py-2 text-right tabular-nums text-text-primary">
                  {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                </td>

                {/* 1D change */}
                <td className={cn("px-3 py-2 text-right tabular-nums", clr(r.chg_1d))}>
                  {pct(r.chg_1d)}
                </td>

                {/* Alignment dots */}
                <td className="px-3 py-2">
                  <AlignDots
                    wk={r.mtf_weekly_bull} d={r.mtf_daily_bull} st={r.mtf_short_bull}
                    wkSig={r.mtf_wk_signals} dSig={r.mtf_d_signals} stSig={r.mtf_st_signals}
                  />
                </td>

                {/* MTF score */}
                <td className="px-3 py-2">
                  <ScoreBar score={r.mtf_score} />
                </td>

                {/* RS vs SPY */}
                <td className={cn("px-3 py-2 text-right tabular-nums", clr(r.rs_spy_20d))}>
                  {pct(r.rs_spy_20d)}
                </td>

                {/* RS vs Sector */}
                <td className={cn("px-3 py-2 text-right tabular-nums", clr(r.rs_sector_20d))}>
                  {pct(r.rs_sector_20d)}
                </td>

                {/* Triple RS */}
                <td className="px-3 py-2 text-center">
                  {r.triple_rs
                    ? <span className="text-emerald-400 font-bold" title="Stock > sector > market on all 3 RS measures">↑↑↑</span>
                    : <span className="text-text-muted text-[10px]">—</span>}
                </td>

                {/* RSI */}
                <td className={cn(
                  "px-3 py-2 text-right tabular-nums",
                  r.rsi != null && r.rsi > 50 && r.rsi < 70 ? "text-emerald-400" :
                  r.rsi != null && r.rsi >= 70 ? "text-amber-400" : "text-text-muted"
                )}>
                  {r.rsi != null ? r.rsi.toFixed(0) : "—"}
                </td>

                {/* Volume surge */}
                <td className={cn(
                  "px-3 py-2 text-right tabular-nums",
                  r.vol_surge != null && r.vol_surge > 1.5 ? "text-emerald-400" :
                  r.vol_surge != null && r.vol_surge > 1.1 ? "text-amber-400" : "text-text-muted"
                )}>
                  {r.vol_surge != null ? `${r.vol_surge.toFixed(1)}×` : "—"}
                </td>

                {/* 50D dist */}
                <td className={cn("px-3 py-2 text-right tabular-nums", clr(r.ma50_dist))}>
                  {pct(r.ma50_dist)}
                </td>

                {/* 200D dist */}
                <td className={cn("px-3 py-2 text-right tabular-nums", clr(r.ma200_dist))}>
                  {pct(r.ma200_dist)}
                </td>

                {/* 52W High dist */}
                <td className={cn(
                  "px-3 py-2 text-right tabular-nums",
                  r.dist_52w_high != null && r.dist_52w_high > -0.05 ? "text-emerald-400" :
                  r.dist_52w_high != null && r.dist_52w_high > -0.15 ? "text-amber-400" : "text-text-muted"
                )}>
                  {pct(r.dist_52w_high)}
                </td>

                {/* Setup */}
                <td className={cn("px-3 py-2 text-xs", SETUP_COLOR[r.setup] ?? "text-text-muted")}>
                  {r.setup !== "No Setup" ? r.setup : <span className="text-text-muted">—</span>}
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
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isFetching}
              className="p-1.5 rounded bg-surface-2 hover:bg-surface-2/80 disabled:opacity-40">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages || isFetching}
              className="p-1.5 rounded bg-surface-2 hover:bg-surface-2/80 disabled:opacity-40">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="p-4 rounded-lg border border-border bg-surface text-xs text-text-muted space-y-2">
        <div className="font-medium text-text-primary mb-2">How multi-timeframe alignment works</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="font-medium text-blue-400 mb-1">Weekly (W)</div>
            <div className="space-y-0.5">
              <div>● Price above 10-week MA</div>
              <div>● 10-week MA is rising (vs 4 weeks ago)</div>
              <div>● Weekly RSI &gt; 50</div>
            </div>
          </div>
          <div>
            <div className="font-medium text-blue-400 mb-1">Daily (D)</div>
            <div className="space-y-0.5">
              <div>● Price above 50-day MA</div>
              <div>● Price above 200-day MA</div>
              <div>● 20-day RS vs SPY positive</div>
            </div>
          </div>
          <div>
            <div className="font-medium text-blue-400 mb-1">Short-term (ST)</div>
            <div className="space-y-0.5">
              <div>● Price above 5-day MA</div>
              <div>● 5-day price change positive</div>
              <div>● Recent 3-day vol &gt; 10-day avg</div>
            </div>
          </div>
        </div>
        <div className="pt-1 text-text-muted">
          Each timeframe requires 2+ of its 3 sub-signals to be bullish.
          <span className="text-blue-400 font-medium ml-1">MTF Score</span> = W×40% + D×35% + ST×25% (weighted by signal strength, not just pass/fail).
          <span className="font-medium text-emerald-400 ml-2">3/3 full alignment</span> = highest-quality trend confirmation.
        </div>
      </div>

      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}
