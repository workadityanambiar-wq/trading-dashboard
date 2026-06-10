"use client";
import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type HybridResponse, type RegimeName } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Play, X, Plus, ChevronUp, ChevronDown, Minus,
  TrendingUp, TrendingDown, AlertTriangle, Shield,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const REGIMES: { value: RegimeName; label: string; desc: string; color: string }[] = [
  { value: "Strong Trend", label: "Strong Trend", desc: "Full equity exposure · momentum strategies preferred", color: "text-emerald-400" },
  { value: "Choppy",       label: "Choppy",       desc: "80% equity · reduce position sizes · favour mean-reversion", color: "text-amber-400" },
  { value: "Bear",         label: "Bear",          desc: "60% equity · tilt defensive · hedge or reduce longs",  color: "text-orange-400" },
  { value: "Panic",        label: "Panic",         desc: "40% equity · capital preservation · cash / bonds only", color: "text-red-400" },
];

const REGIME_BG: Record<RegimeName, string> = {
  "Strong Trend": "bg-emerald-500/10 border-emerald-500/30",
  "Choppy":       "bg-amber-500/10 border-amber-500/30",
  "Bear":         "bg-orange-500/10 border-orange-500/30",
  "Panic":        "bg-red-500/10 border-red-500/30",
};

const DEFAULT_TICKERS = ["SPY", "QQQ", "IWM", "TLT", "GLD", "EFA", "EMB", "VNQ"];

const LAYER_LABELS: { key: "hrp" | "bl" | "cvar" | "regime"; label: string; desc: string }[] = [
  { key: "hrp",    label: "HRP",    desc: "Hierarchical Risk Parity — equal-risk clustering" },
  { key: "bl",     label: "BL",     desc: "Black-Litterman — macro & factor signal tilts" },
  { key: "cvar",   label: "CVaR",   desc: "CVaR control — scale down if risk budget breached" },
  { key: "regime", label: "Regime", desc: "Market regime overlay — equity fraction scaling" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctFmt(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function deltaColor(from: number, to: number): string {
  const d = to - from;
  if (Math.abs(d) < 0.001) return "text-text-muted";
  return d > 0 ? "text-emerald-400" : "text-red-400";
}

function DeltaIcon({ from, to }: { from: number; to: number }) {
  const d = to - from;
  if (Math.abs(d) < 0.001) return <Minus size={9} className="text-text-muted/50" />;
  return d > 0
    ? <ChevronUp size={9} className="text-emerald-400" />
    : <ChevronDown size={9} className="text-red-400" />;
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 flex flex-col gap-0.5">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={cn("text-lg font-mono font-bold", accent ?? "text-text-primary")}>{value}</div>
      {sub && <div className="text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

// ── Allocation waterfall table ────────────────────────────────────────────────

function WaterfallTable({ result }: { result: HybridResponse }) {
  const { layers, tickers_used } = result;

  const visible = tickers_used.filter(t =>
    LAYER_LABELS.some(l => (layers[l.key][t] ?? 0) > 0.001)
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted border-b border-border">
            <th className="text-left pb-2 font-normal w-16">Ticker</th>
            {LAYER_LABELS.map((l, i) => (
              <th key={l.key} className="text-right pb-2 font-normal min-w-[72px]">
                {i > 0 && <span className="text-text-muted/40 mr-1">→</span>}
                <span className="font-semibold text-text-primary">{l.label}</span>
              </th>
            ))}
            <th className="text-right pb-2 font-normal min-w-[60px]">
              <span className="text-text-muted/40 mr-1">→</span>
              <span className="font-semibold text-accent">Final</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {visible.map(t => {
            const hrp    = layers.hrp[t]    ?? 0;
            const bl     = layers.bl[t]     ?? 0;
            const cvar   = layers.cvar[t]   ?? 0;
            const regime = layers.regime[t] ?? 0;
            const final  = result.final_weights[t] ?? 0;
            return (
              <tr key={t} className="hover:bg-surface-2 transition-colors">
                <td className="py-2 font-mono font-semibold text-text-primary">{t}</td>

                {/* HRP */}
                <td className="py-2 text-right font-mono text-text-muted">
                  {pctFmt(hrp)}
                </td>

                {/* BL */}
                <td className={cn("py-2 text-right font-mono", deltaColor(hrp, bl))}>
                  <span className="flex items-center justify-end gap-0.5">
                    <DeltaIcon from={hrp} to={bl} />
                    {pctFmt(bl)}
                  </span>
                </td>

                {/* CVaR */}
                <td className={cn("py-2 text-right font-mono", deltaColor(bl, cvar))}>
                  <span className="flex items-center justify-end gap-0.5">
                    <DeltaIcon from={bl} to={cvar} />
                    {pctFmt(cvar)}
                  </span>
                </td>

                {/* Regime */}
                <td className={cn("py-2 text-right font-mono", deltaColor(cvar, regime))}>
                  <span className="flex items-center justify-end gap-0.5">
                    <DeltaIcon from={cvar} to={regime} />
                    {pctFmt(regime)}
                  </span>
                </td>

                {/* Final */}
                <td className="py-2 text-right font-mono font-semibold text-accent">
                  {final > 0 ? pctFmt(final) : <span className="text-text-muted/40">—</span>}
                </td>
              </tr>
            );
          })}
          {/* Cash row */}
          {result.cash_pct > 0.001 && (
            <tr className="border-t border-border/60">
              <td className="py-2 font-mono text-text-muted">CASH</td>
              <td colSpan={4} />
              <td className="py-2 text-right font-mono text-amber-400/80">
                {pctFmt(result.cash_pct)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Final weights bar chart ───────────────────────────────────────────────────

function AllocationBars({ result }: { result: HybridResponse }) {
  const entries = Object.entries(result.final_weights)
    .sort(([, a], [, b]) => b - a);

  if (result.cash_pct > 0.001) {
    entries.push(["CASH", result.cash_pct]);
  }

  const max = Math.max(...entries.map(([, v]) => v));

  return (
    <div className="space-y-1.5">
      {entries.map(([t, w]) => (
        <div key={t} className="flex items-center gap-2">
          <span className="font-mono text-xs w-12 shrink-0 text-text-primary">{t}</span>
          <div className="flex-1 bg-surface-2 rounded-full h-2 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", t === "CASH" ? "bg-amber-400/60" : "bg-accent")}
              style={{ width: `${(w / max) * 100}%` }}
            />
          </div>
          <span className="font-mono text-xs w-10 text-right text-text-muted">
            {pctFmt(w)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Layer legend ──────────────────────────────────────────────────────────────

function LayerLegend() {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      {LAYER_LABELS.map((l, i) => (
        <div key={l.key} className="flex gap-2 items-start">
          <span className="font-mono font-semibold text-accent shrink-0 w-10">L{i + 1}</span>
          <div>
            <div className="font-medium text-text-primary">{l.label}</div>
            <div className="text-text-muted text-[10px]">{l.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RiskEnginePage() {
  const [tickers, setTickers]       = useState<string[]>(DEFAULT_TICKERS);
  const [tickerInput, setTickerInput] = useState("");
  const [regime, setRegime]         = useState<RegimeName>("Strong Trend");
  const [cvarLimit, setCvarLimit]   = useState(0.02);
  const [maxWeight, setMaxWeight]   = useState(0.20);
  const [signalInput, setSignalInput] = useState("");
  const [signals, setSignals]       = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: () => api.hybridOptimize({
      tickers,
      regime,
      signals,
      cvar_limit: cvarLimit,
      max_weight: maxWeight,
      start_date: "2020-01-01",
    }),
  });

  const result = mutation.data;
  const selectedRegime = REGIMES.find(r => r.value === regime)!;

  function addTicker() {
    const t = tickerInput.trim().toUpperCase();
    if (t && !tickers.includes(t)) setTickers(prev => [...prev, t]);
    setTickerInput("");
    inputRef.current?.focus();
  }

  function removeTicker(t: string) {
    setTickers(prev => prev.filter(x => x !== t));
    setSignals(prev => { const s = { ...prev }; delete s[t]; return s; });
  }

  function applySignal() {
    const [rawTicker, rawVal] = signalInput.split("=").map(s => s.trim());
    const t = rawTicker?.toUpperCase();
    const v = parseFloat(rawVal ?? "");
    if (t && !isNaN(v) && tickers.includes(t)) {
      setSignals(prev => ({ ...prev, [t]: v }));
    }
    setSignalInput("");
  }

  return (
    <div className="space-y-5 max-w-screen-xl">

      {/* Header */}
      <div>
        <h1 className="text-base font-semibold">Hybrid Risk Engine</h1>
        <p className="text-xs text-text-muted mt-0.5">
          HRP base · Black-Litterman / ML tilts · CVaR budget · Regime overlay
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Config panel ─────────────────────────────────────────────────── */}
        <div className="space-y-4 lg:col-span-1">

          {/* Tickers */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="text-sm font-medium">Portfolio Tickers</div>
            <div className="flex gap-1.5 flex-wrap">
              {tickers.map(t => (
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-2 border border-border text-xs font-mono">
                  {t}
                  {signals[t] != null && (
                    <span className={cn("text-[9px] font-sans", signals[t] >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {signals[t] >= 0 ? "+" : ""}{signals[t].toFixed(1)}σ
                    </span>
                  )}
                  <button onClick={() => removeTicker(t)} className="text-text-muted hover:text-red-400 ml-0.5">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                ref={inputRef}
                value={tickerInput}
                onChange={e => setTickerInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && addTicker()}
                placeholder="Add ticker…"
                className="flex-1 bg-surface-2 border border-border rounded px-2 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
              <button
                onClick={addTicker}
                className="px-2 py-1.5 rounded bg-surface-2 border border-border text-text-muted hover:text-text-primary"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Regime selector */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
            <div className="text-sm font-medium">Market Regime</div>
            {REGIMES.map(r => (
              <button
                key={r.value}
                onClick={() => setRegime(r.value)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded border text-xs transition-colors",
                  regime === r.value
                    ? `${REGIME_BG[r.value]} border-opacity-100`
                    : "bg-surface-2 border-border text-text-muted hover:text-text-primary"
                )}
              >
                <div className={cn("font-semibold", regime === r.value ? r.color : "")}>{r.label}</div>
                {regime === r.value && <div className="text-text-muted text-[10px] mt-0.5">{r.desc}</div>}
              </button>
            ))}
          </div>

          {/* CVaR + max weight sliders */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="text-sm font-medium">Risk Parameters</div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-text-muted">CVaR 95% daily limit</span>
                <span className="font-mono text-text-primary">{pctFmt(cvarLimit)}</span>
              </div>
              <input
                type="range" min={0.005} max={0.05} step={0.001}
                value={cvarLimit}
                onChange={e => setCvarLimit(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-[9px] text-text-muted mt-0.5">
                <span>0.5% (tight)</span><span>5.0% (loose)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-text-muted">Max position size</span>
                <span className="font-mono text-text-primary">{pctFmt(maxWeight)}</span>
              </div>
              <input
                type="range" min={0.05} max={1.0} step={0.01}
                value={maxWeight}
                onChange={e => setMaxWeight(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-[9px] text-text-muted mt-0.5">
                <span>5% (diversified)</span><span>100% (uncapped)</span>
              </div>
            </div>
          </div>

          {/* Signal overrides */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
            <div className="text-sm font-medium">BL Signal Overrides</div>
            <div className="text-xs text-text-muted">
              Enter factor z-scores as BL views. Positive = bullish tilt.
            </div>
            <div className="flex gap-1.5">
              <input
                value={signalInput}
                onChange={e => setSignalInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && applySignal()}
                placeholder="AAPL=1.5 or QQQ=-0.8"
                className="flex-1 bg-surface-2 border border-border rounded px-2 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
              <button
                onClick={applySignal}
                className="px-2 py-1.5 rounded bg-surface-2 border border-border text-text-muted hover:text-text-primary"
              >
                <Plus size={12} />
              </button>
            </div>
            {Object.keys(signals).length > 0 && (
              <div className="space-y-0.5">
                {Object.entries(signals).map(([t, v]) => (
                  <div key={t} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-text-primary">{t}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={cn("font-mono", v >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {v >= 0 ? "+" : ""}{v.toFixed(2)}σ
                      </span>
                      <button onClick={() => setSignals(p => { const s = { ...p }; delete s[t]; return s; })} className="text-text-muted hover:text-red-400">
                        <X size={9} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Run button */}
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || tickers.length < 2}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending
              ? <><span className="animate-spin">⟳</span> Running engine…</>
              : <><Play size={13} /> Run 5-Layer Optimization</>}
          </button>

          {mutation.isError && (
            <div className="text-xs text-red-400 px-1">
              {(mutation.error as Error).message}
            </div>
          )}
        </div>

        {/* ── Results panel ────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {!result && !mutation.isPending && (
            <div className="rounded-lg border border-border bg-surface p-8 text-center space-y-3">
              <div className="text-text-muted text-sm">Configure the portfolio and click Run to see the 5-layer allocation waterfall.</div>
              <div className="rounded-lg border border-border bg-surface-2 p-4 text-left">
                <LayerLegend />
              </div>
            </div>
          )}

          {result && (
            <>
              {/* Regime banner */}
              <div className={cn(
                "flex items-center justify-between px-4 py-3 rounded-lg border flex-wrap gap-2",
                REGIME_BG[result.regime as RegimeName]
              )}>
                <div className="flex items-center gap-3">
                  <Shield size={14} className={selectedRegime.color} />
                  <span className={cn("text-sm font-bold", selectedRegime.color)}>{result.regime}</span>
                  <span className="text-xs text-text-muted">
                    equity fraction: <span className="font-mono">{pctFmt(result.equity_fraction)}</span>
                    {result.cash_pct > 0.001 && (
                      <> · cash: <span className="font-mono text-amber-400">{pctFmt(result.cash_pct)}</span></>
                    )}
                  </span>
                </div>
                <span className="text-xs text-text-muted">
                  {result.n_holdings} holdings · {result.price_history_start} → {result.price_history_end}
                </span>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <MetricCard
                  label="Sharpe Ratio"
                  value={result.metrics.sharpe_ratio.toFixed(2)}
                  accent={result.metrics.sharpe_ratio >= 0.5 ? "text-emerald-400" : result.metrics.sharpe_ratio < 0 ? "text-red-400" : "text-text-primary"}
                />
                <MetricCard
                  label="Ann. Return"
                  value={pctFmt(result.metrics.annualized_return)}
                  accent={result.metrics.annualized_return >= 0 ? "text-emerald-400" : "text-red-400"}
                />
                <MetricCard
                  label="Ann. Volatility"
                  value={pctFmt(result.metrics.annualized_volatility)}
                />
                <MetricCard
                  label="CVaR 95% (daily)"
                  value={pctFmt(result.cvar_95_daily)}
                  sub={`limit: ${pctFmt(cvarLimit)}`}
                  accent={result.cvar_95_daily <= cvarLimit ? "text-emerald-400" : "text-red-400"}
                />
                <MetricCard
                  label="Max Drawdown"
                  value={pctFmt(result.metrics.max_drawdown)}
                  accent="text-red-400"
                />
              </div>

              {/* Waterfall table */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <div className="text-sm font-medium">Allocation Waterfall</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      Weight evolution through each layer · arrows show changes
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-text-muted">
                    <span className="flex items-center gap-1"><ChevronUp size={10} className="text-emerald-400" /> increase</span>
                    <span className="flex items-center gap-1"><ChevronDown size={10} className="text-red-400" /> decrease</span>
                    <span className="flex items-center gap-1"><Minus size={10} /> unchanged</span>
                  </div>
                </div>
                <WaterfallTable result={result} />
              </div>

              {/* Allocation bars */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-3">Final Allocation</div>
                <AllocationBars result={result} />
              </div>

              {/* Layer legend */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-3">Layer Reference</div>
                <LayerLegend />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
