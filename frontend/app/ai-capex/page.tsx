"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Cpu, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  RefreshCw, Zap, Server, Network, Battery, HardDrive,
  ChevronUp, ChevronDown, Minus, BarChart3, Activity,
  Globe, Shield, Target, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type AICapExDashboard, type AIStockSignal, type HyperscalerData } from "@/lib/api";
import { PageGuide } from "@/components/PageGuide";

// ── Helpers ───────────────────────────────────────────────────────────────────

function f(v: number | null | undefined, dec = 1): string {
  if (v == null) return "—";
  return v.toFixed(dec);
}
function fPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function fBn(v: number | null | undefined) {
  if (v == null) return "—";
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}T`;
  return `$${v.toFixed(1)}B`;
}

function chgColor(v: number | null | undefined) {
  if (v == null) return "text-text-muted";
  return v >= 0 ? "text-emerald-400" : "text-red-400";
}

function ChgSpan({ v, dec = 1 }: { v: number | null | undefined; dec?: number }) {
  if (v == null) return <span className="text-text-muted text-xs">—</span>;
  const pos = v >= 0;
  return (
    <span className={cn("flex items-center gap-0.5 text-xs font-mono", pos ? "text-emerald-400" : "text-red-400")}>
      {pos ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(v).toFixed(dec)}%
    </span>
  );
}

function ScoreMeter({ score, label }: { score: number; label: string }) {
  const r = 56;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ * 0.75;
  const color =
    score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : score >= 40 ? "#3b82f6" : score >= 20 ? "#f97316" : "#ef4444";
  return (
    <div className="flex flex-col items-center">
      <svg width={140} height={100} viewBox="0 0 140 100">
        <circle cx={70} cy={80} r={r} fill="none" stroke="#1e293b" strokeWidth={10}
          strokeDasharray={`${circ * 0.75} ${circ}`} strokeDashoffset={0}
          transform="rotate(135 70 80)" strokeLinecap="round" />
        <circle cx={70} cy={80} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${circ * 0.75} ${circ}`} strokeDashoffset={offset}
          transform="rotate(135 70 80)" strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }} />
        <text x={70} y={76} textAnchor="middle" fill={color} fontSize={22} fontWeight="bold" fontFamily="monospace">
          {score.toFixed(0)}
        </text>
        <text x={70} y={91} textAnchor="middle" fill="#94a3b8" fontSize={9}>
          / 100
        </text>
      </svg>
      <div className="text-xs text-text-muted -mt-1">{label}</div>
    </div>
  );
}

function RegimeBadge({ regime }: { regime: string }) {
  const colors: Record<string, string> = {
    "AI Supercycle":    "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    "Strong Expansion": "bg-blue-500/20 text-blue-300 border-blue-500/40",
    "Normal Growth":    "bg-sky-500/20 text-sky-300 border-sky-500/40",
    "Weak Growth":      "bg-amber-500/20 text-amber-300 border-amber-500/40",
    "Contraction":      "bg-red-500/20 text-red-300 border-red-500/40",
    // cycle labels
    "Hypergrowth":   "bg-purple-500/20 text-purple-300 border-purple-500/40",
    "Expansion":     "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    "Early Buildout":"bg-blue-500/20 text-blue-300 border-blue-500/40",
    "Peak Spending": "bg-amber-500/20 text-amber-300 border-amber-500/40",
    "Normalization": "bg-red-500/20 text-red-300 border-red-500/40",
  };
  return (
    <span className={cn("px-2.5 py-1 rounded border text-xs font-semibold tracking-wide", colors[regime] ?? "bg-surface-2 text-text-muted border-border")}>
      {regime}
    </span>
  );
}

function SignalBadge({ signal }: { signal: string }) {
  const colors: Record<string, string> = {
    "Strong Buy": "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    "Buy":        "bg-green-500/20 text-green-300 border-green-500/40",
    "Hold":       "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    "Reduce":     "bg-orange-500/20 text-orange-300 border-orange-500/40",
    "Sell":       "bg-red-500/20 text-red-300 border-red-500/40",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded border text-xs font-semibold", colors[signal] ?? "bg-surface-2 text-text-muted border-border")}>
      {signal}
    </span>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-surface border border-border rounded-lg p-4", className)}>{children}</div>;
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-accent">{icon}</span>
      <h2 className="text-sm font-semibold text-text-primary tracking-wide uppercase">{label}</h2>
    </div>
  );
}

const SECTOR_COLORS: Record<string, string> = {
  Compute: "#8b5cf6", Memory: "#3b82f6", Foundry: "#06b6d4",
  Equipment: "#f59e0b", Networking: "#10b981", Power: "#f97316",
  Servers: "#ec4899", Cloud: "#6366f1", Hyperscaler: "#a3e635",
};

const INFRA_COLORS = ["#8b5cf6", "#10b981", "#f97316", "#3b82f6", "#06b6d4"];

// ── Tab: Overview ──────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: AICapExDashboard }) {
  const { capex_score, global_ai_capex_annual_bn, infra_breakdown, top_longs } = data;
  const comps = Object.entries(capex_score.components);

  return (
    <div className="space-y-4">
      {/* Score + regime row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="col-span-1 flex flex-col items-center justify-center">
          <ScoreMeter score={capex_score.composite} label="AI CapEx Score" />
          <div className="mt-2 flex flex-wrap gap-2 justify-center">
            <RegimeBadge regime={capex_score.regime} />
          </div>
        </Card>

        <Card className="col-span-1">
          <div className="text-xs text-text-muted mb-1 uppercase tracking-wide">AI Cycle Phase</div>
          <RegimeBadge regime={capex_score.cycle} />
          <div className="mt-3 text-xs text-text-muted leading-relaxed">
            {capex_score.cycle === "Hypergrowth" && "Hyperscalers accelerating CapEx, GPU supply constrained, AI revenue inflecting."}
            {capex_score.cycle === "Expansion" && "Broad AI infrastructure buildout underway across hyperscalers and enterprises."}
            {capex_score.cycle === "Early Buildout" && "Initial AI infrastructure investment phase with moderate growth in spending."}
            {capex_score.cycle === "Peak Spending" && "CapEx growth peaking; watch for signs of moderation or reacceleration."}
            {capex_score.cycle === "Normalization" && "CapEx growth slowing; market digesting prior investment wave."}
          </div>
        </Card>

        <Card className="col-span-1">
          <div className="text-xs text-text-muted mb-1 uppercase tracking-wide">Global AI CapEx (Annual)</div>
          <div className="text-2xl font-bold text-text-primary font-mono">{fBn(global_ai_capex_annual_bn)}</div>
          <div className="text-xs text-text-muted mt-1">Hyperscaler + Enterprise Estimate</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-text-muted">Compute</span> <span className="text-purple-400 font-mono">45%</span></div>
            <div><span className="text-text-muted">Network</span> <span className="text-emerald-400 font-mono">20%</span></div>
            <div><span className="text-text-muted">Power</span>   <span className="text-orange-400 font-mono">15%</span></div>
            <div><span className="text-text-muted">Memory</span>  <span className="text-blue-400 font-mono">10%</span></div>
          </div>
        </Card>

        <Card className="col-span-1">
          <div className="text-xs text-text-muted mb-1 uppercase tracking-wide">Score Scale</div>
          {[
            { range: "80–100", label: "AI Supercycle", color: "text-emerald-400" },
            { range: "60–80",  label: "Strong Expansion", color: "text-blue-400" },
            { range: "40–60",  label: "Normal Growth", color: "text-sky-400" },
            { range: "20–40",  label: "Weak Growth", color: "text-amber-400" },
            { range: "0–20",   label: "Contraction", color: "text-red-400" },
          ].map(row => (
            <div key={row.range} className={cn("flex justify-between text-xs py-0.5 border-b border-border last:border-0", row.color)}>
              <span className="font-mono">{row.range}</span>
              <span>{row.label}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Component breakdown */}
      <Card>
        <SectionTitle icon={<BarChart3 size={14} />} label="Composite Score Breakdown" />
        <div className="space-y-2">
          {comps.map(([key, comp]) => {
            const pct = (comp.score / comp.max) * 100;
            const barColor = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : pct >= 25 ? "bg-amber-500" : "bg-red-500";
            return (
              <div key={key} className="grid grid-cols-[160px_1fr_80px_80px] items-center gap-3 text-xs">
                <div className="text-text-muted truncate">{comp.label}</div>
                <div className="relative h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div className={cn("absolute left-0 top-0 h-full rounded-full", barColor)}
                    style={{ width: `${pct}%`, transition: "width 1s ease" }} />
                </div>
                <div className="text-right font-mono text-text-primary">{comp.score} / {comp.max}</div>
                <div className="text-right text-text-muted">{comp.weight}</div>
              </div>
            );
          })}
          <div className="pt-2 border-t border-border flex justify-between text-xs">
            <span className="text-text-muted font-semibold">Composite Score</span>
            <span className="font-mono font-bold text-accent">{capex_score.composite} / 100</span>
          </div>
        </div>
      </Card>

      {/* Infrastructure + Top Longs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={<Server size={14} />} label="AI Infrastructure Spend Mix" />
          <div className="flex gap-4">
            <div style={{ width: 160, height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={infra_breakdown} dataKey="bn" nameKey="category"
                    cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2}>
                    {infra_breakdown.map((_, i) => (
                      <Cell key={i} fill={INFRA_COLORS[i % INFRA_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `$${v.toFixed(1)}B`}
                    contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5 text-xs">
              {infra_breakdown.map((row, i) => (
                <div key={row.category} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: INFRA_COLORS[i] }} />
                  <span className="flex-1 text-text-muted">{row.category}</span>
                  <span className="font-mono text-text-primary">{fBn(row.bn)}</span>
                  <span className="text-text-muted">{row.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle icon={<Target size={14} />} label="Top Long Ideas" />
          <div className="space-y-2">
            {top_longs.map(s => (
              <div key={s.sym} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <SignalBadge signal={s.signal} />
                  <span className="font-mono text-text-primary font-semibold">{s.sym}</span>
                  <span className="text-text-muted">{s.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <ChgSpan v={s.chg_6m} />
                  <span className={cn("font-mono", s.upside_pct > 0 ? "text-emerald-400" : "text-red-400")}>
                    +{s.upside_pct.toFixed(0)}% tgt
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Tab: Hyperscalers ──────────────────────────────────────────────────────────

function HyperscalerCard({ h }: { h: HyperscalerData }) {
  const growthColor = h.capex_yoy == null ? "text-text-muted" : h.capex_yoy > 0 ? "text-emerald-400" : "text-red-400";
  return (
    <Card>
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-semibold text-sm text-text-primary">{h.name}</div>
          <div className="text-xs text-text-muted">{h.cloud}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-text-muted">Price</div>
          <div className="font-mono text-sm text-text-primary">{h.price ? `$${h.price.toFixed(0)}` : "—"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
        <div className="bg-surface-2 rounded p-2">
          <div className="text-text-muted">CapEx (Qtr)</div>
          <div className="font-mono text-text-primary font-semibold">{fBn(h.capex_latest_bn)}</div>
          <div className={cn("font-mono text-xs", growthColor)}>{fPct(h.capex_yoy)} YoY</div>
        </div>
        <div className="bg-surface-2 rounded p-2">
          <div className="text-text-muted">Revenue (Qtr)</div>
          <div className="font-mono text-text-primary font-semibold">{fBn(h.rev_latest_bn)}</div>
          <div className={cn("font-mono text-xs", chgColor(h.rev_yoy))}>{fPct(h.rev_yoy)} YoY</div>
        </div>
        <div className="bg-surface-2 rounded p-2">
          <div className="text-text-muted">Mkt Cap</div>
          <div className="font-mono text-text-primary">{fBn(h.mktcap_bn)}</div>
        </div>
        <div className="bg-surface-2 rounded p-2">
          <div className="text-text-muted">6m Return</div>
          <div className={cn("font-mono font-semibold", chgColor(h.chg_6m))}>{fPct(h.chg_6m)}</div>
        </div>
      </div>
      {h.capex_chart.length > 0 && (
        <div>
          <div className="text-xs text-text-muted mb-1">Quarterly CapEx ($B)</div>
          <div style={{ height: 72 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={h.capex_chart} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                <XAxis dataKey="q" tick={{ fontSize: 8, fill: "#64748b" }} tickLine={false} axisLine={false}
                  tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 8, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => `$${v.toFixed(1)}B`}
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, fontSize: 10 }} />
                <Bar dataKey="capex" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}

function HyperscalersTab({ data }: { data: AICapExDashboard }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.hyperscalers.map(h => <HyperscalerCard key={h.sym} h={h} />)}
      </div>

      {/* Cloud growth */}
      <Card>
        <SectionTitle icon={<Globe size={14} />} label="Cloud Revenue Growth" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data.cloud_data.map(c => (
            <div key={c.sym} className="text-center">
              <div className="text-sm font-semibold text-text-primary">{c.label}</div>
              <div className="text-xs text-text-muted mb-1">{c.sym}</div>
              <div className="font-mono text-lg text-text-primary">{fBn(c.rev_latest_bn)}</div>
              <div className={cn("text-sm font-mono", chgColor(c.rev_yoy))}>{fPct(c.rev_yoy)} YoY</div>
              {c.rev_chart.length > 0 && (
                <div style={{ height: 60 }} className="mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={c.rev_chart} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <Line dataKey="rev" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                      <Tooltip formatter={(v: number) => `$${v.toFixed(1)}B`}
                        contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, fontSize: 10 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Tab: AI Stocks & Signals ───────────────────────────────────────────────────

const SECTORS = ["All", "Compute", "Memory", "Foundry", "Equipment", "Networking", "Power", "Servers", "Cloud"];

function SignalsTab({ data }: { data: AICapExDashboard }) {
  const [sector, setSector] = useState("All");
  const filtered = sector === "All" ? data.stocks : data.stocks.filter(s => s.sector === sector);

  return (
    <div className="space-y-3">
      {/* GPU Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.gpu_data.map(g => (
          <Card key={g.sym} className="flex items-center gap-4">
            <div className="flex-1">
              <div className="font-semibold text-sm text-text-primary">{g.name} <span className="text-text-muted font-normal">({g.sym})</span></div>
              <div className="text-xs text-text-muted">{g.sub}</div>
              <div className="text-xs mt-1">
                <span className="text-text-muted">AI Exposure: </span>
                <span className="text-purple-400 font-mono">{g.ai_pct}%</span>
              </div>
            </div>
            <div className="text-right space-y-0.5">
              <div className="font-mono text-text-primary text-sm">{fBn(g.rev_latest_bn)} <span className="text-xs text-text-muted">rev</span></div>
              <ChgSpan v={g.rev_yoy} />
              <div className="text-xs text-text-muted">{g.pe_fwd ? `${g.pe_fwd.toFixed(0)}x fwd` : ""}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Sector filter */}
      <div className="flex flex-wrap gap-1.5">
        {SECTORS.map(s => (
          <button key={s} onClick={() => setSector(s)}
            className={cn("px-3 py-1 rounded text-xs font-medium transition-colors",
              sector === s ? "bg-accent text-white" : "bg-surface-2 text-text-muted hover:text-text-primary")}>
            {s}
          </button>
        ))}
      </div>

      {/* Signals table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="text-left py-2 pr-3 font-medium">Ticker</th>
              <th className="text-left py-2 pr-3 font-medium">Signal</th>
              <th className="text-right py-2 pr-3 font-medium">Score</th>
              <th className="text-right py-2 pr-3 font-medium">Price</th>
              <th className="text-right py-2 pr-3 font-medium">3m</th>
              <th className="text-right py-2 pr-3 font-medium">6m</th>
              <th className="text-right py-2 pr-3 font-medium">Rev YoY</th>
              <th className="text-right py-2 pr-3 font-medium">AI%</th>
              <th className="text-right py-2 pr-3 font-medium">Entry</th>
              <th className="text-right py-2 pr-3 font-medium">Stop</th>
              <th className="text-right py-2 pr-3 font-medium">Target</th>
              <th className="text-right py-2 pr-3 font-medium">Upside</th>
              <th className="text-right py-2 font-medium">Mkt Cap</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.sym} className="border-b border-border/50 hover:bg-surface-2/40 transition-colors">
                <td className="py-2 pr-3">
                  <div className="font-mono font-semibold text-text-primary">{s.sym}</div>
                  <div className="text-text-muted text-[10px] truncate max-w-[80px]">{s.name}</div>
                </td>
                <td className="py-2 pr-3"><SignalBadge signal={s.signal} /></td>
                <td className="py-2 pr-3 text-right">
                  <span className="font-mono text-text-primary">{s.score.toFixed(0)}</span>
                </td>
                <td className="py-2 pr-3 text-right font-mono text-text-primary">
                  {s.price ? `$${s.price.toFixed(1)}` : "—"}
                </td>
                <td className="py-2 pr-3 text-right"><ChgSpan v={s.chg_3m} /></td>
                <td className="py-2 pr-3 text-right"><ChgSpan v={s.chg_6m} /></td>
                <td className="py-2 pr-3 text-right"><ChgSpan v={s.rev_yoy} /></td>
                <td className="py-2 pr-3 text-right">
                  <span className="font-mono text-purple-400">{s.ai_pct}%</span>
                </td>
                <td className="py-2 pr-3 text-right font-mono text-text-muted">
                  {s.entry ? `$${s.entry.toFixed(1)}` : "—"}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-red-400">
                  {s.stop_loss ? `$${s.stop_loss.toFixed(1)}` : "—"}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-emerald-400">
                  {s.target ? `$${s.target.toFixed(1)}` : "—"}
                </td>
                <td className="py-2 pr-3 text-right">
                  <span className={cn("font-mono", s.upside_pct > 0 ? "text-emerald-400" : "text-red-400")}>
                    {s.upside_pct > 0 ? "+" : ""}{s.upside_pct.toFixed(0)}%
                  </span>
                </td>
                <td className="py-2 text-right font-mono text-text-muted">{fBn(s.mktcap_bn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Heatmap ──────────────────────────────────────────────────────────────

function HeatmapTab({ data }: { data: AICapExDashboard }) {
  const rows = data.heatmap;
  function cell6m(v: number | null | undefined) {
    if (v == null) return { bg: "bg-surface-2", text: "text-text-muted" };
    if (v > 30)  return { bg: "bg-emerald-500/25", text: "text-emerald-300" };
    if (v > 10)  return { bg: "bg-emerald-500/12", text: "text-emerald-400" };
    if (v > -5)  return { bg: "bg-surface-2",       text: "text-text-muted" };
    if (v > -20) return { bg: "bg-red-500/12",      text: "text-red-400" };
    return             { bg: "bg-red-500/25",        text: "text-red-300" };
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span className="text-text-primary font-medium">6m Return Color:</span>
        {[
          { label: "> +30%", cls: "bg-emerald-500/25 text-emerald-300" },
          { label: "+10–30%", cls: "bg-emerald-500/12 text-emerald-400" },
          { label: "Flat", cls: "bg-surface-2 text-text-muted" },
          { label: "-5 to -20%", cls: "bg-red-500/12 text-red-400" },
          { label: "< -20%", cls: "bg-red-500/25 text-red-300" },
        ].map(l => (
          <span key={l.label} className={cn("px-2 py-0.5 rounded text-xs", l.cls)}>{l.label}</span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="text-left py-2 pr-3 font-medium">Ticker</th>
              <th className="text-left py-2 pr-3 font-medium">Name</th>
              <th className="text-left py-2 pr-3 font-medium">Sector</th>
              <th className="text-center py-2 pr-3 font-medium">AI%</th>
              <th className="text-center py-2 pr-3 font-medium">3m Ret</th>
              <th className="text-center py-2 pr-3 font-medium">6m Ret</th>
              <th className="text-center py-2 pr-3 font-medium">1y Ret</th>
              <th className="text-center py-2 pr-3 font-medium">Rev YoY</th>
              <th className="text-right py-2 pr-3 font-medium">Mkt Cap</th>
              <th className="text-center py-2 font-medium">Momentum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const c6 = cell6m(r.chg_6m);
              return (
                <tr key={r.sym} className="border-b border-border/40 hover:bg-surface-2/40">
                  <td className="py-1.5 pr-3 font-mono font-semibold text-text-primary">{r.sym}</td>
                  <td className="py-1.5 pr-3 text-text-muted truncate max-w-[120px]">{r.name}</td>
                  <td className="py-1.5 pr-3">
                    <span className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{ background: (SECTOR_COLORS[r.sector] ?? "#64748b") + "25", color: SECTOR_COLORS[r.sector] ?? "#94a3b8" }}>
                      {r.sector}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-center font-mono text-purple-400">{r.ai_pct}%</td>
                  <td className={cn("py-1.5 pr-3 text-center font-mono rounded", cell6m(r.chg_3m).bg, cell6m(r.chg_3m).text)}>
                    {fPct(r.chg_3m)}
                  </td>
                  <td className={cn("py-1.5 pr-3 text-center font-mono rounded", c6.bg, c6.text)}>
                    {fPct(r.chg_6m)}
                  </td>
                  <td className={cn("py-1.5 pr-3 text-center font-mono rounded", cell6m(r.chg_1y).bg, cell6m(r.chg_1y).text)}>
                    {fPct(r.chg_1y)}
                  </td>
                  <td className={cn("py-1.5 pr-3 text-center font-mono", chgColor(r.rev_yoy))}>
                    {fPct(r.rev_yoy)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-text-muted">{fBn(r.mktcap_bn)}</td>
                  <td className="py-1.5 text-center">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] border",
                      r.momentum === "Accelerating" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                      r.momentum === "Stable"        ? "bg-blue-500/15 text-blue-400 border-blue-500/30" :
                                                       "bg-red-500/15 text-red-400 border-red-500/30")}>
                      {r.momentum}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Relative Value ───────────────────────────────────────────────────────

function RelValTab({ data }: { data: AICapExDashboard }) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-text-muted mb-2">
        Head-to-head comparison of AI infrastructure pairs using composite signal score.
      </div>
      {data.relative_value.map(rv => (
        <Card key={rv.pair}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            {/* Left */}
            <div className={cn("p-3 rounded-lg border", rv.preferred === rv.sym_a ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-surface-2")}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-mono font-bold text-text-primary">{rv.sym_a}</div>
                  <div className="text-xs text-text-muted">{rv.name_a}</div>
                </div>
                {rv.preferred === rv.sym_a && <span className="text-[10px] text-emerald-400 font-semibold">PREFERRED</span>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 text-xs">
                <div><span className="text-text-muted">Score </span><span className="font-mono text-accent">{rv.score_a}</span></div>
                <div><span className="text-text-muted">6m </span><span className={cn("font-mono", chgColor(rv.chg_6m_a))}>{fPct(rv.chg_6m_a)}</span></div>
                <div><span className="text-text-muted">Rev </span><span className={cn("font-mono", chgColor(rv.rev_yoy_a))}>{fPct(rv.rev_yoy_a)}</span></div>
                <div><span className="text-text-muted">Fwd PE </span><span className="font-mono text-text-muted">{rv.pe_fwd_a ? rv.pe_fwd_a.toFixed(0) + "x" : "—"}</span></div>
              </div>
            </div>

            <div className="text-center text-xs text-text-muted font-semibold">VS</div>

            {/* Right */}
            <div className={cn("p-3 rounded-lg border", rv.preferred === rv.sym_b ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-surface-2")}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-mono font-bold text-text-primary">{rv.sym_b}</div>
                  <div className="text-xs text-text-muted">{rv.name_b}</div>
                </div>
                {rv.preferred === rv.sym_b && <span className="text-[10px] text-emerald-400 font-semibold">PREFERRED</span>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 text-xs">
                <div><span className="text-text-muted">Score </span><span className="font-mono text-accent">{rv.score_b}</span></div>
                <div><span className="text-text-muted">6m </span><span className={cn("font-mono", chgColor(rv.chg_6m_b))}>{fPct(rv.chg_6m_b)}</span></div>
                <div><span className="text-text-muted">Rev </span><span className={cn("font-mono", chgColor(rv.rev_yoy_b))}>{fPct(rv.rev_yoy_b)}</span></div>
                <div><span className="text-text-muted">Fwd PE </span><span className="font-mono text-text-muted">{rv.pe_fwd_b ? rv.pe_fwd_b.toFixed(0) + "x" : "—"}</span></div>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Tab: PM Dashboard ─────────────────────────────────────────────────────────

function PMTab({ data }: { data: AICapExDashboard }) {
  const { capex_score, global_ai_capex_annual_bn, top_longs, hyperscalers, stocks } = data;
  const avgHyperCapex = hyperscalers.reduce((a, h) => a + (h.capex_yoy ?? 0), 0) / hyperscalers.filter(h => h.capex_yoy != null).length;
  const nvda = stocks.find(s => s.sym === "NVDA");
  const mu   = stocks.find(s => s.sym === "MU");
  const vrt  = stocks.find(s => s.sym === "VRT");

  const topMetrics = [
    { label: "AI CapEx Score",    value: `${capex_score.composite}/100`, color: "text-accent" },
    { label: "Global AI CapEx",   value: fBn(global_ai_capex_annual_bn), color: "text-emerald-400" },
    { label: "Hyperscaler YoY",   value: fPct(avgHyperCapex), color: chgColor(avgHyperCapex) },
    { label: "GPU Demand (NVDA)", value: fPct(nvda?.rev_yoy), color: chgColor(nvda?.rev_yoy) },
    { label: "Memory (MU Rev)",   value: fPct(mu?.rev_yoy), color: chgColor(mu?.rev_yoy) },
    { label: "AI Cycle",          value: capex_score.cycle, color: "text-purple-400" },
  ];

  const risks = [
    "GPU supply concentration — NVDA monopoly risk",
    "Power grid bottlenecks constraining DC buildout",
    "Regulatory / geopolitical risks to TSMC supply chain",
    "CapEx normalization if AI ROI disappoints hyperscalers",
    "Memory oversupply risk if demand slows faster than expected",
  ];

  return (
    <div className="space-y-4">
      {/* Top metrics bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {topMetrics.map(m => (
          <Card key={m.label} className="text-center py-3">
            <div className="text-xs text-text-muted mb-1">{m.label}</div>
            <div className={cn("font-mono font-bold text-sm", m.color)}>{m.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Regime + outlook */}
        <Card>
          <SectionTitle icon={<Activity size={14} />} label="AI Infrastructure Regime" />
          <div className="flex items-center gap-3 mb-3">
            <RegimeBadge regime={capex_score.regime} />
            <RegimeBadge regime={capex_score.cycle} />
          </div>
          <div className="space-y-1 text-xs text-text-muted">
            <div className="font-medium text-text-primary mb-1">Composite Score: {capex_score.composite}/100</div>
            {Object.entries(capex_score.components).map(([key, c]) => (
              <div key={key} className="flex justify-between">
                <span>{c.label}</span>
                <span className="font-mono text-text-primary">{c.score}/{c.max}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Key risks */}
        <Card>
          <SectionTitle icon={<Shield size={14} />} label="Key Risks" />
          <ul className="space-y-1.5">
            {risks.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-text-muted">
                <span className="text-red-400 shrink-0 mt-0.5">▸</span>
                {r}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top longs */}
        <Card>
          <SectionTitle icon={<TrendingUp size={14} />} label="Best Long Ideas" />
          <div className="space-y-2">
            {top_longs.map(s => (
              <div key={s.sym} className="flex items-center justify-between text-xs border-b border-border/40 pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <SignalBadge signal={s.signal} />
                  <div>
                    <span className="font-mono font-semibold text-text-primary">{s.sym}</span>
                    <span className="text-text-muted ml-1">{s.name}</span>
                  </div>
                </div>
                <div className="text-right space-y-0.5">
                  <ChgSpan v={s.chg_6m} />
                  <div className="text-emerald-400 font-mono">+{s.upside_pct.toFixed(0)}% tgt</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Hyperscaler summary */}
        <Card>
          <SectionTitle icon={<Server size={14} />} label="Hyperscaler CapEx Snapshot" />
          <div className="space-y-2">
            {hyperscalers.map(h => (
              <div key={h.sym} className="flex items-center justify-between text-xs border-b border-border/40 pb-2 last:border-0">
                <div>
                  <span className="font-semibold text-text-primary">{h.name}</span>
                  <span className="text-text-muted ml-1">({h.sym})</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-text-muted">{fBn(h.capex_latest_bn)} qtr</span>
                  <ChgSpan v={h.capex_yoy} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",     label: "Overview",      icon: BarChart3 },
  { id: "hyperscalers", label: "Hyperscalers",  icon: Server },
  { id: "signals",      label: "Signals",       icon: Zap },
  { id: "heatmap",      label: "Heatmap",       icon: Activity },
  { id: "relval",       label: "Rel. Value",    icon: TrendingUp },
  { id: "pm",           label: "PM Dashboard",  icon: Target },
];

export default function AICapExPage() {
  const [tab, setTab] = useState("overview");
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ai-capex-dashboard"],
    queryFn: () => api.getAICapEx(),
    staleTime: 30 * 60 * 1000,
  });

  const handleRefresh = async () => {
    await api.refreshAICapEx();
    refetch();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-lg font-bold text-text-primary tracking-tight">AI CapEx Intelligence</h1>
          <div className="text-xs text-text-muted">
            Institutional-grade AI infrastructure spending tracker · {data?.as_of ?? "Loading…"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <div className="flex items-center gap-2">
              <RegimeBadge regime={data.capex_score.regime} />
              <RegimeBadge regime={data.capex_score.cycle} />
              <div className="font-mono text-accent font-bold text-sm">{data.capex_score.composite}/100</div>
            </div>
          )}
          <button onClick={handleRefresh} disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-2 text-text-muted hover:text-text-primary text-xs transition-colors disabled:opacity-50">
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="px-6 pt-4 shrink-0">
        <PageGuide
          title="AI CapEx Intelligence"
          subtitle="Track hyperscaler AI infrastructure spending, data center buildout, semiconductor demand, and power infrastructure investment in the AI era."
          steps={[
            { title: "Overview Tab", detail: "The composite CapEx Score (0–100) synthesizes all signals into a single investment regime: Accelerating, Steady, or Decelerating. The score drives the overall investment posture shown here." },
            { title: "Hyperscalers Tab", detail: "Deep-dive into each hyperscaler's AI capex: Microsoft, Amazon, Google, Meta, Oracle. Track quarterly capex, capex as % of revenue, YoY growth, and data center construction pipeline." },
            { title: "Semiconductors Tab", detail: "Track AI chip demand: NVDA, AMD, custom silicon (TPU, Trainium, Inferentia). Revenue from AI accelerators, data center revenue, and supply availability are tracked." },
            { title: "Power & Infrastructure Tab", detail: "AI data centers are massive electricity consumers. Track data center power demand (GW), utility company exposure (Constellation, Vistra), and grid infrastructure build needs." },
            { title: "Stocks Tab", detail: "Investment signals for AI capex beneficiaries: direct (NVDA, ALAB, SMCI), indirect (VST, ETN, AME), and emerging (quantum annealers, edge AI). Composite score with entry triggers." },
            { title: "Scenarios Tab", detail: "Scenario analysis: what happens to AI capex if LLM demand plateaus (bear), continues at current pace (base), or accelerates with agentic AI (bull). Revenue implications for key stocks in each scenario." },
          ]}
          howItWorks={[
            { title: "Capex Tracking", detail: "Quarterly capex data is parsed from 10-Q and 10-K filings for all major hyperscalers. Data center square footage announcements from press releases and earnings calls are tracked separately to catch leading indicators." },
            { title: "CapEx Score Model", detail: "The composite score weighs: QoQ capex growth acceleration (40%), order book signals from equipment makers (30%), utility power reservation applications (20%), and management guidance tone (10%). Score > 70 = accelerating; < 40 = decelerating." },
            { title: "Power Infrastructure", detail: "Data center power demand is estimated from announced GW capacity, average PUE (Power Usage Effectiveness) ratios, and GPU TDP specifications. Utility company exposure is computed from data center customer concentration in their service territories." },
            { title: "Stock Signal Generation", detail: "Beneficiary stocks are scored on: revenue growth correlated to AI capex (R² > 0.7), gross margin leverage to volume (operating leverage), competitive moat vs. new entrants, and valuation vs. 3-year normalized FCF." },
          ]}
          tips={[
            "Hyperscaler capex announcements are the single biggest driver of AI supply chain stocks — set an alert for any hyperscaler earnings where capex guidance changes ±10%.",
            "Power infrastructure stocks (Constellation, Vistra, Eaton, Vertiv) tend to lag the AI narrative but have multi-year earnings visibility from data center contracts — they're the 'picks and shovels' of the AI buildout.",
            "Custom silicon (Google TPU, Amazon Trainium, Meta's chips) will gradually reduce NVDA's TAM within hyperscalers — track the % of AI compute that runs on custom vs. merchant silicon.",
          ]}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-border shrink-0 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("flex items-center gap-1.5 px-3 py-2 text-xs rounded-t transition-colors whitespace-nowrap",
              tab === id ? "text-text-primary border-b-2 border-accent" : "text-text-muted hover:text-text-primary")}>
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <div className="text-sm text-text-muted">Fetching AI CapEx data for 20+ tickers…</div>
            <div className="text-xs text-text-muted">First load takes 30–60s · Results cached for 6h</div>
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <div className="text-red-400 text-sm mb-2">Failed to load dashboard</div>
            <div className="text-text-muted text-xs">{String(error)}</div>
          </div>
        )}

        {data && !isLoading && (
          <>
            {tab === "overview"     && <OverviewTab data={data} />}
            {tab === "hyperscalers" && <HyperscalersTab data={data} />}
            {tab === "signals"      && <SignalsTab data={data} />}
            {tab === "heatmap"      && <HeatmapTab data={data} />}
            {tab === "relval"       && <RelValTab data={data} />}
            {tab === "pm"           && <PMTab data={data} />}
          </>
        )}
      </div>
    </div>
  );
}
