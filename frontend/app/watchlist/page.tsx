"use client";
import { useState, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type SetupSignal } from "@/lib/api";
import { useWatchlist } from "@/hooks/useWatchlist";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Star, Plus, X, RefreshCw, Trash2, ChevronUp, ChevronDown,
} from "lucide-react";
import { TickerChip } from "@/components/TickerChip";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}
function num(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return v.toFixed(dec);
}
function clr(v: number | null): string {
  if (v == null) return "text-text-muted";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-text-muted";
}

const SETUP_META: Record<string, { short: string; color: string; bg: string; border: string }> = {
  "Early Breakout":             { short: "EB",  color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  "Volatility Squeeze":         { short: "VS",  color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
  "Momentum Continuation":      { short: "MC",  color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30" },
  "Institutional Accumulation": { short: "IA",  color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/30" },
  "Mean Reversion Bounce":      { short: "MR",  color: "text-teal-400",    bg: "bg-teal-500/10",    border: "border-teal-500/30" },
  "Failed Breakdown Reversal":  { short: "FB",  color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30" },
  "No Setup":                   { short: "—",   color: "text-text-muted",  bg: "bg-surface",        border: "border-border" },
};

const STAGE_COLOR: Record<number, string> = {
  1: "text-text-muted",
  2: "text-emerald-400",
  3: "text-amber-400",
  4: "text-red-400",
};

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-text-muted">—</span>;
  const w = Math.round(Math.max(0, Math.min(100, score)));
  const color = w >= 75 ? "bg-emerald-500" : w >= 60 ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs tabular-nums">{w}</span>
    </div>
  );
}

function eventBadge(daysToEarn: number | null, daysToOpex: number | null) {
  const badges: React.ReactNode[] = [];
  if (daysToEarn != null) {
    if (daysToEarn <= 2)
      badges.push(<span key="e" className="px-1 rounded text-[10px] bg-red-500/20 text-red-400 font-bold">E{daysToEarn}d</span>);
    else if (daysToEarn <= 7)
      badges.push(<span key="e" className="px-1 rounded text-[10px] bg-amber-500/20 text-amber-400 font-bold">E{daysToEarn}d</span>);
  }
  if (daysToOpex != null && daysToOpex <= 2)
    badges.push(<span key="ox" className="px-1 rounded text-[10px] bg-amber-500/20 text-amber-400 font-bold">OX{daysToOpex}d</span>);
  return badges.length ? <span className="flex items-center gap-0.5">{badges}</span> : null;
}

type SortKey = "ticker" | "setup" | "stage" | "regime_adjusted_score" | "rs_spy_20d" | "rsi" | "vol_surge" | "dist_52w_high";

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WatchlistPage() {
  const { tickers, add, remove, clear, mounted } = useWatchlist();
  const [input, setInput]           = useState("");
  const [sortKey, setSortKey]       = useState<SortKey>("regime_adjusted_score");
  const [sortAsc, setSortAsc]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const universe = tickers.join(",");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["watchlist", universe],
    queryFn:  () => api.getSetups({
      universe,
      include_no_setup: true,
      sort_by: "ticker",
      desc: false,
      page_size: 200,
    }),
    enabled: mounted && tickers.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const parts = input.split(/[\s,]+/).filter(Boolean);
    parts.forEach(t => add(t));
    setInput("");
    inputRef.current?.focus();
  }

  const results: SetupSignal[] = data?.results ?? [];

  // Merge: tickers in watchlist but missing from results (no price data) still show as empty rows
  const rows = useMemo(() => {
    const map = new Map(results.map(r => [r.ticker, r]));
    const merged = tickers.map(t => map.get(t) ?? null);
    return merged;
  }, [results, tickers]);

  const sorted = useMemo(() => {
    const withData  = rows.filter((r): r is SetupSignal => r !== null);
    const noData    = tickers.filter((_, i) => rows[i] === null);

    const sorted = [...withData].sort((a, b) => {
      let av: number | string | null;
      let bv: number | string | null;
      if (sortKey === "ticker")  { av = a.ticker; bv = b.ticker; }
      else if (sortKey === "setup") { av = a.setup; bv = b.setup; }
      else { av = (a as unknown as Record<string, unknown>)[sortKey] as number | null; bv = (b as unknown as Record<string, unknown>)[sortKey] as number | null; }

      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    return { sorted, noDataTickers: noData };
  }, [rows, tickers, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronDown size={10} className="text-text-muted/40" />;
    return sortAsc ? <ChevronUp size={10} className="text-accent" /> : <ChevronDown size={10} className="text-accent" />;
  }

  const withSetup = sorted.sorted.filter(r => r.setup !== "No Setup").length;
  const avgRS = sorted.sorted.length
    ? sorted.sorted.reduce((s, r) => s + (r.rs_spy_20d ?? 0), 0) / sorted.sorted.length
    : null;

  if (!mounted) return null;

  // ── Empty state ───────────────────────────────────────────────────────────
  if (tickers.length === 0) {
    return (
      <div className="space-y-5 max-w-screen-2xl">
        <div>
          <h1 className="text-base font-semibold">Watchlist</h1>
          <p className="text-xs text-text-muted mt-0.5">Track your favourite tickers with live setup context</p>
        </div>
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Add tickers… e.g. AAPL, NVDA, MSFT"
            className="flex-1 max-w-xs text-sm bg-surface-2 border border-border rounded-md px-3 py-2 text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-accent"
          />
          <button type="submit"
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-accent/15 border border-accent/30 rounded-md text-accent hover:bg-accent/25 transition-colors">
            <Plus size={13} /> Add
          </button>
        </form>
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-muted">
          <Star size={32} strokeWidth={1} />
          <p className="text-sm">Your watchlist is empty</p>
          <p className="text-xs text-center max-w-xs">
            Add tickers above, or use the <Star size={11} className="inline" /> button on the
            Setups and Pre-Breakout pages to save stocks directly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold">Watchlist</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Live setup context for tracked tickers · sorted by {sortKey.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={() => { if (confirm("Clear watchlist?")) clear(); }}
            className="flex items-center gap-1.5 text-xs text-red-400/60 hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      </div>

      {/* Add input + ticker chips */}
      <div className="space-y-2">
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Add ticker… AAPL"
            className="text-sm bg-surface-2 border border-border rounded-md px-3 py-1.5 text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-accent w-44"
          />
          <button type="submit"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-accent/10 border border-accent/25 rounded-md text-accent hover:bg-accent/20 transition-colors">
            <Plus size={12} /> Add
          </button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {tickers.map(t => (
            <span key={t}
              className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-surface-2 border border-border text-xs font-mono text-text-primary">
              {t}
              <button onClick={() => remove(t)}
                className="text-text-muted hover:text-red-400 transition-colors ml-0.5">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Stats */}
      {data && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-lg border border-border bg-surface text-xs">
          <span><span className="text-text-muted">Tracking: </span><span className="font-semibold">{tickers.length}</span></span>
          <span><span className="text-text-muted">With setup: </span><span className="font-semibold text-emerald-400">{withSetup}</span></span>
          {avgRS != null && (
            <span>
              <span className="text-text-muted">Avg RS/SPY: </span>
              <span className={cn("font-semibold", avgRS > 0 ? "text-emerald-400" : "text-red-400")}>
                {avgRS >= 0 ? "+" : ""}{(avgRS * 100).toFixed(1)}%
              </span>
            </span>
          )}
          {data.regime && (
            <span className="ml-auto text-text-muted">
              Regime: <span className="text-text-primary font-medium">{data.regime}</span>
            </span>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 text-text-muted text-sm py-10 justify-center">
          <RefreshCw size={14} className="animate-spin" />
          Loading watchlist data…
        </div>
      )}

      {/* Table */}
      {!isLoading && (sorted.sorted.length > 0 || sorted.noDataTickers.length > 0) && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-surface">
                {(
                  [
                    ["ticker",               "Ticker",    "text-left"],
                    ["setup",                "Setup",     "text-left"],
                    ["stage",                "Stage",     "text-left"],
                    ["regime_adjusted_score","Score★",    "text-left"],
                    ["rs_spy_20d",           "RS/SPY",    "text-right"],
                    ["rsi",                  "RSI",       "text-right"],
                    ["vol_surge",            "Vol×",      "text-right"],
                    ["dist_52w_high",        "52W Hi",    "text-right"],
                  ] as [SortKey, string, string][]
                ).map(([k, label, align]) => (
                  <th key={k}
                    className={cn("px-3 py-2.5 font-medium text-text-muted cursor-pointer hover:text-text-primary select-none", align)}
                    onClick={() => toggleSort(k)}>
                    <span className="flex items-center gap-1">
                      {align === "text-right" && <SortIcon k={k} />}
                      {label}
                      {align === "text-left"  && <SortIcon k={k} />}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Events</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Price</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">1D</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.sorted.map(r => {
                const sm   = SETUP_META[r.setup] ?? SETUP_META["No Setup"];
                const isNoSetup = r.setup === "No Setup";
                return (
                  <tr key={r.ticker}
                    className={cn("hover:bg-surface-2 transition-colors", isNoSetup && "opacity-60")}>
                    <td className="px-3 py-2.5">
                      <TickerChip ticker={r.ticker} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-semibold", sm.color, sm.bg, sm.border)}
                        title={r.setup}>
                        {sm.short}
                      </span>
                    </td>
                    <td className={cn("px-3 py-2.5 font-medium text-xs",
                      r.stage != null ? (STAGE_COLOR[r.stage as 1|2|3|4] ?? "text-text-muted") : "text-text-muted")}>
                      {r.stage != null ? `S${r.stage}` : "—"}
                    </td>
                    <td className="px-3 py-2.5"><ScoreBar score={r.regime_adjusted_score} /></td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", clr(r.rs_spy_20d))}>
                      {pct(r.rs_spy_20d)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      r.rsi == null ? "text-text-muted" :
                      r.rsi >= 70 ? "text-red-400" : r.rsi <= 35 ? "text-blue-400" : "text-text-primary")}>
                      {num(r.rsi, 0)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      r.vol_surge == null ? "text-text-muted" :
                      r.vol_surge >= 1.5 ? "text-amber-400" : "text-text-primary")}>
                      {r.vol_surge != null ? `${r.vol_surge.toFixed(1)}×` : "—"}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      r.dist_52w_high == null ? "text-text-muted" :
                      r.dist_52w_high > -0.05 ? "text-emerald-400" :
                      r.dist_52w_high > -0.15 ? "text-amber-400" : "text-text-muted")}>
                      {pct(r.dist_52w_high)}
                    </td>
                    <td className="px-3 py-2.5">
                      {eventBadge(r.days_to_earnings ?? null, r.days_to_opex ?? null)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-primary">
                      {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", clr(r.chg_1d))}>
                      {pct(r.chg_1d)}
                    </td>
                    <td className="px-2 py-2.5">
                      <button onClick={() => remove(r.ticker)}
                        className="text-text-muted/40 hover:text-red-400 transition-colors"
                        title={`Remove ${r.ticker}`}>
                        <X size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {/* Tickers with no cached price data */}
              {sorted.noDataTickers.map(t => (
                <tr key={t} className="opacity-40">
                  <td className="px-3 py-2.5 font-mono font-semibold text-text-muted">{t}</td>
                  <td colSpan={10} className="px-3 py-2.5 text-text-muted text-[11px]">
                    No price data — prefetch from Setups or Screener page
                  </td>
                  <td className="px-2 py-2.5">
                    <button onClick={() => remove(t)} className="text-text-muted/40 hover:text-red-400 transition-colors">
                      <X size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
