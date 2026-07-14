"use client";
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X, Search, Download, ChevronUp, ChevronDown, ArrowUpDown,
  TrendingUp, TrendingDown, RefreshCw, Activity,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import type { BreadthHistoryPoint } from "@/lib/api";

export type DrillConfig = {
  key: string;
  label: string;
  color: string;
  historyKey?: string;
};

type Stock = {
  ticker: string;
  sector: string;
  price: number;
  ma20: number | null; ma50: number | null; ma100: number | null; ma200: number | null;
  above_20ma: boolean | null; above_50ma: boolean | null;
  above_100ma: boolean | null; above_200ma: boolean | null;
  dist_20ma: number | null; dist_50ma: number | null;
  dist_100ma: number | null; dist_200ma: number | null;
  ret_1d: number | null; ret_1w: number | null; ret_1m: number | null;
  new_high: boolean; new_low: boolean;
  crossed_above_20ma: boolean; crossed_below_20ma: boolean;
  crossed_above_50ma: boolean; crossed_below_50ma: boolean;
  crossed_above_100ma: boolean; crossed_below_100ma: boolean;
  crossed_above_200ma: boolean; crossed_below_200ma: boolean;
};

type SortKey = "ticker" | "sector" | "price" | "ret_1d" | "ret_1w" | "ret_1m" | "dist_50ma" | "dist_200ma";
type Tab = "Overview" | "Stocks" | "Sectors" | "Crossovers" | "History";

const YEAR_FMT = new Intl.DateTimeFormat("en-US", { year: "numeric" });
const PAGE_SIZE = 25;

const SECTOR_COLORS: Record<string, string> = {
  "Technology":             "#6366f1",
  "Health Care":            "#22c55e",
  "Financials":             "#f59e0b",
  "Consumer Discretionary": "#ec4899",
  "Communication Services": "#06b6d4",
  "Industrials":            "#84cc16",
  "Consumer Staples":       "#a78bfa",
  "Energy":                 "#f97316",
  "Utilities":              "#14b8a6",
  "Real Estate":            "#e11d48",
  "Materials":              "#d97706",
};

function sectorColor(s: string) {
  return SECTOR_COLORS[s] ?? "#6b6b80";
}

function techRating(s: Stock): { label: string; color: string } {
  const sc = [s.above_20ma, s.above_50ma, s.above_100ma, s.above_200ma].filter(Boolean).length;
  if (sc === 4) return { label: "Strong Buy",  color: "#22c55e" };
  if (sc === 3) return { label: "Buy",         color: "#84cc16" };
  if (sc === 2) return { label: "Neutral",     color: "#eab308" };
  if (sc === 1) return { label: "Sell",        color: "#f97316" };
  return              { label: "Strong Sell", color: "#ef4444" };
}

function filterByDrill(stocks: Stock[], key: string): Stock[] {
  switch (key) {
    case "above_20ma":  return stocks.filter(s => s.above_20ma === true);
    case "below_20ma":  return stocks.filter(s => s.above_20ma === false);
    case "above_50ma":  return stocks.filter(s => s.above_50ma === true);
    case "below_50ma":  return stocks.filter(s => s.above_50ma === false);
    case "above_100ma": return stocks.filter(s => s.above_100ma === true);
    case "below_100ma": return stocks.filter(s => s.above_100ma === false);
    case "above_200ma": return stocks.filter(s => s.above_200ma === true);
    case "below_200ma": return stocks.filter(s => s.above_200ma === false);
    case "bpi":         return stocks.filter(s => s.above_50ma === true);
    case "new_highs":   return stocks.filter(s => s.new_high);
    case "new_lows":    return stocks.filter(s => s.new_low);
    case "hindenburg":  return stocks.filter(s => s.new_high || s.new_low);
    case "zweig":       return stocks.filter(s => s.above_50ma === true && (s.ret_1m ?? 0) > 0);
    default:
      if (key.startsWith("sector:")) return stocks.filter(s => s.sector === key.slice(7));
      return stocks;
  }
}

function retColor(v: number | null) {
  if (v == null) return "text-text-muted";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-text-muted";
}

function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

interface Props {
  drill: DrillConfig | null;
  onClose: () => void;
  universe: string;
  history: BreadthHistoryPoint[];
}

export function BreadthDrillDrawer({ drill, onClose, universe, history }: Props) {
  const [tab, setTab]               = useState<Tab>("Overview");
  const [search, setSearch]         = useState("");
  const [sortKey, setSortKey]       = useState<SortKey>("ret_1m");
  const [sortDir, setSortDir]       = useState<1 | -1>(-1);
  const [page, setPage]             = useState(0);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  useEffect(() => {
    if (drill) { setTab("Overview"); setSearch(""); setPage(0); setSectorFilter(null); }
  }, [drill?.key]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const { data: allStocks = [], isLoading } = useQuery<Stock[]>({
    queryKey: ["breadth-constituents", universe],
    queryFn: () => fetch(`/api/breadth/constituents?universe=${universe}`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: !!drill,
  });

  const filtered = useMemo(
    () => drill ? filterByDrill(allStocks, drill.key) : [],
    [allStocks, drill],
  );

  const kpi = useMemo(() => {
    if (filtered.length === 0) return null;
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const valid1d   = filtered.map(s => s.ret_1d).filter((v): v is number => v != null);
    const valid1m   = filtered.map(s => s.ret_1m).filter((v): v is number => v != null);
    return {
      pct:       filtered.length / Math.max(allStocks.length, 1),
      pctAbove50:  filtered.filter(s => s.above_50ma).length / filtered.length,
      pctAbove200: filtered.filter(s => s.above_200ma).length / filtered.length,
      newHighs:  filtered.filter(s => s.new_high).length,
      newLows:   filtered.filter(s => s.new_low).length,
      avg1d:     avg(valid1d),
      avg1m:     avg(valid1m),
    };
  }, [filtered, allStocks.length]);

  const sectors = useMemo(() => Array.from(new Set(filtered.map(s => s.sector))).sort(), [filtered]);

  const sectorFiltered = useMemo(
    () => sectorFilter ? filtered.filter(s => s.sector === sectorFilter) : filtered,
    [filtered, sectorFilter],
  );

  const searched = useMemo(() => {
    if (!search) return sectorFiltered;
    const q = search.toLowerCase();
    return sectorFiltered.filter(s => s.ticker.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q));
  }, [sectorFiltered, search]);

  const sorted = useMemo(() => [...searched].sort((a, b) => {
    const va = a[sortKey as keyof Stock] as number | string | null;
    const vb = b[sortKey as keyof Stock] as number | string | null;
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string") return va.localeCompare(vb as string) * sortDir;
    return ((va as number) - (vb as number)) * sortDir;
  }), [searched, sortKey, sortDir]);

  const paged      = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const topGainers  = useMemo(() =>
    [...filtered].filter(s => s.ret_1m != null).sort((a, b) => (b.ret_1m ?? 0) - (a.ret_1m ?? 0)).slice(0, 6),
    [filtered]);
  const topDecliners = useMemo(() =>
    [...filtered].filter(s => s.ret_1m != null).sort((a, b) => (a.ret_1m ?? 0) - (b.ret_1m ?? 0)).slice(0, 6),
    [filtered]);

  const distribution = useMemo(() => {
    const bins = [
      { label: "<-20%", min: -Infinity, max: -20, fill: "#7f1d1d" },
      { label: "-20:-10", min: -20, max: -10,    fill: "#ef4444" },
      { label: "-10:-5",  min: -10, max: -5,     fill: "#f97316" },
      { label:  "-5:0",   min: -5,  max:  0,     fill: "#eab308" },
      { label:   "0:+5",  min:  0,  max:  5,     fill: "#84cc16" },
      { label:  "+5:+10", min:  5,  max: 10,     fill: "#22c55e" },
      { label: "+10:+20", min: 10,  max: 20,     fill: "#16a34a" },
      { label:  ">+20%",  min: 20,  max: Infinity, fill: "#14532d" },
    ];
    return bins.map(b => ({
      label: b.label,
      count: filtered.filter(s => s.dist_50ma != null && s.dist_50ma >= b.min && s.dist_50ma < b.max).length,
      fill:  b.fill,
    }));
  }, [filtered]);

  const sectorBreakdown = useMemo(() => {
    const map: Record<string, { count: number; above50: number; ret1m: number[] }> = {};
    for (const s of filtered) {
      if (!map[s.sector]) map[s.sector] = { count: 0, above50: 0, ret1m: [] };
      map[s.sector].count++;
      if (s.above_50ma) map[s.sector].above50++;
      if (s.ret_1m != null) map[s.sector].ret1m.push(s.ret_1m);
    }
    return Object.entries(map)
      .map(([sector, { count, above50, ret1m }]) => ({
        sector, count, above50,
        pct50:   count > 0 ? above50 / count : 0,
        avgRet1m: ret1m.length > 0 ? ret1m.reduce((a, b) => a + b, 0) / ret1m.length : null,
      }))
      .sort((a, b) => b.pct50 - a.pct50);
  }, [filtered]);

  const crossoversAbove = useMemo(() => allStocks.filter(s =>
    s.crossed_above_20ma || s.crossed_above_50ma || s.crossed_above_100ma || s.crossed_above_200ma
  ), [allStocks]);
  const crossoversBelow = useMemo(() => allStocks.filter(s =>
    s.crossed_below_20ma || s.crossed_below_50ma || s.crossed_below_100ma || s.crossed_below_200ma
  ), [allStocks]);
  const crossoversTotal = crossoversAbove.length + crossoversBelow.length;

  const historyData = useMemo(() => {
    if (!drill?.historyKey) return [];
    return history
      .map(h => ({ date: h.date, value: h[drill.historyKey as keyof BreadthHistoryPoint] as number | null }))
      .filter(h => h.value != null);
  }, [history, drill?.historyKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(-1); }
    setPage(0);
  }

  function exportCSV() {
    const headers = ["Ticker","Sector","Price","1D%","1W%","1M%","Dist50MA%","Dist200MA%","Above50MA","Above200MA","52WH","52WL","Rating"];
    const rows = sorted.map(s => [
      s.ticker, s.sector, s.price.toFixed(2),
      s.ret_1d?.toFixed(2) ?? "", s.ret_1w?.toFixed(2) ?? "", s.ret_1m?.toFixed(2) ?? "",
      s.dist_50ma?.toFixed(2) ?? "", s.dist_200ma?.toFixed(2) ?? "",
      s.above_50ma ? "Y" : "N", s.above_200ma ? "Y" : "N",
      s.new_high ? "Y" : "N", s.new_low ? "Y" : "N",
      techRating(s).label,
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a   = document.createElement("a");
    a.href = url; a.download = `breadth_${drill?.key ?? "export"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!drill) return null;

  const color    = drill.color;
  const pctVal   = kpi ? kpi.pct * 100 : 0;
  const r        = 22;
  const circ     = 2 * Math.PI * r;
  const dashLen  = (pctVal / 100) * circ;

  const isBull = color === "#22c55e" || color === "#84cc16" || color === "#a3e635";
  const isBear = color === "#ef4444" || color === "#f97316";

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown size={9} className="text-text-faint" />;
    return sortDir === -1 ? <ChevronDown size={9} style={{ color }} /> : <ChevronUp size={9} style={{ color }} />;
  }

  const TABS: { id: Tab; badge?: number }[] = [
    { id: "Overview" },
    { id: "Stocks" },
    { id: "Sectors" },
    { id: "Crossovers", badge: crossoversTotal > 0 ? crossoversTotal : undefined },
    { id: "History" },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[820px] flex flex-col bg-[#09090f] border-l border-border shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Color accent line */}
        <div
          className="h-[2px] w-full shrink-0"
          style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        />

        {/* Header */}
        <div className="flex items-start gap-4 px-5 py-4 border-b border-border/60 shrink-0">
          {/* Progress ring */}
          <div className="relative flex items-center justify-center shrink-0" style={{ width: 54, height: 54 }}>
            <svg width={54} height={54} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={27} cy={27} r={r} fill="none" stroke="#1e1e2e" strokeWidth={5} />
              <circle
                cx={27} cy={27} r={r} fill="none" stroke={color} strokeWidth={5}
                strokeDasharray={`${dashLen} ${circ - dashLen}`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-[10px] font-bold font-mono" style={{ color }}>
              {pctVal.toFixed(0)}%
            </span>
          </div>

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[15px] font-bold text-text-primary leading-none">{drill.label}</h2>
              {isBull && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <TrendingUp size={8} /> BULL
                </span>
              )}
              {isBear && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                  <TrendingDown size={8} /> BEAR
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[11px] text-text-muted">
                {isLoading ? "Loading…" : `${filtered.length.toLocaleString()} stocks`}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border text-text-muted font-mono">
                {universe.toUpperCase()}
              </span>
              {kpi && (
                <span className="text-[10px] text-text-faint">
                  {(kpi.pct * 100).toFixed(1)}% of universe
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={exportCSV} title="Export CSV"
              className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors">
              <Download size={13} />
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* KPI strip */}
        {!isLoading && kpi && (
          <div className="grid grid-cols-6 divide-x divide-border border-b border-border shrink-0">
            {([
              {
                label: "Avg 1D",
                value: fmtPct(kpi.avg1d),
                color: (kpi.avg1d ?? 0) >= 0 ? "#22c55e" : "#ef4444",
              },
              {
                label: "Avg 1M",
                value: fmtPct(kpi.avg1m),
                color: (kpi.avg1m ?? 0) >= 0 ? "#22c55e" : "#ef4444",
              },
              {
                label: "Above 50MA",
                value: `${(kpi.pctAbove50 * 100).toFixed(0)}%`,
                color: kpi.pctAbove50 >= 0.65 ? "#22c55e" : kpi.pctAbove50 >= 0.4 ? "#eab308" : "#ef4444",
              },
              {
                label: "Above 200MA",
                value: `${(kpi.pctAbove200 * 100).toFixed(0)}%`,
                color: kpi.pctAbove200 >= 0.65 ? "#22c55e" : kpi.pctAbove200 >= 0.4 ? "#eab308" : "#ef4444",
              },
              { label: "52W Highs", value: kpi.newHighs.toString(), color: "#22c55e" },
              { label: "52W Lows",  value: kpi.newLows.toString(),  color: "#ef4444" },
            ] as { label: string; value: string; color: string }[]).map(({ label, value, color: c }) => (
              <div key={label} className="px-3 py-2 text-center bg-[#09090f]">
                <div className="text-[8px] text-text-faint uppercase tracking-wider mb-0.5">{label}</div>
                <div className="text-[13px] font-bold font-mono" style={{ color: c }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {TABS.map(({ id, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "px-4 py-2.5 text-[11px] font-medium transition-all whitespace-nowrap relative border-b-2",
                tab === id
                  ? "text-text-primary bg-white/[0.02]"
                  : "text-text-muted hover:text-text-primary hover:bg-white/[0.02] border-transparent"
              )}
              style={tab === id ? { borderBottomColor: color } : undefined}
            >
              {id}
              {badge != null && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-amber-500/20 text-amber-400 align-middle">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-24 gap-2 text-text-muted text-xs">
              <RefreshCw size={13} className="animate-spin" style={{ color }} />
              Computing breadth metrics…
            </div>
          )}

          {/* ── OVERVIEW ── */}
          {!isLoading && tab === "Overview" && (
            <div className="p-4 space-y-5">

              {/* Top Movers 2-col */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp size={10} className="text-emerald-400" />
                    <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Top Gainers · 1M</span>
                  </div>
                  <div className="space-y-1">
                    {topGainers.length === 0 ? (
                      <div className="text-center py-4 text-text-faint text-[10px]">No data</div>
                    ) : topGainers.map(s => (
                      <div key={s.ticker}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border/50 bg-surface hover:bg-emerald-500/5 hover:border-emerald-500/20 transition-colors group">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sectorColor(s.sector) }} />
                        <Link href={`/universe/${s.ticker}`}
                          className="text-[11px] font-mono font-bold text-text-primary hover:text-emerald-400 w-14 shrink-0 transition-colors">
                          {s.ticker}
                        </Link>
                        <div className="flex-1 h-1 rounded-full bg-surface-2 overflow-hidden">
                          <div className="h-1 rounded-full bg-emerald-500/50"
                            style={{ width: `${Math.min(100, Math.abs(s.ret_1m ?? 0) * 3)}%` }} />
                        </div>
                        <span className="text-[11px] font-mono text-emerald-400 w-14 text-right shrink-0">
                          {fmtPct(s.ret_1m)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown size={10} className="text-red-400" />
                    <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Top Decliners · 1M</span>
                  </div>
                  <div className="space-y-1">
                    {topDecliners.length === 0 ? (
                      <div className="text-center py-4 text-text-faint text-[10px]">No data</div>
                    ) : topDecliners.map(s => (
                      <div key={s.ticker}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border/50 bg-surface hover:bg-red-500/5 hover:border-red-500/20 transition-colors group">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sectorColor(s.sector) }} />
                        <Link href={`/universe/${s.ticker}`}
                          className="text-[11px] font-mono font-bold text-text-primary hover:text-red-400 w-14 shrink-0 transition-colors">
                          {s.ticker}
                        </Link>
                        <div className="flex-1 h-1 rounded-full bg-surface-2 overflow-hidden">
                          <div className="h-1 rounded-full bg-red-500/50"
                            style={{ width: `${Math.min(100, Math.abs(s.ret_1m ?? 0) * 3)}%` }} />
                        </div>
                        <span className="text-[11px] font-mono text-red-400 w-14 text-right shrink-0">
                          {fmtPct(s.ret_1m)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Distribution histogram */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity size={9} className="text-text-faint" />
                  <span className="text-[9px] text-text-faint uppercase tracking-wider">Distance Distribution vs 50MA</span>
                </div>
                <div className="rounded border border-border bg-surface p-3">
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={distribution} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fill: "#6b6b80", fontSize: 8 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b6b80", fontSize: 8 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 10, padding: "4px 8px" }}
                        cursor={{ fill: "rgba(255,255,255,0.03)" }}
                        formatter={(v: number) => [v, "stocks"]}
                      />
                      <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                        {distribution.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Sector mini grid */}
              <div>
                <div className="text-[9px] text-text-faint uppercase tracking-wider mb-2">Sector Breakdown</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {sectorBreakdown.map(({ sector, count, pct50, avgRet1m }) => {
                    const sc      = sectorColor(sector);
                    const bulCol  = pct50 >= 0.65 ? "#22c55e" : pct50 >= 0.4 ? "#eab308" : "#ef4444";
                    const retCol  = (avgRet1m ?? 0) >= 0 ? "#22c55e" : "#ef4444";
                    return (
                      <div
                        key={sector}
                        className="flex items-center gap-2 px-2.5 py-2 rounded border border-border bg-surface hover:bg-surface-2 transition-colors cursor-pointer"
                        onClick={() => { setSectorFilter(sector === sectorFilter ? null : sector); setTab("Stocks"); }}
                      >
                        <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: sc }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-medium text-text-primary truncate">{sector}</div>
                          <div className="text-[9px] text-text-faint">{count} stocks</div>
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <div className="text-[10px] font-mono font-bold" style={{ color: bulCol }}>
                            {(pct50 * 100).toFixed(0)}% &gt;50
                          </div>
                          {avgRet1m != null && (
                            <div className="text-[9px] font-mono" style={{ color: retCol }}>{fmtPct(avgRet1m)}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── STOCKS ── */}
          {!isLoading && tab === "Stocks" && (
            <div className="p-3 space-y-2">
              {/* Sector pills */}
              {sectors.length > 1 && (
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => setSectorFilter(null)}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-medium border transition-all",
                      sectorFilter === null
                        ? "bg-accent/20 border-accent/40 text-accent"
                        : "bg-surface-2 border-border text-text-muted hover:text-text-primary"
                    )}>
                    All
                  </button>
                  {sectors.map(s => {
                    const active = sectorFilter === s;
                    return (
                      <button key={s}
                        onClick={() => setSectorFilter(active ? null : s)}
                        className="px-2 py-0.5 rounded-full text-[9px] font-medium border transition-all"
                        style={active ? {
                          background: `${sectorColor(s)}18`,
                          borderColor: `${sectorColor(s)}50`,
                          color: sectorColor(s),
                        } : {
                          background: "transparent",
                          borderColor: "#2a2a38",
                          color: "#6b6b80",
                        }}>
                        {s.replace("Consumer ", "C.").replace(" Services", "").replace(" Care", "")}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  placeholder="Search ticker or sector…"
                  className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-surface-2 border border-border rounded text-text-primary placeholder:text-text-faint focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-text-muted border-b border-border bg-surface-2">
                      {([
                        { key: "ticker"     as SortKey, label: "Ticker"   },
                        { key: "sector"     as SortKey, label: "Sector"   },
                        { key: "price"      as SortKey, label: "Price"    },
                        { key: "ret_1d"     as SortKey, label: "1D"       },
                        { key: "ret_1w"     as SortKey, label: "1W"       },
                        { key: "ret_1m"     as SortKey, label: "1M"       },
                        { key: "dist_50ma"  as SortKey, label: "vs 50MA"  },
                        { key: "dist_200ma" as SortKey, label: "vs 200MA" },
                      ] as { key: SortKey; label: string }[]).map(({ key: k, label }) => (
                        <th key={k} className="text-left py-2 px-2 font-normal whitespace-nowrap">
                          <button onClick={() => toggleSort(k)}
                            className="flex items-center gap-1 hover:text-text-primary transition-colors">
                            {label} <SortIcon k={k} />
                          </button>
                        </th>
                      ))}
                      <th className="text-left py-2 px-2 font-normal">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(s => {
                      const rating = techRating(s);
                      const sc     = sectorColor(s.sector);
                      return (
                        <tr key={s.ticker} className="border-b border-border/30 hover:bg-white/[0.02] transition-colors">
                          <td className="py-1.5 px-2">
                            <Link href={`/universe/${s.ticker}`}
                              className="font-mono font-bold text-[11px] hover:underline flex items-center gap-1.5 transition-colors"
                              style={{ color }}>
                              <div className="w-[3px] h-3 rounded-sm shrink-0" style={{ background: sc }} />
                              {s.ticker}
                            </Link>
                          </td>
                          <td className="py-1.5 px-2 text-text-muted max-w-[100px] truncate text-[10px]">{s.sector}</td>
                          <td className="py-1.5 px-2 font-mono text-text-primary">${s.price.toFixed(2)}</td>
                          <td className={cn("py-1.5 px-2 font-mono", retColor(s.ret_1d))}>{fmtPct(s.ret_1d)}</td>
                          <td className={cn("py-1.5 px-2 font-mono", retColor(s.ret_1w))}>{fmtPct(s.ret_1w)}</td>
                          <td className={cn("py-1.5 px-2 font-mono", retColor(s.ret_1m))}>{fmtPct(s.ret_1m)}</td>
                          <td className={cn("py-1.5 px-2 font-mono", retColor(s.dist_50ma))}>
                            {s.dist_50ma != null ? `${s.dist_50ma > 0 ? "+" : ""}${s.dist_50ma.toFixed(1)}%` : "—"}
                          </td>
                          <td className={cn("py-1.5 px-2 font-mono", retColor(s.dist_200ma))}>
                            {s.dist_200ma != null ? `${s.dist_200ma > 0 ? "+" : ""}${s.dist_200ma.toFixed(1)}%` : "—"}
                          </td>
                          <td className="py-1.5 px-2">
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold whitespace-nowrap"
                              style={{ background: `${rating.color}18`, color: rating.color }}>
                              {rating.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {paged.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-8 text-text-muted text-xs">No stocks match filter</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between text-[10px] text-text-muted">
                  <span>{sorted.length} stocks · page {page + 1} of {totalPages}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                      className="px-2 py-0.5 rounded border border-border hover:bg-surface-2 disabled:opacity-40 transition-colors">Prev</button>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                      className="px-2 py-0.5 rounded border border-border hover:bg-surface-2 disabled:opacity-40 transition-colors">Next</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SECTORS ── */}
          {!isLoading && tab === "Sectors" && (
            <div className="p-3 space-y-2">
              <div className="text-[9px] text-text-faint mb-1 uppercase tracking-wider">
                {filtered.length} stocks · sector-level breadth
              </div>
              {sectorBreakdown.map(({ sector, count, above50, pct50, avgRet1m }) => {
                const sc     = sectorColor(sector);
                const bulCol = pct50 >= 0.65 ? "#22c55e" : pct50 >= 0.4 ? "#eab308" : "#ef4444";
                const retCol = (avgRet1m ?? 0) >= 0 ? "#22c55e" : "#ef4444";
                return (
                  <div key={sector}
                    className="flex items-center gap-3 p-2.5 rounded border border-border bg-surface hover:bg-white/[0.02] transition-colors">
                    <div className="w-2.5 h-2.5 rounded shrink-0" style={{ background: sc }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-text-primary truncate">{sector}</div>
                      <div className="text-[9px] text-text-faint mt-0.5">{count} stocks · {above50} above 50MA</div>
                    </div>
                    {avgRet1m != null && (
                      <div className="text-right shrink-0 w-14">
                        <div className="text-[10px] font-mono font-bold" style={{ color: retCol }}>{fmtPct(avgRet1m)}</div>
                        <div className="text-[8px] text-text-faint">avg 1M</div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 shrink-0 w-32">
                      <div className="flex-1 h-1.5 rounded-full bg-surface-2">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct50 * 100}%`, backgroundColor: bulCol }} />
                      </div>
                      <span className="text-[11px] font-mono w-8 text-right" style={{ color: bulCol }}>
                        {(pct50 * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
              {sectorBreakdown.length === 0 && (
                <div className="text-center py-8 text-text-muted text-xs">No sector data</div>
              )}
            </div>
          )}

          {/* ── CROSSOVERS ── */}
          {!isLoading && tab === "Crossovers" && (
            <div className="p-3">
              <div className="text-[9px] text-text-faint uppercase tracking-wider mb-3">
                Stocks that crossed a moving average on the most recent bar
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Bullish */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp size={10} className="text-emerald-400" />
                    <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
                      Bullish ({crossoversAbove.length})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {crossoversAbove.length === 0 ? (
                      <div className="text-center py-6 text-text-faint text-[10px] border border-border/40 rounded">None</div>
                    ) : crossoversAbove.map(s => {
                      const events = [
                        ...(s.crossed_above_20ma  ? ["20MA"]  : []),
                        ...(s.crossed_above_50ma  ? ["50MA"]  : []),
                        ...(s.crossed_above_100ma ? ["100MA"] : []),
                        ...(s.crossed_above_200ma ? ["200MA"] : []),
                      ];
                      return (
                        <div key={s.ticker}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-emerald-500/15 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors">
                          <Link href={`/universe/${s.ticker}`}
                            className="text-[11px] font-mono font-bold text-emerald-400 hover:underline w-12 shrink-0">
                            {s.ticker}
                          </Link>
                          <div className="flex gap-0.5 flex-wrap flex-1">
                            {events.map(e => (
                              <span key={e}
                                className="px-1 text-[8px] rounded bg-emerald-500/20 text-emerald-300 font-mono">↑{e}</span>
                            ))}
                          </div>
                          <span className={cn("text-[10px] font-mono shrink-0", retColor(s.ret_1d))}>
                            {fmtPct(s.ret_1d)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bearish */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown size={10} className="text-red-400" />
                    <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">
                      Bearish ({crossoversBelow.length})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {crossoversBelow.length === 0 ? (
                      <div className="text-center py-6 text-text-faint text-[10px] border border-border/40 rounded">None</div>
                    ) : crossoversBelow.map(s => {
                      const events = [
                        ...(s.crossed_below_20ma  ? ["20MA"]  : []),
                        ...(s.crossed_below_50ma  ? ["50MA"]  : []),
                        ...(s.crossed_below_100ma ? ["100MA"] : []),
                        ...(s.crossed_below_200ma ? ["200MA"] : []),
                      ];
                      return (
                        <div key={s.ticker}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-red-500/15 bg-red-500/5 hover:bg-red-500/10 transition-colors">
                          <Link href={`/universe/${s.ticker}`}
                            className="text-[11px] font-mono font-bold text-red-400 hover:underline w-12 shrink-0">
                            {s.ticker}
                          </Link>
                          <div className="flex gap-0.5 flex-wrap flex-1">
                            {events.map(e => (
                              <span key={e}
                                className="px-1 text-[8px] rounded bg-red-500/20 text-red-300 font-mono">↓{e}</span>
                            ))}
                          </div>
                          <span className={cn("text-[10px] font-mono shrink-0", retColor(s.ret_1d))}>
                            {fmtPct(s.ret_1d)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── HISTORY ── */}
          {tab === "History" && (
            <div className="p-4">
              {drill.historyKey && historyData.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Activity size={9} className="text-text-faint" />
                    <span className="text-[9px] text-text-faint uppercase tracking-wider">
                      Historical · {historyData.length} samples
                    </span>
                  </div>
                  <div className="rounded border border-border bg-surface p-3">
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={historyData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#6b6b80", fontSize: 9 }}
                          axisLine={{ stroke: "#2a2a38" }}
                          tickLine={false}
                          minTickGap={60}
                          tickFormatter={d => YEAR_FMT.format(new Date(d))}
                        />
                        <YAxis
                          tick={{ fill: "#6b6b80", fontSize: 9 }}
                          axisLine={{ stroke: "#2a2a38" }}
                          tickLine={false}
                          tickFormatter={v => v.toFixed(2)}
                        />
                        <ReferenceLine y={0} stroke="#3a3a50" />
                        <Tooltip
                          contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 10 }}
                          formatter={(v: number) => [v?.toFixed(3) ?? "—", drill.label]}
                          labelFormatter={l => String(l)}
                        />
                        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} connectNulls={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Current", value: historyData.at(-1)?.value?.toFixed(3) ?? "—" },
                      { label: "1M Ago",  value: historyData.at(-4)?.value?.toFixed(3) ?? "—" },
                      { label: "6M Ago",  value: historyData.at(-12)?.value?.toFixed(3) ?? "—" },
                      { label: "1Y Ago",  value: historyData.at(-26)?.value?.toFixed(3) ?? "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded border border-border bg-surface p-2.5 text-center">
                        <div className="text-[8px] text-text-faint uppercase tracking-wider mb-0.5">{label}</div>
                        <div className="text-[13px] font-bold font-mono" style={{ color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-text-muted text-xs">
                  {drill.historyKey ? "No historical data available" : "No historical chart for this metric"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
