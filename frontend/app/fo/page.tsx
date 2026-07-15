"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  RefreshCw, TrendingUp, TrendingDown, Search, ChevronDown, ChevronUp,
  Activity, ArrowUpRight, ArrowDownRight, Minus, X,
} from "lucide-react";
import { api, type FOStock, type FODashboard, type FOOptionChain, type BuildupSignal } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const BUILDUP_COLORS: Record<BuildupSignal | string, string> = {
  "Long Build-up":   "#22c55e",
  "Short Build-up":  "#ef4444",
  "Short Covering":  "#84cc16",
  "Long Unwinding":  "#f97316",
  "N/A":             "#6b6b80",
};

const BUILDUP_ICONS: Record<BuildupSignal | string, React.ElementType> = {
  "Long Build-up":   ArrowUpRight,
  "Short Build-up":  ArrowDownRight,
  "Short Covering":  TrendingUp,
  "Long Unwinding":  TrendingDown,
  "N/A":             Minus,
};

const SECTOR_COLORS: Record<string, string> = {
  "Financials":             "#6366f1",
  "Information Technology": "#22d3ee",
  "Health Care":            "#22c55e",
  "Automobiles":            "#f59e0b",
  "Consumer Staples":       "#84cc16",
  "Energy":                 "#f97316",
  "Materials":              "#a78bfa",
  "Industrials":            "#ec4899",
  "Consumer Discretionary": "#eab308",
  "Real Estate":            "#14b8a6",
  "Communication Services": "#fb7185",
  "Utilities":              "#94a3b8",
  "Other":                  "#6b6b80",
};

// ── Formatters ─────────────────────────────────────────────────────────────────

const fmtPct  = (v: number | null | undefined) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const fmtNum  = (v: number | null | undefined, dec = 0) =>
  v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: dec });
const fmtOI   = (v: number | null | undefined) => {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  return fmtNum(v);
};
const fmtPrice = (v: number | null | undefined) =>
  v == null ? "—" : `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Signal Badge ───────────────────────────────────────────────────────────────

function BuildupBadge({ signal }: { signal: BuildupSignal | null | string }) {
  const sig  = signal || "N/A";
  const color = BUILDUP_COLORS[sig] ?? "#6b6b80";
  const Icon  = BUILDUP_ICONS[sig] ?? Minus;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
      style={{ color, background: `${color}18` }}
    >
      <Icon size={9} />
      {sig}
    </span>
  );
}

// ── Signal Count Cards ─────────────────────────────────────────────────────────

function SignalCountCard({ label, count, total, color, icon: Icon }: {
  label: string; count: number; total: number; color: string; icon: React.ElementType;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="bg-surface border border-border rounded-lg p-3 space-y-2" style={{ borderTopColor: color, borderTopWidth: 2 }}>
      <div className="flex items-center gap-1.5">
        <Icon size={12} style={{ color }} />
        <span className="text-[11px] text-text-muted">{label}</span>
      </div>
      <div className="text-xl font-bold font-mono" style={{ color }}>{count}</div>
      <div className="h-1 rounded-full bg-surface-2">
        <div className="h-1 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="text-[10px] text-text-muted">{pct.toFixed(0)}% of universe</div>
    </div>
  );
}

// ── Option Chain Modal ────────────────────────────────────────────────────────

function OptionChainModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [expiry, setExpiry] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["fo-chain", symbol],
    queryFn:  () => api.getFoOptionChain(symbol),
    staleTime: 4 * 60 * 1000,
  });

  const activeExpiry = expiry || data?.expiries?.[0] || "";
  const strikes = data?.strikes?.[activeExpiry] ?? [];

  const underlying = data?.underlying;

  // Sort strikes, find ATM
  const atmStrike = useMemo(() => {
    if (!underlying || strikes.length === 0) return null;
    return strikes.reduce((best, s) =>
      Math.abs(s.strike - underlying) < Math.abs(best.strike - underlying) ? s : best
    ).strike;
  }, [strikes, underlying]);

  // Filter to ATM ±15 strikes
  const visible = useMemo(() => {
    if (!atmStrike) return strikes;
    const idx = strikes.findIndex(s => s.strike === atmStrike);
    return strikes.slice(Math.max(0, idx - 15), idx + 16);
  }, [strikes, atmStrike]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <div className="text-base font-bold text-text-primary">{symbol} — Option Chain</div>
            {underlying && (
              <div className="text-[11px] text-text-muted">
                Spot: {fmtPrice(underlying)} · PCR: {data?.overall_pcr?.toFixed(2) ?? "—"} · Max Pain: {fmtPrice(data?.max_pain)}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-2 text-text-muted transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Expiry selector */}
        {data && (
          <div className="px-5 py-2 border-b border-border flex gap-2 overflow-x-auto">
            {data.expiries.slice(0, 6).map(exp => (
              <button
                key={exp}
                onClick={() => setExpiry(exp)}
                className={cn(
                  "px-3 py-1 rounded text-[11px] whitespace-nowrap transition-colors",
                  (activeExpiry === exp)
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-text-muted hover:text-text-primary"
                )}
              >
                {exp}
              </button>
            ))}
            {data.expiry_meta.find(m => m.expiry === activeExpiry) && (
              <div className="ml-auto flex items-center gap-3 text-[10px] text-text-muted shrink-0">
                <span>PCR: <span className="font-mono text-text-primary">
                  {data.expiry_meta.find(m => m.expiry === activeExpiry)?.pcr?.toFixed(2) ?? "—"}
                </span></span>
              </div>
            )}
          </div>
        )}

        {/* OI chart */}
        {visible.length > 0 && (
          <div className="px-5 py-3 border-b border-border">
            <div className="text-[10px] text-text-muted mb-2">Open Interest by Strike (CE = green · PE = red)</div>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={visible} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="strike" tick={{ fill: "#6b6b80", fontSize: 8 }} axisLine={false} tickLine={false} interval={2} />
                <Tooltip
                  contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 10 }}
                  formatter={(v: number, name: string) => [fmtOI(v), name]}
                />
                {atmStrike && <ReferenceLine x={atmStrike} stroke="#6366f1" strokeDasharray="3 3" />}
                <Bar dataKey="ce_oi" name="Call OI" fill="#22c55e" opacity={0.8} radius={[2,2,0,0]} />
                <Bar dataKey="pe_oi" name="Put OI" fill="#ef4444" opacity={0.8} radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Strikes table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-text-muted text-sm">
              <RefreshCw size={14} className="animate-spin mr-2" /> Loading option chain…
            </div>
          ) : visible.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-sm">No option chain data available</div>
          ) : (
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-surface border-b border-border">
                <tr className="text-text-muted">
                  <th colSpan={5} className="py-1.5 text-center text-emerald-400 border-r border-border">CALLS</th>
                  <th className="py-1.5 px-3 text-center font-bold text-text-primary">STRIKE</th>
                  <th colSpan={5} className="py-1.5 text-center text-red-400 border-l border-border">PUTS</th>
                </tr>
                <tr className="text-text-faint text-[9px]">
                  {["OI", "OI Δ", "Vol", "IV", "LTP"].map(h => (
                    <th key={`ce-${h}`} className="py-1 px-2 text-right font-normal">{h}</th>
                  ))}
                  <th className="py-1 px-3 text-center font-semibold text-text-muted border-x border-border">—</th>
                  {["LTP", "IV", "Vol", "OI Δ", "OI"].map(h => (
                    <th key={`pe-${h}`} className="py-1 px-2 text-left font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const isATM = row.strike === atmStrike;
                  return (
                    <tr key={row.strike} className={cn(
                      "border-b border-border/30",
                      isATM ? "bg-accent/8 font-semibold" : "hover:bg-surface-2/50"
                    )}>
                      {/* CE side */}
                      <td className="py-1 px-2 text-right font-mono text-emerald-300">{fmtOI(row.ce_oi)}</td>
                      <td className={cn("py-1 px-2 text-right font-mono", (row.ce_oi_chg ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {fmtOI(row.ce_oi_chg)}
                      </td>
                      <td className="py-1 px-2 text-right font-mono text-text-muted">{fmtOI(row.ce_vol)}</td>
                      <td className="py-1 px-2 text-right font-mono text-text-muted">{row.ce_iv?.toFixed(1) ?? "—"}</td>
                      <td className="py-1 px-2 text-right font-mono text-text-primary">{fmtPrice(row.ce_ltp)}</td>

                      {/* Strike */}
                      <td className="py-1 px-3 text-center font-bold text-[11px] border-x border-border" style={{ color: isATM ? "#6366f1" : undefined }}>
                        {row.strike.toLocaleString("en-IN")}
                        {isATM && <span className="ml-1 text-[8px] text-accent">ATM</span>}
                      </td>

                      {/* PE side */}
                      <td className="py-1 px-2 text-left font-mono text-text-primary">{fmtPrice(row.pe_ltp)}</td>
                      <td className="py-1 px-2 text-left font-mono text-text-muted">{row.pe_iv?.toFixed(1) ?? "—"}</td>
                      <td className="py-1 px-2 text-left font-mono text-text-muted">{fmtOI(row.pe_vol)}</td>
                      <td className={cn("py-1 px-2 text-left font-mono", (row.pe_oi_chg ?? 0) >= 0 ? "text-red-400" : "text-emerald-400")}>
                        {fmtOI(row.pe_oi_chg)}
                      </td>
                      <td className="py-1 px-2 text-left font-mono text-red-300">{fmtOI(row.pe_oi)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main F&O Page ─────────────────────────────────────────────────────────────

const TABS = ["Dashboard", "Long Build-up", "Short Build-up", "Short Covering", "Long Unwinding", "OI Analysis"] as const;
type Tab = typeof TABS[number];

const SORT_KEYS = ["symbol", "price", "ret_1d", "ret_1m", "oi", "oi_change", "pcr"] as const;
type SortKey = typeof SORT_KEYS[number];

export default function FODashboardPage() {
  const [tab,        setTab]        = useState<Tab>("Dashboard");
  const [search,     setSearch]     = useState("");
  const [sector,     setSector]     = useState("All");
  const [sortKey,    setSortKey]    = useState<SortKey>("oi");
  const [sortAsc,    setSortAsc]    = useState(false);
  const [chainSym,   setChainSym]   = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey:        ["fo-dashboard"],
    queryFn:         api.getFoDashboard,
    staleTime:       14 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  const { data: oiData } = useQuery({
    queryKey:  ["fo-oi-analysis"],
    queryFn:   api.getFoOiAnalysis,
    staleTime: 9 * 60 * 1000,
    enabled:   tab === "OI Analysis",
  });

  const sectors = useMemo(() => {
    const s = new Set(data?.stocks?.map(s => s.sector) ?? []);
    return ["All", ...Array.from(s).sort()];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.stocks) return [];
    let stocks = [...data.stocks];

    // Filter by tab
    if (tab === "Long Build-up")    stocks = stocks.filter(s => s.buildup === "Long Build-up");
    if (tab === "Short Build-up")   stocks = stocks.filter(s => s.buildup === "Short Build-up");
    if (tab === "Short Covering")   stocks = stocks.filter(s => s.buildup === "Short Covering");
    if (tab === "Long Unwinding")   stocks = stocks.filter(s => s.buildup === "Long Unwinding");

    // Sector filter
    if (sector !== "All") stocks = stocks.filter(s => s.sector === sector);

    // Search
    const q = search.toLowerCase();
    if (q) stocks = stocks.filter(s => s.symbol.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q));

    // Sort
    stocks.sort((a, b) => {
      const av = a[sortKey as keyof FOStock] as number | null;
      const bv = b[sortKey as keyof FOStock] as number | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortAsc ? av - (bv as number) : (bv as number) - av;
    });

    return stocks;
  }, [data, tab, sector, search, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-text-faint">↕</span>;
    return sortAsc ? <ChevronUp size={10} /> : <ChevronDown size={10} />;
  }

  const sc = data?.signal_counts;

  return (
    <div className="space-y-4 max-w-screen-2xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">🇮🇳 NSE F&O Dashboard</h1>
          <p className="text-[12px] text-text-muted mt-0.5">
            {data ? `${data.total_stocks} F&O stocks · ${data.oi_data_available ? "Live OI data" : "Price data only (OI unavailable)"} · ${data.as_of}` : "Loading F&O universe…"}
          </p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text-primary hover:border-border-2 disabled:opacity-50 transition-all">
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24 gap-3 text-text-muted text-sm">
          <RefreshCw size={14} className="animate-spin text-accent" />
          <span>Loading F&O universe data…</span>
        </div>
      )}

      {data && (
        <>
          {/* Signal Count Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SignalCountCard
              label="Long Build-up"   count={sc?.long_buildup ?? 0}   total={sc?.total ?? 1}
              color="#22c55e"  icon={ArrowUpRight}
            />
            <SignalCountCard
              label="Short Build-up"  count={sc?.short_buildup ?? 0}  total={sc?.total ?? 1}
              color="#ef4444"  icon={ArrowDownRight}
            />
            <SignalCountCard
              label="Short Covering"  count={sc?.short_covering ?? 0} total={sc?.total ?? 1}
              color="#84cc16"  icon={TrendingUp}
            />
            <SignalCountCard
              label="Long Unwinding"  count={sc?.long_unwinding ?? 0} total={sc?.total ?? 1}
              color="#f97316"  icon={TrendingDown}
            />
          </div>

          {/* Sector Bar Chart */}
          {data.sectors.length > 0 && (
            <div className="bg-surface border border-border rounded-lg p-4">
              <div className="text-sm font-medium mb-3">Sector Build-up Distribution</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.sectors} layout="vertical" margin={{ left: 80, right: 20, top: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fill: "#6b6b80", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="sector" tick={{ fill: "#9ca3af", fontSize: 9 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip
                    contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 10 }}
                  />
                  <Bar dataKey="long_buildup"   name="Long Build-up"  fill="#22c55e" stackId="a" radius={[0,0,0,0]} />
                  <Bar dataKey="short_covering" name="Short Covering"  fill="#84cc16" stackId="a" />
                  <Bar dataKey="long_unwinding" name="Long Unwinding"  fill="#f97316" stackId="a" />
                  <Bar dataKey="short_buildup"  name="Short Build-up"  fill="#ef4444" stackId="a" radius={[0,2,2,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border overflow-x-auto pb-px">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-3.5 py-2 text-[12px] font-medium rounded-t transition-all whitespace-nowrap relative",
                  tab === t
                    ? "text-accent border-b-2 border-accent -mb-px bg-accent/5"
                    : "text-text-muted hover:text-text-primary"
                )}
              >
                {t}
                {t !== "Dashboard" && t !== "OI Analysis" && (
                  <span className="ml-1.5 text-[9px] font-mono text-text-faint">
                    {t === "Long Build-up"   ? sc?.long_buildup :
                     t === "Short Build-up"  ? sc?.short_buildup :
                     t === "Short Covering"  ? sc?.short_covering :
                     sc?.long_unwinding}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* OI Analysis Tab */}
          {tab === "OI Analysis" && (
            <div className="space-y-4">
              {!oiData ? (
                <div className="py-12 text-center text-text-muted text-sm">
                  <RefreshCw size={14} className="animate-spin inline mr-2" />Loading OI analysis…
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <div className="text-sm font-medium mb-3 text-emerald-400">Top OI Gain</div>
                    <table className="w-full text-xs">
                      <thead><tr className="text-text-muted border-b border-border">
                        {["Symbol","OI","OI Δ","PCR","Vol"].map(h => <th key={h} className="py-1 text-left pr-3 font-normal">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {oiData.top_oi_gain.slice(0,15).map((r,i) => (
                          <tr key={i} className="border-b border-border/30 hover:bg-surface-2/50 cursor-pointer"
                            onClick={() => setChainSym(r.symbol)}>
                            <td className="py-1 pr-3 font-medium text-text-primary">{r.symbol}</td>
                            <td className="py-1 pr-3 font-mono text-text-muted">{fmtOI(r.oi)}</td>
                            <td className="py-1 pr-3 font-mono text-emerald-400">{fmtOI(r.oi_change)}</td>
                            <td className="py-1 pr-3 font-mono text-text-muted">{r.pcr?.toFixed(2) ?? "—"}</td>
                            <td className="py-1 pr-3 font-mono text-text-muted">{fmtOI(r.volume)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-surface border border-border rounded-lg p-4">
                    <div className="text-sm font-medium mb-3 text-red-400">Top OI Fall</div>
                    <table className="w-full text-xs">
                      <thead><tr className="text-text-muted border-b border-border">
                        {["Symbol","OI","OI Δ","PCR","Vol"].map(h => <th key={h} className="py-1 text-left pr-3 font-normal">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {oiData.top_oi_fall.slice(0,15).map((r,i) => (
                          <tr key={i} className="border-b border-border/30 hover:bg-surface-2/50 cursor-pointer"
                            onClick={() => setChainSym(r.symbol)}>
                            <td className="py-1 pr-3 font-medium text-text-primary">{r.symbol}</td>
                            <td className="py-1 pr-3 font-mono text-text-muted">{fmtOI(r.oi)}</td>
                            <td className="py-1 pr-3 font-mono text-red-400">{fmtOI(r.oi_change)}</td>
                            <td className="py-1 pr-3 font-mono text-text-muted">{r.pcr?.toFixed(2) ?? "—"}</td>
                            <td className="py-1 pr-3 font-mono text-text-muted">{fmtOI(r.volume)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {oiData.oi_spurts.length > 0 && (
                    <div className="lg:col-span-2 bg-surface border border-border rounded-lg p-4">
                      <div className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Activity size={12} className="text-accent" />
                        OI Spurts (Intraday)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {oiData.oi_spurts.slice(0,30).map((s,i) => (
                          <div
                            key={i}
                            className="bg-surface-2 border border-border rounded px-2.5 py-1.5 cursor-pointer hover:border-border-2 transition-colors"
                            onClick={() => setChainSym(s.symbol)}
                          >
                            <div className="text-[11px] font-medium text-text-primary">{s.symbol}</div>
                            <div className="text-[9px] text-text-muted font-mono">
                              {s.oi_pct != null ? `OI ${s.oi_pct >= 0 ? "+" : ""}${s.oi_pct.toFixed(1)}%` : "—"}
                              {s.price_chg != null ? ` · ${s.price_chg >= 0 ? "+" : ""}${s.price_chg.toFixed(1)}%` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Stock Table (all non-OI tabs) */}
          {tab !== "OI Analysis" && (
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              {/* Filters */}
              <div className="flex items-center gap-2 p-3 border-b border-border flex-wrap">
                <div className="relative flex-1 min-w-[160px] max-w-xs">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search symbol…"
                    className="w-full pl-7 pr-3 py-1.5 rounded border border-border bg-surface-2 text-[11px] text-text-primary placeholder:text-text-faint focus:outline-none focus:border-border-2"
                  />
                </div>
                <select
                  value={sector}
                  onChange={e => setSector(e.target.value)}
                  className="px-2 py-1.5 rounded border border-border bg-surface-2 text-[11px] text-text-primary focus:outline-none"
                >
                  {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="ml-auto text-[11px] text-text-muted">{filtered.length} stocks</div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 border-b border-border sticky top-0">
                    <tr className="text-text-muted">
                      {[
                        { key: "symbol",    label: "Symbol"    },
                        { key: null,        label: "Sector"    },
                        { key: "price",     label: "Price"     },
                        { key: "ret_1d",    label: "1D %"      },
                        { key: "ret_1m",    label: "1M %"      },
                        { key: null,        label: "50MA"      },
                        { key: "oi",        label: "OI"        },
                        { key: "oi_change", label: "OI Δ"      },
                        { key: "pcr",       label: "PCR"       },
                        { key: null,        label: "Signal"    },
                        { key: null,        label: "Chain"     },
                      ].map(({ key, label }) => (
                        <th
                          key={label}
                          className={cn("py-2 px-2 text-left font-normal text-[10px]", key && "cursor-pointer hover:text-text-primary select-none")}
                          onClick={() => key && toggleSort(key as SortKey)}
                        >
                          <span className="flex items-center gap-1">
                            {label}
                            {key && <SortIcon k={key as SortKey} />}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 200).map((s) => {
                      const secColor = SECTOR_COLORS[s.sector] ?? "#6b6b80";
                      const r1d_color = s.ret_1d == null ? "#6b6b80" : s.ret_1d >= 0 ? "#22c55e" : "#ef4444";
                      const r1m_color = s.ret_1m == null ? "#6b6b80" : s.ret_1m >= 0 ? "#22c55e" : "#ef4444";
                      return (
                        <tr
                          key={s.ticker}
                          className="border-b border-border/30 hover:bg-surface-2/50 transition-colors"
                        >
                          <td className="py-1.5 px-2 font-medium text-text-primary">{s.symbol}</td>
                          <td className="py-1.5 px-2">
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: secColor, background: `${secColor}18` }}>
                              {s.sector}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 font-mono text-text-primary">{fmtPrice(s.price)}</td>
                          <td className="py-1.5 px-2 font-mono" style={{ color: r1d_color }}>{fmtPct(s.ret_1d)}</td>
                          <td className="py-1.5 px-2 font-mono" style={{ color: r1m_color }}>{fmtPct(s.ret_1m)}</td>
                          <td className="py-1.5 px-2">
                            {s.above_50ma === null ? (
                              <span className="text-text-faint">—</span>
                            ) : s.above_50ma ? (
                              <span className="text-emerald-400 text-[10px]">Above</span>
                            ) : (
                              <span className="text-red-400 text-[10px]">Below</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-text-muted">{fmtOI(s.oi)}</td>
                          <td className={cn("py-1.5 px-2 font-mono", (s.oi_change ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {fmtOI(s.oi_change)}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-text-muted">{s.pcr?.toFixed(2) ?? "—"}</td>
                          <td className="py-1.5 px-2"><BuildupBadge signal={s.buildup} /></td>
                          <td className="py-1.5 px-2">
                            <button
                              onClick={() => setChainSym(s.symbol)}
                              className="px-2 py-0.5 text-[10px] rounded border border-border text-text-muted hover:text-accent hover:border-accent/50 transition-colors"
                            >
                              Chain
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length > 200 && (
                  <div className="py-3 text-center text-[11px] text-text-muted">
                    Showing 200 of {filtered.length} stocks
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Option Chain Modal */}
      {chainSym && <OptionChainModal symbol={chainSym} onClose={() => setChainSym(null)} />}
    </div>
  );
}
