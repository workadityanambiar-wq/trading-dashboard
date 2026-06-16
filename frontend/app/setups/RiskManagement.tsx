"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Flame, Shield, TrendingDown, Activity, Calculator,
  BarChart2, Target, ChevronDown, ChevronUp,
  Plus, Trash2, RefreshCw, Zap, AlertTriangle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Trade {
  id: string;
  ticker: string;
  shares: number;
  entry: number;
  stop: number;
  currentPrice: number;
  sector?: string;
}

interface RiskState {
  portfolioEquity: number;
  peakEquity: number;
  trades: Trade[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "risk_engine_v1";

const REGIME_MULTIPLIERS: Record<string, number> = {
  "Strong Trend": 1.0,
  "Choppy": 0.50,
  "Bear": 0.25,
  "Panic": 0.10,
};

const SECTOR_COLORS: Record<string, string> = {
  "Technology":    "#6366f1",
  "AI":            "#8b5cf6",
  "Semiconductors":"#a78bfa",
  "Financials":    "#3b82f6",
  "Healthcare":    "#10b981",
  "Energy":        "#f59e0b",
  "Industrials":   "#f97316",
  "Consumer":      "#ec4899",
  "Other":         "#6b7280",
};

// ── SVG Gauge ─────────────────────────────────────────────────────────────────

function Gauge({ value, max, color }: { value: number; max: number; color: string }) {
  const pct   = Math.min(Math.max(value / max, 0), 1);
  const r     = 52;
  const cx    = 70;
  const cy    = 72;
  const start = -210;
  const sweep = 240;

  function pt(angle: number) {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const s    = pt(start);
  const e    = pt(start + sweep);
  const ve   = pt(start + sweep * pct);
  const big  = sweep > 180 ? 1 : 0;
  const vbig = sweep * pct > 180 ? 1 : 0;

  return (
    <svg width={140} height={100} viewBox="0 0 140 100">
      <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${big} 1 ${e.x} ${e.y}`}
        fill="none" stroke="#1f2937" strokeWidth={10} strokeLinecap="round" />
      {pct > 0.005 && (
        <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${vbig} 1 ${ve.x} ${ve.y}`}
          fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />
      )}
    </svg>
  );
}

// ── Collapsible section wrapper ───────────────────────────────────────────────

function Section({
  title, icon: Icon, children, badge, defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Icon size={13} className="text-accent" />
          <span className="text-sm font-semibold">{title}</span>
          {badge}
        </div>
        {open
          ? <ChevronUp size={13} className="text-text-muted" />
          : <ChevronDown size={13} className="text-text-muted" />}
      </button>
      {open && <div className="border-t border-border px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

// ── Module 1: Portfolio Heat ───────────────────────────────────────────────────

function PortfolioHeat({ trades, portfolioEquity }: { trades: Trade[]; portfolioEquity: number }) {
  const totalRisk = useMemo(
    () => trades.reduce((s, t) => s + t.shares * Math.abs(t.entry - t.stop), 0),
    [trades],
  );
  const heatPct    = portfolioEquity > 0 ? (totalRisk / portfolioEquity) * 100 : 0;
  const maxAllowed = portfolioEquity * 0.07;
  const available  = Math.max(0, maxAllowed - totalRisk);

  const heatColor = heatPct < 4 ? "#10b981" : heatPct < 7 ? "#f59e0b" : "#ef4444";
  const heatLabel = heatPct < 4 ? "text-emerald-400" : heatPct < 7 ? "text-amber-400" : "text-red-400";
  const heatBand  = heatPct < 4 ? "Green — Safe Zone" : heatPct < 7 ? "Yellow — Elevated" : "Red — Danger Zone";

  return (
    <Section
      title="Module 1 — Portfolio Heat Monitor"
      icon={Flame}
      badge={<span className={cn("text-xs font-bold ml-2", heatLabel)}>{heatPct.toFixed(1)}%</span>}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Gauge */}
        <div className="flex flex-col items-center gap-1">
          <div className="relative">
            <Gauge value={heatPct} max={10} color={heatColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
              <div className={cn("text-2xl font-bold tabular-nums", heatLabel)}>{heatPct.toFixed(1)}%</div>
              <div className="text-[10px] text-text-muted">Portfolio Heat</div>
            </div>
          </div>
          <div className={cn("text-xs font-medium", heatLabel)}>{heatBand}</div>

          {/* Band bar */}
          <div className="w-full mt-2">
            <div className="h-2 rounded-full overflow-hidden flex">
              <div className="bg-emerald-500 flex-[4]" />
              <div className="bg-amber-500 flex-[3]" />
              <div className="bg-red-500 flex-[3]" />
            </div>
            <div className="flex justify-between text-[10px] text-text-muted mt-0.5 px-0.5">
              <span>0%</span><span>4%</span><span>7%</span><span>10%+</span>
            </div>
            {/* Pointer */}
            <div
              className="h-1 w-px bg-white/80 relative -mt-3.5 transition-all"
              style={{ marginLeft: `${Math.min(heatPct / 10 * 100, 99)}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Current Risk",      value: `$${totalRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,    color: heatLabel },
            { label: "Max Allowed (7%)",  value: `$${maxAllowed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,   color: "text-text-muted" },
            { label: "Available Budget",  value: `$${available.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,    color: "text-emerald-400" },
            { label: "Open Trades",       value: String(trades.length),                                                       color: "text-text-primary" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-md border border-border bg-surface-2 p-3">
              <div className="text-[10px] text-text-muted mb-1">{label}</div>
              <div className={cn("text-sm font-semibold tabular-nums", color)}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── Module 2: Concentration Engine ───────────────────────────────────────────

function ConcentrationEngine({ trades, portfolioEquity }: { trades: Trade[]; portfolioEquity: number }) {
  const sectorExposure = useMemo(() => {
    const totalValue = trades.reduce((s, t) => s + t.shares * t.currentPrice, 0) || 1;
    const map: Record<string, number> = {};
    trades.forEach(t => {
      const sec = t.sector || "Other";
      map[sec] = (map[sec] ?? 0) + (t.shares * t.currentPrice) / totalValue * 100;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [trades]);

  const largestPosition = useMemo(() => {
    if (!trades.length) return null;
    const totalValue = trades.reduce((s, t) => s + t.shares * t.currentPrice, 0) || 1;
    const sorted = [...trades].sort((a, b) => (b.shares * b.currentPrice) - (a.shares * a.currentPrice));
    return { ticker: sorted[0].ticker, pct: (sorted[0].shares * sorted[0].currentPrice) / totalValue * 100 };
  }, [trades]);

  const warnings: string[] = [];
  sectorExposure.forEach(([sec, pct]) => {
    if (pct > 40) warnings.push(`${sec} concentration: ${pct.toFixed(0)}% — exceeds 40% limit`);
  });
  if (largestPosition && largestPosition.pct > 20) {
    warnings.push(`Single position ${largestPosition.ticker}: ${largestPosition.pct.toFixed(0)}% — exceeds 20% limit`);
  }

  return (
    <Section title="Module 2 — Correlation & Concentration" icon={BarChart2} defaultOpen={false}>
      {trades.length === 0 ? (
        <p className="text-xs text-text-muted">Add positions above to see concentration analysis.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sector bars */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-text-muted mb-3">Sector Exposure</div>
            {sectorExposure.map(([sec, pct]) => (
              <div key={sec}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-primary">{sec}</span>
                  <span className={cn("tabular-nums font-medium", pct > 40 ? "text-red-400" : pct > 25 ? "text-amber-400" : "text-text-muted")}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: SECTOR_COLORS[sec] ?? SECTOR_COLORS.Other }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Warnings + positions */}
          <div className="space-y-3">
            {warnings.length > 0 && (
              <div className="space-y-1.5">
                {warnings.map(w => (
                  <div key={w} className="flex items-start gap-2 text-xs px-3 py-2 rounded border border-amber-500/30 bg-amber-500/10">
                    <AlertTriangle size={11} className="text-amber-400 mt-0.5 shrink-0" />
                    <span className="text-amber-300">{w}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1">
              <div className="text-xs text-text-muted font-medium mb-2">Position Weights</div>
              {(() => {
                const total = trades.reduce((s, t) => s + t.shares * t.currentPrice, 0) || 1;
                return trades.map(t => {
                  const wt = (t.shares * t.currentPrice) / total * 100;
                  return (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      <span className="w-14 font-medium text-text-primary">{t.ticker}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${wt}%` }} />
                      </div>
                      <span className="tabular-nums text-text-muted w-10 text-right">{wt.toFixed(1)}%</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Module 3: Regime-Based Sizing ─────────────────────────────────────────────

function RegimeSizing() {
  const { data: regime, isFetching } = useQuery({
    queryKey: ["regime"],
    queryFn: () => api.getRegime(),
    staleTime: 5 * 60 * 1000,
  });

  const multiplier = regime ? (REGIME_MULTIPLIERS[regime.regime] ?? 0.5) : null;
  const regimeColor: Record<string, string> = {
    "Strong Trend": "text-emerald-400",
    "Choppy":       "text-amber-400",
    "Bear":         "text-orange-400",
    "Panic":        "text-red-400",
  };
  const col = regimeColor[regime?.regime ?? ""] ?? "text-text-muted";

  const rows = [
    { name: "Strong Trend", mult: 1.00, color: "bg-emerald-500", key: "Strong Trend" },
    { name: "Healthy Trend", mult: 0.75, color: "bg-teal-500",   key: "Healthy Trend" },
    { name: "Choppy",        mult: 0.50, color: "bg-amber-500",  key: "Choppy" },
    { name: "Bear Market",   mult: 0.25, color: "bg-orange-500", key: "Bear" },
    { name: "Panic",         mult: 0.10, color: "bg-red-600",    key: "Panic" },
  ];

  return (
    <Section title="Module 3 — Regime-Based Position Sizing" icon={Activity}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border bg-surface-2 p-4">
          <div className="text-[10px] text-text-muted uppercase tracking-wider">Current Regime</div>
          {isFetching ? <RefreshCw size={14} className="animate-spin text-text-muted" /> : (
            <>
              <div className={cn("text-xl font-bold text-center", col)}>{regime?.regime ?? "—"}</div>
              {multiplier != null && (
                <>
                  <div className={cn("text-4xl font-mono font-bold", col)}>{multiplier.toFixed(2)}×</div>
                  <div className="text-[10px] text-text-muted">Risk Multiplier</div>
                  <div className={cn("text-base font-bold", col)}>{(multiplier * 1).toFixed(2)}% / trade</div>
                  <div className="text-[10px] text-text-muted">Recommended Risk</div>
                </>
              )}
            </>
          )}
        </div>

        <div className="md:col-span-2 space-y-2">
          {rows.map(r => {
            const active = regime?.regime === r.key;
            return (
              <div key={r.key} className={cn(
                "flex items-center gap-3 p-2.5 rounded-md border text-xs transition-colors",
                active ? "border-accent bg-accent/10" : "border-border bg-surface-2/30",
              )}>
                <div className={cn("w-2 h-2 rounded-full shrink-0", r.color)} />
                <span className={cn("flex-1 font-medium", active ? "text-text-primary" : "text-text-muted")}>{r.name}</span>
                <span className="text-text-muted">Multiplier</span>
                <span className={cn("font-bold tabular-nums w-10 text-right", active ? "text-accent" : "text-text-muted")}>{r.mult.toFixed(2)}×</span>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

// ── Module 4: CVaR / Expected Shortfall ───────────────────────────────────────

function CVaRModule({ trades, portfolioEquity }: { trades: Trade[]; portfolioEquity: number }) {
  const weights = useMemo(() => {
    if (!trades.length) return null;
    const total = trades.reduce((s, t) => s + t.shares * t.currentPrice, 0);
    if (!total) return null;
    const w: Record<string, number> = {};
    trades.forEach(t => { w[t.ticker] = (w[t.ticker] ?? 0) + (t.shares * t.currentPrice) / total; });
    return w;
  }, [trades]);

  const { data: riskData, isLoading } = useQuery({
    queryKey: ["risk-cvar", JSON.stringify(weights)],
    queryFn: () => api.analyzeRisk({ weights: weights! }),
    enabled: !!weights,
    staleTime: 10 * 60 * 1000,
  });

  const var95  = riskData?.var_cvar?.[0];
  const var99  = riskData?.var_cvar?.[1] ?? riskData?.var_cvar?.[0];
  const sigma  = var95 ? var95.var_hist / 1.645 : 0.011;

  const distData = useMemo(() => {
    const pts = [];
    for (let x = -0.08; x <= 0.04; x += 0.0015) {
      const y = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * (x / sigma) ** 2);
      pts.push({ x: parseFloat((x * 100).toFixed(2)), y: parseFloat(y.toFixed(3)), isTail: var95 ? x <= -var95.var_hist : false });
    }
    return pts;
  }, [sigma, var95]);

  const tailData  = distData.filter(d => d.isTail);
  const bodyData  = distData.filter(d => !d.isTail);
  const worstDay  = var95 ? var95.cvar_hist * portfolioEquity : null;

  return (
    <Section title="Module 4 — CVaR / Expected Shortfall" icon={Shield}>
      {!weights ? (
        <p className="text-xs text-text-muted">Add positions above to compute CVaR.</p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-text-muted text-xs py-6 justify-center">
          <RefreshCw size={12} className="animate-spin" /> Computing…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "95% VaR (Hist)",  value: var95  ? `-${(var95.var_hist  * 100).toFixed(2)}%` : "—", color: "text-amber-400" },
                { label: "95% CVaR (ES)",   value: var95  ? `-${(var95.cvar_hist * 100).toFixed(2)}%` : "—", color: "text-red-400"   },
                { label: "99% VaR (Hist)",  value: var99  ? `-${(var99.var_hist  * 100).toFixed(2)}%` : "—", color: "text-orange-400" },
                { label: "99% CVaR (ES)",   value: var99  ? `-${(var99.cvar_hist * 100).toFixed(2)}%` : "—", color: "text-red-500"   },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="text-[10px] text-text-muted mb-1">{label}</div>
                  <div className={cn("text-sm font-bold tabular-nums", color)}>{value}</div>
                </div>
              ))}
            </div>
            {worstDay != null && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
                <div className="text-[10px] text-text-muted mb-1">Expected Worst Day (95% CVaR)</div>
                <div className="text-lg font-bold text-red-400">
                  -${(worstDay).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            )}
            {riskData && (
              <div className="rounded-md border border-border bg-surface-2 p-3 space-y-1 text-xs">
                <div className="text-text-muted font-medium mb-1">Portfolio Stats</div>
                <div className="flex justify-between"><span className="text-text-muted">Ann. Return</span><span className={riskData.portfolio_stats.annualized_return >= 0 ? "text-emerald-400" : "text-red-400"}>{(riskData.portfolio_stats.annualized_return * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Ann. Vol</span><span className="text-text-primary">{(riskData.portfolio_stats.annualized_volatility * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Sharpe</span><span className={riskData.portfolio_stats.sharpe_ratio >= 1 ? "text-emerald-400" : "text-amber-400"}>{riskData.portfolio_stats.sharpe_ratio.toFixed(2)}</span></div>
              </div>
            )}
          </div>

          {/* Distribution chart */}
          <div>
            <div className="text-xs text-text-muted mb-2">Return Distribution</div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <XAxis dataKey="x" type="number" domain={[-8, 4]} tickFormatter={v => `${v}%`} tick={{ fontSize: 9, fill: "#6b7280" }} />
                <YAxis hide />
                <Tooltip formatter={(v: number) => [v.toFixed(3), "density"]} contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 10 }} />
                <Area data={bodyData} dataKey="y" stroke="#3b82f6" strokeWidth={1.5} fill="#3b82f6" fillOpacity={0.12} dot={false} type="monotone" />
                <Area data={tailData} dataKey="y" stroke="#ef4444" strokeWidth={1.5} fill="#ef4444" fillOpacity={0.35} dot={false} type="monotone" />
                {var95 && <ReferenceLine x={-(var95.var_hist * 100)} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1.5} />}
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex gap-3 mt-1 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-3 h-1 bg-blue-500 inline-block" /> Normal tail</span>
              <span className="flex items-center gap-1"><span className="w-3 h-1 bg-red-500 inline-block" /> CVaR zone</span>
              <span className="flex items-center gap-1"><span className="w-3 h-px bg-amber-500 border border-dashed inline-block" /> 95% VaR</span>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Module 5: Dynamic Drawdown Protection ─────────────────────────────────────

function DrawdownProtection({ portfolioEquity, peakEquity }: { portfolioEquity: number; peakEquity: number }) {
  const dd = peakEquity > 0 ? ((portfolioEquity - peakEquity) / peakEquity) * 100 : 0;
  const ddAbs = Math.abs(dd);

  const { state, col, reduce } = useMemo<{ state: string; col: string; reduce: number }>(() => {
    if (ddAbs < 5)  return { state: "Normal Risk",          col: "text-emerald-400", reduce: 0    };
    if (ddAbs < 8)  return { state: "Reduce Risk 25%",      col: "text-amber-400",  reduce: 0.25 };
    if (ddAbs < 12) return { state: "Reduce Risk 50%",      col: "text-orange-400", reduce: 0.50 };
    if (ddAbs < 15) return { state: "Capital Preservation", col: "text-red-400",    reduce: 0.75 };
    return                  { state: "TRADING DISABLED",    col: "text-red-600",    reduce: 1.0  };
  }, [ddAbs]);

  const rules = [
    { range: "0–5%",   action: "Normal Risk",          bg: "bg-emerald-500", key: "Normal Risk" },
    { range: "5–8%",   action: "Reduce Risk 25%",      bg: "bg-amber-500",  key: "Reduce Risk 25%" },
    { range: "8–12%",  action: "Reduce Risk 50%",      bg: "bg-orange-500", key: "Reduce Risk 50%" },
    { range: "12–15%", action: "Capital Preservation", bg: "bg-red-500",    key: "Capital Preservation" },
    { range: ">15%",   action: "TRADING DISABLED",     bg: "bg-red-700",    key: "TRADING DISABLED" },
  ];

  return (
    <Section title="Module 5 — Dynamic Drawdown Protection" icon={TrendingDown}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Current DD",    value: `${dd.toFixed(1)}%`,   color: col },
              { label: "Risk State",    value: state,                  color: col },
              { label: "Peak Equity",   value: `$${peakEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "text-text-primary" },
              { label: "Risk Reduction", value: `${(reduce * 100).toFixed(0)}%`, color: col },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-md border border-border bg-surface-2 p-3">
                <div className="text-[10px] text-text-muted mb-1">{label}</div>
                <div className={cn("text-xs font-bold", color)}>{value}</div>
              </div>
            ))}
          </div>
          <div className="h-2 rounded-full overflow-hidden flex bg-surface-2">
            <div className="bg-gradient-to-r from-emerald-500 via-amber-500 to-red-600 transition-all"
              style={{ width: `${Math.min(ddAbs / 15 * 100, 100)}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-text-muted px-0.5">
            <span>0%</span><span>5%</span><span>8%</span><span>12%</span><span>15%+</span>
          </div>
        </div>

        <div className="space-y-1.5">
          {rules.map(r => (
            <div key={r.key} className={cn(
              "flex items-center gap-2 p-2 rounded-md border text-xs transition-colors",
              state === r.key ? "border-accent bg-accent/10" : "border-border bg-surface-2/30",
            )}>
              <div className={cn("w-2 h-2 rounded-full shrink-0", r.bg)} />
              <span className="text-text-muted w-16 shrink-0">{r.range}</span>
              <span className={cn("flex-1 font-medium", state === r.key ? "text-text-primary" : "text-text-muted")}>{r.action}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── Module 6: Stress Testing ──────────────────────────────────────────────────

function StressTesting({ trades, portfolioEquity }: { trades: Trade[]; portfolioEquity: number }) {
  const [customShock, setCustomShock] = useState("-5");

  const totalValue = useMemo(
    () => trades.reduce((s, t) => s + t.shares * t.currentPrice, 0) || portfolioEquity,
    [trades, portfolioEquity],
  );

  const scenarios = useMemo(() => {
    const beta = 1.15;
    return [
      { name: "SPY −5%",       shock: -0.05 * beta },
      { name: "SPY −10%",      shock: -0.10 * beta },
      { name: "SPY −20%",      shock: -0.20 * beta },
      { name: "VIX +25%",      shock: -0.022 },
      { name: "VIX +50%",      shock: -0.038 },
      { name: "VIX +100%",     shock: -0.068 },
      { name: "US10Y +50bps",  shock: -0.013 },
      { name: "US10Y +100bps", shock: -0.028 },
      { name: "Tech −15%",     shock: -0.086 },
      { name: `Custom ${customShock}%`, shock: parseFloat(customShock || "0") / 100 },
    ].map(s => ({ ...s, pct: parseFloat((s.shock * 100).toFixed(2)), dollar: s.shock * totalValue }));
  }, [totalValue, customShock]);

  return (
    <Section title="Module 6 — Stress Testing Engine" icon={Zap} defaultOpen={false}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-text-muted">Custom shock (%)</span>
            <input
              type="number"
              value={customShock}
              onChange={e => setCustomShock(e.target.value)}
              className="w-20 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-1.5 pr-4 text-left text-text-muted font-medium">Scenario</th>
                  <th className="py-1.5 px-3 text-right text-text-muted font-medium">Impact %</th>
                  <th className="py-1.5 px-3 text-right text-text-muted font-medium">$ Loss</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <tr key={s.name} className="border-b border-border/40 hover:bg-surface-2/30">
                    <td className="py-1.5 pr-4 text-text-primary">{s.name}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-red-400">{s.pct.toFixed(1)}%</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-red-400">
                      ${Math.abs(s.dollar).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tornado */}
        <div>
          <div className="text-xs text-text-muted mb-2">Tornado Chart</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={scenarios} layout="vertical" margin={{ top: 0, right: 16, left: 64, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 9, fill: "#6b7280" }} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#9ca3af" }} width={64} />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(2)}%`, "Impact"]}
                contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 6, fontSize: 10 }}
              />
              <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                {scenarios.map((s, i) => (
                  <Cell key={i} fill={s.pct > -4 ? "#f59e0b" : s.pct > -7 ? "#f97316" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}

// ── Module 7: Risk Budget ─────────────────────────────────────────────────────

function RiskBudget({ trades, portfolioEquity }: { trades: Trade[]; portfolioEquity: number }) {
  const contributions = useMemo(() => {
    const totalRisk = trades.reduce((s, t) => s + t.shares * Math.abs(t.entry - t.stop), 0) || 1;
    return trades.map(t => ({
      ticker: t.ticker,
      risk: t.shares * Math.abs(t.entry - t.stop),
      pct: (t.shares * Math.abs(t.entry - t.stop)) / totalRisk * 100,
    })).sort((a, b) => b.pct - a.pct);
  }, [trades]);

  return (
    <Section title="Module 7 — Risk Budget Allocation" icon={BarChart2} defaultOpen={false}>
      {!trades.length ? (
        <p className="text-xs text-text-muted">Add positions to see risk contributions.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs text-text-muted font-medium mb-3">Risk Contributions</div>
            {contributions.map(c => (
              <div key={c.ticker}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-text-primary">{c.ticker}</span>
                  <span className={cn("tabular-nums", c.pct > 30 ? "text-red-400" : c.pct > 20 ? "text-amber-400" : "text-text-muted")}>
                    {c.pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${c.pct}%`, background: c.pct > 30 ? "#ef4444" : c.pct > 20 ? "#f59e0b" : "#6366f1" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-xs text-text-muted font-medium mb-3">Equal Risk Target vs Actual</div>
            {contributions.map(c => {
              const target = 100 / contributions.length;
              const diff = c.pct - target;
              return (
                <div key={c.ticker} className="flex items-center gap-2 text-xs">
                  <span className="w-12 font-medium text-text-primary">{c.ticker}</span>
                  <span className="w-12 tabular-nums text-text-muted">{c.pct.toFixed(1)}%</span>
                  <span className={cn("tabular-nums font-medium", diff > 5 ? "text-red-400" : diff < -5 ? "text-blue-400" : "text-emerald-400")}>
                    {diff >= 0 ? "+" : ""}{diff.toFixed(1)}%
                  </span>
                  {Math.abs(diff) > 10 && <AlertTriangle size={10} className="text-amber-400" />}
                </div>
              );
            })}
            <div className="text-[10px] text-text-muted pt-2">Target = {(100 / Math.max(contributions.length, 1)).toFixed(1)}% per position (equal risk)</div>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Module 8: Position Sizing Calculator ──────────────────────────────────────

function PositionSizer({ portfolioEquity, regime }: { portfolioEquity: number; regime: string | null }) {
  const [entry,   setEntry]   = useState("150.00");
  const [stop,    setStop]    = useState("145.00");
  const [riskPct, setRiskPct] = useState("1.0");
  const [winRate, setWinRate] = useState("55");
  const [rrRatio, setRrRatio] = useState("2.0");
  const [method,  setMethod]  = useState<"fixed" | "kelly" | "half_kelly">("fixed");

  const mult            = regime ? (REGIME_MULTIPLIERS[regime] ?? 1.0) : 1.0;
  const adjRisk         = parseFloat(riskPct || "0") * mult;

  const result = useMemo(() => {
    const e   = parseFloat(entry) || 0;
    const s   = parseFloat(stop)  || 0;
    const rps = Math.abs(e - s);
    if (!rps || !e) return null;

    const riskAmt   = portfolioEquity * (adjRisk / 100);
    const wr        = parseFloat(winRate) / 100;
    const rr        = parseFloat(rrRatio);
    const kelly     = Math.max(0, wr - (1 - wr) / rr);
    const halfKelly = kelly / 2;

    const sharesFixed = Math.floor(riskAmt / rps);
    const sharesK     = Math.max(0, Math.floor(portfolioEquity * kelly / e));
    const sharesHK    = Math.max(0, Math.floor(portfolioEquity * halfKelly / e));
    const shares      = method === "fixed" ? sharesFixed : method === "kelly" ? sharesK : sharesHK;

    return { rps, shares, capital: shares * e, riskAmt, kelly: kelly * 100, halfKelly: halfKelly * 100 };
  }, [entry, stop, portfolioEquity, adjRisk, winRate, rrRatio, method]);

  return (
    <Section title="Module 8 — Position Sizing Calculator" icon={Calculator}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {([
              ["Entry Price ($)",   entry,   setEntry,   "150.00"],
              ["Stop Price ($)",    stop,    setStop,    "145.00"],
              ["Base Risk %",       riskPct, setRiskPct, "1.0"  ],
              ["Win Rate %",        winRate, setWinRate, "55"   ],
              ["R:R Ratio",         rrRatio, setRrRatio, "2.0"  ],
            ] as const).map(([label, value, setter, ph]) => (
              <div key={String(label)}>
                <label className="text-[10px] text-text-muted block mb-1">{label}</label>
                <input
                  type="number"
                  value={String(value)}
                  onChange={e => (setter as (v: string) => void)(e.target.value)}
                  placeholder={String(ph)}
                  className="w-full bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            ))}
            <div>
              <label className="text-[10px] text-text-muted block mb-1">Method</label>
              <select
                value={method}
                onChange={e => setMethod(e.target.value as typeof method)}
                className="w-full bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="fixed">Fixed Fractional</option>
                <option value="kelly">Kelly Criterion</option>
                <option value="half_kelly">Half Kelly</option>
              </select>
            </div>
          </div>
          {mult < 1 && (
            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
              Regime ({regime}): {mult.toFixed(2)}× → Effective risk {adjRisk.toFixed(2)}%
            </div>
          )}
        </div>

        <div className="space-y-3">
          {result ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Risk Per Share",   value: `$${result.rps.toFixed(2)}`,     color: "text-amber-400"    },
                  { label: "Position Size",    value: `${result.shares.toLocaleString()} shares`, color: "text-text-primary" },
                  { label: "Capital Required", value: `$${result.capital.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "text-blue-400" },
                  { label: "Max Risk Amount",  value: `$${result.riskAmt.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "text-red-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-md border border-border bg-surface-2 p-3">
                    <div className="text-[10px] text-text-muted mb-1">{label}</div>
                    <div className={cn("text-sm font-bold tabular-nums", color)}>{value}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-border bg-surface-2 p-3 space-y-1.5 text-xs">
                <div className="text-text-muted font-medium mb-1">Kelly Analysis</div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Full Kelly</span>
                  <span className="tabular-nums">{result.kelly.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Half Kelly (recommended)</span>
                  <span className="tabular-nums text-emerald-400">{result.halfKelly.toFixed(1)}%</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-text-muted text-center py-8">Enter entry and stop prices to calculate</p>
          )}
        </div>
      </div>
    </Section>
  );
}

// ── Module 9 & 10: Dashboard + Score ─────────────────────────────────────────

function RiskDashboard({ trades, portfolioEquity, peakEquity, regime }: {
  trades: Trade[];
  portfolioEquity: number;
  peakEquity: number;
  regime: string | null;
}) {
  const dd       = peakEquity > 0 ? Math.abs(((portfolioEquity - peakEquity) / peakEquity) * 100) : 0;
  const totalRisk = trades.reduce((s, t) => s + t.shares * Math.abs(t.entry - t.stop), 0);
  const heat     = portfolioEquity > 0 ? (totalRisk / portfolioEquity) * 100 : 0;

  // Composite score
  const heatScore = heat < 4 ? 20 : heat < 7 ? 13 : 4;
  const ddScore   = dd < 5 ? 20 : dd < 8 ? 14 : dd < 12 ? 8 : 2;
  const regScore  = regime === "Strong Trend" ? 20 : regime === "Choppy" ? 12 : regime === "Bear" ? 6 : 16;
  const concScore = trades.length >= 5 ? 20 : trades.length >= 3 ? 14 : trades.length > 0 ? 10 : 20;
  const cvarScore = 16;
  const total     = heatScore + ddScore + regScore + concScore + cvarScore;

  const status     = total >= 90 ? "Excellent" : total >= 75 ? "Controlled Risk" : total >= 60 ? "Elevated Risk" : "Dangerous";
  const statusCol  = total >= 90 ? "#10b981" : total >= 75 ? "#3b82f6" : total >= 60 ? "#f59e0b" : "#ef4444";
  const statusText = total >= 90 ? "text-emerald-400" : total >= 75 ? "text-blue-400" : total >= 60 ? "text-amber-400" : "text-red-400";
  const overallRisk = heat < 4 && dd < 5 ? "LOW" : heat < 7 && dd < 8 ? "MODERATE" : "HIGH";
  const riskBg = overallRisk === "LOW" ? "border-emerald-500/30 bg-emerald-500/5" : overallRisk === "MODERATE" ? "border-amber-500/30 bg-amber-500/5" : "border-red-500/30 bg-red-500/5";

  const components = [
    { label: "Portfolio Heat",  score: heatScore, max: 20 },
    { label: "Drawdown Risk",   score: ddScore,   max: 20 },
    { label: "Regime Risk",     score: regScore,  max: 20 },
    { label: "Concentration",   score: concScore, max: 20 },
    { label: "CVaR Score",      score: cvarScore, max: 20 },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Module 9: Summary */}
      <div className={cn("md:col-span-2 rounded-lg border p-4 space-y-3", riskBg)}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-text-primary">Portfolio Risk Summary</span>
          <span className={cn("text-xs font-bold px-2 py-0.5 rounded border",
            overallRisk === "LOW"      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
            overallRisk === "MODERATE" ? "text-amber-400 border-amber-500/30 bg-amber-500/10" :
                                         "text-red-400 border-red-500/30 bg-red-500/10"
          )}>{overallRisk} RISK</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { label: "Portfolio Heat",   value: `${heat.toFixed(1)}%`, color: heat < 4 ? "text-emerald-400" : heat < 7 ? "text-amber-400" : "text-red-400" },
            { label: "Current Drawdown", value: `-${dd.toFixed(1)}%`,  color: dd < 5 ? "text-emerald-400" : dd < 8 ? "text-amber-400" : "text-red-400" },
            { label: "Open Trades",      value: String(trades.length), color: "text-text-primary" },
            { label: "Current Regime",   value: regime ?? "—",         color: regime === "Strong Trend" ? "text-emerald-400" : regime === "Choppy" ? "text-amber-400" : "text-red-400" },
            { label: "Portfolio Equity", value: `$${portfolioEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "text-text-primary" },
            { label: "Total Risk $",     value: `$${totalRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,       color: "text-amber-400" },
            { label: "Risk Budget Used", value: `${Math.min(heat / 7 * 100, 100).toFixed(0)}%`, color: heat < 4 ? "text-emerald-400" : heat < 7 ? "text-amber-400" : "text-red-400" },
            { label: "Regime Mult",      value: regime ? `${(REGIME_MULTIPLIERS[regime] ?? 1).toFixed(2)}×` : "—", color: "text-text-muted" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div className="text-text-muted mb-0.5">{label}</div>
              <div className={cn("font-bold tabular-nums", color)}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Module 10: Risk Score */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Institutional Risk Score</div>
        <div className="flex flex-col items-center gap-2 mb-3">
          <div className="relative">
            <svg width={110} height={110} viewBox="0 0 110 110">
              <circle cx="55" cy="55" r="44" fill="none" stroke="#1f2937" strokeWidth={8} />
              <circle
                cx="55" cy="55" r="44"
                fill="none"
                stroke={statusCol}
                strokeWidth={8}
                strokeDasharray={`${(total / 100) * 276.5} 276.5`}
                strokeLinecap="round"
                transform="rotate(-90 55 55)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className={cn("text-2xl font-bold", statusText)}>{total}</div>
              <div className="text-[10px] text-text-muted">/ 100</div>
            </div>
          </div>
          <div className={cn("text-xs font-bold", statusText)}>{status}</div>
        </div>
        <div className="space-y-1.5">
          {components.map(c => (
            <div key={c.label}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-text-muted">{c.label}</span>
                <span className="tabular-nums text-text-primary">{c.score}/{c.max}</span>
              </div>
              <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: `${(c.score / c.max) * 100}%`,
                  background: c.score / c.max >= 0.8 ? "#10b981" : c.score / c.max >= 0.6 ? "#f59e0b" : "#ef4444",
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Trade Manager ─────────────────────────────────────────────────────────────

function TradeManager({ trades, setTrades }: { trades: Trade[]; setTrades: (t: Trade[]) => void }) {
  const [ticker,  setTicker]  = useState("");
  const [shares,  setShares]  = useState("");
  const [entry,   setEntry]   = useState("");
  const [stop,    setStop]    = useState("");
  const [current, setCurrent] = useState("");
  const [sector,  setSector]  = useState("Technology");

  const addTrade = useCallback(() => {
    if (!ticker || !shares || !entry || !stop) return;
    const t: Trade = {
      id: Date.now().toString(),
      ticker: ticker.toUpperCase().trim(),
      shares: parseFloat(shares),
      entry: parseFloat(entry),
      stop: parseFloat(stop),
      currentPrice: parseFloat(current) || parseFloat(entry),
      sector,
    };
    setTrades([...trades, t]);
    setTicker(""); setShares(""); setEntry(""); setStop(""); setCurrent("");
  }, [ticker, shares, entry, stop, current, sector, trades, setTrades]);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <BarChart2 size={13} className="text-accent" />
        <span className="text-sm font-semibold">Portfolio Positions</span>
        <span className="text-xs text-text-muted ml-1">drives all risk modules below</span>
      </div>
      <div className="px-4 pb-4 pt-3 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {([
            ["Ticker",    ticker,   setTicker,   "NVDA",   "text"],
            ["Shares",    shares,   setShares,   "100",    "number"],
            ["Entry $",   entry,    setEntry,    "500.00", "number"],
            ["Stop $",    stop,     setStop,     "485.00", "number"],
            ["Current $", current,  setCurrent,  "510.00", "number"],
          ] as const).map(([label, value, setter, ph, type]) => (
            <div key={String(label)}>
              <label className="text-[10px] text-text-muted block mb-1">{label}</label>
              <input
                type={String(type)}
                value={String(value)}
                onChange={e => (setter as (v: string) => void)(e.target.value)}
                placeholder={String(ph)}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          ))}
          <div>
            <label className="text-[10px] text-text-muted block mb-1">Sector</label>
            <select
              value={sector}
              onChange={e => setSector(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
            >
              {Object.keys(SECTOR_COLORS).map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={addTrade}
              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded border border-accent/40 bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
            >
              <Plus size={11} /> Add
            </button>
          </div>
        </div>

        {trades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Ticker","Sector","Shares","Entry","Stop","Current","Risk $","P&L",""].map(h => (
                    <th key={h} className="py-1.5 pr-3 text-left text-text-muted font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map(t => {
                  const risk = t.shares * Math.abs(t.entry - t.stop);
                  const pnl  = t.shares * (t.currentPrice - t.entry);
                  return (
                    <tr key={t.id} className="border-b border-border/40 hover:bg-surface-2/30">
                      <td className="py-1.5 pr-3 font-medium text-text-primary">{t.ticker}</td>
                      <td className="py-1.5 pr-3 text-text-muted">{t.sector ?? "—"}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-text-muted">{t.shares.toLocaleString()}</td>
                      <td className="py-1.5 pr-3 tabular-nums">${t.entry.toFixed(2)}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-red-400">${t.stop.toFixed(2)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">${t.currentPrice.toFixed(2)}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-amber-400">${risk.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className={cn("py-1.5 pr-3 tabular-nums", pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {pnl >= 0 ? "+" : ""}${pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td>
                        <button onClick={() => setTrades(trades.filter(x => x.id !== t.id))} className="text-text-muted hover:text-red-400 transition-colors p-1">
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-text-muted text-center py-3">No positions — add your open trades above to power all risk modules</p>
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function RiskManagement() {
  const [state, setState] = useState<RiskState>({
    portfolioEquity: 100000,
    peakEquity: 100000,
    trades: [],
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setState(JSON.parse(saved));
    } catch {}
  }, []);

  const save = useCallback((next: RiskState) => {
    setState(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const setTrades        = useCallback((trades: Trade[]) => save({ ...state, trades }), [state, save]);
  const setEquity        = useCallback((portfolioEquity: number) => save({ ...state, portfolioEquity }), [state, save]);
  const setPeak          = useCallback((peakEquity: number) => save({ ...state, peakEquity }), [state, save]);

  const { data: regime } = useQuery({
    queryKey: ["regime"],
    queryFn: () => api.getRegime(),
    staleTime: 5 * 60 * 1000,
  });

  const { trades, portfolioEquity, peakEquity } = state;

  return (
    <div className="space-y-4">
      {/* Equity controls */}
      <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-muted whitespace-nowrap">Portfolio Equity ($)</label>
          <input
            type="number"
            value={portfolioEquity}
            onChange={e => setEquity(parseFloat(e.target.value) || 0)}
            className="w-32 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-muted whitespace-nowrap">Peak Equity ($)</label>
          <input
            type="number"
            value={peakEquity}
            onChange={e => setPeak(parseFloat(e.target.value) || 0)}
            className="w-32 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={() => setPeak(portfolioEquity)}
          className="text-xs px-2 py-1 rounded border border-border text-text-muted hover:text-text-primary hover:border-accent transition-colors"
        >
          Set Current as Peak
        </button>
        {trades.length > 0 && (
          <button
            onClick={() => setTrades([])}
            className="text-xs text-red-400/60 hover:text-red-400 transition-colors ml-auto"
          >
            Clear All Positions
          </button>
        )}
      </div>

      {/* Module 9 & 10: Top summary */}
      <RiskDashboard
        trades={trades}
        portfolioEquity={portfolioEquity}
        peakEquity={peakEquity}
        regime={regime?.regime ?? null}
      />

      {/* Position manager */}
      <TradeManager trades={trades} setTrades={setTrades} />

      {/* Module 1 */}
      <PortfolioHeat trades={trades} portfolioEquity={portfolioEquity} />

      {/* Module 2 */}
      <ConcentrationEngine trades={trades} portfolioEquity={portfolioEquity} />

      {/* Module 3 */}
      <RegimeSizing />

      {/* Module 4 */}
      <CVaRModule trades={trades} portfolioEquity={portfolioEquity} />

      {/* Module 5 */}
      <DrawdownProtection portfolioEquity={portfolioEquity} peakEquity={peakEquity} />

      {/* Module 6 */}
      <StressTesting trades={trades} portfolioEquity={portfolioEquity} />

      {/* Module 7 */}
      <RiskBudget trades={trades} portfolioEquity={portfolioEquity} />

      {/* Module 8 */}
      <PositionSizer portfolioEquity={portfolioEquity} regime={regime?.regime ?? null} />
    </div>
  );
}
