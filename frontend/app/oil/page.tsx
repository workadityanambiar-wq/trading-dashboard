"use client";
import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  CartesianGrid, ComposedChart, Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle,
  Droplets, Flame, Globe, BarChart2, Activity, Zap,
  Target, Shield, ChevronUp, ChevronDown,
} from "lucide-react";

const B = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const AMBER = "#f59e0b";
const GREEN = "#10b981";
const RED   = "#ef4444";
const BLUE  = "#3b82f6";
const MUTED = "#6b7280";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PriceCard { name: string; symbol: string; price: number; daily: number; weekly: number; monthly: number; ytd: number; vol30: number; trend: string; }
interface Overview  { cards: PriceCard[]; brent_wti_spread: number; composite_score: number; regime: string; regime_color: string; momentum: string; as_of: string; }
interface OpecRow   { country: string; flag: string; production: number; quota: number | null; compliance: number | null; spare_capacity: number; change_mom: number; }
interface Supply    { opec: OpecRow[]; opec_total: number; opec_quota: number; opec_compliance: number; opec_spare: number; us_production: number; us_rig_count: number; us_rig_mom: number; signal: string; signal_reason: string; }
interface InvRow    { name: string; current: number; prev_week: number; five_yr_avg: number; five_yr_low: number; five_yr_high: number; pct_vs_avg: number; surprise: number; z_score: number; trend: string; }
interface Inventory { rows: InvRow[]; signal: string; signal_score: number; as_of: string; }
interface MacroRow  { name: string; value: number; change: number; corr90d: number; signal: string; }
interface Macro     { rows: MacroRow[]; macro_score: number; dxy_trend: string; real_rate: number; breakeven: number; as_of: string; }
interface FuturesPt { tenor: string; price: number; months_out: number; }
interface Futures   { points: FuturesPt[]; structure: string; front_back_spread: number; signal: string; }
interface TechInd   { name: string; value: number; signal: string; }
interface SRLevel   { type: string; level: number; strength: string; }
interface Technical { price: number; ema20: number; ema50: number; ema200: number; rsi: number; macd: number; macd_signal: number; macd_hist: number; atr: number; bb_upper: number; bb_lower: number; bb_mid: number; indicators: TechInd[]; levels: SRLevel[]; tech_score: number; series: {date: string; open: number; high: number; low: number; close: number; ema20: number; ema50: number}[]; }
interface Positioning { mm_long: number; mm_short: number; mm_net: number; commercial_net: number; large_spec_net: number; net_chg: number; crowding: number; signal: string; extreme_long: boolean; extreme_short: boolean; history: {date: string; net_long: number}[]; }
interface FairValue { fair_value: number; current: number; mispricing_pct: number; inputs: Record<string, number>; }
interface Forecast  { label: string; price: number; low: number; high: number; }
interface Models    { fair_value: FairValue; forecasts: Forecast[]; model: string; r2: number; }
interface Composite { total: number; supply: number; demand: number; inventory: number; macro: number; positioning: number; technical: number; regime: string; signal: string; entry: number; stop: number; target: number; risk_reward: number; confidence: number; }
interface Scenario  { name: string; description: string; price_low: number; price_expected: number; price_high: number; probability: number; horizon: string; direction: string; }
interface Scenarios { base_price: number; scenarios: Scenario[]; }
interface Geo       { score: number; level: string; events: {date: string; event: string; impact: string; severity: string}[]; hotspots: string[]; }

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmt(v: number, dec = 2) { return v.toFixed(dec); }
function fmtPct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function fmtPrice(v: number) { return `$${v.toFixed(2)}`; }
function signalColor(s: string) {
  if (s === "Bullish" || s === "Long" || s === "Oversold") return GREEN;
  if (s === "Bearish" || s === "Short" || s === "Overbought") return RED;
  return AMBER;
}
function signalBg(s: string) {
  if (s === "Bullish" || s === "Long") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  if (s === "Bearish" || s === "Short") return "bg-red-500/10 text-red-400 border-red-500/30";
  return "bg-amber-500/10 text-amber-400 border-amber-500/30";
}

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${B}/api/oil${path}`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Spinner() {
  return <div className="flex items-center justify-center h-32"><RefreshCw size={20} className="animate-spin text-amber-500" /></div>;
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-surface border border-border rounded-xl p-4", className)}>{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{children}</div>;
}

// Score gauge — SVG semicircle
function ScoreGauge({ score, label, size = 160 }: { score: number; label: string; size?: number }) {
  const r = 70;
  const cx = 100, cy = 100;
  const arcLen = Math.PI * r; // half circumference
  const filled = (score / 100) * arcLen;
  const color = score >= 60 ? GREEN : score <= 40 ? RED : AMBER;
  const angle = (score / 100) * 180 - 180; // -180 to 0 degrees
  const nx = cx + r * Math.cos((angle * Math.PI) / 180);
  const ny = cy + r * Math.sin((angle * Math.PI) / 180);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" style={{ width: size, height: size * 0.6 }}>
        {/* Track */}
        <path d={`M${cx - r},${cy} A${r},${r} 0 0,1 ${cx + r},${cy}`}
              fill="none" stroke="#1f2937" strokeWidth="14" strokeLinecap="round" />
        {/* Value */}
        <path d={`M${cx - r},${cy} A${r},${r} 0 0,1 ${cx + r},${cy}`}
              fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
              strokeDasharray={`${filled} ${arcLen}`} />
        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth="2" opacity="0.8" />
        <circle cx={cx} cy={cy} r="4" fill="white" opacity="0.8" />
        {/* Label */}
        <text x={cx} y={cy - 8} textAnchor="middle" fill="white" fontSize="26" fontWeight="700">{score.toFixed(0)}</text>
        <text x={cx} y={cy + 18} textAnchor="middle" fill={color} fontSize="10" fontWeight="600">{label}</text>
      </svg>
      <div className="flex justify-between w-full px-2 mt-1">
        {["0\nExtremely\nBearish","20\nBearish","40\nNeutral","60\nBullish","80\nExtremely\nBullish","100"].map((l, i) => (
          <span key={i} className="text-[9px] text-text-muted text-center leading-tight">{l.split("\n").map((ll,j)=><span key={j} className="block">{ll}</span>)}</span>
        ))}
      </div>
    </div>
  );
}

// Score bar row
function ScoreBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  const color = value >= 60 ? GREEN : value <= 40 ? RED : AMBER;
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 text-xs text-text-muted flex-shrink-0">{label} <span className="text-text-muted/50">({weight})</span></div>
      <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <div className="w-8 text-xs font-mono text-right" style={{ color }}>{value.toFixed(0)}</div>
    </div>
  );
}

// ── TABS ───────────────────────────────────────────────────────────────────────

const TABS = ["Overview","Supply","Inventory","Macro","Futures","Technical","Positioning","Models","Signals","Scenarios","Geopolitical"] as const;
type Tab = typeof TABS[number];

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function OilPage() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState("");

  const [overview,     setOverview]     = useState<Overview | null>(null);
  const [supply,       setSupply]       = useState<Supply | null>(null);
  const [inventory,    setInventory]    = useState<Inventory | null>(null);
  const [macro,        setMacro]        = useState<Macro | null>(null);
  const [futures,      setFutures]      = useState<Futures | null>(null);
  const [technical,    setTechnical]    = useState<Technical | null>(null);
  const [positioning,  setPositioning]  = useState<Positioning | null>(null);
  const [models,       setModels]       = useState<Models | null>(null);
  const [composite,    setComposite]    = useState<Composite | null>(null);
  const [scenarios,    setScenarios]    = useState<Scenarios | null>(null);
  const [geo,          setGeo]          = useState<Geo | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [ov, sup, inv, mac, fut, tech, pos, mod, comp, scen, g] = await Promise.all([
        apiFetch<Overview>("/overview"),
        apiFetch<Supply>("/supply"),
        apiFetch<Inventory>("/inventory"),
        apiFetch<Macro>("/macro"),
        apiFetch<Futures>("/futures-curve"),
        apiFetch<Technical>("/technical"),
        apiFetch<Positioning>("/positioning"),
        apiFetch<Models>("/models"),
        apiFetch<Composite>("/composite"),
        apiFetch<Scenarios>("/scenarios"),
        apiFetch<Geo>("/geopolitical"),
      ]);
      setOverview(ov); setSupply(sup); setInventory(inv); setMacro(mac);
      setFutures(fut); setTechnical(tech); setPositioning(pos); setModels(mod);
      setComposite(comp); setScenarios(scen); setGeo(g);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e.message || "Failed to load oil data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const wti = overview?.cards.find(c => c.name === "WTI Crude");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Droplets size={18} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text-primary">Crude Oil Market Intelligence</h1>
            <p className="text-xs text-text-muted">Institutional-grade commodity analytics · Real-time</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {wti && (
            <div className="text-right">
              <div className="text-lg font-bold text-amber-400">{fmtPrice(wti.price)}</div>
              <div className={cn("text-xs font-medium", wti.daily >= 0 ? "text-emerald-400" : "text-red-400")}>
                WTI {fmtPct(wti.daily)} today
              </div>
            </div>
          )}
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-muted hover:text-text-primary disabled:opacity-50">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {lastRefresh || "Refresh"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex-shrink-0 px-6 flex gap-0 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
              tab === t ? "border-amber-500 text-amber-400" : "border-transparent text-text-muted hover:text-text-primary")}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center gap-2 mb-4">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {loading && !overview ? <Spinner /> : (
          <>
            {tab === "Overview"     && overview  && <OverviewTab data={overview} composite={composite} />}
            {tab === "Supply"       && supply    && <SupplyTab data={supply} />}
            {tab === "Inventory"    && inventory && <InventoryTab data={inventory} />}
            {tab === "Macro"        && macro     && <MacroTab data={macro} />}
            {tab === "Futures"      && futures   && <FuturesTab data={futures} wtiPrice={wti?.price ?? 75} />}
            {tab === "Technical"    && technical && <TechnicalTab data={technical} />}
            {tab === "Positioning"  && positioning && <PositioningTab data={positioning} />}
            {tab === "Models"       && models    && <ModelsTab data={models} />}
            {tab === "Signals"      && composite && <SignalsTab data={composite} />}
            {tab === "Scenarios"    && scenarios && <ScenariosTab data={scenarios} />}
            {tab === "Geopolitical" && geo       && <GeoTab data={geo} />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────────────

function OverviewTab({ data, composite }: { data: Overview; composite: Composite | null }) {
  return (
    <div className="space-y-5">
      {/* Price Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {data.cards.map(c => (
          <Card key={c.name} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted font-medium">{c.name}</span>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium border",
                c.trend === "Uptrend" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                c.trend === "Downtrend" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                "bg-surface-2 text-text-muted border-border")}>{c.trend}</span>
            </div>
            <div className="text-2xl font-bold text-text-primary">{fmtPrice(c.price)}</div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {[["Day", c.daily], ["Week", c.weekly], ["Month", c.monthly], ["YTD", c.ytd]].map(([l, v]) => (
                <div key={String(l)} className="flex items-center justify-between">
                  <span className="text-text-muted">{l}</span>
                  <span className={Number(v) >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtPct(Number(v))}</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-text-muted">Vol 30d: {c.vol30.toFixed(1)}%</div>
          </Card>
        ))}
      </div>

      {/* Spread + Regime */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="flex flex-col items-center justify-center py-6">
          <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Brent–WTI Spread</div>
          <div className="text-3xl font-bold text-amber-400">${data.brent_wti_spread.toFixed(2)}</div>
          <div className="text-xs text-text-muted mt-1">per barrel</div>
        </Card>

        <Card className="flex flex-col items-center justify-center py-4">
          <ScoreGauge score={data.composite_score} label={data.regime} />
        </Card>

        <Card className="space-y-3 justify-center flex flex-col">
          <div className="text-xs text-text-muted uppercase tracking-wider">Market Regime</div>
          <div className="text-2xl font-bold" style={{ color: data.regime_color }}>{data.regime}</div>
          <div className="flex items-center gap-2">
            <Activity size={13} className="text-text-muted" />
            <span className="text-sm text-text-muted">Momentum: <span className="text-text-primary">{data.momentum}</span></span>
          </div>
          <div className="text-xs text-text-muted pt-2 border-t border-border">{data.as_of}</div>
        </Card>
      </div>

      {/* Composite score breakdown */}
      {composite && (
        <Card>
          <Label>Composite Oil Score Breakdown</Label>
          <div className="space-y-2.5 mt-3">
            <ScoreBar label="Supply"      value={composite.supply}     weight="25%" />
            <ScoreBar label="Demand"      value={composite.demand}     weight="25%" />
            <ScoreBar label="Inventory"   value={composite.inventory}  weight="15%" />
            <ScoreBar label="Macro"       value={composite.macro}      weight="15%" />
            <ScoreBar label="Positioning" value={composite.positioning} weight="10%" />
            <ScoreBar label="Technical"   value={composite.technical}  weight="10%" />
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Supply Tab ─────────────────────────────────────────────────────────────────

function SupplyTab({ data }: { data: Supply }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "OPEC+ Output", value: `${data.opec_total.toFixed(1)} mb/d` },
          { label: "OPEC Quota",   value: `${data.opec_quota.toFixed(1)} mb/d` },
          { label: "Compliance",   value: `${data.opec_compliance.toFixed(0)}%` },
          { label: "Spare Cap.",   value: `${data.opec_spare.toFixed(1)} mb/d` },
        ].map(m => (
          <Card key={m.label} className="text-center py-5">
            <div className="text-xs text-text-muted mb-1">{m.label}</div>
            <div className="text-xl font-bold text-amber-400">{m.value}</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <Label>OPEC+ Production by Country</Label>
          <span className={cn("text-xs px-2 py-0.5 rounded border font-medium", signalBg(data.signal))}>{data.signal}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-surface-2">
                {["Country","Output (mb/d)","Quota","Compliance","Spare Cap.","MoM Change"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-text-muted font-medium border border-border/20">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.opec.map(r => {
                const comp = r.compliance ?? null;
                const compColor = comp === null ? MUTED : comp >= 90 ? GREEN : comp >= 75 ? AMBER : RED;
                return (
                  <tr key={r.country} className="hover:bg-surface-2">
                    <td className="px-3 py-2 border border-border/20">
                      <span className="mr-1.5">{r.flag}</span>{r.country}
                    </td>
                    <td className="px-3 py-2 border border-border/20 font-mono font-bold text-amber-400">{r.production.toFixed(1)}</td>
                    <td className="px-3 py-2 border border-border/20 font-mono text-text-muted">{r.quota ? r.quota.toFixed(1) : "—"}</td>
                    <td className="px-3 py-2 border border-border/20 font-mono font-bold" style={{ color: compColor }}>
                      {comp !== null ? `${comp.toFixed(0)}%` : "Exempt"}
                    </td>
                    <td className="px-3 py-2 border border-border/20 font-mono text-text-muted">{r.spare_capacity.toFixed(1)}</td>
                    <td className={cn("px-3 py-2 border border-border/20 font-mono font-medium",
                      r.change_mom > 0 ? "text-red-400" : r.change_mom < 0 ? "text-emerald-400" : "text-text-muted")}>
                      {r.change_mom > 0 ? "+" : ""}{r.change_mom.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-text-muted bg-surface-2 rounded-lg px-3 py-2">{data.signal_reason}</div>
      </Card>

      {/* US Production */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="text-center py-6">
          <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">US Crude Production</div>
          <div className="text-3xl font-bold text-blue-400">{data.us_production.toFixed(1)}</div>
          <div className="text-xs text-text-muted mt-1">mb/d</div>
        </Card>
        <Card className="text-center py-6">
          <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">Baker Hughes Rig Count</div>
          <div className="text-3xl font-bold text-text-primary">{data.us_rig_count}</div>
          <div className={cn("text-xs mt-1", data.us_rig_mom >= 0 ? "text-red-400" : "text-emerald-400")}>
            {data.us_rig_mom >= 0 ? "+" : ""}{data.us_rig_mom.toFixed(1)}% WoW
          </div>
        </Card>
        <Card className="text-center py-6">
          <div className="text-xs text-text-muted mb-1 uppercase tracking-wider">US Shale Output</div>
          <div className="text-3xl font-bold text-purple-400">~8.4</div>
          <div className="text-xs text-text-muted mt-1">mb/d Permian + DJ + Eagle Ford</div>
        </Card>
      </div>
    </div>
  );
}

// ── Inventory Tab ──────────────────────────────────────────────────────────────

function InventoryTab({ data }: { data: Inventory }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="text-center py-5">
          <div className="text-xs text-text-muted mb-1">Inventory Signal</div>
          <div className={cn("text-xl font-bold", data.signal === "Bullish" ? "text-emerald-400" : data.signal === "Bearish" ? "text-red-400" : "text-amber-400")}>{data.signal}</div>
        </Card>
        <Card className="text-center py-5">
          <div className="text-xs text-text-muted mb-1">Signal Score</div>
          <div className="text-xl font-bold text-text-primary">{data.signal_score.toFixed(0)}/100</div>
        </Card>
        <Card className="text-center py-5">
          <div className="text-xs text-text-muted mb-1">As of</div>
          <div className="text-sm font-medium text-text-primary">{data.as_of}</div>
        </Card>
      </div>

      {data.rows.map(row => {
        const pct5yr = ((row.current - row.five_yr_low) / (row.five_yr_high - row.five_yr_low)) * 100;
        const avgPct = ((row.five_yr_avg - row.five_yr_low) / (row.five_yr_high - row.five_yr_low)) * 100;
        return (
          <Card key={row.name}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-text-primary">{row.name}</div>
                <div className="text-xs text-text-muted mt-0.5">
                  <span className={cn("font-medium", row.pct_vs_avg < 0 ? "text-emerald-400" : "text-red-400")}>
                    {row.pct_vs_avg >= 0 ? "+" : ""}{row.pct_vs_avg.toFixed(1)}% vs 5yr avg
                  </span>
                  <span className="mx-2">·</span>
                  <span className={row.trend === "Drawing" ? "text-emerald-400" : "text-red-400"}>{row.trend}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-amber-400">{row.current.toFixed(1)}</div>
                <div className="text-xs text-text-muted">million barrels</div>
              </div>
            </div>
            {/* Range bar */}
            <div className="relative h-6 bg-surface-2 rounded-full overflow-hidden">
              <div className="absolute h-full bg-blue-500/20 rounded-full"
                   style={{ left: 0, width: `${pct5yr}%` }} />
              <div className="absolute w-0.5 h-full bg-text-muted/50"
                   style={{ left: `${avgPct}%` }} />
              <div className="absolute w-1 h-full bg-amber-400 rounded-full"
                   style={{ left: `${pct5yr - 0.5}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-text-muted mt-1">
              <span>{row.five_yr_low.toFixed(0)} mb (5yr low)</span>
              <span>{row.five_yr_avg.toFixed(0)} mb (5yr avg)</span>
              <span>{row.five_yr_high.toFixed(0)} mb (5yr high)</span>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
              {[
                { l: "Current", v: `${row.current.toFixed(1)} mb` },
                { l: "Prior Week", v: `${row.prev_week.toFixed(1)} mb` },
                { l: "Surprise", v: `${row.surprise > 0 ? "+" : ""}${row.surprise.toFixed(1)} mb` },
                { l: "Z-Score", v: row.z_score.toFixed(2) },
              ].map(({ l, v }) => (
                <div key={l} className="bg-surface-2 rounded-lg px-2 py-1.5">
                  <div className="text-text-muted">{l}</div>
                  <div className="font-mono font-medium text-text-primary">{v}</div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Macro Tab ──────────────────────────────────────────────────────────────────

function MacroTab({ data }: { data: Macro }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Macro Score",    value: `${data.macro_score.toFixed(0)}/100` },
          { label: "DXY Trend",      value: data.dxy_trend },
          { label: "Real Rate",      value: `${data.real_rate.toFixed(2)}%` },
          { label: "10Y Breakeven",  value: `${data.breakeven.toFixed(2)}%` },
        ].map(m => (
          <Card key={m.label} className="text-center py-5">
            <div className="text-xs text-text-muted mb-1">{m.label}</div>
            <div className="text-xl font-bold text-amber-400">{m.value}</div>
          </Card>
        ))}
      </div>

      <Card>
        <Label>Macro Indicators vs WTI Correlation (90d)</Label>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-surface-2">
                {["Indicator","Current Value","Daily Chg","90d Correlation","Signal"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-text-muted font-medium border border-border/20">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={r.name} className="hover:bg-surface-2">
                  <td className="px-3 py-2 border border-border/20 font-medium text-text-primary">{r.name}</td>
                  <td className="px-3 py-2 border border-border/20 font-mono">{r.value.toFixed(2)}</td>
                  <td className={cn("px-3 py-2 border border-border/20 font-mono",
                    r.change >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {r.change >= 0 ? "+" : ""}{r.change.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 border border-border/20">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                             style={{ width: `${Math.abs(r.corr90d) * 100}%`,
                                     marginLeft: r.corr90d < 0 ? `${(1 - Math.abs(r.corr90d)) * 100}%` : 0,
                                     backgroundColor: r.corr90d > 0 ? GREEN : RED }} />
                      </div>
                      <span className="font-mono">{r.corr90d >= 0 ? "+" : ""}{r.corr90d.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 border border-border/20">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border", signalBg(r.signal))}>{r.signal}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 p-3 bg-surface-2 rounded-lg text-xs text-text-muted">
          <strong className="text-text-primary">Interpretation:</strong> DXY has a historically negative correlation with oil (strong dollar → cheaper oil in USD terms). Rising real rates increase the opportunity cost of holding commodities. Gold rising with oil signals broad inflation concern.
        </div>
      </Card>
    </div>
  );
}

// ── Futures Tab ────────────────────────────────────────────────────────────────

function FuturesTab({ data, wtiPrice }: { data: Futures; wtiPrice: number }) {
  const color = data.structure === "Backwardation" ? GREEN : data.structure === "Contango" ? RED : AMBER;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Term Structure", value: data.structure, color },
          { label: "Front–Back Spread", value: `${data.front_back_spread >= 0 ? "+" : ""}$${data.front_back_spread.toFixed(2)}`, color },
          { label: "Signal", value: data.signal, color: signalColor(data.signal) },
        ].map(m => (
          <Card key={m.label} className="text-center py-6">
            <div className="text-xs text-text-muted mb-1">{m.label}</div>
            <div className="text-xl font-bold" style={{ color: m.color }}>{m.value}</div>
          </Card>
        ))}
      </div>

      <Card>
        <Label>WTI Futures Curve</Label>
        <div className="text-xs text-text-muted mb-3">
          {data.structure === "Backwardation"
            ? "Backwardation: spot premium signals tight nearby supply — historically bullish"
            : data.structure === "Contango"
            ? "Contango: deferred premium signals oversupply or weak near-term demand — historically bearish"
            : "Flat curve: balanced supply/demand near-term"}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data.points} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis dataKey="tenor" tick={{ fontSize: 11, fill: MUTED }} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: MUTED }}
                   tickFormatter={v => `$${v.toFixed(1)}`} width={55} />
            <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Price"]}
                     contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                     labelStyle={{ color: "#d1d5db" }} />
            <ReferenceLine y={wtiPrice} stroke={AMBER} strokeDasharray="4 4" label={{ value: "Spot", fill: AMBER, fontSize: 10 }} />
            <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2.5}
                  fill="url(#curveGrad)" dot={{ fill: color, r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ── Technical Tab ──────────────────────────────────────────────────────────────

function TechnicalTab({ data }: { data: Technical }) {
  const bull = data.indicators.filter(i => i.signal === "Bullish" || i.signal === "Oversold").length;
  const bear = data.indicators.filter(i => i.signal === "Bearish" || i.signal === "Overbought").length;
  return (
    <div className="space-y-5">
      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "WTI Price",    value: fmtPrice(data.price) },
          { label: "RSI(14)",      value: data.rsi.toFixed(1), color: data.rsi > 70 ? RED : data.rsi < 30 ? GREEN : undefined },
          { label: "ATR",          value: `$${data.atr.toFixed(2)}` },
          { label: "Tech Score",   value: `${data.tech_score.toFixed(0)}/100`, color: signalColor(data.tech_score >= 60 ? "Bullish" : data.tech_score <= 40 ? "Bearish" : "Neutral") },
        ].map(m => (
          <Card key={m.label} className="text-center py-5">
            <div className="text-xs text-text-muted mb-1">{m.label}</div>
            <div className="text-xl font-bold" style={{ color: m.color ?? AMBER }}>{m.value}</div>
          </Card>
        ))}
      </div>

      {/* Price chart with EMAs */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <Label>WTI Crude — Price & EMAs (180d)</Label>
          <div className="flex gap-3 text-[10px]">
            <span style={{ color: AMBER }}>● Price</span>
            <span style={{ color: "#60a5fa" }}>● EMA 20</span>
            <span style={{ color: "#a78bfa" }}>● EMA 50</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data.series} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: MUTED }} interval={Math.floor(data.series.length / 8)} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: MUTED }}
                   tickFormatter={v => `$${v.toFixed(0)}`} width={52} />
            <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                     labelStyle={{ color: "#d1d5db" }}
                     formatter={(v: number, n: string) => [`$${v.toFixed(2)}`, n]} />
            <ReferenceLine y={data.bb_upper} stroke="#374151" strokeDasharray="2 4" label={{ value: "BB+", fill: MUTED, fontSize: 9 }} />
            <ReferenceLine y={data.bb_lower} stroke="#374151" strokeDasharray="2 4" label={{ value: "BB-", fill: MUTED, fontSize: 9 }} />
            <Area type="monotone" dataKey="close" stroke={AMBER} strokeWidth={2} fill={AMBER} fillOpacity={0.04} name="WTI Close" dot={false} />
            <Line type="monotone" dataKey="ema20" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="EMA 20" />
            <Line type="monotone" dataKey="ema50" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="EMA 50" />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Indicators */}
        <Card>
          <Label>Technical Indicators — {bull} Bullish / {bear} Bearish</Label>
          <div className="space-y-2 mt-2">
            {data.indicators.map(ind => (
              <div key={ind.name} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                <span className="text-xs text-text-muted">{ind.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-text-primary">{ind.value}</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", signalBg(ind.signal))}>{ind.signal}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Support / Resistance */}
        <Card>
          <Label>Support & Resistance Levels</Label>
          <div className="space-y-2 mt-2">
            {data.levels.map((l, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium",
                    l.type === "Resistance" ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20")}>
                    {l.type}
                  </span>
                  <span className="text-xs text-text-muted">{l.strength}</span>
                </div>
                <span className="text-sm font-bold font-mono text-text-primary">{fmtPrice(l.level)}</span>
              </div>
            ))}
            <div className="pt-2 flex items-center justify-between border-t border-amber-500/30">
              <span className="text-xs font-medium text-amber-400">Current Price</span>
              <span className="text-sm font-bold font-mono text-amber-400">{fmtPrice(data.price)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Positioning Tab ────────────────────────────────────────────────────────────

function PositioningTab({ data }: { data: Positioning }) {
  const posData = [
    { name: "Managed Money Long",  value: data.mm_long,         color: GREEN },
    { name: "Managed Money Short", value: Math.abs(data.mm_short), color: RED },
    { name: "Net Position",        value: data.mm_net,           color: AMBER },
    { name: "Commercial Net",      value: data.commercial_net,   color: BLUE },
    { name: "Large Spec Net",      value: data.large_spec_net,   color: "#a78bfa" },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "MM Net Long", value: `${data.mm_net.toFixed(0)}K`, color: data.mm_net > 0 ? GREEN : RED },
          { label: "Crowding Score", value: `${data.crowding.toFixed(0)}/100`, color: data.crowding > 70 ? RED : data.crowding < 30 ? GREEN : AMBER },
          { label: "Signal", value: data.signal, color: signalColor(data.signal) },
          { label: "Extreme Long", value: data.extreme_long ? "YES" : "No", color: data.extreme_long ? RED : MUTED },
          { label: "Extreme Short", value: data.extreme_short ? "YES" : "No", color: data.extreme_short ? GREEN : MUTED },
          { label: "Net Change", value: `${data.net_chg >= 0 ? "+" : ""}${data.net_chg.toFixed(1)}K`, color: data.net_chg >= 0 ? GREEN : RED },
        ].map(m => (
          <Card key={m.label} className="text-center py-5">
            <div className="text-xs text-text-muted mb-1">{m.label}</div>
            <div className="text-xl font-bold" style={{ color: m.color }}>{m.value}</div>
          </Card>
        ))}
      </div>

      {(data.extreme_long || data.extreme_short) && (
        <div className={cn("px-4 py-3 rounded-xl border text-sm font-medium",
          data.extreme_long ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300")}>
          ⚠️ {data.extreme_long ? "Crowded long — contrarian bearish signal. Positioning reversal risk elevated." : "Extreme short — contrarian bullish squeeze potential."}
        </div>
      )}

      <Card>
        <Label>Current Positioning Breakdown</Label>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={posData} layout="vertical" margin={{ left: 20, right: 20 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} tickFormatter={v => `${v.toFixed(0)}K`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: MUTED }} width={140} />
            <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                     formatter={(v: number) => [`${v.toFixed(0)}K contracts`, ""]} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {posData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.8} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <Label>Net Long History (52 Weeks)</Label>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data.history} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: MUTED }} interval={12} />
            <YAxis tick={{ fontSize: 11, fill: MUTED }} tickFormatter={v => `${v.toFixed(0)}K`} width={45} />
            <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                     formatter={(v: number) => [`${v.toFixed(1)}K`, "Net Long"]} />
            <ReferenceLine y={0} stroke={MUTED} strokeDasharray="4 4" />
            <Area type="monotone" dataKey="net_long" stroke={AMBER} fill={AMBER} fillOpacity={0.1} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ── Models Tab ─────────────────────────────────────────────────────────────────

function ModelsTab({ data }: { data: Models }) {
  const mis = data.fair_value.mispricing_pct;
  const misColor = mis > 5 ? RED : mis < -5 ? GREEN : AMBER;
  const chartData = [
    { label: "Current", price: data.fair_value.current, low: data.fair_value.current, high: data.fair_value.current },
    ...data.forecasts,
  ];
  return (
    <div className="space-y-5">
      {/* Fair Value */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="text-center py-6">
          <div className="text-xs text-text-muted mb-1">Current WTI Price</div>
          <div className="text-3xl font-bold text-amber-400">{fmtPrice(data.fair_value.current)}</div>
        </Card>
        <Card className="text-center py-6">
          <div className="text-xs text-text-muted mb-1">Model Fair Value</div>
          <div className="text-3xl font-bold text-blue-400">{fmtPrice(data.fair_value.fair_value)}</div>
          <div className="text-xs text-text-muted mt-1">{data.model} · R² {data.r2.toFixed(2)}</div>
        </Card>
        <Card className="text-center py-6">
          <div className="text-xs text-text-muted mb-1">Mispricing</div>
          <div className="text-3xl font-bold" style={{ color: misColor }}>
            {mis >= 0 ? "+" : ""}{mis.toFixed(1)}%
          </div>
          <div className="text-xs mt-1" style={{ color: misColor }}>
            {mis > 5 ? "Overvalued vs model" : mis < -5 ? "Undervalued vs model" : "Fairly valued"}
          </div>
        </Card>
      </div>

      {/* Factor inputs */}
      {Object.keys(data.fair_value.inputs).length > 0 && (
        <Card>
          <Label>Fair Value Model Inputs</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
            {Object.entries(data.fair_value.inputs).map(([k, v]) => (
              <div key={k} className="bg-surface-2 rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-text-muted">{k}</div>
                <div className="text-sm font-mono font-medium text-text-primary">{Number(v).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Forecast chart */}
      <Card>
        <Label>Price Forecast — {data.model}</Label>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: MUTED }}
                   tickFormatter={v => `$${v.toFixed(0)}`} width={52} />
            <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                     formatter={(v: number, n: string) => [`$${v.toFixed(2)}`, n]} />
            <Area type="monotone" dataKey="high" stroke="none" fill={AMBER} fillOpacity={0.08} />
            <Area type="monotone" dataKey="low"  stroke="none" fill="#111827" fillOpacity={1} />
            <Line type="monotone" dataKey="price" stroke={AMBER} strokeWidth={2.5} dot={{ fill: AMBER, r: 5 }} name="Forecast" />
            <ReferenceLine y={data.fair_value.fair_value} stroke={BLUE} strokeDasharray="4 4"
                           label={{ value: "Fair Value", fill: BLUE, fontSize: 10, position: "right" }} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 text-[10px] text-text-muted">
          <span>Shaded area = confidence interval</span>
          <span>Dashed blue = model fair value</span>
        </div>
      </Card>
    </div>
  );
}

// ── Signals Tab ────────────────────────────────────────────────────────────────

function SignalsTab({ data }: { data: Composite }) {
  const isBull = data.signal === "Long";
  const isBear = data.signal === "Short";
  const sigColor = isBull ? GREEN : isBear ? RED : AMBER;

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Main signal card */}
      <div className={cn("rounded-2xl border-2 p-8 text-center space-y-3",
        isBull ? "border-emerald-500/40 bg-emerald-500/5" : isBear ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5")}>
        <div className="text-xs uppercase tracking-[0.3em] font-semibold" style={{ color: sigColor }}>
          Oil Composite Signal
        </div>
        <div className="flex items-center justify-center gap-3">
          {isBull ? <TrendingUp size={40} color={sigColor} /> : isBear ? <TrendingDown size={40} color={sigColor} /> : <Minus size={40} color={sigColor} />}
          <div className="text-6xl font-black" style={{ color: sigColor }}>{data.signal}</div>
        </div>
        <div className="text-sm text-text-muted">Confidence: <span className="font-bold text-text-primary">{data.confidence.toFixed(0)}%</span></div>
        <div className={cn("inline-block px-4 py-1.5 rounded-full text-sm font-semibold border", signalBg(data.regime))}>
          {data.regime} Regime
        </div>
      </div>

      {/* Trade levels */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Entry",     value: fmtPrice(data.entry),  color: AMBER },
          { label: "Stop Loss", value: fmtPrice(data.stop),   color: RED },
          { label: "Target",    value: fmtPrice(data.target), color: GREEN },
        ].map(m => (
          <Card key={m.label} className="text-center py-6">
            <div className="text-xs text-text-muted mb-1">{m.label}</div>
            <div className="text-2xl font-bold font-mono" style={{ color: m.color }}>{m.value}</div>
          </Card>
        ))}
      </div>

      <Card className="text-center py-5">
        <div className="text-xs text-text-muted mb-1">Risk / Reward Ratio</div>
        <div className="text-3xl font-bold" style={{ color: data.risk_reward >= 2 ? GREEN : data.risk_reward >= 1 ? AMBER : RED }}>
          1 : {data.risk_reward.toFixed(2)}
        </div>
      </Card>

      {/* Component scores */}
      <Card>
        <Label>Score Breakdown</Label>
        <div className="space-y-2.5 mt-3">
          <ScoreBar label="Supply (25%)"     value={data.supply}     weight="25%" />
          <ScoreBar label="Demand (25%)"     value={data.demand}     weight="25%" />
          <ScoreBar label="Inventory (15%)"  value={data.inventory}  weight="15%" />
          <ScoreBar label="Macro (15%)"      value={data.macro}      weight="15%" />
          <ScoreBar label="Positioning (10%)" value={data.positioning} weight="10%" />
          <ScoreBar label="Technical (10%)"  value={data.technical}  weight="10%" />
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted">Total</span>
            <div className="flex items-center gap-2">
              <div className="w-32 h-2.5 bg-surface-2 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${data.total}%`, backgroundColor: sigColor }} />
              </div>
              <span className="text-sm font-bold" style={{ color: sigColor }}>{data.total.toFixed(0)}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Scenarios Tab ──────────────────────────────────────────────────────────────

function ScenariosTab({ data }: { data: Scenarios }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-text-muted mb-2">
        <Shield size={14} />
        Base WTI price: <span className="font-bold text-amber-400">{fmtPrice(data.base_price)}</span>
        <span className="mx-2">·</span>
        Scenario price impact estimates
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.scenarios.map(sc => {
          const isBull = sc.direction === "Bullish";
          const pctLow  = ((sc.price_low / data.base_price) - 1) * 100;
          const pctHigh = ((sc.price_high / data.base_price) - 1) * 100;
          const pctExp  = ((sc.price_expected / data.base_price) - 1) * 100;
          return (
            <Card key={sc.name} className={cn("border", isBull ? "border-emerald-500/20" : "border-red-500/20")}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-text-primary">{sc.name}</div>
                  <div className="text-xs text-text-muted mt-0.5">{sc.description}</div>
                </div>
                <div className={cn("ml-3 flex-shrink-0 px-2 py-0.5 rounded border text-[10px] font-bold",
                  isBull ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-red-500/10 text-red-400 border-red-500/30")}>
                  {isBull ? "▲" : "▼"} {sc.direction}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 my-3 text-center">
                <div className="bg-surface-2 rounded-lg px-2 py-2">
                  <div className="text-[10px] text-text-muted">Low</div>
                  <div className="text-sm font-bold font-mono text-red-400">{fmtPrice(sc.price_low)}</div>
                  <div className="text-[10px] text-red-400/70">{fmtPct(pctLow)}</div>
                </div>
                <div className="bg-surface-2 rounded-lg px-2 py-2 border border-amber-500/20">
                  <div className="text-[10px] text-text-muted">Expected</div>
                  <div className="text-sm font-bold font-mono text-amber-400">{fmtPrice(sc.price_expected)}</div>
                  <div className="text-[10px] text-amber-400/70">{fmtPct(pctExp)}</div>
                </div>
                <div className="bg-surface-2 rounded-lg px-2 py-2">
                  <div className="text-[10px] text-text-muted">High</div>
                  <div className="text-sm font-bold font-mono text-emerald-400">{fmtPrice(sc.price_high)}</div>
                  <div className="text-[10px] text-emerald-400/70">{fmtPct(pctHigh)}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-text-muted pt-2 border-t border-border/30">
                <span>Probability: <span className="text-text-primary font-medium">{sc.probability}%</span></span>
                <span>Horizon: <span className="text-text-primary font-medium">{sc.horizon}</span></span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Geopolitical Tab ───────────────────────────────────────────────────────────

function GeoTab({ data }: { data: Geo }) {
  const levelColor = data.level === "Extreme" ? RED : data.level === "High" ? "#f97316" : data.level === "Moderate" ? AMBER : GREEN;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="text-center py-6 col-span-2 md:col-span-1">
          <div className="text-xs text-text-muted mb-1">Geopolitical Risk Score</div>
          <div className="text-4xl font-black" style={{ color: levelColor }}>{data.score.toFixed(0)}</div>
          <div className="text-xs font-bold mt-1" style={{ color: levelColor }}>{data.level}</div>
        </Card>
        <Card className="col-span-2 md:col-span-3">
          <Label>Active Hotspots</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {data.hotspots.map(h => (
              <span key={h} className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                ⚠ {h}
              </span>
            ))}
          </div>
          <div className="mt-3 h-3 bg-surface-2 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${data.score}%`, backgroundColor: levelColor }} />
          </div>
          <div className="flex justify-between text-[10px] text-text-muted mt-1">
            <span>Low (0)</span><span>Moderate (30)</span><span>High (50)</span><span>Extreme (70+)</span>
          </div>
        </Card>
      </div>

      <Card>
        <Label>Geopolitical Event Timeline</Label>
        <div className="space-y-0 mt-2">
          {data.events.map((e, i) => {
            const sevColor = e.severity === "High" || e.severity === "Extreme" ? RED : e.severity === "Medium" ? AMBER : MUTED;
            return (
              <div key={i} className="flex gap-4 py-3 border-b border-border/20 last:border-0">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: sevColor }} />
                  {i < data.events.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
                </div>
                <div className="flex-1 pb-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm text-text-primary font-medium">{e.event}</div>
                    <div className="flex gap-1 flex-shrink-0">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", signalBg(e.impact))}>{e.impact}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-surface-2 text-text-muted border-border">{e.severity}</span>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">{e.date}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
