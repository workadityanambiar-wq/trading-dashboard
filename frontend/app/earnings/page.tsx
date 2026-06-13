"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type EarningsCalendarStock, type OptionsFlowItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  RefreshCw, Calendar, AlertTriangle, ChevronDown, ChevronUp,
  TrendingUp, Activity,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}
function num(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return v.toFixed(dec);
}
function clr(v: number | null, invert = false): string {
  if (v == null) return "text-text-muted";
  const pos = invert ? v < 0 : v > 0;
  return pos ? "text-emerald-400" : "text-red-400";
}

function formatDate(dateStr: string, daysFromToday: number): string {
  if (daysFromToday === 0) return "Today";
  if (daysFromToday === 1) return "Tomorrow";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const SETUP_COLOR: Record<string, string> = {
  "Early Breakout":             "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  "Volatility Squeeze":         "text-amber-400 bg-amber-500/10 border-amber-500/30",
  "Momentum Continuation":      "text-blue-400 bg-blue-500/10 border-blue-500/30",
  "Institutional Accumulation": "text-purple-400 bg-purple-500/10 border-purple-500/30",
  "Mean Reversion Bounce":      "text-teal-400 bg-teal-500/10 border-teal-500/30",
  "Failed Breakdown Reversal":  "text-orange-400 bg-orange-500/10 border-orange-500/30",
  "No Setup":                   "text-text-muted bg-surface border-border",
};

const STAGE_COLOR: Record<number, string> = {
  1: "text-text-muted",
  2: "text-emerald-400",
  3: "text-amber-400",
  4: "text-red-400",
};

function SetupBadge({ setup }: { setup: string }) {
  const cls = SETUP_COLOR[setup] ?? "text-text-muted bg-surface border-border";
  const short: Record<string, string> = {
    "Early Breakout": "EB", "Volatility Squeeze": "VS",
    "Momentum Continuation": "MC", "Institutional Accumulation": "IA",
    "Mean Reversion Bounce": "MR", "Failed Breakdown Reversal": "FB",
    "No Setup": "—",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-semibold leading-none", cls)} title={setup}>
      {short[setup] ?? setup.slice(0, 2)}
    </span>
  );
}

function ScoreMini({ score }: { score: number | null }) {
  if (score == null) return <span className="text-text-muted">—</span>;
  const w = Math.round(Math.max(0, Math.min(100, score)));
  const color = w >= 75 ? "bg-emerald-500" : w >= 60 ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1 rounded-full bg-surface-2 overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs tabular-nums">{w}</span>
    </div>
  );
}

// ── Options Flow Cells ────────────────────────────────────────────────────────

function ExpMoveBadge({ pct, loading }: { pct: number | null; loading: boolean }) {
  if (loading) return <span className="text-text-muted/40 text-[10px]">…</span>;
  if (pct == null) return <span className="text-text-muted">—</span>;
  const color = pct >= 10 ? "text-red-400 bg-red-500/10 border-red-500/30"
              : pct >= 5  ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
              :              "text-green-400 bg-green-500/10 border-green-500/30";
  return (
    <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-semibold tabular-nums", color)}>
      ±{pct.toFixed(1)}%
    </span>
  );
}

function IVCell({ iv, loading }: { iv: number | null; loading: boolean }) {
  if (loading) return <span className="text-text-muted/40 text-[10px]">…</span>;
  if (iv == null) return <span className="text-text-muted">—</span>;
  const color = iv >= 80 ? "text-red-400" : iv >= 50 ? "text-amber-400" : "text-text-primary";
  return <span className={cn("tabular-nums", color)}>{iv.toFixed(0)}%</span>;
}

function PCCell({ ratio, loading }: { ratio: number | null; loading: boolean }) {
  if (loading) return <span className="text-text-muted/40 text-[10px]">…</span>;
  if (ratio == null) return <span className="text-text-muted">—</span>;
  // High P/C = bearish sentiment, low = bullish
  const color = ratio > 1.2 ? "text-red-400" : ratio < 0.7 ? "text-green-400" : "text-text-primary";
  return <span className={cn("tabular-nums", color)}>{ratio.toFixed(2)}</span>;
}

function VolCell({ calls, puts, loading }: { calls: number | null; puts: number | null; loading: boolean }) {
  if (loading) return <span className="text-text-muted/40 text-[10px]">…</span>;
  if (calls == null && puts == null) return <span className="text-text-muted">—</span>;
  const total = (calls ?? 0) + (puts ?? 0);
  const fmt = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(0)}K` : `${n}`;
  return (
    <div className="flex flex-col gap-0.5 text-[10px] tabular-nums">
      <span className="text-green-400">C:{fmt(calls ?? 0)}</span>
      <span className="text-red-400">P:{fmt(puts ?? 0)}</span>
    </div>
  );
}

// ── Date section ──────────────────────────────────────────────────────────────

type ViewMode = "technical" | "options";

function DateSection({
  dateStr, daysFromToday, stocks, optionsFlow, optionsLoading, viewMode,
}: {
  dateStr: string;
  daysFromToday: number;
  stocks: EarningsCalendarStock[];
  optionsFlow: Record<string, OptionsFlowItem>;
  optionsLoading: boolean;
  viewMode: ViewMode;
}) {
  const [open, setOpen] = useState(true);

  const urgency =
    daysFromToday === 0 ? "text-red-400 border-red-500/40 bg-red-500/5" :
    daysFromToday === 1 ? "text-red-300 border-red-500/30 bg-red-500/5" :
    daysFromToday <= 3  ? "text-amber-400 border-amber-500/30 bg-amber-500/5" :
    daysFromToday <= 7  ? "text-yellow-400/80 border-yellow-500/20 bg-yellow-500/5" :
                          "text-text-muted border-border bg-surface";

  const withSetup = stocks.filter(s => s.setup !== "No Setup").length;

  // Options summary: biggest expected move
  const maxMove = stocks.reduce((max, s) => {
    const flow = optionsFlow[s.ticker];
    const m = flow?.expected_move_pct ?? 0;
    return m > max ? m : max;
  }, 0);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn("w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-border", urgency)}
      >
        <Calendar size={13} className="shrink-0" />
        <span className="font-semibold text-sm">{formatDate(dateStr, daysFromToday)}</span>
        <span className="text-xs opacity-70">{dateStr}</span>
        {daysFromToday <= 3 && <AlertTriangle size={12} className="inline" />}
        <span className="ml-auto text-xs opacity-70">{stocks.length} stocks</span>
        {withSetup > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
            {withSetup} setups
          </span>
        )}
        {maxMove >= 5 && !optionsLoading && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
            max ±{maxMove.toFixed(0)}%
          </span>
        )}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="overflow-x-auto">
          {viewMode === "technical" ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Ticker</th>
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Setup</th>
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Stage</th>
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Score★</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Price</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">1D</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">RS/SPY</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">RS/Sect</th>
                  <th className="px-3 py-2 text-center text-text-muted font-medium">3×RS</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">RSI</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Vol×</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">52W Hi</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stocks.map(s => (
                  <tr key={s.ticker} className="hover:bg-surface-2 transition-colors">
                    <td className="px-3 py-2 font-mono font-semibold text-text-primary">{s.ticker}</td>
                    <td className="px-3 py-2"><SetupBadge setup={s.setup} /></td>
                    <td className={cn("px-3 py-2 font-medium", s.stage != null ? (STAGE_COLOR[s.stage as 1|2|3|4] ?? "text-text-muted") : "text-text-muted")}>
                      {s.stage != null ? `S${s.stage}` : "—"}
                    </td>
                    <td className="px-3 py-2"><ScoreMini score={s.regime_adjusted_score} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-primary">
                      {s.price != null ? `$${s.price.toFixed(2)}` : "—"}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", clr(s.chg_1d))}>{pct(s.chg_1d)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", clr(s.rs_spy_20d))}>{pct(s.rs_spy_20d)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", clr(s.rs_sector_20d))}>{pct(s.rs_sector_20d)}</td>
                    <td className="px-3 py-2 text-center">
                      {s.triple_rs ? <span className="text-emerald-400 font-bold">✓</span> : <span className="text-text-muted/40">✗</span>}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums",
                      s.rsi != null ? s.rsi >= 70 ? "text-red-400" : s.rsi <= 35 ? "text-blue-400" : "text-text-primary" : "text-text-muted")}>
                      {num(s.rsi)}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums",
                      s.vol_surge != null ? s.vol_surge >= 1.5 ? "text-amber-400" : "text-text-primary" : "text-text-muted")}>
                      {s.vol_surge != null ? `${s.vol_surge.toFixed(1)}×` : "—"}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", clr(s.dist_52w_high))}>{pct(s.dist_52w_high)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums font-medium",
                      daysFromToday <= 2 ? "text-red-400" : daysFromToday <= 5 ? "text-amber-400" : "text-text-muted")}>
                      {s.days_to_earnings}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* ── Options Flow View ─────────────────────────────────────── */
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Ticker</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Price</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">1D</th>
                  <th className="px-3 py-2 text-center text-text-muted font-medium">Exp Move</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">ATM IV</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">P/C Ratio</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Call / Put Vol</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Expiry</th>
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Setup</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stocks.map(s => {
                  const flow = optionsFlow[s.ticker] ?? null;
                  const loading = optionsLoading && !flow;
                  return (
                    <tr key={s.ticker} className="hover:bg-surface-2 transition-colors">
                      <td className="px-3 py-2 font-mono font-semibold text-text-primary">{s.ticker}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-text-primary">
                        {s.price != null ? `$${s.price.toFixed(2)}` : "—"}
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", clr(s.chg_1d))}>{pct(s.chg_1d)}</td>
                      <td className="px-3 py-2 text-center">
                        <ExpMoveBadge pct={flow?.expected_move_pct ?? null} loading={loading} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <IVCell iv={flow?.atm_iv ?? null} loading={loading} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <PCCell ratio={flow?.put_call_vol_ratio ?? null} loading={loading} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <VolCell calls={flow?.call_volume ?? null} puts={flow?.put_volume ?? null} loading={loading} />
                      </td>
                      <td className="px-3 py-2 text-right text-text-muted text-[10px] tabular-nums">
                        {loading ? "…" : (flow?.expiry_used ?? "—")}
                      </td>
                      <td className="px-3 py-2"><SetupBadge setup={s.setup} /></td>
                      <td className={cn("px-3 py-2 text-right tabular-nums font-medium",
                        daysFromToday <= 2 ? "text-red-400" : daysFromToday <= 5 ? "text-amber-400" : "text-text-muted")}>
                        {s.days_to_earnings}d
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EarningsPage() {
  const [universe,   setUniverse]   = useState("sp500");
  const [daysAhead,  setDaysAhead]  = useState(21);
  const [onlySetups, setOnlySetups] = useState(false);
  const [minScore,   setMinScore]   = useState(0);
  const [viewMode,   setViewMode]   = useState<ViewMode>("technical");

  const calendarKey = ["earnings-calendar", universe, daysAhead, onlySetups, minScore];

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: calendarKey,
    queryFn:  () => api.getEarningsCalendar({ universe, days_ahead: daysAhead, only_setups: onlySetups, min_score: minScore }),
    staleTime: 5 * 60 * 1000,
  });

  // Collect all upcoming tickers + their earnings dates for options flow query
  const { nearTickers, nearDates } = useMemo(() => {
    const tickers: string[] = [];
    const dates:   string[] = [];
    if (!data?.days) return { nearTickers: tickers, nearDates: dates };
    for (const day of data.days) {
      if (day.days_from_today > 14) continue;
      for (const s of day.stocks) {
        tickers.push(s.ticker);
        dates.push(day.date);
      }
    }
    return { nearTickers: tickers, nearDates: dates };
  }, [data]);

  const optionsKey = ["earnings-options-flow", nearTickers.join(",")];
  const {
    data: optionsData,
    isLoading: optionsLoading,
    isFetching: optionsFetching,
    refetch: refetchOptions,
  } = useQuery({
    queryKey: optionsKey,
    queryFn:  () => api.getEarningsOptionsFlow(nearTickers, nearDates),
    enabled:  nearTickers.length > 0 && viewMode === "options",
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const optionsFlow = optionsData?.options_flow ?? {};

  const days        = data?.days ?? [];
  const totalStocks = data?.total_stocks ?? 0;
  const totalSetups = data?.total_with_setups ?? 0;

  return (
    <div className="space-y-5 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold">Earnings Calendar</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Upcoming earnings with setup context and options flow
          </p>
        </div>
        <button
          onClick={() => { refetch(); if (viewMode === "options") refetchOptions(); }}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View toggle */}
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setViewMode("technical")}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
              viewMode === "technical" ? "bg-surface-2 text-text-primary" : "text-text-muted hover:text-text-primary")}
          >
            <TrendingUp size={11} /> Technical
          </button>
          <button
            onClick={() => setViewMode("options")}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs border-l border-border transition-colors",
              viewMode === "options" ? "bg-surface-2 text-text-primary" : "text-text-muted hover:text-text-primary")}
          >
            <Activity size={11} /> Options Flow
            {optionsFetching && <RefreshCw size={9} className="animate-spin ml-1" />}
          </button>
        </div>

        {/* Universe */}
        <select
          value={universe}
          onChange={e => setUniverse(e.target.value)}
          className="text-xs bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-text-primary focus:outline-none"
        >
          <option value="sp500">S&P 500</option>
          <option value="sp1500">S&P 1500</option>
          <option value="nifty50">Nifty 50</option>
          <option value="euro_top">Europe Top 40</option>
          <option value="etfs">Popular ETFs</option>
          <option value="all_cached">All Cached</option>
        </select>

        {/* Days ahead */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted">Look ahead</span>
          {[7, 14, 21, 30].map(d => (
            <button key={d} onClick={() => setDaysAhead(d)}
              className={cn("px-2.5 py-1 rounded text-xs border transition-colors",
                daysAhead === d ? "border-accent bg-surface-2 text-text-primary" : "border-border text-text-muted hover:text-text-primary")}>
              {d}D
            </button>
          ))}
        </div>

        {/* Filters */}
        <button onClick={() => setOnlySetups(o => !o)}
          className={cn("px-3 py-1 rounded text-xs border transition-colors",
            onlySetups ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-border text-text-muted hover:text-text-primary")}>
          Setups only
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted">Min Score</span>
          {[0, 50, 60, 70].map(s => (
            <button key={s} onClick={() => setMinScore(s)}
              className={cn("px-2 py-1 rounded text-xs border transition-colors",
                minScore === s ? "border-accent bg-surface-2 text-text-primary" : "border-border text-text-muted hover:text-text-primary")}>
              {s === 0 ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-lg border border-border bg-surface text-xs">
          <span><span className="text-text-muted">Upcoming: </span><span className="font-semibold text-text-primary">{totalStocks}</span></span>
          <span><span className="text-text-muted">With setup: </span><span className="font-semibold text-emerald-400">{totalSetups}</span></span>
          <span><span className="text-text-muted">Days grouped: </span><span className="font-semibold text-text-primary">{days.length}</span></span>
          {viewMode === "options" && nearTickers.length > 0 && (
            <span className="text-text-muted">
              Options flow: <span className={optionsLoading ? "text-amber-400" : "text-emerald-400"}>
                {optionsLoading ? `fetching ${nearTickers.length} tickers…` : `${Object.keys(optionsFlow).length} loaded`}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Options flow note */}
      {viewMode === "options" && nearTickers.length > 0 && optionsLoading && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs text-amber-400">
          <RefreshCw size={11} className="animate-spin shrink-0" />
          Fetching live options chains for {nearTickers.length} tickers — this takes 15-30 seconds…
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-text-muted text-sm py-16 justify-center">
          <RefreshCw size={14} className="animate-spin" />
          Loading earnings calendar…
        </div>
      )}

      {error && <div className="text-red-400 text-sm py-8 text-center">Failed to load earnings calendar.</div>}

      {!isLoading && data && days.length === 0 && (
        <div className="text-center py-16 text-text-muted text-sm space-y-2">
          <p>No upcoming earnings found in the next {daysAhead} days for this universe.</p>
        </div>
      )}

      {/* Calendar sections */}
      <div className="space-y-3">
        {days.map(day => (
          <DateSection
            key={day.date}
            dateStr={day.date}
            daysFromToday={day.days_from_today}
            stocks={day.stocks}
            optionsFlow={optionsFlow}
            optionsLoading={optionsLoading && viewMode === "options"}
            viewMode={viewMode}
          />
        ))}
      </div>

      {/* Legend */}
      {days.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-border text-xs text-text-muted">
          {viewMode === "technical" ? (
            <>
              <div><span className="font-medium text-text-primary">Score★</span> — Regime-adjusted confluence (70% setup quality + 30% regime fit)</div>
              <div><span className="font-medium text-text-primary">3×RS</span> — Stock outperforms sector AND sector outperforms market</div>
              <div><span className="font-medium text-text-primary">Days</span> — Calendar days until earnings; red ≤ 2d, amber ≤ 5d</div>
            </>
          ) : (
            <>
              <div><span className="font-medium text-text-primary">Exp Move</span> — ATM straddle price / stock price (±% the market prices in)</div>
              <div><span className="font-medium text-text-primary">ATM IV</span> — Implied volatility of at-the-money option; red ≥ 80%, amber ≥ 50%</div>
              <div><span className="font-medium text-text-primary">P/C Ratio</span> — Put/Call volume ratio; &gt;1.2 = bearish flow, &lt;0.7 = bullish flow</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
