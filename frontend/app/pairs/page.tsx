"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Search, ScanLine, RefreshCw, TrendingUp, TrendingDown,
  Activity, Shield, Zap, ChevronUp, ChevronDown, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { TradeModal } from "@/components/mt5/TradeModal";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PairSummary {
  ticker1: string; ticker2: string;
  sector1: string; sector2: string;
  pearson_corr: number; spearman_corr: number;
  adf_pvalue: number; is_cointegrated: boolean;
  hurst_exponent: number; half_life_days: number;
  quality_score: number; current_zscore: number;
  hedge_ratio: number; signal: string; n_obs: number;
  volatility_ratio: number;
}

interface DiscoverResponse {
  universe: string; total_tested: number;
  passed_corr: number; passed_coint: number;
  returned: number; as_of: string; regime: string;
  pairs: PairSummary[];
}

interface RegimeResponse {
  regime: string; vix_current: number | null;
  spy_vs_ma50: number; spy_vs_ma200: number;
  description: string; pairs_enabled: boolean;
  recommended_entry: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function zColor(z: number) {
  const az = Math.abs(z);
  if (az > 3) return "text-red-400";
  if (az > 2) return "text-amber-400";
  if (az < 0.5) return "text-emerald-400";
  return "text-text-primary";
}
function zBg(z: number) {
  if (z < -2) return "bg-emerald-500/10 border-emerald-500/30";
  if (z >  2) return "bg-red-500/10 border-red-500/30";
  return "bg-surface-2/50 border-border";
}
function signalBadge(sig: string) {
  if (sig === "long_spread")  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/40";
  if (sig === "short_spread") return "bg-red-500/15 text-red-400 border-red-500/40";
  if (sig === "exit")         return "bg-blue-500/15 text-blue-400 border-blue-500/40";
  return "bg-surface-2 text-text-muted border-border";
}
function regimeBadge(r: string) {
  if (r === "crisis")         return "bg-red-500/20 text-red-400 border-red-500/40";
  if (r === "high_vol")       return "bg-amber-500/20 text-amber-400 border-amber-500/40";
  if (r === "trending")       return "bg-blue-500/20 text-blue-400 border-blue-500/40";
  return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
}
function pct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }

// ── Main Component ────────────────────────────────────────────────────────────
export default function PairsPage() {
  const [universe, setUniverse]         = useState("sp500");
  const [minCorr, setMinCorr]           = useState(0.70);
  const [sectorFilter, setSectorFilter] = useState("any");
  const [hedgeMethod, setHedgeMethod]   = useState("ols");
  const [spreadType, setSpreadType]     = useState("log");
  const [search, setSearch]             = useState("");
  const [sortBy, setSortBy]             = useState<keyof PairSummary>("current_zscore");
  const [sortDir, setSortDir]           = useState<"asc" | "desc">("desc");
  const [topN, setTopN]                 = useState(50);
  const [period, setPeriod]             = useState("2y");
  const [tradePair, setTradePair]       = useState<PairSummary | null>(null);

  // Regime
  const { data: regime } = useQuery<RegimeResponse>({
    queryKey: ["pairs-regime"],
    queryFn:  () => api.getPairsRegime(),
    staleTime: 5 * 60 * 1000,
  });

  // Discover pairs mutation
  const { mutate: runScan, data: scanData, isPending: scanning, isError } = useMutation<DiscoverResponse>({
    mutationFn: () => api.discoverPairs({
      universe, min_correlation: minCorr, sector_filter: sectorFilter,
      hedge_method: hedgeMethod, spread_type: spreadType, top_n: topN, period,
    }),
  });

  // Sort + filter
  const pairs = useMemo<PairSummary[]>(() => {
    if (!scanData?.pairs) return [];
    let list = [...scanData.pairs];
    if (search) {
      const q = search.toUpperCase();
      list = list.filter(p => p.ticker1.includes(q) || p.ticker2.includes(q) ||
        p.sector1.toUpperCase().includes(q));
    }
    list.sort((a, b) => {
      const av = sortBy === "current_zscore" ? Math.abs(a[sortBy] as number) : a[sortBy] as number;
      const bv = sortBy === "current_zscore" ? Math.abs(b[sortBy] as number) : b[sortBy] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return list;
  }, [scanData, search, sortBy, sortDir]);

  function toggleSort(col: keyof PairSummary) {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  // Summary stats
  const longSignals  = pairs.filter(p => p.signal === "long_spread").length;
  const shortSignals = pairs.filter(p => p.signal === "short_spread").length;
  const avgQuality   = pairs.length ? (pairs.reduce((s, p) => s + p.quality_score, 0) / pairs.length).toFixed(1) : "—";

  const SortIcon = ({ col }: { col: keyof PairSummary }) =>
    sortBy === col
      ? (sortDir === "desc" ? <ChevronDown size={10} className="ml-0.5 inline" /> : <ChevronUp size={10} className="ml-0.5 inline" />)
      : null;

  return (
    <div className="space-y-5 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold">Pair Trading & Stat Arb</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Cointegration-based market-neutral strategies · ADF · Johansen · Kalman hedge ratio
          </p>
        </div>
        {regime && (
          <span className={cn("text-[11px] font-semibold px-3 py-1 rounded border uppercase tracking-wider", regimeBadge(regime.regime))}>
            {regime.regime.replace("_", " ")}
            {regime.vix_current != null && ` · VIX ${regime.vix_current.toFixed(1)}`}
          </span>
        )}
      </div>

      {/* Config panel */}
      <div className="bg-surface border border-border rounded-lg p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {/* Universe */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Universe</label>
          <select value={universe} onChange={e => setUniverse(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-text-primary">
            <option value="sp500">S&P 500</option>
            <option value="sp1500">S&P 1500</option>
          </select>
        </div>
        {/* Min Correlation */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">
            Min Corr · {minCorr.toFixed(2)}
          </label>
          <input type="range" min={0.5} max={0.95} step={0.05} value={minCorr}
            onChange={e => setMinCorr(Number(e.target.value))}
            className="w-full accent-accent" />
        </div>
        {/* Sector */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Sector Filter</label>
          <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-text-primary">
            <option value="any">Any Sector</option>
            <option value="same">Same Sector</option>
          </select>
        </div>
        {/* Spread type */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Spread Type</label>
          <select value={spreadType} onChange={e => setSpreadType(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-text-primary">
            <option value="log">Log</option>
            <option value="price">Price</option>
            <option value="ratio">Ratio</option>
          </select>
        </div>
        {/* Hedge method */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Hedge Ratio</label>
          <select value={hedgeMethod} onChange={e => setHedgeMethod(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-text-primary">
            <option value="ols">OLS</option>
            <option value="rolling">Rolling OLS</option>
            <option value="kalman">Kalman Filter</option>
          </select>
        </div>
        {/* Period */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Lookback Period</label>
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-text-primary">
            <option value="6m">6 months</option>
            <option value="1y">1 year</option>
            <option value="2y">2 years (default)</option>
            <option value="3y">3 years</option>
            <option value="5y">5 years</option>
          </select>
        </div>

        {/* Scan button */}
        <div className="flex items-end">
          <button onClick={() => runScan()}
            disabled={scanning}
            className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 disabled:opacity-60 text-white rounded px-3 py-1.5 text-xs font-semibold transition-colors">
            {scanning ? <RefreshCw size={12} className="animate-spin" /> : <ScanLine size={12} />}
            {scanning ? "Scanning…" : "Scan Pairs"}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {scanData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Pairs Tested", value: scanData.total_tested.toLocaleString() },
            { label: "Passed Corr Filter", value: scanData.passed_corr.toLocaleString() },
            { label: "Cointegrated", value: scanData.passed_coint.toLocaleString(), accent: true },
            { label: "Avg Quality Score", value: avgQuality },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-surface border border-border rounded-lg p-3">
              <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
              <div className={cn("text-xl font-bold mt-0.5 tabular-nums", accent ? "text-accent" : "text-text-primary")}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Signal summary */}
      {pairs.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded px-3 py-1.5">
            <TrendingUp size={12} /> {longSignals} Long Spread
          </span>
          <span className="flex items-center gap-1.5 text-xs bg-red-500/10 border border-red-500/30 text-red-400 rounded px-3 py-1.5">
            <TrendingDown size={12} /> {shortSignals} Short Spread
          </span>
          <span className="flex items-center gap-1.5 text-xs bg-surface-2 border border-border text-text-muted rounded px-3 py-1.5">
            <Activity size={12} /> {pairs.length} pairs displayed
          </span>
          {regime && (
            <span className="flex items-center gap-1.5 text-xs bg-surface-2 border border-border text-text-muted rounded px-3 py-1.5">
              <Shield size={12} /> {regime.description}
            </span>
          )}
        </div>
      )}

      {/* Search */}
      {pairs.length > 0 && (
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            placeholder="Filter by ticker / sector…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-2 border border-border rounded text-text-primary placeholder:text-text-muted"
          />
        </div>
      )}

      {/* Pairs table */}
      {isError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded p-3">
          Scan failed. Check that the backend is running and price data is available.
        </div>
      )}

      {!scanData && !scanning && (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <ScanLine size={36} className="mb-3 opacity-30" />
          <p className="text-sm">Configure parameters above and click <strong>Scan Pairs</strong></p>
          <p className="text-xs mt-1 opacity-60">S&P 500 scan typically finds 50–200 cointegrated pairs</p>
        </div>
      )}

      {pairs.length > 0 && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-2/50">
                  {[
                    { key: "ticker1",        label: "Pair",         align: "left" },
                    { key: "sector1",        label: "Sector",       align: "left" },
                    { key: "pearson_corr",   label: "Pearson",      align: "right" },
                    { key: "is_cointegrated",label: "Coint?",       align: "center" },
                    { key: "hurst_exponent", label: "Hurst",        align: "right" },
                    { key: "half_life_days", label: "Half-Life",    align: "right" },
                    { key: "quality_score",  label: "Quality",      align: "right" },
                    { key: "current_zscore", label: "Z-Score",      align: "right" },
                    { key: "signal",         label: "Signal",       align: "center" },
                    { key: "hedge_ratio",    label: "β",            align: "right" },
                    { key: "n_obs",          label: "Detail",       align: "center" },
                    { key: "_trade",         label: "Trade",        align: "center" },
                  ].map(({ key, label, align }) => (
                    <th key={key}
                      onClick={() => key !== "n_obs" && toggleSort(key as keyof PairSummary)}
                      className={cn(
                        "px-3 py-2.5 font-semibold text-text-muted uppercase tracking-wider text-[10px] whitespace-nowrap",
                        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
                        key !== "n_obs" && "cursor-pointer hover:text-text-primary",
                      )}>
                      {label}<SortIcon col={key as keyof PairSummary} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pairs.map((p) => (
                  <tr key={`${p.ticker1}-${p.ticker2}`}
                    className="border-b border-border/50 hover:bg-surface-2/30 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-text-primary">{p.ticker1}</span>
                        <span className="text-text-muted">/</span>
                        <span className="font-mono font-bold text-text-primary">{p.ticker2}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-text-muted text-[11px]">{p.sector1 || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={p.pearson_corr >= 0.8 ? "text-emerald-400" : "text-text-primary"}>
                        {p.pearson_corr.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={p.is_cointegrated ? "text-emerald-400" : "text-text-muted"}>
                        {p.is_cointegrated ? "✓" : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={p.hurst_exponent < 0.45 ? "text-emerald-400" : p.hurst_exponent > 0.55 ? "text-amber-400" : "text-text-primary"}>
                        {p.hurst_exponent.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={p.half_life_days <= 30 ? "text-emerald-400" : "text-text-muted"}>
                        {p.half_life_days < 999 ? `${p.half_life_days.toFixed(1)}d` : "∞"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <div className="inline-flex items-center gap-1">
                        <div className="w-14 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${p.quality_score}%` }} />
                        </div>
                        <span className="text-text-muted">{p.quality_score.toFixed(0)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={cn("font-mono font-bold text-sm", zColor(p.current_zscore))}>
                        {p.current_zscore > 0 ? "+" : ""}{p.current_zscore.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider", signalBadge(p.signal))}>
                        {p.signal.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-muted">
                      {p.hedge_ratio.toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Link
                        href={`/pairs/${p.ticker1}-${p.ticker2}`}
                        className="inline-flex items-center gap-1 text-accent hover:text-accent/80 transition-colors text-[11px]">
                        <ExternalLink size={11} /> Open
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {(p.signal === "long_spread" || p.signal === "short_spread") && (
                        <button
                          onClick={() => setTradePair(p)}
                          className="px-2 py-1 rounded text-[10px] font-semibold bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 transition-colors"
                        >
                          Trade
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pair trade modal — 2 legs */}
      {tradePair && (
        <TradeModal
          isOpen
          onClose={() => setTradePair(null)}
          title={`Pair Trade: ${tradePair.ticker1} / ${tradePair.ticker2}`}
          legs={
            tradePair.signal === "long_spread"
              ? [
                  { symbol: tradePair.ticker1, direction: "buy"  },
                  { symbol: tradePair.ticker2, direction: "sell" },
                ]
              : [
                  { symbol: tradePair.ticker1, direction: "sell" },
                  { symbol: tradePair.ticker2, direction: "buy"  },
                ]
          }
        />
      )}
    </div>
  );
}
