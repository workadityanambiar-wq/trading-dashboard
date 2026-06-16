"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import {
  Globe, TrendingUp, TrendingDown, Minus, AlertTriangle,
  CheckCircle2, XCircle, RefreshCw, ChevronUp, ChevronDown,
  Shield, DollarSign, BarChart3, Activity, Landmark, Zap,
  ArrowUpRight, ArrowDownRight, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type CountryMacroResponse, type CountryListItem } from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, dec = 1, suffix = ""): string {
  if (v == null) return "—";
  return `${v >= 0 ? "" : ""}${v.toFixed(dec)}${suffix}`;
}
function fmtPct(v: number | null | undefined, dec = 1) { return fmt(v, dec, "%"); }
function fmtUsd(v: number | null | undefined) {
  if (v == null) return "—";
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}T`;
  return `$${v.toFixed(0)}B`;
}
function fmtPop(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v.toFixed(0)}M`;
}

function deltaColor(v: number | null | undefined) {
  if (v == null) return "text-text-muted";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-text-muted";
}

function Delta({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-text-muted text-xs">—</span>;
  const pos = v >= 0;
  return (
    <span className={cn("flex items-center gap-0.5 text-xs font-mono", pos ? "text-emerald-400" : "text-red-400")}>
      {pos ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {Math.abs(v).toFixed(1)}%
    </span>
  );
}

function scoreColor(s: number) {
  if (s >= 75) return "text-emerald-400";
  if (s >= 55) return "text-yellow-400";
  if (s >= 35) return "text-orange-400";
  return "text-red-400";
}
function scoreBg(s: number) {
  if (s >= 75) return "bg-emerald-500/15 border-emerald-500/30";
  if (s >= 55) return "bg-yellow-500/15 border-yellow-500/30";
  if (s >= 35) return "bg-orange-500/15 border-orange-500/30";
  return "bg-red-500/15 border-red-500/30";
}

function regimeColor(label: string) {
  if (label === "Goldilocks") return { bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-300" };
  if (label === "Overheating") return { bg: "bg-amber-500/15 border-amber-500/30", text: "text-amber-300" };
  if (label === "Stagflation") return { bg: "bg-red-500/15 border-red-500/30", text: "text-red-300" };
  if (label === "Recession") return { bg: "bg-orange-500/15 border-orange-500/30", text: "text-orange-300" };
  return { bg: "bg-surface-2 border-border", text: "text-text-muted" };
}

function invColor(label: string) {
  if (label === "Strong Buy") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (label === "Buy") return "text-green-400 bg-green-500/10 border-green-500/30";
  if (label === "Neutral") return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
  if (label === "Underweight") return "text-orange-400 bg-orange-500/10 border-orange-500/30";
  return "text-red-400 bg-red-500/10 border-red-500/30";
}

function insightIcon(type: string) {
  if (type === "positive") return <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />;
  if (type === "negative") return <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />;
  if (type === "warning")  return <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />;
  return <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-surface border border-border rounded-lg p-4", className)}>
      {children}
    </div>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-accent">{icon}</span>
      <span className="text-xs font-semibold tracking-widest uppercase text-text-muted">{label}</span>
    </div>
  );
}

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-text-muted">{label}</span>
      <div className="text-right">
        <span className="text-xs font-mono text-text-primary">{value}</span>
        {sub && <div className="text-[10px] text-text-muted/60">{sub}</div>}
      </div>
    </div>
  );
}

function ScoreGauge({ score, label }: { score: number; label?: string }) {
  const pct = score / 100;
  const angle = pct * 180 - 90;
  const r = 40;
  const cx = 50; const cy = 55;
  const toRad = (a: number) => (a * Math.PI) / 180;
  const needleX = cx + r * Math.cos(toRad(angle - 90));
  const needleY = cy + r * Math.sin(toRad(angle - 90));
  const color = score >= 70 ? "#34d399" : score >= 50 ? "#fbbf24" : score >= 30 ? "#f97316" : "#f87171";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 60" className="w-24 h-14">
        <path d="M10 55 A 40 40 0 0 1 90 55" stroke="#1e1e2e" strokeWidth="8" fill="none" />
        <path
          d={`M10 55 A 40 40 0 0 1 ${cx + r * Math.cos(toRad(angle - 90))} ${cy + r * Math.sin(toRad(angle - 90))}`}
          stroke={color} strokeWidth="8" fill="none" strokeLinecap="round"
        />
        <circle cx={needleX} cy={needleY} r="3" fill={color} />
        <circle cx={cx} cy={cy} r="4" fill="#1e1e2e" stroke={color} strokeWidth="1.5" />
      </svg>
      <div className={cn("text-xl font-bold font-mono -mt-2", color === "#34d399" ? "text-emerald-400" : color === "#fbbf24" ? "text-yellow-400" : color === "#f97316" ? "text-orange-400" : "text-red-400")}>
        {score}
      </div>
      {label && <div className="text-[10px] text-text-muted mt-0.5 uppercase tracking-wider">{label}</div>}
    </div>
  );
}

function MiniSparkline({ data, color = "#6366f1" }: { data: { value: number }[]; color?: string }) {
  if (!data.length) return <span className="text-text-muted text-xs">—</span>;
  return (
    <ResponsiveContainer width={80} height={28}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: { background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 6, fontSize: 11 },
  labelStyle: { color: "#6b6b80" },
  itemStyle: { color: "#e2e2e8" },
};

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",  label: "Overview",  icon: Globe },
  { id: "economy",   label: "Economy",   icon: TrendingUp },
  { id: "inflation", label: "Inflation", icon: Activity },
  { id: "policy",    label: "CB Policy", icon: Landmark },
  { id: "fiscal",    label: "Fiscal",    icon: Shield },
  { id: "markets",   label: "Markets",   icon: BarChart3 },
  { id: "risk",      label: "Risk",      icon: AlertTriangle },
  { id: "analysis",  label: "Analysis",  icon: Zap },
] as const;

type TabId = typeof TABS[number]["id"];

// ── Tab content ───────────────────────────────────────────────────────────────

function OverviewTab({ d }: { d: CountryMacroResponse }) {
  const { overview, scores, regime, investment, meta } = d;
  const rc = regimeColor(regime.label);
  const investEntries = [
    ["Equities",    investment.equities],
    ["Bonds",       investment.bonds],
    ["Currency",    investment.currency],
    ["Real Estate", investment.real_estate],
    ["Commodities", investment.commodities],
  ] as [string, typeof investment.equities][];

  const compositeData = [
    { name: "Growth",    value: scores.growth },
    { name: "Inflation", value: scores.inflation },
    { name: "Fiscal",    value: scores.fiscal },
    { name: "External",  value: scores.external },
    { name: "Monetary",  value: scores.monetary },
    { name: "Political", value: scores.political },
  ];

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Country header */}
      <Card>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <span className="text-5xl">{meta.flag}</span>
            <div>
              <h2 className="text-2xl font-bold text-text-primary">{meta.name}</h2>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-xs text-text-muted">{meta.region}</span>
                <span className="text-xs text-text-muted">•</span>
                <span className="text-xs text-text-muted">Currency: <span className="text-text-primary font-mono">{meta.currency}</span></span>
                <span className="text-xs text-text-muted">•</span>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", overview.credit_rating.ig ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : "text-red-400 bg-red-500/10 border-red-500/30")}>
                  {overview.credit_rating.ig ? "Investment Grade" : "Sub-Investment Grade"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <ScoreGauge score={scores.composite} label="Composite" />
            <div className={cn("px-4 py-3 rounded-lg border text-center", rc.bg)}>
              <div className={cn("text-xl font-bold", rc.text)}>{regime.label}</div>
              <div className="text-[10px] text-text-muted mt-0.5">Macro Regime</div>
              <div className="flex items-center justify-center gap-2 mt-1.5">
                <span className="text-xs text-text-muted">Growth {regime.growth_dir}</span>
                <span className="text-xs text-text-muted">Inflation {regime.inflation_dir}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Key stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "GDP", value: fmtUsd(overview.gdp_usd_bn), sub: "Total economy size" },
          { label: "GDP Per Capita", value: overview.gdp_per_capita ? `$${overview.gdp_per_capita.toLocaleString()}` : "—", sub: "Annual USD" },
          { label: "Population", value: fmtPop(overview.population_mn), sub: "Millions" },
          { label: "Trade / GDP", value: fmtPct(overview.trade_pct_gdp), sub: "Openness" },
        ].map(item => (
          <Card key={item.label} className="text-center">
            <div className="text-xl font-bold font-mono text-text-primary">{item.value}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mt-0.5">{item.label}</div>
            <div className="text-[10px] text-text-muted/60 mt-0.5">{item.sub}</div>
          </Card>
        ))}
      </div>

      {/* Credit + composite radar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={<Shield size={13} />} label="Credit Profile" />
          <MetricRow label="Moody's" value={overview.credit_rating.moodys} />
          <MetricRow label="S&P" value={overview.credit_rating.sp} />
          <MetricRow label="Fitch" value={overview.credit_rating.fitch} />
          <MetricRow label="Credit Score" value={`${overview.credit_rating.score}/100`} />
          <MetricRow label="Political Stability" value={overview.political_stability != null ? `${overview.political_stability.toFixed(2)} (WB)` : "—"} sub="-2.5 worst → +2.5 best" />
        </Card>

        <Card>
          <SectionTitle icon={<BarChart3 size={13} />} label="Dimension Scores" />
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={compositeData}>
              <PolarGrid stroke="#2a2a3a" />
              <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b6b80" }} />
              <Radar name="Score" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
              <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${v}/100`, "Score"]} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Investment scores */}
      <Card>
        <SectionTitle icon={<DollarSign size={13} />} label="Investment Attractiveness" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {investEntries.map(([name, entry]) => (
            <div key={name} className="text-center">
              <div className={cn("text-[10px] font-semibold px-2 py-1 rounded border mb-2", invColor(entry.label))}>
                {entry.label}
              </div>
              <div className="text-xs text-text-muted">{name}</div>
              <div className={cn("text-base font-bold font-mono mt-1", scoreColor(entry.score))}>{entry.score}</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-text-muted/60 mt-3">{d.data_note}</p>
      </Card>
    </div>
  );
}

function EconomyTab({ d }: { d: CountryMacroResponse }) {
  const { growth, labor, external } = d;
  const momentumColor = growth.momentum === "Accelerating" ? "text-emerald-400" : growth.momentum === "Decelerating" ? "text-red-400" : "text-yellow-400";

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* GDP header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "GDP Growth YoY", value: fmtPct(growth.gdp_growth), change: growth.gdp_growth != null && growth.gdp_growth_prev != null ? growth.gdp_growth - growth.gdp_growth_prev : null },
          { label: "Industrial Prod.", value: fmtPct(growth.industrial_prod), change: null },
          { label: "Exports Growth", value: fmtPct(growth.exports_growth), change: null },
          { label: "Imports Growth", value: fmtPct(growth.imports_growth), change: null },
        ].map(item => (
          <Card key={item.label} className="text-center">
            <div className={cn("text-xl font-bold font-mono", item.change != null ? deltaColor(item.change) : "text-text-primary")}>
              {item.value}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted mt-0.5">{item.label}</div>
            {item.change != null && (
              <div className={cn("text-[10px] mt-0.5", deltaColor(item.change))}>
                {item.change >= 0 ? "+" : ""}{item.change.toFixed(1)}pp vs prior
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* GDP chart + scores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <SectionTitle icon={<TrendingUp size={13} />} label="GDP Growth History" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={growth.history} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#6b6b80" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6b6b80" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "GDP Growth"]} />
              <ReferenceLine y={0} stroke="#2a2a3a" />
              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                {growth.history.map((entry, i) => (
                  <Cell key={i} fill={entry.value >= 0 ? "#6366f1" : "#f87171"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle icon={<Activity size={13} />} label="Growth Scorecard" />
          <div className="flex flex-col items-center mb-4">
            <ScoreGauge score={growth.score} label="Growth Score" />
          </div>
          <div className="space-y-0">
            <MetricRow label="Momentum" value={growth.momentum} />
            <MetricRow label="Current Growth" value={fmtPct(growth.gdp_growth)} />
            <MetricRow label="Prior Period" value={fmtPct(growth.gdp_growth_prev)} />
          </div>
          <div className={cn("mt-3 text-xs font-semibold text-center", momentumColor)}>
            {growth.momentum}
          </div>
        </Card>
      </div>

      {/* Labor market */}
      <Card>
        <SectionTitle icon={<Globe size={13} />} label="Labor Market" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="text-center p-3 bg-surface-2 rounded-lg">
                <div className={cn("text-2xl font-bold font-mono", labor.unemployment != null && (labor.unemployment_prev ?? 99) > labor.unemployment ? "text-emerald-400" : "text-text-primary")}>
                  {fmtPct(labor.unemployment)}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted mt-1">Unemployment</div>
                {labor.unemployment != null && labor.unemployment_prev != null && (
                  <div className={cn("text-[10px] mt-0.5", labor.unemployment < labor.unemployment_prev ? "text-emerald-400" : "text-red-400")}>
                    {labor.unemployment < labor.unemployment_prev ? "↓" : "↑"} from {fmtPct(labor.unemployment_prev)}
                  </div>
                )}
              </div>
              <div className="text-center p-3 bg-surface-2 rounded-lg">
                <div className="text-2xl font-bold font-mono text-text-primary">{fmtPct(labor.labor_participation)}</div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted mt-1">Labor Participation</div>
              </div>
            </div>
            <MetricRow label="Labor Strength Score" value={`${labor.score}/100`} />
          </div>
          <div>
            <div className="text-[10px] text-text-muted mb-2 uppercase tracking-wider">Unemployment History</div>
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={labor.history} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#6b6b80" }} axisLine={false} tickLine={false} minTickGap={25} />
                <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Unemployment"]} />
                <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* External sector */}
      <Card>
        <SectionTitle icon={<Globe size={13} />} label="External Sector" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {[
            { label: "Current Account / GDP", value: fmtPct(d.external.current_account_gdp) },
            { label: "FX Reserves", value: fmtUsd(d.external.fx_reserves_usd_bn) },
            { label: "Reserves (months)", value: d.external.fx_reserves_months != null ? `${d.external.fx_reserves_months.toFixed(1)}mo` : "—" },
            { label: "External Debt / GNI", value: fmtPct(d.external.ext_debt_gni) },
          ].map(item => (
            <div key={item.label} className="p-3 bg-surface-2 rounded-lg text-center">
              <div className="text-base font-bold font-mono text-text-primary">{item.value}</div>
              <div className="text-[10px] text-text-muted mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-text-muted mb-2 uppercase tracking-wider">Current Account History (% GDP)</div>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={d.external.history} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#6b6b80" }} axisLine={false} tickLine={false} minTickGap={25} />
            <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "CA / GDP"]} />
            <ReferenceLine y={0} stroke="#2a2a3a" />
            <Bar dataKey="value" radius={[2, 2, 0, 0]}>
              {d.external.history.map((e, i) => (
                <Cell key={i} fill={e.value >= 0 ? "#22c55e" : "#f87171"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function InflationTab({ d }: { d: CountryMacroResponse }) {
  const { inflation } = d;
  const regimeColors: Record<string, string> = {
    Deflation: "text-blue-400", Low: "text-emerald-400", Stable: "text-green-400",
    Elevated: "text-yellow-400", High: "text-orange-400", Hyperinflation: "text-red-400",
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="text-center">
          <div className={cn("text-3xl font-bold font-mono", deltaColor(inflation.cpi_prev != null && inflation.cpi != null ? inflation.cpi - inflation.cpi_prev : null))}>
            {fmtPct(inflation.cpi)}
          </div>
          <div className="text-xs uppercase tracking-wider text-text-muted mt-1">CPI YoY</div>
          {inflation.cpi_prev != null && (
            <div className={cn("text-[10px] mt-0.5", inflation.cpi != null && inflation.cpi < inflation.cpi_prev ? "text-emerald-400" : "text-red-400")}>
              {inflation.cpi != null && inflation.cpi < inflation.cpi_prev ? "Cooling" : "Rising"} from {fmtPct(inflation.cpi_prev)}
            </div>
          )}
        </Card>

        <Card className="text-center">
          <div className={cn("text-2xl font-bold", regimeColors[inflation.regime] || "text-text-primary")}>
            {inflation.regime}
          </div>
          <div className="text-xs uppercase tracking-wider text-text-muted mt-1">Inflation Regime</div>
        </Card>

        <Card className="text-center">
          <ScoreGauge score={inflation.score} label="Inflation Score" />
          <div className="text-[10px] text-text-muted mt-1">Higher = price stability</div>
        </Card>
      </div>

      <Card>
        <SectionTitle icon={<Activity size={13} />} label="CPI Inflation History" />
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={inflation.history} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#6b6b80" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#6b6b80" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "CPI"]} />
            <ReferenceLine y={2} stroke="#6366f1" strokeDasharray="4 2" label={{ value: "2% target", fill: "#6366f1", fontSize: 9, position: "right" }} />
            <ReferenceLine y={0} stroke="#2a2a3a" />
            <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <SectionTitle icon={<Info size={13} />} label="Inflation Classification" />
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { label: "Deflation", range: "< 0%", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
            { label: "Low", range: "0–2%", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
            { label: "Stable", range: "2–4%", color: "text-green-400 bg-green-500/10 border-green-500/30" },
            { label: "Elevated", range: "4–7%", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
            { label: "High", range: "7–15%", color: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
            { label: "Hyper", range: "> 15%", color: "text-red-400 bg-red-500/10 border-red-500/30" },
          ].map(item => (
            <div key={item.label} className={cn("text-center rounded border px-2 py-2 text-[10px] font-semibold", item.color, inflation.regime === item.label || (item.label === "Hyper" && inflation.regime === "Hyperinflation") ? "ring-1 ring-current" : "")}>
              <div>{item.label}</div>
              <div className="font-normal opacity-70 mt-0.5">{item.range}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function PolicyTab({ d }: { d: CountryMacroResponse }) {
  const { central_bank } = d;
  const stanceColor = central_bank.stance === "Tightening" ? "text-red-400" : central_bank.stance === "Easing" ? "text-emerald-400" : "text-yellow-400";

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Policy Rate", value: central_bank.policy_rate != null ? `${central_bank.policy_rate.toFixed(2)}%` : "—", color: "text-text-primary" },
          { label: "Real Rate", value: central_bank.real_rate != null ? `${central_bank.real_rate.toFixed(2)}%` : "—", color: deltaColor(central_bank.real_rate) },
          { label: "Stance", value: central_bank.stance, color: stanceColor },
          { label: "Hawkish Score", value: `${central_bank.hawkish_score}/100`, color: scoreColor(central_bank.hawkish_score) },
        ].map(item => (
          <Card key={item.label} className="text-center">
            <div className={cn("text-2xl font-bold font-mono", item.color)}>{item.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted mt-1">{item.label}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={<Landmark size={13} />} label="Monetary Policy Details" />
          <MetricRow label="Policy Rate" value={central_bank.policy_rate != null ? `${central_bank.policy_rate.toFixed(2)}%` : "—"} />
          <MetricRow label="CPI Inflation" value={fmtPct(d.inflation.cpi)} />
          <MetricRow label="Real Interest Rate" value={central_bank.real_rate != null ? `${central_bank.real_rate.toFixed(2)}%` : "—"} sub="Policy Rate − CPI" />
          <MetricRow label="Monetary Stance" value={central_bank.stance} />
          <MetricRow label="Policy Score" value={`${d.scores.monetary}/100`} sub="Higher = healthier policy mix" />
        </Card>

        <Card>
          <SectionTitle icon={<Activity size={13} />} label="Policy Interpretation" />
          <div className="space-y-3 text-xs text-text-muted">
            {central_bank.real_rate != null && (
              <div className={cn("p-3 rounded-lg border", central_bank.real_rate > 0 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300")}>
                {central_bank.real_rate > 2
                  ? `Real rate of ${central_bank.real_rate.toFixed(1)}% is highly restrictive — central bank is actively fighting inflation.`
                  : central_bank.real_rate > 0
                  ? `Real rate of ${central_bank.real_rate.toFixed(1)}% is mildly restrictive — policy is near neutral.`
                  : `Negative real rate of ${central_bank.real_rate.toFixed(1)}% — policy is accommodative or behind the curve.`}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[
                { label: "Tightening", desc: "Rate > Inflation + 2%" },
                { label: "Neutral", desc: "Rate ≈ Inflation" },
                { label: "Easing", desc: "Rate < Inflation" },
              ].map(s => (
                <div key={s.label} className={cn("text-center p-2 rounded border text-[10px]", central_bank.stance === s.label ? "border-accent text-accent bg-accent/10" : "border-border text-text-muted")}>
                  <div className="font-semibold">{s.label}</div>
                  <div className="mt-0.5 opacity-70">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function FiscalTab({ d }: { d: CountryMacroResponse }) {
  const { fiscal, external } = d;
  const riskColors: Record<string, string> = {
    Low: "text-emerald-400", Moderate: "text-yellow-400", High: "text-orange-400", Critical: "text-red-400",
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Debt / GDP", value: fmtPct(fiscal.debt_gdp), color: (fiscal.debt_gdp ?? 0) > 90 ? "text-red-400" : "text-text-primary" },
          { label: "Gross Savings", value: fmtPct(fiscal.gross_savings), color: "text-text-primary" },
          { label: "Fiscal Risk", value: fiscal.risk_level, color: riskColors[fiscal.risk_level] || "text-text-muted" },
          { label: "Fiscal Score", value: `${fiscal.score}/100`, color: scoreColor(fiscal.score) },
        ].map(item => (
          <Card key={item.label} className="text-center">
            <div className={cn("text-2xl font-bold font-mono", item.color)}>{item.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted mt-1">{item.label}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <SectionTitle icon={<Shield size={13} />} label="Government Debt / GDP History" />
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={fiscal.history} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#6b6b80" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6b6b80" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Debt/GDP"]} />
              <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: "60% threshold", fill: "#f59e0b", fontSize: 9 }} />
              <ReferenceLine y={90} stroke="#f87171" strokeDasharray="4 2" label={{ value: "90% warning", fill: "#f87171", fontSize: 9 }} />
              <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle icon={<Shield size={13} />} label="Fiscal Health" />
          <ScoreGauge score={fiscal.score} label="Fiscal Score" />
          <div className="mt-4 space-y-0">
            <MetricRow label="Debt/GDP" value={fmtPct(fiscal.debt_gdp)} />
            <MetricRow label="Savings Rate" value={fmtPct(fiscal.gross_savings)} />
            <MetricRow label="Risk Level" value={fiscal.risk_level} />
          </div>
          <div className="mt-3 text-[10px] text-text-muted">
            <div className="font-semibold mb-1">Debt thresholds:</div>
            {[["< 60%", "Healthy"], ["60–90%", "Moderate"], ["90–120%", "Elevated"], ["> 120%", "Critical"]].map(([r, l]) => (
              <div key={r} className="flex justify-between py-0.5">
                <span className="font-mono">{r}</span><span>{l}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* External */}
      <Card>
        <SectionTitle icon={<Globe size={13} />} label="External Balance Scorecard" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MetricRow label="Current Account / GDP" value={fmtPct(external.current_account_gdp)} />
          <MetricRow label="FX Reserves" value={fmtUsd(external.fx_reserves_usd_bn)} />
          <MetricRow label="Reserves Coverage" value={external.fx_reserves_months != null ? `${external.fx_reserves_months.toFixed(1)} months` : "—"} />
          <MetricRow label="External Debt / GNI" value={fmtPct(external.ext_debt_gni)} />
          <MetricRow label="Exports Growth" value={fmtPct(external.exports_growth)} />
          <MetricRow label="External Score" value={`${external.score}/100`} />
        </div>
      </Card>
    </div>
  );
}

function MarketsTab({ d }: { d: CountryMacroResponse }) {
  const { equity, currency, commodities } = d;

  const commodityEntries = Object.entries(commodities.exposure).filter(([, v]) => v > 0);

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Equity */}
      <Card>
        <SectionTitle icon={<TrendingUp size={13} />} label={`Equity Market — ${equity.ticker}`} />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          {[
            { label: "Price (ETF)", value: equity.price != null ? `$${equity.price.toFixed(2)}` : "—" },
            { label: "1-Month", value: <Delta v={equity.change_1m} /> },
            { label: "3-Month", value: <Delta v={equity.change_3m} /> },
            { label: "1-Year", value: <Delta v={equity.change_1y} /> },
            { label: "5-Year", value: <Delta v={equity.change_5y} /> },
          ].map(item => (
            <div key={item.label} className="text-center p-3 bg-surface-2 rounded-lg">
              <div className="text-base font-bold font-mono text-text-primary">{item.value}</div>
              <div className="text-[10px] text-text-muted mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-text-muted mb-2 uppercase tracking-wider">5-Year Price History</div>
            {equity.history.length > 0 ? (
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={equity.history} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b6b80" }} axisLine={false} tickLine={false} minTickGap={60} tickFormatter={v => v.slice(0, 7)} />
                  <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} axisLine={false} tickLine={false} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="h-32 flex items-center justify-center text-xs text-text-muted">No market data</div>}
          </div>
          <div>
            <div className="space-y-0">
              <MetricRow label="Valuation Score" value={`${equity.valuation_score}/100`} />
              <MetricRow label="Momentum Score" value={`${equity.momentum_score}/100`} />
              <MetricRow label="Market Cap / GDP" value={fmtPct(equity.market_cap_gdp)} />
              <MetricRow label="Investment Label" value={d.investment.equities.label} />
            </div>
          </div>
        </div>
      </Card>

      {/* Currency */}
      <Card>
        <SectionTitle icon={<DollarSign size={13} />} label={`Currency — ${d.meta.currency}/USD`} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                { label: "FX Rate", value: currency.fx_rate != null ? currency.fx_rate.toFixed(4) : "—" },
                { label: "1-Year", value: <Delta v={currency.fx_change_1y} /> },
                { label: "5-Year", value: <Delta v={currency.fx_change_5y} /> },
              ].map(item => (
                <div key={item.label} className="text-center p-3 bg-surface-2 rounded-lg">
                  <div className="text-sm font-bold font-mono text-text-primary">{item.value}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>
            <MetricRow label="Currency Score" value={`${currency.score}/100`} />
            <MetricRow label="Investment Verdict" value={d.investment.currency.label} />
          </div>
          <div>
            {currency.history.length > 0 ? (
              <>
                <div className="text-[10px] text-text-muted mb-2 uppercase tracking-wider">FX Rate History (vs USD)</div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={currency.history} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b6b80" }} axisLine={false} tickLine={false} minTickGap={60} tickFormatter={v => v.slice(0, 7)} />
                    <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} axisLine={false} tickLine={false} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </>
            ) : <div className="h-28 flex items-center justify-center text-xs text-text-muted">USD base — no FX rate</div>}
          </div>
        </div>
      </Card>

      {/* Commodities */}
      <Card>
        <SectionTitle icon={<BarChart3 size={13} />} label="Commodity Exposure" />
        {commodityEntries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={commodityEntries.map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: v }))} layout="vertical" margin={{ left: 10, right: 20, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: "#6b6b80" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#6b6b80" }} axisLine={false} tickLine={false} width={75} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${v}%`, "Exposure"]} />
                  <Bar dataKey="value" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              {commodityEntries.map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
                  <span className="text-xs text-text-muted capitalize">{k}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${v}%` }} />
                    </div>
                    <span className="text-xs font-mono text-text-primary w-10 text-right">{v}%</span>
                  </div>
                </div>
              ))}
              <div className="mt-3 pt-2 border-t border-border/40">
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Sensitivity Score</span>
                  <span className={cn("font-mono", scoreColor(commodities.sensitivity_score))}>{commodities.sensitivity_score}/100</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-text-muted text-center py-6">No significant commodity exposure data for this country.</div>
        )}
      </Card>
    </div>
  );
}

function RiskTab({ d }: { d: CountryMacroResponse }) {
  const { risk, scores } = d;

  const riskData = [
    { name: "Political",  value: risk.political },
    { name: "Fiscal",     value: risk.fiscal },
    { name: "Currency",   value: risk.currency },
    { name: "Sovereign",  value: risk.sovereign },
    { name: "Inflation",  value: risk.inflation },
  ];

  const riskColor = (v: number) =>
    v >= 70 ? "bg-red-500" : v >= 50 ? "bg-orange-500" : v >= 30 ? "bg-yellow-500" : "bg-emerald-500";

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Overall risk */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="text-center md:col-span-1">
          <div className={cn("text-3xl font-bold font-mono", risk.overall >= 60 ? "text-red-400" : risk.overall >= 40 ? "text-orange-400" : "text-emerald-400")}>
            {risk.overall}
          </div>
          <div className="text-xs uppercase tracking-wider text-text-muted mt-1">Overall Risk Score</div>
          <div className="text-[10px] text-text-muted/60 mt-0.5">0 = no risk · 100 = extreme risk</div>
        </Card>

        <Card className="md:col-span-2">
          <SectionTitle icon={<AlertTriangle size={13} />} label="Risk Heatmap" />
          <div className="space-y-2">
            {riskData.map(item => (
              <div key={item.name} className="flex items-center gap-3">
                <div className="text-xs text-text-muted w-20 shrink-0">{item.name}</div>
                <div className="flex-1 h-3 bg-surface-2 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", riskColor(item.value))} style={{ width: `${item.value}%` }} />
                </div>
                <div className={cn("text-xs font-mono w-8 text-right", item.value >= 70 ? "text-red-400" : item.value >= 50 ? "text-orange-400" : item.value >= 30 ? "text-yellow-400" : "text-emerald-400")}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Radar chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={<Activity size={13} />} label="Risk Radar" />
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={riskData}>
              <PolarGrid stroke="#2a2a3a" />
              <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b6b80" }} />
              <Radar name="Risk" dataKey="value" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
              <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${v}/100`, "Risk"]} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle icon={<Shield size={13} />} label="Risk Breakdown" />
          <div className="space-y-0">
            {riskData.map(item => (
              <MetricRow
                key={item.name}
                label={`${item.name} Risk`}
                value={`${item.value}/100`}
              />
            ))}
            <div className="pt-2 border-t border-border/40 mt-2">
              <MetricRow label="Composite Score" value={`${scores.composite}/100`} sub="Higher = more attractive" />
              <MetricRow label="Overall Risk" value={`${risk.overall}/100`} sub="Higher = riskier" />
            </div>
          </div>
          <div className="mt-4 p-3 bg-surface-2 rounded-lg text-[10px] text-text-muted space-y-1">
            <div className="font-semibold text-text-primary mb-1">Risk Levels:</div>
            <div className="flex gap-3 flex-wrap">
              <span><span className="text-emerald-400">0–30</span> Low</span>
              <span><span className="text-yellow-400">30–50</span> Moderate</span>
              <span><span className="text-orange-400">50–70</span> High</span>
              <span><span className="text-red-400">70+</span> Critical</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function AnalysisTab({ d }: { d: CountryMacroResponse }) {
  const { insights, forecasts, regime, scores } = d;

  const regimeMatrix = [
    { growth: "↑", inflation: "↓", label: "Goldilocks", color: "text-emerald-400", current: regime.label === "Goldilocks" },
    { growth: "↑", inflation: "↑", label: "Overheating", color: "text-amber-400", current: regime.label === "Overheating" },
    { growth: "↓", inflation: "↑", label: "Stagflation", color: "text-red-400", current: regime.label === "Stagflation" },
    { growth: "↓", inflation: "↓", label: "Recession", color: "text-orange-400", current: regime.label === "Recession" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* AI Insights */}
      <Card>
        <SectionTitle icon={<Zap size={13} />} label="AI Macro Analyst" />
        <div className="space-y-2">
          {insights.length > 0 ? insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-2 p-2.5 bg-surface-2 rounded-lg">
              {insightIcon(ins.type)}
              <div>
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mr-2">{ins.category}</span>
                <span className="text-xs text-text-primary">{ins.text}</span>
              </div>
            </div>
          )) : (
            <div className="text-xs text-text-muted text-center py-4">Insufficient data for insights. Try a country with more World Bank coverage.</div>
          )}
        </div>
      </Card>

      {/* Regime engine */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={<Activity size={13} />} label="Economic Regime Engine" />
          <div className={cn("p-4 rounded-lg border mb-3 text-center", regimeColor(regime.label).bg)}>
            <div className={cn("text-2xl font-bold", regimeColor(regime.label).text)}>{regime.label}</div>
            <div className="text-xs text-text-muted mt-1">Current Regime</div>
            <div className="flex justify-center gap-4 mt-2 text-xs text-text-muted">
              <span>Growth {regime.growth_dir}</span>
              <span>Inflation {regime.inflation_dir}</span>
            </div>
          </div>
          <p className="text-xs text-text-muted">{regime.description}</p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {regimeMatrix.map(r => (
              <div key={r.label} className={cn("text-center p-2 rounded border text-[10px]", r.current ? `border-current ${r.color} bg-current/10` : "border-border text-text-muted")}>
                <div className={cn("font-semibold", r.current ? r.color : "")}>{r.label}</div>
                <div className="mt-0.5 opacity-70">G{r.growth} · I{r.inflation}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Forecasts */}
        <Card>
          <SectionTitle icon={<TrendingUp size={13} />} label="Forecasting Models" />
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">GDP Growth Forecast</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "3 Month", value: forecasts.gdp_3m },
                  { label: "6 Month", value: forecasts.gdp_6m },
                  { label: "12 Month", value: forecasts.gdp_12m },
                ].map(f => (
                  <div key={f.label} className="text-center p-2 bg-surface-2 rounded">
                    <div className={cn("text-sm font-bold font-mono", deltaColor(f.value))}>{fmtPct(f.value)}</div>
                    <div className="text-[10px] text-text-muted mt-0.5">{f.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">CPI Inflation Forecast</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "3 Month", value: forecasts.cpi_3m },
                  { label: "6 Month", value: forecasts.cpi_6m },
                  { label: "12 Month", value: forecasts.cpi_12m },
                ].map(f => (
                  <div key={f.label} className="text-center p-2 bg-surface-2 rounded">
                    <div className={cn("text-sm font-bold font-mono", (f.value ?? 0) > 5 ? "text-red-400" : "text-text-primary")}>{fmtPct(f.value)}</div>
                    <div className="text-[10px] text-text-muted mt-0.5">{f.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-border/40">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-muted">Recession Probability</span>
                <span className={cn("text-sm font-bold font-mono", (forecasts.recession_probability ?? 0) >= 50 ? "text-red-400" : (forecasts.recession_probability ?? 0) >= 25 ? "text-orange-400" : "text-emerald-400")}>
                  {forecasts.recession_probability != null ? `${forecasts.recession_probability}%` : "—"}
                </span>
              </div>
              {forecasts.recession_probability != null && (
                <div className="mt-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", (forecasts.recession_probability) >= 50 ? "bg-red-500" : "bg-amber-500")} style={{ width: `${forecasts.recession_probability}%` }} />
                </div>
              )}
            </div>
            <p className="text-[10px] text-text-muted/60 mt-1">Forecasts based on linear trend extrapolation of World Bank annual data.</p>
          </div>
        </Card>
      </div>

      {/* Score summary */}
      <Card>
        <SectionTitle icon={<BarChart3 size={13} />} label="Country Composite Score — Weighted Model" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {[
            { label: "Growth (25%)",    score: scores.growth },
            { label: "Inflation (20%)", score: scores.inflation },
            { label: "Fiscal (15%)",    score: scores.fiscal },
            { label: "External (15%)",  score: scores.external },
            { label: "Monetary (15%)",  score: scores.monetary },
            { label: "Political (10%)", score: scores.political },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between p-2 bg-surface-2 rounded-lg">
              <span className="text-xs text-text-muted">{item.label}</span>
              <span className={cn("text-sm font-bold font-mono", scoreColor(item.score))}>{item.score}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between p-3 bg-accent/10 border border-accent/30 rounded-lg">
          <span className="text-sm font-semibold text-text-primary">Composite Score</span>
          <span className={cn("text-2xl font-bold font-mono", scoreColor(scores.composite))}>{scores.composite} / 100</span>
        </div>
      </Card>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CountryMacroPage() {
  const [selectedCode, setSelectedCode] = useState("US");
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data: countries, isLoading: countriesLoading } = useQuery({
    queryKey: ["country-list"],
    queryFn: () => api.getCountryList(),
    staleTime: 24 * 3600 * 1000,
  });

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["country-macro", selectedCode],
    queryFn: () => api.getCountryMacro(selectedCode),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const LOADING_STEPS = [
    "Fetching World Bank indicators…",
    "Loading equity market data…",
    "Computing FX rates…",
    "Scoring macro dimensions…",
    "Generating insights…",
  ];
  const [loadStep] = useState(0);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <Globe size={18} className="text-accent" />
            Country Macro Dashboard
          </h1>
          <p className="text-xs text-text-muted mt-0.5">Hedge-fund style economic analysis for any country</p>
        </div>

        {/* Country selector */}
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && <RefreshCw size={12} className="text-text-muted animate-spin" />}
          <select
            value={selectedCode}
            onChange={e => { setSelectedCode(e.target.value); setActiveTab("overview"); }}
            className="bg-surface border border-border text-text-primary text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent min-w-[220px]"
            disabled={countriesLoading}
          >
            {countriesLoading && <option>Loading countries…</option>}
            {(countries ?? []).map(c => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <Card className="py-12">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw size={24} className="text-accent animate-spin" />
            <div className="text-sm text-text-muted">Fetching macro data…</div>
            <div className="text-xs text-text-muted/60">This may take 10–20 seconds (World Bank API)</div>
            <div className="space-y-1 text-center">
              {LOADING_STEPS.map((s, i) => (
                <div key={i} className={cn("text-xs", i <= loadStep ? "text-accent" : "text-text-muted/40")}>{s}</div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <Card className="py-8 text-center">
          <XCircle size={20} className="text-red-400 mx-auto mb-2" />
          <div className="text-sm text-red-400">Failed to load macro data</div>
          <div className="text-xs text-text-muted mt-1">{String(error)}</div>
        </Card>
      )}

      {/* Dashboard */}
      {data && !isLoading && (
        <>
          {/* Tab nav */}
          <div className="flex gap-1 flex-wrap border-b border-border pb-0">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                    activeTab === tab.id
                      ? "border-accent text-accent"
                      : "border-transparent text-text-muted hover:text-text-primary",
                  )}
                >
                  <Icon size={12} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div>
            {activeTab === "overview"  && <OverviewTab  d={data} />}
            {activeTab === "economy"   && <EconomyTab   d={data} />}
            {activeTab === "inflation" && <InflationTab  d={data} />}
            {activeTab === "policy"    && <PolicyTab     d={data} />}
            {activeTab === "fiscal"    && <FiscalTab     d={data} />}
            {activeTab === "markets"   && <MarketsTab    d={data} />}
            {activeTab === "risk"      && <RiskTab       d={data} />}
            {activeTab === "analysis"  && <AnalysisTab   d={data} />}
          </div>
        </>
      )}
    </div>
  );
}
