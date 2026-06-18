"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, BarChart, Bar,
} from "recharts";
import { api, DriftResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Milestone, Star, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";

// ── Constants ─────────────────────────────────────────────────────────────────

const UNIVERSE_OPTIONS = ["sp500", "nasdaq100", "watchlist"] as const;
type Universe = (typeof UNIVERSE_OPTIONS)[number];

type DayTab = "all" | "recent" | "mid" | "extended";

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
const DEFAULT_COLOR = "#6b7280";

function sectorColor(s: string) {
  return SECTOR_COLORS[s] ?? DEFAULT_COLOR;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, digits = 1, suffix = "%"): string {
  if (v == null) return "—";
  const s = v.toFixed(digits);
  return v > 0 ? `+${s}${suffix}` : `${s}${suffix}`;
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(1);
}

function driftColor(v: number | null | undefined): string {
  if (v == null) return "text-text-muted";
  if (v >= 10) return "text-green-400";
  if (v >= 3)  return "text-green-300";
  if (v >= 0)  return "text-text-primary";
  if (v >= -3) return "text-red-300";
  return "text-red-400";
}

function surpriseColor(v: number | null | undefined): string {
  if (v == null) return "text-text-muted";
  if (v >= 10) return "text-emerald-400";
  if (v >= 5)  return "text-green-300";
  if (v >= 0)  return "text-text-primary";
  return "text-red-400";
}

function scoreColor(v: number | null | undefined): string {
  if (v == null) return "bg-surface-2 text-text-muted";
  if (v >= 75)  return "bg-emerald-500/20 text-emerald-400";
  if (v >= 55)  return "bg-green-500/15 text-green-400";
  if (v >= 35)  return "bg-yellow-500/10 text-yellow-400";
  return "bg-red-500/10 text-red-400";
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={cn(
      "bg-surface border border-border rounded-lg px-4 py-3 flex flex-col gap-0.5",
      highlight && "border-emerald-500/40",
    )}>
      <span className="text-xs text-text-muted">{label}</span>
      <span className={cn("text-lg font-bold", highlight ? "text-emerald-400" : "text-text-primary")}>
        {value}
      </span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

// ── Scatter chart ─────────────────────────────────────────────────────────────

interface ScatterPoint {
  x: number;
  y: number;
  ticker: string;
  sector: string;
  pead_score: number;
  sweet_spot: boolean;
}

function ScatterTooltipContent({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as ScatterPoint;
  return (
    <div className="bg-surface-2 border border-border rounded p-2 text-xs space-y-0.5">
      <div className="font-semibold text-text-primary">{d.ticker}</div>
      <div className="text-text-muted">{d.sector}</div>
      <div>EPS Surprise: <span className="text-emerald-400">{d.x > 0 ? "+" : ""}{d.x.toFixed(1)}%</span></div>
      <div>Current Drift: <span className={d.y >= 0 ? "text-green-400" : "text-red-400"}>{d.y >= 0 ? "+" : ""}{d.y.toFixed(1)}%</span></div>
      <div>PEAD Score: <span className="text-accent">{d.pead_score?.toFixed(1)}</span></div>
      {d.sweet_spot && <div className="text-emerald-400 font-semibold">★ Sweet Spot</div>}
    </div>
  );
}

function PEADScatter({ data }: { data: DriftResult[] }) {
  const points: ScatterPoint[] = data
    .filter(r => r.eps_surprise_pct != null && r.drift_current != null)
    .map(r => ({
      x: r.eps_surprise_pct!,
      y: r.drift_current!,
      ticker: r.ticker,
      sector: r.sector,
      pead_score: r.pead_score ?? 0,
      sweet_spot: r.sweet_spot,
    }));

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-text-primary">EPS Surprise vs Post-Earnings Drift</span>
        <span className="text-xs text-text-muted ml-auto">bubble = PEAD score</span>
      </div>
      {/* Quadrant labels */}
      <div className="relative">
        <div className="absolute top-1 right-2 text-xs text-emerald-400/60 font-medium z-10">PEAD Leaders ↗</div>
        <div className="absolute top-1 left-14 text-xs text-yellow-400/60 font-medium z-10">↗ Fading Surprises</div>
        <div className="absolute bottom-8 right-2 text-xs text-orange-400/60 font-medium z-10">Lagging ↘</div>
        <div className="absolute bottom-8 left-14 text-xs text-red-400/60 font-medium z-10">Miss + Drift ↘</div>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              type="number" dataKey="x" name="EPS Surprise %"
              label={{ value: "EPS Surprise %", position: "insideBottom", offset: -10, fill: "#64748b", fontSize: 11 }}
              tick={{ fill: "#64748b", fontSize: 10 }} domain={["auto", "auto"]}
            />
            <YAxis
              type="number" dataKey="y" name="Current Drift %"
              label={{ value: "Drift %", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }}
              tick={{ fill: "#64748b", fontSize: 10 }} domain={["auto", "auto"]}
            />
            <Tooltip content={<ScatterTooltipContent />} />
            <ReferenceLine x={0} stroke="#334155" strokeDasharray="4 4" />
            <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" />
            <Scatter data={points} isAnimationActive={false}>
              {points.map((p, i) => (
                <Cell
                  key={i}
                  fill={sectorColor(p.sector)}
                  fillOpacity={p.sweet_spot ? 1 : 0.65}
                  stroke={p.sweet_spot ? "#10b981" : "transparent"}
                  strokeWidth={p.sweet_spot ? 2 : 0}
                  r={Math.max(4, Math.min(10, (p.pead_score / 100) * 10))}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {/* Sector legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {Object.entries(SECTOR_COLORS).map(([s, c]) => (
          <div key={s} className="flex items-center gap-1 text-xs text-text-muted">
            <div className="w-2 h-2 rounded-full" style={{ background: c }} />
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Drift bar sparkline ───────────────────────────────────────────────────────

function DriftBars({ row }: { row: DriftResult }) {
  const vals = [
    { label: "5d",  v: row.drift_5d },
    { label: "21d", v: row.drift_21d },
    { label: "63d", v: row.drift_63d },
    { label: "Now", v: row.drift_current },
  ];
  return (
    <div className="flex items-end gap-0.5 h-6">
      {vals.map(({ label, v }) => {
        const pct = Math.min(Math.abs(v ?? 0) / 30, 1);
        const h = Math.max(2, Math.round(pct * 20));
        const color = v == null ? "#374151" : v >= 0 ? "#10b981" : "#ef4444";
        return (
          <div key={label} className="flex flex-col items-center gap-0.5" title={`${label}: ${v != null ? fmt(v) : "—"}`}>
            <div style={{ width: 6, height: h, background: color, borderRadius: 1 }} />
          </div>
        );
      })}
    </div>
  );
}

// ── Expanded row detail ───────────────────────────────────────────────────────

function ExpandedDetail({ row }: { row: DriftResult }) {
  const driftData = [
    { name: "5d",   value: row.drift_5d },
    { name: "21d",  value: row.drift_21d },
    { name: "63d",  value: row.drift_63d },
    { name: "126d", value: row.drift_126d },
    { name: "Now",  value: row.drift_current },
  ].filter(d => d.value != null);

  return (
    <tr>
      <td colSpan={13} className="px-4 pb-4 pt-0 bg-surface-2/40">
        <div className="grid grid-cols-2 gap-4 pt-3">
          {/* Drift chart */}
          <div>
            <div className="text-xs text-text-muted mb-2">Post-Earnings Drift Timeline</div>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={driftData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  formatter={(v: any) => [`${(v as number) >= 0 ? "+" : ""}${(v as number).toFixed(1)}%`, "Drift"]}
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 11 }}
                />
                <ReferenceLine y={0} stroke="#334155" />
                <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {driftData.map((d, i) => (
                    <Cell key={i} fill={(d.value ?? 0) >= 0 ? "#10b981" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="space-y-1">
              <div className="text-text-muted">EPS Actual</div>
              <div className="font-semibold">{row.eps_actual != null ? `$${row.eps_actual.toFixed(2)}` : "—"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-text-muted">EPS Estimate</div>
              <div className="font-semibold">{row.eps_estimate != null ? `$${row.eps_estimate.toFixed(2)}` : "—"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-text-muted">Rev Growth YoY</div>
              <div className={cn("font-semibold", (row.rev_growth_yoy ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
                {fmt(row.rev_growth_yoy)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-text-muted">Days Since Earnings</div>
              <div className="font-semibold">{row.days_since}d</div>
            </div>
            <div className="space-y-1">
              <div className="text-text-muted">Revisions Up (30d)</div>
              <div className="font-semibold text-green-400">{row.revisions_up}</div>
            </div>
            <div className="space-y-1">
              <div className="text-text-muted">Revisions Down (30d)</div>
              <div className="font-semibold text-red-400">{row.revisions_down}</div>
            </div>
            <div className="space-y-1">
              <div className="text-text-muted">Drift 5d</div>
              <div className={cn("font-semibold", driftColor(row.drift_5d))}>{fmt(row.drift_5d)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-text-muted">Drift 126d</div>
              <div className={cn("font-semibold", driftColor(row.drift_126d))}>{fmt(row.drift_126d)}</div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

function DriftRow({ row, rank }: { row: DriftResult; rank: number }) {
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);

  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-surface-2/40 cursor-pointer transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-3 py-2 text-xs text-text-muted w-8">{rank}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-semibold text-sm text-accent" onClick={e => { e.stopPropagation(); setDrawer({ fetchUrl: `/api/chart/stock/${row.ticker}`, color: "#6366f1" }); }}>{row.ticker}</span>
            {row.sweet_spot && (
              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1 rounded font-semibold">
                SWEET SPOT
              </span>
            )}
          </div>
          <div className="text-[10px] text-text-muted truncate max-w-[120px]">{row.name}</div>
        </td>
        <td className="px-3 py-2 text-xs text-text-muted hidden xl:table-cell">{row.sector || "—"}</td>
        <td className="px-3 py-2 text-xs text-text-muted">
          <div>{row.earn_date}</div>
          <div className="text-[10px]">{row.days_since}d ago</div>
        </td>
        <td className={cn("px-3 py-2 text-xs font-semibold tabular-nums", surpriseColor(row.eps_surprise_pct))}>
          {fmt(row.eps_surprise_pct)}
        </td>
        <td className={cn("px-3 py-2 text-xs font-mono tabular-nums", (row.rev_growth_yoy ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
          {fmt(row.rev_growth_yoy)}
        </td>
        <td className="px-3 py-2">
          <DriftBars row={row} />
        </td>
        <td className={cn("px-3 py-2 text-xs font-mono tabular-nums font-semibold", driftColor(row.drift_current))}>
          {fmt(row.drift_current)}
        </td>
        <td className="px-3 py-2 text-xs tabular-nums">
          <span className="text-green-400">↑{row.revisions_up}</span>
          <span className="text-text-muted mx-0.5">/</span>
          <span className="text-red-400">↓{row.revisions_down}</span>
        </td>
        <td className="px-3 py-2">
          <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded tabular-nums", scoreColor(row.pead_score))}>
            {row.pead_score?.toFixed(1) ?? "—"}
          </span>
        </td>
        <td className="px-3 py-2 w-6 text-text-muted">
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </td>
      </tr>
      {open && <ExpandedDetail row={row} />}
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EarningsDriftPage() {
  const [universe, setUniverse] = useState<Universe>("sp500");
  const [tab, setTab] = useState<DayTab>("all");
  const [sweetOnly, setSweetOnly] = useState(false);
  const [sortKey, setSortKey] = useState<keyof DriftResult>("pead_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["earnings-drift", universe],
    queryFn: () => api.getEarningsDrift(universe, 200),
    staleTime: 1000 * 60 * 60 * 4, // 4h
    retry: 1,
  });

  const rows = useMemo(() => {
    if (!data?.results) return [];
    let r = [...data.results];

    // Day tab filter
    if (tab === "recent")   r = r.filter(x => x.days_since <= 30);
    if (tab === "mid")      r = r.filter(x => x.days_since > 30 && x.days_since <= 90);
    if (tab === "extended") r = r.filter(x => x.days_since > 90 && x.days_since <= 180);

    if (sweetOnly) r = r.filter(x => x.sweet_spot);

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
  }, [data, tab, sweetOnly, search, sortKey, sortAsc]);

  // Summary stats
  const leader    = data?.results?.[0];
  const bigSurp   = data?.results?.slice().sort((a, b) => (b.eps_surprise_pct ?? -999) - (a.eps_surprise_pct ?? -999))[0];
  const bigDrift  = data?.results?.slice().sort((a, b) => (b.drift_current ?? -999) - (a.drift_current ?? -999))[0];
  const mostUpg   = data?.results?.slice().sort((a, b) => b.revisions_up - a.revisions_up)[0];
  const sweetCount = data?.results?.filter(r => r.sweet_spot).length ?? 0;

  function SortTh({ k, label }: { k: keyof DriftResult; label: string }) {
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

  return (
    <div className="p-6 space-y-5 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Milestone size={20} className="text-accent" />
            <h1 className="text-xl font-bold text-text-primary">Earnings Drift / PEAD</h1>
            {isFetching && !isLoading && (
              <span className="text-xs text-text-muted animate-pulse">refreshing…</span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Post-Earnings Announcement Drift — stocks with large positive surprises tend to continue higher for 3–6 months
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Universe */}
          <div className="flex rounded-lg overflow-hidden border border-border">
            {UNIVERSE_OPTIONS.map(u => (
              <button
                key={u}
                onClick={() => setUniverse(u)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  universe === u
                    ? "bg-accent text-white"
                    : "bg-surface text-text-muted hover:text-text-primary",
                )}
              >
                {u === "sp500" ? "S&P 500" : u === "nasdaq100" ? "Nasdaq 100" : "Watchlist"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSweetOnly(s => !s)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              sweetOnly
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                : "bg-surface text-text-muted border-border hover:text-text-primary",
            )}
          >
            <Star size={11} /> Sweet Spots Only
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
          <StatCard label="PEAD Leader" value={leader?.ticker ?? "—"}
            sub={leader ? `Score ${leader.pead_score?.toFixed(0)}` : undefined} highlight />
          <StatCard label="Biggest Surprise" value={leader && bigSurp ? bigSurp.ticker : "—"}
            sub={bigSurp ? `+${bigSurp.eps_surprise_pct?.toFixed(1)}%` : undefined} />
          <StatCard label="Strongest Drift" value={bigDrift?.ticker ?? "—"}
            sub={bigDrift ? fmt(bigDrift.drift_current) : undefined} />
          <StatCard label="Most Upgraded" value={mostUpg?.ticker ?? "—"}
            sub={mostUpg ? `↑${mostUpg.revisions_up} analysts` : undefined} />
          <StatCard label="Sweet Spots" value={String(sweetCount)}
            sub={`of ${data.computed} stocks`} highlight={sweetCount > 0} />
        </div>
      )}

      {/* Scatter plot */}
      {isLoading ? (
        <div className="bg-surface border border-border rounded-lg h-80 flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="text-text-muted animate-pulse text-sm">Loading PEAD data…</div>
            <div className="text-xs text-text-muted">First load takes 30–60s (fetching earnings + prices)</div>
          </div>
        </div>
      ) : error ? (
        <div className="bg-surface border border-red-500/30 rounded-lg p-6 text-center text-red-400 text-sm">
          Failed to load: {(error as Error).message}
        </div>
      ) : data ? (
        <PEADScatter data={rows} />
      ) : null}

      {/* Day tabs */}
      {data && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "recent", "mid", "extended"] as DayTab[]).map(t => {
              const labels: Record<DayTab, string> = {
                all: "All",
                recent: "Recent (0–30d)",
                mid: "Mid (30–90d)",
                extended: "Extended (90–180d)",
              };
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    tab === t
                      ? "bg-accent/20 text-accent border-accent/40"
                      : "bg-surface text-text-muted border-border hover:text-text-primary",
                  )}
                >
                  {labels[t]}
                </button>
              );
            })}
            <input
              type="text"
              placeholder="Search ticker…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="ml-auto bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent w-36"
            />
            <span className="text-xs text-text-muted">{rows.length} stocks</span>
          </div>

          {/* Table */}
          <div className="bg-surface border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-text-muted w-8">#</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted">Ticker</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted hidden xl:table-cell">Sector</th>
                  <th className="px-3 py-2 text-left text-xs text-text-muted">Earn Date</th>
                  <SortTh k="eps_surprise_pct" label="EPS Surp%" />
                  <SortTh k="rev_growth_yoy" label="Rev Growth YoY" />
                  <th className="px-3 py-2 text-left text-xs text-text-muted">Drift Timeline</th>
                  <SortTh k="drift_current" label="Current Drift" />
                  <th className="px-3 py-2 text-left text-xs text-text-muted">Rev ↑/↓</th>
                  <SortTh k="pead_score" label="PEAD Score" />
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-text-muted text-sm">
                      No stocks match the current filter
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => (
                    <DriftRow key={row.ticker} row={row} rank={i + 1} />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="text-xs text-text-muted flex justify-between flex-wrap gap-2">
            <div>
              PEAD Score = 40% EPS Surprise rank + 30% Drift rank + 20% Net Revisions rank + 10% Rev Growth rank
            </div>
            <div>
              Sweet Spot = 20–90d since earnings, surprise ≥5%, positive drift, more revisions up than down
              · Data: {data.as_of} · Cached 24h
            </div>
          </div>
        </>
      )}
    </div>
  );
}
