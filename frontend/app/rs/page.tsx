"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type RSRankingEntry } from "@/lib/api";
import { useMarket } from "@/contexts/MarketContext";
import { cn } from "@/lib/utils";
import { RefreshCw, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, LineChart } from "lucide-react";
import Link from "next/link";
import { ChartModal } from "@/components/ChartModal";
import { useChart } from "@/contexts/ChartContext";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";
import { PageGuide } from "@/components/PageGuide";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}

function excessColor(v: number | null): string {
  if (v == null) return "text-text-muted";
  if (v >  0.10) return "text-emerald-400";
  if (v >  0.02) return "text-emerald-300/70";
  if (v < -0.10) return "text-red-400";
  if (v < -0.02) return "text-red-300/70";
  return "text-text-muted";
}

// RS badge: 0–99 colored by tier
function RSBadge({ rank }: { rank: number }) {
  const cls =
    rank >= 90 ? "text-emerald-200 bg-emerald-500/25 border-emerald-500/50" :
    rank >= 80 ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/35" :
    rank >= 70 ? "text-teal-400   bg-teal-500/15   border-teal-500/30" :
    rank >= 50 ? "text-slate-300  bg-slate-500/10  border-slate-500/30" :
    rank >= 30 ? "text-amber-400  bg-amber-500/10  border-amber-500/30" :
                 "text-red-400    bg-red-500/10    border-red-500/30";
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-9 h-5 rounded border text-[11px] font-bold tabular-nums shrink-0",
      cls
    )}>
      {rank}
    </span>
  );
}

// RS composite bar
function RSBar({ value }: { value: number }) {
  const color =
    value >= 80 ? "bg-emerald-500" :
    value >= 60 ? "bg-teal-500" :
    value >= 40 ? "bg-slate-500" :
    value >= 20 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs tabular-nums text-text-primary">{value.toFixed(0)}</span>
    </div>
  );
}

// Trend indicator
function TrendIcon({ trend }: { trend: number | null }) {
  if (trend == null) return <span className="text-text-muted text-xs">—</span>;
  if (trend > 0.10) return <TrendingUp size={13} className="text-emerald-400" />;
  if (trend < -0.10) return <TrendingDown size={13} className="text-red-400" />;
  return <Minus size={13} className="text-text-muted" />;
}

// Sector label
const SECTOR_SHORT: Record<string, string> = {
  "Information Technology": "Tech",
  "Financials":             "Fin",
  "Health Care":            "HC",
  "Consumer Discretionary": "Cons D",
  "Consumer Staples":       "Cons S",
  "Industrials":            "Indus",
  "Materials":              "Matl",
  "Energy":                 "Energy",
  "Utilities":              "Utils",
  "Real Estate":            "RE",
  "Communication Services": "Comm",
  "Automobiles":            "Auto",
  "Broad Market":           "Broad",
  "Fixed Income":           "Bonds",
  "Commodities":            "Cmdty",
  "Dividend":               "Div",
  "Thematic":               "Theme",
  "Leveraged":              "Lev",
  "Inverse":                "Inv",
  "Volatility":             "VIX",
  "International":          "Intl",
};

function SectorLabel({ sector }: { sector: string }) {
  const short = SECTOR_SHORT[sector] ?? sector.slice(0, 6);
  return (
    <span className="text-[10px] text-text-muted tabular-nums" title={sector}>
      {short}
    </span>
  );
}

const SORT_OPTIONS = [
  { value: "rs_composite", label: "Composite" },
  { value: "rs_252d",      label: "252D RS" },
  { value: "rs_126d",      label: "126D RS" },
  { value: "rs_63d",       label: "63D RS" },
  { value: "rs_20d",       label: "20D RS" },
  { value: "rs_5d",        label: "5D RS" },
  { value: "rs_trend",     label: "Trend" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RSPage() {
  const { market, isIndia } = useMarket();
  const universe = market === "spx" ? "sp500" : market === "nifty500" ? "nifty500" : market === "nifty50" ? "nifty50" : "sp500";
  const [minRsRank,     setMinRsRank]    = useState(0);
  const [sectorFlt,     setSectorFlt]    = useState("");
  const [trendFlt,      setTrendFlt]     = useState<"all" | "rising" | "falling">("all");
  const [sortBy,        setSortBy]       = useState("rs_composite");
  const [page,          setPage]         = useState(1);
  const [drawer,        setDrawer]       = useState<DrawerConfig | null>(null);
  const { openChart } = useChart();
  const PAGE_SIZE = 100;

  const queryKey = ["rs-rankings", market, minRsRank, sectorFlt, trendFlt, sortBy, page];

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => api.getRSRankings({
      universe,
      min_rs_rank: minRsRank,
      sector: sectorFlt || undefined,
      sort_by: sortBy,
      desc: true,
      page,
      page_size: PAGE_SIZE,
    }),
    staleTime: 3 * 60 * 1000,
  });

  // Client-side trend filter (applied after fetch)
  const filteredResults = useMemo(() => {
    if (!data?.results) return [];
    if (trendFlt === "rising")  return data.results.filter(r => (r.rs_trend ?? 0) > 0.10);
    if (trendFlt === "falling") return data.results.filter(r => (r.rs_trend ?? 0) < -0.10);
    return data.results;
  }, [data?.results, trendFlt]);

  // Unique sectors for filter dropdown
  const sectors = useMemo(() => {
    const s = new Set(data?.results.map(r => r.sector).filter(Boolean) ?? []);
    return Array.from(s).sort();
  }, [data?.results]);

  const total   = data?.total ?? 0;
  const pages   = data?.pages ?? 1;

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <ChartModal />
      <PageGuide
        title="Relative Strength Rankings — Guide"
        subtitle="RS rank comparing each stock's performance vs. the S&P 500 benchmark"
        steps={[
          { title: "Understand the RS Rank", detail: "RS Rank (1–100) measures how a stock has performed relative to the S&P 500 over the past 12 months, with the most recent 3 months weighted more heavily. RS 90+ = top 10% of performers. This is the same metric used by IBD and the CAN SLIM methodology." },
          { title: "Filter and Sort", detail: "Use the universe selector (S&P 500, S&P 1500, themes) and sort by RS Rank, Excess Return, or Momentum Score descending. The top RS stocks are the current market leaders — institutions are already accumulating them." },
          { title: "Read Excess Return", detail: "Excess Return = stock return minus SPY return over the period. Positive excess return means the stock has outperformed the S&P 500. Sort by 3M excess return to find the most recent price leaders." },
          { title: "Check RS Trend Direction", detail: "The trend arrow shows whether the stock's RS rank is rising (improving relative strength) or falling (deteriorating). The sweet spot is a high absolute RS rank (>80) that is also rising." },
          { title: "Tap for the Chart", detail: "Click any row to open the stock's price chart. High RS stocks typically show clean uptrends — the RS score quantifies what you see visually. If the chart is choppy and the RS is high, that's a divergence worth investigating." },
        ]}
        howItWorks={[
          { title: "RS Score Calculation", detail: "RS = weighted average of 3-month (40% weight), 6-month (20%), 9-month (20%), and 12-month (20%) relative return vs. S&P 500. Heavier weighting on recent performance captures current market leadership dynamics." },
          { title: "Percentile Ranking", detail: "All stocks in the universe are ranked from best to worst RS score. The rank is normalized to a percentile (1–100). Comparing RS ranks across different universe sizes is meaningful because they are all on the same 1–100 scale." },
          { title: "IBD-Style Methodology", detail: "This approach is modeled on William O'Neil's IBD RS Rating, which has been used to identify growth stock leaders since the 1960s. The highest RS stocks appear first in the IBD 50 and similar growth stock lists." },
        ]}
        tips={[
          "Only buy breakouts from stocks with RS Rank above 85 — weak relative strength rarely leads to sustained price moves after breakout.",
          "Stocks holding RS Rank above 70 during broad market corrections are demonstrating institutional accumulation against the trend.",
          "An RS rank jumping from 60 to 80+ in a single month (RS line breakout) is an early warning of institutional sponsorship starting.",
        ]}
      />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold">RS Rankings</h1>
          <p className="text-xs text-text-muted mt-0.5">
            IBD-style relative strength · composite = 40%×252D + 20%×126D + 20%×63D + 20%×20D
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Min RS rank */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted">Min RS</span>
          {[
            { label: "All", val: 0 },
            { label: "50+", val: 50 },
            { label: "70+", val: 70 },
            { label: "80+", val: 80 },
            { label: "90+", val: 90 },
          ].map(({ label, val }) => (
            <button
              key={val}
              onClick={() => { setMinRsRank(val); setPage(1); }}
              className={cn(
                "px-2.5 py-1 rounded text-xs border transition-colors",
                minRsRank === val
                  ? "border-accent bg-surface-2 text-text-primary"
                  : "border-border text-text-muted hover:text-text-primary"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sector */}
        {sectors.length > 0 && (
          <select
            value={sectorFlt}
            onChange={e => { setSectorFlt(e.target.value); setPage(1); }}
            className="text-xs bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-text-primary focus:outline-none"
          >
            <option value="">All sectors</option>
            {sectors.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {/* Trend filter */}
        <div className="flex items-center gap-1">
          {(["all", "rising", "falling"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTrendFlt(t)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors capitalize",
                trendFlt === t
                  ? t === "rising"  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : t === "falling" ? "border-red-500/40 bg-red-500/10 text-red-400"
                  : "border-accent bg-surface-2 text-text-primary"
                  : "border-border text-text-muted hover:text-text-primary"
              )}
            >
              {t === "rising"  && <TrendingUp  size={10} />}
              {t === "falling" && <TrendingDown size={10} />}
              {t}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-text-muted">Sort</span>
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); setPage(1); }}
            className="text-xs bg-surface border border-border rounded px-2 py-1 text-text-primary focus:outline-none"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-lg border border-border bg-surface text-xs">
          <span>
            <span className="text-text-muted">Ranked: </span>
            <span className="font-semibold text-text-primary">{total}</span>
          </span>
          <span>
            <span className="text-text-muted">Leaders (80+): </span>
            <span className="font-semibold text-emerald-400">{data.leaders}</span>
          </span>
          <span>
            <span className="text-text-muted">Laggards (≤20): </span>
            <span className="font-semibold text-red-400">{data.laggards}</span>
          </span>
          <span>
            <span className="text-text-muted">Improving: </span>
            <span className="font-semibold text-emerald-400">{data.rising}</span>
          </span>
          <span>
            <span className="text-text-muted">Deteriorating: </span>
            <span className="font-semibold text-red-400">{data.falling}</span>
          </span>
          {data.as_of && (
            <span className="ml-auto text-text-muted">As of {data.as_of}</span>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 text-text-muted text-sm py-16 justify-center">
          <RefreshCw size={14} className="animate-spin" />
          Computing RS rankings…
        </div>
      )}

      {/* Table */}
      {!isLoading && filteredResults.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-2 py-2.5 text-left text-text-muted font-medium w-8">#</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Ticker</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Sector</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium" title="IBD-style composite RS score 0–99">RS</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium" title="Composite score bar">Score</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium" title="252-day excess return vs benchmark">252D</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium" title="126-day excess return vs benchmark">126D</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium" title="63-day excess return vs benchmark">63D</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium" title="20-day excess return vs benchmark">20D</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium" title="5-day excess return vs benchmark">5D</th>
                <th className="px-3 py-2.5 text-center text-text-muted font-medium" title="RS trend: improving vs 3-month baseline">Trend</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Price</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">1D</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredResults.map((r, i) => (
                <tr key={r.ticker} onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${r.ticker}`, color: "#6366f1" })} className="hover:bg-surface-2 transition-colors cursor-pointer">
                  <td className="px-2 py-2 text-text-muted tabular-nums text-[10px]">
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold text-text-primary">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/stock/${r.ticker}`} className="hover:text-accent transition-colors">
                        {r.ticker}
                      </Link>
                      <button
                        onClick={() => openChart(r.ticker)}
                        title="Quick chart"
                        className="text-text-muted/30 hover:text-accent transition-colors"
                      >
                        <LineChart size={10} strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <SectorLabel sector={r.sector} />
                  </td>
                  <td className="px-3 py-2">
                    <RSBadge rank={r.rs_rank} />
                  </td>
                  <td className="px-3 py-2">
                    <RSBar value={r.rs_composite} />
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", excessColor(r.rs_252d))}>
                    {pct(r.rs_252d)}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", excessColor(r.rs_126d))}>
                    {pct(r.rs_126d)}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", excessColor(r.rs_63d))}>
                    {pct(r.rs_63d)}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", excessColor(r.rs_20d))}>
                    {pct(r.rs_20d)}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", excessColor(r.rs_5d))}>
                    {pct(r.rs_5d)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <TrendIcon trend={r.rs_trend} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-primary">
                    {r.price != null ? `${isIndia ? "₹" : "$"}${r.price.toFixed(2)}` : "—"}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums",
                    r.chg_1d != null ? r.chg_1d > 0 ? "text-emerald-400" : "text-red-400" : "text-text-muted"
                  )}>
                    {r.chg_1d != null ? `${r.chg_1d >= 0 ? "+" : ""}${(r.chg_1d * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty */}
      {!isLoading && filteredResults.length === 0 && data && (
        <div className="text-center py-16 text-text-muted text-sm">
          No stocks match the current filters.
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-text-muted">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded border border-border hover:text-text-primary hover:border-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={12} /> Prev
          </button>
          <span>Page {page} of {pages} · {total} stocks</span>
          <button
            disabled={page >= pages}
            onClick={() => setPage(p => p + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded border border-border hover:text-text-primary hover:border-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-border text-xs text-text-muted">
        <div><span className="font-medium text-text-primary">RS Score (0–99)</span> — IBD-style percentile rank within universe. 80+ = top 20%, 50 = median</div>
        <div><span className="font-medium text-text-primary">Period columns</span> — Excess return vs benchmark over that period (stock return minus benchmark return)</div>
        <div><span className="font-medium text-text-primary">Trend ↑/→/↓</span> — Rising if 20D rank &gt; 63D rank by 10+ pts (RS accelerating), falling if deteriorating</div>
      </div>

      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}
