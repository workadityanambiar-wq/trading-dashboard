"use client";
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  RefreshCw, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, Zap, BarChart2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, LineChart, Line, CartesianGrid, Legend, Cell,
} from "recharts";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, dec = 1, suffix = "") {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}${suffix}`;
}

function clr(v: number | null | undefined, invert = false) {
  if (v == null) return "text-text-muted";
  const pos = invert ? v < 0 : v > 0;
  return pos ? "text-green-400" : "text-red-400";
}

function zColor(z: number | null | undefined) {
  if (z == null) return "text-text-muted";
  if (z > 1.5)  return "text-red-400";
  if (z < -1.5) return "text-green-400";
  return "text-yellow-400";
}

// ── Gauge ─────────────────────────────────────────────────────────────────────

function Gauge({ value, label, min = -100, max = 100 }: {
  value: number | null; label: string; min?: number; max?: number;
}) {
  if (value == null) return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-sm text-text-muted">—</div>
    </div>
  );
  const pct = ((value - min) / (max - min)) * 100;
  const color = value > 30 ? "bg-green-500" : value < -30 ? "bg-red-500" : "bg-yellow-500";
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex justify-between text-[11px] text-text-muted">
        <span>{label}</span>
        <span className={cn("font-semibold", value > 30 ? "text-green-400" : value < -30 ? "text-red-400" : "text-yellow-400")}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

// ── COT bar chip ──────────────────────────────────────────────────────────────

function NetBadge({ pct, label }: { pct: number; label: string }) {
  const color = pct > 5 ? "text-green-400 bg-green-500/10 border-green-500/25"
              : pct < -5 ? "text-red-400 bg-red-500/10 border-red-500/25"
              :             "text-yellow-400 bg-yellow-500/10 border-yellow-500/25";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className={cn("text-[11px] font-semibold px-1.5 py-0.5 rounded border w-fit", color)}>
        {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ── COT Market card ───────────────────────────────────────────────────────────

function COTCard({ name, data }: { name: string; data: any }) {
  if (!data) return null;
  const history = data.history ?? [];
  const chartData = history.slice(-13).map((r: any) => ({
    date:     r.date.slice(5),
    lev:      r.lev_net_pct,
    am:       r.am_net_pct,
    dealer:   r.dealer_net_pct,
  }));

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-text-primary">{name}</p>
          <p className="text-[10px] text-text-muted">as of {data.as_of}</p>
        </div>
        <div className={cn("text-[10px] px-2 py-0.5 rounded-full border font-semibold",
          data.lev_z > 1.5 ? "text-red-400 bg-red-500/10 border-red-500/25" :
          data.lev_z < -1.5 ? "text-green-400 bg-green-500/10 border-green-500/25" :
          "text-yellow-400 bg-yellow-500/10 border-yellow-500/25")}>
          Lev z={data.lev_z?.toFixed(1)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NetBadge pct={data.am_net_pct}     label="Asset Mgr" />
        <NetBadge pct={data.lev_net_pct}    label="Lev Funds" />
        <NetBadge pct={data.dealer_net_pct} label="Dealers" />
      </div>

      <div className="text-[10px] text-text-muted">
        WoW Lev: <span className={clr(data.wk_chg_lev)}>{data.wk_chg_lev > 0 ? "+" : ""}{data.wk_chg_lev?.toLocaleString()}</span>
        {" · "}
        WoW AM: <span className={clr(data.wk_chg_am)}>{data.wk_chg_am > 0 ? "+" : ""}{data.wk_chg_am?.toLocaleString()}</span>
      </div>

      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={80}>
          <LineChart data={chartData} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: "#6b7280" }} tickLine={false} />
            <YAxis tick={{ fontSize: 8, fill: "#6b7280" }} tickLine={false} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", fontSize: 10 }}
              formatter={(v: any) => [`${Number(v).toFixed(1)}%`]}
            />
            <Line dataKey="lev"    dot={false} stroke="#f59e0b" strokeWidth={1.5} name="Lev Funds" />
            <Line dataKey="am"     dot={false} stroke="#22c55e" strokeWidth={1.5} name="Asset Mgr" />
            <Line dataKey="dealer" dot={false} stroke="#6366f1" strokeWidth={1}   name="Dealers" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── GEX Profile chart ─────────────────────────────────────────────────────────

function GEXChart({ data, title }: { data: any; title: string }) {
  if (!data || !data.spot) return <div className="text-text-muted text-xs p-4">No data</div>;
  const profile = (data.profile ?? []).sort((a: any, b: any) => a.strike - b.strike);
  const spot = data.spot;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-[11px]">
        <span>Spot: <span className="text-text-primary font-semibold">${spot}</span></span>
        <span>GEX: <span className={cn("font-semibold", (data.total_gex ?? 0) > 0 ? "text-green-400" : "text-red-400")}>
          ${data.total_gex?.toLocaleString()}M
        </span></span>
        <span>Regime: <span className={cn("font-semibold capitalize", data.regime === "positive" ? "text-green-400" : "text-red-400")}>
          {data.regime}
        </span></span>
        {data.gamma_flip && <span>Flip: <span className="text-amber-400 font-semibold">${data.gamma_flip}</span></span>}
        {data.call_wall  && <span>Call wall: <span className="text-green-400 font-semibold">${data.call_wall}</span></span>}
        {data.put_wall   && <span>Put wall: <span className="text-red-400 font-semibold">${data.put_wall}</span></span>}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={profile} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={6}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="strike" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false}
            tickFormatter={(v) => `$${v}`} interval={Math.floor(profile.length / 8)} />
          <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} tickFormatter={(v) => `${v}M`} />
          <ReferenceLine y={0}    stroke="rgba(255,255,255,0.2)" />
          <ReferenceLine x={spot} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: "Spot", position: "top", fontSize: 9, fill: "#f59e0b" }} />
          {data.gamma_flip && (
            <ReferenceLine x={data.gamma_flip} stroke="#f97316" strokeDasharray="3 3"
              label={{ value: "Flip", position: "insideTopRight", fontSize: 9, fill: "#f97316" }} />
          )}
          <Tooltip
            contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", fontSize: 10 }}
            formatter={(v: any) => [`$${Number(v).toFixed(1)}M`]}
          />
          <Bar dataKey="gex_m" name="GEX ($M)">
            {profile.map((entry: any) => (
              <Cell key={entry.strike} fill={entry.gex_m >= 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="text-[10px] text-text-muted">
        Green bars = positive gamma (stabilizing) · Red bars = negative gamma (amplifying) ·
        Orange dashed = gamma flip level
      </div>
    </div>
  );
}

// ── Skew term structure ───────────────────────────────────────────────────────

function SkewChart({ data }: { data: any }) {
  if (!data?.term_structure?.length) return <div className="text-text-muted text-xs p-4">No data</div>;
  const ts = data.term_structure;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-[11px]">
        <span>Spot: <span className="text-text-primary font-semibold">${data.spot}</span></span>
        {data.atm_iv_30d && <span>30d ATM IV: <span className="text-amber-400 font-semibold">{data.atm_iv_30d}%</span></span>}
        {data.skew_30d   && <span>30d Skew: <span className={cn("font-semibold", (data.skew_30d ?? 0) > 0.15 ? "text-red-400" : "text-green-400")}>{data.skew_30d?.toFixed(2)}</span></span>}
      </div>

      {/* ATM IV term structure */}
      <div>
        <p className="text-[11px] text-text-muted mb-2">ATM IV Term Structure</p>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={ts} margin={{ top: 2, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="dte" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} tickFormatter={(v) => `${v}d`} />
            <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", fontSize: 10 }}
              formatter={(v: any) => [`${v}%`]} />
            <Line dataKey="atm_iv" dot={{ r: 3, fill: "#f59e0b" }} stroke="#f59e0b" strokeWidth={2} name="ATM IV" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Skew by expiry */}
      {ts.some((r: any) => r.skew != null) && (
        <div>
          <p className="text-[11px] text-text-muted mb-2">90/110 Skew by Expiry (positive = fear, puts expensive)</p>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={ts.filter((r: any) => r.skew != null)} margin={{ top: 2, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="dte" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} tickFormatter={(v) => `${v}d`} />
              <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
              <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", fontSize: 10 }} />
              <Bar dataKey="skew" name="Skew">
                {ts.filter((r: any) => r.skew != null).map((entry: any) => (
                  <Cell key={entry.dte} fill={entry.skew > 0.1 ? "#ef4444" : entry.skew < 0 ? "#22c55e" : "#f59e0b"} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Insight list ──────────────────────────────────────────────────────────────

function InsightList({ items, variant }: { items: string[]; variant: "info" | "warn" | "ok" }) {
  const Icon = variant === "warn" ? AlertTriangle : variant === "ok" ? CheckCircle2 : Zap;
  const color = variant === "warn" ? "text-red-400" : variant === "ok" ? "text-green-400" : "text-blue-400";
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-[11px]">
          <Icon size={11} className={cn("shrink-0 mt-0.5", color)} />
          <span className="text-text-primary leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = "overview" | "cot" | "gamma" | "positioning" | "skew";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview",    label: "Overview" },
  { id: "cot",         label: "COT Positioning" },
  { id: "gamma",       label: "Dealer Gamma" },
  { id: "positioning", label: "CTA / Vol Control" },
  { id: "skew",        label: "Skew" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InstitutionalPage() {
  const [tab, setTab] = useState<Tab>("overview");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["institutional-overview"],
    queryFn:  api.getInstitutionalOverview,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center gap-3 text-text-muted">
      <RefreshCw size={16} className="animate-spin" />
      <span className="text-sm">Loading institutional flow data...</span>
    </div>
  );

  if (error || !data) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-2">
        <AlertTriangle size={24} className="text-red-400 mx-auto" />
        <p className="text-sm text-text-muted">Failed to load data</p>
        <button onClick={() => refetch()} className="text-xs text-accent hover:underline">Retry</button>
      </div>
    </div>
  );

  const { insights, cot, gamma, positioning, skew } = data;
  const spy_gex  = gamma?.spy;
  const spy_skew = skew?.spy;
  const cta      = positioning?.cta;
  const vc       = positioning?.vol_control;

  return (
    <div className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Institutional Flow</h2>
          <p className="text-xs text-text-muted mt-0.5">COT · Dealer Gamma · CTA · Vol Control · Skew — as of {data.as_of}</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
          <RefreshCw size={12} className={cn(isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-3 py-2 text-xs font-medium border-b-2 transition-colors",
              tab === t.id ? "border-accent text-text-primary" : "border-transparent text-text-muted hover:text-text-primary")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* 5 quick metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* COT Lev funds */}
            {(() => {
              const sp = cot?.["S&P 500"];
              return (
                <div className="bg-surface border border-border rounded-lg p-3 space-y-1">
                  <p className="text-[10px] text-text-muted uppercase tracking-wider">COT Lev Funds</p>
                  <p className={cn("text-lg font-bold", sp?.lev_net_pct >= 0 ? "text-green-400" : "text-red-400")}>
                    {sp?.lev_net_pct >= 0 ? "+" : ""}{sp?.lev_net_pct?.toFixed(1) ?? "—"}%
                  </p>
                  <p className={cn("text-[10px]", zColor(sp?.lev_z))}>
                    z={sp?.lev_z?.toFixed(1) ?? "—"} · {sp?.lev_pct_rank?.toFixed(0) ?? "—"}th pct
                  </p>
                </div>
              );
            })()}

            {/* Dealer GEX */}
            <div className="bg-surface border border-border rounded-lg p-3 space-y-1">
              <p className="text-[10px] text-text-muted uppercase tracking-wider">Dealer GEX</p>
              <p className={cn("text-lg font-bold", spy_gex?.regime === "positive" ? "text-green-400" : "text-red-400")}>
                ${spy_gex?.total_gex?.toLocaleString() ?? "—"}M
              </p>
              <p className="text-[10px] text-text-muted capitalize">{spy_gex?.regime ?? "—"} gamma</p>
            </div>

            {/* CTA */}
            <div className="bg-surface border border-border rounded-lg p-3 space-y-1">
              <p className="text-[10px] text-text-muted uppercase tracking-wider">CTA Exposure</p>
              <p className={cn("text-lg font-bold", (cta?.exposure_pct ?? 0) > 20 ? "text-green-400" : (cta?.exposure_pct ?? 0) < -20 ? "text-red-400" : "text-yellow-400")}>
                {cta?.exposure_pct != null ? `${cta.exposure_pct > 0 ? "+" : ""}${cta.exposure_pct.toFixed(0)}%` : "—"}
              </p>
              <p className="text-[10px] text-text-muted">of notional</p>
            </div>

            {/* Vol Control */}
            <div className="bg-surface border border-border rounded-lg p-3 space-y-1">
              <p className="text-[10px] text-text-muted uppercase tracking-wider">Vol Control</p>
              <p className={cn("text-lg font-bold", (vc?.exposure_pct ?? 100) > 80 ? "text-green-400" : (vc?.exposure_pct ?? 100) < 60 ? "text-red-400" : "text-yellow-400")}>
                {vc?.exposure_pct != null ? `${vc.exposure_pct.toFixed(0)}%` : "—"}
              </p>
              <p className={cn("text-[10px]", clr(vc?.delta_vs_1m))}>
                {vc?.delta_vs_1m != null ? `${vc.delta_vs_1m > 0 ? "+" : ""}${vc.delta_vs_1m.toFixed(0)}% vs 1m` : ""}
              </p>
            </div>

            {/* Skew */}
            <div className="bg-surface border border-border rounded-lg p-3 space-y-1">
              <p className="text-[10px] text-text-muted uppercase tracking-wider">30d Skew</p>
              <p className={cn("text-lg font-bold", (spy_skew?.skew_30d ?? 0) > 0.15 ? "text-red-400" : "text-green-400")}>
                {spy_skew?.skew_30d?.toFixed(2) ?? "—"}
              </p>
              <p className="text-[10px] text-text-muted">ATM IV: {spy_skew?.atm_iv_30d ?? "—"}%</p>
            </div>
          </div>

          {/* Insights grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-lg p-4">
              <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp size={12} /> Who Is Buying?
              </h3>
              <InsightList items={insights?.who_buying ?? []} variant="ok" />
            </div>

            <div className="bg-surface border border-border rounded-lg p-4">
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Who Is Trapped?
              </h3>
              <InsightList items={insights?.who_trapped ?? []} variant="warn" />
            </div>

            <div className="bg-surface border border-border rounded-lg p-4">
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingDown size={12} /> Forced Selling Risk
              </h3>
              <InsightList items={insights?.forced_selling ?? []} variant="warn" />
            </div>

            <div className="bg-surface border border-border rounded-lg p-4">
              <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Zap size={12} /> Forced Buying Catalyst
              </h3>
              <InsightList items={insights?.forced_buying ?? []} variant="info" />
            </div>
          </div>
        </div>
      )}

      {/* ── COT Tab ──────────────────────────────────────────────────────────── */}
      {tab === "cot" && (
        <div className="space-y-4">
          <p className="text-xs text-text-muted">
            CFTC Traders in Financial Futures (TFF) — weekly, reported with 3-day lag.
            Leveraged Funds = hedge funds + CTAs. Asset Managers = pension/mutual funds.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Object.entries(cot ?? {}).map(([name, d]) => (
              <COTCard key={name} name={name} data={d} />
            ))}
          </div>
          {Object.keys(cot ?? {}).length === 0 && (
            <div className="text-center py-8 text-text-muted text-sm">
              COT data unavailable — CFTC source may be temporarily offline.
            </div>
          )}
        </div>
      )}

      {/* ── Gamma Tab ────────────────────────────────────────────────────────── */}
      {tab === "gamma" && (
        <div className="space-y-6">
          <p className="text-xs text-text-muted">
            Dealer net gamma at each strike. Positive (green) = dealers long gamma — they buy dips and sell rips, dampening moves.
            Negative (red) = dealers short gamma — they amplify moves. The gamma flip level is where net GEX crosses zero.
          </p>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-surface border border-border rounded-lg p-4">
              <h3 className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-2">
                <BarChart2 size={12} className="text-accent" /> SPY
              </h3>
              <GEXChart data={spy_gex} title="SPY" />
            </div>
            <div className="bg-surface border border-border rounded-lg p-4">
              <h3 className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-2">
                <BarChart2 size={12} className="text-accent" /> QQQ
              </h3>
              <GEXChart data={gamma?.qqq} title="QQQ" />
            </div>
          </div>
        </div>
      )}

      {/* ── Positioning Tab ───────────────────────────────────────────────────── */}
      {tab === "positioning" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CTA */}
          <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">CTA / Trend-Follower Model</h3>
              <p className="text-[10px] text-text-muted mt-0.5">Model estimate using multi-timescale momentum signals</p>
            </div>
            <Gauge value={cta?.exposure_pct ?? null} label="Estimated equity exposure" />
            <div className="space-y-2">
              {Object.entries(cta?.signals ?? {}).map(([k, v]: [string, any]) => (
                <div key={k} className="flex justify-between text-[11px]">
                  <span className="text-text-muted">{k} momentum signal</span>
                  <span className={cn("tabular-nums font-semibold", v > 0.2 ? "text-green-400" : v < -0.2 ? "text-red-400" : "text-yellow-400")}>
                    {v >= 0 ? "+" : ""}{v.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
            {Object.keys(cta?.ma_distances ?? {}).length > 0 && (
              <div className="border-t border-border/50 pt-3 space-y-1.5">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">SPY vs Moving Averages</p>
                {Object.entries(cta?.ma_distances ?? {}).map(([k, v]: [string, any]) => (
                  <div key={k} className="flex justify-between text-[11px]">
                    <span className="text-text-muted">{k}</span>
                    <span className={cn("tabular-nums", v > 0 ? "text-green-400" : "text-red-400")}>{v > 0 ? "+" : ""}{v.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-border/50 pt-3">
              <p className="text-[11px] text-text-primary">{cta?.interpretation}</p>
            </div>
          </div>

          {/* Vol Control */}
          <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">Vol Control Fund Model</h3>
              <p className="text-[10px] text-text-muted mt-0.5">Estimated equity allocation targeting {vc?.target_vol_pct}% annualized vol</p>
            </div>
            <Gauge value={vc?.exposure_pct ?? null} label="Estimated equity allocation" min={0} max={100} />
            <div className="space-y-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-text-muted">21d realized vol</span>
                <span className={cn("tabular-nums font-semibold", (vc?.realized_vol_21d ?? 0) > 20 ? "text-red-400" : (vc?.realized_vol_21d ?? 0) < 10 ? "text-green-400" : "text-yellow-400")}>
                  {vc?.realized_vol_21d}%
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-text-muted">63d realized vol</span>
                <span className="tabular-nums text-text-primary">{vc?.realized_vol_63d}%</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-text-muted">Target vol</span>
                <span className="tabular-nums text-text-muted">{vc?.target_vol_pct}%</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-text-muted">Change vs 1m ago</span>
                <span className={cn("tabular-nums font-semibold", clr(vc?.delta_vs_1m))}>
                  {vc?.delta_vs_1m != null ? `${vc.delta_vs_1m > 0 ? "+" : ""}${vc.delta_vs_1m.toFixed(1)}%` : "—"}
                </span>
              </div>
            </div>
            <div className="border-t border-border/50 pt-3">
              <p className="text-[11px] text-text-primary">{vc?.interpretation}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Skew Tab ─────────────────────────────────────────────────────────── */}
      {tab === "skew" && (
        <div className="space-y-4">
          <p className="text-xs text-text-muted">
            SPY implied volatility term structure and put-call skew (90% put IV / 110% call IV, normalized by ATM IV).
            Positive skew = market paying up for downside protection.
          </p>
          <div className="bg-surface border border-border rounded-lg p-4">
            <SkewChart data={spy_skew} />
          </div>
        </div>
      )}

    </div>
  );
}
