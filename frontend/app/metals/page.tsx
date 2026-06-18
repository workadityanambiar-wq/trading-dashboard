"use client";
import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell, PolarRadiusAxis,
} from "recharts";
import { HistoryDrawer, DrawerConfig } from "@/components/HistoryDrawer";

// ── Types ─────────────────────────────────────────────────────────────────────
interface MetalData {
  price: number; unit: string; cat: string;
  chg_1d: number; chg_1w: number; chg_1m: number; chg_ytd: number;
  hi52: number; lo52: number; rsi: number; vol_ann: number;
  trend: string; momentum: string; volatility: string;
  ema20: number; ema50: number; ema100: number; ema200: number;
  macd: number; macd_sig: number; macd_hist: number;
  bb_upper: number; bb_mid: number; bb_lower: number;
  atr: number; adx: number; tech_score: number;
  support: number; resistance: number;
}
interface OverviewData {
  metals: Record<string, MetalData>;
  precious: string[]; industrial: string[];
  summary: Record<string, number | string>;
}
interface PerfRow {
  metal: string; cat: string; rank: number;
  chg_1d: number; chg_1w: number; chg_1m: number; chg_ytd: number;
  rsi: number; tech_score: number; leadership: number; trend: string;
}
interface MinerRow {
  company: string; ticker: string; price: number | null;
  chg_1d: number | null; chg_1m: number | null; chg_ytd: number | null;
  focus: string; guidance: string;
  pe: number; div_yield: number; eps_growth: number;
  rating: string; target: number;
}
interface FutureCurve {
  curve: {tenor: string; months: number; price: number}[];
  spot: number; basis_12m_pct: number; structure: string;
}
interface SignalRow {
  metal: string; cat: string; direction: string;
  entry: number; stop: number; target1: number; target2: number;
  rr: number; confidence: number; tech_score: number; rsi: number; trend: string;
}
interface ScenarioRow {
  name: string; cat: string; prob: number;
  impact: Record<string, {mn: number; base: number; mx: number; price_lo?: number; price_base?: number; price_hi?: number; spot?: number}>;
  rationale: string; analog: string;
}
interface CompositeScore {
  score: number; label: string;
  components: Record<string, number>;
  weights: Record<string, number>;
}

const TABS = [
  "Overview","Performance","Supply","Demand","Inventories","Central Banks",
  "Macro","China","Mining","Futures","Positioning","Technicals",
  "Quant Models","Correlations","Signals","Scenarios",
];

const API = "/api/metals";
const METAL_ORDER = ["Gold","Silver","Platinum","Palladium","Copper","Aluminum","Nickel","Zinc","Lead","Tin"];
const PRECIOUS = ["Gold","Silver","Platinum","Palladium"];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (v: number | null | undefined, d = 2) => v == null ? "—" : v.toFixed(d);
const fmtP = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const chgCls = (v: number | null | undefined) => !v ? "text-text-muted" : v > 0 ? "text-green-400" : "text-red-400";
const scoreCls = (s: number) => s >= 70 ? "text-green-400" : s >= 50 ? "text-yellow-400" : s >= 30 ? "text-orange-400" : "text-red-400";
const trendBadge = (t: string) => {
  const map: Record<string, string> = {
    Bullish: "bg-green-500/20 text-green-400 border border-green-500/30",
    Bearish: "bg-red-500/20 text-red-400 border border-red-500/30",
    Neutral: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  };
  return map[t] ?? map.Neutral;
};
const CHART_COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#84cc16","#ec4899","#6366f1"];
const METAL_CHART_COLOR: Record<string, string> = {
  Gold:"#f59e0b", Silver:"#94a3b8", Platinum:"#6366f1", Palladium:"#8b5cf6",
  Copper:"#f97316", Aluminum:"#06b6d4", Nickel:"#10b981", Zinc:"#3b82f6",
  Lead:"#64748b", Tin:"#a855f7",
};
const heatColor = (v: number) => {
  if (v > 8)  return "#16a34a";
  if (v > 3)  return "#4ade80";
  if (v > 0)  return "#86efac";
  if (v > -3) return "#fca5a5";
  if (v > -8) return "#f87171";
  return "#dc2626";
};

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="bg-surface-2 rounded-lg p-4 border border-border">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className={`text-lg font-bold ${cls ?? "text-text-primary"}`}>{value}</div>
      {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Metal Price Card ──────────────────────────────────────────────────────────
function MetalCard({ name, d }: { name: string; d: MetalData }) {
  const isPrecious = PRECIOUS.includes(name);
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const color = METAL_CHART_COLOR[name] ?? "#6366f1";
  return (
    <>
    <div
      className="bg-surface-2 rounded-lg p-4 border border-border hover:border-accent/40 transition-colors cursor-pointer"
      onClick={() => setDrawer({ fetchUrl: `/api/chart/metal/${name.toLowerCase()}`, color })}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="font-semibold text-text-primary text-sm">{name}</div>
          <div className="text-xs text-text-muted">{d.unit}</div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${isPrecious ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"}`}>
          {isPrecious ? "Precious" : "Industrial"}
        </span>
      </div>
      <div className="text-2xl font-bold text-text-primary mb-1">
        {d.unit === "USD/toz" ? `$${fmt(d.price, 2)}` :
         d.unit === "USD/lb"  ? `$${fmt(d.price, 3)}/lb` :
                                `$${fmt(d.price, 0)}/t`}
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs mb-3">
        <div className={chgCls(d.chg_1d)}>1D: {fmtP(d.chg_1d)}</div>
        <div className={chgCls(d.chg_1w)}>1W: {fmtP(d.chg_1w)}</div>
        <div className={chgCls(d.chg_1m)}>1M: {fmtP(d.chg_1m)}</div>
        <div className={chgCls(d.chg_ytd)}>YTD: {fmtP(d.chg_ytd)}</div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <span className={`text-center text-xs px-1 py-0.5 rounded ${trendBadge(d.trend)}`}>{d.trend}</span>
        <span className={`text-center text-xs px-1 py-0.5 rounded ${trendBadge(d.momentum)}`}>{d.momentum}</span>
        <span className="text-center text-xs px-1 py-0.5 rounded bg-surface border border-border text-text-muted">{d.volatility}</span>
      </div>
      <div className="mt-2 flex justify-between text-xs text-text-muted">
        <span>RSI: <span className={scoreCls(d.rsi)}>{fmt(d.rsi, 0)}</span></span>
        <span>Tech: <span className={scoreCls(d.tech_score)}>{d.tech_score}/100</span></span>
        <span>Vol: {fmt(d.vol_ann, 0)}%</span>
      </div>
      <div className="mt-2 bg-surface rounded h-1.5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/30 to-green-500/30" />
        <div className="absolute h-full w-0.5 bg-accent"
          style={{ left: `${((d.price - d.lo52) / (d.hi52 - d.lo52)) * 100}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
        <span>52W Lo: {d.unit === "USD/t" ? fmt(d.lo52, 0) : fmt(d.lo52, 2)}</span>
        <span>52W Hi: {d.unit === "USD/t" ? fmt(d.hi52, 0) : fmt(d.hi52, 2)}</span>
      </div>
    </div>
    <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ data }: { data: OverviewData | null }) {
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const { metals, summary } = data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Best Today"    value={`${summary.best_1d}`}  sub={fmtP(summary.best_1d_chg as number)} cls="text-green-400" />
        <StatCard label="Worst Today"   value={`${summary.worst_1d}`} sub={fmtP(summary.worst_1d_chg as number)} cls="text-red-400" />
        <StatCard label="YTD Leader"    value={`${summary.best_ytd}`} sub={fmtP(summary.best_ytd_chg as number)} cls="text-green-400" />
        <StatCard label="YTD Laggard"   value={`${summary.worst_ytd}`} sub={fmtP(summary.worst_ytd_chg as number)} cls="text-red-400" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-widest mb-3">Precious Metals</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {["Gold","Silver","Platinum","Palladium"].map(m => metals[m] ? <MetalCard key={m} name={m} d={metals[m]} /> : null)}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-widest mb-3">Industrial Metals</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {["Copper","Aluminum","Nickel","Zinc","Lead","Tin"].map(m => metals[m] ? <MetalCard key={m} name={m} d={metals[m]} /> : null)}
        </div>
      </div>
    </div>
  );
}

// ── Performance Tab ───────────────────────────────────────────────────────────
function PerformanceTab({ data }: { data: {rows: PerfRow[]} | null }) {
  const [period, setPeriod] = useState<"chg_1d"|"chg_1w"|"chg_1m"|"chg_ytd">("chg_ytd");
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const { rows } = data;
  const sorted = [...rows].sort((a,b) => (b[period]??0)-(a[period]??0));
  const heatmapData = rows.map(r => ({
    metal: r.metal,
    "1D": r.chg_1d, "1W": r.chg_1w, "1M": r.chg_1m, "YTD": r.chg_ytd,
  }));
  return (
    <div className="space-y-6">
      <div className="flex gap-2 mb-2">
        {(["chg_1d","chg_1w","chg_1m","chg_ytd"] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${period===p ? "bg-accent text-white" : "bg-surface-2 text-text-muted hover:text-text-primary"}`}>
            {p.replace("chg_","").toUpperCase()}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-muted mb-4">Return Comparison</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={sorted} layout="vertical" margin={{left:8,right:8}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
              <XAxis type="number" tick={{fontSize:10,fill:"#888"}} tickFormatter={v=>`${v>0?"+":""}${v.toFixed(1)}%`} />
              <YAxis type="category" dataKey="metal" tick={{fontSize:10,fill:"#888"}} width={70} />
              <Tooltip formatter={(v:number)=>`${v>0?"+":""}${v.toFixed(2)}%`} contentStyle={{background:"#1a1a2e",border:"1px solid #333",fontSize:11}} />
              <Bar dataKey={period} radius={[0,3,3,0]}>
                {sorted.map(r => <Cell key={r.metal} fill={heatColor(r[period]??0)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-muted mb-4">Performance Heatmap</h3>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-text-muted">
                <th className="text-left py-1 pr-3">Metal</th>
                {["1D","1W","1M","YTD"].map(p=><th key={p} className="text-center py-1 px-2">{p}</th>)}
              </tr></thead>
              <tbody>
                {heatmapData.map(r=>(
                  <tr key={r.metal} className="border-t border-border/30">
                    <td className="py-1.5 pr-3 font-medium text-text-primary">{r.metal}</td>
                    {["1D","1W","1M","YTD"].map(p=>{
                      const v = r[p as keyof typeof r] as number;
                      return (
                        <td key={p} className="text-center py-1.5 px-2 rounded"
                          style={{background:`${heatColor(v)}22`,color:heatColor(v)}}>
                          {fmtP(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="bg-surface-2 rounded-lg p-4 border border-border">
        <h3 className="text-sm font-medium text-text-muted mb-4">Leadership Ranking</h3>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-text-muted border-b border-border">
              <th className="text-left py-2 pr-3">#</th>
              <th className="text-left py-2 pr-3">Metal</th>
              <th className="text-center py-2 px-2">1D</th>
              <th className="text-center py-2 px-2">1W</th>
              <th className="text-center py-2 px-2">1M</th>
              <th className="text-center py-2 px-2">YTD</th>
              <th className="text-center py-2 px-2">RSI</th>
              <th className="text-center py-2 px-2">Tech</th>
              <th className="text-center py-2 px-2">Trend</th>
              <th className="text-center py-2 px-2">Score</th>
            </tr></thead>
            <tbody>
              {rows.slice().sort((a,b)=>b.leadership-a.leadership).map((r,i)=>(
                <tr key={r.metal} className="border-b border-border/30 hover:bg-surface/40">
                  <td className="py-2 pr-3 text-text-muted">{i+1}</td>
                  <td className="py-2 pr-3 font-medium text-text-primary">{r.metal}</td>
                  <td className={`text-center py-2 px-2 ${chgCls(r.chg_1d)}`}>{fmtP(r.chg_1d)}</td>
                  <td className={`text-center py-2 px-2 ${chgCls(r.chg_1w)}`}>{fmtP(r.chg_1w)}</td>
                  <td className={`text-center py-2 px-2 ${chgCls(r.chg_1m)}`}>{fmtP(r.chg_1m)}</td>
                  <td className={`text-center py-2 px-2 ${chgCls(r.chg_ytd)}`}>{fmtP(r.chg_ytd)}</td>
                  <td className={`text-center py-2 px-2 ${scoreCls(r.rsi)}`}>{fmt(r.rsi, 0)}</td>
                  <td className={`text-center py-2 px-2 ${scoreCls(r.tech_score)}`}>{r.tech_score}</td>
                  <td className="text-center py-2 px-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${trendBadge(r.trend)}`}>{r.trend}</span></td>
                  <td className={`text-center py-2 px-2 font-semibold ${scoreCls(50 + r.leadership)}`}>{r.leadership > 0 ? "+" : ""}{r.leadership}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Supply Tab ────────────────────────────────────────────────────────────────
function SupplyTab({ data }: { data: any }) {
  const [metal, setMetal] = useState("Copper");
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const supply = data.supply ?? {};
  const metals = Object.keys(supply);
  const d = supply[metal] ?? {};
  const riskColor = (r: string) => r === "High" ? "text-red-400" : r === "Medium" ? "text-yellow-400" : "text-green-400";
  const tightnessColor = (s: number) => s >= 70 ? "text-green-400" : s >= 50 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {metals.map(m => (
          <button key={m} onClick={()=>setMetal(m)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${metal===m ? "bg-accent text-white" : "bg-surface-2 text-text-muted hover:text-text-primary"}`}>
            {m}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Global Production" value={d.global_prod ?? "—"} sub={d.prod_unit} />
        <StatCard label="YoY Change" value={fmtP(d.yoy)} cls={chgCls(d.yoy)} sub="annual" />
        <StatCard label="Refinery Utilization" value={`${d.refinery_util ?? "—"}%`} />
        <StatCard label="Supply Tightness" value={`${d.supply_tightness ?? "—"}/100`}
          cls={tightnessColor(d.supply_tightness ?? 50)} sub={d.supply_tightness >= 70 ? "Tight" : d.supply_tightness >= 50 ? "Balanced" : "Loose"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-muted mb-4">Top Producing Countries</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d.countries ?? []} margin={{left:8,right:8}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" tick={{fontSize:9,fill:"#888"}} />
              <YAxis tick={{fontSize:10,fill:"#888"}} tickFormatter={v=>`${v}%`} />
              <Tooltip formatter={(v:number)=>`${v}% global share`} contentStyle={{background:"#1a1a2e",border:"1px solid #333",fontSize:11}} />
              <Bar dataKey="share" fill="#3b82f6" radius={[3,3,0,0]}>
                {(d.countries??[]).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-muted mb-4">Country Detail</h3>
          <table className="w-full text-xs">
            <thead><tr className="text-text-muted border-b border-border">
              <th className="text-left py-2">Country</th>
              <th className="text-center py-2">Share</th>
              <th className="text-center py-2">YoY</th>
              <th className="text-center py-2">Risk</th>
            </tr></thead>
            <tbody>
              {(d.countries ?? []).map((c: any) => (
                <tr key={c.name} className="border-b border-border/30">
                  <td className="py-2 font-medium text-text-primary">{c.name}</td>
                  <td className="text-center py-2">{c.share}%</td>
                  <td className={`text-center py-2 ${chgCls(c.yoy)}`}>{fmtP(c.yoy)}</td>
                  <td className={`text-center py-2 font-medium ${riskColor(c.risk)}`}>{c.risk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Demand Tab ────────────────────────────────────────────────────────────────
function DemandTab({ data }: { data: any }) {
  const [metal, setMetal] = useState("Gold");
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const demand = data.demand ?? {};
  const metals = Object.keys(demand);
  const d = demand[metal] ?? {};
  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {metals.map(m => (
          <button key={m} onClick={()=>setMetal(m)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${metal===m ? "bg-accent text-white" : "bg-surface-2 text-text-muted hover:text-text-primary"}`}>
            {m}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Demand Strength Score" value={`${d.demand_strength ?? "—"}/100`}
          cls={scoreCls(d.demand_strength ?? 50)} sub={d.demand_strength >= 70 ? "Strong" : d.demand_strength >= 50 ? "Moderate" : "Weak"} />
        <StatCard label="As Of" value={d.as_of ?? "—"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-muted mb-4">Demand Breakdown</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.breakdown ?? []} margin={{left:8,right:8}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="sector" tick={{fontSize:9,fill:"#888"}} />
              <YAxis yAxisId="share" tick={{fontSize:10,fill:"#888"}} tickFormatter={v=>`${v}%`} />
              <YAxis yAxisId="yoy" orientation="right" tick={{fontSize:10,fill:"#888"}} tickFormatter={v=>`${v>0?"+":""}${v}%`} />
              <Tooltip contentStyle={{background:"#1a1a2e",border:"1px solid #333",fontSize:11}} />
              <Legend wrapperStyle={{fontSize:10}} />
              <Bar yAxisId="share" dataKey="share" fill="#3b82f6" name="Share %" radius={[3,3,0,0]} />
              <Bar yAxisId="yoy"   dataKey="yoy"   fill="#10b981" name="YoY %" radius={[3,3,0,0]}>
                {(d.breakdown??[]).map((b: any, i: number) => <Cell key={i} fill={heatColor(b.yoy)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-muted mb-4">Sector Table</h3>
          <table className="w-full text-xs">
            <thead><tr className="text-text-muted border-b border-border">
              <th className="text-left py-2">Sector</th>
              <th className="text-center py-2">Share</th>
              <th className="text-center py-2">YoY</th>
            </tr></thead>
            <tbody>
              {(d.breakdown ?? []).map((b: any) => (
                <tr key={b.sector} className="border-b border-border/30">
                  <td className="py-2 font-medium text-text-primary">{b.sector}</td>
                  <td className="text-center py-2">{b.share}%</td>
                  <td className={`text-center py-2 ${chgCls(b.yoy)}`}>{fmtP(b.yoy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Inventories Tab ───────────────────────────────────────────────────────────
function InventoriesTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const inv = data.inventories ?? {};
  const signalCls = (s: string) => s === "Bullish" ? "text-green-400 bg-green-500/20 border border-green-500/30" :
                                    s === "Bearish" ? "text-red-400 bg-red-500/20 border border-red-500/30" :
                                    "text-yellow-400 bg-yellow-500/20 border border-yellow-500/30";
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {["Copper","Aluminum","Nickel","Zinc"].map(m => {
          const d = inv[m] ?? {};
          return (
            <div key={m} className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-sm text-text-primary">{m}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${signalCls(d.signal)}`}>{d.signal}</span>
              </div>
              <div className="text-xl font-bold text-text-primary">{fmt(d.total,1)} kt</div>
              <div className="text-xs text-text-muted mb-2">5Y Percentile: <span className={scoreCls(100-d.pct5y)}>{d.pct5y}%</span></div>
              {d.days && <div className="text-xs text-text-muted">Days consumption: {fmt(d.days,1)}d</div>}
              <div className="mt-2 bg-surface rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full" style={{width:`${d.pct5y}%`,background:`linear-gradient(90deg,#16a34a,#dc2626)`}} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="bg-surface-2 rounded-lg p-4 border border-border overflow-auto">
        <h3 className="text-sm font-medium text-text-muted mb-4">Exchange Inventory Detail</h3>
        <table className="w-full text-xs min-w-[600px]">
          <thead><tr className="text-text-muted border-b border-border">
            <th className="text-left py-2 pr-3">Metal</th>
            <th className="text-center py-2 px-2">LME</th>
            <th className="text-center py-2 px-2">COMEX</th>
            <th className="text-center py-2 px-2">SHFE</th>
            <th className="text-center py-2 px-2">Total</th>
            <th className="text-center py-2 px-2">Wk Chg</th>
            <th className="text-center py-2 px-2">5Y Pct</th>
            <th className="text-center py-2 px-2">Signal</th>
          </tr></thead>
          <tbody>
            {Object.entries(inv).map(([metal, d]: [string, any]) => (
              <tr key={metal} className="border-b border-border/30 hover:bg-surface/40">
                <td className="py-2 pr-3 font-medium text-text-primary">{metal}</td>
                <td className="text-center py-2 px-2 text-text-muted">
                  {d.LME ? `${fmt(d.LME.kt ?? d.LME.moz, 1)} ${d.unit ?? "kt"}` : "—"}
                </td>
                <td className="text-center py-2 px-2 text-text-muted">
                  {d.COMEX ? `${fmt(d.COMEX.kt ?? d.COMEX.moz, 1)} ${d.unit ?? "kt"}` : "—"}
                </td>
                <td className="text-center py-2 px-2 text-text-muted">
                  {d.SHFE ? `${fmt(d.SHFE.kt, 1)} kt` : "—"}
                </td>
                <td className="text-center py-2 px-2 font-medium text-text-primary">{fmt(d.total, 1)} {d.unit ?? "kt"}</td>
                <td className={`text-center py-2 px-2 ${chgCls(d.LME?.wk_chg ?? 0)}`}>
                  {fmtP(d.LME?.wk_chg ?? 0)}
                </td>
                <td className="text-center py-2 px-2"><span className={scoreCls(100-d.pct5y)}>{d.pct5y}th</span></td>
                <td className="text-center py-2 px-2"><span className={`px-2 py-0.5 rounded-full text-[10px] ${signalCls(d.signal)}`}>{d.signal}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Central Banks Tab ─────────────────────────────────────────────────────────
function CentralBanksTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const h = data.headline ?? {};
  const buyers = data.buyers ?? [];
  const trendCls = (t: string) => t.includes("Strong") ? "text-green-400" : t === "Accumulating" ? "text-blue-400" : "text-text-muted";
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="2024 Purchases" value={`${h.purchases_2024_t}t`} sub="Central banks globally" cls="text-yellow-400" />
        <StatCard label="2025 YTD Purchases" value={`${h.ytd_2025_t}t`} sub="pace ≈1,000t/year" cls="text-green-400" />
        <StatCard label="Official Reserves" value={`${(h.total_reserves_t/1000).toFixed(1)}kt`} sub={`${h.pct_global_reserves}% of global reserves`} />
        <StatCard label="Demand Index" value={`${h.demand_index}/100`} cls={scoreCls(h.demand_index)} sub={h.trend} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-muted mb-4">Major Gold Buyers (2024–2025)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={buyers} margin={{left:8,right:8}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="country" tick={{fontSize:9,fill:"#888"}} />
              <YAxis tick={{fontSize:10,fill:"#888"}} tickFormatter={v=>`${v}t`} />
              <Tooltip contentStyle={{background:"#1a1a2e",border:"1px solid #333",fontSize:11}} />
              <Legend wrapperStyle={{fontSize:10}} />
              <Bar dataKey="y2024_t" name="2024 (t)" fill="#f59e0b" radius={[3,3,0,0]} />
              <Bar dataKey="ytd_t"   name="2025 YTD (t)" fill="#3b82f6" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-muted mb-4">Buyer Detail</h3>
          <table className="w-full text-xs">
            <thead><tr className="text-text-muted border-b border-border">
              <th className="text-left py-2">Country</th>
              <th className="text-center py-2">2024 (t)</th>
              <th className="text-center py-2">2025 YTD</th>
              <th className="text-center py-2">Total Res.</th>
              <th className="text-center py-2">Score</th>
              <th className="text-left py-2">Trend</th>
            </tr></thead>
            <tbody>
              {buyers.map((b: any) => (
                <tr key={b.country} className="border-b border-border/30">
                  <td className="py-2 font-medium">{b.flag} {b.country}</td>
                  <td className="text-center py-2">{b.y2024_t}t</td>
                  <td className="text-center py-2 text-blue-400">{b.ytd_t}t</td>
                  <td className="text-center py-2 text-text-muted">{(b.total_t/1000).toFixed(2)}kt</td>
                  <td className={`text-center py-2 font-semibold ${scoreCls(b.score)}`}>{b.score}</td>
                  <td className={`py-2 text-xs ${trendCls(b.trend)}`}>{b.trend}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Macro Tab ─────────────────────────────────────────────────────────────────
function MacroTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const macro = data.macro ?? {};
  const corr = data.correlations ?? {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Macro Support Score" value={`${data.macro_score}/100`} cls={scoreCls(data.macro_score)} sub={data.macro_label} />
        <StatCard label="Real 10Y Yield" value={`${data.real_yield}%`} cls={data.real_yield < 1 ? "text-green-400" : data.real_yield > 2 ? "text-red-400" : "text-yellow-400"} sub={`10Y: ${macro["10Y Yield"]?.price?.toFixed(2) ?? "—"}% | BE: ${data.breakeven_10y}%`} />
        <StatCard label="DXY Index" value={fmt(macro.DXY?.price, 2)} sub={`1D: ${fmtP(macro.DXY?.chg_1d)}`} cls={chgCls(-(macro.DXY?.chg_1d ?? 0))} />
        <StatCard label="VIX" value={fmt(macro.VIX?.price, 1)} sub={`1D: ${fmtP(macro.VIX?.chg_1d)}`} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Object.entries(macro).map(([name, d]: [string, any]) => (
          <div key={name} className="bg-surface-2 rounded-lg p-3 border border-border">
            <div className="text-xs text-text-muted mb-1">{name}</div>
            <div className="font-semibold text-text-primary">{fmt(d.price, name.includes("Yield") ? 3 : 2)}</div>
            <div className="flex gap-3 mt-1">
              <span className={`text-xs ${chgCls(d.chg_1d)}`}>1D: {fmtP(d.chg_1d)}</span>
              <span className={`text-xs ${chgCls(d.chg_1w)}`}>1W: {fmtP(d.chg_1w)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-surface-2 rounded-lg p-4 border border-border">
        <h3 className="text-sm font-medium text-text-muted mb-4">Key Metals Correlations (1Y)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(corr).map(([k, v]: [string, any]) => (
            <div key={k} className="text-center">
              <div className="text-xs text-text-muted mb-1">{k.replace(/_/g," ")}</div>
              <div className={`text-2xl font-bold ${Number(v) < -0.5 ? "text-red-400" : Number(v) > 0.5 ? "text-green-400" : "text-yellow-400"}`}>
                {Number(v).toFixed(2)}
              </div>
              <div className="text-xs text-text-muted">{Math.abs(Number(v)) > 0.7 ? "Strong" : Math.abs(Number(v)) > 0.4 ? "Moderate" : "Weak"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── China Tab ─────────────────────────────────────────────────────────────────
function ChinaTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const impact = data.impact ?? {};
  const impactCls = (lbl: string) => lbl.includes("Positive") || lbl.includes("Bullish") ? "text-green-400" :
                                      lbl.includes("Bearish") || lbl.includes("Negative") ? "text-red-400" : "text-yellow-400";
  const pmiData = [
    {name:"Mfg PMI",value:data.pmi_mfg,threshold:50},
    {name:"Svc PMI",value:data.pmi_svc,threshold:50},
    {name:"FAI YoY%",value:data.fai_yoy,threshold:0},
    {name:"IP YoY%", value:data.ip_yoy, threshold:0},
    {name:"Property",value:data.property_yoy,threshold:0},
    {name:"Infra YoY",value:data.infra_yoy,threshold:0},
    {name:"EV Sales", value:data.ev_sales_yoy,threshold:0},
    {name:"Steel YoY",value:data.steel_yoy,threshold:0},
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="China Demand Score" value={`${data.china_score}/100`} cls={scoreCls(data.china_score)} sub={data.china_score >= 60 ? "Supportive" : data.china_score >= 40 ? "Neutral" : "Weak"} />
        <StatCard label="Mfg PMI" value={fmt(data.pmi_mfg,1)} cls={data.pmi_mfg >= 50 ? "text-green-400" : "text-red-400"} sub={data.pmi_mfg >= 50 ? "Expansion" : "Contraction"} />
        <StatCard label="Property Investment" value={fmtP(data.property_yoy)} cls="text-red-400" sub="YoY — still contracting" />
        <StatCard label="EV Sales" value={fmtP(data.ev_sales_yoy)} cls="text-green-400" sub="YoY — bullish for Ni, Cu" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-muted mb-4">China Economic Dashboard</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pmiData} margin={{left:8,right:8}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" tick={{fontSize:9,fill:"#888"}} />
              <YAxis tick={{fontSize:10,fill:"#888"}} />
              <Tooltip contentStyle={{background:"#1a1a2e",border:"1px solid #333",fontSize:11}} />
              <Bar dataKey="value" radius={[3,3,0,0]}>
                {pmiData.map((d, i) => <Cell key={i} fill={d.value >= d.threshold ? "#16a34a" : "#dc2626"} />)}
              </Bar>
              <ReferenceLine y={50} stroke="#888" strokeDasharray="4 4" label={{value:"50",fill:"#888",fontSize:9}} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-muted mb-4">China Impact on Metals</h3>
          <div className="space-y-3">
            {Object.entries(impact).map(([metal, d]: [string, any]) => (
              <div key={metal} className="flex items-center gap-3">
                <div className="w-20 text-sm font-medium text-text-primary">{metal}</div>
                <div className={`w-24 text-xs font-semibold ${impactCls(d.label)}`}>{d.label}</div>
                <div className="flex-1 bg-surface rounded-full h-2">
                  <div className="h-full rounded-full bg-accent" style={{width:`${d.score}%`}} />
                </div>
                <div className="w-8 text-xs text-text-muted text-right">{d.score}</div>
                <div className="text-xs text-text-muted flex-shrink-0 max-w-[160px] truncate" title={d.driver}>{d.driver}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mining Tab ────────────────────────────────────────────────────────────────
function MiningTab({ data }: { data: any }) {
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const miners: MinerRow[] = data.miners ?? [];
  const ratingCls = (r: string) => r.includes("Buy") || r.includes("Overweight") || r.includes("Outperform") ? "text-green-400" : "text-yellow-400";
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Mining Equity Strength" value={`${data.mining_strength}/100`} cls={scoreCls(data.mining_strength)} />
        <StatCard label="Average Div Yield" value={`${(miners.reduce((s,m)=>s+(m.div_yield??0),0)/miners.length).toFixed(1)}%`} />
        <StatCard label="Avg EPS Growth" value={`${(miners.reduce((s,m)=>s+(m.eps_growth??0),0)/miners.length).toFixed(1)}%`} cls="text-green-400" />
      </div>
      <div className="bg-surface-2 rounded-lg p-4 border border-border overflow-auto">
        <h3 className="text-sm font-medium text-text-muted mb-4">Mining Equities</h3>
        <table className="w-full text-xs min-w-[800px]">
          <thead><tr className="text-text-muted border-b border-border">
            <th className="text-left py-2 pr-3">Company</th>
            <th className="text-center py-2 px-2">Price</th>
            <th className="text-center py-2 px-2">1D</th>
            <th className="text-center py-2 px-2">1M</th>
            <th className="text-center py-2 px-2">YTD</th>
            <th className="text-center py-2 px-2">P/E</th>
            <th className="text-center py-2 px-2">Div%</th>
            <th className="text-center py-2 px-2">EPS Gr.</th>
            <th className="text-center py-2 px-2">Rating</th>
            <th className="text-center py-2 px-2">Target</th>
            <th className="text-left py-2 px-2">Focus</th>
          </tr></thead>
          <tbody>
            {miners.map(m => (
              <tr key={m.company} className="border-b border-border/30 hover:bg-surface/40 cursor-pointer"
                onClick={() => m.ticker && setDrawer({ fetchUrl: `/api/chart/stock/${m.ticker}`, color: "#6366f1" })}>
                <td className="py-2 pr-3">
                  <div className="font-medium text-text-primary">{m.company}</div>
                  <div className="text-[10px] text-text-muted">{m.ticker}</div>
                </td>
                <td className="text-center py-2 px-2 font-medium">{m.price ? `$${fmt(m.price,2)}` : "—"}</td>
                <td className={`text-center py-2 px-2 ${chgCls(m.chg_1d)}`}>{fmtP(m.chg_1d)}</td>
                <td className={`text-center py-2 px-2 ${chgCls(m.chg_1m)}`}>{fmtP(m.chg_1m)}</td>
                <td className={`text-center py-2 px-2 ${chgCls(m.chg_ytd)}`}>{fmtP(m.chg_ytd)}</td>
                <td className="text-center py-2 px-2 text-text-muted">{m.pe}x</td>
                <td className="text-center py-2 px-2 text-yellow-400">{m.div_yield}%</td>
                <td className={`text-center py-2 px-2 ${chgCls(m.eps_growth)}`}>{fmtP(m.eps_growth)}</td>
                <td className={`text-center py-2 px-2 font-semibold text-xs ${ratingCls(m.rating)}`}>{m.rating}</td>
                <td className="text-center py-2 px-2 text-text-muted">${m.target}</td>
                <td className="py-2 px-2 text-text-muted max-w-[140px] truncate" title={m.focus}>{m.focus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-surface-2 rounded-lg p-4 border border-border">
        <h3 className="text-sm font-medium text-text-muted mb-3">Production Guidance</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {miners.map(m => (
            <div key={m.company} className="bg-surface rounded-lg p-3 border border-border/50">
              <div className="text-sm font-medium text-text-primary mb-1">{m.company}</div>
              <div className="text-xs text-text-muted">{m.guidance}</div>
            </div>
          ))}
        </div>
      </div>
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}

// ── Futures Tab ───────────────────────────────────────────────────────────────
function FuturesTab({ data }: { data: any }) {
  const [metal, setMetal] = useState("Gold");
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const curves: Record<string, FutureCurve> = data.curves ?? {};
  const metals = Object.keys(curves);
  const d = curves[metal];
  const structureCls = (s: string) => s === "Backwardation" ? "text-green-400" : s === "Contango" ? "text-red-400" : "text-yellow-400";
  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {metals.map(m => (
          <button key={m} onClick={()=>setMetal(m)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${metal===m ? "bg-accent text-white" : "bg-surface-2 text-text-muted hover:text-text-primary"}`}>
            {m}
          </button>
        ))}
      </div>
      {d && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Spot Price" value={`$${fmt(d.spot,4)}`} />
            <StatCard label="12M Basis" value={fmtP(d.basis_12m_pct)} cls={chgCls(d.basis_12m_pct)} />
            <StatCard label="Structure" value={d.structure} cls={structureCls(d.structure)} />
          </div>
          <div className="bg-surface-2 rounded-lg p-4 border border-border">
            <h3 className="text-sm font-medium text-text-muted mb-4">{metal} Futures Curve</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={d.curve} margin={{left:8,right:8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="tenor" tick={{fontSize:10,fill:"#888"}} />
                <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#888"}} tickFormatter={v=>v.toFixed(2)} />
                <Tooltip contentStyle={{background:"#1a1a2e",border:"1px solid #333",fontSize:11}} formatter={(v:number)=>`$${v.toFixed(4)}`} />
                <Line dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={{r:4,fill:"#3b82f6"}} />
                <ReferenceLine y={d.spot} stroke="#f59e0b" strokeDasharray="4 4" label={{value:"Spot",fill:"#f59e0b",fontSize:9}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-surface-2 rounded-lg p-4 border border-border overflow-auto">
            <h3 className="text-sm font-medium text-text-muted mb-3">All Metals Term Structure</h3>
            <table className="w-full text-xs">
              <thead><tr className="text-text-muted border-b border-border">
                <th className="text-left py-2 pr-3">Metal</th>
                <th className="text-center py-2 px-2">Spot</th>
                <th className="text-center py-2 px-2">3M</th>
                <th className="text-center py-2 px-2">6M</th>
                <th className="text-center py-2 px-2">12M</th>
                <th className="text-center py-2 px-2">12M Basis</th>
                <th className="text-center py-2 px-2">Structure</th>
              </tr></thead>
              <tbody>
                {Object.entries(curves).map(([m, c]) => {
                  const getPrice = (tenor: string) => c.curve.find(p=>p.tenor===tenor)?.price;
                  return (
                    <tr key={m} className="border-b border-border/30">
                      <td className="py-2 pr-3 font-medium text-text-primary">{m}</td>
                      <td className="text-center py-2 px-2">${fmt(c.spot,3)}</td>
                      <td className="text-center py-2 px-2 text-text-muted">${fmt(getPrice("3M"),3)}</td>
                      <td className="text-center py-2 px-2 text-text-muted">${fmt(getPrice("6M"),3)}</td>
                      <td className="text-center py-2 px-2 text-text-muted">${fmt(getPrice("12M"),3)}</td>
                      <td className={`text-center py-2 px-2 ${chgCls(c.basis_12m_pct)}`}>{fmtP(c.basis_12m_pct)}</td>
                      <td className={`text-center py-2 px-2 font-medium ${structureCls(c.structure)}`}>{c.structure}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Positioning Tab ───────────────────────────────────────────────────────────
function PositioningTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const metals = ["Gold","Silver","Copper","Platinum","Palladium"];
  const cotData = metals.filter(m => data[m]).map(m => ({
    metal: m,
    mm_long: data[m].mm_long,
    mm_short: -data[m].mm_short,
    mm_net: data[m].mm_net,
  }));
  return (
    <div className="space-y-6">
      <div className="text-xs text-text-muted bg-surface-2 rounded px-3 py-1.5 border border-border w-fit">
        CFTC Commitment of Traders — as of {data.as_of}
      </div>
      <div className="bg-surface-2 rounded-lg p-4 border border-border">
        <h3 className="text-sm font-medium text-text-muted mb-4">Managed Money Positioning</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={cotData} margin={{left:8,right:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="metal" tick={{fontSize:10,fill:"#888"}} />
            <YAxis tick={{fontSize:10,fill:"#888"}} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{background:"#1a1a2e",border:"1px solid #333",fontSize:11}} formatter={(v:number)=>`${v.toLocaleString()} contracts`} />
            <Legend wrapperStyle={{fontSize:10}} />
            <Bar dataKey="mm_long"  name="MM Long"  fill="#10b981" stackId="a" radius={[0,0,0,0]} />
            <Bar dataKey="mm_short" name="MM Short" fill="#ef4444" stackId="a" radius={[0,0,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-surface-2 rounded-lg p-4 border border-border overflow-auto">
        <h3 className="text-sm font-medium text-text-muted mb-4">COT Detail</h3>
        <table className="w-full text-xs min-w-[600px]">
          <thead><tr className="text-text-muted border-b border-border">
            <th className="text-left py-2 pr-3">Metal</th>
            <th className="text-center py-2 px-2">MM Net</th>
            <th className="text-center py-2 px-2">MM Long</th>
            <th className="text-center py-2 px-2">MM Short</th>
            <th className="text-center py-2 px-2">% OI</th>
            <th className="text-center py-2 px-2">Comm Net</th>
            <th className="text-center py-2 px-2">Extreme</th>
            <th className="text-center py-2 px-2">Crowd Score</th>
          </tr></thead>
          <tbody>
            {metals.filter(m=>data[m]).map(m => {
              const d = data[m];
              const extreme = d.extreme_short ? "Short Extreme ⚠️" : d.extreme_long ? "Long Extreme ⚠️" : "—";
              const extremeCls = (d.extreme_short || d.extreme_long) ? "text-yellow-400" : "text-text-muted";
              return (
                <tr key={m} className="border-b border-border/30 hover:bg-surface/40">
                  <td className="py-2 pr-3 font-medium text-text-primary">{m}</td>
                  <td className={`text-center py-2 px-2 font-semibold ${d.mm_net > 0 ? "text-green-400" : "text-red-400"}`}>{d.mm_net.toLocaleString()}</td>
                  <td className="text-center py-2 px-2 text-green-400">{d.mm_long.toLocaleString()}</td>
                  <td className="text-center py-2 px-2 text-red-400">{d.mm_short.toLocaleString()}</td>
                  <td className="text-center py-2 px-2">{d.mm_pct_oi}%</td>
                  <td className={`text-center py-2 px-2 ${d.comm_net > 0 ? "text-green-400" : "text-text-muted"}`}>{d.comm_net.toLocaleString()}</td>
                  <td className={`text-center py-2 px-2 text-xs ${extremeCls}`}>{extreme}</td>
                  <td className={`text-center py-2 px-2 font-semibold ${scoreCls(d.crowd > 70 ? 30 : d.crowd < 30 ? 70 : 50)}`}>{d.crowd}/100</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Technicals Tab ────────────────────────────────────────────────────────────
function TechnicalsTab({ data }: { data: any }) {
  const [selected, setSelected] = useState("Gold");
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const techs: any[] = data.technicals ?? [];
  const d = techs.find(t => t.metal === selected);
  const radarData = d ? [
    {subject:"RSI",value:d.rsi??50},
    {subject:"Trend",value:d.trend==="Bullish"?80:d.trend==="Bearish"?20:50},
    {subject:"MACD",value:d.macd>d.macd_sig?75:25},
    {subject:"Vol",value:d.volatility==="Low"?70:d.volatility==="High"?30:50},
    {subject:"ADX",value:Math.min(100,d.adx??20)},
    {subject:"Score",value:d.tech_score??50},
  ] : [];
  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {METAL_ORDER.map(m => (
          <button key={m} onClick={()=>setSelected(m)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${selected===m ? "bg-accent text-white" : "bg-surface-2 text-text-muted hover:text-text-primary"}`}>
            {m}
          </button>
        ))}
      </div>
      {d && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface-2 rounded-lg p-4 border border-border">
            <h3 className="text-sm font-medium text-text-muted mb-2">{selected} Technical Snapshot</h3>
            <div className="grid grid-cols-2 gap-3 text-xs mb-4">
              <div><span className="text-text-muted">Price:</span> <span className="text-text-primary font-medium">{d.unit === "USD/t" ? `$${fmt(d.price,0)}` : `$${fmt(d.price,3)}`} {d.unit}</span></div>
              <div><span className="text-text-muted">RSI(14):</span> <span className={scoreCls(d.rsi)}>{fmt(d.rsi,1)}</span></div>
              <div><span className="text-text-muted">EMA 20:</span> <span>{d.ema20 ? (d.unit==="USD/t"?fmt(d.ema20,0):fmt(d.ema20,3)) : "—"}</span></div>
              <div><span className="text-text-muted">EMA 50:</span> <span>{d.ema50 ? (d.unit==="USD/t"?fmt(d.ema50,0):fmt(d.ema50,3)) : "—"}</span></div>
              <div><span className="text-text-muted">EMA 100:</span> <span>{d.ema100 ? (d.unit==="USD/t"?fmt(d.ema100,0):fmt(d.ema100,3)) : "—"}</span></div>
              <div><span className="text-text-muted">EMA 200:</span> <span>{d.ema200 ? (d.unit==="USD/t"?fmt(d.ema200,0):fmt(d.ema200,3)) : "—"}</span></div>
              <div><span className="text-text-muted">MACD:</span> <span className={chgCls(d.macd)}>{fmt(d.macd,3)}</span></div>
              <div><span className="text-text-muted">Signal:</span> <span className={chgCls(d.macd_sig)}>{fmt(d.macd_sig,3)}</span></div>
              <div><span className="text-text-muted">BB Upper:</span> <span>{d.unit==="USD/t"?fmt(d.bb_upper,0):fmt(d.bb_upper,3)}</span></div>
              <div><span className="text-text-muted">BB Lower:</span> <span>{d.unit==="USD/t"?fmt(d.bb_lower,0):fmt(d.bb_lower,3)}</span></div>
              <div><span className="text-text-muted">ATR:</span> <span>{fmt(d.atr,2)}</span></div>
              <div><span className="text-text-muted">ADX:</span> <span className={scoreCls(d.adx)}>{fmt(d.adx,1)} {d.adx>25?"(Trending)":"(Ranging)"}</span></div>
            </div>
            <div className="flex gap-2 mt-2">
              {[{lbl:"Trend",val:d.trend},{lbl:"Momentum",val:d.momentum},{lbl:"Volatility",val:d.volatility}].map(x=>(
                <span key={x.lbl} className={`text-xs px-2 py-0.5 rounded-full ${trendBadge(x.val)}`}>{x.lbl}: {x.val}</span>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-surface rounded p-2"><div className="text-text-muted">Support</div><div className="font-semibold text-green-400">{d.unit==="USD/t"?`$${fmt(d.support,0)}/t`:`$${fmt(d.support,3)}`}</div></div>
              <div className="bg-surface rounded p-2"><div className="text-text-muted">Resistance</div><div className="font-semibold text-red-400">{d.unit==="USD/t"?`$${fmt(d.resistance,0)}/t`:`$${fmt(d.resistance,3)}`}</div></div>
            </div>
          </div>
          <div className="bg-surface-2 rounded-lg p-4 border border-border">
            <h3 className="text-sm font-medium text-text-muted mb-2">Technical Score Radar</h3>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#333" />
                <PolarAngleAxis dataKey="subject" tick={{fontSize:10,fill:"#888"}} />
                <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="text-center mt-1">
              <span className="text-3xl font-bold" style={{color:heatColor((d.tech_score??50)-50)}}>{d.tech_score}</span>
              <span className="text-sm text-text-muted">/100 Tech Score</span>
            </div>
          </div>
        </div>
      )}
      <div className="bg-surface-2 rounded-lg p-4 border border-border overflow-auto">
        <h3 className="text-sm font-medium text-text-muted mb-3">All Metals — Technical Summary</h3>
        <table className="w-full text-xs min-w-[700px]">
          <thead><tr className="text-text-muted border-b border-border">
            <th className="text-left py-2 pr-3">Metal</th>
            <th className="text-center py-2 px-2">RSI</th>
            <th className="text-center py-2 px-2">ADX</th>
            <th className="text-center py-2 px-2">MACD</th>
            <th className="text-center py-2 px-2">Trend</th>
            <th className="text-center py-2 px-2">Momentum</th>
            <th className="text-center py-2 px-2">Volatility</th>
            <th className="text-center py-2 px-2">Score</th>
          </tr></thead>
          <tbody>
            {techs.map(t => (
              <tr key={t.metal} className={`border-b border-border/30 hover:bg-surface/40 cursor-pointer ${selected===t.metal?"bg-accent/10":""}`} onClick={()=>setSelected(t.metal)}>
                <td className="py-2 pr-3 font-medium text-text-primary">{t.metal}</td>
                <td className={`text-center py-2 px-2 ${scoreCls(t.rsi)}`}>{fmt(t.rsi,0)}</td>
                <td className="text-center py-2 px-2 text-text-muted">{fmt(t.adx,0)}</td>
                <td className={`text-center py-2 px-2 ${t.macd > t.macd_sig ? "text-green-400":"text-red-400"}`}>{t.macd > t.macd_sig ? "▲":"▼"}</td>
                <td className="text-center py-2 px-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${trendBadge(t.trend)}`}>{t.trend}</span></td>
                <td className="text-center py-2 px-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${trendBadge(t.momentum)}`}>{t.momentum}</span></td>
                <td className="text-center py-2 px-2 text-text-muted">{t.volatility}</td>
                <td className={`text-center py-2 px-2 font-bold ${scoreCls(t.tech_score)}`}>{t.tech_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Quant Models Tab ──────────────────────────────────────────────────────────
function QuantModelsTab({ fvData, regimeData, forecastData }: { fvData: any; regimeData: any; forecastData: any }) {
  const [forecastMetal, setForecastMetal] = useState("Gold");
  const [model, setModel] = useState("Ensemble");
  if (!fvData && !regimeData && !forecastData) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const fv = fvData?.models ?? {};
  const regime = regimeData ?? {};
  const fc = forecastData?.forecasts ?? {};
  const fcMetals = Object.keys(fc);
  const fcData = fc[forecastMetal]?.[model];
  const horizons = ["1W","1M","3M","6M","12M"];
  const chartData = fcData ? horizons.map(h => ({
    horizon: h,
    base:  fcData[h]?.base,
    lo:    fcData[h]?.lo,
    hi:    fcData[h]?.hi,
  })) : [];
  const regimeCls = (r: string) => {
    const map: Record<string,string> = {
      "Inflationary Boom":"text-green-400","Industrial Expansion":"text-blue-400",
      "Safe-Haven Demand":"text-yellow-400","Deflationary Slowdown":"text-orange-400","Recession":"text-red-400",
    };
    return map[r] ?? "text-text-primary";
  };
  return (
    <div className="space-y-6">
      {/* Regime */}
      <div className="bg-surface-2 rounded-lg p-4 border border-border">
        <h3 className="text-sm font-medium text-text-muted mb-3">Metals Market Regime</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className={`text-2xl font-bold mb-2 ${regimeCls(regime.regime)}`}>{regime.regime}</div>
            <p className="text-xs text-text-muted mb-4">{regime.description}</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(regime.implications ?? {}).map(([m, impl]: [string, any]) => (
                <div key={m} className="bg-surface rounded p-2 text-xs flex justify-between">
                  <span className="text-text-primary font-medium">{m}</span>
                  <span className={impl.includes("Bullish") ? "text-green-400" : impl.includes("Bearish") ? "text-red-400" : "text-yellow-400"}>{impl}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-text-muted border-b border-border">
                <th className="text-left py-1.5">Period</th><th className="text-center py-1.5">Regime</th>
                <th className="text-center py-1.5">Gold</th><th className="text-center py-1.5">Copper</th>
              </tr></thead>
              <tbody>
                {(regime.history ?? []).map((h: any) => (
                  <tr key={h.period} className="border-b border-border/30">
                    <td className="py-1.5 text-text-primary">{h.period}</td>
                    <td className={`py-1.5 text-center text-[10px] ${regimeCls(h.regime)}`}>{h.regime}</td>
                    <td className={`py-1.5 text-center ${chgCls(h.gold_ret)}`}>{fmtP(h.gold_ret)}</td>
                    <td className={`py-1.5 text-center ${chgCls(h.copper_ret)}`}>{fmtP(h.copper_ret)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* Fair Value */}
      <div className="bg-surface-2 rounded-lg p-4 border border-border">
        <h3 className="text-sm font-medium text-text-muted mb-3">Fair Value Models</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(fv).map(([m, d]: [string, any]) => {
            const over = d.mispricing_pct > 0;
            return (
              <div key={m} className="bg-surface rounded-lg p-4 border border-border">
                <div className="font-semibold text-text-primary mb-2">{m}</div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div><div className="text-text-muted">Spot</div><div className="font-bold text-text-primary">${fmt(d.spot,2)}</div></div>
                  <div><div className="text-text-muted">Fair Value</div><div className="font-bold text-accent">${fmt(d.fair_value,2)}</div></div>
                </div>
                <div className={`text-sm font-semibold mb-1 ${over ? "text-red-400" : "text-green-400"}`}>
                  {over ? "▲ Overvalued" : "▼ Undervalued"} {fmtP(d.mispricing_pct)}
                </div>
                <div className={`text-xs px-2 py-0.5 rounded-full w-fit ${trendBadge(d.rating === "Fairly Valued" ? "Neutral" : d.rating === "Overvalued" ? "Bearish" : "Bullish")}`}>{d.rating}</div>
                <div className="mt-2 text-[10px] text-text-muted">
                  {Object.entries(d.inputs).map(([k,v]) => `${k}: ${typeof v === "number" ? v.toFixed(2) : v}`).join(" | ")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Forecasts */}
      <div className="bg-surface-2 rounded-lg p-4 border border-border">
        <h3 className="text-sm font-medium text-text-muted mb-3">Price Forecasts</h3>
        <div className="flex gap-2 mb-4 flex-wrap">
          {fcMetals.map(m => (
            <button key={m} onClick={()=>setForecastMetal(m)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${forecastMetal===m?"bg-accent text-white":"bg-surface text-text-muted hover:text-text-primary"}`}>
              {m}
            </button>
          ))}
          <div className="flex-1" />
          {["ARIMA","Prophet","Ensemble"].map(mo => (
            <button key={mo} onClick={()=>setModel(mo)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${model===mo?"bg-purple-500/30 text-purple-300 border border-purple-500/40":"bg-surface text-text-muted hover:text-text-primary"}`}>
              {mo}
            </button>
          ))}
        </div>
        {fcData && (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{left:8,right:8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="horizon" tick={{fontSize:10,fill:"#888"}} />
                <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:"#888"}} tickFormatter={v=>v.toFixed(2)} />
                <Tooltip contentStyle={{background:"#1a1a2e",border:"1px solid #333",fontSize:11}} formatter={(v:number)=>`$${v.toFixed(4)}`} />
                <Line dataKey="base" stroke="#3b82f6" strokeWidth={2} name="Base" dot={{r:4}} />
                <Line dataKey="hi"   stroke="#10b981" strokeWidth={1} strokeDasharray="4 2" name="Upper 90%" dot={false} />
                <Line dataKey="lo"   stroke="#ef4444" strokeWidth={1} strokeDasharray="4 2" name="Lower 90%" dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-5 gap-2 mt-3">
              {horizons.map(h => (
                <div key={h} className="bg-surface rounded p-2 text-center text-xs">
                  <div className="text-text-muted mb-0.5">{h}</div>
                  <div className="font-bold text-accent">${fmt(fcData[h]?.base,3)}</div>
                  <div className="text-[10px] text-text-muted">{fmt(fcData[h]?.lo,3)}–{fmt(fcData[h]?.hi,3)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Correlations Tab ──────────────────────────────────────────────────────────
function CorrelationsTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const matrix = data.matrix ?? {};
  const assets = data.assets ?? [];
  if (!assets.length) return <div className="text-text-muted p-8 text-center">No correlation data available.</div>;
  const corrColor = (v: number) => {
    if (v > 0.7) return "#16a34a";
    if (v > 0.4) return "#4ade80";
    if (v > 0.1) return "#86efac";
    if (v > -0.1) return "#888";
    if (v > -0.4) return "#fca5a5";
    if (v > -0.7) return "#f87171";
    return "#dc2626";
  };
  return (
    <div className="space-y-6">
      <div className="text-xs text-text-muted bg-surface-2 rounded px-3 py-1.5 border border-border w-fit">
        1-Year Rolling Correlations (Daily Returns)
      </div>
      <div className="bg-surface-2 rounded-lg p-4 border border-border overflow-auto">
        <h3 className="text-sm font-medium text-text-muted mb-4">Cross-Asset Correlation Matrix</h3>
        <div className="overflow-auto">
          <table className="text-[10px] border-separate border-spacing-0.5">
            <thead><tr>
              <th className="text-right pr-2 py-1 text-text-muted font-normal w-24"></th>
              {assets.map((a: string) => (
                <th key={a} className="text-center py-1 px-1 text-text-muted font-normal w-16 rotate-0 whitespace-nowrap overflow-hidden text-ellipsis"
                  style={{maxWidth:64}}>{a.slice(0,8)}</th>
              ))}
            </tr></thead>
            <tbody>
              {assets.map((row: string) => (
                <tr key={row}>
                  <td className="text-right pr-2 py-1 text-text-muted font-normal whitespace-nowrap">{row.slice(0,12)}</td>
                  {assets.map((col: string) => {
                    const v = matrix[row]?.[col] ?? 0;
                    return (
                      <td key={col} className="text-center py-1 px-1 rounded"
                        style={{background:`${corrColor(v)}22`,color:corrColor(v),minWidth:48}}>
                        {v.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Signals Tab ───────────────────────────────────────────────────────────────
function SignalsTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const signals: SignalRow[] = data.signals ?? [];
  const dirCls = (d: string) => d === "Long" ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                                 d === "Short" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                                 "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
  const actionable = signals.filter(s => s.direction !== "Neutral");
  const neutral    = signals.filter(s => s.direction === "Neutral");
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Long Signals"    value={`${signals.filter(s=>s.direction==="Long").length}`}  cls="text-green-400" />
        <StatCard label="Short Signals"   value={`${signals.filter(s=>s.direction==="Short").length}`} cls="text-red-400" />
        <StatCard label="Neutral Signals" value={`${signals.filter(s=>s.direction==="Neutral").length}`} cls="text-yellow-400" />
      </div>
      {actionable.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-widest mb-3">Actionable Signals</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {actionable.map(s => (
              <div key={s.metal} className="bg-surface-2 rounded-lg p-4 border border-border">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-semibold text-text-primary">{s.metal}</div>
                    <div className="text-xs text-text-muted">{s.cat === "precious" ? "Precious Metal" : "Industrial Metal"}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${dirCls(s.direction)}`}>{s.direction.toUpperCase()}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div className="bg-surface rounded p-2">
                    <div className="text-text-muted">Entry</div>
                    <div className="font-bold text-text-primary">${fmt(s.entry, s.entry < 100 ? 3 : 2)}</div>
                  </div>
                  <div className="bg-surface rounded p-2">
                    <div className="text-text-muted">Stop</div>
                    <div className="font-bold text-red-400">${fmt(s.stop, s.stop < 100 ? 3 : 2)}</div>
                  </div>
                  <div className="bg-surface rounded p-2">
                    <div className="text-text-muted">Target 1</div>
                    <div className="font-bold text-green-400">${fmt(s.target1, s.target1 < 100 ? 3 : 2)}</div>
                  </div>
                  <div className="bg-surface rounded p-2">
                    <div className="text-text-muted">Target 2</div>
                    <div className="font-bold text-green-400">${fmt(s.target2, s.target2 < 100 ? 3 : 2)}</div>
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-text-muted">R:R <span className={`font-bold ${s.rr >= 2 ? "text-green-400" : s.rr >= 1.5 ? "text-yellow-400" : "text-red-400"}`}>{s.rr}:1</span></span>
                  <span className="text-text-muted">Conf <span className={`font-bold ${scoreCls(s.confidence)}`}>{s.confidence}%</span></span>
                  <span className="text-text-muted">RSI <span className={scoreCls(s.rsi)}>{fmt(s.rsi,0)}</span></span>
                  <span className="text-text-muted">Tech <span className={scoreCls(s.tech_score)}>{s.tech_score}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {neutral.length > 0 && (
        <div className="bg-surface-2 rounded-lg p-4 border border-border overflow-auto">
          <h3 className="text-sm font-medium text-text-muted mb-3">Neutral / Watch List</h3>
          <table className="w-full text-xs">
            <thead><tr className="text-text-muted border-b border-border">
              <th className="text-left py-2 pr-3">Metal</th>
              <th className="text-center py-2 px-2">RSI</th>
              <th className="text-center py-2 px-2">Tech Score</th>
              <th className="text-center py-2 px-2">Trend</th>
              <th className="text-center py-2 px-2">Confidence</th>
            </tr></thead>
            <tbody>
              {neutral.map(s => (
                <tr key={s.metal} className="border-b border-border/30">
                  <td className="py-2 pr-3 font-medium text-text-primary">{s.metal}</td>
                  <td className={`text-center py-2 px-2 ${scoreCls(s.rsi)}`}>{fmt(s.rsi,0)}</td>
                  <td className={`text-center py-2 px-2 ${scoreCls(s.tech_score)}`}>{s.tech_score}</td>
                  <td className="text-center py-2 px-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${trendBadge(s.trend)}`}>{s.trend}</span></td>
                  <td className="text-center py-2 px-2 text-text-muted">{s.confidence}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Scenarios Tab ─────────────────────────────────────────────────────────────
function ScenariosTab({ data, compositeData }: { data: any; compositeData: any }) {
  const [selected, setSelected] = useState(0);
  if (!data) return <div className="text-text-muted p-8 text-center">Loading…</div>;
  const scenarios: ScenarioRow[] = data.scenarios ?? [];
  const composite = compositeData?.scores ?? {};
  const s = scenarios[selected];
  const catCls: Record<string,string> = {
    Monetary:"bg-purple-500/20 text-purple-300 border-purple-500/30",
    Growth:"bg-green-500/20 text-green-300 border-green-500/30",
    Recession:"bg-red-500/20 text-red-300 border-red-500/30",
    Inflation:"bg-orange-500/20 text-orange-300 border-orange-500/30",
    Supply:"bg-blue-500/20 text-blue-300 border-blue-500/30",
    Currency:"bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    Geopolitical:"bg-pink-500/20 text-pink-300 border-pink-500/30",
  };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          {scenarios.map((sc, i) => (
            <button key={i} onClick={()=>setSelected(i)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${i===selected ? "bg-accent/20 border-accent/40 text-text-primary" : "bg-surface-2 border-border text-text-muted hover:border-border hover:text-text-primary"}`}>
              <div className="flex justify-between items-center">
                <div className="font-medium text-xs">{sc.name}</div>
                <span className="text-xs text-text-muted">{sc.prob}%</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border mt-1 inline-block ${catCls[sc.cat] ?? ""}`}>{sc.cat}</span>
            </button>
          ))}
        </div>
        {s && (
          <div className="lg:col-span-2 bg-surface-2 rounded-lg p-5 border border-border">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-base font-semibold text-text-primary">{s.name}</h3>
              <div className="text-right">
                <div className="text-2xl font-bold text-accent">{s.prob}%</div>
                <div className="text-xs text-text-muted">probability</div>
              </div>
            </div>
            <p className="text-xs text-text-muted mb-4">{s.rationale}</p>
            <div className="text-xs text-text-muted mb-4">Historical Analog: <span className="text-text-primary">{s.analog}</span></div>
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">Expected Price Impact</h4>
            <div className="space-y-3">
              {Object.entries(s.impact).map(([metal, impact]) => (
                <div key={metal} className="flex items-center gap-3">
                  <div className="w-20 text-xs font-medium text-text-primary">{metal}</div>
                  <div className={`w-16 text-xs font-semibold text-right ${chgCls(impact.base)}`}>
                    {impact.base > 0 ? "+" : ""}{impact.base}%
                  </div>
                  <div className="flex-1 relative h-4 flex items-center">
                    <div className="absolute inset-0 bg-surface rounded-full" />
                    <div className="absolute h-2 rounded-full" style={{
                      background: impact.base >= 0 ? "#16a34a" : "#dc2626",
                      left: impact.base >= 0 ? "50%" : `${50 + impact.base * 0.5}%`,
                      width: `${Math.abs(impact.base) * 0.5}%`,
                    }} />
                    <div className="absolute w-0.5 h-4 bg-text-muted/30" style={{left:"50%"}} />
                  </div>
                  <div className="text-[10px] text-text-muted w-24 text-right">
                    {impact.mn}% to +{impact.mx}%
                  </div>
                  {impact.price_base && (
                    <div className="text-xs font-medium text-accent w-20 text-right">
                      ${fmt(impact.price_base, impact.price_base < 100 ? 2 : 0)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Composite Bullishness Scores */}
      {Object.keys(composite).length > 0 && (
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-muted mb-4">Metals Bullishness Score (Composite)</h3>
          <div className="space-y-3">
            {Object.entries(composite).sort((a,b) => (b[1] as CompositeScore).score - (a[1] as CompositeScore).score).map(([metal, d]: [string, any]) => (
              <div key={metal} className="flex items-center gap-3">
                <div className="w-20 text-xs font-medium text-text-primary">{metal}</div>
                <div className={`w-6 text-xs font-bold ${scoreCls(d.score)}`}>{d.score}</div>
                <div className="flex-1 bg-surface rounded-full h-3 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width:`${d.score}%`,
                    background:`linear-gradient(90deg,${d.score<40?"#dc2626":d.score<60?"#f59e0b":"#16a34a"},transparent)`,
                  }} />
                </div>
                <div className={`text-xs w-28 ${scoreCls(d.score)}`}>{d.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10px] text-text-muted">
            Weights: Supply 20% | Demand 20% | Inventories 15% | Macro 15% | Positioning 10% | Technicals 10% | Sentiment 10%
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MetalsPage() {
  const [tab, setTab] = useState(0);
  const [overview, setOverview]     = useState<OverviewData | null>(null);
  const [perf, setPerf]             = useState<{rows: PerfRow[]} | null>(null);
  const [supply, setSupply]         = useState<any>(null);
  const [demand, setDemand]         = useState<any>(null);
  const [inventories, setInventories] = useState<any>(null);
  const [cb, setCb]                 = useState<any>(null);
  const [macro, setMacro]           = useState<any>(null);
  const [china, setChina]           = useState<any>(null);
  const [mining, setMining]         = useState<any>(null);
  const [futures, setFutures]       = useState<any>(null);
  const [positioning, setPositioning] = useState<any>(null);
  const [technicals, setTechnicals] = useState<any>(null);
  const [fvData, setFvData]         = useState<any>(null);
  const [regimeData, setRegimeData] = useState<any>(null);
  const [forecastData, setForecastData] = useState<any>(null);
  const [corrData, setCorrData]     = useState<any>(null);
  const [signals, setSignals]       = useState<any>(null);
  const [scenarios, setScenarios]   = useState<any>(null);
  const [composite, setComposite]   = useState<any>(null);
  const [alerts, setAlerts]         = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    const go = async () => {
      try {
        const eps = [
          `${API}/overview`,`${API}/performance`,`${API}/supply`,`${API}/demand`,
          `${API}/inventories`,`${API}/central-banks`,`${API}/macro`,`${API}/china`,
          `${API}/mining`,`${API}/futures`,`${API}/positioning`,`${API}/technicals`,
          `${API}/fair-value`,`${API}/regime`,`${API}/forecasts`,`${API}/correlations`,
          `${API}/signals`,`${API}/scenarios`,`${API}/composite`,`${API}/alerts`,
        ];
        const results = await Promise.allSettled(eps.map(e => fetch(e).then(r => r.json())));
        const get = (i: number) => results[i].status === "fulfilled" ? (results[i] as PromiseFulfilledResult<any>).value : null;
        setOverview(get(0));   setPerf(get(1));       setSupply(get(2));   setDemand(get(3));
        setInventories(get(4));setCb(get(5));         setMacro(get(6));    setChina(get(7));
        setMining(get(8));     setFutures(get(9));    setPositioning(get(10)); setTechnicals(get(11));
        setFvData(get(12));    setRegimeData(get(13));setForecastData(get(14));setCorrData(get(15));
        setSignals(get(16));   setScenarios(get(17)); setComposite(get(18));   setAlerts(get(19));
      } catch (e) {
        setError("Failed to load metals data");
      } finally {
        setLoading(false);
      }
    };
    go();
  }, []);

  const renderTab = () => {
    switch (tab) {
      case 0:  return <OverviewTab data={overview} />;
      case 1:  return <PerformanceTab data={perf} />;
      case 2:  return <SupplyTab data={supply} />;
      case 3:  return <DemandTab data={demand} />;
      case 4:  return <InventoriesTab data={inventories} />;
      case 5:  return <CentralBanksTab data={cb} />;
      case 6:  return <MacroTab data={macro} />;
      case 7:  return <ChinaTab data={china} />;
      case 8:  return <MiningTab data={mining} />;
      case 9:  return <FuturesTab data={futures} />;
      case 10: return <PositioningTab data={positioning} />;
      case 11: return <TechnicalsTab data={technicals} />;
      case 12: return <QuantModelsTab fvData={fvData} regimeData={regimeData} forecastData={forecastData} />;
      case 13: return <CorrelationsTab data={corrData} />;
      case 14: return <SignalsTab data={signals} />;
      case 15: return <ScenariosTab data={scenarios} compositeData={composite} />;
      default: return null;
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
        <div className="text-sm text-text-muted">Loading Metals Intelligence…</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64 text-red-400">{error}</div>
  );

  const alertCount = alerts?.alerts?.filter((a: any) => a.severity === "Critical" || a.severity === "High").length ?? 0;

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Global Metals Intelligence</h1>
          <p className="text-sm text-text-muted mt-1">Precious & Industrial Metals — Live Prices, Fundamentals, Quant Models</p>
        </div>
        <div className="flex gap-3">
          {alertCount > 0 && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">
              {alertCount} High-Priority Alert{alertCount > 1 ? "s" : ""}
            </div>
          )}
          <div className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text-muted">
            Updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Alert Banner */}
      {alerts?.alerts?.slice(0, 2).map((a: any, i: number) => (
        <div key={i} className={`rounded-lg px-4 py-2.5 flex items-center justify-between text-xs border
          ${a.severity === "Critical" ? "bg-red-500/20 border-red-500/30 text-red-300" :
            a.severity === "High"     ? "bg-orange-500/20 border-orange-500/30 text-orange-300" :
            "bg-yellow-500/20 border-yellow-500/30 text-yellow-300"}`}>
          <div><span className="font-semibold">{a.severity} — {a.metal}:</span> {a.message}</div>
          <div className="text-text-muted ml-4 flex-shrink-0">{a.action}</div>
        </div>
      ))}

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap border-b border-border pb-0">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`px-3 py-2 text-xs font-medium rounded-t transition-colors whitespace-nowrap
              ${tab === i
                ? "bg-surface-2 text-text-primary border border-b-0 border-border"
                : "text-text-muted hover:text-text-primary"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>{renderTab()}</div>
    </div>
  );
}
