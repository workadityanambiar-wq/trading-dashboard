"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type IPOPerf, type IPOCalendarItem, type IPOLockup, type IPOVal,
  type IPOSector, type IPOComposite, type IPOPrivateCandidate, type IPOExchange,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Legend,
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Lock, Zap, Globe, Search } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt1 = (v: number | null, suffix = "%") =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}${suffix}`;
const fmtRaw = (v: number | null, dec = 1) => v == null ? "—" : v.toFixed(dec);
const clr = (v: number | null) =>
  v == null ? "text-[rgb(var(--text-muted))]" : v >= 0 ? "text-emerald-400" : "text-red-400";
const riskColor: Record<string, string> = {
  CRITICAL: "text-red-400 bg-red-500/10 border-red-500/30",
  HIGH:     "text-orange-400 bg-orange-500/10 border-orange-500/30",
  MEDIUM:   "text-amber-400 bg-amber-500/10 border-amber-500/30",
  LOW:      "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  EXPIRED:  "text-[rgb(var(--text-muted))] bg-[rgb(var(--surface2))] border-[rgb(var(--border))]",
};
const ratingColor: Record<string, string> = {
  EXCEPTIONAL: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  ATTRACTIVE:  "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  NEUTRAL:     "text-[rgb(var(--text-muted))] bg-[rgb(var(--surface2))] border-[rgb(var(--border))]",
  "HIGH RISK": "text-amber-400 bg-amber-500/10 border-amber-500/30",
  AVOID:       "text-red-400 bg-red-500/10 border-red-500/30",
  RICH:        "text-red-400 bg-red-500/10 border-red-500/30",
  "FAIR+":     "text-amber-400 bg-amber-500/10 border-amber-500/30",
  FAIR:        "text-[rgb(var(--text-muted))] bg-[rgb(var(--surface2))] border-[rgb(var(--border))]",
  DISCOUNT:    "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  "DEEP VALUE":"text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};

function Badge({ label, cls }: { label: string; cls?: string }) {
  return (
    <span className={cn("px-1.5 py-0.5 text-[10px] font-semibold rounded border leading-none", cls)}>
      {label}
    </span>
  );
}
function RetCell({ v, size = "sm" }: { v: number | null; size?: "sm" | "xs" }) {
  return (
    <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums",
      size === "sm" ? "text-xs" : "text-[11px]", clr(v))}>
      {fmt1(v)}
    </td>
  );
}
function Kpi({ label, value, sub, color = "text-emerald-400" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-3">
      <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-1">{label}</div>
      <div className={cn("text-2xl font-mono font-bold", color)}>{value}</div>
      {sub && <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] mt-0.5">{sub}</div>}
    </div>
  );
}
function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-[0.18em] border-l-2 border-emerald-400 pl-2">{title}</div>
      {sub && <div className="text-[10px] font-mono text-[rgb(var(--text-muted))]">{sub}</div>}
    </div>
  );
}

// ── Score Gauge (SVG) ─────────────────────────────────────────────────────────
function HealthGauge({ score }: { score: number }) {
  const cx = 90, cy = 90, r = 68, start = -210, total = 240;
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const pt = (deg: number) => ({
    x: cx + r * Math.cos(toRad(deg)),
    y: cy + r * Math.sin(toRad(deg)),
  });
  const arc = (a1: number, a2: number) => {
    const s = pt(a1), e = pt(a2);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M${s.x.toFixed(1)},${s.y.toFixed(1)} A${r},${r} 0 ${large},1 ${e.x.toFixed(1)},${e.y.toFixed(1)}`;
  };
  const fillEnd = start + (score / 100) * total;
  const scoreColor = score >= 75 ? "#10b981" : score >= 55 ? "#06b6d4" : score >= 35 ? "#f59e0b" : "#ef4444";
  return (
    <svg width="180" height="130" viewBox="0 0 180 130" className="overflow-visible">
      <path d={arc(start, start + total)} fill="none" stroke="rgb(42 42 56)" strokeWidth={10} strokeLinecap="round" />
      <path d={arc(start, start + 0.2 * total)} fill="none" stroke="rgba(239,68,68,.3)" strokeWidth={10} strokeLinecap="round" />
      <path d={arc(start + 0.2 * total, start + 0.4 * total)} fill="none" stroke="rgba(245,158,11,.25)" strokeWidth={10} strokeLinecap="round" />
      <path d={arc(start + 0.4 * total, start + 0.75 * total)} fill="none" stroke="rgba(6,182,212,.2)" strokeWidth={10} strokeLinecap="round" />
      <path d={arc(start + 0.75 * total, start + total)} fill="none" stroke="rgba(16,185,129,.2)" strokeWidth={10} strokeLinecap="round" />
      <path d={arc(start, fillEnd)} fill="none" stroke={scoreColor} strokeWidth={10} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${scoreColor})` }} />
      <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle"
        className="font-mono" style={{ fill: scoreColor, fontSize: 30, fontWeight: 700 }}>{score}</text>
      <text x={cx} y={cy + 20} textAnchor="middle"
        style={{ fill: "rgb(107 107 128)", fontSize: 10, fontWeight: 600, letterSpacing: 1 }}>/ 100</text>
    </svg>
  );
}

// ── Score Bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, weight, color = "#10b981" }: { label: string; value: number; weight: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] w-40 shrink-0">
        {label} <span className="text-[rgb(var(--border))]">({weight}%)</span>
      </div>
      <div className="flex-1 h-1.5 bg-[rgb(var(--border))] rounded overflow-hidden">
        <div className="h-full rounded" style={{ width: `${value}%`, background: color }} />
      </div>
      <div className="text-[11px] font-mono font-semibold w-6 text-right" style={{ color }}>{value}</div>
    </div>
  );
}

// ── TABS ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview",     label: "Overview",      icon: TrendingUp },
  { id: "calendar",     label: "Calendar",      icon: Zap },
  { id: "performance",  label: "Performance",   icon: TrendingUp },
  { id: "lockup",       label: "Lockup ⚠",      icon: Lock },
  { id: "valuation",    label: "Valuation",     icon: Search },
  { id: "sectors",      label: "Sectors",       icon: Globe },
  { id: "private",      label: "Private Mkts",  icon: Globe },
  { id: "screener",     label: "HF Screener",   icon: AlertTriangle },
] as const;
type TabId = typeof TABS[number]["id"];

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function IPOPage() {
  const [tab, setTab] = useState<TabId>("overview");

  const overview   = useQuery({ queryKey: ["ipo-overview"],   queryFn: api.getIPOOverview,   staleTime: 5 * 60_000 });
  const perf       = useQuery({ queryKey: ["ipo-perf"],       queryFn: api.getIPOPerformance, staleTime: 5 * 60_000 });
  const calendar   = useQuery({ queryKey: ["ipo-calendar"],   queryFn: api.getIPOCalendar,   staleTime: 60 * 60_000 });
  const lockup     = useQuery({ queryKey: ["ipo-lockup"],     queryFn: api.getIPOLockup,     staleTime: 60 * 60_000 });
  const valuation  = useQuery({ queryKey: ["ipo-valuation"],  queryFn: api.getIPOValuation,  staleTime: 30 * 60_000 });
  const sectors    = useQuery({ queryKey: ["ipo-sectors"],    queryFn: api.getIPOSectors,    staleTime: 5 * 60_000 });
  const screener   = useQuery({ queryKey: ["ipo-screener"],   queryFn: api.getIPOScreener,   staleTime: 5 * 60_000 });
  const priv       = useQuery({ queryKey: ["ipo-private"],    queryFn: api.getIPOPrivate,    staleTime: 60 * 60_000 });

  const anyLoading = [overview, perf, calendar, lockup, valuation, sectors, screener, priv]
    .some(q => q.isFetching);

  const refetchAll = () => {
    [overview, perf, calendar, lockup, valuation, sectors, screener, priv].forEach(q => q.refetch());
  };

  return (
    <div className="p-4 max-w-[1600px] mx-auto page-scroll">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-mono font-bold text-[rgb(var(--text-primary))] tracking-wider uppercase">
            IPO Intelligence Platform
          </h1>
          <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] mt-0.5">
            Institutional-grade · Real yfinance data · {overview.data?.as_of ?? "—"}
          </div>
        </div>
        <button onClick={refetchAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[rgb(var(--border))] text-[rgb(var(--text-muted))] hover:text-emerald-400 hover:border-emerald-500/40 transition-colors">
          <RefreshCw size={12} className={anyLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Tab nav */}
      <div className="flex gap-0 border-b border-[rgb(var(--border))] mb-5 overflow-x-auto scrollbar-hide">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 text-[11px] font-mono font-semibold uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors",
              tab === t.id
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))]"
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-[220px_1fr] gap-4">
            {/* Gauge card */}
            <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4 flex flex-col items-center gap-3">
              <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest">IPO Market Health</div>
              {overview.isLoading
                ? <div className="w-[180px] h-[130px] bg-[rgb(var(--surface2))] animate-pulse rounded" />
                : <HealthGauge score={overview.data?.health.score ?? 0} />}
              <div className={cn("text-sm font-mono font-bold border px-3 py-1 tracking-wider uppercase",
                overview.data?.health.cycle === "Expansion" ? "text-emerald-400 border-emerald-400/50 bg-emerald-500/8" :
                overview.data?.health.cycle === "IPO Mania" ? "text-purple-400 border-purple-400/50" :
                "text-amber-400 border-amber-400/50")}>
                {overview.data?.health.cycle ?? "—"}
              </div>
              <div className="text-[9px] font-mono text-[rgb(var(--text-muted))] text-center leading-5">
                0–20 FREEZE · 20–40 WEAK<br />40–55 NORMAL · 55–75 STRONG<br />75–100 IPO BOOM
              </div>
            </div>

            {/* KPIs + conditions */}
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-5 gap-2">
                <Kpi label="IPOs Tracked" value={String(overview.data?.kpis.ipos_ytd ?? "—")} sub="in universe" />
                <Kpi label="Total Raised" value={overview.data ? `$${overview.data.kpis.capital_raised_b.toFixed(1)}B` : "—"} sub="tracked universe" />
                <Kpi label="Avg Day-1 Ret" value={overview.data?.kpis.avg_d1_return != null ? fmt1(overview.data.kpis.avg_d1_return) : "—"} />
                <Kpi label="Unicorn IPOs" value={String(overview.data?.kpis.unicorn_ipos ?? "—")} sub="≥$1B val" color="text-amber-400" />
                <Kpi label="D1 Win Rate" value={overview.data?.kpis.avg_d1_positive != null ? `${overview.data.kpis.avg_d1_positive}%` : "—"} sub="positive d1" />
              </div>

              {/* Market conditions */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-3">
                  <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-1">VIX</div>
                  <div className={cn("text-xl font-mono font-bold",
                    (overview.data?.market.vix ?? 20) < 15 ? "text-emerald-400" :
                    (overview.data?.market.vix ?? 20) < 22 ? "text-amber-400" : "text-red-400")}>
                    {overview.data?.market.vix ?? "—"}
                  </div>
                  <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] mt-0.5">Fear gauge</div>
                </div>
                <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-3">
                  <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-1">SPY YTD</div>
                  <div className={cn("text-xl font-mono font-bold", clr(overview.data?.market.spy_ytd ?? 0))}>
                    {fmt1(overview.data?.market.spy_ytd ?? null)}
                  </div>
                  <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] mt-0.5">${overview.data?.market.spy_price ?? "—"}</div>
                </div>
                <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-3">
                  <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-1">QQQ YTD</div>
                  <div className={cn("text-xl font-mono font-bold", clr(overview.data?.market.qqq_ytd ?? 0))}>
                    {fmt1(overview.data?.market.qqq_ytd ?? null)}
                  </div>
                  <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] mt-0.5">${overview.data?.market.qqq_price ?? "—"}</div>
                </div>
                <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-3">
                  <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-1">10-Yr Yield</div>
                  <div className={cn("text-xl font-mono font-bold",
                    (overview.data?.market.ten_yr ?? 5) < 4 ? "text-emerald-400" :
                    (overview.data?.market.ten_yr ?? 5) < 4.8 ? "text-amber-400" : "text-red-400")}>
                    {overview.data ? `${overview.data.market.ten_yr.toFixed(2)}%` : "—"}
                  </div>
                  <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] mt-0.5">US Treasury</div>
                </div>
              </div>

              {/* Health score breakdown */}
              {overview.data && (
                <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4">
                  <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-3">Score Components</div>
                  <ScoreBar label="VIX Environment"  value={Math.round(overview.data.health.components.vix_score)}  weight={30} color="#10b981" />
                  <ScoreBar label="Market Momentum"  value={Math.round(overview.data.health.components.mkt_score)}  weight={25} color="#06b6d4" />
                  <ScoreBar label="IPO Sentiment"    value={Math.round(overview.data.health.components.ipo_score)}  weight={25} color="#f59e0b" />
                  <ScoreBar label="Rate Environment" value={Math.round(overview.data.health.components.rate_score)} weight={20} color="#8b5cf6" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CALENDAR ── */}
      {tab === "calendar" && (
        <div className="space-y-5">
          <SectionHead title="Upcoming IPO Pipeline" sub={`${calendar.data?.count ?? 0} deals tracked`} />
          <div className="grid grid-cols-[1fr_320px] gap-4">
            <div className="overflow-x-auto border border-[rgb(var(--border))]">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="bg-[rgb(var(--surface2))] border-b border-[rgb(var(--border))]">
                    {["Company","Ticker","Exchange","Expected Date","Days","Sector","Val ($B)","Raise ($M)"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] text-[rgb(var(--text-muted))] uppercase tracking-wider font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calendar.isLoading
                    ? Array.from({length: 6}).map((_,i) => (
                        <tr key={i}><td colSpan={8} className="px-3 py-2"><div className="h-3 bg-[rgb(var(--surface2))] animate-pulse rounded" /></td></tr>
                      ))
                    : calendar.data?.upcoming.map(ipo => (
                        <tr key={ipo.ticker} className="border-b border-[rgb(var(--border))] hover:bg-[rgb(var(--surface2))] transition-colors">
                          <td className="px-3 py-2 font-semibold text-[rgb(var(--text-primary))]">{ipo.company}</td>
                          <td className="px-3 py-2 text-cyan-400">{ipo.ticker}</td>
                          <td className="px-3 py-2 text-[rgb(var(--text-muted))]">{ipo.exchange}</td>
                          <td className="px-3 py-2">{ipo.expected_date}</td>
                          <td className="px-3 py-2">
                            <span className={cn(ipo.days_to_ipo < 30 ? "text-amber-400" : "text-[rgb(var(--text-muted))]")}>
                              {ipo.days_to_ipo}d
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[rgb(var(--text-muted))]">{ipo.sector}</td>
                          <td className="px-3 py-2 text-right text-emerald-400">${ipo.val_b.toFixed(1)}B</td>
                          <td className="px-3 py-2 text-right">${ipo.raise_m.toLocaleString()}M</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {/* Most anticipated */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-2">Most Anticipated</div>
              {calendar.data?.anticipated.map((ipo, i) => (
                <div key={ipo.ticker} className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-mono font-bold text-[rgb(var(--text-primary))]">#{i+1} {ipo.company}</div>
                      <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] mt-0.5">{ipo.ticker} · {ipo.sector}</div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-xl font-mono font-bold", ipo.interest >= 85 ? "text-emerald-400" : ipo.interest >= 70 ? "text-cyan-400" : "text-amber-400")}>{ipo.interest}</div>
                      <div className="text-[9px] font-mono text-[rgb(var(--text-muted))]">interest</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1 bg-[rgb(var(--border))] rounded overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${ipo.interest}%`, background: ipo.interest >= 85 ? "#10b981" : ipo.interest >= 70 ? "#06b6d4" : "#f59e0b" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PERFORMANCE ── */}
      {tab === "performance" && (
        <div className="space-y-5">
          <SectionHead title="Post-IPO Return Analysis" sub="real yfinance prices from IPO date" />
          <div className="overflow-x-auto border border-[rgb(var(--border))]">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-[rgb(var(--surface2))] border-b border-[rgb(var(--border))]">
                  {["Company","Ticker","IPO Date","IPO $","Current $","Exchange","D1","W1","M1","3M","6M","12M"].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-[10px] text-[rgb(var(--text-muted))] uppercase tracking-wider font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perf.isLoading
                  ? Array.from({length: 8}).map((_,i) => (
                      <tr key={i}><td colSpan={12} className="px-2 py-2"><div className="h-3 bg-[rgb(var(--surface2))] animate-pulse rounded" /></td></tr>
                    ))
                  : perf.data?.performance.map((p: IPOPerf) => (
                      <tr key={p.ticker} className="border-b border-[rgb(var(--border))] hover:bg-[rgb(var(--surface2))] transition-colors">
                        <td className="px-2 py-1.5 font-semibold text-[rgb(var(--text-primary))] whitespace-nowrap">{p.company}</td>
                        <td className="px-2 py-1.5 text-cyan-400">{p.ticker}</td>
                        <td className="px-2 py-1.5 text-[rgb(var(--text-muted))]">{p.ipo_date}</td>
                        <td className="px-2 py-1.5 text-right">${p.ipo_price.toFixed(2)}</td>
                        <td className={cn("px-2 py-1.5 text-right font-semibold", p.current_price && p.current_price > p.ipo_price ? "text-emerald-400" : "text-red-400")}>
                          ${p.current_price?.toFixed(2) ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 text-[rgb(var(--text-muted))]">{p.exchange}</td>
                        <RetCell v={p.d1} />
                        <RetCell v={p.w1} />
                        <RetCell v={p.m1} />
                        <RetCell v={p.m3} />
                        <RetCell v={p.m6} />
                        <RetCell v={p.y1} />
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Day-1 returns bar chart */}
          {perf.data && (
            <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4">
              <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-3">Day-1 Returns</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[...perf.data.performance].filter(p => p.d1 != null).sort((a,b) => (b.d1??0) - (a.d1??0))} margin={{top:0,right:8,bottom:0,left:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(42 42 56)" vertical={false} />
                  <XAxis dataKey="ticker" tick={{ fontSize: 10, fill: "rgb(107 107 128)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "rgb(107 107 128)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ background: "rgb(17 17 24)", border: "1px solid rgb(42 42 56)", borderRadius: 2, fontSize: 11, fontFamily: "monospace" }}
                    formatter={(v: number) => [`${v.toFixed(1)}%`, "Day 1"]} />
                  <Bar dataKey="d1" radius={[2,2,0,0]}>
                    {perf.data.performance.filter(p => p.d1 != null).sort((a,b) => (b.d1??0) - (a.d1??0)).map(p => (
                      <Cell key={p.ticker} fill={(p.d1 ?? 0) >= 0 ? "rgba(16,185,129,.7)" : "rgba(239,68,68,.7)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── LOCKUP ── */}
      {tab === "lockup" && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 mb-4">
            <SectionHead title="Lockup Expiration Monitor" sub="180-day post-IPO unlock events" />
            <span className="text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded">HEDGE FUND CRITICAL</span>
          </div>

          <div className="grid grid-cols-[1fr_280px] gap-4">
            <div className="overflow-x-auto border border-[rgb(var(--border))]">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="bg-[rgb(var(--surface2))] border-b border-[rgb(var(--border))]">
                    {["Company","Ticker","Days Left","Expiry Date","Insider%","VC%","VC Sponsor","Unlock (M shs)","Curr $","Risk"].map(h => (
                      <th key={h} className="px-2 py-2 text-left text-[10px] text-[rgb(var(--text-muted))] uppercase tracking-wider font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lockup.isLoading
                    ? Array.from({length: 8}).map((_,i) => (
                        <tr key={i}><td colSpan={10} className="px-2 py-2"><div className="h-3 bg-[rgb(var(--surface2))] animate-pulse rounded" /></td></tr>
                      ))
                    : lockup.data?.lockups.map((l: IPOLockup) => (
                        <tr key={l.ticker}
                          className={cn("border-b border-[rgb(var(--border))] hover:bg-[rgb(var(--surface2))] transition-colors",
                            l.risk === "CRITICAL" ? "bg-red-500/5" : l.risk === "HIGH" ? "bg-orange-500/3" : "")}>
                          <td className="px-2 py-1.5 font-semibold text-[rgb(var(--text-primary))] whitespace-nowrap">{l.company}</td>
                          <td className="px-2 py-1.5 text-cyan-400">{l.ticker}</td>
                          <td className={cn("px-2 py-1.5 font-bold text-right tabular-nums",
                            l.days_left < 0 ? "text-[rgb(var(--text-muted))]" :
                            l.days_left < 30 ? "text-red-400" : l.days_left < 60 ? "text-orange-400" : l.days_left < 90 ? "text-amber-400" : "text-emerald-400")}>
                            {l.days_left < 0 ? `${Math.abs(l.days_left)}d ago` : `${l.days_left}d`}
                          </td>
                          <td className="px-2 py-1.5 text-[rgb(var(--text-muted))]">{l.expiry_date}</td>
                          <td className="px-2 py-1.5 text-right">{l.insider_pct.toFixed(1)}%</td>
                          <td className="px-2 py-1.5 text-right text-amber-400">{l.vc_pct.toFixed(1)}%</td>
                          <td className="px-2 py-1.5 text-[rgb(var(--text-muted))] text-[10px]">{l.vc}</td>
                          <td className="px-2 py-1.5 text-right">{l.unlock_shares_m != null ? `${l.unlock_shares_m}M` : "—"}</td>
                          <td className="px-2 py-1.5 text-right">{l.current_price != null ? `$${l.current_price.toFixed(2)}` : "—"}</td>
                          <td className="px-2 py-1.5">
                            <Badge label={l.risk} cls={riskColor[l.risk] ?? riskColor.EXPIRED} />
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {/* Risk score card */}
            <div className="flex flex-col gap-3">
              <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4">
                <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-2">Lockup Risk Score</div>
                <div className="flex items-end gap-2 mb-3">
                  <div className={cn("text-5xl font-mono font-bold",
                    (lockup.data?.risk_score ?? 0) >= 70 ? "text-red-400" :
                    (lockup.data?.risk_score ?? 0) >= 50 ? "text-amber-400" : "text-emerald-400")}
                    style={{ textShadow: `0 0 20px ${(lockup.data?.risk_score ?? 0) >= 70 ? "rgba(239,68,68,.4)" : "rgba(245,158,11,.4)"}` }}>
                    {lockup.data?.risk_score ?? "—"}
                  </div>
                  <div className="text-[rgb(var(--text-muted))] font-mono text-sm mb-1">/100</div>
                </div>
                <Badge label={(lockup.data?.risk_score ?? 0) >= 70 ? "HIGH RISK" : (lockup.data?.risk_score ?? 0) >= 40 ? "MODERATE" : "LOW RISK"}
                  cls={(lockup.data?.risk_score ?? 0) >= 70 ? riskColor.HIGH : (lockup.data?.risk_score ?? 0) >= 40 ? riskColor.MEDIUM : riskColor.LOW} />
              </div>

              {/* Critical items */}
              <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4">
                <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-3">Imminent Expirations</div>
                {lockup.data?.lockups.filter(l => l.days_left >= 0 && l.days_left < 90).map(l => (
                  <div key={l.ticker} className="flex justify-between items-center py-1.5 border-b border-[rgb(var(--border))] last:border-b-0">
                    <div className="flex items-center gap-1.5">
                      <div className={cn("w-1.5 h-1.5 rounded-full",
                        l.days_left < 30 ? "bg-red-400 shadow-[0_0_4px_theme(colors.red.400)] animate-pulse" :
                        l.days_left < 60 ? "bg-orange-400" : "bg-amber-400")} />
                      <span className="text-xs font-mono text-[rgb(var(--text-primary))]">{l.company}</span>
                    </div>
                    <span className={cn("text-xs font-mono font-bold",
                      l.days_left < 30 ? "text-red-400" : l.days_left < 60 ? "text-orange-400" : "text-amber-400")}>
                      {l.days_left}d
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── VALUATION ── */}
      {tab === "valuation" && (
        <div className="space-y-5">
          <SectionHead title="IPO Valuation Analysis" sub="real yfinance fundamentals" />
          <div className="grid grid-cols-[1fr_360px] gap-4">
            <div className="overflow-x-auto border border-[rgb(var(--border))]">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="bg-[rgb(var(--surface2))] border-b border-[rgb(var(--border))]">
                    {["Company","Sector","EV/Sales","Fwd P/E","EV/EBITDA","P/Book","Rev Growth","Gross Mgn","vs Peer","Rating"].map(h => (
                      <th key={h} className="px-2 py-2 text-left text-[10px] text-[rgb(var(--text-muted))] uppercase tracking-wider font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {valuation.isLoading
                    ? Array.from({length: 8}).map((_,i) => (
                        <tr key={i}><td colSpan={10} className="px-2 py-2"><div className="h-3 bg-[rgb(var(--surface2))] animate-pulse rounded" /></td></tr>
                      ))
                    : valuation.data?.valuation.map((v: IPOVal) => (
                        <tr key={v.ticker} className="border-b border-[rgb(var(--border))] hover:bg-[rgb(var(--surface2))] transition-colors">
                          <td className="px-2 py-1.5 font-semibold text-[rgb(var(--text-primary))] whitespace-nowrap">{v.company}</td>
                          <td className="px-2 py-1.5 text-[rgb(var(--text-muted))]">{v.sector}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmtRaw(v.ev_sales)}x</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{v.fwd_pe != null ? `${fmtRaw(v.fwd_pe)}x` : "NM"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{v.ev_ebitda != null ? `${fmtRaw(v.ev_ebitda)}x` : "NM"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{v.price_book != null ? `${fmtRaw(v.price_book)}x` : "—"}</td>
                          <td className={cn("px-2 py-1.5 text-right tabular-nums", clr(v.rev_growth))}>{fmt1(v.rev_growth)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[rgb(var(--text-muted))]">{fmt1(v.gross_margin)}</td>
                          <td className={cn("px-2 py-1.5 text-right tabular-nums font-semibold", v.vs_peer_pct != null && v.vs_peer_pct > 0 ? "text-red-400" : "text-emerald-400")}>
                            {v.vs_peer_pct != null ? fmt1(v.vs_peer_pct) : "—"}
                          </td>
                          <td className="px-2 py-1.5">
                            <Badge label={v.rating} cls={ratingColor[v.rating] ?? ratingColor.FAIR} />
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {/* EV/Sales bar chart */}
            {valuation.data && (
              <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4">
                <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-3">EV/Sales Multiple</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={valuation.data.valuation.filter(v => v.ev_sales != null).sort((a,b) => (b.ev_sales??0)-(a.ev_sales??0))} layout="vertical" margin={{left:60,right:20,top:0,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(42 42 56)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "rgb(107 107 128)" }} axisLine={false} tickLine={false} tickFormatter={v=>`${v}x`} />
                    <YAxis type="category" dataKey="ticker" tick={{ fontSize: 10, fill: "rgb(107 107 128)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "rgb(17 17 24)", border: "1px solid rgb(42 42 56)", fontSize: 11, fontFamily: "monospace" }}
                      formatter={(v: number) => [`${v.toFixed(1)}x`, "EV/Sales"]} />
                    <Bar dataKey="ev_sales" radius={[0,2,2,0]}>
                      {valuation.data.valuation.filter(v => v.ev_sales != null).sort((a,b) => (b.ev_sales??0)-(a.ev_sales??0)).map(v => (
                        <Cell key={v.ticker} fill={(v.ev_sales??0) > 15 ? "rgba(239,68,68,.6)" : (v.ev_sales??0) > 8 ? "rgba(245,158,11,.6)" : "rgba(16,185,129,.6)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SECTORS ── */}
      {tab === "sectors" && (
        <div className="space-y-5">
          <SectionHead title="Sector Dashboard" sub="aggregated from tracked IPO universe" />
          {sectors.data && (
            <>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {sectors.data.sectors.slice(0,4).map((s: IPOSector) => (
                  <div key={s.sector} className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4 relative">
                    <div className="absolute top-3 right-3 text-2xl font-mono font-bold text-[rgb(var(--border))]">#{s.rank}</div>
                    <div className="text-sm font-mono font-bold text-[rgb(var(--text-primary))] mb-3">{s.sector}</div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-mono"><span className="text-[rgb(var(--text-muted))]">IPOs</span><span>{s.ipo_count}</span></div>
                      <div className="flex justify-between text-xs font-mono"><span className="text-[rgb(var(--text-muted))]">Raised</span><span className="text-emerald-400">${s.capital_b.toFixed(1)}B</span></div>
                      <div className="flex justify-between text-xs font-mono"><span className="text-[rgb(var(--text-muted))]">Avg D1</span><span className={clr(s.avg_d1)}>{fmt1(s.avg_d1)}</span></div>
                      <div className="flex justify-between text-xs font-mono"><span className="text-[rgb(var(--text-muted))]">Avg 3M</span><span className={clr(s.avg_m3)}>{fmt1(s.avg_m3)}</span></div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4">
                <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-3">Sector Capital Raised vs Avg Day-1 Return</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={sectors.data.sectors} margin={{top:0,right:40,bottom:0,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(42 42 56)" vertical={false} />
                    <XAxis dataKey="sector" tick={{ fontSize: 9, fill: "rgb(107 107 128)" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "rgb(107 107 128)" }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}B`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "rgb(107 107 128)" }} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`} />
                    <Tooltip contentStyle={{ background: "rgb(17 17 24)", border: "1px solid rgb(42 42 56)", fontSize: 11, fontFamily: "monospace" }} />
                    <Bar yAxisId="left" dataKey="capital_b" name="Capital ($B)" fill="rgba(41,121,255,.5)" radius={[2,2,0,0]} />
                    <Line yAxisId="right" type="monotone" dataKey="avg_d1" name="Avg D1 %" stroke="#10b981" dot={{ fill: "#10b981", r: 3 }} strokeWidth={2} />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace" }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
          {sectors.isLoading && <div className="h-64 bg-[rgb(var(--surface2))] animate-pulse rounded" />}
        </div>
      )}

      {/* ── PRIVATE MARKETS ── */}
      {tab === "private" && (
        <div className="space-y-5">
          <SectionHead title="Private Markets & IPO Pipeline" sub="unicorn candidates" />
          <div className="grid grid-cols-5 gap-3 mb-5">
            {priv.data?.candidates.map((c: IPOPrivateCandidate) => (
              <div key={c.name} className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-base font-mono font-bold text-[rgb(var(--text-primary))]">{c.name}</div>
                  <Badge label={c.stage} cls={c.stage === "Pre-IPO" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : "text-[rgb(var(--text-muted))] bg-[rgb(var(--surface2))] border-[rgb(var(--border))]"} />
                </div>
                <div className="text-2xl font-mono font-bold text-emerald-400">${c.val_b}B</div>
                <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] mt-1 space-y-0.5">
                  <div>{c.round} · ${c.raised_b.toFixed(1)}B raised</div>
                  <div>Est. IPO: {c.timeline}</div>
                </div>
                <div className="mt-2 mb-1 flex justify-between text-[10px] font-mono">
                  <span className="text-[rgb(var(--text-muted))]">IPO probability</span>
                  <span className={cn(c.ipo_prob >= 70 ? "text-emerald-400" : c.ipo_prob >= 40 ? "text-amber-400" : "text-[rgb(var(--text-muted))]")}>{c.ipo_prob}%</span>
                </div>
                <div className="h-1 bg-[rgb(var(--border))] rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${c.ipo_prob}%`, background: c.ipo_prob >= 70 ? "#10b981" : "#f59e0b" }} />
                </div>
              </div>
            ))}
            {priv.isLoading && Array.from({length:5}).map((_,i) => (
              <div key={i} className="h-40 bg-[rgb(var(--surface2))] animate-pulse rounded" />
            ))}
          </div>

          {/* Exchange table */}
          <SectionHead title="Global Exchange Activity" />
          <div className="grid grid-cols-[1fr_360px] gap-4">
            <div className="overflow-x-auto border border-[rgb(var(--border))]">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="bg-[rgb(var(--surface2))] border-b border-[rgb(var(--border))]">
                    {["Exchange","Region","IPOs YTD","Capital ($B)","Rank"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] text-[rgb(var(--text-muted))] uppercase tracking-wider font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {priv.data?.exchanges.map((ex: IPOExchange, i) => (
                    <tr key={ex.name} className="border-b border-[rgb(var(--border))] hover:bg-[rgb(var(--surface2))]">
                      <td className="px-3 py-2 font-semibold text-[rgb(var(--text-primary))]">{ex.name}</td>
                      <td className="px-3 py-2 text-[rgb(var(--text-muted))]">{ex.region}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{ex.ipos}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-400">${ex.cap_b.toFixed(1)}B</td>
                      <td className="px-3 py-2">
                        <Badge label={`#${i+1}`} cls={i === 0 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : i <= 2 ? "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" : "text-[rgb(var(--text-muted))] bg-[rgb(var(--surface2))] border-[rgb(var(--border))]"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {priv.data && (
              <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4">
                <div className="text-[10px] font-mono text-[rgb(var(--text-muted))] uppercase tracking-widest mb-3">Capital Raised by Exchange ($B)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[...priv.data.exchanges].sort((a,b) => b.cap_b - a.cap_b)} margin={{top:0,right:8,bottom:20,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(42 42 56)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "rgb(107 107 128)" }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" />
                    <YAxis tick={{ fontSize: 10, fill: "rgb(107 107 128)" }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}B`} />
                    <Tooltip contentStyle={{ background: "rgb(17 17 24)", border: "1px solid rgb(42 42 56)", fontSize: 11, fontFamily: "monospace" }}
                      formatter={(v: number) => [`$${v.toFixed(1)}B`, "Capital"]} />
                    <Bar dataKey="cap_b" radius={[2,2,0,0]}>
                      {[...priv.data.exchanges].sort((a,b) => b.cap_b - a.cap_b).map((ex, i) => (
                        <Cell key={ex.name} fill={i === 0 ? "rgba(16,185,129,.7)" : i <= 2 ? "rgba(6,182,212,.6)" : "rgba(41,121,255,.45)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SCREENER ── */}
      {tab === "screener" && (
        <div className="space-y-5">
          <SectionHead title="Hedge Fund IPO Screener" sub="composite scores + signal generation" />

          {/* Composite scores table */}
          <div className="overflow-x-auto border border-[rgb(var(--border))] mb-4">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-[rgb(var(--surface2))] border-b border-[rgb(var(--border))]">
                  {["Company","Demand","Momentum","Market","Lockup","Insider","Value","COMPOSITE","Rating"].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-[10px] text-[rgb(var(--text-muted))] uppercase tracking-wider font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {screener.isLoading
                  ? Array.from({length:8}).map((_,i) => (
                      <tr key={i}><td colSpan={9} className="px-2 py-2"><div className="h-3 bg-[rgb(var(--surface2))] animate-pulse rounded" /></td></tr>
                    ))
                  : screener.data?.composite_scores.map((s: IPOComposite) => (
                      <tr key={s.ticker} className="border-b border-[rgb(var(--border))] hover:bg-[rgb(var(--surface2))] transition-colors">
                        <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{s.company} <span className="text-cyan-400 font-normal">({s.ticker})</span></td>
                        <td className="px-2 py-1.5 text-right text-emerald-400">{s.scores.demand}</td>
                        <td className="px-2 py-1.5 text-right text-emerald-400">{s.scores.momentum}</td>
                        <td className="px-2 py-1.5 text-right">{s.scores.market}</td>
                        <td className={cn("px-2 py-1.5 text-right", s.scores.lockup < 40 ? "text-red-400" : s.scores.lockup < 70 ? "text-amber-400" : "text-emerald-400")}>{s.scores.lockup}</td>
                        <td className="px-2 py-1.5 text-right">{s.scores.insider}</td>
                        <td className="px-2 py-1.5 text-right text-cyan-400">{s.scores.value}</td>
                        <td className="px-2 py-1.5 text-right">
                          <span className="text-base font-bold" style={{
                            color: s.composite >= 80 ? "#10b981" : s.composite >= 60 ? "#06b6d4" : s.composite >= 40 ? "#f59e0b" : "#ef4444",
                          }}>{s.composite}</span>
                        </td>
                        <td className="px-2 py-1.5">
                          <Badge label={s.rating} cls={ratingColor[s.rating] ?? ratingColor.NEUTRAL} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Signal lists */}
          <div className="grid grid-cols-3 gap-3">
            {/* Best longs */}
            <div className="bg-[rgb(var(--surface))] border border-emerald-500/20 p-4">
              <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest mb-3">▲ Best Long IPOs</div>
              {screener.data?.best_longs.map((s: IPOComposite) => (
                <div key={s.ticker} className="flex justify-between items-center py-1.5 border-b border-[rgb(var(--border))] last:border-b-0">
                  <div className="text-xs font-mono text-[rgb(var(--text-primary))]">{s.company} <span className="text-cyan-400">({s.ticker})</span></div>
                  <div className="text-xs font-mono font-bold text-emerald-400">Score {s.composite}</div>
                </div>
              ))}
              {screener.isLoading && <div className="h-32 animate-pulse bg-[rgb(var(--surface2))] rounded" />}
            </div>

            {/* Lockup shorts */}
            <div className="bg-[rgb(var(--surface))] border border-red-500/20 p-4">
              <div className="text-[10px] font-mono font-bold text-red-400 uppercase tracking-widest mb-3">▼ Lockup Short Candidates</div>
              {screener.data?.lockup_shorts.length === 0
                ? <div className="text-xs font-mono text-[rgb(var(--text-muted))]">No imminent lockups</div>
                : screener.data?.lockup_shorts.map((s: IPOComposite) => (
                    <div key={s.ticker} className="flex justify-between items-center py-1.5 border-b border-[rgb(var(--border))] last:border-b-0">
                      <div className="text-xs font-mono text-[rgb(var(--text-primary))]">{s.company} <span className="text-cyan-400">({s.ticker})</span></div>
                      <div className="text-xs font-mono font-bold text-red-400">{s.lockup_days}d to unlock</div>
                    </div>
                  ))}
              {screener.isLoading && <div className="h-32 animate-pulse bg-[rgb(var(--surface2))] rounded" />}
            </div>

            {/* High conviction */}
            <div className="bg-[rgb(var(--surface))] border border-purple-500/20 p-4">
              <div className="text-[10px] font-mono font-bold text-purple-400 uppercase tracking-widest mb-3">◆ High Conviction Institutional</div>
              {screener.data?.high_conviction.map((s: IPOComposite) => (
                <div key={s.ticker} className="flex justify-between items-center py-1.5 border-b border-[rgb(var(--border))] last:border-b-0">
                  <div className="text-xs font-mono text-[rgb(var(--text-primary))]">{s.company} <span className="text-cyan-400">({s.ticker})</span></div>
                  <div className="text-xs font-mono font-bold text-purple-400">Demand {s.scores.demand}</div>
                </div>
              ))}
              {screener.isLoading && <div className="h-32 animate-pulse bg-[rgb(var(--surface2))] rounded" />}
            </div>

            {/* Overvalued */}
            <div className="bg-[rgb(var(--surface))] border border-amber-500/20 p-4">
              <div className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest mb-3">⚠ Overvalued (High Val $B)</div>
              {screener.data?.overvalued.map((s: IPOComposite) => (
                <div key={s.ticker} className="flex justify-between items-center py-1.5 border-b border-[rgb(var(--border))] last:border-b-0">
                  <div className="text-xs font-mono text-[rgb(var(--text-primary))]">{s.company} <span className="text-cyan-400">({s.ticker})</span></div>
                  <div className="text-xs font-mono font-bold text-amber-400">${s.val_b.toFixed(0)}B val</div>
                </div>
              ))}
              {screener.isLoading && <div className="h-24 animate-pulse bg-[rgb(var(--surface2))] rounded" />}
            </div>

            {/* Undervalued */}
            <div className="bg-[rgb(var(--surface))] border border-cyan-500/20 p-4">
              <div className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-widest mb-3">◉ Undervalued Opportunities</div>
              {screener.data?.undervalued.length === 0
                ? <div className="text-xs font-mono text-[rgb(var(--text-muted))]">None meeting criteria</div>
                : screener.data?.undervalued.map((s: IPOComposite) => (
                    <div key={s.ticker} className="flex justify-between items-center py-1.5 border-b border-[rgb(var(--border))] last:border-b-0">
                      <div className="text-xs font-mono text-[rgb(var(--text-primary))]">{s.company} <span className="text-cyan-400">({s.ticker})</span></div>
                      <div className="text-xs font-mono font-bold text-cyan-400">Score {s.composite}</div>
                    </div>
                  ))}
              {screener.isLoading && <div className="h-24 animate-pulse bg-[rgb(var(--surface2))] rounded" />}
            </div>

            {/* PM Summary */}
            <div className="bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4">
              <div className="text-[10px] font-mono font-bold text-[rgb(var(--text-muted))] uppercase tracking-widest mb-3">PM Outlook</div>
              <div className="space-y-2 text-xs font-mono text-[rgb(var(--text-muted))]">
                <div className="flex justify-between"><span>Market Health</span><span className="text-emerald-400 font-bold">{screener.data?.health_score ?? "—"}/100</span></div>
                <div className="flex justify-between"><span>IPO Cycle</span><span className="text-cyan-400">Expansion</span></div>
                <div className="flex justify-between"><span>Recommended Posture</span><span className="text-emerald-400">Constructive</span></div>
                <div className="border-t border-[rgb(var(--border))] pt-2 mt-2">
                  <div className="text-[rgb(var(--text-muted))] leading-5">
                    Pipeline strong. AI/Semi sector demand elevated. Watch lockup expirations. Rate environment key risk for H2 valuations.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
