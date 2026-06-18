"use client";
import { useQuery } from "@tanstack/react-query";
import { api, type MarketRegimeResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Zap,
} from "lucide-react";

// ── colour helpers ─────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score > 0.25)  return "text-green-400";
  if (score < -0.25) return "text-red-400";
  return "text-yellow-400";
}

function labelColor(label: string) {
  const l = label.toLowerCase();
  if (l.includes("risk-on") || l.includes("bull") || l.includes("expanding") || l.includes("inflation rising"))
    return "bg-green-500/15 text-green-300 border border-green-500/30";
  if (l.includes("risk-off") || l.includes("bear") || l.includes("slowing") || l.includes("disinflation"))
    return "bg-red-500/15 text-red-300 border border-red-500/30";
  if (l.includes("vol expanding"))
    return "bg-orange-500/15 text-orange-300 border border-orange-500/30";
  if (l.includes("vol compressing"))
    return "bg-blue-500/15 text-blue-300 border border-blue-500/30";
  return "bg-surface-2 text-text-muted border border-border";
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.abs(score) * 100;
  const isPos = score >= 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden flex">
        <div className="w-1/2 flex justify-end">
          {!isPos && (
            <div
              className="h-full bg-red-500 rounded-l-full"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <div className="w-px bg-border" />
        <div className="w-1/2">
          {isPos && (
            <div
              className="h-full bg-green-500 rounded-r-full"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
      </div>
      <span className={cn("text-[10px] tabular-nums w-10 text-right", scoreColor(score))}>
        {score >= 0 ? "+" : ""}{score.toFixed(2)}
      </span>
    </div>
  );
}

// ── dimension card ─────────────────────────────────────────────────────────────

interface DimProps {
  title: string;
  label: string;
  score: number;
  description: string;
}

function DimCard({ title, label, score, description }: DimProps) {
  const Arrow = score > 0.15 ? TrendingUp : score < -0.15 ? TrendingDown : Minus;
  const arrowColor = score > 0.15 ? "text-green-400" : score < -0.15 ? "text-red-400" : "text-yellow-400";

  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-muted uppercase tracking-wider">{title}</span>
        <Arrow size={13} className={arrowColor} />
      </div>
      <span className={cn("self-start text-[11px] font-semibold px-2 py-0.5 rounded-full", labelColor(label))}>
        {label}
      </span>
      <ScoreBar score={score} />
      <p className="text-[11px] text-text-muted leading-relaxed">{description}</p>
    </div>
  );
}

// ── chip list ──────────────────────────────────────────────────────────────────

function ChipList({ items, variant }: { items: string[]; variant: "good" | "bad" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(item => (
        <span
          key={item}
          className={cn(
            "text-[11px] px-2 py-0.5 rounded-full border",
            variant === "good"
              ? "bg-green-500/10 text-green-300 border-green-500/25"
              : "bg-red-500/10 text-red-300 border-red-500/25"
          )}
        >
          {item}
        </span>
      ))}
      {items.length === 0 && <span className="text-[11px] text-text-muted italic">—</span>}
    </div>
  );
}

// ── signal table ───────────────────────────────────────────────────────────────

function SignalTable({ signals }: { signals: Record<string, number | null> }) {
  const rows = Object.entries(signals).map(([k, v]) => ({
    key: k.replace(/_/g, " ").replace(" pct", " %"),
    val: v,
  }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left pb-2 text-text-muted font-medium">Signal</th>
            <th className="text-right pb-2 text-text-muted font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, val }) => (
            <tr key={key} className="border-b border-border/40">
              <td className="py-1.5 text-text-muted capitalize">{key}</td>
              <td className={cn(
                "py-1.5 text-right tabular-nums font-mono",
                val == null ? "text-text-muted" :
                  val > 2 ? "text-green-400" : val < -2 ? "text-red-400" :
                  val > 0 ? "text-green-300/70" : "text-red-300/70"
              )}>
                {val == null ? "—" : `${val >= 0 ? "+" : ""}${val.toFixed(2)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── confidence meter ───────────────────────────────────────────────────────────

function ConfidenceMeter({ value }: { value: number }) {
  const pct = value * 100;
  const color = pct > 60 ? "bg-green-500" : pct > 35 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-text-muted">{pct.toFixed(0)}% confidence</span>
    </div>
  );
}

// ── bias badge ─────────────────────────────────────────────────────────────────

function BiasBadge({ bias }: { bias: string }) {
  const cfg = bias === "Long-Biased"
    ? { color: "text-green-300 bg-green-500/15 border-green-500/30", icon: TrendingUp }
    : bias === "Short-Biased"
    ? { color: "text-red-300 bg-red-500/15 border-red-500/30", icon: TrendingDown }
    : { color: "text-yellow-300 bg-yellow-500/15 border-yellow-500/30", icon: Minus };

  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full border", cfg.color)}>
      <Icon size={13} />
      {bias}
    </span>
  );
}

// ── regime headline ────────────────────────────────────────────────────────────

function RegimeHeadline({ data }: { data: MarketRegimeResponse }) {
  const { regime, scores } = data;
  const isBullish = regime.trend === "Bull" && regime.risk === "Risk-On";
  const isBearish = regime.trend === "Bear" && regime.risk === "Risk-Off";
  const borderColor = isBullish ? "border-green-500/40" : isBearish ? "border-red-500/40" : "border-yellow-500/30";
  const bgColor     = isBullish ? "bg-green-500/5" : isBearish ? "bg-red-500/5" : "bg-yellow-500/5";

  return (
    <div className={cn("rounded-xl border p-6", borderColor, bgColor)}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-text-muted uppercase tracking-widest mb-1">Current Regime</p>
            <h1 className="text-2xl font-bold text-text-primary leading-tight">{regime.label}</h1>
          </div>
          <BiasBadge bias={regime.bias} />
        </div>
        <ConfidenceMeter value={regime.confidence} />
        <p className="text-xs text-text-muted">As of {data.as_of}</p>
      </div>
    </div>
  );
}

// ── dimension descriptions ─────────────────────────────────────────────────────

function dimDesc(dim: string, label: string): string {
  if (dim === "risk") {
    if (label === "Risk-On")  return "Credit spreads tight, VIX suppressed, SPY above key MAs";
    if (label === "Risk-Off") return "Credit spreads wide, VIX elevated, defensive outperforming";
    return "Mixed signals — credit and equity sending conflicting messages";
  }
  if (dim === "inflation") {
    if (label === "Inflation Rising") return "TIPS outperforming, gold and commodities trending higher";
    if (label === "Disinflation")     return "TIPS underperforming, commodity pressure easing";
    return "Inflation expectations stable — no clear directional bias";
  }
  if (dim === "growth") {
    if (label === "Growth Expanding") return "Cyclicals leading defensives, industrials outperforming utilities";
    if (label === "Growth Slowing")   return "Defensives leading — utilities/staples outperforming cyclicals";
    return "Mixed cyclical signals — growth momentum unclear";
  }
  if (dim === "trend") {
    if (label === "Bull")     return "SPY in full MA stack (price > 50d > 200d), positive 1yr momentum";
    if (label === "Bear")     return "SPY below key MAs, negative momentum — distribution phase";
    return "SPY oscillating around MAs — choppy, range-bound environment";
  }
  if (dim === "volatility") {
    if (label === "Vol Expanding")   return "VIX rising above its moving average — risk increasing";
    if (label === "Vol Compressing") return "VIX trending below its MA — calm, carry-friendly environment";
    return "Volatility at neutral levels relative to recent history";
  }
  return "";
}

// ── main page ──────────────────────────────────────────────────────────────────

export default function RegimePage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["market-regime"],
    queryFn: api.getMarketRegime,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [showSignals, setShowSignals] = React.useState(false);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3 text-text-muted">
        <RefreshCw size={16} className="animate-spin" />
        <span className="text-sm">Detecting market regime…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <AlertTriangle size={24} className="text-red-400 mx-auto" />
          <p className="text-sm text-text-muted">Failed to load regime data</p>
          <button onClick={() => refetch()} className="text-xs text-accent hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  const { regime, scores, recommendations } = data;

  const dims = [
    { key: "risk",       title: "Risk Sentiment", label: regime.risk,       score: scores.risk },
    { key: "inflation",  title: "Inflation",      label: regime.inflation,  score: scores.inflation },
    { key: "growth",     title: "Growth",         label: regime.growth,     score: scores.growth },
    { key: "trend",      title: "Market Trend",   label: regime.trend,      score: scores.trend },
    { key: "volatility", title: "Volatility",     label: regime.volatility, score: -scores.volatility },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header
        className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border px-4 flex items-center justify-between"
        style={{ paddingTop: `calc(env(safe-area-inset-top) + 8px)`, paddingBottom: "10px" }}
      >
        <h2 className="text-[14px] font-bold text-text-primary">Market Regime</h2>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center justify-center w-8 h-8 rounded-xl bg-surface-2 text-text-muted active:bg-border transition-colors"
        >
          <RefreshCw size={13} className={cn(isFetching && "animate-spin")} />
        </button>
      </header>

      <div className="flex flex-col gap-5 p-4">

      {/* Headline */}
      <RegimeHeadline data={data} />

      {/* 5 Dimensions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {dims.map(d => (
          <DimCard
            key={d.key}
            title={d.title}
            label={d.label}
            score={d.score}
            description={dimDesc(d.key, d.label)}
          />
        ))}
      </div>

      {/* Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Factors */}
        <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2">
            <Zap size={12} className="text-accent" />
            Factor Recommendations
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 size={12} className="text-green-400" />
                <span className="text-[11px] font-medium text-green-300">Favor</span>
              </div>
              <ChipList items={recommendations.best_factors} variant="good" />
            </div>
            <div className="border-t border-border/50 pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <XCircle size={12} className="text-red-400" />
                <span className="text-[11px] font-medium text-red-300">Avoid</span>
              </div>
              <ChipList items={recommendations.avoid_factors} variant="bad" />
            </div>
          </div>
        </div>

        {/* Sectors */}
        <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2">
            <Zap size={12} className="text-accent" />
            Sector Recommendations
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 size={12} className="text-green-400" />
                <span className="text-[11px] font-medium text-green-300">Overweight</span>
              </div>
              <ChipList items={recommendations.best_sectors} variant="good" />
            </div>
            <div className="border-t border-border/50 pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <XCircle size={12} className="text-red-400" />
                <span className="text-[11px] font-medium text-red-300">Underweight / Avoid</span>
              </div>
              <ChipList items={recommendations.avoid_sectors} variant="bad" />
            </div>
          </div>
        </div>
      </div>

      {/* Positioning */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="text-[11px] text-text-muted uppercase tracking-wider mb-2">Position Sizing</p>
          <p className="text-sm text-text-primary leading-relaxed">{recommendations.sizing}</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="text-[11px] text-text-muted uppercase tracking-wider mb-2">Directional Bias</p>
          <BiasBadge bias={regime.bias} />
        </div>
      </div>

      {/* Signal Details (collapsible) */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setShowSignals(v => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-surface-2 transition-colors"
        >
          <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
            Raw Signal Values
          </span>
          <span className="text-[11px] text-text-muted">{showSignals ? "Hide" : "Show"}</span>
        </button>
        {showSignals && (
          <div className="px-4 pb-4">
            <SignalTable signals={data.signals} />
          </div>
        )}
      </div>

      </div>
    </div>
  );
}

// React must be in scope for JSX hooks
import React from "react";
