"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, Radar,
} from "recharts";
import {
  RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle,
  Activity, Shield, Zap, BarChart2, Globe, Target,
} from "lucide-react";
import { api, type BreadthHistoryPoint, type BreadthSector, type BreadthSignal, type BreadthSnapshotFull } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt   = (v: number | null | undefined, dec = 1) =>
  v == null ? "—" : `${(v * 100).toFixed(dec)}%`;
const fmtN  = (v: number | null | undefined, dec = 1) =>
  v == null ? "—" : v.toFixed(dec);
const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const pcolor = (v: number | null | undefined, lo = 0.4, hi = 0.65) => {
  if (v == null) return "#6b6b80";
  if (v >= hi)  return "#22c55e";
  if (v >= lo)  return "#eab308";
  return "#ef4444";
};

const GRADE_COLORS: Record<string, string> = {
  Green:  "#22c55e",
  Yellow: "#eab308",
  Orange: "#f97316",
  Red:    "#ef4444",
};

const REGIME_COLORS: Record<string, string> = {
  "Strong Bull": "#22c55e",
  "Bull":        "#84cc16",
  "Early Bull":  "#a3e635",
  "Sideways":    "#eab308",
  "Early Bear":  "#f97316",
  "Bear":        "#ef4444",
  "Crisis":      "#7f1d1d",
};

const SIGNAL_COLORS: Record<string, string> = {
  bullish: "#22c55e",
  bearish: "#ef4444",
  neutral: "#6b6b80",
};

const PERIODS: { label: string; key: keyof BreadthHistoryPoint }[] = [
  { label: "% > 20 MA",    key: "ma20" },
  { label: "% > 50 MA",    key: "ma50" },
  { label: "% > 100 MA",   key: "ma100" },
  { label: "% > 200 MA",   key: "ma200" },
  { label: "McClellan",    key: "mcclellan" },
  { label: "A/D Ratio",    key: "ad_ratio" },
  { label: "Net New Highs",key: "new_highs_net" },
  { label: "Breadth Thrust", key: "breadth_thrust" },
];

const PERIOD_COLORS: Record<string, string> = {
  ma20:          "#6366f1",
  ma50:          "#22c55e",
  ma100:         "#84cc16",
  ma200:         "#f59e0b",
  mcclellan:     "#a78bfa",
  ad_ratio:      "#22d3ee",
  new_highs_net: "#f97316",
  breadth_thrust:"#ec4899",
};

// ── sub-components ────────────────────────────────────────────────────────────

function ScoreRing({ score, color, size = 80 }: { score: number; color: string; size?: number }) {
  const r = (size / 2) - 6;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e1e2e" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}

function MetricCard({ label, value, color, bar, sub }: {
  label: string; value: string; color: string; bar?: number; sub?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3 space-y-1.5">
      <div className="text-[10px] text-text-muted uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold font-mono" style={{ color }}>{value}</div>
      {bar != null && (
        <div className="h-1 rounded-full bg-surface-2">
          <div className="h-1 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%`, backgroundColor: color }} />
        </div>
      )}
      {sub && <div className="text-[10px] text-text-muted">{sub}</div>}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-xs rounded transition-colors whitespace-nowrap",
        active ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
      )}
    >
      {children}
    </button>
  );
}

// ── History Chart ─────────────────────────────────────────────────────────────

const YEAR_FMT = new Intl.DateTimeFormat("en-US", { year: "numeric" });
const MON_FMT  = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });

function HistoryChart({
  data,
  metrics,
  height = 220,
}: {
  data: BreadthHistoryPoint[];
  metrics: (keyof BreadthHistoryPoint)[];
  height?: number;
}) {
  const isLong = data.length > 80;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#6b6b80", fontSize: 9 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          minTickGap={isLong ? 60 : 48}
          tickFormatter={(d) => isLong ? YEAR_FMT.format(new Date(d)) : MON_FMT.format(new Date(d))}
        />
        <YAxis tick={{ fill: "#6b6b80", fontSize: 9 }} axisLine={{ stroke: "#2a2a38" }} tickLine={false} tickFormatter={(v) => v.toFixed(1)} />
        <ReferenceLine y={0} stroke="#3a3a50" />
        <Tooltip
          contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 10 }}
          formatter={(val: number, name: string) => [val?.toFixed(3) ?? "—", name]}
          labelFormatter={(l) => isLong ? YEAR_FMT.format(new Date(l)) : MON_FMT.format(new Date(l))}
        />
        {metrics.map((m) => (
          <Line
            key={m}
            type="monotone"
            dataKey={m}
            stroke={PERIOD_COLORS[m] ?? "#6b6b80"}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            name={m}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── McClellan Chart (dual panel) ──────────────────────────────────────────────

function McclellanChart({ data }: { data: BreadthHistoryPoint[] }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] text-text-muted mb-1">McClellan Oscillator</div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data} margin={{ top: 2, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="date" tick={false} axisLine={{ stroke: "#2a2a38" }} />
            <YAxis tick={{ fill: "#6b6b80", fontSize: 9 }} axisLine={{ stroke: "#2a2a38" }} tickLine={false} />
            <ReferenceLine y={0} stroke="#3a3a50" />
            <Tooltip
              contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 10 }}
              formatter={(v: number) => [v?.toFixed(1), "McClellan"]}
            />
            <Bar dataKey="mcclellan" name="McClellan" radius={0}>
              {data.map((d, i) => (
                <Cell key={i} fill={(d.mcclellan ?? 0) >= 0 ? "#22c55e" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <div className="text-[10px] text-text-muted mb-1">Summation Index</div>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data} margin={{ top: 2, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="date" tick={{ fill: "#6b6b80", fontSize: 9 }} axisLine={{ stroke: "#2a2a38" }} tickLine={false}
              tickFormatter={(d) => YEAR_FMT.format(new Date(d))} minTickGap={60} />
            <YAxis tick={{ fill: "#6b6b80", fontSize: 9 }} axisLine={{ stroke: "#2a2a38" }} tickLine={false} />
            <ReferenceLine y={0} stroke="#3a3a50" />
            <Tooltip contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 10 }}
              formatter={(v: number) => [v?.toFixed(0), "Summation"]} />
            <Line type="monotone" dataKey="summation" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Sector Table ──────────────────────────────────────────────────────────────

const RATING_COLORS: Record<string, string> = {
  "Strong Buy":  "#22c55e",
  "Buy":         "#84cc16",
  "Neutral":     "#6b6b80",
  "Avoid":       "#f97316",
  "Strong Sell": "#ef4444",
};

function SectorTable({ sectors }: { sectors: BreadthSector[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted border-b border-border">
            {["Sector", "Rating", "Score", "% > 50MA", "% > 200MA", "RS 1M", "RS 3M", "N"].map((h) => (
              <th key={h} className="text-left py-1.5 pr-3 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sectors.map((s) => (
            <tr key={s.sector} className="border-b border-border/30 hover:bg-surface-2/50">
              <td className="py-1.5 pr-3 font-medium text-text-primary truncate max-w-[140px]">{s.sector}</td>
              <td className="py-1.5 pr-3">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ color: RATING_COLORS[s.rating] ?? "#6b6b80", background: `${RATING_COLORS[s.rating] ?? "#6b6b80"}18` }}>
                  {s.rating}
                </span>
              </td>
              <td className="py-1.5 pr-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1 rounded-full bg-surface-2">
                    <div className="h-1 rounded-full" style={{ width: `${s.breadth_score}%`, backgroundColor: pcolor(s.breadth_score / 100) }} />
                  </div>
                  <span className="font-mono text-text-primary">{s.breadth_score.toFixed(0)}</span>
                </div>
              </td>
              <td className="py-1.5 pr-3 font-mono" style={{ color: pcolor(s.above_50ma) }}>{fmt(s.above_50ma, 0)}</td>
              <td className="py-1.5 pr-3 font-mono" style={{ color: pcolor(s.above_200ma) }}>{fmt(s.above_200ma, 0)}</td>
              <td className={cn("py-1.5 pr-3 font-mono", s.rs_1m != null && s.rs_1m >= 0 ? "text-emerald-400" : "text-red-400")}>
                {fmtPct(s.rs_1m)}
              </td>
              <td className={cn("py-1.5 pr-3 font-mono", s.rs_3m != null && s.rs_3m >= 0 ? "text-emerald-400" : "text-red-400")}>
                {fmtPct(s.rs_3m)}
              </td>
              <td className="py-1.5 pr-3 font-mono text-text-muted">{s.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Regime Probability Bar ────────────────────────────────────────────────────

const REGIME_LABELS: Record<string, string> = {
  strong_bull: "Strong Bull",
  bull:        "Bull",
  early_bull:  "Early Bull",
  sideways:    "Sideways",
  early_bear:  "Early Bear",
  bear:        "Bear",
  crisis:      "Crisis",
};

function RegimeProbabilities({ probs }: { probs: Record<string, number> }) {
  return (
    <div className="space-y-1.5">
      {Object.entries(probs).map(([key, prob]) => {
        const label  = REGIME_LABELS[key] ?? key;
        const color  = REGIME_COLORS[label] ?? "#6b6b80";
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted w-20 shrink-0">{label}</span>
            <div className="flex-1 h-2 rounded-full bg-surface-2">
              <div className="h-2 rounded-full transition-all" style={{ width: `${prob * 100}%`, backgroundColor: color }} />
            </div>
            <span className="text-[10px] font-mono text-text-muted w-8 text-right">{(prob * 100).toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Signal Card ───────────────────────────────────────────────────────────────

function SignalCard({ s }: { s: BreadthSignal }) {
  const color = SIGNAL_COLORS[s.type];
  return (
    <div className="rounded-lg border border-border bg-surface p-3.5 space-y-2" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {s.type === "bullish" ? <TrendingUp size={13} style={{ color }} /> :
           s.type === "bearish" ? <TrendingDown size={13} style={{ color }} /> :
           <Minus size={13} style={{ color }} />}
          <span className="text-sm font-semibold" style={{ color }}>{s.name}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-text-muted">
          {s.historical_win_rate != null && (
            <span>Win: <span className="text-emerald-400 font-mono">{(s.historical_win_rate * 100).toFixed(0)}%</span></span>
          )}
          <span>R/R: <span className="font-mono text-text-primary">{s.risk_reward}</span></span>
          <span className="flex items-center gap-0.5">
            Strength:
            <span className="font-mono text-text-primary ml-1">{(s.strength * 100).toFixed(0)}%</span>
          </span>
        </div>
      </div>
      <p className="text-xs text-text-muted">{s.description}</p>
      <div className="text-xs font-medium text-text-primary border-t border-border/50 pt-2">
        ↳ {s.action}
      </div>
    </div>
  );
}

// ── Radar / Spider for component scores ──────────────────────────────────────

function HealthRadar({ components }: { components: Record<string, { score: number; weight: number }> }) {
  const data = Object.entries(components).map(([k, v]) => ({
    label:  k.charAt(0).toUpperCase() + k.slice(1),
    score:  v.score,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <PolarGrid stroke="#2a2a38" />
        <PolarAngleAxis dataKey="label" tick={{ fill: "#6b6b80", fontSize: 10 }} />
        <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
        <Tooltip contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 10 }}
          formatter={(v: number) => [`${v.toFixed(1)}/100`, "Score"]} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Breadth", "McClellan", "Sectors", "Risk & Liquidity", "Signals"] as const;
type Tab = typeof TABS[number];

const UNIVERSES = [
  { value: "sp500",  label: "S&P 500" },
  { value: "sp1500", label: "S&P 1500" },
];

export default function BreadthPage() {
  const [tab,      setTab]      = useState<Tab>("Overview");
  const [universe, setUniverse] = useState("sp500");
  const [chartMetrics, setChartMetrics] = useState<(keyof BreadthHistoryPoint)[]>(["ma50", "ma200"]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey:        ["breadth-dashboard", universe],
    queryFn:         () => api.getBreadthDashboard(universe),
    staleTime:       25 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });

  const snap    = data?.snapshot;
  const health  = data?.market_health;
  const regime  = data?.regime;
  const risk    = data?.risk;
  const history = data?.history ?? [];

  const gradeColor = health ? GRADE_COLORS[health.grade] ?? "#6b6b80" : "#6b6b80";

  // Toggles for chart metrics
  function toggleMetric(key: keyof BreadthHistoryPoint) {
    setChartMetrics((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  }

  return (
    <div className="space-y-4 max-w-screen-2xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base font-semibold">Market Breadth Intelligence</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {data ? `${data.n_stocks} stocks · as of ${data.as_of ?? "—"}` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {UNIVERSES.map((u) => (
            <button key={u.value} onClick={() => setUniverse(u.value)}
              className={cn("px-2.5 py-1 rounded text-xs transition-colors",
                universe === u.value ? "bg-accent text-white" : "bg-surface border border-border text-text-muted hover:text-text-primary")}
            >{u.label}</button>
          ))}
          <button onClick={() => refetch()} disabled={isFetching}
            className="p-1.5 rounded bg-surface border border-border text-text-muted hover:text-text-primary disabled:opacity-50">
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24 gap-2 text-text-muted text-sm">
          <RefreshCw size={14} className="animate-spin" /> Computing breadth intelligence…
        </div>
      )}

      {data && (
        <>
          {/* ── Top KPIs ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Market Health Score */}
            <div className="bg-surface border border-border rounded-xl p-4 col-span-2 lg:col-span-1">
              <div className="text-[10px] text-text-muted uppercase tracking-wide mb-2">Market Health Score</div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <ScoreRing score={health?.composite_score ?? 50} color={gradeColor} size={72} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold font-mono" style={{ color: gradeColor }}>
                      {health?.composite_score?.toFixed(0) ?? "—"}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-lg font-bold" style={{ color: gradeColor }}>{health?.grade}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">out of 100</div>
                  {data.divergences.length > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-yellow-500 mt-1.5">
                      <AlertTriangle size={9} />
                      {data.divergences.length} divergence{data.divergences.length > 1 ? "s" : ""} detected
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Regime */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="text-[10px] text-text-muted uppercase tracking-wide mb-2">Market Regime</div>
              <div className="text-xl font-bold mb-0.5" style={{ color: REGIME_COLORS[regime?.state ?? ""] ?? "#6b6b80" }}>
                {regime?.state ?? "—"}
              </div>
              <div className="text-[10px] text-text-muted leading-relaxed">{regime?.description}</div>
              <div className="mt-2 flex gap-2 text-[10px]">
                {Object.entries(regime?.expected_returns ?? {}).map(([k, v]) => (
                  <span key={k} className={cn("font-mono", (v as number) >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {k}: {fmtPct(v as number)}
                  </span>
                ))}
              </div>
            </div>

            {/* Hindenburg / Zweig */}
            <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
              <div className="text-[10px] text-text-muted uppercase tracking-wide">Special Indicators</div>
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", data.hindenburg.active ? "bg-red-500 animate-pulse" : "bg-surface-2")} />
                <span className="text-xs text-text-primary">Hindenburg Omen</span>
                <span className={cn("text-[10px] font-medium", data.hindenburg.active ? "text-red-400" : "text-text-muted")}>
                  {data.hindenburg.active ? "ACTIVE" : data.hindenburg.last_signal ? `last: ${data.hindenburg.last_signal}` : "Not active"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", (data.zweig.current_thrust ?? 0) > 0.615 ? "bg-green-500 animate-pulse" : "bg-surface-2")} />
                <span className="text-xs text-text-primary">Zweig Thrust</span>
                <span className="text-[10px] font-mono text-accent">{fmt(data.zweig.current_thrust)}</span>
              </div>
              {data.zweig.last_signal && (
                <div className="text-[10px] text-text-muted">Last Zweig signal: {data.zweig.last_signal}</div>
              )}
            </div>

            {/* VIX & Risk */}
            <div className="bg-surface border border-border rounded-xl p-4 space-y-1.5">
              <div className="text-[10px] text-text-muted uppercase tracking-wide">Liquidity & Risk</div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">VIX</span>
                <span className="text-sm font-mono font-semibold" style={{ color: (risk?.vix ?? 18) > 25 ? "#ef4444" : (risk?.vix ?? 18) > 18 ? "#eab308" : "#22c55e" }}>
                  {risk?.vix?.toFixed(1) ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Credit Stress</span>
                <span className="text-xs font-medium" style={{ color: { Low: "#22c55e", Moderate: "#eab308", High: "#f97316", Extreme: "#ef4444", Unknown: "#6b6b80" }[risk?.credit_stress ?? "Unknown"] }}>
                  {risk?.credit_stress}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Crash Prob</span>
                <span className="text-xs font-mono text-text-primary">{(( risk?.crash_probability ?? 0) * 100).toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Risk Score</span>
                <span className="text-xs font-mono" style={{ color: (risk?.market_risk_score ?? 50) > 60 ? "#ef4444" : "#eab308" }}>
                  {risk?.market_risk_score?.toFixed(0) ?? "—"}/100
                </span>
              </div>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-1 border-b border-border pb-0 overflow-x-auto">
            {TABS.map((t) => (
              <TabBtn key={t} active={tab === t} onClick={() => setTab(t)}>{t}</TabBtn>
            ))}
          </div>

          {/* ────────── OVERVIEW TAB ────────── */}
          {tab === "Overview" && (
            <div className="space-y-4">
              {/* Composite component breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border bg-surface p-4">
                  <div className="text-sm font-medium mb-3">Health Score Breakdown</div>
                  {health && (
                    <div className="space-y-2">
                      {Object.entries(health.components).map(([key, comp]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-xs text-text-muted w-20 capitalize">{key}</span>
                          <div className="flex-1 h-2 rounded-full bg-surface-2">
                            <div className="h-2 rounded-full transition-all" style={{
                              width: `${comp.score}%`,
                              backgroundColor: comp.score >= 70 ? "#22c55e" : comp.score >= 50 ? "#eab308" : "#ef4444"
                            }} />
                          </div>
                          <span className="text-xs font-mono text-text-primary w-10 text-right">{comp.score.toFixed(0)}</span>
                          <span className="text-[10px] text-text-muted w-6">{comp.weight}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {health && (
                  <div className="rounded-lg border border-border bg-surface p-4">
                    <div className="text-sm font-medium mb-1">Radar</div>
                    <HealthRadar components={health.components} />
                  </div>
                )}
              </div>

              {/* Regime probabilities */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-3">Regime Probability Matrix</div>
                {regime?.probabilities && <RegimeProbabilities probs={regime.probabilities} />}
              </div>

              {/* Divergences */}
              {data.divergences.length > 0 && (
                <div className="rounded-lg border border-border bg-surface p-4">
                  <div className="text-sm font-medium mb-3 flex items-center gap-2">
                    <AlertTriangle size={13} className="text-yellow-500" />
                    Divergence Alerts
                  </div>
                  <div className="space-y-2">
                    {data.divergences.map((d, i) => (
                      <div key={i} className={cn(
                        "flex items-start gap-3 p-2.5 rounded border text-xs",
                        d.type === "Bearish" ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/30 bg-emerald-500/5"
                      )}>
                        <span className={cn("font-semibold shrink-0 mt-0.5", d.type === "Bearish" ? "text-red-400" : "text-emerald-400")}>
                          {d.type}
                        </span>
                        <div>
                          <div className="text-[10px] text-text-muted mb-0.5">{d.severity}</div>
                          <div className="text-text-primary">{d.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key breadth snapshot */}
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                <MetricCard label="Above 20 MA"  value={fmt(snap?.pct_above_20ma, 0)}  color={pcolor(snap?.pct_above_20ma)}  bar={snap?.pct_above_20ma  ?? undefined} />
                <MetricCard label="Above 50 MA"  value={fmt(snap?.pct_above_50ma, 0)}  color={pcolor(snap?.pct_above_50ma)}  bar={snap?.pct_above_50ma  ?? undefined} />
                <MetricCard label="Above 100 MA" value={fmt(snap?.pct_above_100ma, 0)} color={pcolor(snap?.pct_above_100ma)} bar={snap?.pct_above_100ma ?? undefined} />
                <MetricCard label="Above 200 MA" value={fmt(snap?.pct_above_200ma, 0)} color={pcolor(snap?.pct_above_200ma)} bar={snap?.pct_above_200ma ?? undefined} />
                <MetricCard label="McClellan"    value={fmtN(snap?.mcclellan, 0)}       color={(snap?.mcclellan ?? 0) >= 0 ? "#22c55e" : "#ef4444"} />
                <MetricCard label="BPI"          value={fmt(snap?.bpi, 0)}              color={pcolor(snap?.bpi)}           bar={snap?.bpi ?? undefined} sub="% > 50 MA proxy" />
              </div>

              {/* Quick MA breadth chart */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-3">MA Breadth History</div>
                {history.length > 0 && <HistoryChart data={history} metrics={["ma20", "ma50", "ma100", "ma200"]} height={200} />}
                <div className="mt-2 flex gap-4 text-[10px] flex-wrap">
                  {(["ma20", "ma50", "ma100", "ma200"] as const).map((k) => (
                    <span key={k} className="flex items-center gap-1">
                      <span className="w-3 h-0.5 inline-block" style={{ background: PERIOD_COLORS[k] }} />
                      <span className="text-text-muted">{k.replace("ma", "% > ").replace("ma", "")} MA</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ────────── BREADTH TAB ────────── */}
          {tab === "Breadth" && (
            <div className="space-y-4">
              {/* All metric cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                <MetricCard label="Above 20 MA"   value={fmt(snap?.pct_above_20ma, 0)}   color={pcolor(snap?.pct_above_20ma)}   bar={snap?.pct_above_20ma  ?? undefined} />
                <MetricCard label="Above 50 MA"   value={fmt(snap?.pct_above_50ma, 0)}   color={pcolor(snap?.pct_above_50ma)}   bar={snap?.pct_above_50ma  ?? undefined} />
                <MetricCard label="Above 100 MA"  value={fmt(snap?.pct_above_100ma, 0)}  color={pcolor(snap?.pct_above_100ma)}  bar={snap?.pct_above_100ma ?? undefined} />
                <MetricCard label="Above 200 MA"  value={fmt(snap?.pct_above_200ma, 0)}  color={pcolor(snap?.pct_above_200ma)}  bar={snap?.pct_above_200ma ?? undefined} />
                <MetricCard label="A/D Ratio"     value={fmtN(snap?.ad_ratio, 2)}         color={(snap?.ad_ratio ?? 1) >= 1 ? "#22c55e" : "#ef4444"} />
                <MetricCard label="Advancing"     value={String(snap?.advancing ?? 0)}    color="#22c55e" sub={`of ${(snap?.n_stocks ?? 0)} stocks`} />
                <MetricCard label="Declining"     value={String(snap?.declining ?? 0)}    color="#ef4444" />
                <MetricCard label="New Highs"     value={fmt(snap?.pct_new_highs, 1)}     color="#22c55e" sub="near 52W high" />
                <MetricCard label="New Lows"      value={fmt(snap?.pct_new_lows, 1)}      color={(snap?.pct_new_lows ?? 0) > 0.05 ? "#ef4444" : "#6b6b80"} sub="near 52W low" />
                <MetricCard label="Net NH"        value={fmtPct(snap?.net_new_highs_pct)} color={(snap?.net_new_highs_pct ?? 0) >= 0 ? "#22c55e" : "#ef4444"} />
                <MetricCard label="BPI"           value={fmt(snap?.bpi, 0)}               color={pcolor(snap?.bpi)}  bar={snap?.bpi ?? undefined} sub="Bullish % (50MA)" />
                <MetricCard label="Breadth Thrust" value={fmt(snap?.breadth_thrust, 1)}   color={(snap?.breadth_thrust ?? 0) > 0.6 ? "#22c55e" : "#6b6b80"} bar={snap?.breadth_thrust ?? undefined} sub="Zweig 10d EMA" />
                <MetricCard label="Median Ret 1M"  value={fmtPct(snap?.median_return_1m)} color={(snap?.median_return_1m ?? 0) >= 0 ? "#22c55e" : "#ef4444"} />
                <MetricCard label="EW vs CW 1M"    value={fmtPct(snap?.rsp_vs_spy_1m)}   color={(snap?.rsp_vs_spy_1m ?? 0) >= 0 ? "#22c55e" : "#ef4444"} sub="Equal wt vs Cap wt" />
                <MetricCard label="Health Score"   value={`${snap?.breadth_health_score?.toFixed(0) ?? "—"}`} color={gradeColor} bar={(snap?.breadth_health_score ?? 50) / 100} />
              </div>

              {/* Interactive history chart */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="text-sm font-medium">Breadth History</div>
                  <div className="flex flex-wrap gap-1">
                    {PERIODS.map(({ label, key }) => (
                      <button
                        key={key}
                        onClick={() => toggleMetric(key)}
                        className={cn(
                          "px-2 py-0.5 text-[10px] rounded border transition-colors",
                          chartMetrics.includes(key)
                            ? "text-white border-transparent"
                            : "border-border text-text-muted hover:text-text-primary"
                        )}
                        style={chartMetrics.includes(key) ? { background: PERIOD_COLORS[key as string] } : {}}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {history.length > 0 && chartMetrics.length > 0 ? (
                  <HistoryChart data={history} metrics={chartMetrics} height={240} />
                ) : (
                  <div className="h-40 flex items-center justify-center text-text-muted text-xs">
                    Select metrics above to display
                  </div>
                )}
              </div>

              {/* A/D History */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-3">Advance / Decline Ratio</div>
                <HistoryChart data={history} metrics={["ad_ratio"]} height={160} />
              </div>
            </div>
          )}

          {/* ────────── McCLELLAN TAB ────────── */}
          {tab === "McClellan" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="McClellan Oscillator" value={fmtN(snap?.mcclellan, 1)} color={(snap?.mcclellan ?? 0) >= 0 ? "#22c55e" : "#ef4444"} sub=">+100 overbought · <-100 oversold" />
                <MetricCard label="Summation Index" value={fmtN(snap?.summation_index, 0)} color={(snap?.summation_index ?? 0) >= 0 ? "#22c55e" : "#ef4444"} sub=">0 bullish · <0 bearish" />
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-3">McClellan Oscillator + Summation Index</div>
                <div className="text-xs text-text-muted mb-4">
                  Oscillator = EMA(19) − EMA(39) of daily Advance-Decline net per 1000 issues.
                  Summation Index = cumulative McClellan (bullish above 0).
                </div>
                {history.length > 0 && <McclellanChart data={history} />}
              </div>

              {/* Breadth Thrust */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium">Breadth Thrust (Zweig)</div>
                  {(data.zweig.current_thrust ?? 0) > 0.615 && (
                    <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-400 font-medium animate-pulse">
                      SIGNAL ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted mb-3">
                  10-day EMA of Advancing/(Advancing+Declining). Signal fires when it moves from below 40% to above 61.5% within 10 days (rare — historically very bullish).
                </p>
                <HistoryChart data={history} metrics={["breadth_thrust"]} height={160} />
                {data.zweig.signals.length > 0 && (
                  <div className="mt-3 text-xs text-text-muted">
                    Historical signals: {data.zweig.signals.join(", ")}
                  </div>
                )}
              </div>

              {/* Hindenburg Omen */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-sm font-medium">Hindenburg Omen</div>
                  <span className={cn(
                    "px-2 py-0.5 text-[10px] rounded font-medium",
                    data.hindenburg.active ? "bg-red-500/20 text-red-400" : "bg-surface-2 text-text-muted"
                  )}>
                    {data.hindenburg.active ? "ACTIVE" : "Not Active"}
                  </span>
                </div>
                <p className="text-xs text-text-muted mb-2">
                  Fires when new 52W highs AND new 52W lows both exceed 2.2% of universe simultaneously, while the McClellan Oscillator is negative and market is above 50 MA.
                </p>
                {data.hindenburg.signals_30d.length > 0 ? (
                  <div className="text-xs text-red-400">
                    Triggered (30d): {data.hindenburg.signals_30d.join(", ")}
                  </div>
                ) : (
                  <div className="text-xs text-text-muted">No omen signals in last 30 days</div>
                )}
                {data.hindenburg.last_signal && (
                  <div className="text-xs text-text-muted mt-1">Last signal ever: {data.hindenburg.last_signal}</div>
                )}
              </div>

              {/* New Highs / Lows chart */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-3">Net New 52-Week Highs</div>
                <HistoryChart data={history} metrics={["new_highs_net"]} height={160} />
              </div>
            </div>
          )}

          {/* ────────── SECTORS TAB ────────── */}
          {tab === "Sectors" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-1">Sector Leadership Dashboard</div>
                <div className="text-xs text-text-muted mb-4">
                  Ranked by composite breadth score · RS = return vs SPY benchmark
                </div>
                <SectorTable sectors={data.sectors} />
              </div>

              {/* Sector breadth heatmap */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-3">{"Sector Breadth Heatmap (% > 50 MA)"}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {data.sectors.map((s) => {
                    const col = pcolor(s.above_50ma);
                    return (
                      <div key={s.sector} className="rounded-lg border border-border p-3" style={{ borderColor: `${col}40`, background: `${col}08` }}>
                        <div className="text-[10px] text-text-muted mb-1 truncate">{s.sector}</div>
                        <div className="text-xl font-semibold font-mono" style={{ color: col }}>{fmt(s.above_50ma, 0)}</div>
                        <div className="text-[10px] text-text-muted mt-1">{s.rating}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ────────── RISK & LIQUIDITY TAB ────────── */}
          {tab === "Risk & Liquidity" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <MetricCard label="VIX" value={risk?.vix?.toFixed(1) ?? "—"} color={(risk?.vix ?? 18) > 25 ? "#ef4444" : (risk?.vix ?? 18) > 18 ? "#eab308" : "#22c55e"} sub={risk?.vix_1m_change != null ? `${risk.vix_1m_change >= 0 ? "+" : ""}${risk.vix_1m_change.toFixed(1)} vs 1M ago` : undefined} />
                <MetricCard label="VIX Percentile 1Y" value={risk?.vix_percentile_1y != null ? `${(risk.vix_percentile_1y * 100).toFixed(0)}th` : "—"} color={(risk?.vix_percentile_1y ?? 0.5) > 0.75 ? "#ef4444" : "#eab308"} />
                <MetricCard label="HY Spread Score" value={risk?.hy_spread_score?.toFixed(0) ?? "—"} color={(risk?.hy_spread_score ?? 50) > 60 ? "#22c55e" : "#ef4444"} bar={(risk?.hy_spread_score ?? 50) / 100} sub="100 = tight spreads (bullish)" />
                <MetricCard label="Yield Curve" value={risk?.yield_curve != null ? `${(risk.yield_curve * 100).toFixed(0)}bp` : "—"} color={(risk?.yield_curve ?? 0) > 0 ? "#22c55e" : "#ef4444"} sub="10Y − 3M" />
                <MetricCard label="Credit Stress" value={risk?.credit_stress ?? "—"} color={({ Low: "#22c55e", Moderate: "#eab308", High: "#f97316", Extreme: "#ef4444", Unknown: "#6b6b80" } as Record<string, string>)[risk?.credit_stress ?? "Unknown"] ?? "#6b6b80"} />
                <MetricCard label="Market Risk" value={`${risk?.market_risk_score?.toFixed(0) ?? "—"}/100`} color={(risk?.market_risk_score ?? 50) > 60 ? "#ef4444" : "#eab308"} bar={(risk?.market_risk_score ?? 50) / 100} sub="Higher = more risk" />
                <MetricCard label="Crash Probability" value={`${((risk?.crash_probability ?? 0) * 100).toFixed(1)}%`} color={(risk?.crash_probability ?? 0) > 0.15 ? "#ef4444" : "#eab308"} sub="30-day model estimate" />
                <MetricCard label="Liquidity Score" value={`${risk?.liquidity_score?.toFixed(0) ?? "—"}/100`} color={(risk?.liquidity_score ?? 50) > 60 ? "#22c55e" : "#ef4444"} bar={(risk?.liquidity_score ?? 50) / 100} />
              </div>

              {/* Risk score bar */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-4">Risk Dashboard</div>
                <div className="space-y-3">
                  {[
                    { label: "Market Risk Score",    val: (risk?.market_risk_score ?? 50) / 100,    danger: true },
                    { label: "Liquidity Score",      val: (risk?.liquidity_score ?? 50) / 100,      danger: false },
                    { label: "HY Spread Health",     val: (risk?.hy_spread_score ?? 50) / 100,      danger: false },
                    { label: "Volatility (VIX inv)", val: 1 - Math.min(1, (risk?.vix ?? 18) / 40),  danger: false },
                  ].map(({ label, val, danger }) => {
                    const color = danger
                      ? val > 0.6 ? "#ef4444" : val > 0.4 ? "#f97316" : "#22c55e"
                      : val > 0.6 ? "#22c55e" : val > 0.4 ? "#eab308" : "#ef4444";
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-xs text-text-muted w-40 shrink-0">{label}</span>
                        <div className="flex-1 h-2.5 rounded-full bg-surface-2">
                          <div className="h-2.5 rounded-full transition-all" style={{ width: `${val * 100}%`, backgroundColor: color }} />
                        </div>
                        <span className="text-xs font-mono text-text-primary w-10 text-right">{(val * 100).toFixed(0)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface p-4 text-xs text-text-muted space-y-1">
                <div className="font-medium text-text-primary mb-2">Interpretation Guide</div>
                <div>• <strong className="text-text-primary">VIX &gt; 30</strong>: Panic regime — tighten stops, reduce exposure</div>
                <div>• <strong className="text-text-primary">HY Spread Score &lt; 40</strong>: Credit stress rising — risk-off rotation likely</div>
                <div>• <strong className="text-text-primary">Yield Curve &lt; 0</strong>: Inverted — recession risk elevated within 12-18 months</div>
                <div>• <strong className="text-text-primary">Market Risk Score &gt; 70</strong>: Systemic risk elevated — defensive positioning warranted</div>
              </div>
            </div>
          )}

          {/* ────────── SIGNALS TAB ────────── */}
          {tab === "Signals" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-1">Trading Signals Engine</div>
                <div className="text-xs text-text-muted mb-4">
                  Generated from breadth, liquidity, momentum, and regime inputs. Historical win rates are based on similar breadth configurations since 1990.
                </div>
                <div className="space-y-3">
                  {data.signals.map((s, i) => <SignalCard key={i} s={s} />)}
                </div>
              </div>

              {/* Position sizing context */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-3">Regime-Based Position Sizing</div>
                <div className="space-y-2 text-xs">
                  {[
                    { regime: "Strong Bull", sizing: "90-100% — full risk, favour cyclicals and momentum", color: "#22c55e" },
                    { regime: "Bull",        sizing: "80-90% — constructive, standard allocation",         color: "#84cc16" },
                    { regime: "Early Bull",  sizing: "70-80% — selective, confirm with volume",            color: "#a3e635" },
                    { regime: "Sideways",    sizing: "60-75% — range-bound, trade the levels",             color: "#eab308" },
                    { regime: "Early Bear",  sizing: "50-65% — reduce risk, add defensive exposure",       color: "#f97316" },
                    { regime: "Bear",        sizing: "35-50% — defensive only, hedges required",           color: "#ef4444" },
                    { regime: "Crisis",      sizing: "20-35% — cash, gold, short-duration bonds",          color: "#7f1d1d" },
                  ].map(({ regime: r, sizing, color }) => (
                    <div key={r} className={cn("flex items-start gap-3 p-2 rounded", r === regime?.state ? "bg-accent/10 border border-accent/30" : "")}>
                      <span className="w-20 shrink-0 font-medium" style={{ color }}>{r}</span>
                      <span className="text-text-muted">{sizing}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
