"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { VIXHistoryChart } from "@/components/charts/VIXHistoryChart";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}
function fmt(v: number | null, dec = 1): string {
  return v == null ? "—" : v.toFixed(dec);
}

const REGIME_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  "Very Low": { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
  "Low":      { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
  "Normal":   { bg: "bg-amber-500/10",   border: "border-amber-500/30",   text: "text-amber-400"   },
  "Elevated": { bg: "bg-orange-500/10",  border: "border-orange-500/30",  text: "text-orange-400"  },
  "High":     { bg: "bg-red-500/10",     border: "border-red-500/30",     text: "text-red-400"     },
  "Crisis":   { bg: "bg-red-500/15",     border: "border-red-500/50",     text: "text-red-400"     },
};

const LOOKBACKS = [
  { value: 63,  label: "3M"  },
  { value: 126, label: "6M"  },
  { value: 252, label: "1Y"  },
  { value: 504, label: "2Y"  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color, bar, barColor,
}: {
  label: string; value: string; sub?: string;
  color?: string; bar?: number; barColor?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={cn("text-2xl font-semibold font-mono", color ?? "text-text-primary")}>{value}</div>
      {bar != null && (
        <div className="h-1.5 rounded-full bg-surface-2">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{ width: `${Math.round(bar)}%`, backgroundColor: barColor ?? "#6366f1" }}
          />
        </div>
      )}
      {sub && <div className="text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border/50 last:border-0 text-xs">
      <span className="text-text-muted">{label}</span>
      <span className={cn("font-mono font-medium", color ?? "text-text-primary")}>{value}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VolatilityPage() {
  const [lookback, setLookback] = useState(252);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey:      ["volatility", lookback],
    queryFn:       () => api.getVolatility(lookback),
    staleTime:     5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const regimeStyle = data?.regime ? (REGIME_STYLE[data.regime] ?? REGIME_STYLE["Normal"]) : null;

  // Percentile bar color: low pct = green (VIX low historically), high pct = red
  const pctBarColor = data
    ? data.vix_pct_1y >= 80 ? "#ef4444"
    : data.vix_pct_1y >= 60 ? "#f97316"
    : data.vix_pct_1y >= 40 ? "#eab308"
    : "#22c55e"
    : "#6b6b80";

  // Term structure interpretation
  const tsLabel = data?.term_structure == null ? null
    : data.term_structure > 0.05  ? "Backwardation — elevated near-term fear"
    : data.term_structure > -0.05 ? "Flat — neutral"
    : "Contango — normal calm"
  ;
  const tsColor = data?.term_structure == null ? ""
    : data.term_structure > 0.05  ? "text-red-400"
    : data.term_structure < -0.05 ? "text-emerald-400"
    : "text-amber-400"
  ;

  return (
    <div className="space-y-5 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base font-semibold">Volatility Dashboard</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {data && !data.error
              ? `VIX · VIX3M · VVIX · SKEW · as of ${data.as_of}`
              : "CBOE VIX, term structure, and vol regime"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {LOOKBACKS.map(({ value, label }) => (
              <button key={value} onClick={() => setLookback(value)}
                className={cn(
                  "px-2.5 py-1.5 rounded text-xs transition-colors w-10",
                  lookback === value
                    ? "bg-accent text-white"
                    : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                )}
              >{label}</button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded bg-surface-2 border border-border text-text-muted hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-text-muted text-sm gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Fetching volatility data…
        </div>
      )}

      {data?.error && (
        <div className="rounded border border-red-900/40 bg-red-950/20 text-red-400 text-xs p-4">
          {data.error}
        </div>
      )}

      {data && !data.error && (
        <>
          {/* Regime banner */}
          {regimeStyle && (
            <div className={cn(
              "flex items-center justify-between px-4 py-3 rounded-lg border",
              regimeStyle.bg, regimeStyle.border
            )}>
              <div className="flex items-center gap-3">
                <span className={cn("text-lg font-bold font-mono", regimeStyle.text)}>
                  VIX {data.vix.toFixed(1)}
                </span>
                <span className={cn("px-2 py-0.5 rounded border text-xs font-medium",
                  regimeStyle.bg, regimeStyle.border, regimeStyle.text)}>
                  {data.regime}
                </span>
              </div>
              <div className="text-xs text-text-muted">
                {data.vix_pct_1y}th percentile (1Y range: {data.vix_1y_low} – {data.vix_1y_high})
              </div>
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="VIX (1M Implied)"
              value={data.vix.toFixed(1)}
              sub={`MA20: ${fmt(data.vix_ma20)} · MA50: ${fmt(data.vix_ma50)}`}
              color={regimeStyle?.text}
            />
            <StatCard
              label="1Y Percentile"
              value={`${data.vix_pct_1y}%ile`}
              sub={`Low ${data.vix_1y_low} → High ${data.vix_1y_high}`}
              color={pctBarColor}
              bar={data.vix_pct_1y}
              barColor={pctBarColor}
            />
            <StatCard
              label="VIX 3M"
              value={data.vix3m != null ? data.vix3m.toFixed(1) : "—"}
              sub={data.term_structure != null ? `${pct(data.term_structure)} vs VIX 1M` : undefined}
              color={tsColor || undefined}
            />
            <StatCard
              label="Term Structure"
              value={data.term_structure != null
                ? `${data.term_structure >= 0 ? "+" : ""}${(data.term_structure * 100).toFixed(1)}%`
                : "—"}
              sub={tsLabel ?? undefined}
              color={tsColor || undefined}
            />
            <StatCard
              label="VVIX (Vol of Vol)"
              value={data.vvix != null ? data.vvix.toFixed(1) : "—"}
              sub={data.vvix_pct_1y != null ? `${data.vvix_pct_1y}th pct (1Y)` : undefined}
              color={data.vvix != null && data.vvix > 100 ? "text-red-400" : "text-text-primary"}
            />
            <StatCard
              label="SKEW"
              value={data.skew != null ? data.skew.toFixed(1) : "—"}
              sub="Tail risk index"
              color={data.skew != null && data.skew > 145 ? "text-orange-400" : "text-text-primary"}
            />
          </div>

          {/* VIX history chart */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-medium">VIX History</div>
              <div className="flex gap-4 text-xs text-text-muted">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-red-500 inline-block" /> VIX
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-indigo-500 inline-block" /> MA20
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-[#4b4b70] inline-block" /> MA50
                </span>
                {data.history.some(h => h.vix3m != null) && (
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-[#6b6b80] inline-block border-dashed" /> VIX3M
                  </span>
                )}
              </div>
            </div>
            <div className="text-xs text-text-muted mb-4">
              Reference lines: 12 (very low) · 18 (low) · 25 (elevated) · 35 (high)
            </div>
            {data.history.length > 0 ? (
              <VIXHistoryChart data={data.history} height={280} />
            ) : (
              <div className="flex items-center justify-center h-40 text-text-muted text-xs">
                No history available — run the Screener or Setups to prefetch prices
              </div>
            )}
          </div>

          {/* Bottom row: SPY context + interpretation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-xs font-medium text-text-primary mb-3">SPY Performance Context</div>
              <MetricRow
                label="SPY 1-Month Return"
                value={pct(data.spy_1m)}
                color={data.spy_1m == null ? "" : data.spy_1m >= 0 ? "text-positive" : "text-negative"}
              />
              <MetricRow
                label="SPY 3-Month Return"
                value={pct(data.spy_3m)}
                color={data.spy_3m == null ? "" : data.spy_3m >= 0 ? "text-positive" : "text-negative"}
              />
              <MetricRow
                label="SPY YTD Return"
                value={pct(data.spy_ytd)}
                color={data.spy_ytd == null ? "" : data.spy_ytd >= 0 ? "text-positive" : "text-negative"}
              />
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-xs font-medium text-text-primary mb-3">Vol Regime Guide</div>
              {[
                { range: "< 12",  label: "Very Low",  color: "text-emerald-400", note: "Extreme complacency — elevated crash risk" },
                { range: "12–18", label: "Low",       color: "text-emerald-400", note: "Calm market — favorable for momentum/trend" },
                { range: "18–25", label: "Normal",    color: "text-amber-400",   note: "Neutral — balanced risk/reward" },
                { range: "25–35", label: "Elevated",  color: "text-orange-400",  note: "Caution — widen stops, reduce size" },
                { range: "> 35",  label: "High/Crisis",color: "text-red-400",    note: "Mean-reversion setups; avoid breakouts" },
              ].map(({ range, label, color, note }) => (
                <div key={label} className="flex items-start gap-3 py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-xs font-mono w-14 shrink-0 text-text-muted">{range}</span>
                  <span className={cn("text-xs font-medium w-20 shrink-0", color)}>{label}</span>
                  <span className="text-xs text-text-muted">{note}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
