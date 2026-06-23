"use client";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type StockDetailResponse } from "@/lib/api";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import { CandlestickChart } from "@/components/charts/CandlestickChart";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Star, CalendarDays, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useWatchlist } from "@/hooks/useWatchlist";
import { PageGuide } from "@/components/PageGuide";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null, dec = 2): string {
  return v == null ? "—" : v.toFixed(dec);
}
function pct(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}
function price$(v: number | null): string {
  return v == null ? "—" : `$${v.toFixed(2)}`;
}

const SETUP_COLOR: Record<string, string> = {
  "Early Breakout":             "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  "Volatility Squeeze":         "text-amber-400   border-amber-500/40   bg-amber-500/10",
  "Momentum Continuation":      "text-blue-400    border-blue-500/40    bg-blue-500/10",
  "Institutional Accumulation": "text-purple-400  border-purple-500/40  bg-purple-500/10",
  "Mean Reversion Bounce":      "text-teal-400    border-teal-500/40    bg-teal-500/10",
  "Failed Breakdown Reversal":  "text-orange-400  border-orange-500/40  bg-orange-500/10",
  "No Setup":                   "text-text-muted  border-border         bg-surface",
};

const STAGE_LABEL: Record<number, { text: string; color: string }> = {
  1: { text: "S1 Base",      color: "text-text-muted"   },
  2: { text: "S2 Uptrend",   color: "text-emerald-400"  },
  3: { text: "S3 Topping",   color: "text-amber-400"    },
  4: { text: "S4 Downtrend", color: "text-red-400"      },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={cn("text-xs font-mono font-medium", color ?? "text-text-primary")}>{value}</span>
    </div>
  );
}

function RSBar({ label, value }: { label: string; value: number | null }) {
  const color = value == null ? "#6b6b80" : value >= 0.02 ? "#22c55e" : value >= -0.02 ? "#eab308" : "#ef4444";
  const Icon  = value == null ? Minus : value >= 0.02 ? TrendingUp : value <= -0.02 ? TrendingDown : Minus;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="flex items-center gap-1 text-xs font-mono font-medium" style={{ color }}>
        <Icon size={11} strokeWidth={2} />
        {pct(value)}
      </span>
    </div>
  );
}

function ScoreGauge({ label, value, max = 100 }: { label: string; value: number | null; max?: number }) {
  const pct = value != null ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color = pct >= 65 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className="font-mono font-semibold" style={{ color }}>{value?.toFixed(1) ?? "—"}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Trade level row ───────────────────────────────────────────────────────────

function TradeLevels({ data }: { data: StockDetailResponse }) {
  const { trade } = data;
  const hasLevels = trade.entry && trade.stop && trade.target;
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div className="text-xs font-medium text-text-primary">Trade Levels</div>
      <div className="text-xs text-text-muted mb-2">ATR-based: 2× risk, 3× reward</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <MetricRow label="Entry"  value={price$(trade.entry)} />
        <MetricRow label="Stop"   value={price$(trade.stop)}   color="text-red-400" />
        <MetricRow label="Target" value={price$(trade.target)} color="text-emerald-400" />
        <MetricRow label="R:R"    value={trade.rr != null ? `1 : ${trade.rr.toFixed(2)}` : "—"}
          color={trade.rr && trade.rr >= 2 ? "text-emerald-400" : "text-text-muted"} />
        <MetricRow label="ATR $"  value={trade.atr_dollar != null ? `$${trade.atr_dollar.toFixed(2)}` : "—"} />
      </div>
      {!hasLevels && (
        <div className="text-xs text-text-muted italic">Insufficient price history for ATR</div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const { has: wlHas, add: wlAdd, remove: wlRemove, mounted } = useWatchlist();

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey:  ["stock-detail", ticker],
    queryFn:   () => api.getStockDetail(ticker),
    staleTime: 3 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted text-sm gap-2">
        <RefreshCw size={14} className="animate-spin" />
        Loading {ticker.toUpperCase()}…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="text-negative text-sm">No data found for {ticker.toUpperCase()}</div>
        <Link href="/setups" className="text-xs text-accent hover:underline">← Back to Setups</Link>
      </div>
    );
  }

  const sig        = data.signals;
  const setupClass = SETUP_COLOR[sig.setup] ?? SETUP_COLOR["No Setup"];
  const stageMeta  = sig.stage != null ? STAGE_LABEL[Math.round(sig.stage)] : null;
  const chgColor   = sig.chg_1d == null ? "" : sig.chg_1d >= 0 ? "text-positive" : "text-negative";
  const isWatched  = mounted && wlHas(data.ticker);

  return (
    <div className="space-y-5 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/setups" className="text-text-muted hover:text-text-primary transition-colors">
              <ChevronLeft size={16} />
            </Link>
            <span className="text-xl font-bold font-mono">{data.ticker}</span>
            {mounted && (
              <button
                onClick={() => isWatched ? wlRemove(data.ticker) : wlAdd(data.ticker)}
                title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                className="transition-colors"
              >
                <Star
                  size={15}
                  className={isWatched ? "fill-amber-400 text-amber-400" : "text-text-muted/40 hover:text-amber-400"}
                  strokeWidth={1.5}
                />
              </button>
            )}
            {sig.triple_rs && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium text-accent bg-accent/10 border border-accent/30">
                3× RS
              </span>
            )}
          </div>
          <div className="text-sm text-text-muted">
            {data.name !== data.ticker && <span>{data.name} · </span>}
            {data.sector && <span>{data.sector} · </span>}
            <span>as of {data.as_of ?? "—"}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold font-mono">{price$(data.price)}</div>
            <div className={cn("text-sm font-mono", chgColor)}>{pct(sig.chg_1d)}</div>
          </div>
          {/* Setup badge */}
          <span className={cn("px-2.5 py-1 rounded border text-xs font-medium", setupClass)}>
            {sig.setup}
          </span>
          {/* Stage badge */}
          {stageMeta && (
            <span className={cn("text-xs font-medium", stageMeta.color)}>{stageMeta.text}</span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded bg-surface-2 border border-border text-text-muted hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <PageGuide
        title="Stock Detail"
        subtitle="A deep-dive view of an individual stock: technical setup, price chart, factor scores, risk metrics, and AI-generated analysis."
        steps={[
          { title: "Read the Setup Badge", detail: "The colored badge (Early Breakout, Volatility Squeeze, etc.) next to the ticker shows the current technical setup. The Stage label (S1 Base, S2 Uptrend, S3 Topping, S4 Downtrend) indicates the Minervini stage." },
          { title: "View the Price Chart", detail: "The TradingView interactive chart is embedded above. Use the toolbar to switch between candlestick/bar/line views, change timeframes, or add technical indicators. The fallback OHLCV chart shows 1-year daily data with volume." },
          { title: "Review Technical Metrics", detail: "Scroll down to see the technical scorecard: RS vs SPY, ATR%, distance to 52-week high, volume ratio, and all moving average relationships. These power the setup detection." },
          { title: "Check Earnings Context", detail: "If earnings are within 21 days, a badge appears at the top. Red badge = earnings within 2 days (high risk/reward). Always check earnings dates before entering positions." },
          { title: "Add to Watchlist", detail: "Click the star icon next to the ticker to add this stock to your Watchlist. It will then appear with live setup context in the Watchlist page." },
          { title: "Navigate Back", detail: "Use the back arrow (←) to return to the Setup Engine page that referred you here. The browser back button also works." },
        ]}
        howItWorks={[
          { title: "Data Pipeline", detail: "Stock detail data is fetched from the backend which calls yfinance for OHLCV history, then computes all technical indicators (MAs, ATR, Bollinger Bands, RSI, MACD, volume ratios) in real time." },
          { title: "Setup Detection", detail: "The same setup detection engine as the Setup Engine page is applied to this single stock. The 6 setup templates are evaluated and the most applicable is shown. 'No Setup' means no pattern currently qualifies." },
          { title: "Relative Strength", detail: "RS vs SPY measures the stock's 20-day and 63-day price performance relative to the SPY ETF. Positive RS means the stock is outperforming the market. RS rank positions this stock within its universe." },
          { title: "TradingView Widget", detail: "The TradingView chart is a full-featured professional charting widget. It connects to real-time data from TradingView's servers. If the widget fails to load (e.g. no internet), the local OHLCV candlestick chart is shown as a fallback." },
        ]}
        tips={[
          "Stocks with Setup = 'Early Breakout' AND RS > 80% AND Stage 2 uptrend represent the highest-probability long setups — these align technical, momentum, and trend all at once.",
          "Never enter a position within 3 days of earnings unless you're specifically trading the earnings event — the setup doesn't predict what earnings will do.",
          "Use the TradingView chart to draw your own support/resistance levels and check if the machine-detected setup aligns with your manual analysis.",
        ]}
      />

      {/* Earnings badge */}
      {data.days_to_earnings != null && data.days_to_earnings <= 21 && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded border text-xs w-fit",
          data.days_to_earnings <= 2
            ? "text-red-400 border-red-500/40 bg-red-500/10"
            : "text-amber-400 border-amber-500/40 bg-amber-500/10"
        )}>
          <CalendarDays size={12} />
          Earnings in {data.days_to_earnings} day{data.days_to_earnings === 1 ? "" : "s"}
          {data.earnings_date && <span className="text-text-muted">({data.earnings_date})</span>}
        </div>
      )}

      {/* Chart — TradingView widget primary, local OHLCV fallback */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-text-muted">Price Chart</span>
          <span className="text-[10px] text-text-muted/60">Powered by TradingView</span>
        </div>
        <TradingViewWidget symbol={ticker} height={400} />
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Scores */}
        <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
          <div className="text-xs font-medium text-text-primary">Scores</div>
          <ScoreGauge label="Confluence"     value={sig.confluence_score} />
          <ScoreGauge label="Regime Score"   value={sig.regime_adjusted_score} />
          <ScoreGauge label="Breakout Score" value={sig.breakout_score} />
          <ScoreGauge label="Accum. Score"   value={sig.accum_score} max={10} />
          <div className="pt-1 border-t border-border">
            <MetricRow
              label="Regime"
              value={data.regime}
              color={data.regime === "Strong Trend" ? "text-emerald-400" : data.regime === "Bear" ? "text-red-400" : "text-amber-400"}
            />
            <MetricRow label="Regime Alignment" value={`${sig.regime_alignment ?? "—"}/100`} />
          </div>
        </div>

        {/* Technical signals */}
        <div className="rounded-lg border border-border bg-surface p-4 space-y-1">
          <div className="text-xs font-medium text-text-primary mb-3">Technical Signals</div>
          <MetricRow label="RSI (14)"       value={fmt(sig.rsi, 1)}
            color={sig.rsi == null ? "" : sig.rsi < 35 ? "text-emerald-400" : sig.rsi > 70 ? "text-red-400" : "text-text-primary"} />
          <MetricRow label="vs 50-day MA"   value={pct(sig.ma50_dist)}
            color={sig.ma50_dist == null ? "" : sig.ma50_dist >= 0 ? "text-positive" : "text-negative"} />
          <MetricRow label="vs 200-day MA"  value={pct(sig.ma200_dist)}
            color={sig.ma200_dist == null ? "" : sig.ma200_dist >= 0 ? "text-positive" : "text-negative"} />
          <MetricRow label="From 52W High"  value={pct(sig.dist_52w_high)}
            color={sig.dist_52w_high == null ? "" : sig.dist_52w_high >= -0.05 ? "text-emerald-400" : "text-text-muted"} />
          <MetricRow label="Volume Surge"   value={fmt(sig.vol_surge, 2) + "×"}
            color={sig.vol_surge == null ? "" : sig.vol_surge >= 2 ? "text-emerald-400" : "text-text-muted"} />
          <MetricRow label="BB Width %ile"  value={sig.bb_width_pct != null ? `${Math.round(sig.bb_width_pct)}th` : "—"} />
          <MetricRow label="ATR %"          value={sig.atr_pct != null ? `${(sig.atr_pct * 100).toFixed(2)}%` : "—"} />
          <MetricRow label="Nearest Pivot"  value={sig.nearest_pivot ?? "—"} />
          {sig.pivot_dist != null && (
            <MetricRow label="Pivot Distance" value={pct(sig.pivot_dist)} />
          )}
        </div>

        {/* RS + trade */}
        <div className="space-y-4">
          {/* RS vs SPY */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs font-medium text-text-primary mb-3">RS vs SPY (Excess Return)</div>
            <RSBar label="5-Day"   value={data.rs_periods.rs_5d} />
            <RSBar label="20-Day"  value={data.rs_periods.rs_20d} />
            <RSBar label="63-Day"  value={data.rs_periods.rs_63d} />
            <RSBar label="252-Day" value={data.rs_periods.rs_252d} />
            <div className="pt-2 mt-2 border-t border-border space-y-1">
              <MetricRow label="RS vs SPY (20D signal)" value={pct(sig.rs_spy_20d)}
                color={sig.rs_spy_20d == null ? "" : sig.rs_spy_20d >= 0 ? "text-positive" : "text-negative"} />
              {sig.rs_sector_20d != null && (
                <MetricRow label="RS vs Sector (20D)" value={pct(sig.rs_sector_20d)}
                  color={sig.rs_sector_20d >= 0 ? "text-positive" : "text-negative"} />
              )}
            </div>
          </div>

          {/* Trade levels */}
          <TradeLevels data={data} />
        </div>

      </div>
    </div>
  );
}
