"use client";
import { useMarket } from "@/contexts/MarketContext";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, AreaChart, Area, Cell,
  PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { PageGuide } from "@/components/PageGuide";

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  cyan:   "#06b6d4", blue:   "#3b82f6", purple: "#a855f7",
  green:  "#22c55e", amber:  "#f59e0b", red:    "#ef4444",
  orange: "#f97316", indigo: "#6366f1", rose:   "#f43f5e",
  muted:  "var(--text-muted)", border: "var(--border, #2a2f3e)",
  surf2:  "var(--surface-2, #1a1f2e)",
};
const TICK = { fill: "var(--text-muted)", fontSize: 10 };

const TABS = [
  "Overview", "Launch", "Satellites", "Defense Space", "Broadband",
  "Economy", "Government", "Tourism & Lunar", "VC & Private",
  "Public Stocks", "Supply Chain", "Composite",
] as const;
type Tab = typeof TABS[number];

// ── Mini Components ───────────────────────────────────────────────────────────
function Loading() { return <div className="flex items-center justify-center h-40 text-sm" style={{ color: C.muted }}>Loading…</div>; }
function Err({ msg }: { msg: string }) { return <div className="flex items-center justify-center h-40 text-sm text-red-500">{msg}</div>; }
function SH({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.muted }}>{children}</div>;
}
function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
      <div className="text-xs mb-1" style={{ color: C.muted }}>{label}</div>
      <div className="text-xl font-mono font-bold" style={{ color: color ?? "var(--text-primary)" }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}
function Bar2({ val, max, color }: { val: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 rounded-full" style={{ background: C.border }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, val / max * 100)}%`, background: color }} />
      </div>
      <span className="text-xs font-mono" style={{ color }}>{val}</span>
    </div>
  );
}
const SIG_C: Record<string, string> = {
  "STRONG BUY": C.green, "BUY": "#86efac", "HOLD": C.amber,
  "SELL": "#fca5a5", "STRONG SELL": C.red, "SPECULATIVE": C.purple,
};
function SigBadge({ sig }: { sig: string }) {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ color: SIG_C[sig] ?? C.muted, border: `1px solid ${SIG_C[sig] ?? C.muted}` }}>{sig}</span>
  );
}
const PRI: Record<string, { bg: string; fg: string }> = {
  CRITICAL: { bg: "#3f1515", fg: C.red },
  HIGH:     { bg: "#3f2a0a", fg: C.amber },
  MEDIUM:   { bg: "#1a2a3f", fg: C.blue },
  LOW:      { bg: "#1a1f2e", fg: C.muted },
};
function PriBadge({ p }: { p: string }) {
  const s = PRI[p] ?? PRI.LOW;
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: s.bg, color: s.fg }}>{p}</span>;
}
function fmt$(v: number, digits = 1): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(digits)}T`;
  if (v >= 1)    return `$${v.toFixed(digits)}B`;
  return `$${(v * 1000).toFixed(0)}M`;
}
function fmtPct(v: number, alreadyPct = false): string {
  const n = alreadyPct ? v : v * 100;
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ── Space Score Gauge ─────────────────────────────────────────────────────────
function SpaceGauge({ score, label }: { score: number; label: string }) {
  const r = 70; const cx = 100; const cy = 90;
  const angle = Math.PI - (score / 100) * Math.PI;
  const nx = cx + r * Math.cos(angle); const ny = cy - r * Math.sin(angle);
  const zones = [
    { from: 0,  to: 20, color: "#ef4444" },
    { from: 20, to: 40, color: "#f59e0b" },
    { from: 40, to: 60, color: "#eab308" },
    { from: 60, to: 80, color: "#22c55e" },
    { from: 80, to: 100,color: "#06b6d4" },
  ];
  const scoreColor = score >= 80 ? C.cyan : score >= 60 ? C.green : score >= 40 ? C.amber : C.red;
  return (
    <svg viewBox="0 0 200 110" className="w-full max-w-[220px]">
      {zones.map(z => {
        const a1 = Math.PI - (z.from / 100) * Math.PI;
        const a2 = Math.PI - (z.to   / 100) * Math.PI;
        const x1 = cx + r * Math.cos(a1); const y1 = cy - r * Math.sin(a1);
        const x2 = cx + r * Math.cos(a2); const y2 = cy - r * Math.sin(a2);
        return <path key={z.from} d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
          stroke={z.color} strokeWidth="10" fill="none" opacity="0.7" />;
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={scoreColor} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill={scoreColor} />
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="22" fontWeight="bold" fill={scoreColor}>{score}</text>
      <text x={cx} y={cy + 32} textAnchor="middle" fontSize="8" fill="var(--text-muted)">{label}</text>
    </svg>
  );
}

// ── Tab Content ───────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["space-overview"], queryFn: api.getSpaceOverview, staleTime: 300000 });
  if (isLoading) return <Loading />;
  if (error) return <Err msg="Failed to load overview" />;
  const d = data as any;
  const kpis = d.kpis;
  return (
    <div className="space-y-6">
      {/* Hero Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl p-6 flex flex-col items-center justify-center" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SpaceGauge score={d.space_score} label={d.label} />
          <div className="text-center mt-2">
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>Space Economy Score</div>
            <div className="text-lg font-bold mt-1" style={{ color: C.cyan }}>{d.regime}</div>
          </div>
        </div>
        <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Kpi label="Global Economy" value={fmt$(kpis.economy_value_b)} sub={`${fmtPct(kpis.economy_growth_pct, true)} YoY`} color={C.cyan} />
          <Kpi label="Launches YTD" value={kpis.total_launches_ytd} sub="All providers" color={C.blue} />
          <Kpi label="Sats Operational" value={kpis.total_sats_operational.toLocaleString()} sub="All orbits" color={C.purple} />
          <Kpi label="Starlink Subs" value={`${kpis.starlink_subscribers_m}M`} sub="Global broadband" color={C.green} />
          <Kpi label="Defense Space" value={fmt$(kpis.defense_space_b)} sub="US USSF budget" color={C.amber} />
          <Kpi label="VC Invested" value={fmt$(kpis.vc_invested_b)} sub="Private markets" color={C.indigo} />
        </div>
      </div>

      {/* Regime + Cycle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Space Regime</SH>
          <div className="space-y-3">
            {Object.entries(d.components as Record<string, { score: number; weight: number }>).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: "var(--text-primary)" }}>{k}</span>
                  <span className="font-mono" style={{ color: C.cyan }}>{v.score}</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: C.border }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${v.score}%`, background: v.score >= 70 ? C.cyan : v.score >= 50 ? C.blue : C.amber }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Investment Cycle</SH>
          <div className="space-y-2 text-sm">
            {[
              ["Current Phase", d.space_cycle?.current, C.cyan],
              ["Next Phase",    d.space_cycle?.next_phase, C.green],
            ].map(([l, v, col]) => (
              <div key={String(l)} className="flex justify-between items-center py-1 border-b" style={{ borderColor: C.border }}>
                <span style={{ color: C.muted }}>{l}</span>
                <span className="font-semibold" style={{ color: col as string }}>{v}</span>
              </div>
            ))}
            {[["1Y", d.space_cycle?.horizon_1y],["3Y", d.space_cycle?.horizon_3y],["5Y", d.space_cycle?.horizon_5y],["10Y", d.space_cycle?.horizon_10y]].map(([h, txt]) => (
              <div key={String(h)} className="py-1 border-b" style={{ borderColor: C.border }}>
                <span className="text-xs font-mono font-bold mr-2" style={{ color: C.cyan }}>{h}</span>
                <span className="text-xs" style={{ color: "var(--text-primary)" }}>{txt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
        <SH>Intelligence Alerts</SH>
        <div className="space-y-2">
          {d.alerts?.map((a: any) => (
            <div key={a.id} className="flex gap-3 p-3 rounded-lg" style={{ background: "var(--surface)", border: `1px solid ${C.border}` }}>
              <PriBadge p={a.priority} />
              <div>
                <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{a.title}</div>
                <div className="text-xs mt-0.5" style={{ color: C.muted }}>{a.detail}</div>
                <div className="flex gap-1 mt-1">{a.tickers?.map((t: string) => (
                  <span key={t} className="text-[10px] px-1 rounded" style={{ background: C.border, color: C.cyan }}>{t}</span>
                ))}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Opportunities */}
      <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
        <SH>Top Investment Opportunities</SH>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {d.top_opportunities?.map((op: any) => (
            <div key={op.ticker} className="p-3 rounded-lg" style={{ background: "var(--surface)", border: `1px solid ${C.border}` }}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-bold font-mono" style={{ color: C.cyan }}>{op.ticker}</span>
                <Bar2 val={op.conviction} max={100} color={op.conviction >= 85 ? C.green : C.blue} />
              </div>
              <div className="text-xs" style={{ color: C.muted }}>{op.thesis}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LaunchTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["space-launch"], queryFn: api.getSpaceLaunch, staleTime: 300000 });
  if (isLoading) return <Loading />;
  if (error) return <Err msg="Failed to load launch data" />;
  const d = data as any;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Total Launches 2024" value={d.total_launches_2024} sub="All providers" color={C.cyan} />
        <Kpi label="Launch Activity Index" value={d.launch_activity_index} sub="/100" color={C.blue} />
        <Kpi label="SpaceX Dominance" value={`${d.spacex_dominance_pct}%`} sub="Market share" color={C.green} />
        <Kpi label="US Market Share" value={`${d.us_market_share_pct}%`} sub="By launches" color={C.purple} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Launch History</SH>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={d.history}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="year" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1f2e", border: `1px solid ${C.border}`, borderRadius: 8 }} />
              <Area type="monotone" dataKey="spacex" stackId="1" stroke={C.cyan}  fill={C.cyan}  fillOpacity={0.6} name="SpaceX" />
              <Area type="monotone" dataKey="china"  stackId="1" stroke={C.red}   fill={C.red}   fillOpacity={0.5} name="China" />
              <Area type="monotone" dataKey="other"  stackId="1" stroke={C.blue}  fill={C.blue}  fillOpacity={0.4} name="Other" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Market Share 2024</SH>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={d.market_share_data} dataKey="value" nameKey="name" outerRadius={80} label={({ name, value }) => `${name.split(" ")[0]} ${value}%`} labelLine={false} fontSize={9}>
                {d.market_share_data?.map((_: any, i: number) => (
                  <Cell key={i} fill={[C.cyan, C.red, C.blue, C.green, C.amber, C.purple, C.orange, C.indigo, C.rose][i % 9]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1a1f2e", border: `1px solid ${C.border}`, borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
        <SH>Launch Provider Intelligence</SH>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: C.muted }}>
                {["Provider","Country","Launches 2024","YTD","Success %","Cost/kg","Payload kg","Reusable","Market Share","Status"].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.providers?.map((p: any) => (
                <tr key={p.name} className="border-t" style={{ borderColor: C.border }}>
                  <td className="py-2 px-2 font-semibold" style={{ color: "var(--text-primary)" }}>{p.name}</td>
                  <td className="py-2 px-2">{p.flag} {p.country}</td>
                  <td className="py-2 px-2 font-mono text-center" style={{ color: C.cyan }}>{p.launches_2024}</td>
                  <td className="py-2 px-2 font-mono text-center" style={{ color: C.blue }}>{p.launches_ytd}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: p.success_rate >= 97 ? C.green : C.amber }}>{p.success_rate}%</td>
                  <td className="py-2 px-2 font-mono">${p.cost_per_kg.toLocaleString()}</td>
                  <td className="py-2 px-2 font-mono">{p.payload_capacity_kg.toLocaleString()}</td>
                  <td className="py-2 px-2 text-center">{p.reusable ? <span style={{ color: C.green }}>✓</span> : <span style={{ color: C.muted }}>–</span>}</td>
                  <td className="py-2 px-2 font-mono">{(p.market_share * 100).toFixed(0)}%</td>
                  <td className="py-2 px-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: p.status === "Dominant" ? C.cyan : p.status === "Growing" ? C.green : C.amber, border: `1px solid currentColor` }}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SatelliteTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["space-satellite"], queryFn: api.getSpaceSatellite, staleTime: 300000 });
  if (isLoading) return <Loading />;
  if (error) return <Err msg="Failed to load satellite data" />;
  const d = data as any;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Sats Operational" value={d.total_operational?.toLocaleString()} sub="All categories" color={C.cyan} />
        <Kpi label="Sats Planned" value={d.total_planned?.toLocaleString()} sub="Approved constellations" color={C.blue} />
        <Kpi label="Satellite Revenue" value={fmt$(d.total_revenue_b)} sub="Annual" color={C.green} />
        <Kpi label="Demand Score" value={d.demand_score} sub="/100" color={C.purple} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>LEO Satellite Growth</SH>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={d.history}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="year" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1f2e", border: `1px solid ${C.border}`, borderRadius: 8 }} />
              <Area type="monotone" dataKey="starlink" stackId="1" stroke={C.cyan}  fill={C.cyan}  fillOpacity={0.7} name="Starlink" />
              <Area type="monotone" dataKey="other"    stackId="1" stroke={C.blue}  fill={C.blue}  fillOpacity={0.5} name="Other" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Constellation Details</SH>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {d.constellations?.map((c: any) => (
              <div key={c.name} className="flex items-center justify-between text-xs py-1.5 border-b" style={{ borderColor: C.border }}>
                <div>
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{c.name}</span>
                  <span className="ml-1.5 text-[10px]" style={{ color: C.muted }}>{c.category}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono" style={{ color: C.cyan }}>{c.sats_operational.toLocaleString()} ops</span>
                  <span className="text-[10px] px-1 rounded" style={{ color: c.status === "Operational" ? C.green : C.amber, border: `1px solid currentColor` }}>{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DefenseSpaceTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["space-defense"], queryFn: api.getSpaceDefense, staleTime: 300000 });
  if (isLoading) return <Loading />;
  if (error) return <Err msg="Failed to load defense space data" />;
  const d = data as any;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Total Defense Space" value={fmt$(d.total_defense_space_b)} sub="Global tracked" color={C.red} />
        <Kpi label="US USSF Budget" value={fmt$(d.us_defense_space_b)} sub="FY2026" color={C.amber} />
        <Kpi label="Avg YoY Growth" value={`${d.avg_growth_pct}%`} sub="All countries" color={C.orange} />
        <Kpi label="Militarization Score" value={d.militarization_score} sub="/100" color={C.purple} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Country Space Military Budgets</SH>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.country_budgets} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis type="number" tick={TICK} />
              <YAxis dataKey="country" type="category" tick={TICK} width={70} />
              <Tooltip contentStyle={{ background: "#1a1f2e", border: `1px solid ${C.border}`, borderRadius: 8 }}
                formatter={(v: number) => [`$${v}B`, "Budget"]} />
              <Bar dataKey="space_mil_b" fill={C.red} radius={[0, 4, 4, 0]}>
                {d.country_budgets?.map((_: any, i: number) => (
                  <Cell key={i} fill={i === 0 ? C.cyan : i === 1 ? C.red : C.blue} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Critical Programs</SH>
          <div className="space-y-2">
            {d.critical_programs?.map((p: any) => (
              <div key={p.program} className="flex justify-between items-center text-xs py-1.5 border-b" style={{ borderColor: C.border }}>
                <div>
                  <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{p.program}</div>
                  <div style={{ color: C.muted }}>{p.category}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold" style={{ color: C.red }}>{fmt$(p.budget_b)}</div>
                  <div style={{ color: C.amber }}>+{p.yoy_pct}% YoY</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
        <SH>All Defense Space Programs</SH>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: C.muted }}>
                {["Program","Country","Budget","YoY","Category","Priority","Status"].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.programs?.map((p: any) => (
                <tr key={p.program} className="border-t" style={{ borderColor: C.border }}>
                  <td className="py-2 px-2 font-semibold" style={{ color: "var(--text-primary)" }}>{p.program}</td>
                  <td className="py-2 px-2">{p.country}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: C.red }}>{fmt$(p.budget_b)}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: C.amber }}>+{p.yoy_pct}%</td>
                  <td className="py-2 px-2" style={{ color: C.muted }}>{p.category}</td>
                  <td className="py-2 px-2"><PriBadge p={p.priority} /></td>
                  <td className="py-2 px-2 text-[10px]" style={{ color: p.status === "Surge" ? C.red : C.muted }}>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BroadbandTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["space-broadband"], queryFn: api.getSpaceBroadband, staleTime: 300000 });
  if (isLoading) return <Loading />;
  if (error) return <Err msg="Failed to load broadband data" />;
  const d = data as any;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Total Subscribers" value={`${d.total_broadband_subs_m?.toFixed(2)}M`} sub="All providers" color={C.cyan} />
        <Kpi label="Annual Revenue" value={fmt$(d.total_rev_b)} sub="Satellite broadband" color={C.green} />
        <Kpi label="Demand Score" value={d.demand_score} sub="/100" color={C.blue} />
        <Kpi label="Addressable Market" value={fmt$(d.addressable_market_b)} sub="Long-term potential" color={C.purple} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Subscriber Growth</SH>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={d.history}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="year" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1f2e", border: `1px solid ${C.border}`, borderRadius: 8 }} />
              <Area type="monotone" dataKey="starlink" stroke={C.cyan}   fill={C.cyan}   fillOpacity={0.6} name="Starlink (M)" />
              <Area type="monotone" dataKey="oneweb"   stroke={C.blue}   fill={C.blue}   fillOpacity={0.4} name="OneWeb (M)" />
              <Area type="monotone" dataKey="ses_o3b"  stroke={C.purple} fill={C.purple} fillOpacity={0.3} name="SES O3b (M)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Revenue Verticals</SH>
          <div className="space-y-2">
            {d.verticals?.map((v: any) => (
              <div key={v.name} className="flex items-center justify-between text-xs py-1.5 border-b" style={{ borderColor: C.border }}>
                <div>
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{v.name}</span>
                  <span className="ml-2 text-[10px]" style={{ color: v.growth === "Hypergrowth" ? C.cyan : C.green }}>{v.growth}</span>
                </div>
                <div className="flex gap-3 items-center">
                  <span style={{ color: C.muted }}>{v.share_pct}% mix</span>
                  <span className="font-mono" style={{ color: C.green }}>${v.arpu.toLocaleString()}/mo</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {[d.starlink, d.kuiper, d.oneweb, d.ses_o3b].filter(Boolean).map((c: any) => (
          <div key={c.name} className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
            <div className="text-xs font-semibold mb-2" style={{ color: C.cyan }}>{c.name}</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span style={{ color: C.muted }}>Operational</span><span className="font-mono" style={{ color: "var(--text-primary)" }}>{c.sats_operational.toLocaleString()}</span></div>
              <div className="flex justify-between"><span style={{ color: C.muted }}>Subscribers</span><span className="font-mono" style={{ color: C.green }}>{c.subscribers_m}M</span></div>
              <div className="flex justify-between"><span style={{ color: C.muted }}>Revenue</span><span className="font-mono" style={{ color: C.amber }}>{fmt$(c.rev_ann_b)}/yr</span></div>
              <div className="flex justify-between"><span style={{ color: C.muted }}>Status</span><span style={{ color: c.status === "Operational" ? C.green : C.amber }}>{c.status}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EconomyTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["space-economy"], queryFn: api.getSpaceEconomy, staleTime: 300000 });
  if (isLoading) return <Loading />;
  if (error) return <Err msg="Failed to load economy data" />;
  const d = data as any;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="2024 Economy" value={fmt$(d.total_rev_2024_b)} sub={`${fmtPct(d.yoy_growth_pct, true)} YoY`} color={C.cyan} />
        <Kpi label="Momentum Score" value={d.momentum_score} sub="/100" color={C.blue} />
        <Kpi label="$1T Target Year" value={d.trillion_dollar_year} sub="Projected" color={C.green} />
        <Kpi label="2030 Forecast" value={fmt$(d.forecasts?.at(-1)?.total ?? 0)} sub="Baseline scenario" color={C.purple} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Space Economy Forecast ($B)</SH>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={d.forecasts}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="year" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1f2e", border: `1px solid ${C.border}`, borderRadius: 8 }} />
              <Area type="monotone" dataKey="commercial" stackId="1" stroke={C.cyan}   fill={C.cyan}   fillOpacity={0.6} name="Commercial" />
              <Area type="monotone" dataKey="govt"       stackId="1" stroke={C.purple} fill={C.purple} fillOpacity={0.4} name="Government" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Segment Mix</SH>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={d.sector_mix} dataKey="value" nameKey="name" outerRadius={75} label={({ name, value }) => `${value}%`} labelLine={false} fontSize={8}>
                {d.sector_mix?.map((_: any, i: number) => (
                  <Cell key={i} fill={[C.cyan, C.blue, C.purple, C.red, C.amber, C.green, C.orange, C.indigo, C.rose][i % 9]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1a1f2e", border: `1px solid ${C.border}`, borderRadius: 8 }} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
        <SH>Segment Revenue Breakdown</SH>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: C.muted }}>
                {["Segment","2023 Rev","2024 Rev","YoY","5Y CAGR","Share"].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.segments?.map((s: any) => {
                const yoy = (s.rev_2024_b - s.rev_2023_b) / s.rev_2023_b * 100;
                return (
                  <tr key={s.segment} className="border-t" style={{ borderColor: C.border }}>
                    <td className="py-2 px-2 font-semibold" style={{ color: "var(--text-primary)" }}>{s.segment}</td>
                    <td className="py-2 px-2 font-mono" style={{ color: C.muted }}>{fmt$(s.rev_2023_b)}</td>
                    <td className="py-2 px-2 font-mono" style={{ color: C.cyan }}>{fmt$(s.rev_2024_b)}</td>
                    <td className="py-2 px-2 font-mono" style={{ color: yoy >= 15 ? C.green : yoy >= 5 ? C.amber : C.muted }}>{fmtPct(yoy, true)}</td>
                    <td className="py-2 px-2 font-mono" style={{ color: s.cagr_5y >= 0.20 ? C.cyan : C.blue }}>{fmtPct(s.cagr_5y * 100, true)}/yr</td>
                    <td className="py-2 px-2 font-mono" style={{ color: C.muted }}>{s.share_pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GovernmentTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["space-govt"], queryFn: api.getSpaceGovernment, staleTime: 300000 });
  if (isLoading) return <Loading />;
  if (error) return <Err msg="Failed to load government data" />;
  const d = data as any;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Total Govt Spend" value={fmt$(d.total_budget_b)} sub="All agencies" color={C.cyan} />
        <Kpi label="Civil Space Spend" value={fmt$(d.civil_spending_b)} sub="Ex-USSF" color={C.blue} />
        <Kpi label="Avg Growth" value={`${d.avg_growth_pct}%`} sub="YoY" color={C.green} />
        <Kpi label="Spending Index" value={d.spending_index} sub="/100" color={C.purple} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Agency Budget Comparison</SH>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.agencies?.slice(0, 7)}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1f2e", border: `1px solid ${C.border}`, borderRadius: 8 }}
                formatter={(v: number) => [`$${v}B`, "Budget"]} />
              <Bar dataKey="budget_b" radius={[4, 4, 0, 0]}>
                {d.agencies?.map((_: any, i: number) => (
                  <Cell key={i} fill={[C.cyan, C.blue, C.red, C.purple, C.green, C.amber, C.orange][i % 7]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Historical Spending Trend</SH>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={d.history}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="year" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1f2e", border: `1px solid ${C.border}`, borderRadius: 8 }} />
              <Line type="monotone" dataKey="nasa"  stroke={C.cyan}   dot={false} name="NASA" />
              <Line type="monotone" dataKey="esa"   stroke={C.blue}   dot={false} name="ESA" />
              <Line type="monotone" dataKey="cnsa"  stroke={C.red}    dot={false} name="CNSA" />
              <Line type="monotone" dataKey="isro"  stroke={C.green}  dot={false} name="ISRO" />
              <Line type="monotone" dataKey="jaxa"  stroke={C.purple} dot={false} name="JAXA" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
        <SH>Agency Intelligence</SH>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: C.muted }}>
                {["Agency","Country","Budget","YoY","Headcount","Commercial %","Key Programs"].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.agencies?.map((a: any) => (
                <tr key={a.name} className="border-t" style={{ borderColor: C.border }}>
                  <td className="py-2 px-2 font-bold" style={{ color: "var(--text-primary)" }}>{a.flag} {a.name}</td>
                  <td className="py-2 px-2">{a.country}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: C.cyan }}>{fmt$(a.budget_b)}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: a.yoy_pct >= 10 ? C.green : a.yoy_pct < 0 ? C.red : C.amber }}>{a.yoy_pct >= 0 ? "+" : ""}{a.yoy_pct}%</td>
                  <td className="py-2 px-2 font-mono">{a.headcount.toLocaleString()}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: C.blue }}>{(a.commercial_pct * 100).toFixed(0)}%</td>
                  <td className="py-2 px-2 text-[10px]" style={{ color: C.muted }}>{a.key_programs.slice(0, 2).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TourismLunarTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["space-tourism-lunar"], queryFn: api.getSpaceTourismLunar, staleTime: 300000 });
  if (isLoading) return <Loading />;
  if (error) return <Err msg="Failed to load tourism/lunar data" />;
  const d = data as any;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Tourism Revenue" value={`$${d.total_tourism_rev_m}M`} sub="Annual" color={C.cyan} />
        <Kpi label="Total Space Tourists" value={d.total_passengers} sub="All time" color={C.blue} />
        <Kpi label="Tourism Score" value={d.tourism_score} sub="/100" color={C.green} />
        <Kpi label="Lunar Programs" value={d.total_lunar_budget_b ? fmt$(d.total_lunar_budget_b) : "–"} sub="Budget tracked" color={C.amber} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Space Tourism Operators</SH>
          <div className="space-y-3">
            {d.tourism?.map((t: any) => (
              <div key={t.operator} className="p-3 rounded-lg" style={{ background: "var(--surface)", border: `1px solid ${C.border}` }}>
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <div className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{t.operator}</div>
                    <div className="text-[10px]" style={{ color: C.muted }}>{t.vehicle} · {t.type}</div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: t.status === "Active" ? C.green : C.amber, border: "1px solid currentColor" }}>{t.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><div style={{ color: C.muted }}>Ticket</div><div className="font-mono" style={{ color: C.cyan }}>${(t.ticket_usd / 1000000).toFixed(1)}M</div></div>
                  <div><div style={{ color: C.muted }}>Flights</div><div className="font-mono" style={{ color: C.blue }}>{t.flights_total}</div></div>
                  <div><div style={{ color: C.muted }}>Pax</div><div className="font-mono" style={{ color: C.green }}>{t.passengers_total}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Lunar Programs</SH>
          <div className="space-y-2">
            {d.lunar_programs?.map((p: any) => (
              <div key={p.mission} className="text-xs py-2 border-b" style={{ borderColor: C.border }}>
                <div className="flex justify-between items-center">
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{p.mission}</span>
                  <span className="text-[10px] px-1 rounded" style={{ color: p.status === "Development" ? C.blue : p.status === "Pre-launch" ? C.green : C.amber, border: "1px solid currentColor" }}>{p.status}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span style={{ color: C.muted }}>{p.agency} · {p.year}</span>
                  <span className="font-mono" style={{ color: C.amber }}>{fmt$(p.budget_b)}</span>
                </div>
                <div style={{ color: C.muted }} className="text-[10px] mt-0.5">{p.objective}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
        <SH>Deep Space Intelligence</SH>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <div className="font-semibold mb-2" style={{ color: C.cyan }}>Mars Missions</div>
            {d.deep_space?.mars_missions?.map((m: any) => (
              <div key={m.name} className="py-1 border-b" style={{ borderColor: C.border }}>
                <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{m.name}</div>
                <div style={{ color: C.muted }}>{m.agency} · {m.year} · {fmt$(m.budget_b)}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="font-semibold mb-2" style={{ color: C.amber }}>Asteroid Mining</div>
            <div className="text-xs" style={{ color: C.muted }}>{d.deep_space?.asteroid_mining}</div>
          </div>
          <div>
            <div className="font-semibold mb-2" style={{ color: C.purple }}>Deep Space Score</div>
            <div className="text-4xl font-mono font-bold" style={{ color: C.purple }}>{d.deep_space?.deep_space_score}</div>
            <div className="text-xs mt-1" style={{ color: C.muted }}>Pre-commercial phase · Long-horizon investment</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VCTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["space-vc"], queryFn: api.getSpaceVC, staleTime: 300000 });
  if (isLoading) return <Loading />;
  if (error) return <Err msg="Failed to load VC data" />;
  const d = data as any;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Portfolio Value" value={fmt$(d.total_portfolio_val_b)} sub="Total VC portfolio" color={C.cyan} />
        <Kpi label="Total Raised" value={fmt$(d.total_raised_b)} sub="Tracked companies" color={C.blue} />
        <Kpi label="Private Market Score" value={d.vc_score} sub="/100" color={C.green} />
        <Kpi label="IPO Candidates" value={d.ipo_candidates?.length ?? 0} sub="High probability" color={C.purple} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>VC Activity History ($B)</SH>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.history}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="year" tick={TICK} />
              <YAxis tick={TICK} yAxisId="left" />
              <YAxis orientation="right" tick={TICK} yAxisId="right" />
              <Tooltip contentStyle={{ background: "#1a1f2e", border: `1px solid ${C.border}`, borderRadius: 8 }} />
              <Bar dataKey="total_b" fill={C.cyan} radius={[4, 4, 0, 0]} yAxisId="left" name="$B Raised" />
              <Line type="monotone" dataKey="deal_count" stroke={C.amber} dot={false} yAxisId="right" name="Deals" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Portfolio Companies</SH>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {d.top_by_val?.map((v: any) => (
              <div key={v.company} className="flex justify-between items-center text-xs py-1.5 border-b" style={{ borderColor: C.border }}>
                <div>
                  <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{v.company}</div>
                  <div style={{ color: C.muted }}>{v.category}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold" style={{ color: C.cyan }}>{fmt$(v.val_b)}</div>
                  <div className="text-[10px]" style={{ color: v.status === "Pre-IPO" ? C.green : C.muted }}>{v.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
        <SH>Full VC Pipeline</SH>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: C.muted }}>
                {["Company","Category","Stage","Valuation","Raised","Key Investors","Status"].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.companies?.map((v: any) => (
                <tr key={v.company} className="border-t" style={{ borderColor: C.border }}>
                  <td className="py-2 px-2 font-semibold" style={{ color: "var(--text-primary)" }}>{v.company}</td>
                  <td className="py-2 px-2" style={{ color: C.muted }}>{v.category}</td>
                  <td className="py-2 px-2 text-[10px]" style={{ color: C.blue }}>{v.stage}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: C.cyan }}>{fmt$(v.val_b)}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: C.muted }}>{fmt$(v.funding_b)}</td>
                  <td className="py-2 px-2 text-[10px]" style={{ color: C.muted }}>{v.investors.slice(0, 2).join(", ")}</td>
                  <td className="py-2 px-2 text-[10px]" style={{ color: v.status === "Pre-IPO" || v.status === "IPO Candidate" ? C.green : v.status === "Revenue" ? C.blue : C.muted }}>{v.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StocksTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["space-stocks"], queryFn: api.getSpaceStocks, staleTime: 120000 });
  if (isLoading) return <Loading />;
  if (error) return <Err msg="Failed to load stock data" />;
  const d = data as any;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Pure Play Space" value={d.pure_play_count} sub="Direct exposure" color={C.cyan} />
        <Kpi label="Defense Exposure" value={d.defense_exposure_count} sub="Large cap" color={C.blue} />
        <Kpi label="Top Signal" value={d.stocks?.[0]?.signal ?? "–"} sub={d.stocks?.[0]?.ticker ?? "–"} color={C.green} />
        <Kpi label="As Of" value={d.as_of ?? "–"} sub="Market close" color={C.muted} />
      </div>

      <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
        <SH>Space Stock Universe — Live Signals</SH>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: C.muted }}>
                {["Ticker","Name","Price","Day %","YTD %","RSI","Score","Signal","Target","Stop","Exp Ret","Rating"].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.stocks?.map((s: any) => (
                <tr key={s.ticker} className="border-t" style={{ borderColor: C.border }}>
                  <td className="py-2 px-2 font-bold font-mono" style={{ color: C.cyan }}>{s.ticker}</td>
                  <td className="py-2 px-2 text-[11px]" style={{ color: "var(--text-primary)" }}>{s.name}</td>
                  <td className="py-2 px-2 font-mono">${s.price?.toFixed(2)}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: s.chg_pct >= 0 ? C.green : C.red }}>{fmtPct(s.chg_pct, true)}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: s.chg_ytd >= 0 ? C.green : C.red }}>{fmtPct(s.chg_ytd, true)}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: s.rsi >= 70 ? C.red : s.rsi <= 30 ? C.green : C.amber }}>{s.rsi?.toFixed(0)}</td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1">
                      <div className="w-10 h-1 rounded-full" style={{ background: C.border }}>
                        <div className="h-full rounded-full" style={{ width: `${s.score}%`, background: s.score >= 70 ? C.cyan : s.score >= 50 ? C.blue : C.amber }} />
                      </div>
                      <span className="font-mono">{s.score}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2"><SigBadge sig={s.signal} /></td>
                  <td className="py-2 px-2 font-mono" style={{ color: C.green }}>${s.target?.toFixed(2)}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: C.red }}>${s.stop?.toFixed(2)}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: C.green }}>{s.exp_return?.toFixed(1)}%</td>
                  <td className="py-2 px-2"><SigBadge sig={s.rating} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SupplyChainTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["space-supply"], queryFn: api.getSpaceSupplyChain, staleTime: 300000 });
  if (isLoading) return <Loading />;
  if (error) return <Err msg="Failed to load supply chain data" />;
  const d = data as any;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Resilience Score" value={d.resilience_score} sub="/100" color={d.resilience_score >= 60 ? C.green : C.red} />
        <Kpi label="Critical Items" value={d.critical_count} sub="Immediate risk" color={C.red} />
        <Kpi label="High Risk Items" value={d.high_risk_count} sub="Elevated" color={C.amber} />
        <Kpi label="Avg Domestic %" value={`${d.avg_domestic_pct}%`} sub="Supply sourced locally" color={C.blue} />
      </div>

      {(d.xenon_bottleneck || d.rad_hard_chip_risk) && (
        <div className="flex gap-3 flex-wrap">
          {d.xenon_bottleneck && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: "#3f2a0a", border: `1px solid ${C.amber}`, color: C.amber }}>
              ⚠ Xenon Propellant Bottleneck — Ion thruster demand exceeds supply
            </div>
          )}
          {d.rad_hard_chip_risk && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: "#3f1515", border: `1px solid ${C.red}`, color: C.red }}>
              🔴 Radiation-Hardened Chip Shortage — Long lead times for space-grade semiconductors
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
        <SH>Supply Chain Risk Matrix</SH>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: C.muted }}>
                {["Input","Category","Criticality","Domestic %","Risk Score","Constraint","Key Suppliers"].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.inputs?.map((s: any) => (
                <tr key={s.input} className="border-t" style={{ borderColor: C.border }}>
                  <td className="py-2 px-2 font-semibold" style={{ color: "var(--text-primary)" }}>{s.input}</td>
                  <td className="py-2 px-2" style={{ color: C.muted }}>{s.cat}</td>
                  <td className="py-2 px-2"><Bar2 val={s.criticality} max={100} color={s.criticality >= 90 ? C.red : C.amber} /></td>
                  <td className="py-2 px-2 font-mono" style={{ color: s.domestic_pct >= 50 ? C.green : C.red }}>{s.domestic_pct}%</td>
                  <td className="py-2 px-2"><Bar2 val={s.risk} max={100} color={s.risk >= 70 ? C.red : s.risk >= 50 ? C.amber : C.green} /></td>
                  <td className="py-2 px-2"><PriBadge p={s.constraint} /></td>
                  <td className="py-2 px-2 text-[10px]" style={{ color: C.muted }}>{s.suppliers.slice(0, 2).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CompositeTab() {
  const { data, isLoading, error } = useQuery({ queryKey: ["space-composite"], queryFn: api.getSpaceComposite, staleTime: 120000 });
  if (isLoading) return <Loading />;
  if (error) return <Err msg="Failed to load composite data" />;
  const d = data as any;
  return (
    <div className="space-y-6">
      {/* Top Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl p-6 flex flex-col items-center justify-center" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SpaceGauge score={d.composite_score} label={d.label} />
          <div className="text-center mt-2">
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>Space Bullishness Score</div>
            <div className="text-lg font-bold mt-1" style={{ color: C.cyan }}>{d.regime}</div>
          </div>
        </div>
        <div className="md:col-span-2 grid grid-cols-2 gap-3">
          <Kpi label="Economy Value" value={fmt$(d.economy_value_b)} sub={`+${d.economy_growth_pct}% YoY`} color={C.cyan} />
          <Kpi label="Supercycle Probability" value={`${d.supercycle_probability}%`} sub="Next 5 years" color={C.purple} />
          <Kpi label="Smart Money Score" value={d.institutional_flow?.smart_money_score} sub="/100" color={C.green} />
          <Kpi label="Sentiment Score" value={d.sentiment?.overall_score} sub={d.sentiment?.label} color={C.amber} />
        </div>
      </div>

      {/* Component Weights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Composite Components (Weighted)</SH>
          <div className="space-y-3">
            {Object.entries(d.components as Record<string, { score: number; weight: number }>).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: "var(--text-primary)" }}>{k}</span>
                  <span className="text-[10px]" style={{ color: C.muted }}>{(v.weight * 100).toFixed(0)}% weight · <span className="font-mono" style={{ color: C.cyan }}>{v.score}</span></span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: C.border }}>
                  <div className="h-full rounded-full" style={{ width: `${v.score}%`, background: v.score >= 70 ? C.cyan : v.score >= 50 ? C.blue : C.amber }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Best Long Positions</SH>
          <div className="space-y-3">
            {d.best_longs?.map((b: any) => (
              <div key={b.ticker} className="p-3 rounded-lg" style={{ background: "var(--surface)", border: `1px solid ${C.border}` }}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-bold font-mono" style={{ color: C.cyan }}>{b.ticker}</span>
                  <Bar2 val={b.conviction} max={100} color={b.conviction >= 88 ? C.green : C.blue} />
                </div>
                <div className="text-xs" style={{ color: C.muted }}>{b.reason}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trading Signals */}
      <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
        <SH>Trading Signal Engine — All Space Stocks</SH>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: C.muted }}>
                {["Ticker","Name","Price","Signal","Score","Entry","Target","Stop","Exp Return","Confidence"].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.signals?.map((s: any) => (
                <tr key={s.ticker} className="border-t" style={{ borderColor: C.border }}>
                  <td className="py-2 px-2 font-bold font-mono" style={{ color: C.cyan }}>{s.ticker}</td>
                  <td className="py-2 px-2 text-[11px]" style={{ color: "var(--text-primary)" }}>{s.name}</td>
                  <td className="py-2 px-2 font-mono">${s.price?.toFixed(2)}</td>
                  <td className="py-2 px-2"><SigBadge sig={s.signal} /></td>
                  <td className="py-2 px-2 font-mono" style={{ color: s.score >= 70 ? C.cyan : C.muted }}>{s.score}</td>
                  <td className="py-2 px-2 font-mono">${s.price?.toFixed(2)}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: C.green }}>${s.target?.toFixed(2)}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: C.red }}>${s.stop?.toFixed(2)}</td>
                  <td className="py-2 px-2 font-mono" style={{ color: C.green }}>{s.exp_return?.toFixed(1)}%</td>
                  <td className="py-2 px-2"><Bar2 val={s.confidence} max={100} color={s.confidence >= 80 ? C.green : C.amber} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Key Risks + Outlook */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Key Risks</SH>
          <div className="space-y-2">
            {d.key_risks?.map((r: string, i: number) => (
              <div key={i} className="flex gap-2 text-xs py-1 border-b" style={{ borderColor: C.border }}>
                <span style={{ color: C.amber }}>▸</span>
                <span style={{ color: "var(--text-primary)" }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>PM Outlook</SH>
          {[["1Y", d.outlook?.["1y"]], ["3Y", d.outlook?.["3y"]], ["5Y", d.outlook?.["5y"]]].map(([h, txt]) => (
            <div key={String(h)} className="py-2 border-b" style={{ borderColor: C.border }}>
              <span className="text-xs font-mono font-bold mr-2" style={{ color: C.cyan }}>{h}</span>
              <span className="text-xs" style={{ color: "var(--text-primary)" }}>{txt}</span>
            </div>
          ))}
          <div className="mt-3">
            <div className="text-xs font-semibold mb-2" style={{ color: C.purple }}>Space Supercycle Triggers</div>
            {d.supercycle_triggers?.map((t: string) => (
              <div key={t} className="text-xs py-0.5" style={{ color: C.muted }}>· {t}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Institutional Flow + Sentiment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Institutional Flows</SH>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b" style={{ borderColor: C.border }}>
              <span style={{ color: C.muted }}>HF Ownership</span>
              <span className="font-mono" style={{ color: C.cyan }}>{fmt$(d.institutional_flow?.hedge_fund_ownership_b)}</span>
            </div>
            <div className="flex justify-between py-1 border-b" style={{ borderColor: C.border }}>
              <span style={{ color: C.muted }}>ETF AUM</span>
              <span className="font-mono" style={{ color: C.blue }}>{fmt$(d.institutional_flow?.etf_aum_b)}</span>
            </div>
            <div className="flex justify-between py-1 border-b" style={{ borderColor: C.border }}>
              <span style={{ color: C.muted }}>Smart Money Score</span>
              <span className="font-mono" style={{ color: C.green }}>{d.institutional_flow?.smart_money_score}/100</span>
            </div>
            <div className="pt-1">
              <div style={{ color: C.muted }} className="mb-1">Space ETFs</div>
              <div className="flex gap-1 flex-wrap">{d.institutional_flow?.etfs?.map((e: string) => (
                <span key={e} className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: C.border, color: C.cyan }}>{e}</span>
              ))}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl p-5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>Space Sentiment Index</SH>
          <div className="space-y-2 text-xs">
            {[
              ["Overall Sentiment", d.sentiment?.overall_score, d.sentiment?.label],
              ["Launch Announcements", d.sentiment?.launch_announcements, null],
              ["Defense Contracts", d.sentiment?.defense_contracts, null],
              ["Earnings Tone", d.sentiment?.earnings_tone, null],
              ["VC Activity", d.sentiment?.vc_activity, null],
              ["Media Coverage", d.sentiment?.media_coverage, null],
            ].map(([lbl, val, sub]) => (
              <div key={String(lbl)} className="flex items-center justify-between py-1 border-b" style={{ borderColor: C.border }}>
                <span style={{ color: "var(--text-primary)" }}>{lbl}</span>
                <div className="flex items-center gap-2">
                  {sub && <span style={{ color: C.amber }}>{sub}</span>}
                  <Bar2 val={Number(val) || 0} max={100} color={Number(val) >= 70 ? C.green : Number(val) >= 50 ? C.blue : C.amber} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SpacePage() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const { isIndia } = useMarket();
  if (isIndia) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
      <span className="text-5xl">🇺🇸</span>
      <h2 className="text-base font-semibold text-text-primary">US Markets Only</h2>
      <p className="text-xs text-text-muted max-w-xs">This tool covers US space and satellite companies and is not available for the Indian market.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Space Sector Intelligence
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Institutional-grade space economy analytics · Launch · Satellites · Defense · VC · Stocks
          </p>
        </div>
        <div className="text-xs px-3 py-1.5 rounded-lg font-mono" style={{ background: C.surf2, border: `1px solid ${C.border}`, color: C.cyan }}>
          Live · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
      </div>

      <PageGuide
        title="Space Sector Intelligence"
        subtitle="Institutional-grade space economy analytics: launch activity, satellite constellations, defense space programs, VC funding, and public market stocks."
        steps={[
          { title: "Overview Tab", detail: "Start with the Space Economy Score (0–100) — a composite of commercial launch activity, satellite orders, defense space budget, and VC funding velocity. Score > 70 indicates an accelerating growth phase." },
          { title: "Launch Tab", detail: "Track global launch activity: orbital launch counts by country and operator, Falcon 9 cadence (SpaceX), and upcoming launch manifest. Year-over-year launch growth is the key metric for sector health." },
          { title: "Satellites Tab", detail: "Monitor satellite constellation buildout: Starlink (SpaceX), OneWeb, Amazon Kuiper, and others. Satellite counts, orbital slot assignments, and service revenue estimates." },
          { title: "Defense Tab", detail: "Space defense programs: Space Force budget, GPS modernization, missile warning satellites (Next-Gen OPIR), and classified program spend estimates. Contractor exposure by program." },
          { title: "VC Tab", detail: "Venture funding flows into space startups: quarterly deal counts, funding amounts by segment (launch, satellites, ground stations, data analytics), and notable recent rounds." },
          { title: "Stocks Tab", detail: "Investment signals for public space stocks: RKLB (launch), SPCE (sub-orbital), ASTS (space mobile), MAXR (Earth observation), and aerospace/defense companies with significant space exposure." },
        ]}
        howItWorks={[
          { title: "Launch Data", detail: "Launch count data is aggregated from SpaceFlightNow manifest, NASA's launch log, and operator announcements. Success/failure rates and payload mass to orbit are tracked per operator." },
          { title: "Space Economy Score", detail: "Composite of: QoQ launch growth (25%), satellite order backlog growth (25%), defense space budget growth (25%), and VC funding velocity (25%). Each component is normalized to a 0–100 scale and averaged." },
          { title: "Satellite Constellation Tracking", detail: "Constellation data is sourced from ITU filings, FCC orbital slot applications, and operator press releases. Active satellite counts are updated weekly from Space-Track.org orbital element data." },
          { title: "Stock Signals", detail: "Space stocks are scored on: revenue backlog coverage, launch manifest contracted capacity, TAM penetration for their specific segment, and SpaceX private market valuation as a sector sentiment anchor." },
        ]}
        tips={[
          "SpaceX cadence is the leading indicator for the entire sector: when Falcon 9 launches accelerate, every space stock tends to re-rate higher as market excitement builds.",
          "ASTS (AST SpaceMobile) is a binary event stock — commercial service launch dates are the key catalyst. Track FCC spectrum licenses and anchor subscriber agreements with AT&T/Verizon.",
          "The most undervalued space plays are often the infrastructure providers (ground stations, telemetry processing) rather than the flashy launch companies.",
        ]}
      />

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: activeTab === t ? C.cyan : C.surf2,
              color: activeTab === t ? "#000" : "var(--text-muted)",
              border: `1px solid ${activeTab === t ? C.cyan : C.border}`,
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "Overview"       && <OverviewTab />}
      {activeTab === "Launch"         && <LaunchTab />}
      {activeTab === "Satellites"     && <SatelliteTab />}
      {activeTab === "Defense Space"  && <DefenseSpaceTab />}
      {activeTab === "Broadband"      && <BroadbandTab />}
      {activeTab === "Economy"        && <EconomyTab />}
      {activeTab === "Government"     && <GovernmentTab />}
      {activeTab === "Tourism & Lunar"&& <TourismLunarTab />}
      {activeTab === "VC & Private"   && <VCTab />}
      {activeTab === "Public Stocks"  && <StocksTab />}
      {activeTab === "Supply Chain"   && <SupplyChainTab />}
      {activeTab === "Composite"      && <CompositeTab />}
    </div>
  );
}
