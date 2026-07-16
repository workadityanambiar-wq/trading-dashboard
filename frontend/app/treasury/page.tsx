"use client";
import { useMarket } from "@/contexts/MarketContext";
import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
  ComposedChart, Cell, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle,
  ChevronUp, ChevronDown, Activity, Shield, Target, Zap,
  BarChart2, Globe, Landmark, DollarSign, LineChart as LineIcon,
} from "lucide-react";
import { PageGuide } from "@/components/PageGuide";

// ── Colors ─────────────────────────────────────────────────────────────────────
const B  = "#3b82f6"; // blue
const G  = "#10b981"; // green
const R  = "#ef4444"; // red
const A  = "#f59e0b"; // amber
const P  = "#8b5cf6"; // purple
const C  = "#06b6d4"; // cyan
const MU = "#6b7280"; // muted

// ── Types ─────────────────────────────────────────────────────────────────────
interface MaturityData {
  current: number; chg_1d: number; chg_1w: number; chg_1m: number;
  chg_ytd: number; hi52: number; lo52: number;
  rsi: number; ema20: number|null; ema50: number|null; ema200: number|null;
  trend: string; momentum: string; volatility: string; vol_annualized: number;
}
interface Overview { maturities: Record<string,MaturityData>; history: any[]; as_of: string; }
interface Curve {
  current_curve: {tenor:string;yield:number;months:number}[];
  historical_curves: {label:string;curve:{tenor:string;yield:number;months:number}[]}[];
  spreads: Record<string,number>;
  spread_history: any[];
  regime: string; regime_color: string; regime_favors: string[];
  steepening_signal: boolean; flattening_signal: boolean; inversion_alert: boolean;
  as_of: string;
}
interface Performance {
  performance: Record<string,{current:number;chg_1d:number;chg_1w:number;chg_1m:number;chg_3m:number;chg_6m:number;chg_ytd:number;vol_30d:number}>;
  best_1m: string; worst_1m: string;
  relative_value: Record<string,{z_score:number;signal:string}>;
  as_of: string;
}
interface Inflation {
  cpi:number; core_cpi:number; pce:number; core_pce:number;
  breakeven_5y:number; breakeven_10y:number;
  inflation_pressure_score:number; bond_signal:string; fed_target:number;
  history: {month:string;cpi:number;core_pce:number;be10:number}[];
  as_of: string;
}
interface Fed {
  current_rate:number; target_range:string; next_meeting:string;
  cut_prob:number; hike_prob:number; hold_prob:number;
  monetary_policy_score:number; policy_stance:string; real_fed_funds:number;
  dot_plot_chart: {year:string;rate:number}[];
  rate_path: {meeting:string;rate:number;cut_prob:number}[];
  as_of: string;
}
interface Economic {
  gdp_qoq:number; gdp_yoy:number; ism_mfg:number; ism_services:number;
  nfp_k:number; unemployment:number; wage_growth_yoy:number; jolts_openings_m:number;
  growth_score:number; growth_signal:string; bond_signal:string; recession_prob:number;
  as_of: string;
}
interface Positioning {
  asset_managers_net:number; leveraged_funds_net:number; commercial_net:number;
  crowding_indicator:string; crowding_score:number;
  am_percentile:number; lf_percentile:number;
  history: {date:string;asset_managers:number;leveraged_funds:number}[];
  as_of: string;
}
interface RiskSentiment {
  vix:number; vix_1m_change:number; move_index:number;
  hy_spread_bps:number; ig_spread_bps:number;
  risk_score:number; risk_regime:string;
  flight_to_safety_score:number; flight_to_safety_active:boolean;
  vix_history: {date:string;vix:number}[];
  as_of: string;
}
interface Correlations { corr_30d:Record<string,number>; corr_90d:Record<string,number>; as_of:string; }
interface FairValue {
  fair_values: Record<string,{current:number;fair_value:number;deviation_bps:number;signal:string}>;
  inputs: any; as_of:string;
}
interface Forecasts {
  forecasts: Record<string,{current:number}&Record<string,{yield:number;change_bps:number;lower_95:number;upper_95:number;direction:string}>>;
  model:string; as_of:string;
}
interface Composite {
  composite_score:number; label:string;
  components:Record<string,number>; weights:Record<string,number>;
  as_of:string;
}
interface Signal {
  type:string; direction:string; instrument:string;
  entry:number|null; stop:number|null; target:number|null;
  rr:string; confidence:number; rationale:string;
}
interface Signals { signals:Signal[]; composite_score:number; regime:string; as_of:string; }
interface Scenario {
  scenario:string; probability:number; curve_impact:string; analog:string;
  moves:Record<string,number>; projected_yields:Record<string,number>; base_yields:Record<string,number>;
}
interface Scenarios { scenarios:Scenario[]; as_of:string; }
interface Technicals {
  technicals: Record<string,{
    current:number; ema20:number|null; ema50:number|null; ema100:number|null; ema200:number|null;
    rsi:number; rsi_signal:string; macd:number; macd_signal:number; macd_hist:number; macd_bullish:boolean;
    bb_upper:number; bb_mid:number; bb_lower:number; bb_pct:number;
    atr_bps:number; adx:number; di_plus:number; di_minus:number; trend_strength:string;
    support:number; resistance:number; technical_score:number;
  }>;
  as_of:string;
}
interface Auctions {
  auctions: Record<string,{date:string;size_b:number;yield:number;bid_cover:number;indirect_pct:number;primary_dealer_pct:number;tail_bps:number}>;
  auction_strength_score:number; strength:string; description:string; as_of:string;
}

// ── API ────────────────────────────────────────────────────────────────────────
async function api<T>(path: string): Promise<T> {
  const r = await fetch(`/api/treasury${path}`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v:number, d=2) => v?.toFixed(d) ?? "—";
const fmtBps = (v:number) => `${v >= 0 ? "+" : ""}${v?.toFixed(1)}bp`;
const fmtPct = (v:number) => `${v >= 0 ? "+" : ""}${v?.toFixed(2)}%`;
const bpsColor = (v:number) => v > 0 ? R : v < 0 ? G : MU;  // higher yield = red (bearish bonds)
const scoreColor = (v:number) => v >= 60 ? G : v <= 40 ? R : B;
const corrColor  = (v:number) => {
  if (v > 0.5) return R; if (v > 0.3) return "#f97316";
  if (v < -0.5) return G; if (v < -0.3) return "#84cc16";
  return MU;
};

// ── Base components ───────────────────────────────────────────────────────────
function Spinner() {
  return <div className="flex items-center justify-center h-40"><RefreshCw size={18} className="animate-spin text-blue-500"/></div>;
}
function Card({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={cn("bg-surface border border-border rounded-xl p-4", className)} style={style}>{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{children}</div>;
}
function Chip({ label, color }: { label: string; color: string }) {
  return <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: color + "22", color }}>{label}</span>;
}
function ScoreGauge({ score, label, size=160 }: { score: number; label: string; size?: number }) {
  const r=70,cx=100,cy=100,arc=Math.PI*r,filled=(score/100)*arc;
  const color = scoreColor(score);
  const angle = (score/100)*180 - 180;
  const nx = cx+r*Math.cos(angle*Math.PI/180), ny = cy+r*Math.sin(angle*Math.PI/180);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" style={{width:size,height:size*0.6}}>
        <path d={`M${cx-r},${cy} A${r},${r} 0 0,1 ${cx+r},${cy}`} fill="none" stroke="#1f2937" strokeWidth="14" strokeLinecap="round"/>
        <path d={`M${cx-r},${cy} A${r},${r} 0 0,1 ${cx+r},${cy}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
              strokeDasharray={`${filled} ${arc}`}/>
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth="2" opacity="0.8"/>
        <circle cx={cx} cy={cy} r="4" fill="white" opacity="0.8"/>
        <text x={cx} y={cy-8} textAnchor="middle" fill="white" fontSize="26" fontWeight="700">{score.toFixed(0)}</text>
        <text x={cx} y={cy+18} textAnchor="middle" fill={color} fontSize="10" fontWeight="600">{label}</text>
      </svg>
    </div>
  );
}
function CompBar({ label, value, weight }: { label: string; value: number; weight: number }) {
  const color = scoreColor(value);
  return (
    <div className="flex items-center gap-3">
      <div className="w-36 text-xs text-text-muted shrink-0">{label} <span className="text-text-muted/50">({(weight*100).toFixed(0)}%)</span></div>
      <div className="flex-1 bg-surface-2 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all" style={{width:`${value}%`,backgroundColor:color}}/>
      </div>
      <div className="w-8 text-right text-xs font-mono" style={{color}}>{value.toFixed(0)}</div>
    </div>
  );
}

const MATURITIES = ["2Y","5Y","10Y","20Y","30Y"];
const MAT_COLORS: Record<string,string> = {"2Y":B,"5Y":G,"10Y":A,"20Y":P,"30Y":C};

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Overview
// ══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ d }: { d: Overview }) {
  const mats = d.maturities;
  return (
    <div className="space-y-4">
      {/* Yield cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {MATURITIES.map(mat => {
          const m = mats[mat]; if (!m) return null;
          const pct = ((m.current - m.lo52) / (m.hi52 - m.lo52) * 100) || 50;
          return (
            <Card key={mat}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-text-muted">{mat}</span>
                <Chip label={m.trend} color={m.trend==="Falling"?G:m.trend==="Rising"?R:MU}/>
              </div>
              <div className="text-2xl font-bold font-mono" style={{color:MAT_COLORS[mat]}}>{fmt(m.current,3)}%</div>
              <div className="text-xs mt-1" style={{color:bpsColor(m.chg_1d)}}>{fmtBps(m.chg_1d)} today</div>
              <div className="mt-2 h-1 bg-surface-2 rounded-full">
                <div className="h-1 rounded-full" style={{width:`${pct}%`,backgroundColor:MAT_COLORS[mat]}}/>
              </div>
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>{fmt(m.lo52,2)}</span><span className="text-text-muted/50">52W</span><span>{fmt(m.hi52,2)}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Changes table */}
      <Card>
        <Label>Yield Changes (basis points)</Label>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="text-left py-2 pr-4">Maturity</th>
                <th className="text-right py-2 pr-4">Current</th>
                <th className="text-right py-2 pr-4">1D</th>
                <th className="text-right py-2 pr-4">1W</th>
                <th className="text-right py-2 pr-4">1M</th>
                <th className="text-right py-2 pr-4">YTD</th>
                <th className="text-right py-2 pr-4">RSI</th>
                <th className="text-right py-2">Momentum</th>
              </tr>
            </thead>
            <tbody>
              {MATURITIES.map(mat => {
                const m = mats[mat]; if (!m) return null;
                return (
                  <tr key={mat} className="border-b border-border/30">
                    <td className="py-2 pr-4 font-bold" style={{color:MAT_COLORS[mat]}}>{mat}</td>
                    <td className="text-right py-2 pr-4 text-text-primary">{fmt(m.current,3)}%</td>
                    <td className="text-right py-2 pr-4" style={{color:bpsColor(m.chg_1d)}}>{fmtBps(m.chg_1d)}</td>
                    <td className="text-right py-2 pr-4" style={{color:bpsColor(m.chg_1w)}}>{fmtBps(m.chg_1w)}</td>
                    <td className="text-right py-2 pr-4" style={{color:bpsColor(m.chg_1m)}}>{fmtBps(m.chg_1m)}</td>
                    <td className="text-right py-2 pr-4" style={{color:bpsColor(m.chg_ytd)}}>{fmtBps(m.chg_ytd)}</td>
                    <td className="text-right py-2 pr-4" style={{color: m.rsi>70?R:m.rsi<30?G:MU}}>{fmt(m.rsi,1)}</td>
                    <td className="text-right py-2"><Chip label={m.momentum} color={m.momentum==="Falling"?G:m.momentum==="Rising"?R:MU}/></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Historical chart */}
      <Card>
        <Label>90-Day Yield History</Label>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={d.history} margin={{top:4,right:8,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
            <XAxis dataKey="date" tick={{fill:MU,fontSize:10}} tickLine={false} interval={14}/>
            <YAxis domain={["auto","auto"]} tick={{fill:MU,fontSize:10}} tickLine={false} width={40}/>
            <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}}
                     labelStyle={{color:"#9ca3af"}} formatter={(v:number)=>[`${v?.toFixed(3)}%`]}/>
            <Legend wrapperStyle={{fontSize:11,color:MU}}/>
            {MATURITIES.map(mat => (
              <Line key={mat} type="monotone" dataKey={mat} stroke={MAT_COLORS[mat]}
                    strokeWidth={1.5} dot={false} name={`${mat} Yield`}/>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Volatility row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {MATURITIES.map(mat => {
          const m = mats[mat]; if (!m) return null;
          return (
            <Card key={mat} className="text-center">
              <div className="text-xs text-text-muted mb-1">{mat} Vol</div>
              <div className="text-lg font-bold font-mono" style={{color:MAT_COLORS[mat]}}>{fmt(m.vol_annualized,1)}%</div>
              <Chip label={m.volatility} color={m.volatility==="High"?R:m.volatility==="Low"?G:MU}/>
            </Card>
          );
        })}
      </div>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Yield Curve
// ══════════════════════════════════════════════════════════════════════════════
function CurveTab({ d }: { d: Curve }) {
  const HIST_COLORS = [B, G, A, P, C, "#f43f5e"];
  return (
    <div className="space-y-4">
      {/* Regime + alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="md:col-span-1">
          <Label>Curve Regime</Label>
          <div className="text-2xl font-bold mt-1" style={{color:d.regime_color}}>{d.regime}</div>
          <div className="text-xs text-text-muted mt-1">Favors: {d.regime_favors?.join(" · ")}</div>
          <div className="mt-3 space-y-1">
            {d.inversion_alert && <div className="flex items-center gap-2 text-xs text-red-400"><AlertTriangle size={12}/>Inversion Alert — 2s10s negative</div>}
            {d.steepening_signal && <div className="flex items-center gap-2 text-xs text-green-400"><TrendingUp size={12}/>Steepening Signal</div>}
            {d.flattening_signal && <div className="flex items-center gap-2 text-xs text-amber-400"><TrendingDown size={12}/>Flattening Signal</div>}
            {!d.inversion_alert && !d.steepening_signal && !d.flattening_signal &&
              <div className="text-xs text-text-muted">No active curve alerts</div>}
          </div>
        </Card>
        <Card className="md:col-span-2">
          <Label>Key Spreads (bps)</Label>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(d.spreads || {}).map(([k, v]) => (
              <div key={k} className="text-center p-2 bg-surface-2 rounded-lg">
                <div className="text-xs text-text-muted mb-1">{k.replace("s","s/")}</div>
                <div className="text-base font-bold font-mono" style={{color:v<0?R:v<50?A:G}}>{v?.toFixed(1)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Current yield curve */}
      <Card>
        <Label>Current Yield Curve vs History</Label>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart margin={{top:4,right:16,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
            <XAxis dataKey="months" type="number" domain={[0,370]} tickFormatter={m=>["3M","2Y","5Y","10Y","20Y","30Y"][
              [3,24,60,120,240,360].indexOf(m)] || ""} tick={{fill:MU,fontSize:10}} tickLine={false}/>
            <YAxis domain={["auto","auto"]} tick={{fill:MU,fontSize:10}} tickLine={false} width={40}
                   tickFormatter={(v:number)=>`${v.toFixed(2)}%`}/>
            <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}}
                     formatter={(v:number)=>[`${v?.toFixed(3)}%`]}/>
            <Legend wrapperStyle={{fontSize:11,color:MU}}/>
            {[{label:"Today",curve:d.current_curve},...(d.historical_curves||[])].map((hc,i)=>(
              <Line key={hc.label} data={hc.curve} type="monotone" dataKey="yield"
                    stroke={HIST_COLORS[i]} strokeWidth={i===0?2.5:1.5}
                    strokeDasharray={i===0?undefined:"4 3"} dot={i===0} name={hc.label}/>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Spread history */}
      <Card>
        <Label>Spread History — 90 Days (bps)</Label>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={d.spread_history} margin={{top:4,right:8,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
            <XAxis dataKey="date" tick={{fill:MU,fontSize:10}} tickLine={false} interval={14}/>
            <YAxis tick={{fill:MU,fontSize:10}} tickLine={false} width={36}/>
            <ReferenceLine y={0} stroke={R} strokeDasharray="4 2" strokeWidth={1}/>
            <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}}
                     formatter={(v:number)=>[`${v?.toFixed(1)}bp`]}/>
            <Legend wrapperStyle={{fontSize:11,color:MU}}/>
            <Line type="monotone" dataKey="2s10s" stroke={B} strokeWidth={2} dot={false} name="2s10s"/>
            <Line type="monotone" dataKey="5s30s" stroke={G} strokeWidth={1.5} dot={false} name="5s30s"/>
            <Line type="monotone" dataKey="10s30s" stroke={A} strokeWidth={1.5} dot={false} name="10s30s"/>
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Performance
// ══════════════════════════════════════════════════════════════════════════════
function PerformanceTab({ d }: { d: Performance }) {
  const perf = d.performance;
  const periods: (keyof typeof perf[string])[] = ["chg_1d","chg_1w","chg_1m","chg_3m","chg_6m","chg_ytd"];
  const pLabels = ["1D","1W","1M","3M","6M","YTD"];

  const barData = MATURITIES.filter(m=>perf[m]).map(m=>({
    mat: m,
    "1D": perf[m].chg_1d, "1W": perf[m].chg_1w, "1M": perf[m].chg_1m,
    "3M": perf[m].chg_3m, "6M": perf[m].chg_6m, "YTD": perf[m].chg_ytd,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
        <Card>
          <Label>Best Performing Maturity (1M)</Label>
          <div className="text-3xl font-bold mt-1" style={{color:R}}>{d.best_1m}</div>
          <div className="text-xs text-text-muted mt-1">Largest yield rise (bearish bonds)</div>
          <div className="text-lg font-mono mt-1" style={{color:R}}>
            {d.best_1m && perf[d.best_1m] ? fmtBps(perf[d.best_1m].chg_1m) : "—"}
          </div>
        </Card>
        <Card>
          <Label>Best Bond Performer (1M)</Label>
          <div className="text-3xl font-bold mt-1" style={{color:G}}>{d.worst_1m}</div>
          <div className="text-xs text-text-muted mt-1">Largest yield decline (bullish bonds)</div>
          <div className="text-lg font-mono mt-1" style={{color:G}}>
            {d.worst_1m && perf[d.worst_1m] ? fmtBps(perf[d.worst_1m].chg_1m) : "—"}
          </div>
        </Card>
      </div>

      <Card>
        <Label>Yield Changes by Period (bps)</Label>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="text-left py-2 pr-4">Maturity</th>
                {pLabels.map(p=><th key={p} className="text-right py-2 pr-4">{p}</th>)}
                <th className="text-right py-2">Vol 30D</th>
              </tr>
            </thead>
            <tbody>
              {MATURITIES.filter(m=>perf[m]).map(mat=>(
                <tr key={mat} className="border-b border-border/30">
                  <td className="py-2 pr-4 font-bold" style={{color:MAT_COLORS[mat]}}>{mat}</td>
                  {periods.map((p,i)=>(
                    <td key={i} className="text-right py-2 pr-4" style={{color:bpsColor(perf[mat][p] as number)}}>
                      {fmtBps(perf[mat][p] as number)}
                    </td>
                  ))}
                  <td className="text-right py-2 text-text-muted">{fmt(perf[mat].vol_30d,1)}bp</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <Label>1M Performance Heatmap (bps)</Label>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={barData} margin={{top:4,right:8,left:0,bottom:0}}>
            <XAxis dataKey="mat" tick={{fill:MU,fontSize:11}} tickLine={false}/>
            <YAxis tick={{fill:MU,fontSize:10}} tickLine={false} width={36}/>
            <ReferenceLine y={0} stroke="#374151"/>
            <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}}
                     formatter={(v:number)=>[`${v?.toFixed(1)}bp`]}/>
            <Bar dataKey="1M" radius={[3,3,0,0]}>
              {barData.map((e,i)=><Cell key={i} fill={(e["1M"] as number)>0?R:G}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <Label>Relative Value (1Y Z-Score)</Label>
        <div className="grid grid-cols-5 gap-3">
          {MATURITIES.map(mat=>{
            const rv = d.relative_value?.[mat];
            return (
              <div key={mat} className="text-center p-3 bg-surface-2 rounded-lg">
                <div className="text-xs text-text-muted mb-1">{mat}</div>
                <div className="text-xl font-bold font-mono" style={{color:MAT_COLORS[mat]}}>
                  {rv?.z_score?.toFixed(2) ?? "—"}σ
                </div>
                <Chip label={rv?.signal ?? "Fair"} color={rv?.signal==="Cheap"?R:rv?.signal==="Rich"?G:MU}/>
              </div>
            );
          })}
        </div>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Inflation
// ══════════════════════════════════════════════════════════════════════════════
function InflationTab({ d }: { d: Inflation }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label:"CPI YoY",val:d.cpi,target:2.0},
          {label:"Core CPI",val:d.core_cpi,target:2.0},
          {label:"PCE YoY",val:d.pce,target:2.0},
          {label:"Core PCE",val:d.core_pce,target:2.0},
        ].map(item=>(
          <Card key={item.label} className="text-center">
            <Label>{item.label}</Label>
            <div className="text-2xl font-bold font-mono" style={{color:item.val>3?R:item.val>2.5?A:G}}>{fmt(item.val,1)}%</div>
            <div className="text-xs text-text-muted mt-1">Target: {item.target}%</div>
            <div className="mt-2 h-1 bg-surface-2 rounded-full">
              <div className="h-1 rounded-full" style={{width:`${Math.min(100,item.val/5*100)}%`,backgroundColor:item.val>3?R:item.val>2?A:G}}/>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="flex flex-col items-center">
          <Label>Inflation Pressure Score</Label>
          <ScoreGauge score={d.inflation_pressure_score} label={d.bond_signal} size={160}/>
          <div className="text-xs text-text-muted mt-1 text-center">Higher = more inflation pressure = bearish bonds</div>
        </Card>
        <Card>
          <Label>TIPS Breakeven Inflation</Label>
          <div className="space-y-4 mt-2">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-text-muted">5Y Breakeven</span>
                <span className="font-mono font-bold" style={{color:A}}>{fmt(d.breakeven_5y,2)}%</span>
              </div>
              <div className="h-1.5 bg-surface-2 rounded-full">
                <div className="h-1.5 rounded-full" style={{width:`${d.breakeven_5y/4*100}%`,backgroundColor:A}}/>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-text-muted">10Y Breakeven</span>
                <span className="font-mono font-bold" style={{color:B}}>{fmt(d.breakeven_10y,2)}%</span>
              </div>
              <div className="h-1.5 bg-surface-2 rounded-full">
                <div className="h-1.5 rounded-full" style={{width:`${d.breakeven_10y/4*100}%`,backgroundColor:B}}/>
              </div>
            </div>
            <div className="text-xs text-text-muted">Fed target: {d.fed_target}%</div>
          </div>
        </Card>
        <Card>
          <Label>Bond Signal</Label>
          <div className="text-xl font-bold mt-2" style={{color:
            d.bond_signal?.includes("Bullish")?G:d.bond_signal?.includes("Bearish")?R:MU}}>
            {d.bond_signal}
          </div>
          <div className="text-xs text-text-muted mt-2">Based on Core PCE vs 2% target</div>
          <div className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-text-muted">Core PCE</span><span className="font-mono">{fmt(d.core_pce,1)}%</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Above Target</span><span className="font-mono" style={{color:R}}>{fmt(d.core_pce-d.fed_target,2)}%</span></div>
          </div>
        </Card>
      </div>

      <Card>
        <Label>Inflation Trend — 12 Months</Label>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={d.history} margin={{top:4,right:8,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
            <XAxis dataKey="month" tick={{fill:MU,fontSize:10}} tickLine={false}/>
            <YAxis domain={[1.5,4.5]} tick={{fill:MU,fontSize:10}} tickLine={false} width={36} tickFormatter={v=>`${v}%`}/>
            <ReferenceLine y={2.0} stroke={G} strokeDasharray="4 2" label={{value:"2% Target",fill:G,fontSize:10}}/>
            <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}}
                     formatter={(v:number)=>[`${v?.toFixed(2)}%`]}/>
            <Legend wrapperStyle={{fontSize:11,color:MU}}/>
            <Line type="monotone" dataKey="cpi" stroke={R} strokeWidth={2} dot={false} name="CPI"/>
            <Line type="monotone" dataKey="core_pce" stroke={B} strokeWidth={2} dot={false} name="Core PCE"/>
            <Line type="monotone" dataKey="be10" stroke={A} strokeWidth={1.5} dot={false} strokeDasharray="4 3" name="10Y Breakeven"/>
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Fed Policy
// ══════════════════════════════════════════════════════════════════════════════
function FedTab({ d }: { d: Fed }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label:"Fed Funds Rate",val:`${d.target_range}%`,sub:"Current target range",color:B},
          {label:"Next Meeting",val:d.next_meeting,sub:"FOMC meeting date",color:MU},
          {label:"Hold Prob",val:`${d.hold_prob}%`,sub:"No change probability",color:G},
          {label:"Real Fed Funds",val:`${d.real_fed_funds?.toFixed(2)}%`,sub:"Nominal minus Core PCE",color:d.real_fed_funds>0?R:G},
        ].map(c=>(
          <Card key={c.label}>
            <Label>{c.label}</Label>
            <div className="text-xl font-bold font-mono mt-1" style={{color:c.color}}>{c.val}</div>
            <div className="text-xs text-text-muted mt-1">{c.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="flex flex-col items-center">
          <Label>Monetary Policy Score</Label>
          <ScoreGauge score={d.monetary_policy_score} label={d.policy_stance} size={170}/>
          <div className="text-xs text-text-muted text-center mt-1">0=Accommodative · 100=Restrictive</div>
        </Card>
        <Card>
          <Label>Rate Probabilities</Label>
          <div className="space-y-3 mt-2">
            {[
              {label:"Hold",val:d.hold_prob,color:G},
              {label:"Cut",val:d.cut_prob,color:B},
              {label:"Hike",val:d.hike_prob,color:R},
            ].map(p=>(
              <div key={p.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-text-muted">{p.label}</span>
                  <span className="font-mono font-bold" style={{color:p.color}}>{p.val}%</span>
                </div>
                <div className="h-2 bg-surface-2 rounded-full">
                  <div className="h-2 rounded-full" style={{width:`${p.val}%`,backgroundColor:p.color}}/>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <Label>Market-Implied Rate Path (Fed Funds Futures)</Label>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={d.rate_path} margin={{top:4,right:8,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
            <XAxis dataKey="meeting" tick={{fill:MU,fontSize:10}} tickLine={false}/>
            <YAxis domain={[2.5,4.5]} tick={{fill:MU,fontSize:10}} tickLine={false} width={40} tickFormatter={v=>`${v}%`}/>
            <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}}
                     formatter={(v:number)=>[`${v?.toFixed(3)}%`]}/>
            <Bar dataKey="rate" fill={B} radius={[3,3,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <Label>FOMC Dot Plot</Label>
        <div className="text-xs text-text-muted mb-2">Each dot = one FOMC member's projection for end-of-year rate</div>
        <div className="grid grid-cols-3 gap-4">
          {["2026","2027","Longer Run"].map(yr => {
            const dots = d.dot_plot_chart?.filter(x=>x.year===yr) || [];
            const vals = dots.map(d=>d.rate);
            const median = vals.length ? [...vals].sort((a,b)=>a-b)[Math.floor(vals.length/2)] : null;
            return (
              <div key={yr}>
                <div className="text-xs font-semibold text-text-muted mb-2">{yr}</div>
                <div className="flex flex-wrap gap-1">
                  {vals.map((v,i)=>(
                    <div key={i} className="w-2 h-2 rounded-full" style={{backgroundColor: v===median?A:B}}/>
                  ))}
                </div>
                {median && <div className="text-sm font-bold font-mono mt-1" style={{color:A}}>Median: {median.toFixed(3)}%</div>}
              </div>
            );
          })}
        </div>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Growth / Economic
// ══════════════════════════════════════════════════════════════════════════════
function GrowthTab({ d }: { d: Economic }) {
  const indicators = [
    {label:"GDP (QoQ SAAR)",val:`${d.gdp_qoq}%`,icon:"📈",positive:d.gdp_qoq>2},
    {label:"GDP (YoY)",val:`${d.gdp_yoy}%`,icon:"📊",positive:d.gdp_yoy>2},
    {label:"ISM Manufacturing",val:fmt(d.ism_mfg,1),icon:"🏭",positive:d.ism_mfg>50},
    {label:"ISM Services",val:fmt(d.ism_services,1),icon:"🏢",positive:d.ism_services>50},
    {label:"Non-Farm Payrolls",val:`${d.nfp_k}k`,icon:"💼",positive:d.nfp_k>150},
    {label:"Unemployment",val:`${d.unemployment}%`,icon:"👷",positive:d.unemployment<4.5},
    {label:"Wage Growth YoY",val:`${d.wage_growth_yoy}%`,icon:"💰",positive:d.wage_growth_yoy>3},
    {label:"JOLTS Openings",val:`${d.jolts_openings_m}M`,icon:"📋",positive:d.jolts_openings_m>7},
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="flex flex-col items-center">
          <Label>Growth Strength Score</Label>
          <ScoreGauge score={d.growth_score} label={d.growth_signal} size={160}/>
          <div className="mt-2 text-center">
            <Chip label={d.bond_signal} color={d.bond_signal.includes("Bullish")?G:d.bond_signal.includes("Bearish")?R:MU}/>
            <div className="text-xs text-text-muted mt-1">Recession probability: {fmt(d.recession_prob,1)}%</div>
          </div>
        </Card>
        <Card className="md:col-span-2">
          <Label>Economic Indicators</Label>
          <div className="grid grid-cols-2 gap-2">
            {indicators.map(item=>(
              <div key={item.label} className="flex items-center justify-between p-2 bg-surface-2 rounded-lg">
                <div>
                  <div className="text-xs text-text-muted">{item.label}</div>
                  <div className="text-sm font-bold font-mono" style={{color:item.positive?G:R}}>{item.val}</div>
                </div>
                <div className="text-xl">{item.icon}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <Label>PMI Gauge — ISM 50 = Expansion/Contraction</Label>
        <div className="grid grid-cols-2 gap-6 mt-2">
          {[{label:"ISM Manufacturing",val:d.ism_mfg},{label:"ISM Services",val:d.ism_services}].map(item=>(
            <div key={item.label}>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-text-muted">{item.label}</span>
                <span className="font-mono font-bold" style={{color:item.val>50?G:R}}>{fmt(item.val,1)}</span>
              </div>
              <div className="relative h-3 bg-surface-2 rounded-full">
                <div className="absolute top-0 left-1/2 h-3 w-0.5 bg-border"/>
                <div className="h-3 rounded-full" style={{
                  width:`${Math.min(100,item.val/65*100)}%`,
                  backgroundColor:item.val>50?G:R,opacity:0.8
                }}/>
              </div>
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>Contraction</span><span className="text-center">50</span><span>Expansion</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Positioning
// ══════════════════════════════════════════════════════════════════════════════
function PositioningTab({ d }: { d: Positioning }) {
  const fmtK = (v:number) => v >= 0 ? `+${(v/1000).toFixed(1)}K` : `${(v/1000).toFixed(1)}K`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <Label>Asset Managers</Label>
          <div className="text-2xl font-bold font-mono mt-1" style={{color:d.asset_managers_net>0?G:R}}>
            {fmtK(d.asset_managers_net)}
          </div>
          <div className="text-xs text-text-muted mt-1">Net long contracts</div>
          <div className="mt-2">
            <div className="text-xs text-text-muted mb-1">Percentile vs 5Y: {d.am_percentile}%</div>
            <div className="h-1.5 bg-surface-2 rounded-full">
              <div className="h-1.5 rounded-full bg-blue-500" style={{width:`${d.am_percentile}%`}}/>
            </div>
          </div>
        </Card>
        <Card>
          <Label>Leveraged Funds</Label>
          <div className="text-2xl font-bold font-mono mt-1" style={{color:d.leveraged_funds_net>0?G:R}}>
            {fmtK(d.leveraged_funds_net)}
          </div>
          <div className="text-xs text-text-muted mt-1">Net short (hedge funds)</div>
          <div className="mt-2">
            <div className="text-xs text-text-muted mb-1">Percentile vs 5Y: {d.lf_percentile}%</div>
            <div className="h-1.5 bg-surface-2 rounded-full">
              <div className="h-1.5 rounded-full bg-amber-500" style={{width:`${d.lf_percentile}%`}}/>
            </div>
          </div>
        </Card>
        <Card className="flex flex-col items-center">
          <Label>Crowding Indicator</Label>
          <ScoreGauge score={d.crowding_score} label={d.crowding_indicator?.split("—")[0]?.trim()} size={150}/>
          <div className="text-xs text-text-muted text-center mt-1">0=Short Extreme · 100=Long Extreme</div>
        </Card>
      </div>

      <Card>
        <Label>COT Positioning History — 26 Weeks</Label>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={d.history} margin={{top:4,right:8,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
            <XAxis dataKey="date" tick={{fill:MU,fontSize:9}} tickLine={false} interval={5}/>
            <YAxis tick={{fill:MU,fontSize:10}} tickLine={false} width={46} tickFormatter={v=>`${(v/1000).toFixed(0)}K`}/>
            <ReferenceLine y={0} stroke="#374151"/>
            <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}}
                     formatter={(v:number)=>[`${(v/1000).toFixed(1)}K`]}/>
            <Legend wrapperStyle={{fontSize:11,color:MU}}/>
            <Bar dataKey="asset_managers" fill={B} opacity={0.7} name="Asset Managers"/>
            <Bar dataKey="leveraged_funds" fill={R} opacity={0.7} name="Leveraged Funds"/>
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Risk Sentiment
// ══════════════════════════════════════════════════════════════════════════════
function RiskTab({ d }: { d: RiskSentiment }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label:"VIX Index",val:fmt(d.vix,2),sub:`1M: ${d.vix_1m_change>=0?"+":""}${d.vix_1m_change?.toFixed(2)}`,color:d.vix>25?R:d.vix>15?A:G},
          {label:"MOVE Index",val:fmt(d.move_index,1),sub:"Bond vol (ICE BofA)",color:d.move_index>100?R:d.move_index>80?A:G},
          {label:"HY Spread",val:`${d.hy_spread_bps}bp`,sub:"High yield credit spread",color:d.hy_spread_bps>400?R:d.hy_spread_bps>300?A:G},
          {label:"IG Spread",val:`${d.ig_spread_bps}bp`,sub:"Invest. grade spread",color:d.ig_spread_bps>120?R:d.ig_spread_bps>90?A:G},
        ].map(c=>(
          <Card key={c.label} className="text-center">
            <Label>{c.label}</Label>
            <div className="text-2xl font-bold font-mono mt-1" style={{color:c.color}}>{c.val}</div>
            <div className="text-xs text-text-muted mt-1">{c.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="flex flex-col items-center">
          <Label>Risk-On / Risk-Off Score</Label>
          <ScoreGauge score={d.risk_score} label={d.risk_regime} size={160}/>
          <div className="text-xs text-text-muted text-center mt-1">0=Extreme Risk-Off · 100=Extreme Risk-On</div>
        </Card>
        <Card>
          <Label>Flight-to-Safety Indicator</Label>
          <div className="mt-2">
            <div className="flex items-center gap-3 mb-3">
              <div className="text-3xl font-bold font-mono" style={{color:d.flight_to_safety_active?G:MU}}>
                {fmt(d.flight_to_safety_score,1)}
              </div>
              <Chip label={d.flight_to_safety_active?"ACTIVE":"INACTIVE"} color={d.flight_to_safety_active?G:MU}/>
            </div>
            <div className="h-3 bg-surface-2 rounded-full">
              <div className="h-3 rounded-full" style={{width:`${d.flight_to_safety_score}%`,backgroundColor:d.flight_to_safety_active?G:B}}/>
            </div>
            <div className="text-xs text-text-muted mt-2">High VIX + falling yields = flight to safety</div>
          </div>
        </Card>
      </div>

      <Card>
        <Label>VIX History — 60 Days</Label>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={d.vix_history} margin={{top:4,right:8,left:0,bottom:0}}>
            <defs>
              <linearGradient id="vixGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={R} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={R} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
            <XAxis dataKey="date" tick={{fill:MU,fontSize:10}} tickLine={false} interval={9}/>
            <YAxis domain={["auto","auto"]} tick={{fill:MU,fontSize:10}} tickLine={false} width={32}/>
            <ReferenceLine y={20} stroke={A} strokeDasharray="4 2"/>
            <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}}
                     formatter={(v:number)=>[v?.toFixed(2),"VIX"]}/>
            <Area type="monotone" dataKey="vix" stroke={R} fill="url(#vixGrad)" strokeWidth={2} dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Technicals
// ══════════════════════════════════════════════════════════════════════════════
function TechnicalsTab({ d }: { d: Technicals }) {
  const [sel, setSel] = useState<string>("10Y");
  const t = d.technicals?.[sel];
  if (!t) return <Spinner/>;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {MATURITIES.map(m=>(
          <button key={m} onClick={()=>setSel(m)}
            className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              sel===m?"bg-blue-600 text-white":"bg-surface-2 text-text-muted hover:text-text-primary")}>
            {m}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="text-center">
          <Label>Technical Score</Label>
          <div className="text-3xl font-bold font-mono mt-1" style={{color:scoreColor(t.technical_score)}}>{t.technical_score}</div>
          <Chip label={t.technical_score>=60?"Bullish Bonds":t.technical_score<=40?"Bearish Bonds":"Neutral"}
                color={t.technical_score>=60?G:t.technical_score<=40?R:MU}/>
        </Card>
        <Card>
          <Label>RSI (14)</Label>
          <div className="text-2xl font-bold font-mono mt-1" style={{color:t.rsi>70?R:t.rsi<30?G:MU}}>{fmt(t.rsi,1)}</div>
          <Chip label={t.rsi_signal} color={t.rsi_signal==="Oversold"?G:t.rsi_signal==="Overbought"?R:MU}/>
        </Card>
        <Card>
          <Label>ADX / Trend</Label>
          <div className="text-2xl font-bold font-mono mt-1" style={{color:t.adx>30?B:MU}}>{fmt(t.adx,1)}</div>
          <div className="text-xs text-text-muted mt-1">{t.trend_strength}</div>
          <div className="text-xs mt-1">DI+ {fmt(t.di_plus,1)} / DI− {fmt(t.di_minus,1)}</div>
        </Card>
        <Card>
          <Label>ATR (bps)</Label>
          <div className="text-2xl font-bold font-mono mt-1" style={{color:A}}>{fmt(t.atr_bps,1)}</div>
          <div className="text-xs text-text-muted mt-1">Daily avg range</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <Label>Moving Averages</Label>
          <div className="space-y-2 text-sm">
            {[{label:"EMA 20",val:t.ema20},{label:"EMA 50",val:t.ema50},
              {label:"EMA 100",val:t.ema100},{label:"EMA 200",val:t.ema200}].map(ma=>(
              <div key={ma.label} className="flex justify-between items-center">
                <span className="text-text-muted">{ma.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{ma.val ? fmt(ma.val,4)+"%" : "N/A"}</span>
                  {ma.val && <Chip label={t.current < ma.val ? "Below" : "Above"}
                    color={t.current < ma.val ? G : R}/>}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <Label>Bollinger Bands & MACD</Label>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-text-muted">BB Upper</span><span className="font-mono">{fmt(t.bb_upper,4)}%</span></div>
            <div className="flex justify-between"><span className="text-text-muted">BB Mid (20 SMA)</span><span className="font-mono">{fmt(t.bb_mid,4)}%</span></div>
            <div className="flex justify-between"><span className="text-text-muted">BB Lower</span><span className="font-mono">{fmt(t.bb_lower,4)}%</span></div>
            <div className="flex justify-between"><span className="text-text-muted">BB %B</span>
              <span className="font-mono" style={{color:t.bb_pct>80?R:t.bb_pct<20?G:MU}}>{fmt(t.bb_pct,1)}%</span></div>
            <div className="border-t border-border/30 pt-2"/>
            <div className="flex justify-between"><span className="text-text-muted">MACD</span>
              <span className="font-mono" style={{color:t.macd_bullish?R:G}}>{fmt(t.macd,5)}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Signal</span><span className="font-mono">{fmt(t.macd_signal,5)}</span></div>
          </div>
        </Card>
      </div>

      <Card>
        <Label>Support & Resistance</Label>
        <div className="flex items-center gap-8 mt-2">
          <div><div className="text-xs text-text-muted">Support (63D Low)</div>
            <div className="text-xl font-bold font-mono" style={{color:G}}>{fmt(t.support,4)}%</div></div>
          <div className="flex-1 relative h-3 bg-surface-2 rounded-full">
            {t.support && t.resistance && (
              <div className="absolute h-3 rounded-full bg-blue-500/40"
                style={{left:`${((t.current-t.support)/(t.resistance-t.support)*100)}%`,width:"2px",backgroundColor:B}}/>
            )}
          </div>
          <div className="text-right"><div className="text-xs text-text-muted">Resistance (63D High)</div>
            <div className="text-xl font-bold font-mono" style={{color:R}}>{fmt(t.resistance,4)}%</div></div>
        </div>
        <div className="text-center text-xs text-text-muted mt-1">Current: {fmt(t.current,4)}%</div>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Quant Models
// ══════════════════════════════════════════════════════════════════════════════
function QuantTab({ fv, fc }: { fv: FairValue; fc: Forecasts }) {
  const [selMat, setSelMat] = useState("10Y");
  return (
    <div className="space-y-4">
      {/* Fair Value */}
      <Card>
        <Label>Yield Fair Value Model — Taylor Rule Decomposition</Label>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="text-left py-2 pr-4">Maturity</th>
                <th className="text-right py-2 pr-4">Current</th>
                <th className="text-right py-2 pr-4">Fair Value</th>
                <th className="text-right py-2 pr-4">Deviation (bps)</th>
                <th className="text-right py-2">Signal</th>
              </tr>
            </thead>
            <tbody>
              {MATURITIES.map(mat => {
                const fvd = fv.fair_values?.[mat]; if (!fvd) return null;
                return (
                  <tr key={mat} className="border-b border-border/30">
                    <td className="py-2 pr-4 font-bold" style={{color:MAT_COLORS[mat]}}>{mat}</td>
                    <td className="text-right py-2 pr-4">{fmt(fvd.current,4)}%</td>
                    <td className="text-right py-2 pr-4" style={{color:A}}>{fmt(fvd.fair_value,4)}%</td>
                    <td className="text-right py-2 pr-4" style={{color:bpsColor(fvd.deviation_bps)}}>
                      {fmtBps(fvd.deviation_bps)}
                    </td>
                    <td className="text-right py-2">
                      <Chip label={fvd.signal}
                        color={fvd.signal==="Cheap"?R:fvd.signal==="Expensive"?G:MU}/>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {fv.inputs && (
          <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-text-muted">
            <span>Fed Funds: <strong className="text-text-primary">{fv.inputs.fed_funds}%</strong></span>
            <span>Core PCE: <strong className="text-text-primary">{fv.inputs.core_pce}%</strong></span>
            <span>GDP: <strong className="text-text-primary">{fv.inputs.gdp_yoy}%</strong></span>
            <span>BE 10Y: <strong className="text-text-primary">{fv.inputs.be_10y}%</strong></span>
          </div>
        )}
      </Card>

      {/* Forecasts */}
      <div className="flex gap-2 flex-wrap">
        {MATURITIES.map(m=>(
          <button key={m} onClick={()=>setSelMat(m)}
            className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              selMat===m?"bg-blue-600 text-white":"bg-surface-2 text-text-muted hover:text-text-primary")}>
            {m}
          </button>
        ))}
      </div>

      {fc.forecasts?.[selMat] && (
        <div className="space-y-3">
          <Card>
            <Label>ARIMA Yield Forecasts — {selMat} Treasury</Label>
            <div className="grid grid-cols-4 gap-3">
              {["1W","1M","3M","6M"].map(h => {
                const f = fc.forecasts[selMat][h]; if (!f) return null;
                return (
                  <div key={h} className="text-center p-3 bg-surface-2 rounded-lg">
                    <div className="text-xs text-text-muted mb-1">{h} Forecast</div>
                    <div className="text-xl font-bold font-mono" style={{color:MAT_COLORS[selMat]}}>{fmt(f.yield,3)}%</div>
                    <div className="text-xs mt-1" style={{color:bpsColor(f.change_bps)}}>{fmtBps(f.change_bps)}</div>
                    <Chip label={f.direction} color={f.direction==="Rising"?R:G}/>
                    <div className="text-xs text-text-muted mt-1">[{fmt(f.lower_95,3)}, {fmt(f.upper_95,3)}]</div>
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-text-muted mt-2">Model: {fc.model} | 95% confidence intervals shown</div>
          </Card>
        </div>
      )}
      <div className="text-xs text-text-muted">As of {fc.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Correlations
// ══════════════════════════════════════════════════════════════════════════════
function CorrelationsTab({ d }: { d: Correlations }) {
  const assets = Object.keys(d.corr_30d || {});
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[{label:"30-Day Rolling Correlation",data:d.corr_30d},{label:"90-Day Rolling Correlation",data:d.corr_90d}].map(panel=>(
          <Card key={panel.label}>
            <Label>{panel.label} — 10Y Yield vs Asset Returns</Label>
            <div className="space-y-2 mt-2">
              {assets.map(asset => {
                const v = panel.data?.[asset];
                if (v === undefined) return null;
                const bar = Math.abs(v) * 100;
                return (
                  <div key={asset} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-text-muted shrink-0">{asset}</div>
                    <div className="flex-1 relative h-4 bg-surface-2 rounded-sm">
                      {v >= 0 ? (
                        <div className="absolute left-1/2 h-4 rounded-r-sm" style={{width:`${bar/2}%`,backgroundColor:corrColor(v)}}/>
                      ) : (
                        <div className="absolute h-4 rounded-l-sm" style={{right:"50%",width:`${bar/2}%`,backgroundColor:corrColor(v)}}/>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-px h-full bg-border/50"/>
                      </div>
                    </div>
                    <div className="w-12 text-right text-xs font-mono" style={{color:corrColor(v)}}>{v?.toFixed(2)}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <div className="text-xs text-text-muted space-y-1">
          <div>Positive correlation: when 10Y yield rises, asset tends to rise (risk-on scenario)</div>
          <div>Negative correlation: when 10Y yield rises, asset tends to fall (flight to safety unwind)</div>
          <div className="font-semibold mt-2 text-text-primary">Interpretation: Gold/TLT negative = normal (safe haven when yields fall). S&P/Nasdaq positive = risk-on yields rising together.</div>
        </div>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Composite Score
// ══════════════════════════════════════════════════════════════════════════════
function CompositeTab({ d }: { d: Composite }) {
  const bands = [
    {lo:0,hi:20,label:"Strongly Bearish",color:R},
    {lo:20,hi:40,label:"Bearish",color:"#f97316"},
    {lo:40,hi:60,label:"Neutral",color:MU},
    {lo:60,hi:80,label:"Bullish",color:G},
    {lo:80,hi:100,label:"Extremely Bullish",color:"#34d399"},
  ];
  const activeColor = bands.find(b=>d.composite_score>=b.lo && d.composite_score<=b.hi)?.color || MU;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="flex flex-col items-center md:col-span-1">
          <Label>Treasury Bullishness Score</Label>
          <ScoreGauge score={d.composite_score} label={d.label} size={190}/>
          <div className="grid grid-cols-5 gap-1 w-full mt-3">
            {bands.map(b=>(
              <div key={b.label} className="text-center p-1 rounded text-xs"
                style={{background:b.color+"22",color:b.color,fontWeight:d.composite_score>=b.lo&&d.composite_score<b.hi?700:400}}>
                {b.lo}–{b.hi}
              </div>
            ))}
          </div>
        </Card>
        <Card className="md:col-span-2">
          <Label>Component Scores</Label>
          <div className="space-y-3 mt-2">
            {Object.entries(d.components || {}).map(([k,v])=>(
              <CompBar key={k} label={k} value={v} weight={d.weights?.[k] || 0}/>
            ))}
          </div>
        </Card>
      </div>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Signals
// ══════════════════════════════════════════════════════════════════════════════
function SignalsTab({ d }: { d: Signals }) {
  const dirColor = (dir:string) => dir==="BUY"?G:dir==="SELL"?R:MU;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Card className="flex-none">
          <div className="text-xs text-text-muted mb-1">Composite Score</div>
          <div className="text-2xl font-bold font-mono" style={{color:scoreColor(d.composite_score)}}>{d.composite_score}</div>
        </Card>
        <Card className="flex-none">
          <div className="text-xs text-text-muted mb-1">Curve Regime</div>
          <div className="text-lg font-bold">{d.regime}</div>
        </Card>
      </div>
      {d.signals?.map((sig,i)=>(
        <Card key={i} className={cn(sig.direction==="BUY"?"border-emerald-500/30":sig.direction==="SELL"?"border-red-500/30":"")}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-lg font-bold">{sig.type}</span>
                <Chip label={sig.direction} color={dirColor(sig.direction)}/>
                <span className="text-sm text-text-muted">{sig.instrument}</span>
              </div>
              <div className="text-xs text-text-muted">{sig.rationale}</div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <div className="text-sm text-text-muted">Confidence</div>
              <div className="text-2xl font-bold font-mono" style={{color:scoreColor(sig.confidence)}}>{sig.confidence}</div>
            </div>
          </div>
          {sig.entry !== null && (
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-border/30">
              <div className="text-center"><div className="text-xs text-text-muted">Entry</div>
                <div className="font-mono font-bold">{sig.entry}</div></div>
              <div className="text-center"><div className="text-xs text-text-muted">Stop Loss</div>
                <div className="font-mono font-bold" style={{color:R}}>{sig.stop}</div></div>
              <div className="text-center"><div className="text-xs text-text-muted">Target</div>
                <div className="font-mono font-bold" style={{color:G}}>{sig.target}</div></div>
              <div className="text-center"><div className="text-xs text-text-muted">R/R</div>
                <div className="font-mono font-bold" style={{color:B}}>{sig.rr}</div></div>
            </div>
          )}
        </Card>
      ))}
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Scenarios
// ══════════════════════════════════════════════════════════════════════════════
function ScenariosTab({ d }: { d: Scenarios }) {
  const [sel, setSel] = useState(0);
  const sc = d.scenarios?.[sel];
  const probColor = (p:number) => p>=30?R:p>=15?A:G;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {d.scenarios?.map((s,i)=>(
          <button key={i} onClick={()=>setSel(i)}
            className={cn("text-left p-3 rounded-xl border transition-all",
              sel===i?"border-blue-500/50 bg-blue-500/10":"border-border bg-surface hover:border-border/80")}>
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium">{s.scenario}</span>
              <span className="text-xs font-bold font-mono" style={{color:probColor(s.probability)}}>{s.probability}%</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Chip label={s.curve_impact} color={A}/>
              <span className="text-xs text-text-muted">Analog: {s.analog}</span>
            </div>
          </button>
        ))}
      </div>
      {sc && (
        <Card>
          <Label>{sc.scenario} — Yield Impact</Label>
          <div className="grid grid-cols-5 gap-3 mt-2">
            {MATURITIES.map(mat=>{
              const base = sc.base_yields?.[mat] || 4.0;
              const proj = sc.projected_yields?.[mat] || base;
              const mv = sc.moves?.[mat] || 0;
              return (
                <div key={mat} className="text-center p-3 bg-surface-2 rounded-lg">
                  <div className="text-xs text-text-muted mb-1">{mat}</div>
                  <div className="text-sm font-mono text-text-primary">{fmt(base,3)}%</div>
                  <div className="text-xs font-bold my-1" style={{color:bpsColor(mv)}}>{fmtBps(mv)}</div>
                  <div className="text-base font-bold font-mono" style={{color:MAT_COLORS[mat]}}>{fmt(proj,3)}%</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Auctions
// ══════════════════════════════════════════════════════════════════════════════
function AuctionsTab({ d }: { d: Auctions }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="flex flex-col items-center">
          <Label>Auction Strength Score</Label>
          <ScoreGauge score={d.auction_strength_score} label={d.strength} size={150}/>
          <div className="text-xs text-text-muted text-center mt-1">{d.description}</div>
        </Card>
        <Card className="md:col-span-2">
          <Label>Recent Auction Results</Label>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="text-left py-2 pr-3">Mat.</th>
                  <th className="text-right py-2 pr-3">Date</th>
                  <th className="text-right py-2 pr-3">Size ($B)</th>
                  <th className="text-right py-2 pr-3">Yield</th>
                  <th className="text-right py-2 pr-3">B/C</th>
                  <th className="text-right py-2 pr-3">Indirect %</th>
                  <th className="text-right py-2">Tail (bp)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(d.auctions || {}).map(([mat,a])=>(
                  <tr key={mat} className="border-b border-border/30">
                    <td className="py-2 pr-3 font-bold" style={{color:MAT_COLORS[mat]}}>{mat}</td>
                    <td className="text-right py-2 pr-3 text-text-muted">{a.date}</td>
                    <td className="text-right py-2 pr-3">{a.size_b}</td>
                    <td className="text-right py-2 pr-3">{fmt(a.yield,3)}%</td>
                    <td className="text-right py-2 pr-3" style={{color:a.bid_cover>=2.5?G:a.bid_cover>=2.0?A:R}}>{fmt(a.bid_cover,2)}</td>
                    <td className="text-right py-2 pr-3" style={{color:a.indirect_pct>=65?G:MU}}>{fmt(a.indirect_pct,1)}%</td>
                    <td className="text-right py-2" style={{color:a.tail_bps<0?G:a.tail_bps>0.5?R:A}}>{a.tail_bps > 0 ? "+" : ""}{a.tail_bps?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card>
        <div className="grid grid-cols-3 gap-4 text-xs text-text-muted">
          <div><strong className="text-text-primary">Bid-to-Cover:</strong> Higher = stronger demand. &gt;2.5 = strong, &lt;2.0 = weak.</div>
          <div><strong className="text-text-primary">Indirect Bidders:</strong> Proxy for foreign central bank demand. &gt;65% = strong foreign interest.</div>
          <div><strong className="text-text-primary">Tail (bp):</strong> Stops through (negative) = strong demand. Positive tail = dealers absorbed supply.</div>
        </div>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
const TABS = [
  "Overview","Curve","Performance","Inflation","Fed Policy","Growth",
  "Positioning","Risk","Technicals","Quant Models","Correlations",
  "Signals","Scenarios","Auctions"
] as const;
type Tab = typeof TABS[number];

export default function TreasuryPage() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const [overview,     setOverview]     = useState<Overview|null>(null);
  const [curve,        setCurve]        = useState<Curve|null>(null);
  const [performance,  setPerformance]  = useState<Performance|null>(null);
  const [inflation,    setInflation]    = useState<Inflation|null>(null);
  const [fed,          setFed]          = useState<Fed|null>(null);
  const [economic,     setEconomic]     = useState<Economic|null>(null);
  const [positioning,  setPositioning]  = useState<Positioning|null>(null);
  const [risk,         setRisk]         = useState<RiskSentiment|null>(null);
  const [correlations, setCorrelations] = useState<Correlations|null>(null);
  const [fairValue,    setFairValue]    = useState<FairValue|null>(null);
  const [forecasts,    setForecasts]    = useState<Forecasts|null>(null);
  const [composite,    setComposite]    = useState<Composite|null>(null);
  const [signals,      setSignals]      = useState<Signals|null>(null);
  const [scenarios,    setScenarios]    = useState<Scenarios|null>(null);
  const [technicals,   setTechnicals]   = useState<Technicals|null>(null);
  const [auctions,     setAuctions]     = useState<Auctions|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, cv, pf, inf, fd, eco, pos, rsk, corr, fv, fc, comp, sig, sc, tech, auc] = await Promise.all([
        api<Overview>("/overview"),
        api<Curve>("/curve"),
        api<Performance>("/performance"),
        api<Inflation>("/inflation"),
        api<Fed>("/fed"),
        api<Economic>("/economic"),
        api<Positioning>("/positioning"),
        api<RiskSentiment>("/risk-sentiment"),
        api<Correlations>("/correlations"),
        api<FairValue>("/fair-value"),
        api<Forecasts>("/forecasts"),
        api<Composite>("/composite"),
        api<Signals>("/signals"),
        api<Scenarios>("/scenarios"),
        api<Technicals>("/technicals"),
        api<Auctions>("/auctions"),
      ]);
      setOverview(ov); setCurve(cv); setPerformance(pf); setInflation(inf);
      setFed(fd); setEconomic(eco); setPositioning(pos); setRisk(rsk);
      setCorrelations(corr); setFairValue(fv); setForecasts(fc); setComposite(comp);
      setSignals(sig); setScenarios(sc); setTechnicals(tech); setAuctions(auc);
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const currentMats = overview?.maturities;
  const composite10 = composite?.composite_score;

  const { isIndia } = useMarket();
  if (isIndia) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
      <span className="text-5xl">🇺🇸</span>
      <h2 className="text-base font-semibold text-text-primary">US Markets Only</h2>
      <p className="text-xs text-text-muted max-w-xs">This tool covers US Treasury yields and bond market data and is not available for the Indian market.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header
        className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border"
        style={{ paddingTop: `calc(env(safe-area-inset-top) + 8px)` }}
      >
        <div className="flex items-center justify-between px-4 pb-1">
          <div className="flex items-center gap-2.5">
            <Landmark size={16} className="text-blue-500 shrink-0"/>
            <div>
              <div className="text-[14px] font-bold text-text-primary leading-tight">Treasury Yields</div>
              <div className="flex items-center gap-2">
                {composite10 !== undefined && (
                  <span className="text-[11px] font-mono" style={{color:scoreColor(composite10)}}>Score: {composite10} · {composite?.label}</span>
                )}
                {curve?.inversion_alert && (
                  <span className="text-[10px] text-red-400 flex items-center gap-0.5"><AlertTriangle size={9}/> Inverted</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-surface-2 text-text-muted active:bg-border transition-colors">
            <RefreshCw size={13} className={loading?"animate-spin":""}/>
          </button>
        </div>

        {/* Quick yield strip */}
        {currentMats && (
          <div className="flex gap-2 overflow-x-auto px-4 py-1.5" style={{scrollbarWidth:"none"}}>
            {MATURITIES.map(mat => {
              const m = currentMats[mat]; if (!m) return null;
              return (
                <div key={mat} className="flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-border rounded-lg shrink-0">
                  <span className="text-[10px] text-text-muted">{mat}</span>
                  <span className="text-[12px] font-bold font-mono" style={{color:MAT_COLORS[mat]}}>{fmt(m.current,3)}%</span>
                  <span className="text-[10px] font-mono" style={{color:bpsColor(m.chg_1d)}}>{fmtBps(m.chg_1d)}</span>
                </div>
              );
            })}
            {curve && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-border rounded-lg shrink-0">
                <span className="text-[10px] text-text-muted">2s10s</span>
                <span className="text-[12px] font-bold font-mono" style={{color:curve.spreads["2s10s"]<0?R:G}}>{curve.spreads["2s10s"]?.toFixed(1)}bp</span>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 overflow-x-auto px-4 pb-0" style={{scrollbarWidth:"none"}}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-3 py-2 text-[12px] whitespace-nowrap border-b-2 transition-colors shrink-0",
                tab === t ? "border-blue-500 text-blue-400 font-semibold" : "border-transparent text-text-muted")}>
              {t}
            </button>
          ))}
      </div>

      </header>

      <PageGuide
        title="Treasury Yields — Guide"
        subtitle="US yield curve analysis, spread monitoring, and rate regime classification"
        steps={[
          { title: "Read the Yield Curve Shape", detail: "The yield curve chart plots yields at 1M, 3M, 6M, 1Y, 2Y, 5Y, 10Y, and 30Y maturities. A normal (upward sloping) curve is healthy; a flat or inverted curve (short rates above long rates) historically signals economic stress ahead." },
          { title: "Check Key Spreads", detail: "The 2Y–10Y spread is the most watched inversion indicator. When negative (inverted), it has preceded every US recession over the past 50 years. The 3M–10Y spread is another important benchmark used by the Fed." },
          { title: "Read the Rate Regime", detail: "The regime chip classifies the current environment: Rising Rates, Falling Rates, or Stable. This affects bond prices inversely (rising rates = falling bond prices) and drives equity sector rotation (value wins in rising rates, growth wins in falling rates)." },
          { title: "Monitor Real Yields", detail: "Real yields (nominal yield minus expected inflation) drive gold and growth stock valuations. Rising real yields are negative for gold and long-duration tech stocks. Falling real yields are a powerful tailwind for both." },
          { title: "Navigate the Tabs", detail: "Use the tab bar to explore: Overview (current yields & changes), Curve (shape & spreads), Inflation (CPI & TIPS data), Fed Policy (dot plot & rate path), Positioning (COT data), Risk Sentiment, Technicals, and Scenarios." },
        ]}
        howItWorks={[
          { title: "Yield Data", detail: "Treasury yields are fetched from Yahoo Finance using standard tickers: ^IRX (13-week), ^FVX (5Y), ^TNX (10Y), ^TYX (30Y). The backend interpolates the full curve across all maturities." },
          { title: "Spread Calculation", detail: "The 2Y–10Y spread = 10Y yield minus 2Y yield. Negative spread = inverted curve. This relationship has been a reliable recession leading indicator with a 6–18 month lead time historically." },
          { title: "Duration Sensitivity", detail: "Bond price sensitivity to rate changes is expressed as Modified Duration. A 10Y Treasury with ~8 years modified duration loses approximately 8% in price for every 1% rise in yields — a critical concept for fixed income risk management." },
        ]}
        tips={[
          "The 2Y–10Y curve typically un-inverts before a recession begins — watch for re-steepening as a near-term recession signal.",
          "Rising 10Y yields with a rising dollar = tightening global financial conditions. Reduce risk exposure.",
          "When the 10Y yield is at multi-year highs, long-duration Treasuries (TLT) offer attractive risk/reward as a portfolio hedge.",
        ]}
      />

      {/* Tab content */}
      <div className="p-4">
        {loading && !overview ? <Spinner/> : (
          <>
            {tab === "Overview"    && (overview    ? <OverviewTab    d={overview}/>    : <Spinner/>)}
            {tab === "Curve"       && (curve        ? <CurveTab       d={curve}/>       : <Spinner/>)}
            {tab === "Performance" && (performance  ? <PerformanceTab d={performance}/> : <Spinner/>)}
            {tab === "Inflation"   && (inflation    ? <InflationTab   d={inflation}/>   : <Spinner/>)}
            {tab === "Fed Policy"  && (fed          ? <FedTab         d={fed}/>         : <Spinner/>)}
            {tab === "Growth"      && (economic     ? <GrowthTab      d={economic}/>    : <Spinner/>)}
            {tab === "Positioning" && (positioning  ? <PositioningTab d={positioning}/> : <Spinner/>)}
            {tab === "Risk"        && (risk         ? <RiskTab        d={risk}/>        : <Spinner/>)}
            {tab === "Technicals"  && (technicals   ? <TechnicalsTab  d={technicals}/>  : <Spinner/>)}
            {tab === "Quant Models"&& (fairValue && forecasts ? <QuantTab fv={fairValue} fc={forecasts}/> : <Spinner/>)}
            {tab === "Correlations"&& (correlations ? <CorrelationsTab d={correlations}/> : <Spinner/>)}
            {tab === "Signals"     && (signals      ? <SignalsTab     d={signals}/>     : <Spinner/>)}
            {tab === "Scenarios"   && (scenarios    ? <ScenariosTab   d={scenarios}/>   : <Spinner/>)}
            {tab === "Auctions"    && (auctions     ? <AuctionsTab    d={auctions}/>    : <Spinner/>)}
          </>
        )}
      </div>
    </div>
  );
}
