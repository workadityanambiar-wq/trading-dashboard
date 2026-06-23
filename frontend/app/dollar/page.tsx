"use client";
import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle,
  CircleDollarSign, Activity, Shield, Globe, ChevronUp, ChevronDown,
  BarChart2, Target, Zap,
} from "lucide-react";
import { PageGuide } from "@/components/PageGuide";

const BLUE   = "#3b82f6";
const GREEN  = "#10b981";
const RED    = "#ef4444";
const AMBER  = "#f59e0b";
const PURPLE = "#8b5cf6";
const MUTED  = "#6b7280";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Strength { score:number; regime:string; trend_pts:number; momentum_pts:number; breadth_pts:number; breadth_pct:number; }
interface Overview {
  price:number; daily:number; weekly:number; monthly:number; ytd:number; vol30:number;
  ma20:number; ma50:number; ma200:number; above_ma20:boolean; above_ma50:boolean; above_ma200:boolean;
  rsi:number; rsi_signal:string; macd:number; macd_signal_line:number; macd_hist:number; macd_bullish:boolean;
  adx:number; adx_signal:string; di_plus:number; di_minus:number;
  bb_upper:number; bb_mid:number; bb_lower:number; bb_pct:number;
  strength:Strength; series:{date:string;price:number}[]; as_of:string;
}
interface Yields {
  us_yields:Record<string,{value:number;chg_1m:number;chg_3m:number}>;
  curve:{tenor:string;yield:number}[];
  curve_spread_2s10s:number; curve_shape:string;
  foreign:{country:string;yield_10y:number;us_10y:number;spread:number;signal:string}[];
  real_yield:number; breakeven:number; real_signal:string; as_of:string;
}
interface Fed { current_rate:number; target_range:string; next_meeting:string; cut_prob:number; hike_prob:number; hold_prob:number; cuts_priced_2026:number; dot_plot_eoy:number; market_rate_eoy:number; as_of:string; }
interface Liq { fed_balance_sheet_b:number; tga_b:number; rrp_b:number; net_liquidity_b:number; net_4w_chg_b:number; fed_bs_4w_chg_b:number; tga_4w_chg_b:number; rrp_4w_chg_b:number; liquidity_trend:string; dollar_impact:string; history:{label:string;value:number}[]; as_of:string; }
interface CurrRow { pair:string; price:number; ret_1m:number; ret_3m:number; ret_6m:number; rsi:number; usd_score_1m:number; rank:number; }
interface Currencies { pairs:CurrRow[]; as_of:string; }
interface CorrRow { name:string; asset_class:string; corr_30d:number; corr_90d:number; trend:string; signal:string; }
interface CrossAsset { correlations:CorrRow[]; as_of:string; }
interface EmRow { pair:string; price:number; ret_1m:number; vol30:number; stress:number; rank:number; }
interface EmStress { pairs:EmRow[]; em_stress_score:number; em_stress_level:string; as_of:string; }
interface Positioning { net_contracts:number; net_4w_chg:number; net_12w_chg:number; signal:string; history:{week:string;net:number}[]; as_of:string; }
interface Regime { regime_id:number; name:string; color:string; favors:string[]; desc:string; strong_dollar:boolean; rising_yields:boolean; rising_growth:boolean; as_of:string; }
interface Signal { type:string; title:string; desc:string; severity:string; }
interface Signals { signals:Signal[]; count:number; as_of:string; }
interface Conviction { conviction:number; signal:string; components:Record<string,number>; weights:Record<string,number>; backtest:{bucket:string;count:number;avg_1m:number;avg_3m:number;avg_6m:number;win_rate_1m:number;win_rate_3m:number}[]; history:{date:string;score:number}[]; as_of:string; }

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`/api/dollar${path}`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(v:number,d=2){return v.toFixed(d);}
function fmtPct(v:number){return `${v>=0?"+":""}${v.toFixed(2)}%`;}
function chgColor(v:number){return v>0?GREEN:v<0?RED:MUTED;}
function chgIcon(v:number){return v>0?<ChevronUp size={12}/>:v<0?<ChevronDown size={12}/>:<Minus size={12}/>;}
function corrColor(v:number){
  const abs=Math.abs(v);
  if(v<-0.5)return "#ef4444";if(v<-0.3)return "#f97316";
  if(v>0.5)return "#10b981";if(v>0.3)return "#84cc16";
  return "#6b7280";
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Spinner(){return<div className="flex items-center justify-center h-32"><RefreshCw size={20} className="animate-spin text-blue-500"/></div>;}
function Card({children,className,style}:{children:React.ReactNode;className?:string;style?:React.CSSProperties}){return<div className={cn("bg-surface border border-border rounded-xl p-4",className)} style={style}>{children}</div>;}
function Label({children}:{children:React.ReactNode}){return<div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{children}</div>;}

function ScoreGauge({score,label,size=160}:{score:number;label:string;size?:number}){
  const r=70,cx=100,cy=100,arc=Math.PI*r,filled=(score/100)*arc;
  const color=score>=70?GREEN:score<=40?RED:BLUE;
  const angle=(score/100)*180-180;
  const nx=cx+r*Math.cos(angle*Math.PI/180),ny=cy+r*Math.sin(angle*Math.PI/180);
  return(
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

function ComponentBar({label,value,weight}:{label:string;value:number;weight:number}){
  const color=value>=60?GREEN:value<=40?RED:BLUE;
  return(
    <div className="flex items-center gap-3">
      <div className="w-32 text-xs text-text-muted flex-shrink-0">{label} <span className="text-text-muted/50">({weight}%)</span></div>
      <div className="flex-1 bg-surface-2 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all" style={{width:`${value}%`,backgroundColor:color}}/>
      </div>
      <div className="w-10 text-right text-xs font-mono" style={{color}}>{value.toFixed(0)}</div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = ["Overview","Yields","Fed & Liquidity","Currencies","Cross-Asset","EM Stress","Positioning","Regime","Signals","Conviction"] as const;
type Tab = typeof TABS[number];

// ── Tab Components ────────────────────────────────────────────────────────────
function OverviewTab({d}:{d:Overview}){
  const s=d.strength;
  const regColor=s.score>=70?GREEN:s.score>=55?BLUE:s.score>=45?AMBER:RED;
  return(
    <div className="space-y-4">
      {/* Price row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          {label:"DXY Index",val:fmt(d.price,3),chg:null,highlight:true},
          {label:"Daily",val:fmtPct(d.daily),chg:d.daily,highlight:false},
          {label:"Weekly",val:fmtPct(d.weekly),chg:d.weekly,highlight:false},
          {label:"Monthly",val:fmtPct(d.monthly),chg:d.monthly,highlight:false},
          {label:"YTD",val:fmtPct(d.ytd),chg:d.ytd,highlight:false},
        ].map(c=>(
          <Card key={c.label}>
            <Label>{c.label}</Label>
            <div className="text-xl font-bold font-mono" style={{color:c.highlight?BLUE:chgColor(c.chg??0)}}>{c.val}</div>
            {c.highlight&&<div className="text-xs text-text-muted mt-1">Vol30: {d.vol30.toFixed(1)}%</div>}
          </Card>
        ))}
      </div>

      {/* Score + MAs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="flex flex-col items-center gap-2">
          <Label>Dollar Strength Score</Label>
          <ScoreGauge score={s.score} label={s.regime} size={180}/>
          <div className="grid grid-cols-3 gap-2 w-full text-center text-xs mt-1">
            <div><div className="text-text-muted">Trend</div><div className="font-mono" style={{color:BLUE}}>{s.trend_pts}/30</div></div>
            <div><div className="text-text-muted">Momentum</div><div className="font-mono" style={{color:BLUE}}>{s.momentum_pts}/30</div></div>
            <div><div className="text-text-muted">Breadth</div><div className="font-mono" style={{color:BLUE}}>{s.breadth_pts}/40 ({s.breadth_pct}%)</div></div>
          </div>
        </Card>

        <Card>
          <Label>Moving Averages</Label>
          <div className="space-y-3">
            {[{label:"20-Day MA",val:d.ma20,above:d.above_ma20},{label:"50-Day MA",val:d.ma50,above:d.above_ma50},{label:"200-Day MA",val:d.ma200,above:d.above_ma200}].map(m=>(
              <div key={m.label} className="flex items-center justify-between">
                <span className="text-sm text-text-muted">{m.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{fmt(m.val,3)}</span>
                  <span className={cn("text-xs px-2 py-0.5 rounded font-semibold",m.above?"bg-emerald-500/10 text-emerald-400":"bg-red-500/10 text-red-400")}>
                    {m.above?"Above":"Below"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Label>Technical Indicators</Label>
          <div className="space-y-2.5">
            <div className="flex justify-between text-sm"><span className="text-text-muted">RSI(14)</span><span className="font-mono" style={{color:d.rsi>70?RED:d.rsi<30?GREEN:MUTED}}>{fmt(d.rsi,1)} — {d.rsi_signal}</span></div>
            <div className="flex justify-between text-sm"><span className="text-text-muted">MACD</span><span className="font-mono" style={{color:d.macd_bullish?GREEN:RED}}>{fmt(d.macd,4)} ({d.macd_bullish?"Bull":"Bear"})</span></div>
            <div className="flex justify-between text-sm"><span className="text-text-muted">ADX(14)</span><span className="font-mono" style={{color:BLUE}}>{fmt(d.adx,1)} — {d.adx_signal}</span></div>
            <div className="flex justify-between text-sm"><span className="text-text-muted">DI+ / DI−</span><span className="font-mono text-xs">{fmt(d.di_plus,1)} / {fmt(d.di_minus,1)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-text-muted">BB %</span><span className="font-mono" style={{color:d.bb_pct>80?RED:d.bb_pct<20?GREEN:MUTED}}>{fmt(d.bb_pct,1)}%</span></div>
            <div className="flex justify-between text-sm"><span className="text-text-muted">BB Upper/Lower</span><span className="font-mono text-xs">{fmt(d.bb_upper,2)} / {fmt(d.bb_lower,2)}</span></div>
          </div>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <Label>DXY — 60-Day Price</Label>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={d.series} margin={{top:4,right:8,left:0,bottom:0}}>
            <defs><linearGradient id="dxyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={BLUE} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={BLUE} stopOpacity={0}/>
            </linearGradient></defs>
            <XAxis dataKey="date" tick={{fill:MUTED,fontSize:10}} tickLine={false} interval={9}/>
            <YAxis domain={["auto","auto"]} tick={{fill:MUTED,fontSize:10}} tickLine={false} width={40}/>
            <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}} labelStyle={{color:"#9ca3af"}} formatter={(v:number)=>[v.toFixed(3),"DXY"]}/>
            <Area type="monotone" dataKey="price" stroke={BLUE} fill="url(#dxyGrad)" strokeWidth={2} dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

function YieldsTab({d}:{d:Yields}){
  const tenors=["US3M","US2Y","US5Y","US10Y","US30Y"];
  return(
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Yield curve chart */}
        <Card>
          <Label>US Treasury Yield Curve</Label>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.curve} margin={{top:4,right:8,left:0,bottom:0}}>
              <XAxis dataKey="tenor" tick={{fill:MUTED,fontSize:11}} tickLine={false}/>
              <YAxis domain={["auto","auto"]} tick={{fill:MUTED,fontSize:10}} tickLine={false} width={35} tickFormatter={v=>`${v.toFixed(1)}%`}/>
              <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}} formatter={(v:number)=>[`${v.toFixed(3)}%`,"Yield"]}/>
              <Bar dataKey="yield" radius={[4,4,0,0]}>
                {d.curve.map((_, i) => <Cell key={i} fill={BLUE} fillOpacity={0.6+i*0.08}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-between text-xs mt-2">
            <span className="text-text-muted">2s10s Spread</span>
            <span className="font-mono" style={{color:d.curve_spread_2s10s>0?GREEN:RED}}>
              {d.curve_spread_2s10s>0?"+":""}{fmt(d.curve_spread_2s10s,3)}% — {d.curve_shape}
            </span>
          </div>
        </Card>

        {/* US yields table */}
        <Card>
          <Label>US Treasury Yields</Label>
          <div className="space-y-2">
            {tenors.map(k=>{const v=d.us_yields[k]; if(!v)return null; return(
              <div key={k} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <span className="text-sm text-text-muted">{k}</span>
                <div className="flex items-center gap-4 text-sm font-mono">
                  <span style={{color:BLUE}}>{fmt(v.value,3)}%</span>
                  <span style={{color:chgColor(v.chg_1m)}}>{v.chg_1m>0?"+":""}{fmt(v.chg_1m,3)}% 1M</span>
                  <span style={{color:chgColor(v.chg_3m)}}>{v.chg_3m>0?"+":""}{fmt(v.chg_3m,3)}% 3M</span>
                </div>
              </div>
            );})}
          </div>
        </Card>
      </div>

      {/* Real yield */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <Label>Real Yield (10Y − Breakeven)</Label>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold font-mono" style={{color:d.real_yield>1?GREEN:d.real_yield<0?RED:AMBER}}>{fmt(d.real_yield,3)}%</div>
            <div>
              <div className="text-xs font-semibold" style={{color:d.real_yield>1?GREEN:d.real_yield<0?RED:AMBER}}>{d.real_signal}</div>
              <div className="text-xs text-text-muted">Breakeven: {fmt(d.breakeven,2)}%</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-text-muted">Positive real yields attract capital flows into USD assets, providing structural support for the dollar.</div>
        </Card>

        {/* Foreign differentials */}
        <Card>
          <Label>US 10Y vs Foreign — Differential</Label>
          <div className="space-y-2">
            {d.foreign.map(f=>(
              <div key={f.country} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                <span className="text-sm text-text-muted w-28">{f.country}</span>
                <span className="text-sm font-mono text-text-muted">{fmt(f.yield_10y,2)}%</span>
                <span className="text-sm font-mono" style={{color:chgColor(f.spread)}}>{f.spread>0?"+":""}{fmt(f.spread,3)}%</span>
                <span className={cn("text-xs px-1.5 py-0.5 rounded",f.spread>0?"bg-emerald-500/10 text-emerald-400":"bg-red-500/10 text-red-400")}>{f.spread>0?"✓ Sup.":"✗ Neg."}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

function FedLiqTab({fed,liq}:{fed:Fed;liq:Liq}){
  const pieData=[
    {name:"Cut",val:fed.cut_prob,color:RED},{name:"Hold",val:fed.hold_prob,color:AMBER},{name:"Hike",val:fed.hike_prob,color:GREEN},
  ];
  return(
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Fed expectations */}
        <Card>
          <Label>Federal Reserve Expectations</Label>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-text-muted">Current Rate</span><span className="font-mono text-sm" style={{color:BLUE}}>{fed.target_range}%</span></div>
            <div className="flex justify-between"><span className="text-sm text-text-muted">Next Meeting</span><span className="font-mono text-sm">{fed.next_meeting}</span></div>
            <div className="border-t border-border/50 pt-3 space-y-2">
              <div className="text-xs text-text-muted mb-2">Next Meeting Probabilities</div>
              {pieData.map(p=>(
                <div key={p.name} className="flex items-center gap-2">
                  <div className="w-16 text-xs" style={{color:p.color}}>{p.name}</div>
                  <div className="flex-1 bg-surface-2 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{width:`${p.val}%`,backgroundColor:p.color}}/>
                  </div>
                  <div className="w-10 text-right text-xs font-mono" style={{color:p.color}}>{p.val}%</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <Label>Market vs Fed Dot Plot</Label>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-text-muted">Cuts Priced (2026)</span><span className="font-mono text-sm" style={{color:RED}}>{fed.cuts_priced_2026.toFixed(1)} cuts</span></div>
            <div className="flex justify-between"><span className="text-sm text-text-muted">Market YE Rate</span><span className="font-mono text-sm" style={{color:BLUE}}>{fed.market_rate_eoy.toFixed(3)}%</span></div>
            <div className="flex justify-between"><span className="text-sm text-text-muted">Dot Plot YE Rate</span><span className="font-mono text-sm" style={{color:MUTED}}>{fed.dot_plot_eoy.toFixed(3)}%</span></div>
            <div className="border-t border-border/50 pt-3">
              <div className="text-xs text-text-muted mb-1">Market vs Dot Gap</div>
              <div className="text-lg font-bold font-mono" style={{color:fed.market_rate_eoy<fed.dot_plot_eoy?RED:GREEN}}>
                {(fed.market_rate_eoy-fed.dot_plot_eoy)>0?"+":""}{((fed.market_rate_eoy-fed.dot_plot_eoy)*100).toFixed(0)} bps
              </div>
              <div className="text-xs text-text-muted mt-1">{fed.market_rate_eoy<fed.dot_plot_eoy?"Market more dovish than Fed — USD headwind":"Market more hawkish than Fed — USD tailwind"}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Liquidity */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label:"Fed Balance Sheet",val:liq.fed_balance_sheet_b,chg:liq.fed_bs_4w_chg_b,color:BLUE},
          {label:"Treasury Gen. Account",val:liq.tga_b,chg:liq.tga_4w_chg_b,color:AMBER},
          {label:"Reverse Repo (RRP)",val:liq.rrp_b,chg:liq.rrp_4w_chg_b,color:PURPLE},
          {label:"Net Liquidity",val:liq.net_liquidity_b,chg:liq.net_4w_chg_b,color:liq.net_4w_chg_b>0?GREEN:RED},
        ].map(c=>(
          <Card key={c.label}>
            <Label>{c.label}</Label>
            <div className="text-xl font-bold font-mono" style={{color:c.color}}>${c.val.toLocaleString()}B</div>
            <div className="text-xs mt-1" style={{color:chgColor(c.chg)}}>{c.chg>=0?"+":""}{c.chg.toFixed(0)}B (4W)</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <Label>Net Liquidity Trend (Fed BS − TGA − RRP)</Label>
          <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{background:`${liq.net_4w_chg_b>0?GREEN:RED}20`,color:liq.net_4w_chg_b>0?GREEN:RED}}>{liq.liquidity_trend} → {liq.dollar_impact}</span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={liq.history} margin={{top:4,right:8,left:0,bottom:0}}>
            <XAxis dataKey="label" tick={{fill:MUTED,fontSize:10}} tickLine={false}/>
            <YAxis tick={{fill:MUTED,fontSize:10}} tickLine={false} width={55} tickFormatter={v=>`$${v}B`}/>
            <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}} formatter={(v:number)=>[`$${v.toLocaleString()}B`,"Net Liquidity"]}/>
            <Bar dataKey="value" radius={[4,4,0,0]} fill={BLUE} fillOpacity={0.7}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <div className="text-xs text-text-muted">As of {liq.as_of}</div>
    </div>
  );
}

function CurrenciesTab({d}:{d:Currencies}){
  const max=Math.max(...d.pairs.map(p=>Math.abs(p.usd_score_1m)));
  return(
    <div className="space-y-4">
      <Card>
        <Label>G8 Currency Relative Strength vs USD — 1M</Label>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-text-muted border-b border-border">
              <th className="text-left py-2 w-6">#</th>
              <th className="text-left py-2">Pair</th>
              <th className="text-right py-2">Price</th>
              <th className="text-right py-2">1M Ret</th>
              <th className="text-right py-2">3M Ret</th>
              <th className="text-right py-2">6M Ret</th>
              <th className="text-right py-2">RSI</th>
              <th className="py-2 px-3 w-40">USD Strength</th>
            </tr></thead>
            <tbody>{d.pairs.map((p,i)=>{
              const barW=Math.abs(p.usd_score_1m)/max*100;
              const usdPos=p.usd_score_1m>0;
              return(
                <tr key={p.pair} className="border-b border-border/40 hover:bg-surface-2/50">
                  <td className="py-2 text-text-muted">{i+1}</td>
                  <td className="py-2 font-semibold">{p.pair}</td>
                  <td className="py-2 text-right font-mono text-xs">{p.price.toFixed(4)}</td>
                  <td className="py-2 text-right font-mono text-xs" style={{color:chgColor(p.ret_1m)}}>{fmtPct(p.ret_1m)}</td>
                  <td className="py-2 text-right font-mono text-xs" style={{color:chgColor(p.ret_3m)}}>{fmtPct(p.ret_3m)}</td>
                  <td className="py-2 text-right font-mono text-xs" style={{color:chgColor(p.ret_6m)}}>{fmtPct(p.ret_6m)}</td>
                  <td className="py-2 text-right font-mono text-xs" style={{color:p.rsi>70?RED:p.rsi<30?GREEN:MUTED}}>{p.rsi.toFixed(0)}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 flex justify-end">
                        {!usdPos&&<div className="h-2 rounded-l" style={{width:`${barW}%`,backgroundColor:RED,maxWidth:"70px"}}/>}
                      </div>
                      <div className="w-px h-3 bg-border mx-1"/>
                      <div className="flex-1">
                        {usdPos&&<div className="h-2 rounded-r" style={{width:`${barW}%`,backgroundColor:GREEN,maxWidth:"70px"}}/>}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-4 mt-3 text-xs text-text-muted">
          <span className="flex items-center gap-1"><div className="w-3 h-2 rounded" style={{background:RED}}/> USD Weaker</span>
          <span className="flex items-center gap-1"><div className="w-3 h-2 rounded" style={{background:GREEN}}/> USD Stronger</span>
        </div>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

function CrossAssetTab({d}:{d:CrossAsset}){
  const classes=["Equities","Bonds","Commodities","Crypto"];
  return(
    <div className="space-y-4">
      {classes.map(cls=>{
        const rows=d.correlations.filter(r=>r.asset_class===cls);
        if(!rows.length)return null;
        return(
          <Card key={cls}>
            <Label>{cls}</Label>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-text-muted border-b border-border">
                  <th className="text-left py-1.5">Asset</th>
                  <th className="text-center py-1.5">30D Corr</th>
                  <th className="text-center py-1.5">90D Corr</th>
                  <th className="text-center py-1.5">Trend</th>
                  <th className="text-left py-1.5">Signal</th>
                </tr></thead>
                <tbody>{rows.map(r=>(
                  <tr key={r.name} className="border-b border-border/40 hover:bg-surface-2/50">
                    <td className="py-2 font-semibold">{r.name}</td>
                    <td className="py-2 text-center">
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold" style={{background:`${corrColor(r.corr_30d)}20`,color:corrColor(r.corr_30d)}}>{r.corr_30d>0?"+":""}{r.corr_30d.toFixed(2)}</span>
                    </td>
                    <td className="py-2 text-center">
                      <span className="px-2 py-0.5 rounded text-xs font-mono" style={{background:`${corrColor(r.corr_90d)}15`,color:corrColor(r.corr_90d)}}>{r.corr_90d>0?"+":""}{r.corr_90d.toFixed(2)}</span>
                    </td>
                    <td className="py-2 text-center text-xs text-text-muted">{r.trend}</td>
                    <td className="py-2 text-xs" style={{color:r.corr_30d<-0.3?RED:r.corr_30d>0.3?GREEN:MUTED}}>{r.signal}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        );
      })}
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

function EmStressTab({d}:{d:EmStress}){
  const lvlColor=d.em_stress_level==="Severe"?RED:d.em_stress_level==="Elevated"?AMBER:d.em_stress_level==="Moderate"?BLUE:GREEN;
  return(
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="flex flex-col items-center gap-2">
          <Label>EM Composite Stress Score</Label>
          <ScoreGauge score={d.em_stress_score} label={d.em_stress_level} size={160}/>
          <div className="text-xs text-text-muted text-center">Higher score = more EM currency stress = USD demand</div>
        </Card>
        <Card className="md:col-span-2">
          <Label>EM Currency Stress Ranking</Label>
          <div className="space-y-2">
            {d.pairs.map(p=>(
              <div key={p.pair} className="flex items-center gap-3 py-1 border-b border-border/40 last:border-0">
                <div className="w-5 text-xs text-text-muted text-center">{p.rank}</div>
                <div className="w-24 text-sm font-semibold">{p.pair}</div>
                <div className="w-20 text-xs font-mono text-right" style={{color:chgColor(p.ret_1m)}}>{fmtPct(p.ret_1m)}</div>
                <div className="w-16 text-xs font-mono text-right text-text-muted">Vol: {p.vol30.toFixed(1)}%</div>
                <div className="flex-1">
                  <div className="bg-surface-2 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{width:`${p.stress}%`,backgroundColor:p.stress>60?RED:p.stress>40?AMBER:BLUE}}/>
                  </div>
                </div>
                <div className="w-8 text-xs font-mono text-right" style={{color:p.stress>60?RED:p.stress>40?AMBER:MUTED}}>{p.stress.toFixed(0)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

function PositioningTab({d}:{d:Positioning}){
  const posColor=d.net_contracts>30000?RED:d.net_contracts<-15000?RED:GREEN;
  return(
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <Label>CFTC Net Position (USD)</Label>
          <div className="text-2xl font-bold font-mono mt-2" style={{color:posColor}}>
            {d.net_contracts>0?"+":""}{d.net_contracts.toLocaleString()}
          </div>
          <div className="text-xs text-text-muted mt-1">contracts</div>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-text-muted">4W Change</span><span style={{color:chgColor(d.net_4w_chg)}}>{d.net_4w_chg>0?"+":""}{d.net_4w_chg.toLocaleString()}</span></div>
            <div className="flex justify-between text-sm"><span className="text-text-muted">12W Change</span><span style={{color:chgColor(d.net_12w_chg)}}>{d.net_12w_chg>0?"+":""}{d.net_12w_chg.toLocaleString()}</span></div>
          </div>
        </Card>
        <Card>
          <Label>Signal</Label>
          <div className="flex flex-col gap-2 mt-2">
            <div className="text-lg font-bold" style={{color:d.signal==="Neutral"?AMBER:posColor}}>{d.signal}</div>
            {d.net_contracts>30000&&<div className="text-xs text-red-400">⚠ Crowded long — contrarian risk to downside</div>}
            {d.net_contracts<-15000&&<div className="text-xs text-red-400">⚠ Crowded short — squeeze risk to upside</div>}
            <div className="text-xs text-text-muted mt-2">As of {d.as_of}</div>
          </div>
        </Card>
        <Card>
          <Label>Interpretation</Label>
          <div className="text-xs text-text-muted space-y-2 mt-1">
            <p><span style={{color:GREEN}}>+30k+</span> contracts = crowded long → contrarian bearish for USD</p>
            <p><span style={{color:BLUE}}>0–30k</span> contracts = moderate long → neutral</p>
            <p><span style={{color:RED}}>−15k−</span> contracts = crowded short → squeeze risk bullish</p>
          </div>
        </Card>
      </div>
      <Card>
        <Label>12-Week Net Position History</Label>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={d.history} margin={{top:4,right:8,left:0,bottom:0}}>
            <XAxis dataKey="week" tick={{fill:MUTED,fontSize:9}} tickLine={false} interval={2}/>
            <YAxis tick={{fill:MUTED,fontSize:10}} tickLine={false} width={55}/>
            <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}} formatter={(v:number)=>[v.toLocaleString(),"Net Contracts"]}/>
            <ReferenceLine y={0} stroke={MUTED} strokeDasharray="3 3"/>
            <Bar dataKey="net" radius={[3,3,0,0]}>
              {d.history.map((h,i)=><Cell key={i} fill={h.net>0?BLUE:RED} fillOpacity={0.75}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function RegimeTab({d}:{d:Regime}){
  return(
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card style={{borderColor:d.color,borderWidth:2}}>
          <Label>Current Dollar Regime</Label>
          <div className="text-xl font-bold mt-2" style={{color:d.color}}>{d.name}</div>
          <p className="text-sm text-text-muted mt-3">{d.desc}</p>
          <div className="flex gap-3 mt-4">
            {[{k:"Dollar",v:d.strong_dollar},{k:"Yields",v:d.rising_yields},{k:"Growth",v:d.rising_growth}].map(i=>(
              <div key={i.k} className="flex flex-col items-center gap-1">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm",i.v?"bg-emerald-500/20":"bg-red-500/20")}>
                  {i.v?"↑":"↓"}
                </div>
                <div className="text-xs text-text-muted">{i.k}</div>
                <div className="text-xs font-semibold" style={{color:i.v?GREEN:RED}}>{i.v?"Rising":"Falling"}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <Label>Historically Favors</Label>
          <div className="space-y-2 mt-2">
            {d.favors.map(f=>(
              <div key={f} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
                <div className="w-2 h-2 rounded-full" style={{background:d.color}}/>
                <span className="text-sm">{f}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* All 4 regimes reference */}
      <Card>
        <Label>Dollar Regime Framework</Label>
        <div className="grid grid-cols-2 gap-3">
          {[
            {id:1,name:"Strong $ + Rising Yields",color:"#3b82f6",desc:"Financials, Value, Energy"},
            {id:2,name:"Strong $ + Falling Yields",color:"#8b5cf6",desc:"Defensives, Utilities, Quality"},
            {id:3,name:"Weak $ + Rising Growth",color:"#10b981",desc:"Tech, EM, Commodities, Gold"},
            {id:4,name:"Weak $ + Falling Growth",color:"#f59e0b",desc:"Bonds, Gold, JPY, CHF"},
          ].map(r=>(
            <div key={r.id} className={cn("rounded-lg p-3 border",d.regime_id===r.id?"border-2":"border")} style={{borderColor:d.regime_id===r.id?r.color:"#1f2937",background:d.regime_id===r.id?`${r.color}10`:"transparent"}}>
              <div className="text-xs font-bold mb-1" style={{color:r.color}}>Regime {r.id}: {r.name}</div>
              <div className="text-xs text-text-muted">{r.desc}</div>
              {d.regime_id===r.id&&<div className="text-xs font-semibold mt-1" style={{color:r.color}}>◉ ACTIVE</div>}
            </div>
          ))}
        </div>
      </Card>
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

function SignalsTab({d}:{d:Signals}){
  const typeColor={bullish:GREEN,bearish:RED,warning:AMBER,info:MUTED} as Record<string,string>;
  const typeBg={bullish:"bg-emerald-500/10",bearish:"bg-red-500/10",warning:"bg-amber-500/10",info:"bg-gray-500/10"} as Record<string,string>;
  const sevOrder={critical:0,high:1,medium:2,low:3} as Record<string,number>;
  const sorted=[...d.signals].sort((a,b)=>(sevOrder[a.severity]??9)-(sevOrder[b.severity]??9));
  return(
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-text-muted">{d.count} active signal{d.count!==1?"s":""} — {d.as_of}</div>
      {sorted.map((s,i)=>(
        <Card key={i} className={cn(typeBg[s.type],"border-l-4")} style={{borderLeftColor:typeColor[s.type]}}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-sm" style={{color:typeColor[s.type]}}>{s.title}</div>
              <div className="text-xs text-text-muted mt-0.5">{s.desc}</div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded border flex-shrink-0" style={{borderColor:typeColor[s.type],color:typeColor[s.type]}}>{s.severity}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ConvictionTab({d}:{d:Conviction}){
  const sigColor=(s:string)=>s.includes("Short")?RED:s==="Neutral"?AMBER:GREEN;
  const wKeys=["trend","momentum","yield_diff","real_yield","fed","liquidity","positioning"] as const;
  const wLabels={trend:"Trend",momentum:"Momentum",yield_diff:"Yield Diff",real_yield:"Real Yield",fed:"Fed",liquidity:"Liquidity",positioning:"Positioning"};
  return(
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="flex flex-col items-center gap-3">
          <Label>Dollar Conviction Score</Label>
          <ScoreGauge score={d.conviction} label={d.signal} size={200}/>
          <div className="text-2xl font-bold" style={{color:sigColor(d.signal)}}>{d.signal}</div>
          <div className="text-xs text-text-muted">Composite score across 7 macro factors</div>
        </Card>
        <Card>
          <Label>Component Breakdown</Label>
          <div className="space-y-2.5 mt-2">
            {wKeys.map(k=>(
              <ComponentBar key={k} label={wLabels[k]} value={d.components[k]??50} weight={d.weights[k]??0}/>
            ))}
          </div>
        </Card>
      </div>

      {/* Backtest */}
      <Card>
        <Label>Historical Signal vs Forward DXY Returns (2Y Backtest)</Label>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mt-1">
            <thead><tr className="text-xs text-text-muted border-b border-border">
              <th className="text-left py-2">Signal Bucket</th>
              <th className="text-right py-2">Observations</th>
              <th className="text-right py-2">Avg 1M Return</th>
              <th className="text-right py-2">Avg 3M Return</th>
              <th className="text-right py-2">Avg 6M Return</th>
              <th className="text-right py-2">1M Win Rate</th>
              <th className="text-right py-2">3M Win Rate</th>
            </tr></thead>
            <tbody>{d.backtest.map(b=>(
              <tr key={b.bucket} className="border-b border-border/40 hover:bg-surface-2/50">
                <td className="py-2 font-semibold">{b.bucket}</td>
                <td className="py-2 text-right text-text-muted">{b.count}</td>
                <td className="py-2 text-right font-mono" style={{color:chgColor(b.avg_1m)}}>{fmtPct(b.avg_1m)}</td>
                <td className="py-2 text-right font-mono" style={{color:chgColor(b.avg_3m)}}>{fmtPct(b.avg_3m)}</td>
                <td className="py-2 text-right font-mono" style={{color:chgColor(b.avg_6m)}}>{fmtPct(b.avg_6m)}</td>
                <td className="py-2 text-right font-mono" style={{color:b.win_rate_1m>55?GREEN:b.win_rate_1m<45?RED:MUTED}}>{b.win_rate_1m.toFixed(1)}%</td>
                <td className="py-2 text-right font-mono" style={{color:b.win_rate_3m>55?GREEN:b.win_rate_3m<45?RED:MUTED}}>{b.win_rate_3m.toFixed(1)}%</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>

      {/* History chart */}
      {d.history.length>0&&(
        <Card>
          <Label>Conviction Score History (12 Weeks)</Label>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={d.history} margin={{top:4,right:8,left:0,bottom:0}}>
              <XAxis dataKey="date" tick={{fill:MUTED,fontSize:10}} tickLine={false}/>
              <YAxis domain={[0,100]} tick={{fill:MUTED,fontSize:10}} tickLine={false} width={30}/>
              <Tooltip contentStyle={{background:"#111827",border:"1px solid #1f2937",borderRadius:8}} formatter={(v:number)=>[`${v}/100`,"Score"]}/>
              <ReferenceLine y={57} stroke={GREEN} strokeDasharray="3 3" opacity={0.5}/>
              <ReferenceLine y={43} stroke={RED} strokeDasharray="3 3" opacity={0.5}/>
              <Line type="monotone" dataKey="score" stroke={BLUE} strokeWidth={2} dot={{r:3,fill:BLUE}} activeDot={{r:4}}/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
      <div className="text-xs text-text-muted">As of {d.as_of}</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DollarPage() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string|null>(null);
  const [overview,    setOverview]    = useState<Overview|null>(null);
  const [yields,      setYields]      = useState<Yields|null>(null);
  const [fed,         setFed]         = useState<Fed|null>(null);
  const [liq,         setLiq]         = useState<Liq|null>(null);
  const [currencies,  setCurrencies]  = useState<Currencies|null>(null);
  const [crossAsset,  setCrossAsset]  = useState<CrossAsset|null>(null);
  const [emStress,    setEmStress]    = useState<EmStress|null>(null);
  const [positioning, setPositioning] = useState<Positioning|null>(null);
  const [regime,      setRegime]      = useState<Regime|null>(null);
  const [signals,     setSignals]     = useState<Signals|null>(null);
  const [conviction,  setConviction]  = useState<Conviction|null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ov, yi, fe, li, cu, ca, em, po, re, si, co] = await Promise.all([
        apiFetch<Overview>("/overview"),
        apiFetch<Yields>("/yields"),
        apiFetch<Fed>("/fed"),
        apiFetch<Liq>("/liquidity"),
        apiFetch<Currencies>("/currencies"),
        apiFetch<CrossAsset>("/cross-asset"),
        apiFetch<EmStress>("/em-stress"),
        apiFetch<Positioning>("/positioning"),
        apiFetch<Regime>("/regime"),
        apiFetch<Signals>("/signals"),
        apiFetch<Conviction>("/conviction"),
      ]);
      setOverview(ov); setYields(yi); setFed(fe); setLiq(li);
      setCurrencies(cu); setCrossAsset(ca); setEmStress(em);
      setPositioning(po); setRegime(re); setSignals(si); setConviction(co);
    } catch(e) {
      setError("Failed to load dollar data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dxyprice = overview?.price ?? 0;
  const dxydaily = overview?.daily ?? 0;

  const TAB_LIST = TABS.map(t => ({ value: t, label: t }));

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header
        className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border"
        style={{ paddingTop: `calc(env(safe-area-inset-top) + 8px)` }}
      >
        <div className="flex items-center justify-between px-4 pb-2">
          <div className="flex items-center gap-2.5">
            <CircleDollarSign size={18} className="text-blue-500 shrink-0"/>
            <div>
              <div className="text-[14px] font-bold text-text-primary leading-tight">Dollar Tracker</div>
              {dxyprice > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold font-mono" style={{color:BLUE}}>{dxyprice.toFixed(3)}</span>
                  <span className="text-[11px] font-mono" style={{color:chgColor(dxydaily)}}>{fmtPct(dxydaily)}</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={load} className="flex items-center justify-center w-8 h-8 rounded-xl bg-surface-2 text-text-muted active:bg-border transition-colors">
            <RefreshCw size={13} className={loading?"animate-spin":""}/>
          </button>
        </div>
        {/* Horizontal scroll tabs */}
        <div className="flex gap-0 overflow-x-auto px-4 pb-0" style={{scrollbarWidth:"none"}}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={cn("px-3 py-2 text-[12px] whitespace-nowrap border-b-2 transition-colors shrink-0",
                tab===t?"border-blue-500 text-blue-400 font-semibold":"border-transparent text-text-muted"
              )}>
              {t}
            </button>
          ))}
        </div>
      </header>

      <PageGuide
        title="Dollar Tracker — Guide"
        subtitle="DXY strength analysis with macro regime and currency pair implications"
        steps={[
          { title: "Read the DXY Overview", detail: "The top panel shows the current DXY level, daily/weekly/monthly/YTD performance, and whether it is above or below its 20, 50, and 200-day moving averages. Green MA labels = bullish positioning; red = bearish." },
          { title: "Check Dollar Strength Regime", detail: "The regime chip classifies DXY as Strong, Neutral, or Weak based on momentum and trend relative to moving averages. A strong dollar is negative for emerging markets, commodities, and multinational earnings." },
          { title: "Review Currency Pairs", detail: "The currency pair table shows how the dollar is performing against EUR, JPY, GBP, CAD, AUD, and CHF. Broad dollar strength across all majors is more significant than a move against a single currency." },
          { title: "Read the Macro Impact Panel", detail: "The impact analysis shows the typical effect of the current dollar regime on Commodities (inverse), EM Equities (inverse), and US Multinationals (headwind from revenue translation)." },
          { title: "View Price History Chart", detail: "The area chart shows DXY price history with MA overlays. Use the lookback selector to assess trend context — the 200-day MA crossing is the most important long-term signal." },
        ]}
        howItWorks={[
          { title: "DXY Data", detail: "The DX-Y.NYB ticker from Yahoo Finance tracks the ICE Dollar Index, which measures USD against a basket of 6 major currencies: EUR (57.6%), JPY (13.6%), GBP (11.9%), CAD (9.1%), SEK (4.2%), CHF (3.6%)." },
          { title: "Strength Score", detail: "The strength score combines the position of DXY relative to its 20/50/200-day SMAs, 3-month momentum, and rate of change. Scores above +0.3 = strong trend dollar; below -0.3 = weak dollar trend." },
          { title: "Macro Impact Rules", detail: "Impact directions are based on historical correlations: commodities priced in USD move inversely to DXY; EM currencies weaken with a strong dollar due to USD-denominated debt burdens; US exporters face headwinds when DXY rises." },
        ]}
        tips={[
          "DXY above its 200-day MA and rising is historically bearish for gold and oil — factor this into commodity trades.",
          "A rapidly strengthening dollar (DXY +5% in 3 months) often precedes EM market stress within 3–6 months.",
          "Dollar weakness combined with a risk-on regime is the ideal setup for EM equities and commodity exporters.",
        ]}
      />

      {/* Content */}
      <div className="p-4">
        {loading && <Spinner/>}
        {error && <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm"><AlertTriangle size={16}/>{error}</div>}
        {!loading && !error && (
          <>
            {tab==="Overview"       && overview    && <OverviewTab    d={overview}/>}
            {tab==="Yields"         && yields      && <YieldsTab      d={yields}/>}
            {tab==="Fed & Liquidity"&& fed && liq  && <FedLiqTab      fed={fed} liq={liq}/>}
            {tab==="Currencies"     && currencies  && <CurrenciesTab  d={currencies}/>}
            {tab==="Cross-Asset"    && crossAsset  && <CrossAssetTab  d={crossAsset}/>}
            {tab==="EM Stress"      && emStress    && <EmStressTab    d={emStress}/>}
            {tab==="Positioning"    && positioning && <PositioningTab d={positioning}/>}
            {tab==="Regime"         && regime      && <RegimeTab      d={regime}/>}
            {tab==="Signals"        && signals     && <SignalsTab      d={signals}/>}
            {tab==="Conviction"     && conviction  && <ConvictionTab  d={conviction}/>}
          </>
        )}
      </div>
    </div>
  );
}
