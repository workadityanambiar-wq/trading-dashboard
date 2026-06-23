"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ResponsiveContainer, Legend, PieChart, Pie,
} from "recharts";
import { api } from "@/lib/api";
import type {
  REElement, REMineral, RECountry, REProcessing,
  REDefenseItem, REProject, REGeoRisk, REFlowETF, REFlowHF,
  REStock, RESignal,
} from "@/lib/api";
import { PageGuide } from "@/components/PageGuide";

// ── Shared primitives ─────────────────────────────────────────────────────────

const SIG_COLOR: Record<string, string> = {
  "STRONG BUY": "text-emerald-400", "BUY": "text-green-400",
  "HOLD": "text-amber-400", "SELL": "text-red-400", "STRONG SELL": "text-red-500",
};
const SIG_BG: Record<string, string> = {
  "STRONG BUY": "bg-emerald-400/10 border-emerald-400/30",
  "BUY": "bg-green-400/10 border-green-400/30",
  "HOLD": "bg-amber-400/10 border-amber-400/30",
  "SELL": "bg-red-400/10 border-red-400/30",
  "STRONG SELL": "bg-red-500/10 border-red-500/30",
};
const SEV_STYLE: Record<string, string> = {
  "CRITICAL": "text-red-500 border-red-500/30 bg-red-500/10",
  "HIGH":     "text-red-400 border-red-400/30 bg-red-400/10",
  "MEDIUM":   "text-amber-400 border-amber-400/30 bg-amber-400/10",
  "LOW":      "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
};

const CHART_STYLE = { background: "var(--surface)", border: "1px solid var(--border)", fontSize: 11, borderRadius: 6 };
const TICK = { fontSize: 10, fill: "var(--text-muted)" };

function Ret({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-[var(--text-muted)]">—</span>;
  return <span className={v >= 0 ? "text-emerald-400" : "text-red-400"}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>;
}
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1">{label}</div>
      <div className="text-xl font-bold text-[var(--text-primary)] font-mono">{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}
function SH({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-widest">{title}</h2>
      {badge && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]">{badge}</span>}
    </div>
  );
}
function ScoreBar({ label, value, max = 25, weight }: { label: string; value: number; max?: number; weight?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-40 text-[var(--text-muted)] truncate capitalize">{label.replace(/_/g, " ")}</div>
      <div className="flex-1 h-1.5 bg-[var(--surface-2,#1a1f2e)] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-8 text-right font-mono text-[var(--text-primary)]">{value.toFixed(1)}</div>
      {weight != null && <div className="w-8 text-right text-[var(--text-muted)]">{weight}%</div>}
    </div>
  );
}
function SigBadge({ signal }: { signal: string | null | undefined }) {
  if (!signal) return null;
  return <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${SIG_BG[signal] ?? ""} ${SIG_COLOR[signal] ?? ""}`}>{signal}</span>;
}
function Loading() { return <div className="text-[var(--text-muted)] text-sm py-8 text-center">Loading…</div>; }
function Err({ msg }: { msg: string }) { return <div className="text-red-400 text-sm py-4">{msg}</div>; }

// ── Supercycle Gauge ──────────────────────────────────────────────────────────
function SupercycleGauge({ score }: { score: number }) {
  const cx = 90, cy = 92, r = 68;
  const start = -215, arc = 250;
  const fill = (score / 100) * arc;
  function xy(deg: number, rr: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + rr * Math.cos(rad), y: cy + rr * Math.sin(rad) };
  }
  function path(a1: number, a2: number, rr: number) {
    const p1 = xy(a1, rr), p2 = xy(a2, rr);
    return `M ${p1.x} ${p1.y} A ${rr} ${rr} 0 ${Math.abs(a2 - a1) > 180 ? 1 : 0} 1 ${p2.x} ${p2.y}`;
  }
  const color = score < 25 ? "#10b981" : score < 50 ? "#f59e0b" : score < 75 ? "#f97316" : "#ef4444";
  const label = score < 20 ? "OVERSUPPLY" : score < 40 ? "WEAK DEMAND" : score < 60 ? "BALANCED" : score < 80 ? "TIGHT SUPPLY" : "CRITICAL SHORTAGE";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="180" height="130" viewBox="0 0 180 130">
        <path d={path(start, start + arc, r)} fill="none" stroke="var(--border)" strokeWidth="9" strokeLinecap="round" />
        <path d={path(start, start + fill, r)} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        <text x={cx} y={cy + 6} textAnchor="middle" fill="var(--text-primary)" fontSize="30" fontFamily="monospace" fontWeight="700">{score}</text>
        <text x={cx} y={cy + 22} textAnchor="middle" fill="var(--text-muted)" fontSize="10">/100</text>
      </svg>
      <div className="text-[10px] font-mono font-semibold tracking-widest" style={{ color }}>{label}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const TABS = ["Overview","Elements","Minerals","Supply Chain","China Risk","Defense & EV","Companies","Projects & Geo","Composite"] as const;
type Tab = typeof TABS[number];

export default function RareEarthsPage() {
  const [tab, setTab] = useState<Tab>("Overview");

  const overview  = useQuery({ queryKey: ["re-overview"],  queryFn: api.getREOverview,   staleTime: 5 * 60_000 });
  const elements  = useQuery({ queryKey: ["re-elements"],  queryFn: api.getREElements,   staleTime: 60 * 60_000, enabled: tab === "Elements" });
  const minerals  = useQuery({ queryKey: ["re-minerals"],  queryFn: api.getREMinerals,   staleTime: 60 * 60_000, enabled: tab === "Minerals" });
  const supply    = useQuery({ queryKey: ["re-supply"],    queryFn: api.getRESupply,     staleTime: 60 * 60_000, enabled: tab === "Supply Chain" });
  const china     = useQuery({ queryKey: ["re-china"],     queryFn: api.getREChina,      staleTime: 60 * 60_000, enabled: tab === "China Risk" });
  const demand    = useQuery({ queryKey: ["re-demand"],    queryFn: api.getREDemand,     staleTime: 60 * 60_000, enabled: tab === "Defense & EV" });
  const companies = useQuery({ queryKey: ["re-companies"], queryFn: api.getRECompanies,  staleTime: 2 * 60_000,  enabled: tab === "Companies" });
  const projects  = useQuery({ queryKey: ["re-projects"],  queryFn: api.getREProjects,   staleTime: 30 * 60_000, enabled: tab === "Projects & Geo" });
  const composite = useQuery({ queryKey: ["re-composite"], queryFn: api.getREComposite,  staleTime: 5 * 60_000,  enabled: tab === "Composite" });

  return (
    <div className="p-5 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Rare Earths & Critical Minerals</h1>
        <p className="text-xs text-[var(--text-muted)]">Supply Chain · China Risk · EV Demand · Defense · Mining Stocks · Geopolitical Intelligence</p>
      </div>

      <PageGuide
        title="Rare Earths & Critical Minerals"
        subtitle="Track the critical minerals supply chain: China's dominance, EV and defense demand drivers, mining stocks, and geopolitical risk."
        steps={[
          { title: "Overview Tab", detail: "The Overview shows the most important headline metrics: supply concentration risk score, demand trajectory, China control index, and the top 3 investment signals across the critical minerals complex." },
          { title: "Elements Tab", detail: "Track individual rare earth elements: neodymium (magnets), dysprosium (high-temperature magnets), lithium (batteries), cobalt, and others. Each element shows: current price, supply/demand balance, and primary end markets." },
          { title: "Supply Chain Tab", detail: "Visualize the full supply chain: mining (where raw ore is extracted), processing (where ore is refined into usable materials), manufacturing (where materials become components), and assembly. China's dominance at each stage is highlighted." },
          { title: "China Risk Tab", detail: "Quantify your exposure to Chinese supply disruption: China's market share at each supply chain stage, export restriction history, stockpile levels, and scenario analysis for supply cutoff events." },
          { title: "Defense & EV Tab", detail: "Track demand from the two fastest-growing end markets. Defense demand for rare earths (missile guidance, radar, jet engines) is growing faster than supply. EV demand for lithium and cobalt tracks EV adoption curves." },
          { title: "Companies Tab", detail: "Track publicly listed mining and processing companies: MP Materials (US), Lynas (AU), Piedmont Lithium, and others. Includes production capacity, cost position, and investment signals." },
        ]}
        howItWorks={[
          { title: "Supply Data", detail: "Production data from USGS (US Geological Survey) annual mineral summaries, combined with company filings and trade data. China's production share is updated annually with monthly spot price data from commodity exchanges." },
          { title: "China Risk Score", detail: "Composite of: China's % of global production, China's % of global processing, export restriction frequency (last 5 years), US stockpile levels vs. consumption, and allied-country alternative supply capacity. Score 0–100; higher = more risk." },
          { title: "Demand Modeling", detail: "EV demand is modeled from IEA EV adoption forecasts × material content per vehicle (e.g. ~8kg of lithium carbonate per EV battery). Defense demand is estimated from DOD procurement data and platform production schedules." },
          { title: "Stock Signals", detail: "Mining stocks are scored on: production growth vs. plan, cost per ton vs. spot price (margin), resource life (years of reserves), and geopolitical location risk (jurisdiction score). Combined into a composite investment signal." },
        ]}
        tips={[
          "Rare earth stocks are highly correlated to Chinese export policy news — monitor China's Ministry of Commerce announcements for trading catalysts.",
          "MP Materials (MP) is the only significant US rare earth miner and is strategically important for US defense — it often trades on geopolitical news rather than commodity prices.",
          "The lithium cycle is boom-bust: oversupply follows demand spikes with 3–5 year lag. Track Australian hard rock lithium production (Pilbara Minerals, Albemarle's assets) as the swing supply source.",
        ]}
      />

      <div className="flex gap-1 flex-wrap border-b border-[var(--border)] pb-3">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${tab === t ? "bg-[var(--surface-2,#1a1f2e)] text-[var(--text-primary)] border border-[var(--border)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "Overview" && (
        overview.isLoading ? <Loading /> : overview.isError ? <Err msg="Error loading overview" /> :
        overview.data ? (() => {
          const { supercycle, composite: comp, kpis } = overview.data;
          return (
            <div className="space-y-4">
              <div className="flex gap-4 flex-wrap items-start">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex flex-col items-center gap-1 shrink-0">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Rare Earth Supercycle Score</div>
                  <SupercycleGauge score={supercycle.score} />
                  <div className="text-[10px] text-[var(--text-muted)] mt-1">Composite Bullishness: <span className="text-[var(--text-primary)] font-mono font-bold">{comp.score}/100</span> · {comp.label}</div>
                </div>
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 min-w-0">
                  <Kpi label="Global RE Production" value={`${kpis.global_re_prod_kt}kt`} sub="annual rare earth oxides" />
                  <Kpi label="China Mining Share" value={`${kpis.china_share_pct}%`} sub="of global RE production" />
                  <Kpi label="China Refining Share" value={`${kpis.china_refining_pct}%`} sub="processing concentration" />
                  <Kpi label="Minerals in Deficit" value={`${kpis.deficit_minerals}`} sub="of 10 critical minerals" />
                  <Kpi label="EV RE Demand 2024" value={`${kpis.ev_demand_re_kt_2024}kt`} sub="from EV motors alone" />
                  <Kpi label="Magnet Demand Index" value={`${kpis.magnet_demand_index}/100`} sub="NdFeB market tightness" />
                  <Kpi label="Active Export Controls" value={`${kpis.active_export_controls}`} sub="China restrictions in effect" />
                  <Kpi label="Supercycle Regime" value={supercycle.regime} sub={`Score ${supercycle.score}/100`} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                  <SH title="Supercycle Components" />
                  <div className="space-y-2.5">
                    {Object.entries(supercycle.components).map(([k, v]) => (
                      <ScoreBar key={k} label={k} value={v as number} max={25} />
                    ))}
                  </div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                  <SH title="Composite Bullishness Breakdown" badge={`${comp.score}/100 · ${comp.label}`} />
                  <div className="space-y-2.5">
                    {Object.entries(comp.components).map(([k, v]) => (
                      <ScoreBar key={k} label={k} value={v as number} max={25} weight={(comp.weights as Record<string, number>)[k]} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })() : null
      )}

      {/* ── ELEMENTS ── */}
      {tab === "Elements" && (
        elements.isLoading ? <Loading /> : elements.isError ? <Err msg="Error loading elements" /> :
        elements.data ? (
          <div className="space-y-5">
            <div className="flex gap-3 flex-wrap mb-2">
              <Kpi label="RE Pricing Score" value={`${elements.data.pricing_score}/100`} sub="based on 1Y price momentum" />
            </div>
            <SH title="Rare Earth Elements — Prices & Criticality" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["Symbol","Name","Type","Price ($/kg)","7D","30D","1Y","Criticality","China%","In Deficit","Primary Use"].map((h,i) => (
                      <th key={h} className={`py-2 pr-3 font-medium ${i>=3&&i<=7?"text-right":""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {elements.data.elements.map((e: REElement) => (
                    <tr key={e.symbol} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 font-bold text-[var(--text-primary)] font-mono">{e.symbol}</td>
                      <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{e.name}</td>
                      <td className="py-2 pr-3"><span className={`text-[9px] px-1.5 py-0.5 rounded border ${e.type==="HREE"?"border-purple-400/30 bg-purple-400/10 text-purple-400":"border-cyan-400/30 bg-cyan-400/10 text-cyan-400"}`}>{e.type}</span></td>
                      <td className="py-2 pr-3 text-right font-mono font-bold">${e.price_kg.toFixed(1)}</td>
                      <td className="py-2 pr-3 text-right"><Ret v={e.chg_7d} /></td>
                      <td className="py-2 pr-3 text-right"><Ret v={e.chg_30d} /></td>
                      <td className="py-2 pr-3 text-right"><Ret v={e.chg_1y} /></td>
                      <td className="py-2 pr-3 text-right"><span className={`font-mono font-bold ${e.criticality>=90?"text-red-400":e.criticality>=70?"text-amber-400":"text-[var(--text-primary)]"}`}>{e.criticality}</span></td>
                      <td className="py-2 pr-3 text-right font-mono">{e.china_pct}%</td>
                      <td className="py-2 pr-3">{e.deficit?<span className="text-red-400 font-semibold">YES</span>:<span className="text-emerald-400">No</span>}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)] text-[10px] max-w-[160px] truncate">{e.use}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SH title="1-Year Price Change by Element" />
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={elements.data.elements} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={TICK} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="symbol" tick={TICK} width={28} />
                  <Tooltip contentStyle={CHART_STYLE} formatter={(v: number) => [`${v}%`, "1Y Change"]} />
                  <Bar dataKey="chg_1y" name="1Y Change %" radius={[0,3,3,0]}>
                    {elements.data.elements.map((e: REElement, i: number) => (
                      <Cell key={i} fill={e.chg_1y >= 0 ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null
      )}

      {/* ── MINERALS ── */}
      {tab === "Minerals" && (
        minerals.isLoading ? <Loading /> : minerals.isError ? <Err msg="Error loading minerals" /> :
        minerals.data ? (
          <div className="space-y-5">
            <Kpi label="Critical Minerals Strength Score" value={`${minerals.data.strength_score}/100`} sub="weighted criticality index" />
            {(["Battery","Strategic"] as const).map(type => {
              const list = type === "Battery" ? minerals.data.battery : minerals.data.strategic;
              return (
                <div key={type}>
                  <SH title={`${type} Materials`} badge={`${list.length} minerals tracked`} />
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                          {["Mineral","Price","Unit","7D","30D","1Y","Production","Demand","Deficit","China%","Criticality"].map((h,i)=>(
                            <th key={h} className={`py-2 pr-3 font-medium ${i>=1?"text-right":""}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((m: REMineral) => (
                          <tr key={m.name} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                            <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{m.name}</td>
                            <td className="py-2 pr-3 text-right font-mono font-bold">{m.price.toLocaleString()}</td>
                            <td className="py-2 pr-3 text-right text-[var(--text-muted)] text-[10px]">{m.unit}</td>
                            <td className="py-2 pr-3 text-right"><Ret v={m.chg_7d} /></td>
                            <td className="py-2 pr-3 text-right"><Ret v={m.chg_30d} /></td>
                            <td className="py-2 pr-3 text-right"><Ret v={m.chg_1y} /></td>
                            <td className="py-2 pr-3 text-right font-mono text-[var(--text-muted)]">{m.prod_kt.toLocaleString()}</td>
                            <td className="py-2 pr-3 text-right font-mono text-[var(--text-muted)]">{m.demand_kt.toLocaleString()}</td>
                            <td className="py-2 pr-3 text-right"><span className={m.deficit_kt < 0 ? "text-red-400 font-bold" : "text-emerald-400"}>{m.deficit_kt > 0 ? "+" : ""}{m.deficit_kt}</span></td>
                            <td className="py-2 pr-3 text-right font-mono">{m.china_pct}%</td>
                            <td className="py-2 text-right font-mono font-bold text-amber-400">{m.criticality}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null
      )}

      {/* ── SUPPLY CHAIN ── */}
      {tab === "Supply Chain" && (
        supply.isLoading ? <Loading /> : supply.isError ? <Err msg="Error loading supply data" /> :
        supply.data ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Total RE Production" value={`${supply.data.total_prod_kt}kt`} sub="annual rare earth oxides" />
              <Kpi label="Supply Concentration" value={`${supply.data.concentration_score}/100`} sub="China dependency risk score" />
              <Kpi label="China's Share" value={`${supply.data.production[0].share_pct}%`} sub="of global RE mining" />
            </div>
            <SH title="Rare Earth Production by Country" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["Country","Production (kt)","Global Share","YoY Growth","Export Controls","Strategic Risk"].map((h,i)=>(
                      <th key={h} className={`py-2 pr-3 font-medium ${i>=1&&i<=3?"text-right":""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supply.data.production.map((c: RECountry) => (
                    <tr key={c.country} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{c.country}</td>
                      <td className="py-2 pr-3 text-right font-mono font-bold">{c.re_prod_kt.toFixed(1)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{c.share_pct}%</td>
                      <td className="py-2 pr-3 text-right"><Ret v={c.yoy_pct} /></td>
                      <td className="py-2 pr-3">{c.restrictions ? <span className="text-red-400 font-semibold text-[10px]">ACTIVE</span> : <span className="text-emerald-400 text-[10px]">None</span>}</td>
                      <td className="py-2"><span className={`text-[9px] px-1.5 py-0.5 rounded border ${SEV_STYLE[c.risk] ?? ""}`}>{c.risk}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supply.data.production}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="country" tick={TICK} />
                  <YAxis tick={TICK} />
                  <Tooltip contentStyle={CHART_STYLE} formatter={(v: number) => [`${v}kt`, "RE Production"]} />
                  <Bar dataKey="re_prod_kt" name="Production (kt)" radius={[3,3,0,0]}>
                    {supply.data.production.map((c: RECountry, i: number) => (
                      <Cell key={i} fill={i===0?"#ef4444":i===3?"#f97316":"#10b981"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <SH title="Processing & Refining Capacity" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["Region","RE Refining%","Li Refining%","Co Refining%","Utilization%","Expansion Projects","Bottleneck Score"].map((h,i)=>(
                      <th key={h} className={`py-2 pr-3 font-medium ${i>=1?"text-right":""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supply.data.processing.map((p: REProcessing) => (
                    <tr key={p.region} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{p.region}</td>
                      <td className="py-2 pr-3 text-right font-mono">{p.re_pct}%</td>
                      <td className="py-2 pr-3 text-right font-mono">{p.li_pct}%</td>
                      <td className="py-2 pr-3 text-right font-mono">{p.co_pct}%</td>
                      <td className="py-2 pr-3 text-right font-mono">{p.utilization}%</td>
                      <td className="py-2 pr-3 text-right font-mono">{p.projects}</td>
                      <td className="py-2 text-right"><span className={`font-mono font-bold ${p.score>=80?"text-red-400":p.score>=50?"text-amber-400":"text-emerald-400"}`}>{p.score}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ── CHINA RISK ── */}
      {tab === "China Risk" && (
        china.isLoading ? <Loading /> : china.isError ? <Err msg="Error loading China data" /> :
        china.data ? (() => {
          const c = china.data.china;
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Kpi label="Mining Dominance" value={`${c.mining_pct}%`} sub="of global RE mining" />
                <Kpi label="Refining Dominance" value={`${c.refining_pct}%`} sub="of global RE processing" />
                <Kpi label="Magnet Dominance" value={`${c.magnet_pct}%`} sub="of NdFeB magnets produced" />
                <Kpi label="China Risk Index" value={`${c.risk_score}/100`} sub="supply chain vulnerability" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-center justify-center h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{name:"China",value:c.refining_pct},{name:"Rest of World",value:100-c.refining_pct}]}
                        cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value">
                        <Cell fill="#ef4444" /><Cell fill="#374151" />
                      </Pie>
                      <Tooltip contentStyle={CHART_STYLE} formatter={(v: number) => [`${v}%`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="md:col-span-2 space-y-3">
                  <SH title="China Export Controls Timeline" />
                  {c.controls.map((ctrl, i) => (
                    <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-center gap-3">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border ${SEV_STYLE[ctrl.severity]??""}`}>{ctrl.severity}</span>
                      <span className="font-semibold text-xs text-[var(--text-primary)]">{ctrl.mineral}</span>
                      <span className="text-[10px] text-[var(--text-muted)] ml-auto">{ctrl.date}</span>
                    </div>
                  ))}
                </div>
              </div>
              <SH title="Alternative Supply Sources & Readiness" />
              <div className="space-y-3">
                {c.alt_sources.map((a, i) => (
                  <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-[var(--text-primary)]">{a.mineral}</span>
                      <span className="text-[10px] text-amber-400 font-mono font-bold">{a.readiness_pct}% ready</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mb-2">{a.source}</div>
                    <div className="h-1.5 bg-[var(--surface-2,#1a1f2e)] rounded-full">
                      <div className={`h-full rounded-full ${a.readiness_pct>=50?"bg-emerald-500":a.readiness_pct>=25?"bg-amber-500":"bg-red-500"}`}
                        style={{ width: `${a.readiness_pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })() : null
      )}

      {/* ── DEFENSE & EV ── */}
      {tab === "Defense & EV" && (
        demand.isLoading ? <Loading /> : demand.isError ? <Err msg="Error loading demand data" /> :
        demand.data ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Kpi label="Defense Criticality Score" value={`${demand.data.defense_score}/100`} sub="across all weapons systems" />
              <Kpi label="Green Energy Score" value={`${demand.data.green_score}/100`} sub="EV + wind + storage" />
              <Kpi label="EV Sales 2024" value={`${demand.data.ev.ev_sales_2024m}M`} sub={`→ ${demand.data.ev.ev_sales_2030em}M by 2030`} />
              <Kpi label="NdFeB Magnet Mkt" value={`$${demand.data.magnets.market_b}B`} sub={`CAGR ${demand.data.magnets.cagr_pct}%`} />
            </div>
            <SH title="Defense Systems — Rare Earth Requirements" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["System","RE/Unit (kg)","Key Minerals","Annual Units","Priority"].map((h,i)=>(
                      <th key={h} className={`py-2 pr-3 font-medium ${i===1||i===2?"text-right":""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {demand.data.defense.map((d: REDefenseItem) => (
                    <tr key={d.system} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{d.system}</td>
                      <td className="py-2 pr-3 text-right font-mono font-bold text-amber-400">{d.re_kg.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right text-[var(--text-muted)] font-mono text-[10px]">{d.minerals.join(", ")}</td>
                      <td className="py-2 pr-3 font-mono">{d.annual.toLocaleString()}</td>
                      <td className="py-2"><span className={`text-[9px] px-1.5 py-0.5 rounded border ${SEV_STYLE[d.priority]??""}`}>{d.priority}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SH title="RE Demand Forecast — EV + Wind 2024–2030" />
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={demand.data.ev.demand_forecast}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="year" tick={TICK} />
                  <YAxis yAxisId="left" tick={TICK} />
                  <YAxis yAxisId="right" orientation="right" tick={TICK} />
                  <Tooltip contentStyle={CHART_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="left" type="monotone" dataKey="re_demand_kt" name="RE Demand (kt)" stroke="#f97316" fill="#f97316" fillOpacity={0.15} strokeWidth={2} />
                  <Area yAxisId="right" type="monotone" dataKey="ev_m" name="EV Sales (M)" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                <SH title="NdFeB Magnet Market Segments" />
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={Object.entries(demand.data.magnets.segments).map(([k,v])=>({name:k,value:v}))}
                        cx="50%" cy="50%" outerRadius={55} dataKey="value" label={({name,value})=>`${name} ${value}%`} labelLine={false}>
                        {Object.keys(demand.data.magnets.segments).map((_,i)=>(
                          <Cell key={i} fill={["#06b6d4","#10b981","#f59e0b","#ef4444","#8b5cf6"][i%5]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={CHART_STYLE} formatter={(v)=>[`${v}%`,""]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                <SH title="Nd Demand Outlook (kt)" />
                <div className="space-y-3 pt-2">
                  {[{label:"Nd Demand 2024",val:demand.data.magnets.nd_demand_2024_kt,max:150},
                    {label:"Nd Demand 2030E",val:demand.data.magnets.nd_demand_2030e_kt,max:150},
                    {label:"Dy Demand 2024",val:demand.data.magnets.dy_demand_2024_kt,max:4},
                    {label:"Dy Demand 2030E",val:demand.data.magnets.dy_demand_2030e_kt,max:4},
                  ].map(item=>(
                    <div key={item.label} className="flex items-center gap-2 text-xs">
                      <div className="w-36 text-[var(--text-muted)]">{item.label}</div>
                      <div className="flex-1 h-1.5 bg-[var(--surface-2,#1a1f2e)] rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{width:`${Math.min(100,(item.val/item.max)*100)}%`}} />
                      </div>
                      <div className="w-12 text-right font-mono text-[var(--text-primary)]">{item.val}kt</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null
      )}

      {/* ── COMPANIES ── */}
      {tab === "Companies" && (
        companies.isLoading ? <Loading /> : companies.isError ? <Err msg="Error loading company data" /> :
        companies.data ? (
          <div className="space-y-5">
            <SH title="Mining & Critical Mineral Stocks" badge={`${companies.data.count} stocks · ${companies.data.as_of}`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {companies.data.stocks.filter((s: REStock) => s.exposure >= 80).map((s: REStock) => (
                <div key={s.ticker} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">{s.ticker}</div>
                      <div className="text-[9px] text-[var(--text-muted)]">{s.type} · {s.exposure}% exposure</div>
                    </div>
                    <SigBadge signal={s.signal} />
                  </div>
                  <div className="text-2xl font-mono font-bold text-[var(--text-primary)]">${s.price?.toFixed(2)}</div>
                  <div className="grid grid-cols-3 gap-1 text-[10px]">
                    <div><div className="text-[var(--text-muted)]">1M</div><Ret v={s.ret_1m} /></div>
                    <div><div className="text-[var(--text-muted)]">3M</div><Ret v={s.ret_3m} /></div>
                    <div><div className="text-[var(--text-muted)]">YTD</div><Ret v={s.ret_ytd} /></div>
                  </div>
                  {s.rsi != null && <div className="text-[10px] text-[var(--text-muted)]">RSI <span className={`font-mono ${s.rsi>70?"text-red-400":s.rsi<30?"text-emerald-400":"text-[var(--text-primary)]"}`}>{s.rsi.toFixed(0)}</span>{s.mkt_cap_b!=null?` · $${s.mkt_cap_b}B`:""}</div>}
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["Ticker","Type","Exp%","Price","YTD","1Y","RSI","vs EMA50","vs EMA200","Mkt Cap","Signal"].map((h,i)=>(
                      <th key={h} className={`py-2 pr-3 font-medium ${i>=3&&i<=9?"text-right":""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {companies.data.stocks.map((s: REStock) => (
                    <tr key={s.ticker} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 font-bold text-[var(--text-primary)]">{s.ticker}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)] text-[10px]">{s.type}</td>
                      <td className="py-2 pr-3 font-mono">{s.exposure}%</td>
                      <td className="py-2 pr-3 text-right font-mono">${s.price?.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-right"><Ret v={s.ret_ytd} /></td>
                      <td className="py-2 pr-3 text-right"><Ret v={s.ret_1y} /></td>
                      <td className={`py-2 pr-3 text-right font-mono ${s.rsi!=null&&s.rsi>70?"text-red-400":s.rsi!=null&&s.rsi<30?"text-emerald-400":""}`}>{s.rsi?.toFixed(0)??"—"}</td>
                      <td className="py-2 pr-3 text-right"><Ret v={s.vs_ema50} /></td>
                      <td className="py-2 pr-3 text-right"><Ret v={s.vs_ema200} /></td>
                      <td className="py-2 pr-3 text-right font-mono text-[var(--text-muted)]">{s.mkt_cap_b!=null?`$${s.mkt_cap_b}B`:"—"}</td>
                      <td className="py-2"><SigBadge signal={s.signal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ── PROJECTS & GEO ── */}
      {tab === "Projects & Geo" && (
        projects.isLoading ? <Loading /> : projects.isError ? <Err msg="Error loading projects" /> :
        projects.data ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Total Project CapEx" value={`$${projects.data.total_capex_b}B`} sub="across all strategic projects" />
              <Kpi label="Government Support" value={`$${projects.data.total_govt_b}B`} sub="subsidies & grants committed" />
              <Kpi label="Capacity Growth Score" value={`${projects.data.capacity_score}/100`} sub="non-China supply expansion" />
            </div>
            <SH title="Strategic Capacity Projects" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["Project","Company","Region","Mineral","CapEx ($M)","Capacity (kt)","Govt Support","Status","Target Year"].map((h,i)=>(
                      <th key={h} className={`py-2 pr-3 font-medium ${i>=4&&i<=6?"text-right":""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projects.data.projects.map((p: REProject) => (
                    <tr key={p.name} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{p.name}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)] text-[10px]">{p.company}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)]">{p.region}</td>
                      <td className="py-2 pr-3"><span className="text-[9px] px-1.5 py-0.5 rounded border border-cyan-400/30 bg-cyan-400/10 text-cyan-400">{p.mineral}</span></td>
                      <td className="py-2 pr-3 text-right font-mono">{p.capex_m.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right font-mono">{p.capacity_kt}</td>
                      <td className="py-2 pr-3 text-right font-mono text-emerald-400">{p.govt_m > 0 ? `$${p.govt_m.toLocaleString()}M` : "—"}</td>
                      <td className="py-2 pr-3"><span className={`text-[9px] px-1.5 py-0.5 rounded border ${p.status==="OPERATING"?"text-emerald-400 border-emerald-400/30 bg-emerald-400/10":p.status==="CONSTRUCTION"?"text-amber-400 border-amber-400/30 bg-amber-400/10":"text-[var(--text-muted)] border-[var(--border)]"}`}>{p.status}</span></td>
                      <td className="py-2 font-mono text-[var(--text-muted)]">{p.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SH title="Geopolitical Risk Monitor" />
            <div className="space-y-2">
              {projects.data.geo_risks.map((g: REGeoRisk, i: number) => (
                <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-start gap-3">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold shrink-0 ${SEV_STYLE[g.severity]??""}`}>{g.severity}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">{g.risk}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{g.detail}</div>
                  </div>
                  <div className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">P:{g.prob}% · I:{g.impact}</div>
                </div>
              ))}
            </div>
            <SH title="Institutional Flows & ETF Monitor" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                      {["ETF","AUM ($B)","30D Flow ($M)","YTD"].map((h,i)=>(<th key={h} className={`py-2 pr-3 font-medium ${i>=1?"text-right":""}`}>{h}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {projects.data.flows.etfs.map((e: REFlowETF) => (
                      <tr key={e.name} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                        <td className="py-2 pr-3"><div className="font-bold text-[var(--text-primary)]">{e.name}</div><div className="text-[9px] text-[var(--text-muted)]">{e.full}</div></td>
                        <td className="py-2 pr-3 text-right font-mono">${e.aum_b}</td>
                        <td className="py-2 pr-3 text-right"><span className={e.flow_30d_m>=0?"text-emerald-400":"text-red-400"}>{e.flow_30d_m>=0?"+":""}{e.flow_30d_m}M</span></td>
                        <td className="py-2 text-right"><Ret v={e.ytd} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-2">Hedge Fund Positioning</div>
                {projects.data.flows.hedge_funds.map((hf: REFlowHF, i: number) => (
                  <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded p-2 flex items-center gap-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${hf.stance==="OVERWEIGHT"?"text-emerald-400 border-emerald-400/30 bg-emerald-400/10":"text-cyan-400 border-cyan-400/30 bg-cyan-400/10"}`}>{hf.stance}</span>
                    <div>
                      <div className="text-xs font-semibold text-[var(--text-primary)]">{hf.fund}</div>
                      <div className="text-[9px] text-[var(--text-muted)]">{hf.focus}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null
      )}

      {/* ── COMPOSITE ── */}
      {tab === "Composite" && (
        composite.isLoading ? <Loading /> : composite.isError ? <Err msg="Error loading composite" /> :
        composite.data ? (
          <div className="space-y-5">
            <div className="flex gap-4 flex-wrap items-start">
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex flex-col items-center gap-1 shrink-0">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Composite Bullishness</div>
                <SupercycleGauge score={composite.data.composite.score} />
                <div className="text-xs font-semibold" style={{color: composite.data.composite.score>=60?"#10b981":composite.data.composite.score>=40?"#f59e0b":"#ef4444"}}>
                  {composite.data.composite.label}
                </div>
              </div>
              <div className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                <SH title="Score Components" badge={`${composite.data.composite.score}/100`} />
                <div className="space-y-2.5">
                  {Object.entries(composite.data.composite.components).map(([k, v]) => (
                    <ScoreBar key={k} label={k} value={v as number} max={25}
                      weight={(composite.data.composite.weights as Record<string, number>)[k]} />
                  ))}
                </div>
              </div>
            </div>
            <SH title="Trading Signal Engine" badge={`${composite.data.signals.length} stocks · ${composite.data.as_of}`} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["Ticker","Company","Type","Exp%","Price","YTD","RSI","Target","Stop","Exp Return","Confidence","Signal"].map((h,i)=>(
                      <th key={h} className={`py-2 pr-3 font-medium ${i>=4&&i<=10?"text-right":""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {composite.data.signals.map((s: RESignal) => (
                    <tr key={s.ticker} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 font-bold text-[var(--text-primary)]">{s.ticker}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)] text-[10px]">{s.company}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)] text-[10px]">{s.type}</td>
                      <td className="py-2 pr-3 font-mono">{s.exposure_pct}%</td>
                      <td className="py-2 pr-3 text-right font-mono">${s.price?.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-right"><Ret v={s.ret_ytd} /></td>
                      <td className={`py-2 pr-3 text-right font-mono ${s.rsi!=null&&s.rsi>70?"text-red-400":s.rsi!=null&&s.rsi<30?"text-emerald-400":""}`}>{s.rsi?.toFixed(0)??"—"}</td>
                      <td className="py-2 pr-3 text-right font-mono text-emerald-400">{s.target!=null?`$${s.target}`:""}</td>
                      <td className="py-2 pr-3 text-right font-mono text-red-400">{s.stop!=null?`$${s.stop}`:""}</td>
                      <td className="py-2 pr-3 text-right"><Ret v={s.exp_return_pct} /></td>
                      <td className="py-2 pr-3 text-right font-mono">{s.confidence}%</td>
                      <td className="py-2"><SigBadge signal={s.signal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}
