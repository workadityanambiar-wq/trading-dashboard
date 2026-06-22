"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ResponsiveContainer, Legend,
} from "recharts";
import { api } from "@/lib/api";
import type {
  QuantumHardwareItem, QuantumStock, QuantumGovtFunding,
  QuantumIndustry, QuantumSoftware, QuantumStartup, QuantumPatent,
  QuantumLeader, QuantumGeoRisk,
} from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────────

const SIG_COLOR: Record<string, string> = {
  "STRONG BUY":  "text-emerald-400",
  "BUY":         "text-green-400",
  "HOLD":        "text-amber-400",
  "SELL":        "text-red-400",
  "STRONG SELL": "text-red-500",
};

const SIG_BG: Record<string, string> = {
  "STRONG BUY":  "bg-emerald-400/10 border-emerald-400/30",
  "BUY":         "bg-green-400/10 border-green-400/30",
  "HOLD":        "bg-amber-400/10 border-amber-400/30",
  "SELL":        "bg-red-400/10 border-red-400/30",
  "STRONG SELL": "bg-red-500/10 border-red-500/30",
};

function Ret({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-[var(--text-muted)]">—</span>;
  return (
    <span className={v >= 0 ? "text-emerald-400" : "text-red-400"}>
      {v >= 0 ? "+" : ""}{v.toFixed(1)}%
    </span>
  );
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

function SectionHead({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-widest">{title}</h2>
      {badge && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]">
          {badge}
        </span>
      )}
    </div>
  );
}

function ScoreBar({ label, value, max = 25 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 60 ? "bg-emerald-500" : pct >= 35 ? "bg-cyan-500" : "bg-amber-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-36 text-[var(--text-muted)] truncate capitalize">{label.replace(/_/g, " ")}</div>
      <div className="flex-1 h-1.5 bg-[var(--surface-2,#1a1f2e)] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-8 text-right font-mono text-[var(--text-primary)]">{value.toFixed(1)}</div>
    </div>
  );
}

function SigBadge({ signal }: { signal: string | null | undefined }) {
  if (!signal) return null;
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${SIG_BG[signal] ?? ""} ${SIG_COLOR[signal] ?? "text-[var(--text-muted)]"}`}>
      {signal}
    </span>
  );
}

function Loading() {
  return <div className="text-[var(--text-muted)] text-sm py-8 text-center">Loading…</div>;
}
function Err({ msg }: { msg: string }) {
  return <div className="text-red-400 text-sm py-4">{msg}</div>;
}

// ── Readiness Gauge ────────────────────────────────────────────────────────────

function ReadinessGauge({ score }: { score: number }) {
  const r = 68;
  const cx = 90;
  const cy = 92;
  const startDeg = -215;
  const totalArc = 250;
  const fillArc  = (score / 100) * totalArc;

  function toXY(deg: number, radius: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }
  function arc(a1: number, a2: number, rr: number) {
    const p1 = toXY(a1, rr);
    const p2 = toXY(a2, rr);
    const lg = Math.abs(a2 - a1) > 180 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${rr} ${rr} 0 ${lg} 1 ${p2.x} ${p2.y}`;
  }

  const color =
    score < 25 ? "#ef4444" :
    score < 50 ? "#f59e0b" :
    score < 75 ? "#06b6d4" :
                 "#10b981";

  const regime =
    score < 20 ? "FUNDAMENTAL RESEARCH" :
    score < 40 ? "HARDWARE RACE" :
    score < 60 ? "EARLY COMMERCIAL" :
    score < 80 ? "ENTERPRISE ADOPTION" :
                 "QUANTUM BREAKTHROUGH";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="180" height="130" viewBox="0 0 180 130">
        <path d={arc(startDeg, startDeg + totalArc, r)} fill="none"
          stroke="var(--border)" strokeWidth="9" strokeLinecap="round" />
        <path d={arc(startDeg, startDeg + fillArc, r)} fill="none"
          stroke={color} strokeWidth="9" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        <text x={cx} y={cy + 6} textAnchor="middle" fill="var(--text-primary)"
          fontSize="30" fontFamily="monospace" fontWeight="700">{score}</text>
        <text x={cx} y={cy + 22} textAnchor="middle" fill="var(--text-muted)" fontSize="10">/100</text>
      </svg>
      <div className="text-[10px] font-mono font-semibold tracking-widest" style={{ color }}>
        {regime}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Hardware", "Markets", "Government", "Enterprise", "VC & IP", "Forecast", "Leaderboard"] as const;
type Tab = typeof TABS[number];

const CHART_STYLE = { background: "var(--surface)", border: "1px solid var(--border)", fontSize: 11, borderRadius: 6 };
const TICK_STYLE  = { fontSize: 10, fill: "var(--text-muted)" };

export default function QuantumPage() {
  const [tab, setTab] = useState<Tab>("Overview");

  const overview    = useQuery({ queryKey: ["q-overview"],    queryFn: api.getQuantumOverview,   staleTime: 5 * 60_000 });
  const hardware    = useQuery({ queryKey: ["q-hardware"],    queryFn: api.getQuantumHardware,   staleTime: 60 * 60_000, enabled: tab === "Hardware" });
  const markets     = useQuery({ queryKey: ["q-markets"],     queryFn: api.getQuantumMarkets,    staleTime: 2 * 60_000,  enabled: tab === "Markets" });
  const govt        = useQuery({ queryKey: ["q-govt"],        queryFn: api.getQuantumGovernment, staleTime: 60 * 60_000, enabled: tab === "Government" });
  const enterprise  = useQuery({ queryKey: ["q-enterprise"],  queryFn: api.getQuantumEnterprise, staleTime: 60 * 60_000, enabled: tab === "Enterprise" });
  const vc          = useQuery({ queryKey: ["q-vc"],          queryFn: api.getQuantumVC,         staleTime: 60 * 60_000, enabled: tab === "VC & IP" });
  const forecast    = useQuery({ queryKey: ["q-forecast"],    queryFn: api.getQuantumForecast,   staleTime: 60 * 60_000, enabled: tab === "Forecast" });
  const leaderboard = useQuery({ queryKey: ["q-leaderboard"], queryFn: api.getQuantumLeaderboard, staleTime: 5 * 60_000,  enabled: tab === "Leaderboard" });

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Quantum Computing Intelligence</h1>
        <p className="text-xs text-[var(--text-muted)]">
          Hardware Race · Public Markets · Government Investment · Enterprise Adoption · VC Pipeline
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap border-b border-[var(--border)] pb-3">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === t
                ? "bg-[var(--surface-2,#1a1f2e)] text-[var(--text-primary)] border border-[var(--border)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW ────────────────────────────────────────────────────────── */}
      {tab === "Overview" && (
        overview.isLoading ? <Loading /> :
        overview.isError   ? <Err msg="Error loading overview" /> :
        overview.data      ? (() => {
          const { readiness, kpis } = overview.data;
          return (
            <div className="space-y-4">
              <div className="flex gap-4 flex-wrap items-start">
                {/* Gauge card */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex flex-col items-center gap-1 shrink-0">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Quantum Readiness</div>
                  <ReadinessGauge score={readiness.score} />
                </div>
                {/* KPIs */}
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0">
                  <Kpi label="Global Investment" value={`$${kpis.global_investment_b}B`} sub="cumulative govt funding" />
                  <Kpi label="Physical Qubits" value={kpis.total_qubits.toLocaleString()} sub="across all tracked systems" />
                  <Kpi label="Logical Qubits" value={kpis.logical_qubits.toLocaleString()} sub="error-corrected qubits" />
                  <Kpi label="Enterprise Pilots" value={kpis.enterprise_pilots.toString()} sub={`${kpis.enterprise_contracts} live contracts`} />
                  <Kpi label="VC Raised" value={`$${(kpis.vc_raised_m / 1000).toFixed(2)}B`} sub="private startups" />
                  <Kpi label="Public Mkt Cap" value={`$${kpis.public_mktcap_b.toFixed(0)}B`} sub="pure-play + diversified" />
                </div>
              </div>

              {/* Component breakdown */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                <SectionHead title="Readiness Component Breakdown" badge={`Composite: ${readiness.score}/100`} />
                <div className="space-y-2.5">
                  {Object.entries(readiness.components).map(([k, v]) => (
                    <ScoreBar key={k} label={k} value={v as number} max={25} />
                  ))}
                </div>
              </div>
            </div>
          );
        })() : null
      )}

      {/* ─── HARDWARE ────────────────────────────────────────────────────────── */}
      {tab === "Hardware" && (
        hardware.isLoading ? <Loading /> :
        hardware.isError   ? <Err msg="Error loading hardware data" /> :
        hardware.data      ? (
          <div className="space-y-5">
            <SectionHead title="Hardware Race Rankings" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["#","Company","System","Approach","Qubits","Gate Fid%","QV","Logical Q","Score"]
                      .map((h, i) => (
                        <th key={h} className={`py-2 pr-3 font-medium ${i >= 4 ? "text-right" : ""}`}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {hardware.data.hardware.map((h: QuantumHardwareItem) => (
                    <tr key={h.company} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)] transition-colors">
                      <td className="py-2 pr-3 font-mono text-[var(--text-muted)]">{h.rank}</td>
                      <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{h.company}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)] text-[10px]">{h.system}</td>
                      <td className="py-2 pr-3">
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-[var(--surface-2,#1a1f2e)] border border-[var(--border)]">
                          {h.approach}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{h.qubits?.toLocaleString() ?? "—"}</td>
                      <td className="py-2 pr-3 text-right font-mono">{h.gate_fidelity ?? "—"}</td>
                      <td className="py-2 pr-3 text-right font-mono text-[10px]">
                        {h.qv != null ? h.qv.toLocaleString() : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {h.logical_qubits > 0
                          ? <span className="text-emerald-400 font-bold">{h.logical_qubits}</span>
                          : <span className="text-[var(--text-muted)]">0</span>}
                      </td>
                      <td className="py-2 text-right">
                        <span className={`font-mono font-bold ${h.score >= 80 ? "text-emerald-400" : h.score >= 60 ? "text-amber-400" : "text-red-400"}`}>
                          {h.score}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SectionHead title="Qubit Growth History (Log Scale)" />
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hardware.data.history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="year" tick={TICK_STYLE} />
                  <YAxis scale="log" domain={[1, "auto"]} tick={TICK_STYLE} />
                  <Tooltip contentStyle={CHART_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="ibm"    name="IBM"    stroke="#06b6d4" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="google" name="Google" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="ionq"   name="IonQ"   stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null
      )}

      {/* ─── MARKETS ─────────────────────────────────────────────────────────── */}
      {tab === "Markets" && (
        markets.isLoading ? <Loading /> :
        markets.isError   ? <Err msg="Error loading market data" /> :
        markets.data      ? (
          <div className="space-y-5">
            <SectionHead title="Pure-Play Quantum Stocks" badge={`${markets.data.as_of}`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {markets.data.stocks
                .filter((s: QuantumStock) => s.type === "Pure-Play")
                .map((s: QuantumStock) => (
                  <div key={s.ticker} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <div className="font-bold text-[var(--text-primary)] text-sm">{s.ticker}</div>
                        <div className="text-[9px] text-[var(--text-muted)] leading-tight">{s.approach}</div>
                      </div>
                      <SigBadge signal={s.signal} />
                    </div>
                    <div className="text-2xl font-mono font-bold text-[var(--text-primary)]">
                      ${s.price?.toFixed(2) ?? "—"}
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[10px]">
                      <div><div className="text-[var(--text-muted)]">1M</div><Ret v={s.ret_1m} /></div>
                      <div><div className="text-[var(--text-muted)]">3M</div><Ret v={s.ret_3m} /></div>
                      <div><div className="text-[var(--text-muted)]">YTD</div><Ret v={s.ret_ytd} /></div>
                    </div>
                    {s.rsi != null && (
                      <div className="text-[10px] text-[var(--text-muted)]">
                        RSI <span className={`font-mono ${s.rsi > 70 ? "text-red-400" : s.rsi < 30 ? "text-emerald-400" : "text-[var(--text-primary)]"}`}>{s.rsi.toFixed(0)}</span>
                        {" · "} Mkt Cap <span className="font-mono text-[var(--text-primary)]">{s.mkt_cap_b != null ? `$${s.mkt_cap_b}B` : "—"}</span>
                      </div>
                    )}
                  </div>
                ))}
            </div>

            <SectionHead title="All Quantum Stocks — Technicals" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["Ticker","Type","Price","YTD","1Y","RSI","vs EMA20","vs EMA50","vs EMA200","Mkt Cap","Signal"]
                      .map((h, i) => (
                        <th key={h} className={`py-2 pr-3 font-medium ${i >= 2 && i < 10 ? "text-right" : ""}`}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {markets.data.stocks.map((s: QuantumStock) => (
                    <tr key={s.ticker} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 font-bold text-[var(--text-primary)]">{s.ticker}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)] text-[10px]">{s.type}</td>
                      <td className="py-2 pr-3 text-right font-mono">${s.price?.toFixed(2) ?? "—"}</td>
                      <td className="py-2 pr-3 text-right"><Ret v={s.ret_ytd} /></td>
                      <td className="py-2 pr-3 text-right"><Ret v={s.ret_1y} /></td>
                      <td className={`py-2 pr-3 text-right font-mono ${s.rsi != null && s.rsi > 70 ? "text-red-400" : s.rsi != null && s.rsi < 30 ? "text-emerald-400" : ""}`}>
                        {s.rsi?.toFixed(0) ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right"><Ret v={s.vs_ema20} /></td>
                      <td className="py-2 pr-3 text-right"><Ret v={s.vs_ema50} /></td>
                      <td className="py-2 pr-3 text-right"><Ret v={s.vs_ema200} /></td>
                      <td className="py-2 pr-3 text-right font-mono text-[var(--text-muted)]">
                        {s.mkt_cap_b != null ? `$${s.mkt_cap_b}B` : "—"}
                      </td>
                      <td className="py-2"><SigBadge signal={s.signal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ─── GOVERNMENT ──────────────────────────────────────────────────────── */}
      {tab === "Government" && (
        govt.isLoading ? <Loading /> :
        govt.isError   ? <Err msg="Error loading government data" /> :
        govt.data      ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Annual Investment" value={`$${govt.data.total_annual_b.toFixed(1)}B`} sub="globally per year" />
              <Kpi label="Cumulative Committed" value={`$${govt.data.total_overall_b.toFixed(1)}B`} sub="total govt allocation" />
              <Kpi label="Investment Index" value={`${govt.data.investment_index}/100`} sub="global readiness proxy" />
            </div>

            <SectionHead title="Government Quantum Funding by Country" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["#","Country","Program","Annual ($B)","Total ($B)","Since","Score"]
                      .map((h, i) => (
                        <th key={h} className={`py-2 pr-3 font-medium ${i >= 3 ? "text-right" : ""}`}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {govt.data.funding.map((g: QuantumGovtFunding) => (
                    <tr key={g.country} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 font-mono text-[var(--text-muted)]">{g.rank}</td>
                      <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{g.country}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)] text-[10px]">{g.program}</td>
                      <td className="py-2 pr-3 text-right font-mono">${g.annual_b.toFixed(1)}</td>
                      <td className="py-2 pr-3 text-right font-mono font-bold">${g.total_b.toFixed(1)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-[var(--text-muted)]">{g.year}</td>
                      <td className="py-2 text-right">
                        <span className={`font-mono font-bold ${g.score >= 80 ? "text-emerald-400" : g.score >= 60 ? "text-amber-400" : "text-[var(--text-primary)]"}`}>
                          {g.score}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={govt.data.funding} margin={{ bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="country" tick={TICK_STYLE} height={50} interval={0} />
                  <YAxis tick={TICK_STYLE} />
                  <Tooltip contentStyle={CHART_STYLE} formatter={(v: number) => [`$${v}B`, "Total Committed"]} />
                  <Bar dataKey="total_b" name="Total ($B)" radius={[3, 3, 0, 0]}>
                    {govt.data.funding.map((g: QuantumGovtFunding, i: number) => (
                      <Cell key={i} fill={i === 0 ? "#ef4444" : i === 1 ? "#06b6d4" : "#10b981"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null
      )}

      {/* ─── ENTERPRISE ──────────────────────────────────────────────────────── */}
      {tab === "Enterprise" && (
        enterprise.isLoading ? <Loading /> :
        enterprise.isError   ? <Err msg="Error loading enterprise data" /> :
        enterprise.data      ? (
          <div className="space-y-5">
            <div className="mb-2">
              <Kpi label="Enterprise Adoption Score" value={`${enterprise.data.adoption_score}/100`} sub="weighted across all industries" />
            </div>

            <SectionHead title="Industry Quantum Adoption" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["#","Industry","Pilots","Contracts","Use Case","Key Partners","Score"]
                      .map((h, i) => (
                        <th key={h} className={`py-2 pr-3 font-medium ${i === 2 || i === 3 || i === 6 ? "text-right" : ""}`}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {enterprise.data.industries.map((e: QuantumIndustry) => (
                    <tr key={e.industry} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 text-[var(--text-muted)]">{e.rank}</td>
                      <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{e.industry}</td>
                      <td className="py-2 pr-3 text-right font-mono">{e.pilots}</td>
                      <td className="py-2 pr-3 text-right font-mono">{e.contracts}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)] text-[10px] max-w-[150px] truncate">{e.use_case}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)] text-[10px]">{e.partners.slice(0, 2).join(", ")}</td>
                      <td className="py-2 text-right">
                        <span className={`font-mono font-bold ${e.score >= 70 ? "text-emerald-400" : e.score >= 50 ? "text-amber-400" : "text-red-400"}`}>
                          {e.score}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SectionHead title="Quantum Software & SDK Platforms" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["Platform","Vendor","Stars(K)","Downloads(M)","Languages","Enterprise","Score"]
                      .map((h, i) => (
                        <th key={h} className={`py-2 pr-3 font-medium ${i >= 2 ? "text-right" : ""}`}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {enterprise.data.software.map((sw: QuantumSoftware) => (
                    <tr key={sw.platform} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{sw.platform}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)]">{sw.vendor}</td>
                      <td className="py-2 pr-3 text-right font-mono">{sw.stars_k}</td>
                      <td className="py-2 pr-3 text-right font-mono">{sw.downloads_m}</td>
                      <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{sw.languages}</td>
                      <td className="py-2 pr-3 text-right">
                        {sw.enterprise ? <span className="text-emerald-400">✓</span> : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="py-2 text-right font-mono font-bold text-[var(--text-primary)]">{sw.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ─── VC & IP ─────────────────────────────────────────────────────────── */}
      {tab === "VC & IP" && (
        vc.isLoading ? <Loading /> :
        vc.isError   ? <Err msg="Error loading VC data" /> :
        vc.data      ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Total VC Raised" value={`$${(vc.data.total_raised_m / 1000).toFixed(2)}B`} sub="private quantum startups" />
              <Kpi label="Combined Valuation" value={`$${vc.data.total_val_b.toFixed(1)}B`} sub="total private market value" />
              <Kpi label="Private Market Score" value={`${vc.data.private_score}/100`} sub="ecosystem maturity" />
            </div>

            <SectionHead title="VC-Backed Quantum Startups" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {vc.data.startups.map((v: QuantumStartup) => (
                <div key={v.company} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-[var(--text-primary)] text-sm">{v.company}</div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface-2,#1a1f2e)] border border-[var(--border)] text-[var(--text-muted)] shrink-0">
                      {v.stage}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">{v.hq} · {v.approach}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{v.focus}</div>
                  <div className="flex gap-4 text-xs pt-0.5">
                    <div>
                      <span className="text-[var(--text-muted)]">Raised: </span>
                      <span className="font-mono font-bold text-cyan-400">${v.raised_m}M</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Valuation: </span>
                      <span className="font-mono font-bold text-emerald-400">${v.val_b}B</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <SectionHead title="Patent & Research Leaders" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["Entity","Type","2024 Patents","Total Patents","2024 Pubs","Citations"]
                      .map((h, i) => (
                        <th key={h} className={`py-2 pr-3 font-medium ${i >= 2 ? "text-right" : ""}`}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {vc.data.patents.map((p: QuantumPatent) => (
                    <tr key={p.entity} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{p.entity}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)]">{p.type}</td>
                      <td className="py-2 pr-3 text-right font-mono">{p.patents_2024}</td>
                      <td className="py-2 pr-3 text-right font-mono font-bold">{p.total_patents.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right font-mono">{p.pubs_2024}</td>
                      <td className="py-2 text-right font-mono text-cyan-400">{p.citations.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ─── FORECAST ────────────────────────────────────────────────────────── */}
      {tab === "Forecast" && (
        forecast.isLoading ? <Loading /> :
        forecast.isError   ? <Err msg="Error loading forecast" /> :
        forecast.data      ? (() => {
          const hist = forecast.data.qv_timeline.filter(p => !p.projected);
          const proj = forecast.data.qv_timeline.filter(p => p.projected);
          const lastHist = hist[hist.length - 1];
          const qvData = [
            ...hist.map(p => ({ year: p.year, hist: p.qv, proj: null as number | null })),
            { year: lastHist?.year, hist: lastHist?.qv ?? null, proj: lastHist?.qv ?? null },
            ...proj.map(p => ({ year: p.year, hist: null as number | null, proj: p.qv })),
          ];
          return (
            <div className="space-y-5">
              <SectionHead title="Commercialization Probability Forecast" badge={`Current Readiness: ${forecast.data.readiness_now}/100`} />
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                      {["Horizon","Year","Broad Commercial","Fault-Tolerant QC","Quantum Advantage"]
                        .map((h, i) => (
                          <th key={h} className={`py-2 pr-3 font-medium ${i >= 2 ? "text-right" : ""}`}>{h}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.data.commercialization_probs.map(c => (
                      <tr key={c.years_out} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                        <td className="py-2 pr-3 font-bold text-[var(--text-primary)]">{c.years_out}Y</td>
                        <td className="py-2 pr-3 font-mono text-[var(--text-muted)]">{c.year}</td>
                        <td className="py-2 pr-3 text-right font-mono text-emerald-400">{c.broad_commercial_pct}%</td>
                        <td className="py-2 pr-3 text-right font-mono text-cyan-400">{c.fault_tolerant_pct}%</td>
                        <td className="py-2 text-right font-mono text-amber-400">{c.quantum_advantage_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <SectionHead title="Physical Qubit Growth Projection" />
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecast.data.qubit_projections}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="year" tick={TICK_STYLE} />
                    <YAxis tick={TICK_STYLE} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="physical_qubits" name="Physical Qubits"
                      stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.1} strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="logical_qubits" name="Logical Qubits"
                      stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <SectionHead title="Quantum Volume Timeline (Log Scale)" badge="dashed = projected" />
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={qvData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="year" tick={TICK_STYLE} />
                    <YAxis scale="log" domain={[1, "auto"]} tick={TICK_STYLE} />
                    <Tooltip contentStyle={CHART_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="hist" name="Historical QV"
                      stroke="#10b981" strokeWidth={2} dot={false} connectNulls={false} />
                    <Line type="monotone" dataKey="proj" name="Projected QV"
                      stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })() : null
      )}

      {/* ─── LEADERBOARD ─────────────────────────────────────────────────────── */}
      {tab === "Leaderboard" && (
        leaderboard.isLoading ? <Loading /> :
        leaderboard.isError   ? <Err msg="Error loading leaderboard" /> :
        leaderboard.data      ? (
          <div className="space-y-5">
            <SectionHead title="Quantum Winner Model" badge={`${leaderboard.data.total_companies} companies · ${leaderboard.data.as_of}`} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-left">
                    {["#","Ticker","Approach","Price","YTD","Tech","Funding","Adopt","Eco","Composite","Signal"]
                      .map((h, i) => (
                        <th key={h} className={`py-2 pr-3 font-medium ${i >= 3 && i <= 9 ? "text-right" : ""}`}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.data.leaderboard.map((l: QuantumLeader) => (
                    <tr key={l.ticker} className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2,#1a1f2e)]">
                      <td className="py-2 pr-3 font-mono text-[var(--text-muted)]">{l.rank}</td>
                      <td className="py-2 pr-3 font-bold text-[var(--text-primary)]">{l.ticker}</td>
                      <td className="py-2 pr-3 text-[var(--text-muted)] text-[10px]">{l.approach}</td>
                      <td className="py-2 pr-3 text-right font-mono">{l.price != null ? `$${l.price.toFixed(2)}` : "—"}</td>
                      <td className="py-2 pr-3 text-right"><Ret v={l.ret_ytd} /></td>
                      <td className="py-2 pr-3 text-right font-mono">{l.tech_score}</td>
                      <td className="py-2 pr-3 text-right font-mono">{l.fund_score}</td>
                      <td className="py-2 pr-3 text-right font-mono">{l.adopt_score}</td>
                      <td className="py-2 pr-3 text-right font-mono">{l.eco_score}</td>
                      <td className="py-2 pr-3 text-right">
                        <span className={`font-mono font-bold text-sm ${l.composite >= 70 ? "text-emerald-400" : l.composite >= 50 ? "text-amber-400" : "text-red-400"}`}>
                          {l.composite}
                        </span>
                      </td>
                      <td className="py-2"><SigBadge signal={l.signal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SectionHead title="Geopolitical Risk Monitor" />
            <div className="space-y-2">
              {leaderboard.data.geopolitical.map((g: QuantumGeoRisk, i: number) => (
                <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-start gap-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${
                    g.risk === "HIGH"   ? "text-red-400 border-red-400/30 bg-red-400/10" :
                    g.risk === "MEDIUM" ? "text-amber-400 border-amber-400/30 bg-amber-400/10" :
                                         "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
                  }`}>{g.risk}</span>
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">{g.region}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{g.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}
