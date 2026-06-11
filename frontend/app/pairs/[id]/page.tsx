"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RefreshCw, ArrowLeft, TrendingUp, TrendingDown, Brain, Activity, BarChart3 } from "lucide-react";
import Link from "next/link";
import { PriceCompChart } from "@/components/pairs/PriceCompChart";
import { SpreadChart } from "@/components/pairs/SpreadChart";
import { ZScoreChart } from "@/components/pairs/ZScoreChart";
import { HedgeRatioChart } from "@/components/pairs/HedgeRatioChart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PairDetail {
  ticker1: string; ticker2: string;
  stats: {
    pearson_corr: number; spearman_corr: number;
    adf_pvalue: number; adf_statistic: number; is_adf_stationary: boolean;
    johansen_trace_stat: number; johansen_crit_95: number; is_cointegrated: boolean;
    hurst_exponent: number; half_life_days: number;
    volatility_ratio: number; quality_score: number;
    current_zscore: number; hedge_ratio: number; n_obs: number;
    signal: string; signal_description: string;
    ml_probability: number | null; ml_model: string;
    ml_feature_importances: Record<string, number>;
  };
  regime: { regime: string; vix_current: number | null; description: string; pairs_enabled: boolean; recommended_entry: number };
  spread_series: { date: string; spread: number; z_score: number; rolling_mean: number; upper1: number; lower1: number; upper2: number; lower2: number; hedge_ratio: number }[];
  price_series:  { date: string; p1: number; p2: number; raw_p1: number; raw_p2: number }[];
}

interface BacktestResult {
  ticker1: string; ticker2: string;
  total_return: number; cagr: number; sharpe: number; sortino: number;
  max_drawdown: number; win_rate: number; avg_holding_days: number;
  profit_factor: number; n_trades: number; exposure: number;
  equity_curve: { date: string; equity: number }[];
  drawdown_series: { date: string; drawdown: number }[];
  trade_log: { entry_date: string; exit_date: string; side: string; entry_z: number; exit_z: number; pnl: number; holding_days: number; exit_reason: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt2  = (v: number | null | undefined) => v == null ? "—" : v.toFixed(2);
const fmt3  = (v: number | null | undefined) => v == null ? "—" : v.toFixed(3);
const fmt4  = (v: number | null | undefined) => v == null ? "—" : v.toFixed(4);
const fmtPct = (v: number | null | undefined) => v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

function StatCard({ label, value, sub, accent, green, red }: {
  label: string; value: React.ReactNode; sub?: string;
  accent?: boolean; green?: boolean; red?: boolean;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className={cn("text-lg font-bold mt-0.5 tabular-nums font-mono",
        accent ? "text-accent" : green ? "text-emerald-400" : red ? "text-red-400" : "text-text-primary"
      )}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-2">
      <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">{title}</h2>
      {sub && <span className="text-[10px] text-text-muted opacity-60">{sub}</span>}
    </div>
  );
}

function SignalBadge({ signal }: { signal: string }) {
  const cls =
    signal === "long_spread"  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" :
    signal === "short_spread" ? "bg-red-500/15 text-red-400 border-red-500/40" :
    signal === "exit"         ? "bg-blue-500/15 text-blue-400 border-blue-500/40" :
    "bg-surface-2 text-text-muted border-border";
  return (
    <span className={cn("text-[11px] font-bold px-3 py-1 rounded border uppercase tracking-widest", cls)}>
      {signal.replace(/_/g, " ")}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PairDetailPage() {
  const params = useParams<{ id: string }>();
  const parts  = (params.id ?? "").split("-");
  const ticker1 = parts[0] ?? "";
  const ticker2 = (parts.slice(1).join("-") || parts[1]) ?? "";

  const [period,      setPeriod]      = useState("2y");
  const [hedgeMethod, setHedgeMethod] = useState("kalman");
  const [spreadType,  setSpreadType]  = useState("log");
  const [zWindow,     setZWindow]     = useState(30);
  const [btEntry,     setBtEntry]     = useState(2.0);
  const [btExit,      setBtExit]      = useState(0.5);
  const [btStop,      setBtStop]      = useState(3.5);
  const [btCost,      setBtCost]      = useState(5);
  const [btNotional,  setBtNotional]  = useState(10000);

  const { data, isLoading, refetch, isFetching } = useQuery<PairDetail>({
    queryKey: ["pair-detail", ticker1, ticker2, period, hedgeMethod, spreadType, zWindow],
    queryFn:  () => api.getPairDetail(ticker1, ticker2, { period, hedge_method: hedgeMethod, spread_type: spreadType, zscore_window: zWindow }),
    enabled:  !!(ticker1 && ticker2),
    staleTime: 5 * 60 * 1000,
  });

  const { mutate: runBacktest, data: btData, isPending: btRunning } = useMutation<BacktestResult>({
    mutationFn: () => api.runPairsBacktest({
      ticker1, ticker2, period,
      spread_type: spreadType, hedge_method: hedgeMethod, zscore_window: zWindow,
      entry_threshold: btEntry, exit_threshold: btExit, stop_threshold: btStop,
      cost_bps: btCost, notional: btNotional,
    }),
  });

  if (!ticker1 || !ticker2) {
    return <div className="text-text-muted text-sm p-8">Invalid pair URL. Expected format: /pairs/AAPL-MSFT</div>;
  }

  const s = data?.stats;

  // Build rolling corr from spread_series (using pearson as proxy label)
  const rollingCorrData = data?.spread_series.map((pt, i) => ({
    date: pt.date,
    corr: pt.z_score != null ? Math.tanh(pt.z_score * 0.1 + (s?.pearson_corr ?? 0.7)) : null,
  })) ?? [];

  return (
    <div className="space-y-5 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/pairs" className="text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-base font-semibold font-mono">
              <span className="text-accent">{ticker1}</span>
              <span className="text-text-muted mx-2">/</span>
              <span className="text-text-primary">{ticker2}</span>
            </h1>
            <p className="text-xs text-text-muted mt-0.5">Statistical Arbitrage · Pair Analysis</p>
          </div>
          {s && <SignalBadge signal={s.signal} />}
        </div>
        <div className="flex items-center gap-2">
          {/* Period + hedge selectors */}
          {[
            { label: "Period", val: period, opts: ["1y","2y","3y","5y"], set: setPeriod },
            { label: "Hedge", val: hedgeMethod, opts: ["ols","rolling","kalman"], set: setHedgeMethod },
            { label: "Spread", val: spreadType, opts: ["log","price","ratio"], set: setSpreadType },
          ].map(({ label, val, opts, set }) => (
            <select key={label} value={val} onChange={e => set(e.target.value)}
              className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-text-primary">
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors">
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-text-muted text-sm py-16 justify-center">
          <RefreshCw size={14} className="animate-spin" /> Loading pair analysis…
        </div>
      ) : !data ? (
        <div className="text-text-muted text-sm py-16 text-center">No data available for this pair.</div>
      ) : (
        <>
          {/* ── Stat cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
            <StatCard label="Z-Score" value={`${s!.current_zscore > 0 ? "+" : ""}${fmt2(s!.current_zscore)}`}
              green={s!.current_zscore < -2} red={s!.current_zscore > 2} sub={s!.signal_description} />
            <StatCard label="Quality" value={`${s!.quality_score.toFixed(0)}/100`} accent />
            <StatCard label="Pearson ρ" value={fmt3(s!.pearson_corr)} green={s!.pearson_corr >= 0.8} />
            <StatCard label="Cointegrated" value={s!.is_cointegrated ? "YES" : "NO"}
              green={s!.is_cointegrated} red={!s!.is_cointegrated} sub={`ADF p=${fmt4(s!.adf_pvalue)}`} />
            <StatCard label="Hurst Exp." value={fmt3(s!.hurst_exponent)}
              green={s!.hurst_exponent < 0.45} red={s!.hurst_exponent > 0.55}
              sub={s!.hurst_exponent < 0.5 ? "Mean-reverting" : "Trending"} />
            <StatCard label="Half-Life" value={s!.half_life_days < 999 ? `${s!.half_life_days.toFixed(1)}d` : "∞"}
              green={s!.half_life_days <= 30} sub="OU process" />
            <StatCard label="Hedge Ratio β" value={fmt4(s!.hedge_ratio)} sub={hedgeMethod} />
            <StatCard label="ML Rev. Prob" value={s!.ml_probability != null ? `${(s!.ml_probability * 100).toFixed(0)}%` : "—"}
              accent={s!.ml_probability != null && s!.ml_probability > 0.6}
              sub={s!.ml_model} />
          </div>

          {/* ── Statistical tests detail ── */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <SectionHeader title="Statistical Tests" sub={`${s!.n_obs} observations`} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Pearson Corr",    val: fmt3(s!.pearson_corr),    good: s!.pearson_corr >= 0.7 },
                { label: "Spearman Corr",   val: fmt3(s!.spearman_corr),   good: s!.spearman_corr >= 0.7 },
                { label: "ADF p-value",     val: fmt4(s!.adf_pvalue),      good: s!.adf_pvalue <= 0.05 },
                { label: "ADF Statistic",   val: fmt3(s!.adf_statistic),   good: s!.adf_statistic < -3 },
                { label: "Johansen Trace",  val: `${fmt3(s!.johansen_trace_stat)} / ${fmt3(s!.johansen_crit_95)}`, good: s!.is_cointegrated },
                { label: "Vol Ratio",       val: fmt3(s!.volatility_ratio), good: s!.volatility_ratio > 0.5 && s!.volatility_ratio < 2.0 },
              ].map(({ label, val, good }) => (
                <div key={label} className="bg-surface-2/50 rounded p-2.5">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
                  <div className={cn("text-sm font-mono font-bold mt-0.5", good ? "text-emerald-400" : "text-amber-400")}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Charts row 1: Normalised prices ── */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <SectionHeader title="Normalised Price Comparison" sub="Indexed to 100 at start" />
            <PriceCompChart data={data.price_series} ticker1={ticker1} ticker2={ticker2} height={240} />
          </div>

          {/* ── Charts row 2: Spread ── */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <SectionHeader title="Spread" sub={`${spreadType} · ±1σ / ±2σ bands`} />
            <SpreadChart data={data.spread_series} height={260} />
          </div>

          {/* ── Charts row 3: Z-Score + Hedge Ratio ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-lg p-4">
              <SectionHeader title="Z-Score" sub="Entry ±2 · Exit ±0.5" />
              <ZScoreChart data={data.spread_series} entryThreshold={2.0} exitThreshold={0.5} height={220} />
            </div>
            <div className="bg-surface border border-border rounded-lg p-4">
              <SectionHeader title={`Hedge Ratio (${hedgeMethod})`} />
              <HedgeRatioChart data={data.spread_series} height={220} />
            </div>
          </div>

          {/* ── ML Feature Importance ── */}
          {s!.ml_probability != null && Object.keys(s!.ml_feature_importances).length > 0 && (
            <div className="bg-surface border border-border rounded-lg p-4">
              <SectionHeader title="ML Feature Importances" sub={`Model: ${s!.ml_model} · P(reversion) = ${(s!.ml_probability * 100).toFixed(0)}%`} />
              <div className="flex flex-wrap gap-3">
                {Object.entries(s!.ml_feature_importances)
                  .sort((a, b) => b[1] - a[1])
                  .map(([feat, imp]) => (
                    <div key={feat} className="flex items-center gap-2 text-xs">
                      <div className="w-28 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${(imp * 100).toFixed(0)}%` }} />
                      </div>
                      <span className="text-text-muted">{feat}</span>
                      <span className="tabular-nums font-mono text-text-primary">{(imp * 100).toFixed(1)}%</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ── Backtest section ── */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <SectionHeader title="Strategy Backtest" />
              <button onClick={() => runBacktest()}
                disabled={btRunning}
                className="flex items-center gap-1.5 bg-accent hover:bg-accent/90 disabled:opacity-60 text-white text-xs font-semibold px-4 py-1.5 rounded transition-colors">
                {btRunning ? <RefreshCw size={11} className="animate-spin" /> : <BarChart3 size={11} />}
                {btRunning ? "Running…" : "Run Backtest"}
              </button>
            </div>

            {/* Backtest config */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              {[
                { label: "Entry |z|", val: btEntry, set: setBtEntry, min: 1, max: 4, step: 0.1 },
                { label: "Exit |z|",  val: btExit,  set: setBtExit,  min: 0, max: 2, step: 0.1 },
                { label: "Stop |z|",  val: btStop,  set: setBtStop,  min: 2, max: 6, step: 0.1 },
                { label: "Cost (bps)",val: btCost,  set: setBtCost,  min: 0, max: 30, step: 1 },
                { label: "Notional $",val: btNotional, set: setBtNotional, min: 1000, max: 100000, step: 1000 },
              ].map(({ label, val, set, min, max, step }) => (
                <div key={label}>
                  <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">{label} · {val}</label>
                  <input type="range" min={min} max={max} step={step} value={val}
                    onChange={e => set(Number(e.target.value))}
                    className="w-full accent-accent" />
                </div>
              ))}
            </div>

            {/* Backtest results */}
            {btData && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 mb-4">
                  {[
                    { l: "Total Return",  v: fmtPct(btData.total_return),  g: btData.total_return > 0 },
                    { l: "CAGR",          v: fmtPct(btData.cagr),          g: btData.cagr > 0 },
                    { l: "Sharpe",        v: fmt2(btData.sharpe),           g: btData.sharpe > 0.7 },
                    { l: "Sortino",       v: fmt2(btData.sortino),          g: btData.sortino > 0.7 },
                    { l: "Max Drawdown",  v: fmtPct(btData.max_drawdown),   g: btData.max_drawdown > -15 },
                    { l: "Win Rate",      v: `${fmt2(btData.win_rate)}%`,   g: btData.win_rate > 55 },
                    { l: "Profit Factor", v: fmt2(btData.profit_factor),    g: btData.profit_factor > 1.5 },
                    { l: "# Trades",      v: btData.n_trades,               g: true },
                  ].map(({ l, v, g }) => (
                    <div key={l} className="bg-surface-2/50 border border-border rounded p-2.5">
                      <div className="text-[10px] text-text-muted uppercase tracking-wider">{l}</div>
                      <div className={cn("text-sm font-mono font-bold mt-0.5", g ? "text-emerald-400" : "text-red-400")}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Equity curve */}
                <div className="mb-4">
                  <SectionHeader title="Equity Curve" />
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={btData.equity_curve} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
                      <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={v => v?.slice(5)} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} width={60} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => [`$${v.toFixed(0)}`, "Equity"]} labelStyle={{ color: "#94a3b8" }} contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", borderRadius: 6, fontSize: 11 }} />
                      <Line dataKey="equity" stroke="#6366f1" strokeWidth={1.8} dot={false} name="Equity" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Trade log */}
                {btData.trade_log.length > 0 && (
                  <div>
                    <SectionHeader title="Trade Log" sub={`${btData.trade_log.length} trades · avg ${btData.avg_holding_days.toFixed(1)}d hold`} />
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-surface-2">
                          <tr className="border-b border-border">
                            {["Entry", "Exit", "Side", "Entry Z", "Exit Z", "P&L", "Days", "Reason"].map(h => (
                              <th key={h} className="px-2 py-1.5 text-left text-[10px] text-text-muted uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {btData.trade_log.map((t, i) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="px-2 py-1.5 font-mono text-[11px]">{t.entry_date}</td>
                              <td className="px-2 py-1.5 font-mono text-[11px]">{t.exit_date}</td>
                              <td className="px-2 py-1.5">
                                <span className={cn("text-[10px] font-semibold",
                                  t.side === "long_spread" ? "text-emerald-400" : "text-red-400")}>
                                  {t.side.replace("_", " ")}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">{t.entry_z.toFixed(2)}</td>
                              <td className="px-2 py-1.5 tabular-nums">{t.exit_z.toFixed(2)}</td>
                              <td className={cn("px-2 py-1.5 tabular-nums font-bold", t.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                                {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(0)}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">{t.holding_days}d</td>
                              <td className="px-2 py-1.5 text-text-muted capitalize">{t.exit_reason.replace("_", " ")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Regime info ── */}
          <div className="bg-surface border border-border rounded-lg p-3 flex items-center gap-4 text-xs">
            <Activity size={13} className="text-text-muted shrink-0" />
            <span className="text-text-muted">Regime:</span>
            <span className="font-semibold text-text-primary uppercase tracking-wider">{data.regime.regime.replace("_", " ")}</span>
            <span className="text-text-muted">{data.regime.description}</span>
            <span className="ml-auto text-text-muted">
              Recommended entry: <span className="text-text-primary font-mono">±{data.regime.recommended_entry}</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
