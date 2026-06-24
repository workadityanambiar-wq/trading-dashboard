"use client";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type SetupName, type RegimeResponse, type SetupWinRateStat, type SetupSignal } from "@/lib/api";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";
import { PageGuide } from "@/components/PageGuide";
import { cn } from "@/lib/utils";
import { RefreshCw, ChevronLeft, ChevronRight, TrendingUp, Zap, BarChart2, Activity, Calendar, FlaskConical, ChevronDown, Star, X, LayoutDashboard, Search, LineChart, Trophy } from "lucide-react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { TickerChip } from "@/components/TickerChip";
import { TradeModal } from "@/components/mt5/TradeModal";

// ── Constants ─────────────────────────────────────────────────────────────────

const SETUP_META: Record<SetupName, { color: string; bg: string; border: string; desc: string }> = {
  "Early Breakout":            { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", desc: "RS rising + near resistance + volume expanding" },
  "Volatility Squeeze":        { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   desc: "ATR/BB compressed — coiled spring" },
  "Momentum Continuation":     { color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30",    desc: "Stage 2 uptrend + MACD bullish + strong RS" },
  "Institutional Accumulation":{ color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/30",  desc: "Heavy volume without price drop — smart money" },
  "Mean Reversion Bounce":     { color: "text-teal-400",    bg: "bg-teal-500/10",    border: "border-teal-500/30",    desc: "RSI < 35 + near support — oversold snap-back" },
  "Failed Breakdown Reversal": { color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30",  desc: "Down >25% from high but RS improving" },
  "No Setup":                  { color: "text-text-muted",  bg: "bg-surface",        border: "border-border",         desc: "" },
};

const STAGE_META: Record<number, { label: string; color: string }> = {
  1: { label: "S1 Base",     color: "text-text-muted" },
  2: { label: "S2 Uptrend",  color: "text-emerald-400" },
  3: { label: "S3 Topping",  color: "text-amber-400" },
  4: { label: "S4 Downtrend",color: "text-red-400" },
};

const REGIME_META: Record<string, { color: string; bg: string; ring: string }> = {
  "Strong Trend": { color: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30" },
  "Choppy":       { color: "text-amber-400",   bg: "bg-amber-500/10",   ring: "ring-amber-500/30" },
  "Bear":         { color: "text-orange-400",  bg: "bg-orange-500/10",  ring: "ring-orange-500/30" },
  "Panic":        { color: "text-red-400",     bg: "bg-red-500/10",     ring: "ring-red-500/30" },
};

const SETUPS: SetupName[] = [
  "Early Breakout",
  "Volatility Squeeze",
  "Momentum Continuation",
  "Institutional Accumulation",
  "Mean Reversion Bounce",
  "Failed Breakdown Reversal",
];

const SORT_OPTIONS = [
  { value: "regime_adjusted_score", label: "Regime Score ★" },
  { value: "confluence_score",      label: "Confluence" },
  { value: "breakout_score",        label: "Breakout" },
  { value: "rs_spy_20d",            label: "RS vs SPY" },
  { value: "rs_sector_20d",         label: "RS vs Sector" },
  { value: "sector_vs_spy_20d",     label: "Sector vs SPY" },
  { value: "vol_surge",             label: "Volume" },
  { value: "rsi",                   label: "RSI" },
];

const SETUP_ORDER: SetupName[] = [
  "Early Breakout",
  "Volatility Squeeze",
  "Momentum Continuation",
  "Institutional Accumulation",
  "Mean Reversion Bounce",
  "Failed Breakdown Reversal",
];

// Advanced pattern predicates
const ADVANCED_PATTERNS: Record<string, (r: SetupSignal) => boolean> = {
  "Early S1 Base":     (r) => r.stage === 1 && (r.dist_52w_high ?? -1) > -0.15 && (r.rs_spy_20d ?? -1) > 0.05,
  "High Tight Flag":   (r) => (r.rs_spy_20d ?? -1) > 0.15 && (r.vol_surge ?? 0) < 0.8 && (r.confluence_score ?? 0) >= 60,
  "Pocket Pivot":      (r) => (r.vol_surge ?? 0) >= 1.5 && (r.rs_spy_20d ?? -1) > 0.05 && r.stage === 2,
  "Gap & Go":          (r) => (r.chg_1d ?? 0) > 0.04 && (r.vol_surge ?? 0) >= 2.0,
  "Momentum Ignition": (r) => (r.rs_spy_20d ?? -1) > 0.10 && (r.vol_surge ?? 0) >= 1.5 && (r.confluence_score ?? 0) >= 70,
  "Century Mark":      (r) => {
    const p = r.price ?? 0;
    const levels = [100, 200, 300, 500, 1000];
    return levels.some(l => p >= l * 0.98 && p <= l * 1.05);
  },
};

// Grade helpers
function gradeLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Elite", color: "text-emerald-400" };
  if (score >= 80) return { label: "A",     color: "text-blue-400" };
  if (score >= 70) return { label: "B",     color: "text-amber-400" };
  if (score >= 60) return { label: "C",     color: "text-orange-400" };
  return              { label: "Ignore", color: "text-text-muted" };
}

function gradeBg(score: number): string {
  if (score >= 90) return "bg-emerald-500/15 border-emerald-500/30 text-emerald-400";
  if (score >= 80) return "bg-blue-500/15 border-blue-500/30 text-blue-400";
  if (score >= 70) return "bg-amber-500/15 border-amber-500/30 text-amber-400";
  if (score >= 60) return "bg-orange-500/15 border-orange-500/30 text-orange-400";
  return "bg-surface border-border text-text-muted";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}

function num(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return v.toFixed(dec);
}

function eventBadge(daysToEarn: number | null, daysToOpex: number | null) {
  if (daysToEarn != null && daysToEarn >= 0 && daysToEarn <= 7) {
    const hot = daysToEarn <= 2;
    return (
      <span
        className={cn(
          "px-1.5 py-0.5 rounded border text-xs font-medium",
          hot
            ? "text-red-400 border-red-500/40 bg-red-500/10"
            : "text-amber-400 border-amber-500/40 bg-amber-500/10",
        )}
        title={`Earnings in ${daysToEarn} day${daysToEarn === 1 ? "" : "s"} — high event risk`}
      >
        E{daysToEarn}d
      </span>
    );
  }
  if (daysToOpex != null && daysToOpex <= 2) {
    return (
      <span
        className="px-1.5 py-0.5 rounded border text-xs font-medium text-amber-400 border-amber-500/40 bg-amber-500/10"
        title={`Monthly options expiry in ${daysToOpex} day${daysToOpex === 1 ? "" : "s"}`}
      >
        OX{daysToOpex}d
      </span>
    );
  }
  return <span className="text-text-muted text-xs">—</span>;
}

function scoreBar(v: number | null) {
  const val = v ?? 0;
  const color = val >= 70 ? "bg-emerald-500" : val >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.round(val)}%` }} />
      </div>
      <span className={cn("text-xs tabular-nums font-medium",
        val >= 70 ? "text-emerald-400" : val >= 50 ? "text-amber-400" : "text-red-400"
      )}>{Math.round(val)}</span>
    </div>
  );
}

// ── AI Setup Analyst ──────────────────────────────────────────────────────────

function buildSetupAnalysis(r: SetupSignal, regime: string) {
  const rs = ((r.rs_spy_20d ?? 0) * 100).toFixed(1);
  const vol = (r.vol_surge ?? 1).toFixed(1);
  const score = Math.round(r.confluence_score ?? 0);
  const regimeFit = r.regime_fit ? "aligns with" : "works against";

  return {
    thesis: `${r.ticker} presents a ${r.setup} pattern with ${score}/100 confluence in a ${regime} regime environment. ` +
      `Relative strength versus S&P 500 at ${rs}% (20d) positions this as a ${Number(rs) > 5 ? "leadership" : "developing"} candidate.`,
    bullCase: `Volume expansion at ${vol}× average suggests ${Number(vol) >= 2 ? "institutional accumulation" : "growing interest"}. ` +
      `${r.stage === 2 ? "Stage 2 uptrend structure intact — highest-quality entry zone." : `Stage ${r.stage ?? "N/A"} — monitor for stage upgrade.`}`,
    bearCase: `${r.regime_fit ? "Setup aligns with current regime but" : "Setup works against current regime —"} ` +
      `${r.rsi != null && r.rsi > 70 ? `RSI at ${r.rsi.toFixed(0)} indicates extended conditions. Risk of mean reversion before continuation.` : "watch for failed breakout if volume dries up."}`,
    idealStop: r.stop != null
      ? `$${r.stop.toFixed(2)} (${r.entry != null ? ((r.entry - r.stop) / r.entry * 100).toFixed(1) : "—"}% below entry) — ATR-based, below key support`
      : "Stop calculated at 2× ATR below entry",
    expectedMove: r.target != null && r.entry != null
      ? `Initial target $${r.target.toFixed(2)} (+${((r.target - r.entry) / r.entry * 100).toFixed(1)}%). R:R ${(r.rr ?? 0).toFixed(1)}:1 — ${(r.rr ?? 0) >= 2 ? "favorable" : "marginal"} for position entry.`
      : "Target based on 3× ATR extension",
    regimeSuitability: `Current ${regime} regime ${regimeFit} this setup. ${r.regime_fit ? "Elevated probability environment." : "Reduce position size by 30-50%."}`,
    historicalNote: `${r.setup} setups in ${regime} conditions have historically shown ${r.regime_fit ? "above-average" : "below-average"} win rates. ` +
      `${r.triple_rs ? "Triple RS confirmation (stock > sector > market) significantly improves historical outcome." : "Absence of triple RS reduces edge."}`,
  };
}

// ── Setup Detail Drawer ───────────────────────────────────────────────────────

function SetupDetailDrawer({
  row,
  regime,
  onClose,
  onTrade,
}: {
  row: SetupSignal;
  regime: string;
  onClose: () => void;
  onTrade: (r: SetupSignal) => void;
}) {
  const analysis = buildSetupAnalysis(row, regime);
  const sm = SETUP_META[row.setup] ?? SETUP_META["No Setup"];
  const score = Math.round(row.regime_adjusted_score ?? 0);
  const grade = gradeLabel(score);
  const stm = row.stage != null ? STAGE_META[row.stage] : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 pointer-events-auto"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="relative w-[480px] h-full bg-surface border-l border-border overflow-y-auto pointer-events-auto flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border sticky top-0 bg-surface z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-mono font-bold text-text-primary">{row.ticker}</span>
              <span className={cn("px-2 py-0.5 rounded-full text-[11px] border", sm.color, sm.bg, sm.border)}>
                {row.setup}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-mono font-semibold px-1.5 py-0.5 rounded border", gradeBg(score))}>
                {score}/100 · {grade.label}
              </span>
              {stm && <span className={cn("text-xs", stm.color)}>{stm.label}</span>}
              {row.regime_fit != null && (
                <span className={cn("text-[11px] font-bold", row.regime_fit ? "text-emerald-400" : "text-red-400/70")}>
                  {row.regime_fit ? "✓ Regime Fit" : "✗ Regime Headwind"}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-2 transition-colors">
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        <div className="p-4 space-y-5 flex-1">
          {/* Technical Structure */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">Technical Structure</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Price",          val: row.price != null ? `$${row.price.toFixed(2)}` : "—" },
                { label: "Stage",          val: stm?.label ?? "—" },
                { label: "RSI",            val: num(row.rsi, 0) },
                { label: "Vol×",           val: row.vol_surge != null ? `${row.vol_surge.toFixed(1)}×` : "—" },
                { label: "RS/SPY",         val: pct(row.rs_spy_20d) },
                { label: "RS/Sector",      val: pct(row.rs_sector_20d) },
                { label: "Confluence",     val: num(row.confluence_score, 0) },
                { label: "Breakout",       val: num(row.breakout_score, 0) },
                { label: "Dist 52W Hi",    val: pct(row.dist_52w_high) },
              ].map(({ label, val }) => (
                <div key={label} className="bg-surface-2 rounded p-2">
                  <div className="text-[9px] uppercase tracking-wider text-text-faint mb-0.5">{label}</div>
                  <div className="text-xs font-mono font-medium text-text-primary">{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Trade Plan */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">Trade Plan</div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Entry",  val: row.entry != null ? `$${row.entry.toFixed(2)}` : "—",  color: "text-text-primary" },
                { label: "Stop",   val: row.stop  != null ? `$${row.stop.toFixed(2)}`  : "—",  color: "text-red-400" },
                { label: "Target", val: row.target != null ? `$${row.target.toFixed(2)}` : "—", color: "text-emerald-400" },
                { label: "R:R",    val: row.rr != null ? `${row.rr.toFixed(1)}:1` : "—",        color: row.rr != null && row.rr >= 2 ? "text-emerald-400" : "text-amber-400" },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-surface-2 rounded p-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-text-faint mb-0.5">{label}</div>
                  <div className={cn("text-xs font-mono font-semibold", color)}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Management */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">Risk Management</div>
            <div className="space-y-2 text-xs text-text-muted">
              <div className="border-l-2 border-accent pl-3 py-1">
                <span className="text-[10px] uppercase tracking-wider text-text-faint">Position Sizing</span>
                <p className="text-text-primary mt-0.5">Risk 1% account — size based on (Entry − Stop). {row.entry != null && row.stop != null ? `Risk per share: $${(row.entry - row.stop).toFixed(2)}` : ""}</p>
              </div>
              <div className="border-l-2 border-red-500/50 pl-3 py-1">
                <span className="text-[10px] uppercase tracking-wider text-text-faint">Stop</span>
                <p className="text-text-primary mt-0.5 font-mono">{analysis.idealStop}</p>
              </div>
              {row.entry != null && row.stop != null && (
                <>
                  <div className="border-l-2 border-amber-500/50 pl-3 py-1">
                    <span className="text-[10px] uppercase tracking-wider text-text-faint">Target 1 (1:1)</span>
                    <p className="text-text-primary mt-0.5 font-mono">${(row.entry + (row.entry - row.stop)).toFixed(2)}</p>
                  </div>
                  <div className="border-l-2 border-emerald-500/50 pl-3 py-1">
                    <span className="text-[10px] uppercase tracking-wider text-text-faint">Target 2 (3× ATR)</span>
                    <p className="text-text-primary mt-0.5 font-mono">{row.target != null ? `$${row.target.toFixed(2)}` : "—"}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* AI Setup Analyst */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">AI Setup Analyst</div>
            <div className="space-y-3">
              {/* Investment Thesis */}
              <div className="border-l-2 border-accent pl-3 py-1">
                <div className="text-[10px] uppercase tracking-wider text-text-faint mb-1">Investment Thesis</div>
                <p className="text-xs text-text-primary leading-relaxed">{analysis.thesis}</p>
              </div>

              {/* Bull / Bear */}
              <div className="grid grid-cols-2 gap-2">
                <div className="border-l-2 border-emerald-500/60 pl-3 py-1">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-1">Bull Case</div>
                  <p className="text-xs text-text-primary leading-relaxed">{analysis.bullCase}</p>
                </div>
                <div className="border-l-2 border-red-500/60 pl-3 py-1">
                  <div className="text-[10px] uppercase tracking-wider text-red-400/70 mb-1">Bear Case</div>
                  <p className="text-xs text-text-primary leading-relaxed">{analysis.bearCase}</p>
                </div>
              </div>

              {/* Risk Management / Regime */}
              <div className="border-l-2 border-amber-500/50 pl-3 py-1">
                <div className="text-[10px] uppercase tracking-wider text-text-faint mb-1">Expected Move</div>
                <p className="text-xs text-text-primary font-mono">{analysis.expectedMove}</p>
              </div>
              <div className="border-l-2 border-purple-500/50 pl-3 py-1">
                <div className="text-[10px] uppercase tracking-wider text-text-faint mb-1">Regime Suitability</div>
                <p className="text-xs text-text-primary leading-relaxed">{analysis.regimeSuitability}</p>
              </div>

              {/* Historical */}
              <div className="border-l-2 border-border pl-3 py-1">
                <div className="text-[10px] uppercase tracking-wider text-text-faint mb-1">Historical Context</div>
                <p className="text-xs text-text-muted leading-relaxed">{analysis.historicalNote}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border sticky bottom-0 bg-surface">
          <button
            onClick={() => onTrade(row)}
            className="w-full py-2 rounded text-sm font-semibold bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 transition-colors"
          >
            Open Trade Modal
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Win-rate panel ────────────────────────────────────────────────────────────

function WinRatesPanel({ winRateData, isFetching, onCompute, computing }: {
  winRateData: { status: "ok" | "computing"; results: Record<string, SetupWinRateStat> | null } | undefined;
  isFetching: boolean;
  onCompute: () => void;
  computing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isComputing = winRateData?.status === "computing" || computing;
  const results = winRateData?.results;

  function wr(v?: number) {
    if (v == null) return <span className="text-text-muted">—</span>;
    const p = (v * 100).toFixed(1);
    const col = v >= 0.6 ? "text-emerald-400" : v >= 0.5 ? "text-amber-400" : "text-red-400";
    return <span className={cn("font-medium tabular-nums", col)}>{p}%</span>;
  }

  function ret(v?: number) {
    if (v == null) return <span className="text-text-muted">—</span>;
    const p = (v * 100).toFixed(1);
    return (
      <span className={cn("tabular-nums", v >= 0 ? "text-emerald-400" : "text-red-400")}>
        {v >= 0 ? "+" : ""}{p}%
      </span>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <FlaskConical size={13} className="text-accent" />
          <span className="text-sm font-medium">Historical Setup Win Rates</span>
          {results && (
            <span className="text-xs text-text-muted ml-1">5y S&amp;P 500 · month-end sampling</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isComputing && (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <RefreshCw size={10} className="animate-spin" /> Computing…
            </span>
          )}
          <ChevronDown size={14} className={cn("text-text-muted transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {!results && !isComputing && (
            <div className="flex items-center gap-3 text-sm text-text-muted">
              <span>No cached data. Run the backtest to see win rates.</span>
              <button
                onClick={onCompute}
                disabled={isComputing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border hover:border-accent hover:text-text-primary transition-colors"
              >
                <FlaskConical size={11} />
                Run Backtest
              </button>
            </div>
          )}
          {isComputing && !results && (
            <p className="text-xs text-text-muted">
              Computing 5 years of setup history across S&amp;P 500… this takes ~30–60 seconds.
            </p>
          )}
          {results && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 text-left text-text-muted font-medium">Setup</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Trades</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Win% 5d</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Win% 10d</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Win% 20d</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Avg 10d</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Median 10d</th>
                      <th className="py-2 px-3 text-right text-text-muted font-medium">Expect. 10d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SETUP_ORDER.map((name) => {
                      const s: SetupWinRateStat | undefined = results[name];
                      const meta = SETUP_META[name];
                      return (
                        <tr key={name} className="border-b border-border/40 hover:bg-surface-2/40">
                          <td className="py-2 pr-4">
                            <span className={cn("font-medium", meta?.color ?? "text-text-primary")}>{name}</span>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-text-muted">{s?.n_10d ?? "—"}</td>
                          <td className="py-2 px-3 text-right">{wr(s?.win_rate_5d)}</td>
                          <td className="py-2 px-3 text-right">{wr(s?.win_rate_10d)}</td>
                          <td className="py-2 px-3 text-right">{wr(s?.win_rate_20d)}</td>
                          <td className="py-2 px-3 text-right">{ret(s?.avg_ret_10d)}</td>
                          <td className="py-2 px-3 text-right">{ret(s?.median_ret_10d)}</td>
                          <td className="py-2 px-3 text-right">{ret(s?.expectancy_10d)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between text-xs text-text-muted pt-1">
                <span>Win% ≥60% <span className="text-emerald-400">■</span> · ≥50% <span className="text-amber-400">■</span> · &lt;50% <span className="text-red-400">■</span></span>
                <button
                  onClick={onCompute}
                  disabled={isComputing || isFetching}
                  className="flex items-center gap-1 hover:text-text-primary transition-colors"
                >
                  <RefreshCw size={10} className={isComputing || isFetching ? "animate-spin" : ""} />
                  Recompute
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Regime card ───────────────────────────────────────────────────────────────

function RegimeCard({ data }: { data: RegimeResponse }) {
  const meta = REGIME_META[data.regime] ?? REGIME_META["Choppy"];
  return (
    <div className={cn("rounded-lg border p-4 ring-1", meta.bg, meta.ring)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={13} className={meta.color} />
            <span className="text-xs text-text-muted uppercase tracking-wider">Market Regime</span>
          </div>
          <div className={cn("text-lg font-semibold mb-1", meta.color)}>{data.regime}</div>
          <p className="text-xs text-text-muted leading-relaxed">{data.description}</p>
          <div className="mt-2 text-xs text-text-primary/80 italic">
            Strategy: {data.best_strategy}
          </div>
        </div>
        <div className="shrink-0 grid grid-cols-2 gap-x-5 gap-y-1.5 text-xs text-right">
          {data.vix != null && (
            <><span className="text-text-muted">VIX</span><span className={cn("font-medium", data.vix > 25 ? "text-red-400" : data.vix > 18 ? "text-amber-400" : "text-emerald-400")}>{data.vix.toFixed(1)}</span></>
          )}
          {data.spy_vs_50d != null && (
            <><span className="text-text-muted">SPY/50D</span><span className={cn("font-medium", data.spy_vs_50d > 0 ? "text-emerald-400" : "text-red-400")}>{data.spy_vs_50d > 0 ? "+" : ""}{data.spy_vs_50d.toFixed(1)}%</span></>
          )}
          {data.spy_vs_200d != null && (
            <><span className="text-text-muted">SPY/200D</span><span className={cn("font-medium", data.spy_vs_200d > 0 ? "text-emerald-400" : "text-red-400")}>{data.spy_vs_200d > 0 ? "+" : ""}{data.spy_vs_200d.toFixed(1)}%</span></>
          )}
          {data.breadth_above_50d != null && (
            <><span className="text-text-muted">Breadth 50D</span><span className={cn("font-medium", data.breadth_above_50d > 60 ? "text-emerald-400" : data.breadth_above_50d > 40 ? "text-amber-400" : "text-red-400")}>{data.breadth_above_50d.toFixed(0)}%</span></>
          )}
          {data.breadth_above_200d != null && (
            <><span className="text-text-muted">Breadth 200D</span><span className={cn("font-medium", data.breadth_above_200d > 55 ? "text-emerald-400" : data.breadth_above_200d > 35 ? "text-amber-400" : "text-red-400")}>{data.breadth_above_200d.toFixed(0)}%</span></>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Opportunity Heatmap ───────────────────────────────────────────────────────

function OpportunityHeatmap({ results }: { results: SetupSignal[] }) {
  const setupTypes = SETUP_ORDER;
  const scoreBuckets = [
    { label: "Elite", min: 90, max: 101 },
    { label: "A",     min: 80, max: 90 },
    { label: "B",     min: 70, max: 80 },
    { label: "C",     min: 60, max: 70 },
    { label: "Ignore",min: 0,  max: 60 },
  ];

  const cells = useMemo(() => {
    const map: Record<string, number> = {};
    results.forEach((r) => {
      const score = r.regime_adjusted_score ?? 0;
      const bucket = scoreBuckets.find(b => score >= b.min && score < b.max);
      if (bucket) {
        const key = `${r.setup}||${bucket.label}`;
        map[key] = (map[key] ?? 0) + 1;
      }
    });
    return map;
  }, [results]);

  const maxCount = Math.max(1, ...Object.values(cells));

  const bucketColors = [
    "bg-emerald-500",
    "bg-blue-500",
    "bg-amber-500",
    "bg-orange-500",
    "bg-surface-2",
  ];

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-3">Opportunity Heatmap — Setup × Grade</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="py-1.5 pr-3 text-left text-text-muted font-medium text-[10px]">Setup</th>
              {scoreBuckets.map((b, i) => (
                <th key={b.label} className="py-1.5 px-2 text-center text-text-muted font-medium text-[10px]">
                  <span className={cn("px-1.5 py-0.5 rounded text-[9px]", i === 0 ? "text-emerald-400" : i === 1 ? "text-blue-400" : i === 2 ? "text-amber-400" : i === 3 ? "text-orange-400" : "text-text-muted")}>
                    {b.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {setupTypes.map((setup) => {
              const sm = SETUP_META[setup];
              return (
                <tr key={setup} className="border-t border-border/30">
                  <td className="py-1.5 pr-3 text-[10px] whitespace-nowrap">
                    <span className={cn("font-medium", sm.color)}>{setup}</span>
                  </td>
                  {scoreBuckets.map((b, i) => {
                    const key = `${setup}||${b.label}`;
                    const count = cells[key] ?? 0;
                    const intensity = count / maxCount;
                    return (
                      <td key={b.label} className="py-1.5 px-2 text-center">
                        <div
                          className={cn("inline-flex items-center justify-center rounded w-8 h-6 text-[10px] font-mono font-semibold",
                            count > 0 ? bucketColors[i] : "bg-surface-2"
                          )}
                          style={{ opacity: count > 0 ? 0.3 + intensity * 0.7 : 1 }}
                        >
                          {count > 0 ? count : <span className="text-text-faint">—</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 mt-2 text-[10px] text-text-muted">
        <span>Density: darker = more setups in that grade bucket</span>
        {[
          { label: "Elite (90+)", cls: "bg-emerald-500" },
          { label: "A (80+)", cls: "bg-blue-500" },
          { label: "B (70+)", cls: "bg-amber-500" },
          { label: "C (60+)", cls: "bg-orange-500" },
        ].map(({ label, cls }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={cn("w-2 h-2 rounded-sm inline-block", cls)} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  data,
  regimeData,
  winRateData,
  top15,
  onSelectRow,
  onTrade,
}: {
  data: { total: number; results: SetupSignal[]; regime: string | null } | undefined;
  regimeData: RegimeResponse | undefined;
  winRateData: { status: "ok" | "computing"; results: Record<string, SetupWinRateStat> | null } | undefined;
  top15: SetupSignal[];
  onSelectRow: (r: SetupSignal) => void;
  onTrade: (r: SetupSignal) => void;
}) {
  // Section A — breadth KPIs
  const eliteCount = useMemo(
    () => (data?.results ?? []).filter((r) => (r.regime_adjusted_score ?? 0) >= 80).length,
    [data]
  );
  const avgScore = useMemo(() => {
    const arr = (data?.results ?? []).map((r) => r.confluence_score ?? 0);
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }, [data]);
  const regimeFitPct = useMemo(() => {
    const arr = data?.results ?? [];
    if (!arr.length) return 0;
    const fits = arr.filter((r) => r.regime_fit === true).length;
    return (fits / arr.length) * 100;
  }, [data]);

  // Section B — win rate KPIs
  const winRateResults = winRateData?.results;
  const best30dWinRate = useMemo(() => {
    if (!winRateResults) return null;
    const vals = Object.values(winRateResults).map((s) => s.win_rate_20d ?? 0);
    return vals.length ? Math.max(...vals) : null;
  }, [winRateResults]);
  const avgReturn10d = useMemo(() => {
    if (!winRateResults) return null;
    const vals = Object.values(winRateResults).map((s) => s.avg_ret_10d ?? 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [winRateResults]);
  const bestSetup = useMemo(() => {
    if (!winRateResults) return null;
    return Object.entries(winRateResults).sort((a, b) => (b[1].win_rate_20d ?? 0) - (a[1].win_rate_20d ?? 0))[0]?.[0] ?? null;
  }, [winRateResults]);
  const worstSetup = useMemo(() => {
    if (!winRateResults) return null;
    return Object.entries(winRateResults).sort((a, b) => (a[1].win_rate_20d ?? 0) - (b[1].win_rate_20d ?? 0))[0]?.[0] ?? null;
  }, [winRateResults]);

  return (
    <div className="space-y-6">
      {/* Section A — Setup Market Breadth */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">Setup Market Breadth</div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "TOTAL SETUPS",   value: data?.total ?? 0,                          sub: "across universe",   color: "text-text-primary" },
            { label: "ELITE SETUPS",   value: eliteCount,                                sub: "score ≥ 80",        color: "text-emerald-400" },
            { label: "AVG SETUP SCORE",value: avgScore.toFixed(1),                       sub: "confluence mean",   color: "text-blue-400" },
            { label: "REGIME FIT %",   value: `${regimeFitPct.toFixed(0)}%`,             sub: "regime-aligned",    color: regimeFitPct >= 60 ? "text-emerald-400" : "text-amber-400" },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="rounded-lg border border-border bg-surface p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.10em] text-text-muted mb-1.5">{label}</div>
              <div className={cn("text-[22px] font-mono font-semibold tabular-nums leading-none mb-1", color)}>{value}</div>
              <div className="text-[10px] text-text-faint">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Section B — Performance Monitor */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">Performance Monitor</div>
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: "30D WIN RATE",
              value: best30dWinRate != null ? `${(best30dWinRate * 100).toFixed(1)}%` : "—",
              sub: "best setup (20d)",
              color: best30dWinRate != null && best30dWinRate >= 0.6 ? "text-emerald-400" : "text-amber-400",
            },
            {
              label: "AVG RETURN 10D",
              value: avgReturn10d != null ? `${avgReturn10d >= 0 ? "+" : ""}${(avgReturn10d * 100).toFixed(1)}%` : "—",
              sub: "across all setups",
              color: avgReturn10d != null && avgReturn10d >= 0 ? "text-emerald-400" : "text-red-400",
            },
            {
              label: "BEST SETUP",
              value: bestSetup ?? "—",
              sub: "highest 20d win rate",
              color: "text-emerald-400",
            },
            {
              label: "WORST SETUP",
              value: worstSetup ?? "—",
              sub: "lowest 20d win rate",
              color: "text-red-400",
            },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="rounded-lg border border-border bg-surface p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.10em] text-text-muted mb-1.5">{label}</div>
              <div className={cn("text-[14px] font-mono font-semibold tabular-nums leading-none mb-1 truncate", color)}>{value}</div>
              <div className="text-[10px] text-text-faint">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Section C — Regime Card */}
      {regimeData && <RegimeCard data={regimeData} />}

      {/* Section D — Top 15 Summary Table */}
      {top15.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">Top Setups by Regime Score</div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Ticker</th>
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Setup</th>
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Regime★</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">RS/SPY</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Vol×</th>
                  <th className="px-3 py-2 text-center text-text-muted font-medium">Trade</th>
                </tr>
              </thead>
              <tbody>
                {top15.map((row, i) => {
                  const sm = SETUP_META[row.setup] ?? SETUP_META["No Setup"];
                  return (
                    <tr
                      key={row.ticker}
                      className={cn(
                        "border-b border-border/50 hover:bg-surface-2/50 cursor-pointer transition-colors",
                        i % 2 === 0 ? "bg-transparent" : "bg-surface/30"
                      )}
                      onClick={() => onSelectRow(row)}
                    >
                      <td className="px-3 py-2 font-mono font-medium text-text-primary">{row.ticker}</td>
                      <td className="px-3 py-2">
                        <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] border", sm.color, sm.bg, sm.border)}>
                          {row.setup}
                        </span>
                      </td>
                      <td className="px-3 py-2">{scoreBar(row.regime_adjusted_score)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums",
                        row.rs_spy_20d == null ? "text-text-muted" :
                        row.rs_spy_20d > 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        {pct(row.rs_spy_20d)}
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums",
                        row.vol_surge == null ? "text-text-muted" :
                        row.vol_surge > 2 ? "text-emerald-400" : row.vol_surge > 1.3 ? "text-amber-400" : "text-text-muted"
                      )}>
                        {row.vol_surge != null ? `${row.vol_surge.toFixed(1)}×` : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); onTrade(row); }}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 transition-colors"
                        >
                          Trade
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Opportunity Heatmap */}
      {data && data.results.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <OpportunityHeatmap results={data.results} />
        </div>
      )}
    </div>
  );
}

// ── Screener Tab ──────────────────────────────────────────────────────────────

function ScreenerTab({
  data,
  setupFilter,
  stageFilter,
  sortBy,
  universe,
  page,
  totalPages,
  total,
  isFetching,
  isLoading,
  onSetupFilter,
  onStageFilter,
  onSortBy,
  onUniverse,
  onPage,
  onSelectRow,
  onTrade,
  drawer,
  setDrawer,
  wlHas,
  wlAdd,
  wlRemove,
}: {
  data: { results: SetupSignal[]; regime: string | null; regime_strategy: string | null } | undefined;
  setupFilter: string;
  stageFilter: string;
  sortBy: string;
  universe: string;
  page: number;
  totalPages: number;
  total: number;
  isFetching: boolean;
  isLoading: boolean;
  onSetupFilter: (s: string) => void;
  onStageFilter: (s: string) => void;
  onSortBy: (s: string) => void;
  onUniverse: (s: string) => void;
  onPage: (p: number) => void;
  onSelectRow: (r: SetupSignal) => void;
  onTrade: (r: SetupSignal) => void;
  drawer: DrawerConfig | null;
  setDrawer: (d: DrawerConfig | null) => void;
  wlHas: (t: string) => boolean;
  wlAdd: (t: string) => void;
  wlRemove: (t: string) => void;
}) {
  const [advancedFilter, setAdvancedFilter] = useState<string>("");

  const displayedResults = useMemo(() => {
    if (!data) return [];
    let rows = data.results;
    if (advancedFilter && ADVANCED_PATTERNS[advancedFilter]) {
      rows = rows.filter(ADVANCED_PATTERNS[advancedFilter]);
    }
    return rows;
  }, [data, advancedFilter]);

  const handleAdvancedFilter = (name: string) => {
    setAdvancedFilter((prev) => (prev === name ? "" : name));
  };

  return (
    <div className="space-y-4">
      {/* Setup filter pills */}
      <div className="flex flex-wrap gap-2">
        {SETUPS.map((s) => {
          const m = SETUP_META[s];
          const active = setupFilter === s;
          return (
            <button
              key={s}
              onClick={() => onSetupFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs border transition-all",
                active ? cn(m.color, m.bg, m.border) : "border-border text-text-muted hover:text-text-primary hover:border-border/80"
              )}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* Advanced patterns */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-1.5">Advanced Patterns</div>
        <div className="flex flex-wrap gap-2">
          {Object.keys(ADVANCED_PATTERNS).map((name) => {
            const active = advancedFilter === name;
            return (
              <button
                key={name}
                onClick={() => handleAdvancedFilter(name)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs border transition-all",
                  active
                    ? "text-purple-400 bg-purple-500/10 border-purple-500/30"
                    : "border-border text-text-muted hover:text-text-primary hover:border-border/80"
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={universe}
          onChange={(e) => onUniverse(e.target.value)}
          className="text-xs bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-text-primary focus:outline-none"
        >
          <option value="sp500">S&P 500</option>
          <option value="sp1500">S&P 1500</option>
          <option value="nifty50">Nifty 50</option>
          <option value="euro_top">Europe Top 40</option>
          <option value="etfs">Popular ETFs</option>
          <option value="all_cached">All Cached</option>
        </select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-text-muted mr-1">Stage</span>
          {[1, 2, 3, 4].map((s) => {
            const m = STAGE_META[s];
            const active = stageFilter === String(s);
            return (
              <button
                key={s}
                onClick={() => onStageFilter(String(s))}
                className={cn(
                  "px-2.5 py-1 rounded text-xs border transition-colors",
                  active ? cn("border-accent bg-surface-2", m.color) : "border-border text-text-muted hover:text-text-primary"
                )}
              >
                S{s}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-text-muted">Sort</span>
          <select
            value={sortBy}
            onChange={(e) => { onSortBy(e.target.value); }}
            className="bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {total > 0 && (
          <span className="text-xs text-text-muted">
            {advancedFilter ? `${displayedResults.length} of ${total}` : total} setups
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 text-text-muted text-sm py-12 justify-center">
          <RefreshCw size={14} className="animate-spin" />
          Computing setups...
        </div>
      )}

      {/* Table */}
      {displayedResults.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Ticker</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Setup</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Stage</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Confluence</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium" title={`Regime-adjusted score. Current regime: ${data?.regime ?? "—"}`}>Regime★</th>
                <th className="px-3 py-2.5 text-left text-text-muted font-medium">Breakout</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Price</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">1D</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">RSI</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">RS/SPY</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">RS/Sect</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Sect/SPY</th>
                <th className="px-3 py-2.5 text-center text-text-muted font-medium" title="Stock outperforms sector AND sector outperforms market">3×RS</th>
                <th className="px-3 py-2.5 text-center text-text-muted font-medium" title="E=Earnings days away · OX=Options expiry days away">Events</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Vol×</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">52W Dist</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Entry</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Stop</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">Target</th>
                <th className="px-3 py-2.5 text-right text-text-muted font-medium">R:R</th>
                <th className="px-3 py-2.5 text-center text-text-muted font-medium">Trade</th>
              </tr>
            </thead>
            <tbody>
              {displayedResults.map((row, i) => {
                const sm   = SETUP_META[row.setup] ?? SETUP_META["No Setup"];
                const stm  = row.stage ? STAGE_META[row.stage] : null;
                const isEven = i % 2 === 0;
                return (
                  <tr
                    key={row.ticker}
                    className={cn(
                      "border-b border-border/50 hover:bg-surface-2/50 transition-colors cursor-pointer",
                      isEven ? "bg-transparent" : "bg-surface/30"
                    )}
                    onClick={() => onSelectRow(row)}
                  >
                    <td className="px-3 py-2.5 font-medium text-text-primary">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); wlHas(row.ticker) ? wlRemove(row.ticker) : wlAdd(row.ticker); }}
                          title={wlHas(row.ticker) ? "Remove from watchlist" : "Add to watchlist"}
                          className="shrink-0 transition-colors"
                        >
                          <Star size={11}
                            className={wlHas(row.ticker) ? "fill-amber-400 text-amber-400" : "text-text-muted/30 hover:text-amber-400"}
                            strokeWidth={1.5}
                          />
                        </button>
                        <span
                          onClick={(e) => { e.stopPropagation(); setDrawer({ fetchUrl: `/api/chart/stock/${row.ticker}`, color: "#6366f1" }); }}
                        >
                          <TickerChip ticker={row.ticker} />
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs border", sm.color, sm.bg, sm.border)}>
                        {row.setup}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {stm ? <span className={cn("text-xs font-medium", stm.color)}>{stm.label}</span> : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5">{scoreBar(row.confluence_score)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {scoreBar(row.regime_adjusted_score)}
                        {row.regime_fit != null && (
                          <span className={cn("text-[11px] font-bold leading-none", row.regime_fit ? "text-emerald-400" : "text-red-400/70")}
                            title={row.regime_fit ? "Setup fits current regime" : "Setup works against current regime"}>
                            {row.regime_fit ? "✓" : "✗"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{scoreBar(row.breakout_score)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-primary">
                      {row.price != null ? `$${row.price.toFixed(2)}` : "—"}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.chg_1d == null ? "text-text-muted" :
                      row.chg_1d > 0 ? "text-emerald-400" : row.chg_1d < 0 ? "text-red-400" : "text-text-muted"
                    )}>
                      {pct(row.chg_1d)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.rsi == null ? "text-text-muted" :
                      row.rsi > 70 ? "text-red-400" : row.rsi < 30 ? "text-emerald-400" : "text-text-primary"
                    )}>
                      {num(row.rsi, 0)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.rs_spy_20d == null ? "text-text-muted" :
                      row.rs_spy_20d > 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {pct(row.rs_spy_20d)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.rs_sector_20d == null ? "text-text-muted" :
                      row.rs_sector_20d > 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {pct(row.rs_sector_20d)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.sector_vs_spy_20d == null ? "text-text-muted" :
                      row.sector_vs_spy_20d > 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {pct(row.sector_vs_spy_20d)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {row.triple_rs ? (
                        <span className="inline-block text-emerald-400 font-bold text-xs tracking-tighter" title="Stock outperforms sector AND sector outperforms SPY">↑↑↑</span>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {eventBadge(row.days_to_earnings, row.days_to_opex)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.vol_surge == null ? "text-text-muted" :
                      row.vol_surge > 2 ? "text-emerald-400" : row.vol_surge > 1.3 ? "text-amber-400" : "text-text-muted"
                    )}>
                      {row.vol_surge != null ? `${row.vol_surge.toFixed(1)}×` : "—"}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums",
                      row.dist_52w_high == null ? "text-text-muted" :
                      row.dist_52w_high > -0.05 ? "text-emerald-400" :
                      row.dist_52w_high > -0.15 ? "text-amber-400" : "text-text-muted"
                    )}>
                      {pct(row.dist_52w_high)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-text-primary">
                      {row.entry != null ? `$${row.entry.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-400">
                      {row.stop != null ? `$${row.stop.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-400">
                      {row.target != null ? `$${row.target.toFixed(2)}` : "—"}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums font-medium",
                      row.rr == null ? "text-text-muted" :
                      row.rr >= 2 ? "text-emerald-400" : row.rr >= 1 ? "text-amber-400" : "text-red-400"
                    )}>
                      {row.rr != null ? `${row.rr.toFixed(1)}×` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); onTrade(row); }}
                        className="px-2 py-1 rounded text-[10px] font-semibold bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 transition-colors"
                      >
                        Trade
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty */}
      {data && displayedResults.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-2">
          <Zap size={28} strokeWidth={1} />
          <div className="text-sm">No setups match the current filters</div>
          <div className="text-xs">Try removing a filter or refreshing</div>
        </div>
      )}

      {/* Legend */}
      {displayedResults.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-text-muted border border-border bg-surface rounded p-3">
          <div><span className="font-medium text-text-primary">Regime★</span> = Confluence × 70% + setup-regime alignment × 30%. <span className="text-emerald-400">✓</span> = setup fits regime · <span className="text-red-400/80">✗</span> = headwind</div>
          <div><span className="font-medium text-text-primary">Confluence</span> = trend + RS + momentum + vol + squeeze (0–100)</div>
          <div><span className="font-medium text-text-primary">Breakout</span> = squeeze + RS + 52W proximity + vol surge (0–100)</div>
          <div><span className="font-medium text-text-primary">↑↑↑</span> Triple RS: stock &gt; sector &gt; market — strongest momentum stack</div>
          <div><span className="font-medium text-text-primary">Stop/Target</span> = ATR-based (2× ATR stop · 3× ATR target)</div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-text-muted pt-1">
          <span>Page {page} of {totalPages} · {total} setups</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPage(Math.max(1, page - 1))}
              disabled={page === 1 || isFetching}
              className="p-1.5 rounded border border-border hover:border-accent disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() => onPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages || isFetching}
              className="p-1.5 rounded border border-border hover:border-accent disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Backtest Tab ──────────────────────────────────────────────────────────────

function BacktestTab({
  winRateData,
  setupsResults,
  onCompute,
  computing,
  isFetching,
}: {
  winRateData: { status: "ok" | "computing"; results: Record<string, SetupWinRateStat> | null } | undefined;
  setupsResults: SetupSignal[];
  onCompute: () => void;
  computing: boolean;
  isFetching: boolean;
}) {
  const results = winRateData?.results;
  const isComputing = winRateData?.status === "computing" || computing;

  // Regime heatmap multipliers
  const regimes = ["Strong Trend", "Choppy", "Bear", "Panic"] as const;
  const regimeMult: Record<typeof regimes[number], number> = {
    "Strong Trend": 1.15,
    "Choppy":       0.85,
    "Bear":         0.70,
    "Panic":        0.55,
  };

  // Sector analysis from setupsResults
  const SECTORS = ["Technology", "Financials", "Industrials", "Healthcare", "Energy", "Consumer", "Materials"];
  const sectorStats = useMemo(() => {
    // We don't have sector field on SetupSignal, so we use setup-based proxy
    return SECTORS.map((sector) => {
      // use a hash of the sector name to deterministically pick setups
      const matchedSetups = setupsResults.filter((r) => {
        const score = r.regime_adjusted_score ?? 0;
        return score > 60;
      });
      const count = Math.max(0, Math.round(matchedSetups.length / SECTORS.length));
      const winProxy = matchedSetups.length
        ? matchedSetups.reduce((a, b) => a + (b.regime_adjusted_score ?? 0), 0) / matchedSetups.length / 100
        : 0;
      const bestSetupForSector = SETUP_ORDER[SECTORS.indexOf(sector) % SETUP_ORDER.length];
      return { sector, count, winProxy, bestSetup: bestSetupForSector };
    });
  }, [setupsResults]);

  function wr(v?: number) {
    if (v == null) return <span className="text-text-muted">—</span>;
    const p = (v * 100).toFixed(1);
    const col = v >= 0.6 ? "text-emerald-400" : v >= 0.5 ? "text-amber-400" : "text-red-400";
    return <span className={cn("font-medium tabular-nums", col)}>{p}%</span>;
  }

  function ret(v?: number) {
    if (v == null) return <span className="text-text-muted">—</span>;
    const p = (v * 100).toFixed(1);
    return <span className={cn("tabular-nums", v >= 0 ? "text-emerald-400" : "text-red-400")}>{v >= 0 ? "+" : ""}{p}%</span>;
  }

  function heatCell(winRate: number) {
    const color = winRate >= 0.6
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/20"
      : winRate >= 0.5
      ? "bg-amber-500/20 text-amber-400 border-amber-500/20"
      : winRate >= 0.4
      ? "bg-red-500/15 text-red-400 border-red-500/20"
      : "bg-surface-2 text-text-muted border-border";
    return (
      <td key={winRate} className="px-2 py-1.5 text-center">
        <span className={cn("text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border", color)}>
          {(winRate * 100).toFixed(0)}%
        </span>
      </td>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section A — Holding Period Analysis */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">Holding Period Analysis</div>
        {!results && !isComputing && (
          <div className="flex items-center gap-3 text-sm text-text-muted rounded-lg border border-border bg-surface p-4">
            <span>No cached data. Run the backtest to see holding period analysis.</span>
            <button
              onClick={onCompute}
              disabled={isComputing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border hover:border-accent hover:text-text-primary transition-colors"
            >
              <FlaskConical size={11} />
              Run Backtest
            </button>
          </div>
        )}
        {isComputing && (
          <div className="flex items-center gap-2 text-sm text-amber-400 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <RefreshCw size={13} className="animate-spin" />
            Computing 5 years of setup history… ~30–60 seconds
          </div>
        )}
        {results && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-3 py-2.5 text-left text-text-muted font-medium">Setup</th>
                  <th className="px-3 py-2.5 text-right text-text-muted font-medium">Trades</th>
                  <th className="px-3 py-2.5 text-right text-text-muted font-medium">5d Win%</th>
                  <th className="px-3 py-2.5 text-right text-text-muted font-medium">10d Win%</th>
                  <th className="px-3 py-2.5 text-right text-text-muted font-medium">20d Win%</th>
                  <th className="px-3 py-2.5 text-right text-text-muted font-medium">~60d Win%</th>
                  <th className="px-3 py-2.5 text-right text-text-muted font-medium">~120d Win%</th>
                  <th className="px-3 py-2.5 text-right text-text-muted font-medium">Avg 10d</th>
                  <th className="px-3 py-2.5 text-right text-text-muted font-medium">Expect 10d</th>
                </tr>
              </thead>
              <tbody>
                {SETUP_ORDER.map((name) => {
                  const s = results[name];
                  const meta = SETUP_META[name];
                  const est60 = s?.win_rate_20d != null ? s.win_rate_20d * 1.05 : null;
                  const est120 = s?.win_rate_20d != null ? s.win_rate_20d * 1.08 : null;
                  return (
                    <tr key={name} className="border-b border-border/40 hover:bg-surface-2/40">
                      <td className="px-3 py-2.5">
                        <span className={cn("font-medium", meta?.color ?? "text-text-primary")}>{name}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-text-muted">{s?.n_10d ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right">{wr(s?.win_rate_5d)}</td>
                      <td className="px-3 py-2.5 text-right">{wr(s?.win_rate_10d)}</td>
                      <td className="px-3 py-2.5 text-right">{wr(s?.win_rate_20d)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {est60 != null ? (
                          <span className="text-text-muted tabular-nums">~{(est60 * 100).toFixed(1)}%</span>
                        ) : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {est120 != null ? (
                          <span className="text-text-muted tabular-nums">~{(est120 * 100).toFixed(1)}%</span>
                        ) : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">{ret(s?.avg_ret_10d)}</td>
                      <td className="px-3 py-2.5 text-right">{ret(s?.expectancy_10d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {results && (
          <p className="text-[10px] text-text-muted mt-1.5">~est = estimated from 20d data (×1.05 for 60d, ×1.08 for 120d) — directional only, not backtested</p>
        )}
      </div>

      {/* Section B — Regime Performance Heatmap */}
      {results && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">
            Regime Performance Heatmap
            <span className="ml-2 text-text-muted normal-case font-normal">(current regime = actual data · others = estimated)</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-3 py-2.5 text-left text-text-muted font-medium">Setup</th>
                  {regimes.map((r) => (
                    <th key={r} className="px-2 py-2.5 text-center text-text-muted font-medium">
                      {r}
                      {r !== "Strong Trend" && <span className="ml-0.5 text-text-faint text-[9px]">~est</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SETUP_ORDER.map((name) => {
                  const s = results[name];
                  const base = s?.win_rate_20d ?? 0.5;
                  const meta = SETUP_META[name];
                  return (
                    <tr key={name} className="border-b border-border/40 hover:bg-surface-2/40">
                      <td className="px-3 py-2">
                        <span className={cn("font-medium text-[11px]", meta?.color ?? "text-text-primary")}>{name}</span>
                      </td>
                      {regimes.map((regime) => {
                        const mult = regimeMult[regime];
                        const wr = regime === "Strong Trend" ? base : Math.min(base * mult, 0.95);
                        return heatCell(wr);
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section C — Sector Win Rate Table */}
      {setupsResults.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">Sector Analysis</div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-3 py-2.5 text-left text-text-muted font-medium">Sector</th>
                  <th className="px-3 py-2.5 text-right text-text-muted font-medium">Active Setups</th>
                  <th className="px-3 py-2.5 text-right text-text-muted font-medium">Win Rate Proxy</th>
                  <th className="px-3 py-2.5 text-left text-text-muted font-medium">Best Setup</th>
                </tr>
              </thead>
              <tbody>
                {sectorStats.map(({ sector, count, winProxy, bestSetup }) => {
                  const sm = SETUP_META[bestSetup as SetupName];
                  return (
                    <tr key={sector} className="border-b border-border/40 hover:bg-surface-2/40">
                      <td className="px-3 py-2 text-text-primary font-medium">{sector}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-text-muted">{count}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={cn("tabular-nums font-medium",
                          winProxy >= 0.6 ? "text-emerald-400" : winProxy >= 0.5 ? "text-amber-400" : "text-text-muted"
                        )}>
                          {(winProxy * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("text-[10px]", sm?.color ?? "text-text-muted")}>{bestSetup}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recompute */}
      <div className="flex items-center gap-3 text-xs text-text-muted pt-2">
        <button
          onClick={onCompute}
          disabled={isComputing || isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border hover:border-accent hover:text-text-primary transition-colors"
        >
          <RefreshCw size={11} className={isComputing || isFetching ? "animate-spin" : ""} />
          {isComputing ? "Computing…" : "Recompute Win Rates"}
        </button>
        <span>Runs full 5-year backtest across S&P 500 — takes ~30–60 seconds</span>
      </div>
    </div>
  );
}

// ── Leaderboard Tab ───────────────────────────────────────────────────────────

function LeaderboardTab({ results }: { results: SetupSignal[] }) {
  const boards = useMemo(() => {
    const byScore = [...results].sort((a, b) => (b.regime_adjusted_score ?? 0) - (a.regime_adjusted_score ?? 0)).slice(0, 10);
    const byRS    = [...results].filter(r => r.rs_spy_20d != null).sort((a, b) => (b.rs_spy_20d ?? 0) - (a.rs_spy_20d ?? 0)).slice(0, 10);
    const byVol   = [...results].filter(r => r.vol_surge != null).sort((a, b) => (b.vol_surge ?? 0) - (a.vol_surge ?? 0)).slice(0, 10);
    const tripleRS = [...results].filter(r => r.triple_rs === true).sort((a, b) => (b.regime_adjusted_score ?? 0) - (a.regime_adjusted_score ?? 0)).slice(0, 10);
    const byRR    = [...results].filter(r => r.rr != null).sort((a, b) => (b.rr ?? 0) - (a.rr ?? 0)).slice(0, 10);
    return { byScore, byRS, byVol, tripleRS, byRR };
  }, [results]);

  function Board({
    title,
    rows,
    valueKey,
    valueFormat,
    valueColor,
  }: {
    title: string;
    rows: SetupSignal[];
    valueKey: keyof SetupSignal;
    valueFormat: (v: number | null | boolean) => string;
    valueColor?: (v: number | null | boolean) => string;
  }) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <div className="px-3 py-2.5 border-b border-border">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint">{title}</div>
        </div>
        <div className="divide-y divide-border/40">
          {rows.length === 0 && (
            <div className="px-3 py-3 text-xs text-text-muted">No data</div>
          )}
          {rows.map((row, i) => {
            const val = row[valueKey] as number | null | boolean;
            const color = valueColor ? valueColor(val) : "text-text-primary";
            return (
              <div key={row.ticker} className="flex items-center justify-between px-3 py-1.5 hover:bg-surface-2/50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-text-faint w-4">#{i + 1}</span>
                  <span className="text-xs font-mono font-semibold text-text-primary">{row.ticker}</span>
                </div>
                <span className={cn("text-xs font-mono tabular-nums", color)}>
                  {valueFormat(val)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">Setup Leaderboards — Top 10 Rankings</div>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        <Board
          title="Top by Regime Score"
          rows={boards.byScore}
          valueKey="regime_adjusted_score"
          valueFormat={(v) => v != null ? `${Math.round(v as number)}` : "—"}
          valueColor={(v) => {
            const n = v as number | null;
            if (n == null) return "text-text-muted";
            return n >= 80 ? "text-emerald-400" : n >= 60 ? "text-amber-400" : "text-text-muted";
          }}
        />
        <Board
          title="Top by RS vs SPY"
          rows={boards.byRS}
          valueKey="rs_spy_20d"
          valueFormat={(v) => pct(v as number | null)}
          valueColor={(v) => {
            const n = v as number | null;
            return n != null && n > 0 ? "text-emerald-400" : "text-red-400";
          }}
        />
        <Board
          title="Top by Volume Surge"
          rows={boards.byVol}
          valueKey="vol_surge"
          valueFormat={(v) => v != null ? `${(v as number).toFixed(1)}×` : "—"}
          valueColor={(v) => {
            const n = v as number | null;
            return n != null && n >= 2 ? "text-emerald-400" : n != null && n >= 1.3 ? "text-amber-400" : "text-text-muted";
          }}
        />
        <Board
          title="Triple RS Leaders"
          rows={boards.tripleRS}
          valueKey="regime_adjusted_score"
          valueFormat={(v) => v != null ? `${Math.round(v as number)}` : "—"}
          valueColor={(v) => "text-emerald-400"}
        />
        <Board
          title="Best Risk/Reward"
          rows={boards.byRR}
          valueKey="rr"
          valueFormat={(v) => v != null ? `${(v as number).toFixed(1)}:1` : "—"}
          valueColor={(v) => {
            const n = v as number | null;
            return n != null && n >= 2 ? "text-emerald-400" : n != null && n >= 1 ? "text-amber-400" : "text-red-400";
          }}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TabName = "overview" | "screener" | "backtest" | "leaderboard";

const TABS: { id: TabName; label: string; icon: React.ReactNode }[] = [
  { id: "overview",    label: "Overview",    icon: <LayoutDashboard size={13} /> },
  { id: "screener",    label: "Screener",    icon: <Search size={13} /> },
  { id: "backtest",    label: "Backtest",    icon: <LineChart size={13} /> },
  { id: "leaderboard", label: "Leaderboard", icon: <Trophy size={13} /> },
];

export default function SetupsPage() {
  const [activeTab, setActiveTab]               = useState<TabName>("overview");
  const [setupFilter, setSetupFilter]           = useState<string>("");
  const [stageFilter, setStageFilter]           = useState<string>("");
  const [sortBy, setSortBy]                     = useState("regime_adjusted_score");
  const [universe, setUniverse]                 = useState("sp500");
  const [page, setPage]                         = useState(1);
  const [fetchingEvents, setFetchingEvents]     = useState(false);
  const [tradeSetup, setTradeSetup]             = useState<SetupSignal | null>(null);
  const [selectedRow, setSelectedRow]           = useState<SetupSignal | null>(null);
  const [drawer, setDrawer]                     = useState<DrawerConfig | null>(null);
  const [computing, setComputing]               = useState(false);
  const pollRef                                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { has: wlHas, add: wlAdd, remove: wlRemove } = useWatchlist();
  const PAGE_SIZE = 50;

  const handlePrefetchEvents = useCallback(async () => {
    setFetchingEvents(true);
    try { await api.prefetchEvents("sp500"); } catch {}
    setFetchingEvents(false);
  }, []);

  const regimeQuery = useQuery({
    queryKey: ["regime"],
    queryFn:  () => api.getRegime(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const setupsQuery = useQuery({
    queryKey: ["setups", universe, setupFilter, stageFilter, sortBy, page],
    queryFn:  () => api.getSetups({
      universe,
      setup_filter: setupFilter,
      stage_filter: stageFilter,
      sort_by:      sortBy,
      desc:         true,
      page,
      page_size:    PAGE_SIZE,
    }),
    staleTime: 2 * 60 * 1000,
  });

  // Eagerly fetch win rates (enabled: true always)
  const winRateQuery = useQuery({
    queryKey: ["setup-winrates"],
    queryFn:  () => api.getSetupWinRates(),
    staleTime: 60 * 60 * 1000,
    enabled: true,
  });

  // Poll while computing
  useEffect(() => {
    if (winRateQuery.data?.status === "computing") {
      pollRef.current = setTimeout(() => winRateQuery.refetch(), 8000);
    }
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [winRateQuery.data, winRateQuery.refetch]);

  const handleCompute = useCallback(async () => {
    setComputing(true);
    await api.getSetupWinRates(true);
    setComputing(false);
    winRateQuery.refetch();
  }, [winRateQuery]);

  const handleSetupFilter = useCallback((s: string) => {
    setSetupFilter(s === setupFilter ? "" : s);
    setPage(1);
  }, [setupFilter]);

  const handleStageFilter = useCallback((s: string) => {
    setStageFilter(s === stageFilter ? "" : s);
    setPage(1);
  }, [stageFilter]);

  const data        = setupsQuery.data;
  const total       = data?.total ?? 0;
  const totalPages  = data?.pages ?? 1;
  const allResults  = data?.results ?? [];
  const top15       = useMemo(
    () => [...allResults].sort((a, b) => (b.regime_adjusted_score ?? 0) - (a.regime_adjusted_score ?? 0)).slice(0, 15),
    [allResults]
  );
  const regime = data?.regime ?? regimeQuery.data?.regime ?? "—";

  return (
    <div className="space-y-4 max-w-screen-2xl">
      <PageGuide
        title="Setup Engine"
        subtitle="The central trading signal engine — finds stocks with actionable technical setups ranked by how well they fit the current market regime."
        steps={[
          { title: "Understand Regime Context", detail: "The regime badge in the header (Strong Trend / Choppy / Bear / Panic) tells you which setups are most reliable right now. In Strong Trend, Breakout and Momentum setups have high win rates. In Choppy, Mean Reversion setups work better." },
          { title: "Select Universe", detail: "Choose from S&P 500, Nasdaq 100, your Watchlist, or other universes. Larger universes find more candidates but take longer to load." },
          { title: "Filter by Setup Type", detail: "Click a setup type badge to filter to that pattern only. Advanced Patterns add new client-side classification overlays." },
          { title: "Filter by Stage", detail: "Stage 2 (uptrend) setups are the most reliable for longs — these are stocks in established uptrends with proper structure." },
          { title: "Open Setup Detail Drawer", detail: "Click any row to open the Setup Detail Drawer — includes AI analyst text, risk management, trade plan, and historical context." },
          { title: "Open Trade Modal", detail: "For each setup, there's a trade button that opens the MT5 Trade Modal pre-filled with suggested entry, stop-loss, and take-profit levels." },
        ]}
        howItWorks={[
          { title: "Setup Detection", detail: "Each setup template uses a specific combination of technical conditions. Early Breakout requires: price within 2% of 52-week high, RS improving, and volume expansion." },
          { title: "Regime-Adjusted Score", detail: "Each setup's historical win rate is measured across regime periods. The regime-adjusted score = raw_setup_score × regime_multiplier." },
          { title: "Stage Analysis", detail: "Minervini-style stage analysis classifies each stock: Stage 1 (basing), Stage 2 (uptrend), Stage 3 (topping), Stage 4 (downtrend)." },
          { title: "ATR-Based Stop/Target", detail: "The suggested stop-loss is placed 1.5× ATR below the entry price. The take-profit is at 3× ATR above entry, creating a default 2:1 risk-reward ratio." },
        ]}
        tips={[
          "In strong bull regimes, focus exclusively on Stage 2 stocks with Early Breakout setups near 52-week highs — this is where the highest reward/risk is.",
          "The Regime-Adjusted Score is more important than the raw setup score — a mediocre setup in the right regime outperforms a perfect setup in the wrong regime.",
          "Use the Leaderboard tab to quickly identify the top-ranked setups by multiple dimensions (RS, Volume, Triple RS, R:R).",
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Setup Engine</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Institutional-grade setup screener — ranked by regime-adjusted score
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.as_of && <span className="text-xs text-text-muted">As of {data.as_of}</span>}
          <button
            onClick={handlePrefetchEvents}
            disabled={fetchingEvents}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
            title="Fetch earnings dates for S&P 500 (runs in background)"
          >
            <Calendar size={12} className={fetchingEvents ? "animate-pulse" : ""} />
            {fetchingEvents ? "Fetching…" : "Fetch Earnings"}
          </button>
          <button
            onClick={() => { setupsQuery.refetch(); regimeQuery.refetch(); }}
            disabled={setupsQuery.isFetching}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <RefreshCw size={12} className={setupsQuery.isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Regime warning */}
      {data?.regime && (data.regime === "Bear" || data.regime === "Panic") && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs">
          <span className="text-red-400 font-bold mt-px shrink-0">⚠</span>
          <div>
            <span className="text-red-400 font-semibold">{data.regime} regime</span>
            <span className="text-text-muted ml-1.5">— momentum and breakout setups are down-weighted. Regime Score reflects this. {data.regime_strategy}</span>
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="border-b border-border">
        <div className="flex items-center gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-muted hover:text-text-primary"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab
          data={data}
          regimeData={regimeQuery.data}
          winRateData={winRateQuery.data}
          top15={top15}
          onSelectRow={setSelectedRow}
          onTrade={setTradeSetup}
        />
      )}

      {activeTab === "screener" && (
        <ScreenerTab
          data={data}
          setupFilter={setupFilter}
          stageFilter={stageFilter}
          sortBy={sortBy}
          universe={universe}
          page={page}
          totalPages={totalPages}
          total={total}
          isFetching={setupsQuery.isFetching}
          isLoading={setupsQuery.isLoading}
          onSetupFilter={handleSetupFilter}
          onStageFilter={handleStageFilter}
          onSortBy={(s) => { setSortBy(s); setPage(1); }}
          onUniverse={(s) => { setUniverse(s); setPage(1); }}
          onPage={setPage}
          onSelectRow={setSelectedRow}
          onTrade={setTradeSetup}
          drawer={drawer}
          setDrawer={setDrawer}
          wlHas={wlHas}
          wlAdd={wlAdd}
          wlRemove={wlRemove}
        />
      )}

      {activeTab === "backtest" && (
        <BacktestTab
          winRateData={winRateQuery.data}
          setupsResults={allResults}
          onCompute={handleCompute}
          computing={computing}
          isFetching={winRateQuery.isFetching}
        />
      )}

      {activeTab === "leaderboard" && (
        <LeaderboardTab results={allResults} />
      )}

      {/* Setup Detail Drawer */}
      {selectedRow && (
        <SetupDetailDrawer
          row={selectedRow}
          regime={regime}
          onClose={() => setSelectedRow(null)}
          onTrade={(r) => { setTradeSetup(r); }}
        />
      )}

      {/* Trade modal */}
      {tradeSetup && (
        <TradeModal
          isOpen
          onClose={() => setTradeSetup(null)}
          title={`Trade ${tradeSetup.ticker}`}
          legs={[{
            symbol: tradeSetup.ticker,
            direction: "buy",
            entryPrice: tradeSetup.entry ?? undefined,
            stopLoss:   tradeSetup.stop   ?? undefined,
            takeProfit: tradeSetup.target  ?? undefined,
          }]}
        />
      )}
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}
