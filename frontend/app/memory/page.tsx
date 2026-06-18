"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HistoryDrawer, DrawerConfig } from "@/components/HistoryDrawer";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, ReferenceLine, Area, AreaChart,
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Activity,
  Cpu, BarChart3, Brain, Globe, Zap, Shield, Eye, Target,
  ChevronRight, Layers, Waves, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Fetch ─────────────────────────────────────────────────────────────────────

const BASE = "/api/memory";

async function fetchAll() {
  const keys = ["overview","pricing","hbm","ai-infra","inventory","capacity",
    "companies","earnings","china","supply-chain","flows","technicals",
    "quant","relative","sentiment","signals"];
  const settled = await Promise.allSettled(
    keys.map(k => fetch(`${BASE}/${k}`).then(r => r.json()))
  );
  const [overview,pricing,hbm,aiInfra,inventory,capacity,
    companies,earnings,china,supplyChain,flows,technicals,
    quant,relative,sentiment,signals] = settled.map(r =>
    r.status === "fulfilled" ? r.value : null
  );
  return { overview,pricing,hbm,aiInfra,inventory,capacity,
    companies,earnings,china,supplyChain,flows,technicals,
    quant,relative,sentiment,signals };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number | null | undefined, d = 1) =>
  v == null ? "—" : (v >= 0 ? `+${v.toFixed(d)}` : v.toFixed(d));
const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : (v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`);
const fmtPrice = (v: number, unit = "") =>
  v >= 1000 ? `$${v.toLocaleString()}${unit}` : `$${v.toFixed(v < 1 ? 3 : 2)}${unit}`;

function chgColor(v: number | null | undefined) {
  if (v == null) return "text-text-muted";
  return v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-text-muted";
}
function scoreColor(s: number) {
  if (s >= 80) return "text-positive";
  if (s >= 60) return "text-accent";
  if (s >= 40) return "text-yellow-400";
  return "text-negative";
}
function scoreBg(s: number) {
  if (s >= 80) return "bg-positive";
  if (s >= 60) return "bg-accent";
  if (s >= 40) return "bg-yellow-400";
  return "bg-negative";
}
function signalColor(s: string) {
  if (s === "Strong Buy") return "text-positive bg-positive/10 border-positive/30";
  if (s === "Buy")        return "text-positive bg-positive/10 border-positive/20";
  if (s === "Hold")       return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
  if (s === "Sell")       return "text-negative bg-negative/10 border-negative/20";
  return "text-text-muted border-border bg-surface";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stat({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-[10px] text-text-muted uppercase tracking-widest">{label}</div>
      <div className={cn("text-[22px] font-bold tabular-nums mt-0.5", color || "text-text-primary")}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function ScoreGauge({ score, label, size = "lg" }: { score: number; label: string; size?: "sm"|"lg" }) {
  const color = scoreColor(score);
  const isLg = size === "lg";
  return (
    <div className="flex flex-col items-center">
      <div className={cn("font-black tabular-nums", isLg ? "text-[56px]" : "text-[28px]", color)}>
        {score}
      </div>
      <div className="text-[10px] text-text-muted">{label}</div>
    </div>
  );
}

function toMemorySlug(type: string) {
  return type.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function PriceRow({ item, color = "#6366f1" }: { item: any; color?: string }) {
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  return (
    <>
    <div
      className="flex items-center gap-2 py-2.5 border-b border-surface-2 last:border-0 cursor-pointer hover:bg-surface-2/50 rounded px-1 transition-colors"
      onClick={() => setDrawer({ fetchUrl: `/api/chart/memory/${toMemorySlug(item.type)}`, color })}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-text-primary truncate">{item.type}</div>
        <div className="text-[9px] text-text-muted">{item.unit}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[12px] font-bold tabular-nums">{fmtPrice(item.spot)}</div>
        {item.contract && <div className="text-[9px] text-text-muted">c: {fmtPrice(item.contract)}</div>}
      </div>
      <div className="grid grid-cols-3 gap-1 text-[9px] tabular-nums text-right shrink-0">
        <span className={chgColor(item.wk)}>{item.wk != null ? fmtPct(item.wk) : "—"}</span>
        <span className={chgColor(item.mo)}>{item.mo != null ? fmtPct(item.mo) : "—"}</span>
        <span className={chgColor(item.qtr)}>{item.qtr != null ? fmtPct(item.qtr) : "—"}</span>
      </div>
    </div>
    <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </>
  );
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  return (
    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden w-full">
      <div className={cn("h-full rounded-full", scoreBg(value))}
        style={{ width: `${Math.min((value/max)*100,100)}%` }} />
    </div>
  );
}

// ── Tab: Summary ──────────────────────────────────────────────────────────────

function SummaryTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const score = data.cycle_score ?? 0;
  const isPos = score >= 50;
  const inputs = data.inputs ?? {};
  const inputItems = [
    { label: "DRAM Pricing (25%)", val: inputs.dram_pricing },
    { label: "HBM Demand (25%)",   val: inputs.hbm_demand   },
    { label: "Inventory (20%)",    val: inputs.inventory     },
    { label: "Earnings (10%)",     val: inputs.earnings      },
    { label: "Flows (10%)",        val: inputs.flows         },
    { label: "Sentiment (10%)",    val: inputs.sentiment     },
  ];

  const outlook = data.outlook ?? {};
  const trends = [
    { label: "DRAM",     trend: data.dram_trend },
    { label: "NAND",     trend: data.nand_trend },
    { label: "HBM",      trend: data.hbm_trend  },
    { label: "Inventory",trend: data.inventory_trend },
    { label: "AI Demand",trend: data.ai_demand_trend },
    { label: "Earnings", trend: data.earnings_trend  },
  ];

  return (
    <div className="space-y-4">
      {/* Regime banner */}
      <div className={cn("rounded-2xl border p-5 text-center",
        isPos ? "border-positive/30 bg-positive/5" : "border-negative/30 bg-negative/5")}>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Memory Cycle Regime</div>
        <div className={cn("text-[20px] font-black mb-3", isPos ? "text-positive" : "text-negative")}>
          {data.regime}
        </div>
        <ScoreGauge score={score} label="Memory Cycle Bull Score" />
        <div className="mt-2 text-[12px] text-text-muted font-semibold">{data.bias}</div>
      </div>

      {/* Composite inputs */}
      <div className="rounded-2xl border border-border bg-surface p-4 space-y-2.5">
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-1">Score Components</div>
        {inputItems.map(({ label, val }) => (
          <div key={label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-text-muted">{label}</span>
              <span className={cn("text-[11px] font-bold", scoreColor(val ?? 0))}>{val ?? "—"}</span>
            </div>
            <ScoreBar value={val ?? 0} />
          </div>
        ))}
      </div>

      {/* Market trends */}
      <div className="grid grid-cols-3 gap-2">
        {trends.map(({ label, trend }) => {
          const pos = trend?.toLowerCase().includes("up") || trend?.toLowerCase().includes("accel") || trend?.toLowerCase().includes("extrem") || trend?.toLowerCase().includes("bullish");
          return (
            <div key={label} className="rounded-xl border border-border bg-surface p-2.5 text-center">
              <div className="text-[9px] text-text-muted mb-1">{label}</div>
              <div className={cn("text-[9px] font-bold", pos ? "text-positive" : "text-yellow-400")}>
                {trend}
              </div>
            </div>
          );
        })}
      </div>

      {/* Outlook */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Market Outlook</div>
        <div className="space-y-2">
          {Object.entries(outlook).map(([period, o]: [string, any]) => (
            <div key={period} className={cn("rounded-xl border p-3",
              o.direction === "Up" ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5")}>
              <div className="flex items-start justify-between mb-1">
                <span className="text-[11px] font-bold text-text-primary uppercase">{period.replace("m"," Month").replace("y"," Year")}</span>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[12px] font-bold", chgColor(o.expected_return_pct))}>
                    {fmtPct(o.expected_return_pct)}
                  </span>
                  <span className="text-[10px] text-text-muted">{o.prob_pct}% prob</span>
                </div>
              </div>
              <div className="text-[10px] text-text-muted">{o.scenario}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Pricing ──────────────────────────────────────────────────────────────

function PricingTab({ data }: { data: any }) {
  const [cat, setCat] = useState<"dram"|"hbm"|"nand"|"ssd">("dram");
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const mom = data.momentum ?? {};
  const cats = [
    { id: "dram" as const, label: "DRAM",  score: mom.dram_score },
    { id: "hbm"  as const, label: "HBM",   score: mom.hbm_score  },
    { id: "nand" as const, label: "NAND",  score: mom.nand_score },
    { id: "ssd"  as const, label: "SSD",   score: undefined      },
  ];

  const items: any[] = data[cat] ?? [];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cats.map(({ id, label, score }) => (
          <button key={id} onClick={() => setCat(id)}
            className={cn("flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-all",
              cat === id ? "bg-accent text-white border-accent" : "border-border text-text-muted bg-surface")}>
            {label}{score != null ? ` ${score.toFixed(0)}` : ""}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1 px-2 text-[9px] text-text-muted font-semibold">
        <span className="text-right col-start-3">1W / 1M / 1Q</span>
      </div>

      <div className="rounded-2xl border border-border bg-surface px-4 py-1">
        {items.map((item: any) => <PriceRow key={item.type} item={item} />)}
      </div>

      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Momentum Scores</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:"DRAM",  score: mom.dram_score, mo: mom.dram_mo_avg },
            { label:"NAND",  score: mom.nand_score, mo: mom.nand_mo_avg },
            { label:"HBM",   score: mom.hbm_score,  mo: mom.hbm_mo_avg  },
          ].map(({ label, score, mo }) => (
            <div key={label} className="text-center">
              <div className="text-[9px] text-text-muted">{label}</div>
              <div className={cn("text-[18px] font-black", scoreColor(score ?? 0))}>{score?.toFixed(0) ?? "—"}</div>
              <div className={cn("text-[9px]", chgColor(mo))}>{mo != null ? fmtPct(mo) : "—"} /mo</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: HBM Intelligence ─────────────────────────────────────────────────────

function HbmTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const tight = data.tightness ?? {};
  const supply: Record<string,any> = data.supply ?? {};
  const demand: Record<string,any> = data.demand ?? {};

  const supplyData = Object.entries(supply).map(([k,v]: [string,any]) => ({
    name: k.replace("_"," "), kwpm: v.capacity_kwpm, util: v.util_pct,
    hbm3e: v.hbm3e_share, yoy: v.yoy_growth,
  }));
  const demandData = Object.entries(demand).map(([k,v]: [string,any]) => ({
    name: k.replace("_"," "), share: v.share_pct, growth: v.demand_growth,
  }));

  return (
    <div className="space-y-4">
      {/* Tightness gauge */}
      <div className="rounded-2xl border border-negative/30 bg-negative/5 p-5 text-center">
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">HBM Tightness Score</div>
        <ScoreGauge score={tight.score} label={tight.label} />
        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
          <div className="rounded-lg bg-surface p-2.5">
            <div className="text-text-muted text-[9px]">Supply Growth YoY</div>
            <div className={cn("text-[16px] font-bold", chgColor(tight.supply_growth_yoy))}>{fmt(tight.supply_growth_yoy)}%</div>
          </div>
          <div className="rounded-lg bg-surface p-2.5">
            <div className="text-text-muted text-[9px]">Demand Growth YoY</div>
            <div className={cn("text-[16px] font-bold", chgColor(tight.demand_growth_yoy))}>{fmt(tight.demand_growth_yoy)}%</div>
          </div>
        </div>
        {tight.supply_deficit_pct && (
          <div className="mt-2 text-[11px] text-negative font-semibold">
            Supply Deficit: {tight.supply_deficit_pct}% of demand unmet
          </div>
        )}
      </div>

      {/* HBM Supply */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">HBM Supply by Maker</div>
        <div className="space-y-2">
          {supplyData.map(s => (
            <div key={s.name} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-[12px] font-bold">{s.name}</div>
                  <div className="text-[10px] text-text-muted">{s.kwpm}K wafers/mo · {s.hbm3e}% HBM3E</div>
                </div>
                <div className="text-right">
                  <div className={cn("text-[13px] font-bold", chgColor(s.yoy))}>{fmt(s.yoy)}% YoY</div>
                  <div className="text-[10px] text-text-muted">{s.util}% util</div>
                </div>
              </div>
              <ScoreBar value={s.util} />
              <div className="text-[9px] text-text-muted mt-1">{supply[s.name.replace(" ","_")]?.note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* HBM Demand */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">HBM Demand by Customer</div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={demandData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#666" }} />
              <YAxis tick={{ fontSize: 9, fill: "#666" }} tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ background:"#1a1a2e",border:"1px solid #333",borderRadius:8,fontSize:11 }}
                formatter={(v: number) => [`${v}%`, "Share"]} />
              <Bar dataKey="share" fill="#6366f1" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2 mt-2">
          {Object.entries(demand).map(([k,v]: [string,any]) => (
            <div key={k} className="flex items-center justify-between py-1.5 border-b border-surface-2 last:border-0">
              <div>
                <div className="text-[11px] font-semibold">{k.replace("_"," ")}</div>
                <div className="text-[9px] text-text-muted">{v.product}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-semibold">{v.share_pct}%</div>
                <div className={cn("text-[10px]", chgColor(v.demand_growth))}>{fmt(v.demand_growth)}% demand</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Key risk/opp */}
      <div className="grid grid-cols-1 gap-2">
        <div className="rounded-xl border border-negative/20 bg-negative/5 p-3 text-[10px]">
          <div className="text-negative font-semibold mb-1">Key Risk</div>
          <div className="text-text-muted">{tight.key_risk}</div>
        </div>
        <div className="rounded-xl border border-positive/20 bg-positive/5 p-3 text-[10px]">
          <div className="text-positive font-semibold mb-1">Key Opportunity</div>
          <div className="text-text-muted">{tight.key_opp}</div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: AI Infrastructure ────────────────────────────────────────────────────

function AiInfraTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const hyperscalers: any[] = data.hyperscalers ?? [];
  const fcst = data.forecast ?? {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="AI Demand Index"     value={`${data.ai_demand_index}/100`} sub={data.ai_demand_label} color={scoreColor(data.ai_demand_index ?? 0)} />
        <Stat label="GPU Orders 2026"     value={`${data.gpu_orders_mn}M`} sub="Units ordered" />
        <Stat label="DC Spend"            value={`$${data.datacenter_spend_bn}B`} sub="2026 global" />
        <Stat label="HBM/AI Server"       value={`${data.hbm_content_per_ai_server_gb}GB`} sub="avg per unit" color="text-accent" />
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Hyperscaler Capex 2026</div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hyperscalers} layout="vertical" margin={{ left: 60, right: 30 }}>
              <XAxis type="number" tick={{ fontSize: 9, fill: "#666" }} tickFormatter={v => `$${v}B`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#aaa" }} width={55} />
              <Tooltip
                contentStyle={{ background:"#1a1a2e",border:"1px solid #333",borderRadius:8,fontSize:11 }}
                formatter={(v: number) => [`$${v}B`, "Capex"]} />
              <Bar dataKey="capex_bn_2026" radius={[0,4,4,0]}>
                {hyperscalers.map((_:any,i:number) => (
                  <Cell key={i} fill={["#6366f1","#3b82f6","#10b981","#f59e0b","#ef4444"][i%5]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2 mt-2">
          {hyperscalers.map((h: any) => (
            <div key={h.name} className="flex items-center gap-3 py-1.5 border-b border-surface-2 last:border-0">
              <span className="text-[11px] text-text-primary font-semibold w-20">{h.name}</span>
              <span className="text-[11px] font-bold">${h.capex_bn_2026}B</span>
              <span className={cn("text-[10px]", chgColor(h.yoy))}>{fmt(h.yoy)}% YoY</span>
              <span className="text-[9px] text-text-muted ml-auto">AI: {h.ai_pct}%</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">HBM Demand Forecast (Exaflops equiv)</div>
        <div className="space-y-2">
          {Object.entries(fcst).map(([q, d]: [string,any]) => (
            <div key={q} className="rounded-xl border border-border bg-surface px-3 py-2.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold">{q.replace("_"," ").toUpperCase()}</div>
                <div className="text-[10px] text-text-muted">{d.note}</div>
              </div>
              <div className="text-[14px] font-bold text-accent">{d.hbm_demand_exa}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Inventory ────────────────────────────────────────────────────────────

function InventoryTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const companies = ["Samsung","SK_Hynix","Micron"];
  const colors = ["#6366f1","#10b981","#f59e0b"];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Inventory Stage"  value={data.cycle_stage} color="text-accent" />
        <Stat label="Inventory Score"  value={`${data.cycle_score}/100`} color={scoreColor(data.cycle_score)} />
        <Stat label="DRAM Peak (2023)" value={`${data.peak_dram_inv_weeks}w`} sub="Weeks of supply" color="text-negative" />
        <Stat label="NAND Peak (2023)" value={`${data.peak_nand_inv_weeks}w`} sub="Weeks of supply" color="text-negative" />
      </div>

      {companies.map((co, i) => {
        const d = data[co] ?? {};
        return (
          <div key={co} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="text-[13px] font-bold">{co.replace("_"," ")}</div>
              <div className={cn("text-[12px] font-semibold", scoreColor(d.overall_score ?? 0))}>
                Score {d.overall_score}/100
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div className="rounded-lg bg-surface-2 p-2.5">
                <div className="text-[9px] text-text-muted mb-1">DRAM Inventory</div>
                <div className="font-bold text-[16px]">{d.dram_weeks}w</div>
                <div className={cn("text-[10px]", chgColor(d.dram_trend))}>{fmt(d.dram_trend)}w QoQ</div>
                <div className="text-[9px] text-text-muted mt-1">{d.dram_status}</div>
                <div className="mt-1 h-1 bg-surface rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${Math.min((d.dram_weeks/20)*100,100)}%`, backgroundColor: colors[i] }} />
                </div>
              </div>
              <div className="rounded-lg bg-surface-2 p-2.5">
                <div className="text-[9px] text-text-muted mb-1">NAND Inventory</div>
                <div className="font-bold text-[16px]">{d.nand_weeks}w</div>
                <div className={cn("text-[10px]", chgColor(d.nand_trend))}>{fmt(d.nand_trend)}w QoQ</div>
                <div className="text-[9px] text-text-muted mt-1">{d.nand_status}</div>
                <div className="mt-1 h-1 bg-surface rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${Math.min((d.nand_weeks/25)*100,100)}%`, backgroundColor: colors[i] }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab: Capacity ─────────────────────────────────────────────────────────────

function CapacityTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const producers: any[] = data.producers ?? [];
  const dram = producers.filter((p:any) => p.segment === "DRAM");
  const nand = producers.filter((p:any) => p.segment === "NAND");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Supply Score"      value={`${data.supply_growth_score}/100`} color={scoreColor(data.supply_growth_score)} />
        <Stat label="DRAM Bit Growth"   value={fmtPct(data.dram_bit_growth_yoy)} color={chgColor(data.dram_bit_growth_yoy)} />
        <Stat label="NAND Bit Growth"   value={fmtPct(data.nand_bit_growth_yoy)} color={chgColor(data.nand_bit_growth_yoy)} />
      </div>

      {[{ label:"DRAM", list: dram }, { label:"NAND", list: nand }].map(({ label, list }) => (
        <div key={label}>
          <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">{label} Capacity</div>
          <div className="space-y-2">
            {list.map((p: any, i: number) => (
              <div key={i} className={cn("rounded-xl border p-3",
                p.cuts_active ? "border-negative/20 bg-negative/5" : "border-border bg-surface")}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-[12px] font-semibold">{p.name}</div>
                    <div className="text-[9px] text-text-muted">{p.expansion_note}</div>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-[12px] font-bold", scoreColor(p.util_pct))}>{p.util_pct}%</div>
                    <div className="text-[9px] text-text-muted">{p.kwpm}K wpm</div>
                  </div>
                </div>
                <ScoreBar value={p.util_pct} />
                {p.cuts_active && (
                  <div className="text-[9px] text-negative mt-1 font-semibold">⚡ Production cuts active</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="text-[10px] text-text-muted rounded-xl border border-accent/20 bg-accent/5 p-3">
        {data.note}
      </div>
    </div>
  );
}

// ── Tab: Companies ────────────────────────────────────────────────────────────

function CompaniesTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const cos: [string,any][] = Object.entries(data.companies ?? {});

  return (
    <div className="space-y-3">
      {cos.map(([ticker, co]) => (
        <div key={ticker} className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-[14px] font-black text-text-primary">{ticker}</div>
              <div className="text-[10px] text-text-muted">{co.name} · {co.country} · {co.segment}</div>
            </div>
            <div className="text-right">
              {co.price && <div className="text-[16px] font-bold">${co.price?.toLocaleString()}</div>}
              {co.chg_1d != null && (
                <div className={cn("text-[11px] font-semibold", chgColor(co.chg_1d))}>{fmtPct(co.chg_1d)}</div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <div className="rounded-lg bg-surface-2 p-2">
              <div className="text-text-muted">Rev</div>
              <div className="font-bold">${co.revenue_bn}B</div>
              <div className={cn(chgColor(co.rev_yoy))}>{fmtPct(co.rev_yoy)}</div>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <div className="text-text-muted">GM%</div>
              <div className="font-bold">{co.gm_pct}%</div>
              <div className="text-text-muted text-[9px]">OM: {co.om_pct}%</div>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <div className="text-text-muted">EPS</div>
              <div className="font-bold">${co.eps}</div>
              <div className={cn(chgColor(co.eps_yoy))}>{fmtPct(co.eps_yoy)}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2 text-center text-[10px]">
            <div><span className="text-text-muted">P/E </span><span className="font-semibold">{co.pe_fwd}x</span></div>
            <div><span className="text-text-muted">P/S </span><span className="font-semibold">{co.ps_ratio}x</span></div>
            <div><span className="text-text-muted">DIO </span><span className="font-semibold">{co.dio}d</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Earnings ─────────────────────────────────────────────────────────────

function EarningsTab({ data }: { data: any }) {
  const [co, setCo] = useState("MU");
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const companies = Object.keys(data.earnings ?? {});
  const earn = data.earnings?.[co];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {companies.map(c => (
          <button key={c} onClick={() => setCo(c)}
            className={cn("px-3 py-1.5 rounded-full text-[10px] font-semibold border shrink-0 transition-colors",
              co === c ? "bg-accent text-white border-accent" : "border-border text-text-muted bg-surface")}>
            {c.replace("_"," ")}
          </button>
        ))}
      </div>

      {earn && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Rev Revisions"  value={fmtPct(earn.rev_revisions)}  color={chgColor(earn.rev_revisions)} />
            <Stat label="EPS Revisions"  value={fmtPct(earn.eps_revisions)}  color={chgColor(earn.eps_revisions)} />
            <Stat label="Momentum"       value={`${earn.momentum_score}/100`} color={scoreColor(earn.momentum_score)} />
          </div>

          {earn.guidance && (
            <div className="rounded-xl border border-positive/20 bg-positive/5 p-3 text-[10px] text-positive">
              📊 {earn.guidance}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="grid grid-cols-5 px-4 py-2 text-[9px] text-text-muted font-semibold border-b border-surface-2">
              <span>Quarter</span><span className="text-right">Rev</span><span className="text-right">EPS</span><span className="text-right">GM%</span><span className="text-right">Beat</span>
            </div>
            {earn.quarters?.map((q: any) => (
              <div key={q.q} className="grid grid-cols-5 px-4 py-2.5 text-[10px] border-b border-surface-2 last:border-0">
                <span className="font-semibold text-text-primary">{q.q}</span>
                <span className="text-right">${q.rev_bn}B</span>
                <span className="text-right">${q.eps}</span>
                <span className="text-right">{q.gm_pct}%</span>
                <span className={cn("text-right text-[9px]", q.beat?.includes("miss") ? "text-negative" : "text-positive")}>
                  {q.beat?.includes("miss") ? "Miss" : "Beat"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: China ────────────────────────────────────────────────────────────────

function ChinaTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="China Demand Score" value={`${data.demand_score}/100`} color={scoreColor(data.demand_score)} />
        <Stat label="DC Spend"           value={`$${data.datacenter_spend_bn}B`} sub={fmtPct(data.dc_yoy) + " YoY"} color={chgColor(data.dc_yoy)} />
        <Stat label="Smartphone Sales"   value={`${data.smartphone_sales_mn}M`} sub={fmtPct(data.smartphone_yoy)} color={chgColor(data.smartphone_yoy)} />
        <Stat label="Server Shipments"   value={`${data.server_shipments_k}K`} sub={fmtPct(data.server_yoy)} color={chgColor(data.server_yoy)} />
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">China Memory Demand</div>
        <div className="space-y-2">
          {[
            { label:"DRAM Imports", value:`$${data.dram_import_demand_bn}B`, trend:"Stable" },
            { label:"NAND Imports", value:`$${data.nand_import_demand_bn}B`, trend:"Declining (YMTC ramp)" },
            { label:"BAT Capex",   value:`$${data.baidu_alibaba_tencent_capex_bn}B`, trend:"Accelerating" },
          ].map(({ label, value, trend }) => (
            <div key={label} className="rounded-xl border border-border bg-surface px-4 py-2.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold">{label}</div>
                <div className="text-[9px] text-text-muted">{trend}</div>
              </div>
              <div className="text-[13px] font-bold">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">China Domestic Production</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-[11px] font-bold">YMTC (NAND)</div>
            <div className="text-[18px] font-black text-accent">{data.ymtc_capacity_kwpm}K</div>
            <div className="text-[10px] text-text-muted">wafers/mo</div>
            <div className={cn("text-[10px]", chgColor(data.ymtc_yoy_growth))}>{fmt(data.ymtc_yoy_growth)}% YoY</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="text-[11px] font-bold">CXMT (DRAM)</div>
            <div className="text-[18px] font-black text-accent">{data.cxmt_capacity_kwpm}K</div>
            <div className="text-[10px] text-text-muted">wafers/mo</div>
            <div className={cn("text-[10px]", chgColor(data.cxmt_yoy_growth))}>{fmt(data.cxmt_yoy_growth)}% YoY</div>
          </div>
        </div>
      </div>

      <div className="space-y-2 text-[10px]">
        <div className="rounded-xl border border-negative/20 bg-negative/5 p-3">
          <div className="text-negative font-semibold mb-1">Risk</div>
          <div className="text-text-muted">{data.risk}</div>
        </div>
        <div className="rounded-xl border border-positive/20 bg-positive/5 p-3">
          <div className="text-positive font-semibold mb-1">Opportunity</div>
          <div className="text-text-muted">{data.opportunity}</div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Supply Chain ─────────────────────────────────────────────────────────

function SupplyChainTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const equip: any[] = data.equipment ?? [];
  const mats: any[] = data.materials ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="SC Strength Score"  value={`${data.supply_chain_score}/100`} color={scoreColor(data.supply_chain_score)} />
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Equipment Suppliers</div>
        <div className="space-y-2">
          {equip.map((e: any) => (
            <div key={e.ticker} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold">{e.ticker}</span>
                    <span className="text-[10px] text-text-muted">{e.name}</span>
                  </div>
                  <div className="text-[10px] text-text-muted">{e.role}</div>
                </div>
                <div className="text-right">
                  <div className={cn("text-[12px] font-bold", scoreColor(e.score))}>{e.score}/100</div>
                  <div className="text-[9px] text-text-muted">Mem: {e.memory_exposure_pct}%</div>
                </div>
              </div>
              <div className="flex gap-3 text-[9px] text-text-muted">
                <span>Backlog: ${e.order_book_bn}B</span>
                <span>Lead: {e.lead_time_wk}wk</span>
              </div>
              <ScoreBar value={e.score} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Critical Materials</div>
        <div className="space-y-2">
          {mats.map((m: any) => (
            <div key={m.name} className="rounded-xl border border-border bg-surface px-4 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <div className="text-[11px] font-semibold">{m.name}</div>
                  <div className="text-[9px] text-text-muted">{m.supplier}</div>
                </div>
                <div className="text-right">
                  <div className={cn("text-[11px] font-semibold", m.tightness >= 80 ? "text-negative" : scoreColor(m.tightness))}>
                    {m.tightness}/100
                  </div>
                  <div className={cn("text-[9px]", chgColor(m.yoy_price))}>{fmt(m.yoy_price)}% YoY</div>
                </div>
              </div>
              <ScoreBar value={m.tightness} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-negative/20 bg-negative/5 p-3 text-[10px]">
        <div className="text-negative font-semibold mb-1">Critical Bottleneck</div>
        <div className="text-text-muted">{data.bottleneck}</div>
      </div>
    </div>
  );
}

// ── Tab: Institutional Flows ──────────────────────────────────────────────────

function FlowsTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const etfs: any[] = data.etf_flows ?? [];
  const insiders: any[] = data.insider_transactions ?? [];
  const hfOwn: Record<string,any> = data.hedge_fund_ownership ?? {};
  const opts: Record<string,any> = data.options_flow ?? {};
  const dark: Record<string,any> = data.dark_pool ?? {};

  return (
    <div className="space-y-4">
      <Stat label="Smart Money Score" value={`${data.smart_money_score}/100`} color={scoreColor(data.smart_money_score)} />

      {/* HF Ownership */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Hedge Fund Ownership</div>
        <div className="space-y-2">
          {Object.entries(hfOwn).map(([t,v]: [string,any]) => (
            <div key={t} className="rounded-xl border border-border bg-surface px-4 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-bold">{t}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold">HF: {v.hf_pct}%</span>
                  <span className={cn("text-[10px]", chgColor(v.chg_qoq))}>{fmt(v.chg_qoq)}% QoQ</span>
                </div>
              </div>
              <div className="text-[9px] text-text-muted">{v.top_holders?.join(" · ")}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ETF Flows */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Semiconductor ETF Flows</div>
        {etfs.map((e: any) => (
          <div key={e.etf} className="rounded-xl border border-border bg-surface px-4 py-2.5 mb-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12px] font-bold">{e.etf}</div>
                <div className="text-[9px] text-text-muted">{e.name} · AUM ${e.aum_bn}B</div>
              </div>
              <div className="text-right">
                <div className={cn("text-[12px] font-bold", chgColor(e.flow_1mo_mn))}>
                  {e.flow_1mo_mn >= 0 ? "+" : ""}${Math.abs(e.flow_1mo_mn)}M
                </div>
                <div className="text-[9px] text-text-muted">YTD: {fmtPct(e.flow_ytd_bn ? e.flow_ytd_bn * 1000 : 0)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Options */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Options Flow</div>
        {Object.entries(opts).map(([t,o]: [string,any]) => (
          <div key={t} className="rounded-xl border border-border bg-surface px-4 py-2.5 mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-bold">{t}</span>
              <span className={cn("text-[10px]", o.bullish_sweep_pct >= 60 ? "text-positive" : "text-text-muted")}>
                {o.bullish_sweep_pct}% bullish sweeps
              </span>
            </div>
            <div className="flex gap-3 text-[10px] text-text-muted">
              <span>P/C: {o.pcr}</span>
              <span>Unusual calls: ${o.unusual_calls_mn}M</span>
              <span>IV: {o.bullish_sweep_pct}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Insider */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Insider Transactions</div>
        <div className="space-y-2">
          {insiders.map((t: any, i: number) => (
            <div key={i} className={cn("rounded-xl border p-3",
              t.type === "Buy" ? "border-positive/20 bg-positive/5" : "border-border bg-surface")}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold">{t.company}</span>
                    <span className={cn("text-[10px] font-semibold", t.type === "Buy" ? "text-positive" : "text-negative")}>
                      {t.type}
                    </span>
                  </div>
                  <div className="text-[9px] text-text-muted">{t.insider} · {t.date}</div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-bold">${t.value_mn}M</div>
                  <div className="text-[9px] text-text-muted">{t.signal}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Technicals ───────────────────────────────────────────────────────────

function TechnicalsTab({ data }: { data: any }) {
  const [sel, setSel] = useState("MU");
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const stocks: Record<string,any> = data.stocks ?? {};
  const tickers = Object.keys(stocks);
  const s = stocks[sel] ?? {};

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tickers.map(t => (
          <button key={t} onClick={() => setSel(t)}
            className={cn("px-3 py-1.5 rounded-full text-[10px] font-semibold border shrink-0 transition-colors",
              sel === t ? "bg-accent text-white border-accent" : "border-border text-text-muted bg-surface")}>
            {t}
          </button>
        ))}
      </div>

      {Object.keys(s).length > 0 ? (
        <>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[24px] font-black">${s.price?.toLocaleString()}</div>
                <div className={cn("text-[12px] font-semibold", chgColor(s.chg_1d))}>
                  {fmtPct(s.chg_1d)} today
                </div>
              </div>
              <div className="text-right">
                <div className={cn("text-[28px] font-black", scoreColor(s.tech_score))}>{s.tech_score}</div>
                <div className="text-[10px] text-text-muted">Tech Score</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="text-center"><div className="text-text-muted">1M</div><div className={cn("font-bold", chgColor(s.chg_1m))}>{fmtPct(s.chg_1m)}</div></div>
              <div className="text-center"><div className="text-text-muted">3M</div><div className={cn("font-bold", chgColor(s.chg_3m))}>{fmtPct(s.chg_3m)}</div></div>
              <div className="text-center"><div className="text-text-muted">RSI</div><div className={cn("font-bold", s.rsi > 70 ? "text-negative" : s.rsi < 30 ? "text-positive" : "text-accent")}>{s.rsi?.toFixed(1)}</div></div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 space-y-2">
            <div className="text-[10px] text-text-muted uppercase tracking-widest">Moving Averages</div>
            {[
              { label:"EMA 20",  val: s.ema20  },
              { label:"EMA 50",  val: s.ema50  },
              { label:"EMA 200", val: s.ema200 },
            ].map(({ label, val }) => {
              if (!val) return null;
              const above = s.price > val;
              return (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-surface-2 last:border-0">
                  <span className="text-[11px] text-text-muted">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold">${val?.toLocaleString()}</span>
                    <span className={cn("text-[9px] font-bold", above ? "text-positive" : "text-negative")}>
                      {above ? "Above ↑" : "Below ↓"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-[10px] text-text-muted uppercase tracking-widest mb-3">Indicators</div>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div className="rounded-lg bg-surface-2 p-2.5">
                <div className="text-[9px] text-text-muted mb-1">MACD</div>
                <div className={cn("font-bold", chgColor(s.macd_hist))}>{s.macd?.toFixed(2)}</div>
                <div className="text-[9px] text-text-muted">Signal: {s.macd_signal?.toFixed(2)}</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-2.5">
                <div className="text-[9px] text-text-muted mb-1">ADX</div>
                <div className={cn("font-bold", s.adx > 25 ? "text-positive" : "text-text-muted")}>{s.adx?.toFixed(1)}</div>
                <div className="text-[9px] text-text-muted">{s.adx > 25 ? "Trending" : "Ranging"}</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-2.5">
                <div className="text-[9px] text-text-muted mb-1">BB Upper</div>
                <div className="font-bold">${s.bb_upper?.toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-surface-2 p-2.5">
                <div className="text-[9px] text-text-muted mb-1">BB Lower</div>
                <div className="font-bold">${s.bb_lower?.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center text-text-muted text-sm py-8">Technical data unavailable</div>
      )}
    </div>
  );
}

// ── Tab: Quant Models ─────────────────────────────────────────────────────────

function QuantTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const cm = data.cycle_model ?? {};
  const dram = data.dram_forecast ?? {};
  const nand = data.nand_forecast ?? {};
  const hbmRev = data.hbm_revenue ?? {};

  const dramData = Object.entries(dram.forecasts ?? {}).map(([k,v]: [string,any]) => ({
    period: k.replace("m"," mo").replace("y"," yr"),
    price: v.price, low: v.ci_low, high: v.ci_high, conf: v.confidence
  }));

  return (
    <div className="space-y-4">
      {/* Cycle model */}
      <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Memory Cycle Model</div>
        <div className="text-[16px] font-bold text-accent mb-3">{cm.phase}</div>
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          {[
            { label:"Expansion", prob: cm.prob_expansion },
            { label:"Peak",      prob: cm.prob_peak       },
            { label:"Correction",prob: cm.prob_correction },
          ].map(({ label, prob }) => (
            <div key={label} className="rounded-lg bg-surface p-2">
              <div className="text-[9px] text-text-muted">{label}</div>
              <div className="text-[14px] font-bold">{((prob ?? 0)*100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-text-muted">Model confidence: {cm.confidence}%</div>
      </div>

      {/* DRAM forecast */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">
          DRAM Price Forecast (DDR4 8GB) — {dram.accuracy_backtest}% backtest accuracy
        </div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={[{period:"Now",price:dram.current,low:dram.current,high:dram.current},...dramData]}
              margin={{ top:4, right:4, bottom:4, left:-10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="period" tick={{ fontSize:9, fill:"#666" }} />
              <YAxis tick={{ fontSize:9, fill:"#666" }} tickFormatter={v => `$${v}`} domain={["auto","auto"]} />
              <Tooltip contentStyle={{ background:"#1a1a2e",border:"1px solid #333",borderRadius:8,fontSize:11 }}
                formatter={(v:number) => [`$${v.toFixed(2)}`, ""]} />
              <Area type="monotone" dataKey="high" stroke="none" fill="#22c55e20" />
              <Area type="monotone" dataKey="low"  stroke="none" fill="#ffffffff" />
              <Line type="monotone" dataKey="price" stroke="#22c55e" strokeWidth={2} dot={{ r:3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1.5 mt-2">
          {dramData.map((d: any) => (
            <div key={d.period} className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-surface border border-border">
              <span className="text-[10px] font-semibold w-12">{d.period}</span>
              <span className="text-[12px] font-bold text-positive">${d.price.toFixed(2)}</span>
              <span className="text-[9px] text-text-muted">CI: ${d.low.toFixed(2)}-${d.high.toFixed(2)}</span>
              <span className="text-[9px] text-text-muted ml-auto">{d.conf}% conf</span>
            </div>
          ))}
        </div>
      </div>

      {/* HBM Revenue */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">HBM Revenue Estimates ($B)</div>
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="grid grid-cols-4 px-4 py-2 text-[9px] text-text-muted font-semibold border-b border-surface-2">
            <span>Company</span><span className="text-right">2025A</span><span className="text-right">2026E</span><span className="text-right">2027E</span>
          </div>
          {[
            { name:"SK Hynix",key:"SK_Hynix" },
            { name:"Samsung", key:"Samsung"  },
            { name:"Micron",  key:"Micron"   },
          ].map(({ name, key }) => (
            <div key={key} className="grid grid-cols-4 px-4 py-2.5 text-[11px] border-b border-surface-2 last:border-0">
              <span className="font-semibold">{name}</span>
              <span className="text-right text-text-muted">${hbmRev["2025_actual"]?.[key]}</span>
              <span className="text-right text-positive font-semibold">${hbmRev["2026_est"]?.[key]}</span>
              <span className="text-right text-accent font-semibold">${hbmRev["2027_est"]?.[key]}</span>
            </div>
          ))}
          <div className="grid grid-cols-4 px-4 py-2.5 text-[11px] bg-surface-2">
            <span className="font-bold">Total HBM</span>
            <span className="text-right text-text-muted">${hbmRev.total_2026 ? (hbmRev.total_2026 * 0.65).toFixed(1) : "—"}</span>
            <span className="text-right text-positive font-bold">${hbmRev.total_2026}</span>
            <span className="text-right text-accent font-bold">${hbmRev.total_2027}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Relative Value ───────────────────────────────────────────────────────

function RelativeTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const ranking: any[] = data.ranking ?? [];
  const pairs: any[] = data.pairs ?? [];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Best Opportunity Ranking</div>
        <div className="space-y-2">
          {ranking.map((r: any) => (
            <div key={r.rank} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0",
                r.rank === 1 ? "bg-positive/20 text-positive" :
                r.rank === 2 ? "bg-accent/20 text-accent" :
                "bg-surface-2 text-text-muted")}>
                {r.rank}
              </div>
              <div>
                <div className="text-[12px] font-bold">{r.ticker}</div>
                <div className="text-[10px] text-text-muted">{r.reason}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Pair Comparisons</div>
        <div className="space-y-3">
          {pairs.map((p: any, i: number) => (
            <div key={i} className="rounded-2xl border border-border bg-surface p-4">
              <div className="text-[12px] font-bold mb-2">{p.pair}</div>
              <div className="grid grid-cols-3 gap-1 text-[10px] text-center mb-2">
                <div className="font-semibold text-text-muted">Metric</div>
                <div className="font-semibold text-accent">A</div>
                <div className="font-semibold text-positive">B</div>
                {[
                  { label:"P/E Fwd",  a: p.mu_metric?.pe_fwd, b: p.peer_metric?.pe_fwd, unit:"x" },
                  { label:"Rev Gr",   a: p.mu_metric?.rev_growth, b: p.peer_metric?.rev_growth, unit:"%" },
                  { label:"GM%",      a: p.mu_metric?.gm, b: p.peer_metric?.gm, unit:"%" },
                ].map(({ label, a, b, unit }) => (
                  <>
                    <div key={label+"l"} className="text-text-muted py-0.5">{label}</div>
                    <div key={label+"a"} className="py-0.5">{a}{unit}</div>
                    <div key={label+"b"} className="py-0.5">{b}{unit}</div>
                  </>
                ))}
              </div>
              <div className="flex gap-2 text-[10px] mb-2">
                {[{label:"1M",v:p.rel_perf_1m},{label:"3M",v:p.rel_perf_3m},{label:"YTD",v:p.rel_perf_ytd}].map(({label,v})=>(
                  <span key={label} className={cn("rounded px-1.5 py-0.5 border text-[9px] font-semibold",
                    v >= 0 ? "border-positive/20 text-positive" : "border-negative/20 text-negative")}>
                    {label}: {fmt(v)}%
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-text-muted">{p.verdict}</div>
              <div className="text-[10px] text-accent mt-1">{p.opportunity}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Sentiment ────────────────────────────────────────────────────────────

function SentimentTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const sources: any[] = data.sources ?? [];

  return (
    <div className="space-y-4">
      <div className={cn("rounded-2xl border p-5 text-center",
        data.overall_score >= 60 ? "border-positive/30 bg-positive/5" : "border-border bg-surface")}>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Memory Sentiment Index</div>
        <ScoreGauge score={data.overall_score} label={data.label} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="DRAM"     value={`${data.dram_sentiment}`}     color={scoreColor(data.dram_sentiment)} />
        <Stat label="NAND"     value={`${data.nand_sentiment}`}     color={scoreColor(data.nand_sentiment)} />
        <Stat label="HBM"      value={`${data.hbm_sentiment}`}      color={scoreColor(data.hbm_sentiment)} />
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Sentiment Sources</div>
        <div className="space-y-2">
          {sources.map((s: any) => (
            <div key={s.source} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="text-[11px] font-semibold">{s.source}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">{s.summary}</div>
                </div>
                <div className={cn("text-[10px] font-bold ml-3 shrink-0",
                  s.signal?.includes("Bullish") ? "text-positive" :
                  s.signal?.includes("Bearish") ? "text-negative" : "text-text-muted")}>
                  {s.signal}
                </div>
              </div>
              <div className="flex gap-2">
                {[
                  { label:"Pos", val: s.positive, color:"bg-positive" },
                  { label:"Neu", val: s.neutral,  color:"bg-yellow-400" },
                  { label:"Neg", val: s.negative, color:"bg-negative"  },
                ].map(({ label, val, color }) => (
                  <div key={label} className="flex-1">
                    <div className="text-[8px] text-text-muted mb-0.5">{label}</div>
                    <div className="h-1 bg-surface-2 rounded overflow-hidden">
                      <div className={cn("h-full rounded", color)} style={{ width:`${val}%` }} />
                    </div>
                    <div className="text-[8px] text-text-muted mt-0.5">{val}%</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Signals ──────────────────────────────────────────────────────────────

function SignalsTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const signals: any[] = data.signals ?? [];

  return (
    <div className="space-y-3">
      {signals.map((s: any) => (
        <div key={s.ticker} className={cn("rounded-2xl border p-4", signalColor(s.signal))}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[14px] font-black">{s.ticker}</span>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", signalColor(s.signal))}>
                  {s.signal}
                </span>
              </div>
              <div className="text-[10px] opacity-70">{s.name} · {s.timeframe}</div>
            </div>
            <div className="text-right">
              <div className="text-[16px] font-black">{s.upside_pct}%</div>
              <div className="text-[9px] opacity-70">upside · {s.confidence_pct}% conf</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3 text-[10px]">
            <div className="rounded-lg bg-background/20 p-2 text-center">
              <div className="opacity-70 mb-0.5">Entry</div>
              <div className="font-bold">{s.entry?.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-background/20 p-2 text-center">
              <div className="opacity-70 mb-0.5">Stop</div>
              <div className="font-bold">{s.stop?.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-background/20 p-2 text-center">
              <div className="opacity-70 mb-0.5">Target</div>
              <div className="font-bold">{s.target?.toLocaleString()}</div>
            </div>
          </div>

          <div className="text-[10px] opacity-80 mb-2">{s.thesis}</div>
          <div className="text-[9px] opacity-60 mb-2">Risk: {s.risk}</div>

          <div className="flex flex-wrap gap-1">
            {s.catalyst?.map((c: string) => (
              <span key={c} className="text-[9px] px-2 py-0.5 rounded-full bg-background/20 opacity-80">
                {c}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id:"summary",     label:"Summary",    icon: Activity  },
  { id:"pricing",     label:"Pricing",    icon: BarChart3 },
  { id:"hbm",         label:"HBM",        icon: Cpu       },
  { id:"ai-infra",    label:"AI Infra",   icon: Zap       },
  { id:"inventory",   label:"Inventory",  icon: Layers    },
  { id:"capacity",    label:"Capacity",   icon: Waves     },
  { id:"companies",   label:"Companies",  icon: Building2 },
  { id:"earnings",    label:"Earnings",   icon: TrendingUp},
  { id:"china",       label:"China",      icon: Globe     },
  { id:"sc",          label:"Supply Chain",icon:Shield    },
  { id:"flows",       label:"Flows",      icon: Eye       },
  { id:"technicals",  label:"Technicals", icon: Activity  },
  { id:"quant",       label:"Quant",      icon: Brain     },
  { id:"relative",    label:"Relative",   icon: Target    },
  { id:"sentiment",   label:"Sentiment",  icon: Waves     },
  { id:"signals",     label:"Signals",    icon: AlertTriangle },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const [tab, setTab] = useState<TabId>("summary");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["memory-intel"],
    queryFn: fetchAll,
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
  });

  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-40 px-4 bg-background/95 backdrop-blur-xl border-b border-border"
        style={{ paddingTop: `calc(env(safe-area-inset-top) + 10px)` }}
      >
        <div className="flex items-center justify-between h-11">
          <div>
            <div className="text-[14px] font-bold text-text-primary">Memory Intelligence</div>
            <div className="text-[9px] text-text-muted">DRAM · NAND · HBM · Supply Chain</div>
          </div>
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-surface-2 text-text-muted active:bg-border transition-colors">
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-2 -mx-4 px-4 mt-1 scrollbar-none">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap shrink-0 transition-all border",
                tab === id ? "bg-accent text-white border-accent" : "text-text-muted border-border bg-surface hover:bg-surface-2"
              )}>
              <Icon size={10} />
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 pt-4 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-text-muted text-xs gap-2">
            <RefreshCw size={13} className="animate-spin" /> Loading memory market data…
          </div>
        ) : (
          <>
            {tab === "summary"    && <SummaryTab      data={data?.overview} />}
            {tab === "pricing"    && <PricingTab      data={data?.pricing} />}
            {tab === "hbm"        && <HbmTab          data={data?.hbm} />}
            {tab === "ai-infra"   && <AiInfraTab      data={data?.aiInfra} />}
            {tab === "inventory"  && <InventoryTab    data={data?.inventory} />}
            {tab === "capacity"   && <CapacityTab     data={data?.capacity} />}
            {tab === "companies"  && <CompaniesTab    data={data?.companies} />}
            {tab === "earnings"   && <EarningsTab     data={data?.earnings} />}
            {tab === "china"      && <ChinaTab        data={data?.china} />}
            {tab === "sc"         && <SupplyChainTab  data={data?.supplyChain} />}
            {tab === "flows"      && <FlowsTab        data={data?.flows} />}
            {tab === "technicals" && <TechnicalsTab   data={data?.technicals} />}
            {tab === "quant"      && <QuantTab        data={data?.quant} />}
            {tab === "relative"   && <RelativeTab     data={data?.relative} />}
            {tab === "sentiment"  && <SentimentTab    data={data?.sentiment} />}
            {tab === "signals"    && <SignalsTab       data={data?.signals} />}
          </>
        )}
      </div>
    </div>
  );
}
