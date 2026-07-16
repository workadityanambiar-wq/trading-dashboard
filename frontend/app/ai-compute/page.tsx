"use client";
import { useMarket } from "@/contexts/MarketContext";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AIComputeData, type AIComputeStock } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Cpu, TrendingUp, Cloud, Database, Factory, Zap, FlaskConical, LayoutDashboard,
  RefreshCw, AlertTriangle, type LucideIcon,
} from "lucide-react";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";
import { PageGuide } from "@/components/PageGuide";
import { TickerChip } from "@/components/TickerChip";

// ── Types & constants ─────────────────────────────────────────────────────────

type Tab = "summary" | "gpu" | "hyperscalers" | "stocks" | "memory" | "supply" | "signals" | "scenarios";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "summary",      label: "PM Summary",     icon: LayoutDashboard },
  { id: "gpu",          label: "GPU / AI Chips",  icon: Cpu },
  { id: "hyperscalers", label: "Hyperscalers",    icon: Cloud },
  { id: "stocks",       label: "AI Stocks",       icon: TrendingUp },
  { id: "memory",       label: "Memory",          icon: Database },
  { id: "supply",       label: "Supply Chain",    icon: Factory },
  { id: "signals",      label: "Signals",         icon: Zap },
  { id: "scenarios",    label: "Scenarios",       icon: FlaskConical },
];

const CAT_COLORS: Record<string, string> = {
  GPU: "#76b900", CPU: "#0071c5", Foundry: "#e87040",
  Networking: "#6366f1", Servers: "#3b82f6", Memory: "#f59e0b",
  Hyperscaler: "#22c55e", Equipment: "#94a3b8",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(v: number): string {
  if (v >= 75) return "#22c55e";
  if (v >= 55) return "#86efac";
  if (v >= 40) return "#f59e0b";
  if (v >= 25) return "#f87171";
  return "#ef4444";
}

function rsiColor(v: number): string {
  if (v > 70) return "#ef4444";
  if (v > 60) return "#f59e0b";
  if (v < 30) return "#22c55e";
  return "#94a3b8";
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function impColor(v: number): string {
  if (v >= 20) return "#22c55e";
  if (v >= 5)  return "#86efac";
  if (v >= -5) return "#94a3b8";
  if (v >= -15) return "#f87171";
  return "#ef4444";
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SignalBadge({ signal, color }: { signal: string; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
      style={{ background: `${color}25`, color }}>
      {signal}
    </span>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = scoreColor(score);
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-text-muted uppercase tracking-wide">{label}</span>
        <span className="text-base font-bold font-mono" style={{ color }}>{score.toFixed(0)}</span>
      </div>
      <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Summary Tab ───────────────────────────────────────────────────────────────

const CAT_LABELS: Record<string, string> = {
  GPU: "GPU Demand", Hyperscaler: "Hyperscaler Capex", Networking: "AI Networking",
  Memory: "Memory Tightness", Foundry: "Foundry Capacity", Servers: "Server Demand",
  CPU: "CPU Demand", Equipment: "Semi Equipment",
};

function SummaryTab({ data }: { data: AIComputeData }) {
  const { score, regime, regime_color, sub_scores, best_longs, key_risks } = data;

  const regimeDesc: Record<string, string> = {
    "AI Supercycle":  "Maximum bullish — full overweight AI infrastructure",
    "AI Boom":        "Strong cycle — overweight GPU, memory, hyperscalers",
    "Expansion":      "Healthy growth — selective overweight AI supply chain",
    "Normalization":  "Moderating — neutral; rotate to defensive semi",
    "Slowdown":       "Caution — underweight; capital preservation mode",
    "Contraction":    "Risk-off — avoid AI capex plays; long defensive",
  };

  return (
    <div className="space-y-5">
      {/* Regime banner */}
      <div className="rounded-xl border p-5" style={{ borderColor: `${regime_color}40`, background: `${regime_color}0d` }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] text-text-muted uppercase tracking-widest mb-1">AI Compute Regime</div>
            <div className="text-3xl font-bold" style={{ color: regime_color }}>{regime}</div>
            <div className="text-xs text-text-muted mt-1">{regimeDesc[regime] ?? ""}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-text-muted mb-1">Composite Score</div>
            <div className="text-6xl font-bold font-mono" style={{ color: regime_color }}>{score.toFixed(0)}</div>
            <div className="text-xs text-text-muted">/100</div>
          </div>
        </div>
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${score}%`, background: `linear-gradient(to right, ${regime_color}60, ${regime_color})` }} />
        </div>
        <div className="flex gap-6 mt-3 text-[10px] text-text-muted">
          {[20,40,60,80].map(v => (
            <span key={v} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: scoreColor(v) }} />
              {v}: {v < 20 ? "Bearish" : v < 40 ? "Weak" : v < 60 ? "Neutral" : v < 80 ? "Bullish" : "Supercycle"}
            </span>
          ))}
        </div>
      </div>

      {/* Sub-scores */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Factor Breakdown</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(sub_scores).map(([cat, score]) => (
            <ScoreBar key={cat} label={CAT_LABELS[cat] ?? cat} score={score} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Best longs */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-sm font-medium mb-3">Best Long Ideas</div>
          <div className="space-y-0">
            {best_longs.map(s => (
              <div key={s.ticker} className="flex items-center gap-3 py-2 border-b border-surface-2 last:border-0">
                <TickerChip ticker={s.ticker} showDetail={false} className="text-xs font-mono font-bold text-text-primary w-12" />
                <span className="text-xs text-text-muted flex-1 truncate">{s.name}</span>
                <span className="text-[10px] text-text-muted font-mono">{pct(s.m3)}</span>
                <span className="text-[10px] font-mono" style={{ color: rsiColor(s.rsi) }}>RSI {s.rsi.toFixed(0)}</span>
                <SignalBadge signal={s.signal} color={s.sig_color} />
              </div>
            ))}
          </div>
        </div>

        {/* Key risks */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={13} className="text-amber-400" />
            <span className="text-sm font-medium">Key Risks</span>
          </div>
          <div className="space-y-2">
            {key_risks.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-text-muted">
                <span className="text-amber-500 shrink-0 mt-0.5 font-bold">{i + 1}.</span>
                <span className="leading-relaxed">{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── GPU Tab ───────────────────────────────────────────────────────────────────

function GPUTab({ data }: { data: AIComputeData }) {
  const demandColor: Record<string, string> = {
    "Very Strong": "#22c55e", "Constrained": "#22c55e", "Strong": "#86efac",
    "Growing": "#6366f1", "Moderate": "#f59e0b", "Weak": "#ef4444", "Future": "#94a3b8",
  };
  const statusColor: Record<string, string> = {
    Production: "#22c55e", Ramping: "#f59e0b", Announced: "#6366f1",
    "Dev/Sample": "#6366f1", Sampling: "#8b5cf6",
  };

  return (
    <div className="space-y-5">
      {Object.entries(data.gpu_products).map(([ticker, info]) => (
        <div key={ticker} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1.5 h-10 rounded-full shrink-0" style={{ background: info.color }} />
            <div className="flex-1">
              <div className="text-base font-bold" style={{ color: info.color }}>{info.name}</div>
              <div className="flex flex-wrap gap-4 text-[10px] text-text-muted mt-1">
                <span>GPU Demand Score:
                  <span className="ml-1 font-mono font-bold" style={{ color: scoreColor(info.gpu_score) }}>
                    {info.gpu_score}/100
                  </span>
                </span>
                <span>Supply Tightness:
                  <span className="ml-1 font-mono font-bold" style={{ color: scoreColor(info.supply_tightness) }}>
                    {info.supply_tightness}/100
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  {["Product","Status","ASP ($K)","Lead (Wk)","Demand","Note"].map(h => (
                    <th key={h} className={cn("pb-2 font-medium", h === "Product" || h === "Note" ? "text-left" : h === "ASP ($K)" || h === "Lead (Wk)" ? "text-right" : "text-center")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {info.products.map(p => (
                  <tr key={p.name} className="border-b border-surface-2 last:border-0 hover:bg-surface-2/30">
                    <td className="py-2 font-mono font-semibold text-text-primary">{p.name}</td>
                    <td className="py-2 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                        style={{ background: `${statusColor[p.status] ?? "#94a3b8"}20`, color: statusColor[p.status] ?? "#94a3b8" }}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono">{p.asp_k ? `$${p.asp_k}K` : "—"}</td>
                    <td className="py-2 text-right font-mono">{p.lead_wk ?? "TBD"}</td>
                    <td className="py-2 text-center font-medium" style={{ color: demandColor[p.demand] ?? "#94a3b8" }}>
                      {p.demand}
                    </td>
                    <td className="py-2 pl-3 text-text-muted text-[10px] max-w-[220px]">{p.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* GPU market share context */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="text-sm font-medium mb-3">AI Accelerator Market Share (2025E)</div>
        <div className="space-y-3">
          {[
            { name: "NVIDIA", share: 82, color: "#76b900", note: "CUDA moat + NVLink ecosystem lock-in" },
            { name: "AMD",    share: 11, color: "#ed1c24", note: "MI300X gaining traction; CDNA 4 ramping" },
            { name: "Custom ASIC (Google, Amazon, Meta)", share: 5, color: "#6366f1", note: "TPUv5, Trainium2, MTIA — growing fast" },
            { name: "Intel Gaudi + Others", share: 2, color: "#94a3b8", note: "Minimal share; ecosystem challenge" },
          ].map(s => (
            <div key={s.name}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium" style={{ color: s.color }}>{s.name}</span>
                <span className="font-mono font-bold" style={{ color: s.color }}>{s.share}%</span>
              </div>
              <div className="h-2 bg-surface-2 rounded-full overflow-hidden mb-0.5">
                <div className="h-full rounded-full" style={{ width: `${s.share}%`, background: s.color }} />
              </div>
              <div className="text-[9px] text-text-muted">{s.note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Hyperscalers Tab ──────────────────────────────────────────────────────────

function HyperscalersTab({ data }: { data: AIComputeData }) {
  const capexMap = data.hyperscaler_capex;
  const allQ = capexMap["MSFT"]?.quarters ?? [];
  const keys = Object.keys(capexMap) as string[];

  const chartData = allQ.map((q, i) => {
    const row: Record<string, string | number> = { q };
    for (const k of keys) row[k] = capexMap[k]?.capex[i] ?? 0;
    return row;
  });

  const COLORS: Record<string, string> = {
    MSFT: "#0078d4", AMZN: "#ff9900", GOOGL: "#4285f4", META: "#0668e1", ORCL: "#c74634",
  };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {Object.entries(capexMap).map(([ticker, co]) => {
          const latest = co.capex[co.capex.length - 1];
          const prev   = co.capex[Math.max(0, co.capex.length - 5)];
          const growth = prev > 0 ? (latest - prev) / prev * 100 : 0;
          const aiPct  = co.ai_pct[co.ai_pct.length - 1];
          return (
            <div key={ticker} className="rounded-lg border border-border bg-surface p-3"
              style={{ borderLeftColor: COLORS[ticker] ?? "#6366f1", borderLeftWidth: 3 }}>
              <div className="text-[10px] text-text-muted mb-1">{co.name}</div>
              <div className="text-xl font-bold font-mono text-text-primary">${latest}B</div>
              <div className="text-[10px] mt-0.5" style={{ color: growth >= 0 ? "#22c55e" : "#ef4444" }}>
                {growth >= 0 ? "+" : ""}{growth.toFixed(0)}% YoY
              </div>
              <div className="mt-2 space-y-0.5 text-[10px] text-text-muted">
                <div>AI%: <span className="text-accent font-mono">{aiPct}%</span></div>
                <div>FY25: <span className="text-text-primary font-mono">${co.capex_guide_2025_bn}B</span></div>
                <div>FY26: <span className="text-positive font-mono">${co.capex_guide_2026_bn}B</span></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stacked bar chart */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="text-sm font-medium mb-1">Quarterly AI Infrastructure Capex ($B) — Stacked</div>
        <div className="text-xs text-text-muted mb-4">Combined hyperscaler GPU + data center spending · 10 quarters</div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
              <XAxis dataKey="q" tick={{ fontSize: 9, fill: "#555" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "#555" }} tickLine={false} axisLine={false}
                tickFormatter={(v: number) => `$${v}B`} />
              <Tooltip
                contentStyle={{ background: "#0f0f1a", border: "1px solid #333", borderRadius: 8, fontSize: 11 }}
                formatter={(v: number, name: string) => [`$${v}B`, name]}
              />
              {keys.map((k, i) => (
                <Bar key={k} dataKey={k} stackId="a" fill={COLORS[k] ?? "#6366f1"}
                  radius={i === keys.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail table */}
      <div className="rounded-lg border border-border bg-surface p-4 overflow-x-auto">
        <div className="text-sm font-medium mb-3">GPU Procurement & AI Strategy</div>
        <table className="w-full text-xs">
          <thead className="border-b border-border">
            <tr className="text-text-muted">
              {["Company","FY25 Guide","FY26 Guide","AI %","GPU Strategy"].map((h, i) => (
                <th key={h} className={cn("pb-2 font-medium", i === 0 || i === 4 ? "text-left" : "text-right")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(capexMap).map(([ticker, co]) => (
              <tr key={ticker} className="border-b border-surface-2 last:border-0 hover:bg-surface-2/30">
                <td className="py-2">
                  <div className="font-mono font-bold" style={{ color: COLORS[ticker] }}>{ticker}</div>
                  <div className="text-[9px] text-text-muted">{co.name}</div>
                </td>
                <td className="py-2 text-right font-mono">${co.capex_guide_2025_bn}B</td>
                <td className="py-2 text-right font-mono text-positive">${co.capex_guide_2026_bn}B</td>
                <td className="py-2 text-right text-accent font-mono">{co.ai_pct[co.ai_pct.length - 1]}%</td>
                <td className="py-2 pl-4 text-text-muted text-[10px] max-w-[220px]">{co.gpu_vendor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stocks Tab ────────────────────────────────────────────────────────────────

function StocksTab({ data }: { data: AIComputeData }) {
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const [catFilter, setCatFilter] = useState("All");
  const cats = ["All", ...Array.from(new Set(data.stocks.map(s => s.cat)))];
  const filtered = catFilter === "All" ? data.stocks : data.stocks.filter(s => s.cat === catFilter);

  return (
    <>
      <div className="flex gap-1 flex-wrap mb-3">
        {cats.map(c => (
          <button key={c} onClick={() => setCatFilter(c)}
            className={cn("px-2.5 py-1 rounded text-[10px] font-medium transition-colors",
              catFilter === c ? "text-white" : "bg-surface border border-border text-text-muted hover:text-text-primary"
            )}
            style={catFilter === c ? { background: catFilter === "All" ? "#6366f1" : CAT_COLORS[c] ?? "#6366f1" } : {}}>
            {c}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-surface overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border">
            <tr className="text-text-muted">
              <th className="text-left px-3 py-2.5 font-medium">Ticker</th>
              <th className="text-left px-2 py-2.5 font-medium">Cat</th>
              <th className="text-right px-2 py-2.5 font-medium">Price</th>
              <th className="text-right px-2 py-2.5 font-medium">1D</th>
              <th className="text-right px-2 py-2.5 font-medium">1W</th>
              <th className="text-right px-2 py-2.5 font-medium">1M</th>
              <th className="text-right px-2 py-2.5 font-medium">3M</th>
              <th className="text-right px-2 py-2.5 font-medium">YTD</th>
              <th className="text-right px-2 py-2.5 font-medium">RSI</th>
              <th className="text-right px-2 py-2.5 font-medium">50MA</th>
              <th className="text-right px-2 py-2.5 font-medium">200MA</th>
              <th className="text-right px-2 py-2.5 font-medium">Str</th>
              <th className="text-center px-3 py-2.5 font-medium">Signal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.ticker}
                onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${s.ticker}`, color: CAT_COLORS[s.cat] ?? "#6366f1" })}
                className="border-b border-surface-2 last:border-0 hover:bg-surface-2/40 cursor-pointer transition-colors">
                <td className="px-3 py-2">
                  <div className="font-mono font-bold text-text-primary">{s.ticker}</div>
                  <div className="text-[9px] text-text-muted max-w-[90px] truncate">{s.sub}</div>
                </td>
                <td className="px-2 py-2">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                    style={{ background: `${CAT_COLORS[s.cat] ?? "#94a3b8"}20`, color: CAT_COLORS[s.cat] ?? "#94a3b8" }}>
                    {s.cat}
                  </span>
                </td>
                <td className="px-2 py-2 text-right font-mono text-text-primary">
                  ${s.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                {[s.d1, s.w1, s.m1, s.m3, s.ytd].map((v, i) => (
                  <td key={i} className="px-2 py-2 text-right font-mono" style={{ color: v >= 0 ? "#22c55e" : "#ef4444" }}>
                    {pct(v)}
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-mono font-semibold" style={{ color: rsiColor(s.rsi) }}>
                  {s.rsi.toFixed(0)}
                </td>
                <td className="px-2 py-2 text-right text-[10px]">
                  <span style={{ color: s.above_50 ? "#22c55e" : "#ef4444" }}>{s.above_50 ? "▲" : "▼"}</span>
                </td>
                <td className="px-2 py-2 text-right text-[10px]">
                  <span style={{ color: s.above_200 ? "#22c55e" : "#ef4444" }}>{s.above_200 ? "▲" : "▼"}</span>
                </td>
                <td className="px-2 py-2 text-right font-mono font-semibold" style={{ color: scoreColor(s.strength) }}>
                  {s.strength.toFixed(0)}
                </td>
                <td className="px-3 py-2 text-center">
                  <SignalBadge signal={s.signal} color={s.sig_color} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </>
  );
}

// ── Memory Tab ────────────────────────────────────────────────────────────────

function MemoryTab({ data }: { data: AIComputeData }) {
  const tightnessColor: Record<string, string> = {
    "Very Tight": "#ef4444", "Tight": "#f87171", "Balanced": "#f59e0b", "Loose": "#22c55e", "N/A": "#94a3b8",
  };
  const priceTrendColor: Record<string, string> = {
    "Rising": "#22c55e", "Stable": "#94a3b8", "Declining": "#ef4444", "Recovering": "#86efac", "Future": "#6366f1",
  };

  return (
    <div className="space-y-5">
      {/* HBM hero metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-red-900/40 bg-red-950/15 p-4">
          <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">HBM3E Supply Status</div>
          <div className="text-2xl font-bold text-red-400">Very Tight</div>
          <div className="text-xs text-text-muted mt-1">Sold out through H1 2025 · $35–40/GB spot</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">HBM Demand Growth YoY</div>
          <div className="text-2xl font-bold text-positive font-mono">+96%</div>
          <div className="text-xs text-text-muted mt-1">Blackwell / MI300X ramp driving insatiable demand</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">HBM Supply Growth YoY</div>
          <div className="text-2xl font-bold text-amber-400 font-mono">+62%</div>
          <div className="text-xs text-text-muted mt-1">Supply deficit ~22% · structural shortage through 2025</div>
        </div>
      </div>

      {/* Memory tiers table */}
      <div className="rounded-lg border border-border bg-surface p-4 overflow-x-auto">
        <div className="text-sm font-medium mb-3">Memory Tier Intelligence</div>
        <table className="w-full text-xs">
          <thead className="border-b border-border">
            <tr className="text-text-muted">
              {["Type","Cat","Status","Util %","Tightness","Price Trend","Suppliers","Note"].map((h, i) => (
                <th key={h} className={cn("pb-2 font-medium", i < 3 || i === 4 || i === 5 ? "text-left" : i === 3 ? "text-right" : "text-left pl-4")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.memory_tiers.map(t => (
              <tr key={t.name} className="border-b border-surface-2 last:border-0 hover:bg-surface-2/30">
                <td className="py-2 font-mono font-bold text-text-primary">{t.name}</td>
                <td className="py-2">
                  <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-medium",
                    t.cat === "HBM" ? "bg-purple-900/40 text-purple-300" :
                    t.cat === "DRAM" ? "bg-blue-900/40 text-blue-300" : "bg-orange-900/40 text-orange-300"
                  )}>{t.cat}</span>
                </td>
                <td className="py-2 text-[10px] text-positive">{t.status}</td>
                <td className="py-2 text-right font-mono">
                  {t.util != null
                    ? <span style={{ color: t.util > 90 ? "#ef4444" : t.util > 75 ? "#f59e0b" : "#22c55e" }}>{t.util}%</span>
                    : <span className="text-text-muted">—</span>}
                </td>
                <td className="py-2 font-medium" style={{ color: tightnessColor[t.tightness] }}>{t.tightness}</td>
                <td className="py-2" style={{ color: priceTrendColor[t.price_trend] }}>{t.price_trend}</td>
                <td className="py-2 pl-4 text-text-muted text-[10px] max-w-[140px] truncate">{t.supplier}</td>
                <td className="py-2 pl-4 text-text-muted text-[10px] max-w-[200px]">{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* HBM supplier breakdown */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="text-sm font-medium mb-3">HBM Market Share & Capacity</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { name: "SK Hynix",  share: 62, util: 96, yoy: +84, color: "#6366f1", note: "Dominant; sold out through 2026; M15X ramp" },
            { name: "Micron",    share: 24, util: 88, yoy: +210, color: "#22c55e", note: "Aggressive ramp; NVDA-qualified; margin expansion" },
            { name: "Samsung",   share: 14, util: 72, yoy: +42, color: "#3b82f6", note: "Yield recovery underway; HBM4 R&D investment" },
          ].map(s => (
            <div key={s.name} className="rounded-lg border border-border bg-surface-2 p-3 text-xs">
              <div className="font-bold text-text-primary mb-2">{s.name}</div>
              <div className="text-3xl font-bold font-mono mb-1" style={{ color: s.color }}>{s.share}%</div>
              <div className="h-1.5 bg-surface rounded-full mb-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${s.share}%`, background: s.color }} />
              </div>
              <div className="space-y-0.5 text-[10px] text-text-muted">
                <div>Util: <span style={{ color: s.util > 90 ? "#ef4444" : "#f59e0b" }}>{s.util}%</span></div>
                <div>YoY Capacity: <span className="text-positive">+{s.yoy}%</span></div>
                <div className="mt-1">{s.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Supply Chain Tab ──────────────────────────────────────────────────────────

function SupplyChainTab({ data }: { data: AIComputeData }) {
  const statusColor: Record<string, string> = {
    "Sold Out": "#ef4444", "Critically Tight": "#dc2626", "Very Tight": "#f87171",
    "Tight": "#f59e0b", "Ramping": "#6366f1", "Balanced": "#22c55e",
  };

  return (
    <div className="space-y-5">
      {Object.entries(data.foundry_nodes).map(([ticker, foundry]) => (
        <div key={ticker} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-base font-bold text-text-primary">{foundry.name}</div>
              <div className="text-xs text-text-muted mt-0.5">Advanced node + packaging capacity analysis</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-text-muted">Constraint Score</div>
              <div className="text-3xl font-bold font-mono" style={{ color: scoreColor(foundry.constraint_score) }}>
                {foundry.constraint_score}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border">
                <tr className="text-text-muted">
                  <th className="text-left pb-2 font-medium">Node</th>
                  <th className="text-right pb-2 font-medium">Utilization</th>
                  <th className="text-center pb-2 font-medium">Status</th>
                  <th className="text-center pb-2 font-medium">Type</th>
                  <th className="text-left pb-2 pl-4 font-medium">Key Clients</th>
                </tr>
              </thead>
              <tbody>
                {foundry.nodes.map(n => (
                  <tr key={n.node} className="border-b border-surface-2 last:border-0 hover:bg-surface-2/30">
                    <td className="py-2 font-mono font-bold text-accent">{n.node}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                          <div className="h-full rounded-full"
                            style={{ width: `${n.util}%`, background: n.util > 90 ? "#ef4444" : n.util > 80 ? "#f59e0b" : "#22c55e" }} />
                        </div>
                        <span className="font-mono w-8 text-right"
                          style={{ color: n.util > 90 ? "#ef4444" : n.util > 80 ? "#f59e0b" : "#22c55e" }}>
                          {n.util}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                        style={{ background: `${statusColor[n.status] ?? "#94a3b8"}20`, color: statusColor[n.status] ?? "#94a3b8" }}>
                        {n.status}
                      </span>
                    </td>
                    <td className="py-2 text-center text-[10px]">
                      {n.cowos
                        ? <span className="text-purple-400 font-bold">CoWoS/3D</span>
                        : <span className="text-text-muted">Logic</span>}
                    </td>
                    <td className="py-2 pl-4 text-text-muted text-[10px] max-w-[220px]">{n.clients}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* CoWoS bottleneck explanation */}
      <div className="rounded-lg border border-amber-900/40 bg-amber-950/15 p-4 text-xs space-y-2">
        <div className="font-semibold text-amber-300 text-sm">CoWoS Packaging — The #1 AI Supply Chain Bottleneck</div>
        <div className="text-text-muted space-y-1.5">
          <p>• CoWoS (Chip-on-Wafer-on-Substrate) stacks HBM memory onto GPU/ASIC dies. TSMC is the only viable volume producer.</p>
          <p>• CoWoS-S at 98% utilization: every H100, H200, B100, and MI300X wafer must pass through this step.</p>
          <p>• CoWoS-L (for GB200 NVL72 rack-scale): larger substrate; TSMC capacity ~500 units/month at full ramp.</p>
          <p>• TSMC is building a dedicated CoWoS facility in Arizona (Fab 21 Phase 3): +30% capacity by end-2025.</p>
          <p>• Intel is building an alternative CoWoS-equivalent (EMIB/Foveros) — years behind TSMC in yield and scale.</p>
        </div>
      </div>
    </div>
  );
}

// ── Signals Tab ───────────────────────────────────────────────────────────────

function SignalsTab({ data }: { data: AIComputeData }) {
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const [sigFilter, setSigFilter] = useState("All");

  const filtered = sigFilter === "All" ? data.stocks
    : sigFilter === "Buy" ? data.stocks.filter(s => ["Strong Buy", "Buy"].includes(s.signal))
    : sigFilter === "Sell" ? data.stocks.filter(s => ["Sell", "Avoid", "Reduce"].includes(s.signal))
    : data.stocks.filter(s => ["Hold", "Caution"].includes(s.signal));

  return (
    <>
      <div className="flex gap-1 mb-4">
        {["All", "Buy", "Hold", "Sell"].map(g => (
          <button key={g} onClick={() => setSigFilter(g)}
            className={cn("px-3 py-1.5 rounded text-xs font-medium transition-colors",
              sigFilter === g ? "bg-accent text-white" : "bg-surface border border-border text-text-muted hover:text-text-primary"
            )}>
            {g}
          </button>
        ))}
        <span className="ml-auto text-xs text-text-muted self-center">{filtered.length} stocks</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map(s => (
          <div key={s.ticker}
            onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${s.ticker}`, color: CAT_COLORS[s.cat] ?? "#6366f1" })}
            className="rounded-lg border bg-surface p-4 cursor-pointer hover:border-accent/40 transition-colors"
            style={{ borderColor: `${s.sig_color}30` }}>

            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <TickerChip ticker={s.ticker} showDetail={false} className="font-mono font-bold text-text-primary" />
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                    style={{ background: `${CAT_COLORS[s.cat] ?? "#94a3b8"}20`, color: CAT_COLORS[s.cat] ?? "#94a3b8" }}>
                    {s.cat}
                  </span>
                </div>
                <div className="text-[10px] text-text-muted mt-0.5">{s.name}</div>
              </div>
              <SignalBadge signal={s.signal} color={s.sig_color} />
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[
                { label: "vs SPY 3M", value: `${s.rel_3m >= 0 ? "+" : ""}${(s.rel_3m * 100).toFixed(1)}%`, color: s.rel_3m >= 0 ? "#22c55e" : "#ef4444" },
                { label: "RSI(14)",   value: s.rsi.toFixed(0),         color: rsiColor(s.rsi) },
                { label: "Strength",  value: s.strength.toFixed(0),     color: scoreColor(s.strength) },
              ].map(m => (
                <div key={m.label} className="rounded bg-surface-2 p-2 text-center">
                  <div className="text-[9px] text-text-muted">{m.label}</div>
                  <div className="text-xs font-mono font-bold mt-0.5" style={{ color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Detail rows */}
            <div className="grid grid-cols-2 gap-x-4 text-[10px]">
              {[
                ["Price",  `$${s.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, "text-text-primary"],
                ["50MA",   s.above_50 ? "Above ▲" : "Below ▼", s.above_50 ? "text-positive" : "text-negative"],
                ["Stop",   s.stop ? `$${s.stop.toFixed(0)}` : "—", "text-negative"],
                ["200MA",  s.above_200 ? "Above ▲" : "Below ▼", s.above_200 ? "text-positive" : "text-negative"],
                ["Target", s.target ? `$${s.target.toFixed(0)}` : "—", "text-positive"],
                ["Upside", s.upside != null ? `+${s.upside}%` : "—", (s.upside ?? 0) > 0 ? "text-positive" : "text-text-muted"],
              ].map(([label, val, cls]) => (
                <div key={label} className="flex justify-between py-0.5 border-b border-surface-2 last:border-0">
                  <span className="text-text-muted">{label}</span>
                  <span className={cn("font-mono", cls)}>{val}</span>
                </div>
              ))}
            </div>

            {/* Confidence bar */}
            <div className="mt-2.5 flex items-center gap-2 text-[9px]">
              <span className="text-text-muted w-16">Confidence</span>
              <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${s.conf}%`, background: s.sig_color }} />
              </div>
              <span style={{ color: s.sig_color }}>{s.conf}%</span>
            </div>
          </div>
        ))}
      </div>
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </>
  );
}

// ── Scenarios Tab ─────────────────────────────────────────────────────────────

function ScenariosTab({ data }: { data: AIComputeData }) {
  const [active, setActive] = useState(data.scenarios[0]?.id ?? "");
  const scenario = data.scenarios.find(s => s.id === active);

  return (
    <div className="space-y-5">
      {/* Scenario selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {data.scenarios.map(s => (
          <button key={s.id} onClick={() => setActive(s.id)}
            className={cn("rounded-lg border p-3 text-left transition-colors",
              active === s.id ? "bg-surface" : "border-border bg-surface hover:bg-surface-2"
            )}
            style={{ borderColor: active === s.id ? s.color : undefined }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: s.color }}>{s.prob}% probability</div>
            <div className="text-xs font-medium text-text-primary leading-tight">{s.name}</div>
          </button>
        ))}
      </div>

      {scenario && (
        <div className="space-y-4">
          {/* Scenario description */}
          <div className="rounded-lg border p-4" style={{ borderColor: `${scenario.color}40`, background: `${scenario.color}08` }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: scenario.color }} />
              <span className="font-semibold text-text-primary">{scenario.name}</span>
              <span className="text-xs text-text-muted ml-auto">{scenario.prob}% base case probability</span>
            </div>
            <p className="text-xs text-text-muted">{scenario.desc}</p>
          </div>

          {/* Impact table */}
          <div className="rounded-lg border border-border bg-surface p-4 overflow-x-auto">
            <div className="text-sm font-medium mb-3">Estimated Impact by Company</div>
            <table className="w-full text-xs">
              <thead className="border-b border-border">
                <tr className="text-text-muted">
                  <th className="text-left pb-2 font-medium">Ticker</th>
                  <th className="text-right pb-2 font-medium">Revenue Δ</th>
                  <th className="text-right pb-2 font-medium">EPS Δ</th>
                  <th className="text-right pb-2 font-medium">Stock Δ</th>
                  <th className="text-left pb-2 pl-4 font-medium">Magnitude</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(scenario.impacts)
                  .sort((a, b) => Math.abs(b[1].stk) - Math.abs(a[1].stk))
                  .map(([ticker, imp]) => (
                    <tr key={ticker} className="border-b border-surface-2 last:border-0 hover:bg-surface-2/30">
                      <td className="py-2 font-mono font-bold text-text-primary"><TickerChip ticker={ticker} showDetail={false} /></td>
                      <td className="py-2 text-right font-mono font-bold" style={{ color: impColor(imp.rev) }}>
                        {imp.rev >= 0 ? "+" : ""}{imp.rev}%
                      </td>
                      <td className="py-2 text-right font-mono font-bold" style={{ color: impColor(imp.eps) }}>
                        {imp.eps >= 0 ? "+" : ""}{imp.eps}%
                      </td>
                      <td className="py-2 text-right font-mono font-bold text-base" style={{ color: impColor(imp.stk) }}>
                        {imp.stk >= 0 ? "+" : ""}{imp.stk}%
                      </td>
                      <td className="py-2 pl-4">
                        <div className="w-28 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                          <div className="h-full rounded-full"
                            style={{ width: `${Math.min(100, Math.abs(imp.stk) * 2)}%`, background: impColor(imp.stk) }} />
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Portfolio impact summary */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-sm font-medium mb-2">Portfolio Construction Implications</div>
            <div className="text-xs text-text-muted space-y-1.5">
              {scenario.id === "ai_surge" && <>
                <p>• <span className="text-positive font-medium">NVDA & SMCI</span>: Max overweight — direct beneficiary of GPU demand surge</p>
                <p>• <span className="text-positive font-medium">MU</span>: HBM pricing power; significant EPS leverage to demand acceleration</p>
                <p>• <span className="text-positive font-medium">TSM</span>: CoWoS and N3 capacity becomes even more scarce — ASP expansion</p>
              </>}
              {scenario.id === "capex_up" && <>
                <p>• <span className="text-positive font-medium">NVDA, ANET, AVGO</span>: Primary beneficiaries of higher cloud infra spend</p>
                <p>• <span className="text-positive font-medium">SMCI, DELL</span>: AI server volumes expand; margins may compress on competition</p>
              </>}
              {scenario.id === "china_ban" && <>
                <p>• <span className="text-negative font-medium">LRCX, AMAT, KLAC</span>: Highest China exposure; 15–25% revenue at risk</p>
                <p>• <span className="text-negative font-medium">NVDA</span>: $12B+ annual China data center revenue at risk; ~15% of total</p>
                <p>• <span className="text-positive font-medium">ASML</span>: Relative outperformer — EUV already banned, incremental impact lower</p>
              </>}
              {scenario.id === "hbm_shortage" && <>
                <p>• <span className="text-positive font-medium">MU</span>: Biggest winner — pricing power, margin expansion, earnings upside</p>
                <p>• <span className="text-negative font-medium">NVDA, SMCI</span>: GPU shipments constrained; near-term revenue risk</p>
              </>}
              {scenario.id === "ai_slowdown" && <>
                <p>• <span className="text-negative font-medium">SMCI, NVDA</span>: Highest capex sensitivity; earnings risk significant</p>
                <p>• <span className="text-positive font-medium">INTC, HPE</span>: Relative defensive — enterprise CPU cycle more stable</p>
              </>}
              {scenario.id === "recession" && <>
                <p>• <span className="text-negative font-medium">MU, SMCI, AMAT</span>: Highest cyclical exposure; underweight in defensive regime</p>
                <p>• <span className="text-positive font-medium">MSFT, GOOGL</span>: Cloud revenue relatively resilient; AI deployment continues</p>
              </>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AIComputePage() {
  const [tab, setTab] = useState<Tab>("summary");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ai-compute"],
    queryFn: api.getAICompute,
    staleTime: 10 * 60_000,
  });

  const { isIndia } = useMarket();
  if (isIndia) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
      <span className="text-5xl">🇺🇸</span>
      <h2 className="text-base font-semibold text-text-primary">US Markets Only</h2>
      <p className="text-xs text-text-muted max-w-xs">This tool covers US AI infrastructure and compute stocks and is not available for the Indian market.</p>
    </div>
  );

  return (
    <div className="space-y-4 max-w-screen-2xl">
      <PageGuide
        title="AI Compute Infrastructure"
        subtitle="Institutional-grade intelligence platform tracking the global AI compute supply chain: GPUs, hyperscalers, memory, foundries, and investment signals."
        steps={[
          { title: "PM Summary Tab", detail: "Start with the Portfolio Manager Summary for a synthesized view: key metrics, sector scores, and AI-generated investment thesis. This is the executive brief for busy PMs." },
          { title: "GPU Tab", detail: "Track GPU supply/demand balance, pricing trends, allocation across hyperscalers, and Nvidia vs AMD vs Intel competitive positioning. Production schedules and ASP trends are shown." },
          { title: "Hyperscalers Tab", detail: "Monitor AWS, Azure, GCP, and Oracle Cloud AI-related capex announcements, data center growth rates, and compute reservation pipeline. Revenue attribution to AI workloads is shown." },
          { title: "Memory Tab", detail: "HBM (High Bandwidth Memory) is the key bottleneck for AI training. This tab tracks HBM supply, pricing, SK Hynix/Samsung/Micron market share, and near-term supply forecasts." },
          { title: "Stocks Tab", detail: "Institutional-quality trade signals for AI compute stocks (NVDA, AMD, AVGO, MRVL, TSM, etc.) with composite scores, technical signals, and valuation context." },
          { title: "Signals & Scenarios Tab", detail: "Forward-looking investment scenarios: bull (GPU shortage extends), base (normalization), and bear (demand destruction). Each scenario shows implications for key stocks." },
        ]}
        howItWorks={[
          { title: "Data Aggregation", detail: "Supply chain data is aggregated from public filings (10-K, 10-Q, 8-K), earnings call transcripts, industry reports, and market data APIs. The backend runs nightly ETL pipelines to update all metrics." },
          { title: "Composite Scoring", detail: "Each sub-sector (GPU, Memory, Foundry) gets a 0–100 score based on supply/demand balance, pricing momentum, and order backlog trends. The aggregate AI Compute Score is a weighted average." },
          { title: "Stock Signals", detail: "Individual stock signals combine: fundamental momentum (revenue/earnings growth acceleration), technical momentum (RS rank, MA alignment), and supply chain positioning (direct vs. indirect AI exposure). Signals are updated daily." },
          { title: "Scenario Engine", detail: "The scenario engine runs three Monte Carlo paths for GPU pricing and hyperscaler capex through 12 months. Each path is mapped to stock-level price targets using revenue-multiple sensitivity analysis." },
        ]}
        tips={[
          "HBM availability is the tightest constraint in the AI supply chain — stocks with HBM exposure (SK Hynix, Micron) benefit most from continued AI training demand.",
          "Watch hyperscaler capex revision cycles: when all three (AWS, Azure, GCP) raise capex guidance simultaneously, GPU demand is about to accelerate — historically a strong NVDA buy signal.",
          "Fabless chip companies (NVDA, AMD, AVGO) carry higher margin leverage than foundries (TSM) — in bull scenarios they outperform; in normalization scenarios foundries are more defensive.",
        ]}
      />

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold">AI Compute Infrastructure</h1>
          <p className="text-xs text-text-muted mt-0.5">
            GPU · CPU · Hyperscaler · Memory · Foundry · Signals · Scenarios — Institutional Intelligence Platform
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {data && <span className="text-[10px] text-text-muted">As of {data.as_of}</span>}
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface border border-border text-xs text-text-muted hover:text-text-primary disabled:opacity-50 transition-colors">
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Score chip when data loaded */}
      {data && !isLoading && (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono font-bold text-lg" style={{ color: data.regime_color }}>{data.score.toFixed(0)}</span>
          <span className="text-text-muted">/100</span>
          <span className="px-2 py-0.5 rounded font-semibold text-[10px]"
            style={{ background: `${data.regime_color}20`, color: data.regime_color }}>
            {data.regime}
          </span>
          <span className="text-text-muted">·</span>
          {Object.entries(data.sub_scores).map(([cat, s]) => (
            <span key={cat} className="text-[10px] font-mono" style={{ color: scoreColor(s) }} title={cat}>
              {cat.substring(0, 3).toUpperCase()}:{s.toFixed(0)}
            </span>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap shrink-0",
              tab === id ? "border-accent text-text-primary" : "border-transparent text-text-muted hover:text-text-primary"
            )}>
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24 text-text-muted gap-2">
          <RefreshCw size={14} className="animate-spin" />
          <span className="text-sm">Fetching AI compute intelligence...</span>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="rounded border border-red-900/40 bg-red-950/20 text-red-400 text-xs p-3">
          {(error as Error).message}
        </div>
      )}

      {/* Tab content */}
      {data && !isLoading && (
        <div>
          {tab === "summary"      && <SummaryTab      data={data} />}
          {tab === "gpu"          && <GPUTab          data={data} />}
          {tab === "hyperscalers" && <HyperscalersTab data={data} />}
          {tab === "stocks"       && <StocksTab       data={data} />}
          {tab === "memory"       && <MemoryTab       data={data} />}
          {tab === "supply"       && <SupplyChainTab  data={data} />}
          {tab === "signals"      && <SignalsTab       data={data} />}
          {tab === "scenarios"    && <ScenariosTab    data={data} />}
        </div>
      )}
    </div>
  );
}
