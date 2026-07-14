"use client";
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X, Search, Download, ChevronUp, ChevronDown, ArrowUpDown,
  TrendingUp, TrendingDown, ExternalLink, RefreshCw,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
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
type Tab = "Stocks" | "By Sector" | "Crossovers" | "History";

const YEAR_FMT = new Intl.DateTimeFormat("en-US", { year: "numeric" });
const PAGE_SIZE = 25;

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
  const [tab, setTab]         = useState<Tab>("Stocks");
  const [search, setSearch]   = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage]       = useState(0);

  // Reset state when drill changes
  useEffect(() => {
    if (drill) { setTab("Stocks"); setSearch(""); setPage(0); setSortKey("ret_1m"); setSortDir(-1); }
  }, [drill?.key]);

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const { data: allStocks = [], isLoading } = useQuery<Stock[]>({
    queryKey: ["breadth-constituents", universe],
    queryFn:  () => fetch(`/api/breadth/constituents?universe=${universe}`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled:   !!drill,
  });

  const filtered = useMemo(
    () => drill ? filterByDrill(allStocks, drill.key) : [],
    [allStocks, drill],
  );

  const searched = useMemo(() => {
    if (!search) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(s => s.ticker.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q));
  }, [filtered, search]);

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

  const sectorBreakdown = useMemo(() => {
    const map: Record<string, { count: number; above50: number }> = {};
    for (const s of filtered) {
      if (!map[s.sector]) map[s.sector] = { count: 0, above50: 0 };
      map[s.sector].count++;
      if (s.above_50ma) map[s.sector].above50++;
    }
    return Object.entries(map)
      .map(([sector, { count, above50 }]) => ({ sector, count, above50, pct50: count > 0 ? above50 / count : 0 }))
      .sort((a, b) => b.pct50 - a.pct50);
  }, [filtered]);

  const crossovers = useMemo(() => allStocks.filter(s =>
    s.crossed_above_20ma || s.crossed_below_20ma ||
    s.crossed_above_50ma || s.crossed_below_50ma ||
    s.crossed_above_100ma || s.crossed_below_100ma ||
    s.crossed_above_200ma || s.crossed_below_200ma
  ), [allStocks]);

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
    const headers = ["Ticker","Sector","Price","1D%","1W%","1M%","Dist50MA%","Dist200MA%","Above50MA","Above200MA","52WH","52WL"];
    const rows = sorted.map(s => [
      s.ticker, s.sector, s.price,
      s.ret_1d ?? "", s.ret_1w ?? "", s.ret_1m ?? "",
      s.dist_50ma ?? "", s.dist_200ma ?? "",
      s.above_50ma ? "Y" : "N", s.above_200ma ? "Y" : "N",
      s.new_high ? "Y" : "N", s.new_low ? "Y" : "N",
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a   = document.createElement("a");
    a.href = url; a.download = `breadth_${drill?.key ?? "export"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!drill) return null;

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown size={9} className="text-text-faint" />;
    return sortDir === -1 ? <ChevronDown size={9} className="text-accent" /> : <ChevronUp size={9} className="text-accent" />;
  }

  const color = drill.color;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer — slides in from the right */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[740px] flex flex-col bg-surface border-l border-border shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <div className="text-[13px] font-bold text-text-primary">{drill.label}</div>
            <div className="text-[10px] text-text-muted">
              {isLoading ? "Loading…" : `${filtered.length} stocks · ${universe.toUpperCase()}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} title="Export CSV"
              className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors">
              <Download size={12} />
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-2 border-b border-border shrink-0">
          {(["Stocks", "By Sector", "Crossovers", "History"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-3 py-1.5 text-[11px] font-medium rounded-t transition-all whitespace-nowrap relative",
                tab === t
                  ? "text-accent border-b-2 border-accent -mb-px bg-accent/5"
                  : "text-text-muted hover:text-text-primary"
              )}>
              {t}
              {t === "Crossovers" && crossovers.length > 0 && (
                <span className="ml-1 px-1 rounded text-[9px] bg-amber-500/20 text-amber-400">{crossovers.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-16 gap-2 text-text-muted text-xs">
              <RefreshCw size={13} className="animate-spin text-accent" />
              Computing breadth data…
            </div>
          )}

          {/* ── STOCKS TAB ── */}
          {!isLoading && tab === "Stocks" && (
            <div className="p-3 space-y-3">
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
                        { key: "ticker"     as SortKey, label: "Ticker"     },
                        { key: "sector"     as SortKey, label: "Sector"     },
                        { key: "price"      as SortKey, label: "Price"      },
                        { key: "ret_1d"     as SortKey, label: "1D"         },
                        { key: "ret_1w"     as SortKey, label: "1W"         },
                        { key: "ret_1m"     as SortKey, label: "1M"         },
                        { key: "dist_50ma"  as SortKey, label: "vs 50MA"    },
                        { key: "dist_200ma" as SortKey, label: "vs 200MA"   },
                      ] as { key: SortKey; label: string }[]).map(({ key: k, label }) => (
                        <th key={k} className="text-left py-2 px-2 font-normal whitespace-nowrap">
                          <button onClick={() => toggleSort(k)}
                            className="flex items-center gap-1 hover:text-text-primary transition-colors">
                            {label} <SortIcon k={k} />
                          </button>
                        </th>
                      ))}
                      <th className="text-left py-2 px-2 font-normal">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(s => (
                      <tr key={s.ticker} className="border-b border-border/30 hover:bg-surface-2/50">
                        <td className="py-1.5 px-2">
                          <Link href={`/universe/${s.ticker}`}
                            className="text-accent font-mono font-semibold text-[11px] hover:underline flex items-center gap-1">
                            {s.ticker} <ExternalLink size={8} className="text-text-faint" />
                          </Link>
                        </td>
                        <td className="py-1.5 px-2 text-text-muted max-w-[120px] truncate">{s.sector}</td>
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
                          <div className="flex gap-0.5 flex-wrap">
                            {s.new_high  && <span className="px-1 text-[8px] rounded bg-emerald-500/20 text-emerald-400">52H</span>}
                            {s.new_low   && <span className="px-1 text-[8px] rounded bg-red-500/20 text-red-400">52L</span>}
                            {s.above_50ma  && <span className="px-1 text-[8px] rounded bg-blue-500/20 text-blue-400">50+</span>}
                            {s.above_200ma && <span className="px-1 text-[8px] rounded bg-purple-500/20 text-purple-400">200+</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {paged.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-8 text-text-muted text-xs">No stocks match filter</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-[10px] text-text-muted">
                  <span>{sorted.length} stocks · page {page + 1} of {totalPages}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                      className="px-2 py-0.5 rounded border border-border hover:bg-surface-2 disabled:opacity-40 transition-colors">
                      Prev
                    </button>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                      className="px-2 py-0.5 rounded border border-border hover:bg-surface-2 disabled:opacity-40 transition-colors">
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── BY SECTOR TAB ── */}
          {!isLoading && tab === "By Sector" && (
            <div className="p-3 space-y-1.5">
              <div className="text-[10px] text-text-muted mb-2">
                {filtered.length} stocks in this group · breakdown by sector
              </div>
              {sectorBreakdown.map(({ sector, count, above50, pct50 }) => {
                const col = pct50 >= 0.65 ? "#22c55e" : pct50 >= 0.40 ? "#eab308" : "#ef4444";
                return (
                  <div key={sector}
                    className="flex items-center gap-3 p-2.5 rounded border border-border bg-surface hover:bg-surface-2/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-text-primary truncate">{sector}</div>
                      <div className="text-[10px] text-text-muted">{count} stocks · {above50} above 50MA</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-24 h-1.5 rounded-full bg-surface-2">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct50 * 100}%`, backgroundColor: col }} />
                      </div>
                      <span className="text-[11px] font-mono w-8 text-right" style={{ color: col }}>
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

          {/* ── CROSSOVERS TAB ── */}
          {!isLoading && tab === "Crossovers" && (
            <div className="p-3 space-y-2">
              <div className="text-[10px] text-text-muted mb-2">
                Stocks that crossed above or below a moving average on the most recent bar.
              </div>
              {crossovers.length === 0 ? (
                <div className="text-center py-8 text-text-muted text-xs">No crossovers detected</div>
              ) : crossovers.map(s => {
                const events: { label: string; dir: "up" | "dn" }[] = [
                  ...(s.crossed_above_20ma  ? [{ label: "20MA",  dir: "up" as const }] : []),
                  ...(s.crossed_above_50ma  ? [{ label: "50MA",  dir: "up" as const }] : []),
                  ...(s.crossed_above_100ma ? [{ label: "100MA", dir: "up" as const }] : []),
                  ...(s.crossed_above_200ma ? [{ label: "200MA", dir: "up" as const }] : []),
                  ...(s.crossed_below_20ma  ? [{ label: "20MA",  dir: "dn" as const }] : []),
                  ...(s.crossed_below_50ma  ? [{ label: "50MA",  dir: "dn" as const }] : []),
                  ...(s.crossed_below_100ma ? [{ label: "100MA", dir: "dn" as const }] : []),
                  ...(s.crossed_below_200ma ? [{ label: "200MA", dir: "dn" as const }] : []),
                ];
                return (
                  <div key={s.ticker}
                    className="flex items-center gap-3 px-2.5 py-2 rounded border border-border hover:bg-surface-2/50 transition-colors">
                    <Link href={`/universe/${s.ticker}`}
                      className="text-accent font-mono text-[11px] font-semibold hover:underline w-14 shrink-0">
                      {s.ticker}
                    </Link>
                    <span className="text-[10px] text-text-muted truncate flex-1">{s.sector}</span>
                    <span className={cn("text-[10px] font-mono shrink-0", retColor(s.ret_1d))}>
                      {fmtPct(s.ret_1d)}
                    </span>
                    <div className="flex gap-1 shrink-0 flex-wrap justify-end max-w-[150px]">
                      {events.map(({ label, dir }) => (
                        <span key={label + dir} className={cn(
                          "flex items-center gap-0.5 px-1 text-[9px] rounded font-medium",
                          dir === "up" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                        )}>
                          {dir === "up" ? <TrendingUp size={7} /> : <TrendingDown size={7} />}
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {tab === "History" && (
            <div className="p-3">
              {drill.historyKey && historyData.length > 0 ? (
                <div>
                  <div className="text-[10px] text-text-muted mb-3">Historical data · weekly samples</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={historyData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#6b6b80", fontSize: 9 }}
                        axisLine={{ stroke: "#2a2a38" }}
                        tickLine={false}
                        minTickGap={60}
                        tickFormatter={(d) => YEAR_FMT.format(new Date(d))}
                      />
                      <YAxis
                        tick={{ fill: "#6b6b80", fontSize: 9 }}
                        axisLine={{ stroke: "#2a2a38" }}
                        tickLine={false}
                        tickFormatter={(v) => v.toFixed(2)}
                      />
                      <ReferenceLine y={0} stroke="#3a3a50" />
                      <Tooltip
                        contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 10 }}
                        formatter={(v: number) => [v?.toFixed(3) ?? "—", drill.label]}
                        labelFormatter={(l) => String(l)}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      { label: "Current",  value: historyData.at(-1)?.value?.toFixed(3) ?? "—" },
                      { label: "6M Ago",   value: historyData.at(-12)?.value?.toFixed(3) ?? "—" },
                      { label: "1Y Ago",   value: historyData.at(-26)?.value?.toFixed(3) ?? "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded border border-border bg-surface-2 p-2.5 text-center">
                        <div className="text-[9px] text-text-muted mb-0.5">{label}</div>
                        <div className="text-[12px] font-bold font-mono text-text-primary">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-text-muted text-xs">
                  {drill.historyKey ? "No historical data available" : "No historical chart available for this metric"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
