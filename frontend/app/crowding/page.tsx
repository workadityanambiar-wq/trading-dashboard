"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { api, CrowdingResult, SectorCrowding } from "@/lib/api";
import { cn } from "@/lib/utils";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";
import {
  GlassCard, AIInsightBanner, SectionHeader, PulsingDot, ProgressRing,
} from "@/components/ui/premium";
import {
  TrendingUp, TrendingDown, RefreshCw, Layers, Users, BarChart3,
  Activity, Zap, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronRight,
  LayoutDashboard, Flame,
} from "lucide-react";

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreHex(s: number | null): string {
  if (s == null) return "#6b7280";
  if (s >= 75) return "#ef4444";
  if (s >= 60) return "#f97316";
  if (s >= 40) return "#eab308";
  if (s >= 25) return "#14b8a6";
  return "#22c55e";
}

function scoreTw(s: number | null): string {
  if (s == null) return "text-text-muted";
  if (s >= 75) return "text-red-400";
  if (s >= 60) return "text-orange-400";
  if (s >= 40) return "text-yellow-400";
  if (s >= 25) return "text-teal-400";
  return "text-emerald-400";
}

function riskLabel(s: number): string {
  if (s >= 80) return "Extreme";
  if (s >= 68) return "Elevated";
  if (s >= 50) return "Moderate";
  if (s >= 35) return "Low";
  return "Minimal";
}

// ── Derived scores ────────────────────────────────────────────────────────────

function smartScore(r: CrowdingResult): number {
  const inst    = ((r.inst_pct ?? 50) / 100) * 40;
  const buy     = ((r.buy_pct  ?? 50) / 100) * 30;
  const upg     = Math.min(Math.max(r.net_upgrades, 0) / 5, 1) * 20;
  const noShort = (1 - Math.min((r.short_pct ?? 20) / 50, 1)) * 10;
  return Math.round(inst + buy + upg + noShort);
}

function emergingTrend(r: CrowdingResult): number {
  return (r.mo_1m ?? 0) * 2 + r.net_upgrades * 5 + (r.crowding_score ?? 0) * 0.3;
}

function buildInsight(
  marketScore: number,
  sectors: SectorCrowding[],
  results: CrowdingResult[],
) {
  const top1 = sectors[0]?.sector ?? "Technology";
  const top2 = sectors[1]?.sector ?? "Financials";
  const risk = riskLabel(marketScore);
  const extremeCount = results.filter(r => (r.crowding_score ?? 0) >= 75).length;

  const text =
    `Market crowding at ${marketScore}/100 — ${risk.toLowerCase()} risk territory. ` +
    `${top1} and ${top2} carry the heaviest institutional concentration. ` +
    `${extremeCount} stocks are in extreme crowding (≥75), elevating systemic unwind risk.`;

  const bullCase =
    marketScore < 55
      ? "Low crowding leaves room for institutional accumulation. Undiscovered names offer asymmetric entry before consensus forms."
      : "Strong institutional conviction underpins current positions. Momentum may continue short-term as latecomers pile in.";

  const bearCase =
    marketScore >= 65
      ? `Crowding at the ${marketScore}th percentile historically precedes positioning-driven corrections. Exit liquidity is compressed.`
      : "Rising institutional concentration limits upside as consensus becomes crowded. Monitor for sector-level unwinds.";

  const riskText =
    `If positioning reverts to historical mean (≈48), expect +${Math.round((marketScore - 48) * 0.25 + 3)}% incremental drawdown. Focus risk management on ${top1}.`;

  const confidence = marketScore >= 72 ? 0.81 : marketScore >= 55 ? 0.67 : 0.58;
  const sentiment: "bullish" | "bearish" | "neutral" | "warning" =
    marketScore >= 72 ? "warning" : marketScore >= 58 ? "bearish" : marketScore <= 38 ? "bullish" : "neutral";

  return { text, bullCase, bearCase, risk: riskText, confidence, sentiment };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CrowdingBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-text-muted text-xs">—</span>;
  const [label, tw] = score >= 75
    ? ["Extreme",  "bg-red-500/15 text-red-400 border-red-500/25"]
    : score >= 60
    ? ["Crowded",  "bg-orange-500/15 text-orange-400 border-orange-500/25"]
    : score >= 40
    ? ["Moderate", "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"]
    : score >= 25
    ? ["Radar",    "bg-teal-500/15 text-teal-400 border-teal-500/25"]
    : ["Hidden",   "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"];
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", tw)}>
      {label}
    </span>
  );
}

function MiniBar({
  value, max = 100, color,
}: { value: number | null; max?: number; color?: string }) {
  const pct = value != null ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color ?? "#6366f1" }}
        />
      </div>
      <span className="text-[10px] font-mono text-text-muted w-8 text-right">
        {value != null ? value.toFixed(0) : "—"}
      </span>
    </div>
  );
}

function MiniRing({ score, size = 32 }: { score: number | null; size?: number }) {
  const c = scoreHex(score);
  const r = size / 2 - 3;
  const circ = 2 * Math.PI * r;
  const dash = ((score ?? 0) / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={3} />
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke={c} strokeWidth={3}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${c}60)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[8px] font-bold" style={{ color: c }}>{score?.toFixed(0)}</span>
      </div>
    </div>
  );
}

// Emerging trade card (compact list)
function EmergingRow({
  r, rank,
}: { r: CrowdingResult; rank: number }) {
  const ss = smartScore(r);
  const mo = r.mo_1m;
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:border-border-2 hover:bg-surface-2 transition-all cursor-pointer group">
      <span className="text-[10px] text-text-faint w-4 text-center">{rank}</span>
      <MiniRing score={r.crowding_score} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-bold text-accent">{r.ticker}</span>
          {mo != null && mo > 2 && <ArrowUpRight size={11} className="text-positive" />}
          {mo != null && mo < -2 && <ArrowDownRight size={11} className="text-negative" />}
        </div>
        <div className="text-[10px] text-text-faint truncate">{r.sector}</div>
      </div>
      <div className="text-center shrink-0">
        <div className="text-[11px] font-bold" style={{ color: ss >= 70 ? "#6366f1" : ss >= 50 ? "#3b82f6" : "#6b7280" }}>
          {ss}
        </div>
        <div className="text-[8px] text-text-faint">SM</div>
      </div>
      <div className={cn("text-right shrink-0 min-w-[40px]",
        mo != null && mo > 0 ? "text-positive" : mo != null && mo < 0 ? "text-negative" : "text-text-muted"
      )}>
        <div className="text-[12px] font-semibold">
          {mo != null ? `${mo > 0 ? "+" : ""}${mo.toFixed(1)}%` : "—"}
        </div>
        <div className="text-[8px] text-text-faint">1M</div>
      </div>
    </div>
  );
}

// Emerging card (grid layout)
function EmergingCard({ r, rank }: { r: CrowdingResult; rank: number }) {
  const ss = smartScore(r);
  const mo = r.mo_1m;
  const color = scoreHex(r.crowding_score);
  return (
    <div className="premium-card p-4 cursor-pointer hover:translate-y-[-2px] transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] text-text-faint mb-0.5 flex items-center gap-1">
            <Flame size={9} className="text-orange-400" /> #{rank} Emerging
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-bold text-accent">{r.ticker}</span>
            <CrowdingBadge score={r.crowding_score} />
          </div>
          <div className="text-[10px] text-text-muted truncate max-w-[130px]">{r.name}</div>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-bold tabular-nums leading-none" style={{ color }}>
            {r.crowding_score?.toFixed(0)}
          </div>
          <div className="text-[9px] text-text-faint">crowding</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center border-t border-border pt-2.5 mb-2.5">
        <div>
          <div className={cn("text-[13px] font-bold", mo != null && mo > 0 ? "text-positive" : "text-negative")}>
            {mo != null ? `${mo > 0 ? "+" : ""}${mo.toFixed(1)}%` : "—"}
          </div>
          <div className="text-[9px] text-text-faint">1M</div>
        </div>
        <div>
          <div className="text-[13px] font-bold" style={{ color: ss >= 60 ? "#6366f1" : "#6b7280" }}>{ss}</div>
          <div className="text-[9px] text-text-faint">Smart$</div>
        </div>
        <div>
          <div className={cn("text-[13px] font-bold",
            r.net_upgrades > 0 ? "text-positive" : r.net_upgrades < 0 ? "text-negative" : "text-text-muted"
          )}>
            {r.net_upgrades > 0 ? "+" : ""}{r.net_upgrades}
          </div>
          <div className="text-[9px] text-text-faint">Net Upg</div>
        </div>
      </div>

      <MiniBar value={r.inst_pct} max={100} color="#6366f1" />
      <div className="text-[9px] text-text-faint mt-0.5">Institutional ownership</div>
    </div>
  );
}

// Bloomberg-style sector card
function SectorCard({ s, all }: { s: SectorCrowding; all: CrowdingResult[] }) {
  const stocks = all.filter(r => r.sector === s.sector);
  const sorted = [...stocks].sort((a, b) => (b.crowding_score ?? 0) - (a.crowding_score ?? 0));
  const top     = sorted[0];
  const bottom  = sorted[sorted.length - 1];
  const avgInst = stocks.length
    ? stocks.reduce((acc, r) => acc + (r.inst_pct ?? 0), 0) / stocks.length
    : 0;
  const color = scoreHex(s.avg_score);

  const SHORT: Record<string, string> = {
    "Communication Services": "Comm. Services",
    "Consumer Discretionary": "Cons. Disc.",
    "Consumer Staples": "Cons. Staples",
    "Information Technology": "Technology",
  };

  return (
    <div className="premium-card p-4 hover:translate-y-[-1px] transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] text-text-faint uppercase tracking-wider mb-0.5">Sector</div>
          <div className="text-[13px] font-bold text-text-primary">{SHORT[s.sector] ?? s.sector}</div>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-bold tabular-nums leading-none" style={{ color }}>{s.avg_score}</div>
          <div className="text-[9px] text-text-muted">/ 100</div>
        </div>
      </div>

      <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${s.avg_score}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}40` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] mb-3">
        <div className="flex justify-between">
          <span className="text-text-faint">Stocks</span>
          <span className="font-semibold text-text-primary">{s.count}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-faint">Avg Inst</span>
          <span className="font-semibold text-text-primary">{avgInst.toFixed(0)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-faint">Risk</span>
          <span className="font-semibold" style={{ color }}>{riskLabel(s.avg_score)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-faint">Percentile</span>
          <span className="font-semibold text-text-primary">{s.avg_score}th</span>
        </div>
      </div>

      {top && (
        <div className="border-t border-border pt-2.5 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-text-faint">Most Crowded</span>
            <span className="text-[11px] font-bold text-red-400">{top.ticker}</span>
          </div>
          {bottom && bottom.ticker !== top.ticker && (
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-text-faint">Least Crowded</span>
              <span className="text-[11px] font-bold text-emerald-400">{bottom.ticker}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Distribution histogram
function DistributionChart({ results }: { results: CrowdingResult[] }) {
  const buckets = useMemo(() => {
    const b = Array.from({ length: 10 }, (_, i) => ({
      label: `${i * 10}–${i * 10 + 10}`,
      mid:   i * 10 + 5,
      count: 0,
    }));
    for (const r of results) {
      const idx = Math.min(Math.floor((r.crowding_score ?? 0) / 10), 9);
      b[idx].count++;
    }
    return b;
  }, [results]);

  const mean = results.length
    ? results.reduce((s, r) => s + (r.crowding_score ?? 50), 0) / results.length
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] font-semibold text-text-primary">
          Mean score: <span style={{ color: scoreHex(mean) }}>{mean.toFixed(1)}</span>
        </div>
        <div className="flex gap-3 text-[10px] text-text-muted">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />≥75</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />≥60</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />≥40</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={buckets} barSize={22} margin={{ top: 2, right: 0, left: -24, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#56566a" }} />
          <YAxis tick={{ fontSize: 9, fill: "#56566a" }} />
          <Tooltip
            contentStyle={{ background: "#0e0e14", border: "1px solid #26263a", borderRadius: 8, fontSize: 11 }}
            formatter={(v: number) => [v, "Stocks"]}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {buckets.map(b => (
              <Cell key={b.label} fill={scoreHex(b.mid)} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Interactive heatmap (sector tiles + stock grid)
function HeatmapView({
  sectors, all,
}: { sectors: SectorCrowding[]; all: CrowdingResult[] }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const SHORT: Record<string, string> = {
    "Communication Services": "Comm",
    "Consumer Discretionary": "Disc",
    "Consumer Staples": "Staples",
    "Information Technology": "Tech",
    "Health Care": "Health",
    "Real Estate": "RE",
  };

  return (
    <div className="space-y-6">
      {/* Sector macro tiles */}
      <div>
        <div className="text-[11px] text-text-faint uppercase tracking-wider mb-3">
          Sector tiles — size proportional to stock count · hover to see top holdings
        </div>
        <div className="flex gap-2 flex-wrap">
          {sectors.map(s => {
            const color = scoreHex(s.avg_score);
            const top3  = [...all.filter(r => r.sector === s.sector)]
              .sort((a, b) => (b.crowding_score ?? 0) - (a.crowding_score ?? 0))
              .slice(0, 3);
            const isHov = hovered === s.sector;

            return (
              <div
                key={s.sector}
                onMouseEnter={() => setHovered(s.sector)}
                onMouseLeave={() => setHovered(null)}
                className="relative rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden"
                style={{
                  flex: `${Math.max(s.count, 5)} 0 0`,
                  minWidth: 80,
                  maxWidth: 180,
                  height: 110,
                  borderColor: isHov ? color : `${color}30`,
                  background: isHov ? `${color}18` : `${color}08`,
                }}
              >
                {/* Fill indicator */}
                <div
                  className="absolute bottom-0 left-0 right-0 transition-all duration-500"
                  style={{ height: `${s.avg_score * 0.5}%`, background: `${color}20` }}
                />
                <div className="relative p-3 h-full flex flex-col">
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
                    {SHORT[s.sector] ?? s.sector}
                  </div>
                  <div className="text-[22px] font-bold tabular-nums mt-auto leading-none" style={{ color }}>
                    {s.avg_score}
                  </div>
                  <div className="text-[9px] text-text-faint">{s.count} stocks</div>

                  {isHov && top3.length > 0 && (
                    <div className="absolute inset-0 bg-surface/96 p-3 flex flex-col gap-1.5">
                      <div className="text-[10px] font-bold text-text-muted uppercase mb-0.5">
                        {SHORT[s.sector] ?? s.sector}
                      </div>
                      {top3.map(r => (
                        <div key={r.ticker} className="flex justify-between items-center">
                          <span className="text-[11px] font-bold text-accent">{r.ticker}</span>
                          <span className="text-[11px] font-bold" style={{ color: scoreHex(r.crowding_score) }}>
                            {r.crowding_score?.toFixed(0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Individual stock grid */}
      <div>
        <div className="text-[11px] text-text-faint uppercase tracking-wider mb-3">
          All stocks — color = crowding level · hover for details
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1">
          {all.map(r => {
            const c = scoreHex(r.crowding_score);
            return (
              <div
                key={r.ticker}
                title={`${r.ticker}: ${r.crowding_score?.toFixed(0)} — ${r.crowding_label}`}
                className="h-9 rounded flex items-center justify-center text-[9px] font-bold cursor-pointer hover:opacity-75 transition-opacity"
                style={{
                  backgroundColor: `${c}22`,
                  color: c,
                  border: `1px solid ${c}30`,
                }}
              >
                {r.ticker}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Redesigned stock table row
function StockRow({
  r, onChart,
}: { r: CrowdingResult; onChart: (t: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const ss    = smartScore(r);
  const color = scoreHex(r.crowding_score);
  const mo    = r.mo_1m;

  return (
    <>
      <tr
        onClick={() => setExpanded(p => !p)}
        className="border-b border-border/30 hover:bg-surface-2/60 cursor-pointer transition-all group"
      >
        {/* Rank */}
        <td className="px-3 py-2.5 text-[11px] text-text-faint font-mono w-8 shrink-0">{r.rank}</td>

        {/* Ticker */}
        <td className="px-3 py-2.5 w-32">
          <div
            onClick={e => { e.stopPropagation(); onChart(r.ticker); }}
            className="flex items-center gap-1 cursor-pointer"
          >
            <span className="text-[13px] font-bold text-accent hover:underline">{r.ticker}</span>
            {expanded
              ? <ChevronDown size={10} className="text-text-muted" />
              : <ChevronRight size={10} className="text-text-muted opacity-0 group-hover:opacity-100" />}
          </div>
          <div className="text-[10px] text-text-faint truncate max-w-[110px]">{r.name}</div>
        </td>

        {/* Sector */}
        <td className="px-3 py-2.5 hidden md:table-cell">
          <span className="text-[10px] text-text-muted">{r.sector}</span>
        </td>

        {/* Crowding meter */}
        <td className="px-3 py-2.5 w-44">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-2.5 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${r.crowding_score ?? 0}%`,
                  backgroundColor: color,
                  boxShadow: `0 0 5px ${color}50`,
                }}
              />
            </div>
            <span className="text-[12px] font-bold font-mono w-8 text-right" style={{ color }}>
              {r.crowding_score?.toFixed(0) ?? "—"}
            </span>
          </div>
          <CrowdingBadge score={r.crowding_score} />
        </td>

        {/* Ownership visual */}
        <td className="px-3 py-2.5 hidden lg:table-cell w-36">
          <div className="space-y-1">
            <div>
              <div className="text-[9px] text-text-faint mb-0.5">Institutional</div>
              <MiniBar value={r.inst_pct} max={100} color="#6366f1" />
            </div>
            <div>
              <div className="text-[9px] text-text-faint mb-0.5">Short Interest</div>
              <MiniBar
                value={r.short_pct}
                max={50}
                color={r.short_pct != null && r.short_pct > 15 ? "#ef4444" : "#14b8a6"}
              />
            </div>
          </div>
        </td>

        {/* Analyst consensus bar */}
        <td className="px-3 py-2.5 hidden xl:table-cell w-28">
          <div className="h-2.5 bg-surface-3 rounded-full overflow-hidden flex mb-1">
            <div style={{ width: `${r.buy_pct ?? 0}%`, backgroundColor: "#22c55e" }} className="h-full" />
            <div style={{ width: `${r.hold_pct ?? 0}%`, backgroundColor: "#eab308" }} className="h-full" />
            <div style={{ width: `${r.sell_pct ?? 0}%`, backgroundColor: "#ef4444" }} className="h-full" />
          </div>
          <div className="text-[10px]">
            <span className="text-positive">{r.buy_pct?.toFixed(0) ?? "—"}%</span>
            <span className="text-text-faint"> Buy</span>
            {r.net_upgrades !== 0 && (
              <span className={cn("ml-1.5", r.net_upgrades > 0 ? "text-positive" : "text-negative")}>
                {r.net_upgrades > 0 ? "+" : ""}{r.net_upgrades}
              </span>
            )}
          </div>
        </td>

        {/* Smart Money */}
        <td className="px-3 py-2.5 hidden lg:table-cell w-20 text-center">
          <div className="flex flex-col items-center">
            <span
              className="text-[13px] font-bold"
              style={{ color: ss >= 70 ? "#6366f1" : ss >= 50 ? "#3b82f6" : "#6b7280" }}
            >
              {ss}
            </span>
            <div className="w-10 h-1 bg-surface-3 rounded-full overflow-hidden mt-0.5">
              <div
                className="h-full rounded-full"
                style={{ width: `${ss}%`, backgroundColor: ss >= 70 ? "#6366f1" : "#3b82f6" }}
              />
            </div>
          </div>
        </td>

        {/* 1M momentum */}
        <td className="px-3 py-2.5 w-20 text-right">
          <span className={cn("text-[12px] font-semibold tabular-nums",
            mo != null && mo > 0 ? "text-positive" : mo != null && mo < 0 ? "text-negative" : "text-text-muted"
          )}>
            {mo != null ? `${mo > 0 ? "+" : ""}${mo.toFixed(1)}%` : "—"}
          </span>
          {r.squeeze_candidate && (
            <div className="text-[9px] text-orange-400 font-bold">⚡ SQZ</div>
          )}
        </td>
      </tr>

      {/* Expanded detail panel */}
      {expanded && (
        <tr>
          <td colSpan={8} className="px-4 py-4 bg-surface-2/40 border-b border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {/* Crowding drivers */}
              <div>
                <div className="text-[10px] text-text-faint uppercase tracking-wider mb-2">Crowding Drivers</div>
                <div className="space-y-2">
                  {[
                    { label: "Inst. Ownership", value: r.inst_pct, color: "#6366f1", weight: "40%" },
                    { label: "Analyst Buy %",   value: r.buy_pct,  color: "#3b82f6", weight: "30%" },
                    { label: "Low Short Int.",   value: r.short_pct != null ? 100 - Math.min(r.short_pct * 2, 100) : null, color: "#14b8a6", weight: "20%" },
                    { label: "News Volume",      value: Math.min((r.news_count ?? 0) * 5, 100), color: "#f59e0b", weight: "10%" },
                  ].map(({ label, value, color: c, weight }) => (
                    <div key={label}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-text-muted">{label}</span>
                        <span className="text-text-faint">{weight}</span>
                      </div>
                      <MiniBar value={value} max={100} color={c} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Key metrics */}
              <div>
                <div className="text-[10px] text-text-faint uppercase tracking-wider mb-2">Key Metrics</div>
                <div className="space-y-1.5">
                  {([
                    ["Target Upside", r.target_upside != null ? `${r.target_upside > 0 ? "+" : ""}${r.target_upside.toFixed(1)}%` : "—", r.target_upside != null && r.target_upside > 0, r.target_upside != null && r.target_upside < 0],
                    ["Insider %",     r.insider_pct  != null ? `${r.insider_pct.toFixed(1)}%` : "—", false, false],
                    ["Short Ratio",   r.short_ratio  != null ? `${r.short_ratio.toFixed(1)}d`  : "—", false, false],
                    ["News (7d)",     String(r.news_count), false, false],
                    ["# Analysts",    String(r.num_analysts), false, false],
                  ] as [string, string, boolean, boolean][]).map(([label, value, pos, neg]) => (
                    <div key={label} className="flex justify-between text-[11px]">
                      <span className="text-text-muted">{label}</span>
                      <span className={cn("font-mono font-semibold", pos ? "text-positive" : neg ? "text-negative" : "text-text-primary")}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price momentum */}
              <div>
                <div className="text-[10px] text-text-faint uppercase tracking-wider mb-2">Momentum</div>
                <div className="space-y-1.5">
                  {([
                    ["1 Month", r.mo_1m],
                    ["3 Month", r.mo_3m],
                  ] as [string, number | null][]).map(([label, val]) => (
                    <div key={label} className="flex justify-between text-[11px]">
                      <span className="text-text-muted">{label}</span>
                      <span className={cn("font-mono font-semibold",
                        val != null && val > 0 ? "text-positive" : val != null && val < 0 ? "text-negative" : "text-text-muted"
                      )}>
                        {val != null ? `${val > 0 ? "+" : ""}${val.toFixed(1)}%` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                {r.squeeze_candidate && (
                  <div className="mt-3 p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/25">
                    <div className="text-[11px] text-orange-400 font-bold flex items-center gap-1.5">
                      <Zap size={11} /> Short Squeeze Setup
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      Short {r.short_pct?.toFixed(0)}% of float · momentum {r.mo_1m != null ? `+${r.mo_1m.toFixed(1)}%` : "rising"}
                    </div>
                  </div>
                )}
              </div>

              {/* Smart money */}
              <div>
                <div className="text-[10px] text-text-faint uppercase tracking-wider mb-2">Smart Money</div>
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="text-[28px] font-bold tabular-nums"
                    style={{ color: ss >= 70 ? "#6366f1" : ss >= 50 ? "#3b82f6" : "#6b7280" }}
                  >
                    {ss}
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-text-primary">Composite</div>
                    <div className="text-[10px] text-text-faint">Smart$ Score</div>
                  </div>
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Upgrades 90d</span>
                    <span className={r.upgrades_90d > 0 ? "text-positive font-semibold" : "text-text-primary"}>+{r.upgrades_90d}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Downgrades 90d</span>
                    <span className={r.downgrades_90d > 0 ? "text-negative font-semibold" : "text-text-primary"}>{r.downgrades_90d}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Rec. Mean</span>
                    <span className="text-text-primary font-mono">{r.rec_mean?.toFixed(2) ?? "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ViewMode = "overview" | "heatmap" | "emerging" | "sectors" | "distribution" | "stocks";

const VIEWS: { id: ViewMode; label: string; icon: React.ElementType }[] = [
  { id: "overview",     label: "Overview",      icon: LayoutDashboard },
  { id: "heatmap",      label: "Heatmap",       icon: Layers },
  { id: "emerging",     label: "Emerging",      icon: Flame },
  { id: "sectors",      label: "Sectors",       icon: BarChart3 },
  { id: "distribution", label: "Distribution",  icon: Activity },
  { id: "stocks",       label: "Stocks",        icon: Users },
];

export default function CrowdingPage() {
  const [view, setView]         = useState<ViewMode>("overview");
  const [universe, setUniverse] = useState("sp500");
  const [search, setSearch]     = useState("");
  const [drawer, setDrawer]     = useState<DrawerConfig | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey:  ["crowding", universe],
    queryFn:   () => api.getCrowding(universe, 150),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const results = data?.results ?? [];
  const sectors = data?.sector_crowding ?? [];

  const marketScore = useMemo(() => {
    if (!results.length) return null;
    return Math.round(results.reduce((s, r) => s + (r.crowding_score ?? 50), 0) / results.length);
  }, [results]);

  const extremeCount = results.filter(r => (r.crowding_score ?? 0) >= 75).length;
  const crowdedCount = results.filter(r => (r.crowding_score ?? 0) >= 60).length;
  const squeezeCount = results.filter(r => r.squeeze_candidate).length;

  const emerging = useMemo(() =>
    results
      .filter(r => {
        const s = r.crowding_score ?? 0;
        return s >= 38 && s <= 70 && (r.mo_1m ?? -999) > 0.5 && r.net_upgrades >= 0;
      })
      .sort((a, b) => emergingTrend(b) - emergingTrend(a))
      .slice(0, 15),
    [results],
  );

  const insight = useMemo(
    () => (marketScore != null && results.length ? buildInsight(marketScore, sectors, results) : null),
    [marketScore, sectors, results],
  );

  const filteredResults = useMemo(() => {
    if (!search) return results;
    const q = search.toLowerCase();
    return results.filter(r =>
      r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
  }, [results, search]);

  const topCrowded = results.filter(r => (r.crowding_score ?? 0) >= 60).slice(0, 8);
  const ringColor  = marketScore ? scoreHex(marketScore) : "#6366f1";

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <PulsingDot color="#6366f1" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-accent">
                Crowding Intelligence
              </span>
            </div>
            <h1 className="text-[22px] font-bold text-text-primary">Institutional Positioning</h1>
            <p className="text-[12px] text-text-muted mt-0.5">
              {results.length > 0
                ? `${results.length} stocks · ${sectors.length} sectors · as of ${data?.as_of}`
                : "Positioning intelligence platform"}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={universe}
              onChange={e => setUniverse(e.target.value)}
              className="h-8 px-2 text-[12px] bg-surface-2 border border-border rounded-lg text-text-primary"
            >
              <option value="sp500">S&amp;P 500</option>
              <option value="nasdaq100">Nasdaq 100</option>
            </select>
            <button
              onClick={() => refetch()}
              className="h-8 px-3 flex items-center gap-1.5 text-[12px] bg-accent/15 border border-accent/30 text-accent rounded-lg hover:bg-accent/25 transition-colors"
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        </div>

        {/* Market score card + AI insight */}
        {isLoading ? (
          <div className="flex items-center gap-3 text-text-muted text-[13px]">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Fetching institutional, analyst &amp; short data… (~30–60s first load)
          </div>
        ) : isError ? (
          <div className="text-negative text-[13px]">Failed to load — check backend.</div>
        ) : marketScore != null && insight ? (
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
            {/* Score panel */}
            <div className="flex items-center gap-5 p-4 rounded-2xl premium-card">
              <ProgressRing
                score={marketScore}
                color={ringColor}
                size={96}
                strokeWidth={7}
                label={`${marketScore}`}
              />
              <div>
                <div className="text-[10px] text-text-faint uppercase tracking-wider">Market Crowding</div>
                <div className="text-[28px] font-bold tabular-nums leading-tight" style={{ color: ringColor }}>
                  {marketScore}
                  <span className="text-[14px] text-text-muted font-normal">/100</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ color: ringColor, borderColor: `${ringColor}40`, background: `${ringColor}12` }}
                  >
                    {riskLabel(marketScore)} Risk
                  </span>
                  <span className="text-[11px] text-text-muted">{marketScore}th pct</span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                  <span className="text-text-faint">Extreme ≥75</span>
                  <span className="text-red-400 font-bold">{extremeCount}</span>
                  <span className="text-text-faint">Crowded ≥60</span>
                  <span className="text-orange-400 font-bold">{crowdedCount}</span>
                  <span className="text-text-faint">Emerging</span>
                  <span className="text-accent font-bold">{emerging.length}</span>
                  <span className="text-text-faint">Squeeze</span>
                  <span className="text-yellow-400 font-bold">{squeezeCount}</span>
                </div>
              </div>
            </div>

            {/* AI Insight */}
            <AIInsightBanner
              insight={insight.text}
              bullCase={insight.bullCase}
              bearCase={insight.bearCase}
              risk={insight.risk}
              confidence={insight.confidence}
              sentiment={insight.sentiment}
            />
          </div>
        ) : null}
      </div>

      {/* ── TAB NAV ──────────────────────────────────────────────────────────── */}
      <div className="px-6 border-b border-border flex items-center gap-0.5 overflow-x-auto shrink-0">
        {VIEWS.map(v => {
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium whitespace-nowrap border-b-2 transition-colors",
                view === v.id
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text-primary",
              )}
            >
              <Icon size={12} />
              {v.label}
              {v.id === "emerging" && emerging.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 text-[9px] font-bold bg-accent/20 text-accent rounded-full">
                  {emerging.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── CONTENT ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-[13px] text-text-muted">Analyzing institutional positioning…</p>
            <p className="text-[11px] text-text-faint">First load takes 30–60s (fetching 150 tickers)</p>
          </div>
        )}

        {!isLoading && !isError && results.length > 0 && (
          <>
            {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
            {view === "overview" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Most crowded list */}
                <div>
                  <SectionHeader title="Most Crowded" subtitle="Extreme institutional concentration risk" />
                  <div className="space-y-2 mt-3">
                    {topCrowded.map((r, i) => (
                      <div
                        key={r.ticker}
                        className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:border-border-2 hover:bg-surface-2 transition-all cursor-pointer"
                        onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${r.ticker}`, color: "#6366f1" })}
                      >
                        <span className="text-[10px] text-text-faint w-4 text-center">{i + 1}</span>
                        <MiniRing score={r.crowding_score} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-accent">{r.ticker}</span>
                            <CrowdingBadge score={r.crowding_score} />
                          </div>
                          <div className="text-[10px] text-text-faint truncate">{r.sector}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[13px] font-bold" style={{ color: scoreHex(r.crowding_score) }}>
                            {r.crowding_score?.toFixed(0)}
                          </div>
                          <div className="w-14 h-1.5 bg-surface-3 rounded-full overflow-hidden mt-0.5">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${r.crowding_score ?? 0}%`, backgroundColor: scoreHex(r.crowding_score) }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Emerging trades */}
                <div>
                  <SectionHeader title="Emerging Crowding" subtitle="Building momentum — act before consensus" />
                  <div className="space-y-2 mt-3">
                    {emerging.slice(0, 8).map((r, i) => (
                      <EmergingRow key={r.ticker} r={r} rank={i + 1} />
                    ))}
                  </div>
                </div>

                {/* Right column: distribution + sector strip */}
                <div className="space-y-5">
                  <div>
                    <SectionHeader title="Score Distribution" subtitle="Positioning concentration across the universe" />
                    <div className="mt-3 premium-card p-4">
                      <DistributionChart results={results} />
                    </div>
                  </div>

                  <div>
                    <SectionHeader title="Sector Crowding" subtitle="Institutional concentration by sector" />
                    <div className="mt-3 space-y-2">
                      {sectors.map(s => (
                        <div key={s.sector} className="flex items-center gap-2">
                          <span className="text-[10px] text-text-muted w-28 shrink-0 truncate">{s.sector}</span>
                          <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${s.avg_score}%`, backgroundColor: scoreHex(s.avg_score) }}
                            />
                          </div>
                          <span
                            className="text-[11px] font-mono font-bold w-7 text-right"
                            style={{ color: scoreHex(s.avg_score) }}
                          >
                            {s.avg_score}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── HEATMAP ──────────────────────────────────────────────────── */}
            {view === "heatmap" && (
              <div>
                <SectionHeader
                  title="Crowding Heatmap"
                  subtitle="Sector tiles (size = stock count, hover for top holdings) + individual stock grid"
                />
                <div className="mt-4">
                  <HeatmapView sectors={sectors} all={results} />
                </div>
              </div>
            )}

            {/* ── EMERGING ─────────────────────────────────────────────────── */}
            {view === "emerging" && (
              <div>
                <SectionHeader
                  title="Emerging Crowding"
                  subtitle={`${emerging.length} stocks building institutional momentum — identify before the crowd`}
                />
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {emerging.map((r, i) => (
                    <div
                      key={r.ticker}
                      onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${r.ticker}`, color: "#6366f1" })}
                    >
                      <EmergingCard r={r} rank={i + 1} />
                    </div>
                  ))}
                  {emerging.length === 0 && (
                    <div className="col-span-3 text-center text-text-muted py-12 text-[13px]">
                      No emerging crowding signals with current filter criteria.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── SECTORS ──────────────────────────────────────────────────── */}
            {view === "sectors" && (
              <div>
                <SectionHeader title="Sector Positioning" subtitle="Institutional crowding by GICS sector" />
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {sectors.map(s => (
                    <SectorCard key={s.sector} s={s} all={results} />
                  ))}
                </div>
              </div>
            )}

            {/* ── DISTRIBUTION ─────────────────────────────────────────────── */}
            {view === "distribution" && (
              <div className="max-w-3xl">
                <SectionHeader
                  title="Crowding Distribution"
                  subtitle="How is institutional positioning distributed across the market?"
                />
                <div className="mt-4 premium-card p-6">
                  <DistributionChart results={results} />

                  <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-4">
                    {[
                      { label: "Extreme (≥75)", count: extremeCount, color: "#ef4444" },
                      { label: "Crowded (≥60)", count: crowdedCount, color: "#f97316" },
                      { label: "Emerging",      count: emerging.length, color: "#6366f1" },
                    ].map(({ label, count, color }) => (
                      <div key={label} className="text-center">
                        <div className="text-[24px] font-bold tabular-nums" style={{ color }}>{count}</div>
                        <div className="text-[11px] text-text-muted">{label}</div>
                        <div className="text-[10px] text-text-faint">
                          {results.length ? `${((count / results.length) * 100).toFixed(1)}% of universe` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── STOCKS ───────────────────────────────────────────────────── */}
            {view === "stocks" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <SectionHeader
                    title="Stock Intelligence"
                    subtitle={`${filteredResults.length} stocks · ranked by crowding score`}
                  />
                  <input
                    type="text"
                    placeholder="Search ticker or name…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="h-8 px-3 text-[12px] bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none w-52"
                  />
                </div>

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full border-collapse">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr className="border-b border-border text-[10px] text-text-faint uppercase tracking-wider">
                        <th className="px-3 py-2.5 text-left w-8">#</th>
                        <th className="px-3 py-2.5 text-left">Ticker</th>
                        <th className="px-3 py-2.5 text-left hidden md:table-cell">Sector</th>
                        <th className="px-3 py-2.5 text-left w-44">Crowding Meter</th>
                        <th className="px-3 py-2.5 text-left hidden lg:table-cell w-36">Ownership</th>
                        <th className="px-3 py-2.5 text-left hidden xl:table-cell w-28">Analyst</th>
                        <th className="px-3 py-2.5 text-center hidden lg:table-cell w-20">Smart$</th>
                        <th className="px-3 py-2.5 text-right w-20">1M</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map(r => (
                        <StockRow
                          key={r.ticker}
                          r={r}
                          onChart={t => setDrawer({ fetchUrl: `/api/chart/stock/${t}`, color: "#6366f1" })}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="mt-4 flex items-center gap-5 text-[10px] text-text-muted flex-wrap">
                  {[
                    { label: "Extreme ≥75",  color: "#ef4444" },
                    { label: "Crowded ≥60",  color: "#f97316" },
                    { label: "Moderate ≥40", color: "#eab308" },
                    { label: "Radar ≥25",    color: "#14b8a6" },
                    { label: "Hidden <25",   color: "#22c55e" },
                  ].map(({ label, color }) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      {label}
                    </span>
                  ))}
                  <span className="ml-auto opacity-50">
                    Score = 40% Inst · 30% Buy% · 20% Low Short · 10% News
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}
