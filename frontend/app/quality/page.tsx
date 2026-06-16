"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
  BarChart, Bar, LabelList,
} from "recharts";
import { api, QualityResult, SectorQuality } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Gem, ChevronDown, ChevronUp, Zap } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const UNIVERSE_OPTIONS = ["sp500", "nasdaq100", "watchlist"] as const;
type Universe = (typeof UNIVERSE_OPTIONS)[number];

type FilterTab = "all" | "quality_mo" | "quality" | "momentum";

const SECTOR_COLORS: Record<string, string> = {
  "Technology":             "#6366f1",
  "Health Care":            "#10b981",
  "Financials":             "#f59e0b",
  "Consumer Discretionary": "#ef4444",
  "Industrials":            "#3b82f6",
  "Communication Services": "#8b5cf6",
  "Consumer Staples":       "#84cc16",
  "Energy":                 "#f97316",
  "Materials":              "#06b6d4",
  "Real Estate":            "#ec4899",
  "Utilities":              "#a3a3a3",
};

function sectorColor(s: string) {
  return SECTOR_COLORS[s] ?? "#6b7280";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function num(v: number | null | undefined, digits = 1, suffix = "%"): string {
  if (v == null) return "—";
  return `${v.toFixed(digits)}${suffix}`;
}

function scoreColor(v: number | null): string {
  if (v == null) return "bg-surface-2 text-text-muted";
  if (v >= 75)   return "bg-emerald-500/20 text-emerald-400";
  if (v >= 55)   return "bg-green-500/15 text-green-400";
  if (v >= 35)   return "bg-yellow-500/10 text-yellow-400";
  return "bg-red-500/10 text-red-400";
}

function metricColor(v: number | null, good = true): string {
  if (v == null) return "text-text-muted";
  if (good) return v >= 15 ? "text-emerald-400" : v >= 5 ? "text-green-300" : v >= 0 ? "text-text-primary" : "text-red-400";
  return v <= 15 ? "text-emerald-400" : v <= 30 ? "text-text-primary" : "text-red-400";
}

function growthColor(v: number | null): string {
  if (v == null) return "text-text-muted";
  return v >= 20 ? "text-emerald-400" : v >= 5 ? "text-green-300" : v >= 0 ? "text-text-primary" : "text-red-400";
}

// ── Summary card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, highlight, accent }: {
  label: string; value: string; sub?: string; highlight?: boolean; accent?: boolean;
}) {
  return (
    <div className={cn(
      "bg-surface border border-border rounded-lg px-4 py-3 flex flex-col gap-0.5",
      highlight && "border-accent/40",
      accent && "border-emerald-500/40",
    )}>
      <span className="text-xs text-text-muted">{label}</span>
      <span className={cn(
        "text-lg font-bold",
        accent ? "text-emerald-400" : highlight ? "text-accent" : "text-text-primary",
      )}>{value}</span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

// ── Scatter: Quality vs Momentum ──────────────────────────────────────────────

function QMTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as QualityResult;
  return (
    <div className="bg-surface-2 border border-border rounded p-2 text-xs space-y-0.5 min-w-[160px]">
      <div className="font-semibold text-text-primary">{d.ticker}</div>
      <div className="text-text-muted text-[10px]">{d.sector}</div>
      <div>Quality: <span className="text-accent">{d.quality_score?.toFixed(1)}</span></div>
      <div>Momentum: <span className="text-blue-400">{d.momentum_pctile?.toFixed(1)}</span></div>
      <div>Combined: <span className="text-emerald-400">{d.combined_score?.toFixed(1)}</span></div>
      {d.quality_momentum && (
        <div className="text-emerald-400 font-semibold">★ Quality + Momentum</div>
      )}
    </div>
  );
}

function QMScatter({ data }: { data: QualityResult[] }) {
  const points = data.filter(r => r.quality_score != null && r.momentum_pctile != null);
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-text-primary">Quality Score vs Momentum</span>
        <span className="text-xs text-text-muted ml-auto">upper-right = strongest candidates</span>
      </div>
      <div className="relative">
        {/* Quadrant labels */}
        <div className="absolute top-1 right-2 text-[10px] text-emerald-400/70 font-semibold z-10">Quality + Momentum ★</div>
        <div className="absolute top-1 left-14 text-[10px] text-blue-400/60 z-10">Momentum Only</div>
        <div className="absolute bottom-8 right-2 text-[10px] text-purple-400/60 z-10">Quality Only</div>
        <div className="absolute bottom-8 left-14 text-[10px] text-text-muted/50 z-10">Weak</div>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              type="number" dataKey="quality_score" name="Quality Score"
              label={{ value: "Quality Score", position: "insideBottom", offset: -10, fill: "#64748b", fontSize: 11 }}
              tick={{ fill: "#64748b", fontSize: 10 }} domain={[0, 100]}
            />
            <YAxis
              type="number" dataKey="momentum_pctile" name="Momentum %ile"
              label={{ value: "Momentum %ile", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }}
              tick={{ fill: "#64748b", fontSize: 10 }} domain={[0, 100]}
            />
            <Tooltip content={<QMTooltip />} />
            <ReferenceLine x={60} stroke="#334155" strokeDasharray="4 4" />
            <ReferenceLine y={60} stroke="#334155" strokeDasharray="4 4" />
            <Scatter data={points} isAnimationActive={false}>
              {points.map((p, i) => (
                <Cell
                  key={i}
                  fill={sectorColor(p.sector)}
                  fillOpacity={p.quality_momentum ? 1 : 0.55}
                  stroke={p.quality_momentum ? "#10b981" : "transparent"}
                  strokeWidth={p.quality_momentum ? 2 : 0}
                  r={p.quality_momentum ? 6 : 4}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {/* Sector legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {Object.entries(SECTOR_COLORS).map(([s, c]) => (
          <div key={s} className="flex items-center gap-1 text-[10px] text-text-muted">
            <div className="w-2 h-2 rounded-full" style={{ background: c }} />
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sector quality bar ────────────────────────────────────────────────────────

function SectorBars({ sectors }: { sectors: SectorQuality[] }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="text-sm font-semibold text-text-primary mb-3">Quality by Sector</div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={sectors} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 110 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="sector" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} width={105} />
          <Tooltip
            formatter={(v: any) => [v.toFixed(1), "Avg Quality Score"]}
            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 11 }}
          />
          <Bar dataKey="avg_quality" radius={[0, 3, 3, 0]} isAnimationActive={false}>
            {sectors.map((s, i) => (
              <Cell key={i} fill={sectorColor(s.sector)} fillOpacity={0.8} />
            ))}
            <LabelList dataKey="avg_quality" position="right" style={{ fill: "#94a3b8", fontSize: 10 }}
              formatter={(v: number) => v.toFixed(0)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Metric bar ────────────────────────────────────────────────────────────────

function MetricBar({ label, value, max, color }: { label: string; value: number | null; max: number; color: string }) {
  const pct = value != null ? Math.min(Math.max(value / max, 0), 1) * 100 : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-text-muted">{label}</span>
        <span style={{ color }}>{value != null ? value.toFixed(1) + "%" : "—"}</span>
      </div>
      <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Expanded row detail ───────────────────────────────────────────────────────

function ExpandedDetail({ row }: { row: QualityResult }) {
  const fcfB = row.fcf_ttm != null ? (row.fcf_ttm / 1e9).toFixed(1) + "B" : "—";
  return (
    <tr>
      <td colSpan={12} className="px-4 pb-4 pt-1 bg-surface-2/40">
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <div className="text-xs font-medium text-text-muted mb-1">Quality Metrics</div>
            <MetricBar label="ROIC" value={row.roic} max={50} color="#6366f1" />
            <MetricBar label="ROE" value={row.roe} max={60} color="#10b981" />
            <MetricBar label="Return on Assets" value={row.roa} max={25} color="#3b82f6" />
            <MetricBar label="Gross Margin" value={row.gross_margin} max={100} color="#f59e0b" />
            <MetricBar label="Operating Margin" value={row.op_margin} max={40} color="#8b5cf6" />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-text-muted mb-1">Growth Metrics</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-text-muted">Earnings Growth</div>
                <div className={cn("font-bold", growthColor(row.earnings_growth))}>
                  {pct(row.earnings_growth)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">FCF Growth</div>
                <div className={cn("font-bold", growthColor(row.fcf_growth))}>
                  {pct(row.fcf_growth)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">FCF (TTM)</div>
                <div className="font-bold text-text-primary">{fcfB}</div>
              </div>
              <div>
                <div className="text-text-muted">GM Trend</div>
                <div className={cn("font-bold", (row.gm_trend ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {row.gm_trend != null ? `${row.gm_trend >= 0 ? "+" : ""}${row.gm_trend.toFixed(1)}pp` : "—"}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Quality Score</div>
                <div className="font-bold text-accent">{row.quality_score?.toFixed(1) ?? "—"}</div>
              </div>
              <div>
                <div className="text-text-muted">Momentum %ile</div>
                <div className="font-bold text-blue-400">{row.momentum_pctile?.toFixed(0) ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

function QualityRow({ row, rank }: { row: QualityResult; rank: number }) {
  const [open, setOpen] = useState(false);
  const gmTrendStr = row.gm_trend != null
    ? `${row.gm_trend >= 0 ? "+" : ""}${row.gm_trend.toFixed(1)}pp`
    : "—";

  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-surface-2/40 cursor-pointer transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-3 py-2 text-xs text-text-muted w-8">{rank}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-semibold text-sm text-accent">{row.ticker}</span>
            {row.quality_momentum && (
              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1 rounded font-semibold flex items-center gap-0.5">
                <Zap size={8} /> Q+M
              </span>
            )}
          </div>
          <div className="text-[10px] text-text-muted truncate max-w-[120px]">{row.name}</div>
        </td>
        <td className="px-3 py-2 text-xs text-text-muted hidden xl:table-cell">{row.sector || "—"}</td>
        {/* ROIC */}
        <td className={cn("px-3 py-2 text-xs font-mono tabular-nums font-semibold", metricColor(row.roic))}>
          {num(row.roic)}
        </td>
        {/* ROE */}
        <td className={cn("px-3 py-2 text-xs font-mono tabular-nums", metricColor(row.roe))}>
          {num(row.roe)}
        </td>
        {/* Gross Margin */}
        <td className={cn("px-3 py-2 text-xs font-mono tabular-nums", metricColor(row.gross_margin, true))}>
          {num(row.gross_margin)}
        </td>
        {/* GM Trend */}
        <td className={cn("px-3 py-2 text-xs tabular-nums", (row.gm_trend ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
          {gmTrendStr}
        </td>
        {/* Earnings Growth */}
        <td className={cn("px-3 py-2 text-xs font-mono tabular-nums", growthColor(row.earnings_growth))}>
          {pct(row.earnings_growth)}
        </td>
        {/* FCF Growth */}
        <td className={cn("px-3 py-2 text-xs font-mono tabular-nums", growthColor(row.fcf_growth))}>
          {pct(row.fcf_growth)}
        </td>
        {/* Quality Score */}
        <td className="px-3 py-2">
          <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded tabular-nums", scoreColor(row.quality_score))}>
            {row.quality_score?.toFixed(1) ?? "—"}
          </span>
        </td>
        {/* Momentum */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            <div className="w-14 h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${row.momentum_pctile ?? 0}%` }}
              />
            </div>
            <span className="text-[10px] text-text-muted tabular-nums">
              {row.momentum_pctile?.toFixed(0) ?? "—"}
            </span>
          </div>
        </td>
        {/* Combined */}
        <td className="px-3 py-2">
          <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded tabular-nums", scoreColor(row.combined_score))}>
            {row.combined_score?.toFixed(1) ?? "—"}
          </span>
        </td>
        <td className="px-3 py-2 w-6 text-text-muted">
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </td>
      </tr>
      {open && <ExpandedDetail row={row} />}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QualityPage() {
  const [universe, setUniverse] = useState<Universe>("sp500");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortKey, setSortKey] = useState<keyof QualityResult>("quality_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["quality", universe],
    queryFn: () => api.getQuality(universe, 200),
    staleTime: 1000 * 60 * 60 * 4,
    retry: 1,
  });

  const rows = useMemo(() => {
    if (!data?.results) return [];
    let r = [...data.results];

    if (filter === "quality_mo") r = r.filter(x => x.quality_momentum);
    if (filter === "quality")    r = r.filter(x => (x.quality_score ?? 0) >= 60);
    if (filter === "momentum")   r = r.filter(x => (x.momentum_pctile ?? 0) >= 60);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(x => x.ticker.toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
    }

    r.sort((a, b) => {
      const av = (a[sortKey] as number) ?? -Infinity;
      const bv = (b[sortKey] as number) ?? -Infinity;
      return sortAsc ? av - bv : bv - av;
    });

    return r;
  }, [data, filter, search, sortKey, sortAsc]);

  // Summary stats
  const topQM    = data?.results?.find(r => r.quality_momentum);
  const topROIC  = data?.results?.slice().sort((a, b) => (b.roic ?? -999) - (a.roic ?? -999))[0];
  const topFCF   = data?.results?.slice().sort((a, b) => (b.fcf_growth ?? -999) - (a.fcf_growth ?? -999))[0];
  const topEG    = data?.results?.slice().sort((a, b) => (b.earnings_growth ?? -999) - (a.earnings_growth ?? -999))[0];
  const qmCount  = data?.results?.filter(r => r.quality_momentum).length ?? 0;

  function SortTh({ k, label }: { k: keyof QualityResult; label: string }) {
    const active = sortKey === k;
    return (
      <th
        className={cn(
          "px-3 py-2 text-left text-xs font-medium cursor-pointer select-none whitespace-nowrap",
          active ? "text-accent" : "text-text-muted hover:text-text-primary",
        )}
        onClick={() => { if (active) setSortAsc(a => !a); else { setSortKey(k); setSortAsc(false); } }}
      >
        {label}{active ? (sortAsc ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  const FILTER_TABS: { id: FilterTab; label: string }[] = [
    { id: "all",       label: "All" },
    { id: "quality_mo", label: "Quality + Momentum ★" },
    { id: "quality",   label: "High Quality" },
    { id: "momentum",  label: "High Momentum" },
  ];

  return (
    <div className="p-6 space-y-5 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Gem size={20} className="text-accent" />
            <h1 className="text-xl font-bold text-text-primary">Quality Factor Dashboard</h1>
            {isFetching && !isLoading && (
              <span className="text-xs text-text-muted animate-pulse">refreshing…</span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            ROIC · ROE · Gross Margin Trend · Earnings Growth · FCF Growth — cross-sectional quality scoring
          </p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-border">
          {UNIVERSE_OPTIONS.map(u => (
            <button
              key={u}
              onClick={() => setUniverse(u)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                universe === u ? "bg-accent text-white" : "bg-surface text-text-muted hover:text-text-primary",
              )}
            >
              {u === "sp500" ? "S&P 500" : u === "nasdaq100" ? "Nasdaq 100" : "Watchlist"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard label="Top Q+M Stock" value={topQM?.ticker ?? "—"}
            sub={topQM ? `Combined ${topQM.combined_score?.toFixed(0)}` : undefined} highlight />
          <StatCard label="Highest ROIC" value={topROIC?.ticker ?? "—"}
            sub={topROIC?.roic != null ? `${topROIC.roic.toFixed(1)}%` : undefined} />
          <StatCard label="Best FCF Growth" value={topFCF?.ticker ?? "—"}
            sub={topFCF?.fcf_growth != null ? `+${topFCF.fcf_growth.toFixed(0)}%` : undefined} />
          <StatCard label="Best Earnings Growth" value={topEG?.ticker ?? "—"}
            sub={topEG?.earnings_growth != null ? `+${topEG.earnings_growth.toFixed(0)}%` : undefined} />
          <StatCard label="Quality + Momentum" value={String(qmCount)}
            sub="stocks in sweet spot" accent={qmCount > 0} />
        </div>
      )}

      {/* Charts */}
      {isLoading ? (
        <div className="bg-surface border border-border rounded-lg h-72 flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="text-text-muted animate-pulse text-sm">Computing quality scores…</div>
            <div className="text-xs text-text-muted">
              First load takes 45–90s (fetching ROIC, FCF & GM trend per stock)
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="bg-surface border border-red-500/30 rounded-lg p-6 text-center text-red-400 text-sm">
          Failed to load: {(error as Error).message}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <QMScatter data={data.results} />
          </div>
          <SectorBars sectors={data.sector_quality} />
        </div>
      ) : null}

      {/* Filter tabs + table */}
      {data && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {FILTER_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  filter === t.id
                    ? t.id === "quality_mo"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : "bg-accent/20 text-accent border-accent/40"
                    : "bg-surface text-text-muted border-border hover:text-text-primary",
                )}
              >
                {t.label}
              </button>
            ))}
            <input
              type="text"
              placeholder="Search ticker…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="ml-auto bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent w-36"
            />
            <span className="text-xs text-text-muted">{rows.length} stocks</span>
          </div>

          <div className="bg-surface border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-text-muted w-8">#</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted">Ticker</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted hidden xl:table-cell">Sector</th>
                  <SortTh k="roic" label="ROIC" />
                  <SortTh k="roe" label="ROE" />
                  <SortTh k="gross_margin" label="Gross Mgn" />
                  <SortTh k="gm_trend" label="GM Trend" />
                  <SortTh k="earnings_growth" label="EPS Growth" />
                  <SortTh k="fcf_growth" label="FCF Growth" />
                  <SortTh k="quality_score" label="Quality" />
                  <th className="px-3 py-2 text-left text-xs text-text-muted">Momentum</th>
                  <SortTh k="combined_score" label="Combined" />
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center py-12 text-text-muted text-sm">
                      No stocks match the current filter
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => (
                    <QualityRow key={row.ticker} row={row} rank={i + 1} />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="text-xs text-text-muted flex justify-between flex-wrap gap-2">
            <div>
              Quality Score = 20% ROIC + 20% ROE + 20% Gross Margin Trend + 20% Earnings Growth + 20% FCF Growth (cross-sectional ranks)
            </div>
            <div>
              Combined = 50% Quality + 50% Momentum percentile · Q+M flag: combined ≥70, quality ≥60, momentum ≥60
              · Data: {data.as_of} · Cached 24h
            </div>
          </div>
        </>
      )}
    </div>
  );
}
