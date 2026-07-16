"use client";
import { useMarket } from "@/contexts/MarketContext";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, AreaChart, Area, Cell, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { PageGuide } from "@/components/PageGuide";

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  green:  "#22c55e", red:    "#ef4444", amber:  "#f59e0b",
  blue:   "#3b82f6", cyan:   "#06b6d4", purple: "#a855f7",
  orange: "#f97316", muted:  "var(--text-muted)",
  border: "var(--border, #2a2f3e)", surf2: "var(--surface-2, #1a1f2e)",
};
const TICK = { fill: "var(--text-muted)", fontSize: 10 };

// ── Shared mini-components ────────────────────────────────────────────────────
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
      <div className="w-20 h-1.5 rounded-full" style={{ background: C.border }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, val / max * 100)}%`, background: color }} />
      </div>
      <span className="text-xs font-mono" style={{ color }}>{val}</span>
    </div>
  );
}

const SIG_C: Record<string, string> = {
  "STRONG BUY": C.green, "BUY": "#86efac", "HOLD": C.amber,
  "SELL": "#fca5a5", "STRONG SELL": C.red,
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

function fmt$(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}T`;
  if (v >= 1)    return `$${v.toFixed(1)}B`;
  return `$${(v * 1000).toFixed(0)}M`;
}
function fmtPct(v: number, mult = 100): string { return `${v >= 0 ? "+" : ""}${(v * mult).toFixed(1)}%`; }

// ── Defense Score Gauge ───────────────────────────────────────────────────────
function DefenseGauge({ score, label }: { score: number; label: string }) {
  const r = 70; const cx = 100; const cy = 90;
  const angle = Math.PI - (score / 100) * Math.PI;
  const nx = cx + r * Math.cos(angle); const ny = cy - r * Math.sin(angle);
  const zones = [
    { from: 0, to: 20,  color: "#22c55e" },
    { from: 20, to: 40, color: "#84cc16" },
    { from: 40, to: 60, color: C.amber },
    { from: 60, to: 80, color: C.orange },
    { from: 80, to: 100,color: C.red },
  ];
  function arc(f: number, t: number) {
    const a1 = Math.PI - (f / 100) * Math.PI; const a2 = Math.PI - (t / 100) * Math.PI;
    return `M ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a2)} ${cy - r * Math.sin(a2)}`;
  }
  const sc = score >= 80 ? C.red : score >= 60 ? C.orange : score >= 40 ? C.amber : score >= 20 ? "#84cc16" : C.green;
  return (
    <div className="flex flex-col items-center">
      <svg width="200" height="110" viewBox="0 0 200 110">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={C.border} strokeWidth={14} strokeLinecap="round" />
        {zones.map(z => (
          <path key={z.from} d={arc(z.from, z.to)} fill="none" stroke={z.color} strokeWidth={10} strokeLinecap="round" opacity={0.3} />
        ))}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${nx} ${ny}`} fill="none" stroke={sc} strokeWidth={10} strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth={2} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill="white" />
        <text x={cx} y={cy - 18} textAnchor="middle" fontSize={26} fontFamily="monospace" fontWeight="bold" fill={sc}>{score}</text>
        <text x={22}  y={cy + 18} textAnchor="middle" fontSize={8} fill={C.green}>Peace</text>
        <text x={178} y={cy + 18} textAnchor="middle" fontSize={8} fill={C.red}>War</text>
      </svg>
      <div className="text-sm font-semibold" style={{ color: sc }}>{label}</div>
    </div>
  );
}

function ScoreBar({ label, score, weight }: { label: string; score: number; weight: number }) {
  const color = score >= 70 ? C.green : score >= 50 ? C.cyan : score >= 35 ? C.amber : C.red;
  return (
    <div className="grid grid-cols-[1fr_60px_80px_50px] items-center gap-2 py-1.5" style={{ borderBottom: `1px solid ${C.border}` }}>
      <span className="text-xs" style={{ color: "var(--text-primary)" }}>{label}</span>
      <div className="h-1.5 rounded-full" style={{ background: C.border }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-mono text-right" style={{ color }}>{score}/100</span>
      <span className="text-xs font-mono text-right" style={{ color: C.muted }}>{(weight * 100).toFixed(0)}%</span>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Spending", "Geopolitical", "Procurement",
              "Contractors", "Technology", "NATO", "Supply Chain", "Composite"];

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DefensePage() {
  const [tab, setTab] = useState("Overview");

  const overview    = useQuery({ queryKey: ["def-overview"],    queryFn: api.getDefenseOverview,    staleTime: 300_000, enabled: tab === "Overview" });
  const spending    = useQuery({ queryKey: ["def-spending"],    queryFn: api.getDefenseSpending,    staleTime: 300_000, enabled: tab === "Spending" });
  const geo         = useQuery({ queryKey: ["def-geo"],         queryFn: api.getDefenseGeo,         staleTime: 300_000, enabled: tab === "Geopolitical" });
  const procurement = useQuery({ queryKey: ["def-proc"],        queryFn: api.getDefenseProcurement, staleTime: 300_000, enabled: tab === "Procurement" });
  const contractors = useQuery({ queryKey: ["def-contractors"], queryFn: api.getDefenseContractors, staleTime: 300_000, enabled: tab === "Contractors" });
  const tech        = useQuery({ queryKey: ["def-tech"],        queryFn: api.getDefenseTech,        staleTime: 300_000, enabled: tab === "Technology" });
  const nato        = useQuery({ queryKey: ["def-nato"],        queryFn: api.getDefenseNATO,        staleTime: 300_000, enabled: tab === "NATO" });
  const supplyChain = useQuery({ queryKey: ["def-supply"],      queryFn: api.getDefenseSupplyChain, staleTime: 300_000, enabled: tab === "Supply Chain" });
  const composite   = useQuery({ queryKey: ["def-composite"],   queryFn: api.getDefenseComposite,   staleTime: 300_000, enabled: tab === "Composite" });

  const { isIndia } = useMarket();
  if (isIndia) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
      <span className="text-5xl">🇺🇸</span>
      <h2 className="text-base font-semibold text-text-primary">US Markets Only</h2>
      <p className="text-xs text-text-muted max-w-xs">This tool covers US defense contractors and spending data and is not available for the Indian market.</p>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <PageGuide
        title="Global Defense & Military Intelligence"
        subtitle="Institutional-grade defense sector analysis: global spending trends, procurement contracts, geopolitical risk, contractor performance, and technology investment."
        steps={[
          { title: "Overview Tab", detail: "See the defense spending landscape at a glance: global defense spending trajectory, top-10 spenders by country, NATO burden-sharing scores, and the composite defense investment thesis." },
          { title: "Spending Tab", detail: "Track defense budget trends for 30+ countries: year-over-year growth rates, % of GDP, absolute spending, and forward guidance. US, China, Russia, UK, Germany, India, and France are tracked in most detail." },
          { title: "Geopolitical Tab", detail: "Real-time geopolitical risk scores by region: conflict intensity, escalation probability, and the defense spending implications. Historical spending spikes following geopolitical events are charted for context." },
          { title: "Procurement Tab", detail: "Track major defense contract awards: program names, contract values, prime contractors, and performance milestones. Recent DoD, UK MoD, and NATO contract announcements are aggregated here." },
          { title: "Contractors Tab", detail: "Financial analysis of the top defense contractors: Lockheed Martin, RTX, Northrop Grumman, L3Harris, BAE Systems, and others. Revenue breakdown by program, backlog growth, and margin trajectory." },
          { title: "Technology Tab", detail: "Track defense tech investment: hypersonics, directed energy, autonomous systems, space defense, cyber, and AI/ML applications. Which programs are growing vs. being cut in the latest budget cycle." },
        ]}
        howItWorks={[
          { title: "Spending Data", detail: "Primary sources: Stockholm International Peace Research Institute (SIPRI) annual military expenditure database, national defense budget documents, and NATO's annual cost reporting. Data is updated annually with current-year estimates." },
          { title: "Geopolitical Risk Model", detail: "Risk scores integrate: ACLED conflict event data, UN peacekeeping deployment levels, sanctions activity, arms embargo violations, and news sentiment analysis. Each region is scored 0–100 (low to high risk)." },
          { title: "Contract Tracking", detail: "Major contracts are sourced from DoD daily contract announcements (defense.gov), UK government procurement registry, and company investor relations disclosures. Contracts above $100M threshold are tracked." },
          { title: "Contractor Scoring", detail: "Each contractor is scored on: revenue growth vs. defense spending growth, backlog coverage ratio, EBIT margin trend, R&D investment as % of revenue, and program execution track record." },
        ]}
        tips={[
          "Defense stocks trade on budget cycle expectations as much as reported revenues — watch the NDAA (National Defense Authorization Act) markup process each spring for spending direction signals.",
          "The backlog-to-revenue ratio is the key forward indicator: above 3× means 3 years of revenue visibility. Companies with growing backlogs are safer in budget uncertainty periods.",
          "European defense spending is the secular growth story post-2022: Germany's defense budget nearly doubled — track HENSOLDT, Rheinmetall, and KNDS as direct beneficiaries.",
        ]}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Global Defense & Military Intelligence
          </h1>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>
            Defense Spending · Procurement · Geopolitical Risk · Contractor Analysis · Technology Tracker
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-1 rounded font-semibold" style={{ background: "#3f1515", color: C.red }}>DEFENSE SUPERCYCLE</span>
          <span className="text-[10px] px-2 py-1 rounded font-semibold" style={{ background: "#1a1f2e", color: C.muted }}>LIVE</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap" style={{ borderBottom: `1px solid ${C.border}` }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className="px-3 py-2 text-xs font-medium transition-colors"
            style={{ color: tab === t ? "var(--text-primary)" : C.muted, borderBottom: tab === t ? `2px solid var(--accent, #6366f1)` : "2px solid transparent" }}>
            {t}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          OVERVIEW TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Overview" && (
        overview.isLoading ? <Loading /> : overview.isError ? <Err msg="Failed to load" /> : overview.data ? (
          <div className="space-y-6">
            {/* Top panel */}
            <div className="grid grid-cols-[auto_1fr] gap-6">
              {/* Gauge */}
              <div className="rounded-lg p-5 flex flex-col items-center" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Global Defense Score</SH>
                <DefenseGauge score={overview.data.defense_score} label={overview.data.regime} />
                <div className="grid grid-cols-3 gap-4 mt-4 w-full text-center">
                  <div><div className="text-[10px]" style={{ color: C.muted }}>Spending</div><div className="text-xs font-mono font-bold" style={{ color: C.amber }}>{fmt$(overview.data.kpis.global_spending_b)}</div></div>
                  <div><div className="text-[10px]" style={{ color: C.muted }}>Avg Growth</div><div className="text-xs font-mono font-bold" style={{ color: C.green }}>+{overview.data.kpis.avg_spending_growth_pct}%</div></div>
                  <div><div className="text-[10px]" style={{ color: C.muted }}>Active Conflicts</div><div className="text-xs font-mono font-bold" style={{ color: C.red }}>{overview.data.kpis.active_conflicts}</div></div>
                </div>
              </div>
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <Kpi label="Global Defense Spending"  value={fmt$(overview.data.kpis.global_spending_b)}           color={C.amber} />
                <Kpi label="Avg Spending Growth"       value={`+${overview.data.kpis.avg_spending_growth_pct}% YoY`} color={C.green} />
                <Kpi label="Procurement Score"         value={`${overview.data.kpis.procurement_score}/100`}        color={C.cyan} />
                <Kpi label="Active Conflicts"          value={`${overview.data.kpis.active_conflicts}`}             sub="Ukraine, Middle East" color={C.red} />
                <Kpi label="NATO Members Tracked"      value={`${overview.data.kpis.nato_members_tracked}`}         sub="Many below 2% target" color={C.blue} />
                <Kpi label="Contractors Tracked"       value={`${overview.data.kpis.contractors_tracked}`}          sub="Prime + emerging defense" color={C.purple} />
              </div>
            </div>

            {/* Defense Cycle + Top risks */}
            <div className="grid grid-cols-2 gap-6">
              <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Defense Cycle Model</SH>
                <div className="space-y-3">
                  {[
                    { label: "Current Phase",   value: overview.data.defense_cycle.current,    color: C.green },
                    { label: "Next Phase",       value: overview.data.defense_cycle.next_phase, color: C.cyan },
                    { label: "Primary Catalyst", value: overview.data.defense_cycle.catalyst,   color: C.amber },
                    { label: "1Y Outlook",       value: overview.data.defense_cycle.horizon_1y, color: "var(--text-primary)" },
                    { label: "3Y Outlook",       value: overview.data.defense_cycle.horizon_3y, color: "var(--text-primary)" },
                    { label: "5Y Outlook",       value: overview.data.defense_cycle.horizon_5y, color: C.muted },
                  ].map(r => (
                    <div key={r.label} className="flex gap-3 py-1.5" style={{ borderBottom: `1px solid ${C.border}` }}>
                      <span className="text-xs shrink-0 w-28" style={{ color: C.muted }}>{r.label}</span>
                      <span className="text-xs font-semibold" style={{ color: r.color }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {/* Top geo risks */}
                <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                  <SH>Top Geopolitical Risks</SH>
                  {overview.data.top_risks.map(r => (
                    <div key={r.region} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${C.border}` }}>
                      <div>
                        <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{r.region}</div>
                        <div className="text-[10px]" style={{ color: C.muted }}>{r.category}</div>
                      </div>
                      <Bar2 val={r.score} max={100} color={r.color} />
                    </div>
                  ))}
                </div>
                {/* Alerts */}
                <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                  <SH>Critical Alerts</SH>
                  <div className="space-y-2">
                    {overview.data.alerts.slice(0, 3).map(a => (
                      <div key={a.id} className="rounded p-2" style={{ background: "var(--surface, #111827)", border: `1px solid ${C.border}` }}>
                        <div className="flex items-start gap-2 mb-1">
                          <PriBadge p={a.priority} />
                          <span className="text-[10px] font-semibold" style={{ color: "var(--text-primary)" }}>{a.title}</span>
                        </div>
                        <div className="flex gap-1">
                          {a.tickers.map(t => <span key={t} className="text-[10px] font-mono px-1 py-0.5 rounded" style={{ background: "#1a2a3f", color: C.cyan }}>{t}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Top programs */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Top Procurement Programs by Score</SH>
              <div className="grid grid-cols-5 gap-3">
                {overview.data.top_programs.map(p => (
                  <div key={p.program} className="rounded p-3" style={{ background: "var(--surface, #111827)", border: `1px solid ${C.border}` }}>
                    <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{p.program}</div>
                    <div className="text-[10px] mb-2" style={{ color: C.muted }}>{p.contractor}</div>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <div style={{ color: C.muted }}>Annual</div><div className="font-mono" style={{ color: C.amber }}>{fmt$(p.annual_b)}</div>
                      <div style={{ color: C.muted }}>Backlog</div><div className="font-mono" style={{ color: C.cyan }}>{fmt$(p.backlog_b)}</div>
                    </div>
                    <div className="mt-2"><Bar2 val={p.score} max={100} color={p.score >= 90 ? C.green : C.cyan} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          SPENDING TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Spending" && (
        spending.isLoading ? <Loading /> : spending.isError ? <Err msg="Failed to load" /> : spending.data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <Kpi label="Total Defense Spending Tracked" value={fmt$(spending.data.total_tracked_b)} color={C.amber} />
              <Kpi label="NATO Alliance Total"            value={fmt$(spending.data.nato_total_b)} sub="excl. non-NATO tracked" color={C.blue} />
              <Kpi label="Fastest Growing"               value={spending.data.fastest_growing[0]?.country ?? "—"} sub={`+${spending.data.fastest_growing[0]?.yoy_pct}% YoY`} color={C.green} />
            </div>

            {/* Global spending history chart */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Global Defense Spending Trend — $B (2020–2026E)</SH>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={spending.data.history} margin={{ top: 0, right: 10, bottom: 0, left: 40 }}>
                  <CartesianGrid stroke={C.border} strokeOpacity={0.4} />
                  <XAxis dataKey="year" tick={TICK} />
                  <YAxis tick={TICK} tickFormatter={v => `$${v}B`} />
                  <Tooltip formatter={(v: number) => [`$${v}B`]} contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, fontSize: 11 }} />
                  <Area type="monotone" dataKey="global"    name="Global"    fill={C.amber} stroke={C.amber} fillOpacity={0.15} />
                  <Area type="monotone" dataKey="us"        name="USA"       fill={C.blue}  stroke={C.blue}  fillOpacity={0.15} />
                  <Area type="monotone" dataKey="nato_ex_us"name="NATO ex-US"fill={C.cyan}  stroke={C.cyan}  fillOpacity={0.15} />
                  <Area type="monotone" dataKey="china"     name="China"     fill={C.red}   stroke={C.red}   fillOpacity={0.15} />
                  <Area type="monotone" dataKey="russia"    name="Russia"    fill={C.orange} stroke={C.orange} fillOpacity={0.15} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Country table */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Country-Level Defense Spending — Global Defense Spending Index</SH>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: C.muted }}>
                    {["Rank","Country","Region","Budget (FY)","YoY Growth","% of GDP","Trend","Spending Share"].map(h => (
                      <th key={h} className="text-left pb-2 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spending.data.countries.map((c, i) => {
                    const trendC = c.trend === "Wartime" ? C.red : c.trend === "Surge" || c.trend === "Rearmament" ? C.orange : c.trend === "Rising" ? C.green : C.muted;
                    const shareOfTotal = (c.budget_b / spending.data.total_tracked_b * 100).toFixed(1);
                    return (
                      <tr key={c.code} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td className="py-2 pr-4 font-mono" style={{ color: C.muted }}>#{i + 1}</td>
                        <td className="py-2 pr-4">
                          <span className="mr-1">{c.flag}</span>
                          <span style={{ color: "var(--text-primary)" }}>{c.country}</span>
                        </td>
                        <td className="py-2 pr-4" style={{ color: C.muted }}>{c.region}</td>
                        <td className="py-2 pr-4 font-mono font-bold" style={{ color: C.amber }}>{fmt$(c.budget_b)}</td>
                        <td className="py-2 pr-4 font-mono" style={{ color: c.yoy_pct > 10 ? C.red : c.yoy_pct > 5 ? C.orange : C.green }}>+{c.yoy_pct}%</td>
                        <td className="py-2 pr-4 font-mono" style={{ color: c.gdp_pct >= 3 ? C.red : c.gdp_pct >= 2 ? C.orange : C.muted }}>{c.gdp_pct.toFixed(2)}%</td>
                        <td className="py-2 pr-4"><span className="text-[10px] font-bold" style={{ color: trendC }}>{c.trend}</span></td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full" style={{ background: C.border }}>
                              <div className="h-full rounded-full" style={{ width: `${shareOfTotal}%`, background: C.blue }} />
                            </div>
                            <span className="text-[10px] font-mono" style={{ color: C.muted }}>{shareOfTotal}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          GEOPOLITICAL TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Geopolitical" && (
        geo.isLoading ? <Loading /> : geo.isError ? <Err msg="Failed to load" /> : geo.data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <Kpi label="Composite Geo Risk Score" value={`${geo.data.composite_risk}/100`} sub={geo.data.composite_label} color={geo.data.composite_risk >= 70 ? C.red : C.orange} />
              <Kpi label="Active Conflict Zones" value="2" sub="Ukraine + Middle East" color={C.red} />
              <Kpi label="Highest Risk Region" value={geo.data.regions[0]?.region.split("/")[0] ?? "—"} sub={`Score: ${geo.data.regions[0]?.score}`} color={C.red} />
            </div>

            {/* Risk cards */}
            <div className="grid grid-cols-2 gap-4">
              {geo.data.regions.map(r => (
                <div key={r.region} className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${r.color}33` }}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{r.region}</div>
                      <div className="text-[10px] font-semibold mt-0.5" style={{ color: r.color }}>{r.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px]" style={{ color: C.muted }}>Risk Score</div>
                      <div className="text-2xl font-mono font-bold" style={{ color: r.color }}>{r.score}</div>
                    </div>
                  </div>
                  {/* Risk score bar */}
                  <div className="h-2 rounded-full mb-3" style={{ background: C.border }}>
                    <div className="h-full rounded-full" style={{ width: `${r.score}%`, background: r.color }} />
                  </div>
                  {/* Escalation model */}
                  <div className="grid grid-cols-2 gap-4 text-[10px] mb-3">
                    <div>
                      <span style={{ color: C.muted }}>Escalation: </span>
                      <span className="font-mono font-bold" style={{ color: C.red }}>{(r.escalation_prob * 100).toFixed(0)}%</span>
                    </div>
                    <div>
                      <span style={{ color: C.muted }}>De-escalation: </span>
                      <span className="font-mono font-bold" style={{ color: C.green }}>{(r.deescalation_prob * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  {/* Threats */}
                  <div className="mb-2">
                    <div className="text-[10px] mb-1" style={{ color: C.muted }}>Active Threats</div>
                    <div className="space-y-0.5">
                      {r.threats.map(t => (
                        <div key={t} className="text-[10px] flex items-center gap-1.5">
                          <span style={{ color: r.color }}>▸</span>
                          <span style={{ color: "var(--text-primary)" }}>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Beneficiaries */}
                  <div className="flex gap-1 flex-wrap">
                    {r.beneficiaries.map(t => (
                      <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{ background: "#14402a", color: C.green }}>{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Escalation model table */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Geopolitical Escalation Model — Probability by Region</SH>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: C.muted }}>
                    <th className="text-left pb-2 pr-4">Region</th>
                    <th className="text-left pb-2 pr-4">Escalation Prob</th>
                    <th className="text-left pb-2 pr-4">Escalation Bar</th>
                    <th className="text-left pb-2 pr-4">De-escalation Prob</th>
                  </tr>
                </thead>
                <tbody>
                  {geo.data.escalation_model.map((e, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="py-2 pr-4" style={{ color: "var(--text-primary)" }}>{e.region}</td>
                      <td className="py-2 pr-4 font-mono font-bold" style={{ color: e.prob > 0.3 ? C.red : e.prob > 0.2 ? C.orange : C.amber }}>{(e.prob * 100).toFixed(0)}%</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 rounded-full" style={{ background: C.border }}>
                            <div className="h-full rounded-full" style={{ width: `${e.prob * 100}%`, background: e.prob > 0.3 ? C.red : C.orange }} />
                          </div>
                          <div className="w-24 h-1.5 rounded-full" style={{ background: C.border }}>
                            <div className="h-full rounded-full" style={{ width: `${e.de_prob * 100}%`, background: C.green }} />
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-4 font-mono" style={{ color: C.green }}>{(e.de_prob * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          PROCUREMENT TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Procurement" && (
        procurement.isLoading ? <Loading /> : procurement.isError ? <Err msg="Failed to load" /> : procurement.data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <Kpi label="Total Backlog Tracked"  value={fmt$(procurement.data.total_backlog_b)} color={C.amber} />
              <Kpi label="Total Annual Value"      value={fmt$(procurement.data.total_annual_b)}  color={C.cyan} />
              <Kpi label="Avg Procurement Score"   value={`${procurement.data.avg_score}/100`}    color={C.green} />
            </div>

            {/* Category breakdown chart */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Procurement Backlog by Category ($B)</SH>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={Object.entries(procurement.data.by_category).map(([cat, progs]) => ({
                  cat, backlog: (progs as typeof procurement.data.programs).reduce((s, p) => s + p.backlog_b, 0),
                  annual: (progs as typeof procurement.data.programs).reduce((s, p) => s + p.annual_b, 0),
                }))} margin={{ top: 0, right: 10, bottom: 0, left: 30 }}>
                  <XAxis dataKey="cat" tick={TICK} />
                  <YAxis tick={TICK} tickFormatter={v => `$${v}B`} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(1)}B`]} contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, fontSize: 11 }} />
                  <Bar dataKey="backlog" name="Backlog" fill={C.amber} opacity={0.85} />
                  <Bar dataKey="annual"  name="Annual"  fill={C.cyan}  opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Programs table by category */}
            {Object.entries(procurement.data.by_category).map(([cat, progs]) => (
              <div key={cat} className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>{cat} Procurement Programs</SH>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: C.muted }}>
                      {["Program","Contractor","Nations","Annual Value","Backlog","Deliveries/yr","New Orders","Status","Score"].map(h => (
                        <th key={h} className="text-left pb-2 pr-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(progs as typeof procurement.data.programs).map((p, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td className="py-1.5 pr-3 font-semibold" style={{ color: "var(--text-primary)" }}>{p.program}</td>
                        <td className="py-1.5 pr-3 font-mono font-bold" style={{ color: C.cyan }}>{p.contractor}</td>
                        <td className="py-1.5 pr-3" style={{ color: C.muted }}>{p.nations}</td>
                        <td className="py-1.5 pr-3 font-mono" style={{ color: C.amber }}>{fmt$(p.annual_b)}</td>
                        <td className="py-1.5 pr-3 font-mono" style={{ color: C.green }}>{fmt$(p.backlog_b)}</td>
                        <td className="py-1.5 pr-3 font-mono" style={{ color: "var(--text-primary)" }}>{p.deliveries}</td>
                        <td className="py-1.5 pr-3 font-mono" style={{ color: p.new_orders > p.deliveries ? C.green : C.muted }}>{p.new_orders}</td>
                        <td className="py-1.5 pr-3">
                          <span className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: p.status.includes("Surge") ? "#14402a" : "#1a2a3f", color: p.status.includes("Surge") ? C.green : C.cyan }}>
                            {p.status}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3"><Bar2 val={p.score} max={100} color={p.score >= 90 ? C.green : C.cyan} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          CONTRACTORS TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Contractors" && (
        contractors.isLoading ? <Loading /> : contractors.isError ? <Err msg="Failed to load" /> : contractors.data ? (
          <div className="space-y-6">
            {/* Stock cards */}
            <div className="grid grid-cols-3 gap-4">
              {contractors.data.contractors.slice(0, 6).map(c => (
                <div key={c.ticker} className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-sm font-mono font-bold" style={{ color: C.cyan }}>{c.ticker}</div>
                      <div className="text-[10px]" style={{ color: C.muted }}>{c.segment}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-bold" style={{ color: "var(--text-primary)" }}>${c.price.toFixed(2)}</div>
                      <div className="text-[10px] font-mono" style={{ color: c.chg_pct >= 0 ? C.green : C.red }}>
                        {c.chg_pct >= 0 ? "+" : ""}{c.chg_pct.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] mb-3">
                    <div style={{ color: C.muted }}>Revenue</div><div className="font-mono" style={{ color: "var(--text-primary)" }}>{fmt$(c.rev_b)} ({fmtPct(c.rev_g)})</div>
                    <div style={{ color: C.muted }}>Backlog</div><div className="font-mono" style={{ color: C.amber }}>{fmt$(c.backlog_b)}</div>
                    <div style={{ color: C.muted }}>Op Margin</div><div className="font-mono" style={{ color: C.green }}>{(c.op_margin * 100).toFixed(1)}%</div>
                    <div style={{ color: C.muted }}>Gov Rev%</div><div className="font-mono" style={{ color: C.blue }}>{(c.gov_pct * 100).toFixed(0)}%</div>
                  </div>
                  <SigBadge sig={c.signal} />
                </div>
              ))}
            </div>

            {/* Full technicals + fundamentals table */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Defense Contractor — Comprehensive Analysis Table</SH>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: C.muted }}>
                      {["Ticker","Price","Chg%","RSI","MACD","ADX","EMA20","EMA50","Signal","Fwd PE","EV/EBITDA","Rev Gr","EPS Gr","Backlog","Backlog Gr","FCF","Rating"].map(h => (
                        <th key={h} className="text-right pb-2 px-2 first:text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {contractors.data.contractors.map(c => (
                      <tr key={c.ticker} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td className="py-1.5 px-2 font-mono font-bold" style={{ color: C.cyan }}>{c.ticker}</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: "var(--text-primary)" }}>${c.price.toFixed(2)}</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: c.chg_pct >= 0 ? C.green : C.red }}>{c.chg_pct >= 0 ? "+" : ""}{c.chg_pct.toFixed(2)}%</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: c.rsi > 70 ? C.red : c.rsi < 30 ? C.green : C.amber }}>{c.rsi.toFixed(1)}</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: c.macd > c.macd_signal ? C.green : C.red }}>{c.macd.toFixed(3)}</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: c.adx && c.adx > 25 ? C.green : C.muted }}>{c.adx?.toFixed(1) ?? "—"}</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: C.muted }}>${c.ema20.toFixed(2)}</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: C.muted }}>{c.ema50 ? `$${c.ema50.toFixed(2)}` : "—"}</td>
                        <td className="py-1.5 px-2 text-right"><SigBadge sig={c.signal} /></td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: C.muted }}>{c.fwd_pe.toFixed(1)}x</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: C.muted }}>{c.ev_ebitda.toFixed(1)}x</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: C.green }}>+{(c.rev_g * 100).toFixed(1)}%</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: c.eps_g >= 0 ? C.green : C.red }}>{c.eps_g >= 0 ? "+" : ""}{(c.eps_g * 100).toFixed(1)}%</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: C.amber }}>{fmt$(c.backlog_b)}</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: C.green }}>+{(c.backlog_g * 100).toFixed(1)}%</td>
                        <td className="py-1.5 px-2 font-mono text-right" style={{ color: C.cyan }}>{fmt$(c.fcf_b)}</td>
                        <td className="py-1.5 px-2 text-right"><span className="text-[10px] font-bold" style={{ color: c.rating === "STRONG BUY" ? C.green : c.rating === "BUY" ? "#86efac" : C.muted }}>{c.rating}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Revenue forecast */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Contractor Revenue Forecast Model — 1Y / 3Y / 5Y</SH>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: C.muted }}>
                    {["Ticker","Company","Current Rev","1Y Forecast","3Y Forecast","5Y Forecast","Backlog/Rev","Gov Rev%"].map(h => (
                      <th key={h} className="text-left pb-2 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contractors.data.contractors.map(c => (
                    <tr key={c.ticker} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="py-2 pr-4 font-mono font-bold" style={{ color: C.cyan }}>{c.ticker}</td>
                      <td className="py-2 pr-4" style={{ color: "var(--text-primary)" }}>{c.company}</td>
                      <td className="py-2 pr-4 font-mono" style={{ color: C.muted }}>{fmt$(c.rev_b)}</td>
                      <td className="py-2 pr-4 font-mono" style={{ color: C.green }}>{fmt$(c.rev_1y)}</td>
                      <td className="py-2 pr-4 font-mono" style={{ color: C.cyan }}>{fmt$(c.rev_3y)}</td>
                      <td className="py-2 pr-4 font-mono" style={{ color: C.amber }}>{fmt$(c.rev_5y)}</td>
                      <td className="py-2 pr-4 font-mono" style={{ color: c.rev_b > 0 ? C.purple : C.muted }}>
                        {c.rev_b > 0 ? `${(c.backlog_b / c.rev_b).toFixed(1)}x` : "—"}
                      </td>
                      <td className="py-2 pr-4 font-mono" style={{ color: C.blue }}>{(c.gov_pct * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TECHNOLOGY TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Technology" && (
        tech.isLoading ? <Loading /> : tech.isError ? <Err msg="Failed to load" /> : tech.data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <Kpi label="Total Gov Funding"   value={fmt$(tech.data.total_funding_b)}  color={C.amber} />
              <Kpi label="Innovation Score"    value={`${tech.data.innovation_score}/100`} color={C.green} />
              <Kpi label="Drone Warfare Index" value={`${tech.data.drone_index}/100`}   color={C.cyan} />
              <Kpi label="Space Defense Score" value={`${tech.data.space_score}/100`}   color={C.purple} />
            </div>

            {/* Funding chart */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Defense Technology Investment — Gov Funding ($B) vs Adoption Score</SH>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={tech.data.technologies.map(t => ({ name: t.name.replace("/ ", "/").split(" ").slice(0, 2).join(" "), funding: t.funding_b, adoption: t.adoption }))}
                  margin={{ top: 0, right: 10, bottom: 0, left: 20 }}>
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis yAxisId="left"  tick={TICK} tickFormatter={v => `$${v}B`} />
                  <YAxis yAxisId="right" orientation="right" tick={TICK} />
                  <Tooltip contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, fontSize: 11 }} />
                  <Bar yAxisId="left"  dataKey="funding"  name="Funding ($B)" fill={C.amber}  opacity={0.85} />
                  <Bar yAxisId="right" dataKey="adoption" name="Adoption Score" fill={C.cyan} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tech cards */}
            <div className="grid grid-cols-3 gap-4">
              {tech.data.technologies.map(t => {
                const trlC = t.trl >= 8 ? C.green : t.trl >= 6 ? C.cyan : t.trl >= 4 ? C.amber : C.red;
                const maturityBg = t.maturity === "Operational" || t.maturity === "Full Production" || t.maturity === "Combat Proven" ? "#14402a" : t.maturity === "Fielding" ? "#1a2a3f" : "#2a1f1a";
                const maturityFg = t.maturity === "Operational" || t.maturity === "Full Production" || t.maturity === "Combat Proven" ? C.green : t.maturity === "Fielding" ? C.cyan : C.amber;
                return (
                  <div key={t.name} className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{t.name}</div>
                        <div className="text-[10px]" style={{ color: C.muted }}>{t.cat}</div>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: maturityBg, color: maturityFg }}>{t.maturity}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] mb-3">
                      <div style={{ color: C.muted }}>Gov Funding</div><div className="font-mono" style={{ color: C.amber }}>{fmt$(t.funding_b)} <span style={{ color: C.green }}>+{(t.growth * 100).toFixed(0)}%</span></div>
                      <div style={{ color: C.muted }}>TRL</div><div className="font-mono" style={{ color: trlC }}>{t.trl}/9</div>
                    </div>
                    <div className="mb-2">
                      <div className="text-[10px] mb-1 flex items-center justify-between">
                        <span style={{ color: C.muted }}>Military Adoption</span>
                        <span className="font-mono" style={{ color: C.cyan }}>{t.adoption}%</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: C.border }}>
                        <div className="h-full rounded-full" style={{ width: `${t.adoption}%`, background: t.adoption >= 80 ? C.green : t.adoption >= 50 ? C.cyan : C.amber }} />
                      </div>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {t.companies.map(co => (
                        <span key={co} className="text-[10px] font-mono px-1 py-0.5 rounded" style={{ background: "#1a2a3f", color: C.cyan }}>{co}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          NATO TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "NATO" && (
        nato.isLoading ? <Loading /> : nato.isError ? <Err msg="Failed to load" /> : nato.data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <Kpi label="2% GDP Compliance" value={`${nato.data.compliance_pct}%`} sub={`${nato.data.meeting_target.length} / ${nato.data.members.length} members`} color={C.green} />
              <Kpi label="Total NATO Spending" value={fmt$(nato.data.total_nato_spending_b)} color={C.amber} />
              <Kpi label="Avg GDP %"           value={`${nato.data.gdp_pct_avg}%`} sub="2% target" color={C.cyan} />
              <Kpi label="Allied Expansion"    value={`${nato.data.allied_expansion_score}/100`} color={C.purple} />
            </div>

            {/* NATO compliance chart */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>NATO Member Defense Spending — % of GDP (2% Target Line)</SH>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={nato.data.members.map(m => ({ name: m.country.split(" ")[0], pct: m.gdp_pct, meets: m.meets }))}
                  margin={{ top: 0, right: 10, bottom: 0, left: 20 }}>
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis tick={TICK} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, "GDP%"]} contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, fontSize: 11 }} />
                  <Bar dataKey="pct" name="Defense % GDP">
                    {nato.data.members.map((m, i) => (
                      <Cell key={i} fill={m.gdp_pct >= 3 ? C.red : m.gdp_pct >= 2 ? C.green : C.amber} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* NATO + Indo-Pacific table */}
            <div className="grid grid-cols-2 gap-6">
              <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>NATO Members — 2% Compliance Status</SH>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: C.muted }}>
                      <th className="text-left pb-2 pr-3">Country</th>
                      <th className="text-right pb-2 pr-3">Budget $B</th>
                      <th className="text-right pb-2 pr-3">GDP%</th>
                      <th className="text-right pb-2 pr-3">YoY%</th>
                      <th className="text-left pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nato.data.members.map(m => (
                      <tr key={m.country} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td className="py-1.5 pr-3" style={{ color: "var(--text-primary)" }}>{m.country}</td>
                        <td className="py-1.5 pr-3 font-mono text-right" style={{ color: C.amber }}>{m.defense_b.toFixed(0)}</td>
                        <td className="py-1.5 pr-3 font-mono text-right" style={{ color: m.gdp_pct >= 2 ? C.green : C.red }}>{m.gdp_pct.toFixed(2)}%</td>
                        <td className="py-1.5 pr-3 font-mono text-right" style={{ color: C.green }}>+{m.yoy.toFixed(1)}%</td>
                        <td className="py-1.5">
                          <span className="text-[10px] font-bold" style={{ color: m.meets ? C.green : C.red }}>{m.meets ? "✓ MEETS" : "✗ BELOW"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-4">
                {/* Indo-Pacific cooperation */}
                <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                  <SH>Indo-Pacific Defense Cooperation</SH>
                  <div className="space-y-3">
                    {nato.data.indo_pacific.map(c => (
                      <div key={c.country} className="rounded p-3" style={{ background: "var(--surface, #111827)", border: `1px solid ${C.border}` }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{c.country}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px]" style={{ color: C.muted }}>${c.budget_b}B</span>
                            <span className="text-[10px] font-mono" style={{ color: C.green }}>+{c.yoy}% YoY</span>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {c.key_buys.map(b => (
                            <span key={b} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#14402a", color: C.green }}>{b}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Rearmament pipeline */}
                <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                  <SH>Rearmament Pipeline (Below 2%, Rising Fast)</SH>
                  <div className="space-y-1">
                    {nato.data.rearmament_pipeline.map(m => (
                      <div key={m.country} className="flex items-center justify-between py-1.5" style={{ borderBottom: `1px solid ${C.border}` }}>
                        <span className="text-xs" style={{ color: "var(--text-primary)" }}>{m.country}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono" style={{ color: C.amber }}>{m.gdp_pct.toFixed(2)}% GDP</span>
                          <span className="text-xs font-mono" style={{ color: C.green }}>+{m.yoy}% YoY</span>
                          <span className="text-[10px]" style={{ color: C.cyan }}>{m.trend}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          SUPPLY CHAIN TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Supply Chain" && (
        supplyChain.isLoading ? <Loading /> : supplyChain.isError ? <Err msg="Failed to load" /> : supplyChain.data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <Kpi label="Resilience Score"    value={`${supplyChain.data.resilience_score}/100`} color={supplyChain.data.resilience_score >= 50 ? C.green : C.red} />
              <Kpi label="Critical Inputs"      value={`${supplyChain.data.critical_count}`}       sub="Immediate action required" color={C.red} />
              <Kpi label="High Risk Inputs"     value={`${supplyChain.data.high_risk_count}`}      sub="Monitoring closely"        color={C.orange} />
              <Kpi label="Avg Domestic Supply"  value={`${supplyChain.data.avg_domestic_pct}%`}   sub="Of critical materials"     color={C.amber} />
            </div>

            {/* Critical alert */}
            {supplyChain.data.critical_inputs.map(s => (
              <div key={s.input} className="rounded-lg p-4" style={{ background: "#1a0808", border: `1px solid ${C.red}` }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: C.red, color: "white" }}>CRITICAL</span>
                  <span className="text-xs font-semibold" style={{ color: C.red }}>{s.input}</span>
                </div>
                <p className="text-[10px]" style={{ color: C.muted }}>
                  Domestic supply: {s.domestic_pct}% · Suppliers: {s.suppliers.join(", ")} · Stockpile: {s.stockpile_days} days · Mitigation: {s.mitigation}
                </p>
              </div>
            ))}

            {/* Supply chain table */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Defense Supply Chain Resilience — Input-by-Input Analysis</SH>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: C.muted }}>
                    {["Input","Category","Constraint","Criticality","Domestic %","Stockpile Days","Risk Score","Key Suppliers","Mitigation"].map(h => (
                      <th key={h} className="text-left pb-2 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplyChain.data.inputs.map((s, i) => {
                    const cBg = s.constraint === "CRITICAL" ? "#3f1515" : s.constraint === "HIGH" ? "#3f2a0a" : "#1a2a1a";
                    const cFg = s.constraint === "CRITICAL" ? C.red : s.constraint === "HIGH" ? C.orange : C.green;
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td className="py-2 pr-3 font-semibold" style={{ color: "var(--text-primary)" }}>{s.input}</td>
                        <td className="py-2 pr-3" style={{ color: C.muted }}>{s.cat}</td>
                        <td className="py-2 pr-3">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: cBg, color: cFg }}>{s.constraint}</span>
                        </td>
                        <td className="py-2 pr-3 font-mono" style={{ color: s.criticality >= 90 ? C.red : C.amber }}>{s.criticality}</td>
                        <td className="py-2 pr-3 font-mono" style={{ color: s.domestic_pct < 20 ? C.red : C.green }}>{s.domestic_pct}%</td>
                        <td className="py-2 pr-3 font-mono" style={{ color: s.stockpile_days < 60 ? C.red : C.muted }}>{s.stockpile_days}d</td>
                        <td className="py-2 pr-3"><Bar2 val={s.risk} max={100} color={s.risk >= 80 ? C.red : s.risk >= 60 ? C.orange : C.amber} /></td>
                        <td className="py-2 pr-3 text-[10px]" style={{ color: C.muted }}>{s.suppliers.slice(0, 2).join(", ")}</td>
                        <td className="py-2 pr-3 text-[10px]" style={{ color: C.cyan }}>{s.mitigation}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          COMPOSITE TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Composite" && (
        composite.isLoading ? <Loading /> : composite.isError ? <Err msg="Failed to load" /> : composite.data ? (
          <div className="space-y-6">
            {/* Gauge + components */}
            <div className="grid grid-cols-[auto_1fr] gap-6">
              <div className="rounded-lg p-5 flex flex-col items-center" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Defense Bullishness Score</SH>
                <DefenseGauge score={composite.data.composite_score} label={composite.data.label} />
                <div className="mt-3 text-center">
                  <div className="text-[10px]" style={{ color: C.muted }}>Defense Regime</div>
                  <div className="text-sm font-bold" style={{ color: composite.data.defense_score >= 75 ? C.red : C.orange }}>{composite.data.regime}</div>
                </div>
              </div>
              <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Composite Score Components</SH>
                <div className="space-y-0.5">
                  {Object.entries(composite.data.components).map(([label, c]) => (
                    <ScoreBar key={label} label={label} score={c.score} weight={c.weight} />
                  ))}
                </div>
              </div>
            </div>

            {/* Trading Signals */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Defense Stock Trading Signal Engine</SH>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: C.muted }}>
                    {["Ticker","Company","Price","Signal","Score","Fund Score","Tech Score","Entry","Target","Stop","Exp Return","Confidence","Backlog","Fwd PE"].map(h => (
                      <th key={h} className="text-right pb-2 px-2 first:text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {composite.data.signals.map(s => (
                    <tr key={s.ticker} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="py-2 px-2 font-mono font-bold" style={{ color: C.cyan }}>{s.ticker}</td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--text-primary)" }}>${s.price.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right"><SigBadge sig={s.signal} /></td>
                      <td className="py-2 px-2 font-mono text-right" style={{ color: s.score >= 70 ? C.green : s.score >= 50 ? C.amber : C.red }}>{s.score}</td>
                      <td className="py-2 px-2 font-mono text-right" style={{ color: C.blue }}>{s.fund_score}</td>
                      <td className="py-2 px-2 font-mono text-right" style={{ color: C.purple }}>{s.tech_score}</td>
                      <td className="py-2 px-2 font-mono text-right" style={{ color: C.muted }}>${s.price.toFixed(2)}</td>
                      <td className="py-2 px-2 font-mono text-right" style={{ color: C.green }}>${s.target.toFixed(2)}</td>
                      <td className="py-2 px-2 font-mono text-right" style={{ color: C.red }}>${s.stop.toFixed(2)}</td>
                      <td className="py-2 px-2 font-mono text-right" style={{ color: s.exp_return >= 0 ? C.green : C.red }}>+{s.exp_return.toFixed(1)}%</td>
                      <td className="py-2 px-2 font-mono text-right" style={{ color: C.cyan }}>{s.confidence}</td>
                      <td className="py-2 px-2 font-mono text-right" style={{ color: C.amber }}>{fmt$(s.backlog_b)}</td>
                      <td className="py-2 px-2 font-mono text-right" style={{ color: C.muted }}>{s.fwd_pe.toFixed(1)}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Alerts */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Defense Intelligence Alerts</SH>
              <div className="grid grid-cols-2 gap-3">
                {composite.data.alerts.map(a => (
                  <div key={a.id} className="rounded p-3" style={{ background: "var(--surface, #111827)", border: `1px solid ${C.border}` }}>
                    <div className="flex items-start gap-2 mb-1">
                      <PriBadge p={a.priority} />
                      <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{a.title}</span>
                    </div>
                    <p className="text-[10px] mb-2" style={{ color: C.muted }}>{a.detail}</p>
                    <div className="flex gap-1">{a.tickers.map(t => <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#14402a", color: C.green }}>{t}</span>)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* PM Summary */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>PM Dashboard Summary</SH>
              <div className="grid grid-cols-3 gap-6 text-xs">
                <div className="space-y-2">
                  <div className="font-semibold" style={{ color: C.red }}>▲ Top Panel — Global Defense</div>
                  <div style={{ color: C.muted }}>Global Spending: <span className="font-mono" style={{ color: C.amber }}>$2.56T+ All-Time High</span></div>
                  <div style={{ color: C.muted }}>Geo Risk Score: <span style={{ color: C.red }}>76/100 — High</span></div>
                  <div style={{ color: C.muted }}>Procurement Surge: <span style={{ color: C.green }}>Patriot, HIMARS, F-35</span></div>
                  <div style={{ color: C.muted }}>Tech Investment: <span style={{ color: C.cyan }}>AI/Drone fastest growing</span></div>
                </div>
                <div className="space-y-2">
                  <div className="font-semibold" style={{ color: C.orange }}>● Middle Panel — Top Opportunities</div>
                  <div style={{ color: C.muted }}>Top Defense: <span className="font-mono" style={{ color: C.green }}>LMT, RTX, NOC, GD</span></div>
                  <div style={{ color: C.muted }}>Backlog Leaders: <span style={{ color: C.amber }}>RTX $220B, LMT $160B</span></div>
                  <div style={{ color: C.muted }}>Drone Plays: <span style={{ color: C.cyan }}>AVAV, KTOS — backlogs +24-31%</span></div>
                  <div style={{ color: C.muted }}>Earnings Revisions: <span style={{ color: C.green }}>RTX, GD beating estimates</span></div>
                </div>
                <div className="space-y-2">
                  <div className="font-semibold" style={{ color: C.green }}>▼ Bottom Panel — Outlook</div>
                  <div style={{ color: C.muted }}>Cycle Phase: <span style={{ color: C.orange }}>Expansion → Peak</span></div>
                  <div style={{ color: C.muted }}>Key Risk: <span style={{ color: C.red }}>{composite.data.key_risks[0]}</span></div>
                  <div style={{ color: C.muted }}>Best Longs: <span className="font-mono" style={{ color: C.green }}>{composite.data.best_longs.slice(0, 3).map(b => b.ticker).join(", ")}</span></div>
                  {Object.entries(composite.data.outlook).map(([h, v]) => (
                    <div key={h} style={{ color: C.muted }}>{h} Outlook: <span style={{ color: "var(--text-primary)" }}>{v.split("—")[0].trim()}</span></div>
                  ))}
                </div>
              </div>
            </div>

            {/* Best longs + key risks */}
            <div className="grid grid-cols-2 gap-6">
              <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Best Long Ideas — Defense Supercycle</SH>
                {composite.data.best_longs.map(b => (
                  <div key={b.ticker} className="flex items-start gap-3 py-2" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <span className="font-mono font-bold text-sm shrink-0" style={{ color: C.green }}>{b.ticker}</span>
                    <span className="text-[10px] flex-1" style={{ color: C.muted }}>{b.reason}</span>
                    <Bar2 val={b.conviction} max={100} color={C.green} />
                  </div>
                ))}
              </div>
              <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Key Investment Risks</SH>
                <div className="space-y-2">
                  {composite.data.key_risks.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 py-1.5" style={{ borderBottom: `1px solid ${C.border}` }}>
                      <span className="text-[10px] font-bold shrink-0" style={{ color: C.red }}>▸</span>
                      <span className="text-[10px]" style={{ color: C.muted }}>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}
