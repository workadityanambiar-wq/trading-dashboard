"use client";
import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type HybridResponse, type RegimeName } from "@/lib/api";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";
import { cn } from "@/lib/utils";
import {
  Play, X, Plus, ChevronUp, ChevronDown, Minus,
  TrendingUp, TrendingDown, AlertTriangle, Shield,
  RefreshCw, Info, RotateCcw, ChevronRight,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const REGIMES: { value: RegimeName; label: string; desc: string; color: string }[] = [
  { value: "Strong Trend", label: "Strong Trend", desc: "Full equity exposure · momentum strategies preferred", color: "text-emerald-400" },
  { value: "Choppy",       label: "Choppy",       desc: "80% equity · reduce position sizes · favour mean-reversion", color: "text-amber-400" },
  { value: "Bear",         label: "Bear",         desc: "60% equity · tilt defensive · hedge or reduce longs",  color: "text-orange-400" },
  { value: "Panic",        label: "Panic",        desc: "40% equity · capital preservation · cash / bonds only", color: "text-red-400" },
];

const REGIME_BG: Record<RegimeName, string> = {
  "Strong Trend": "bg-emerald-500/10 border-emerald-500/30",
  "Choppy":       "bg-amber-500/10 border-amber-500/30",
  "Bear":         "bg-orange-500/10 border-orange-500/30",
  "Panic":        "bg-red-500/10 border-red-500/30",
};

const DEFAULT_TICKERS = ["SPY", "QQQ", "IWM", "TLT", "GLD", "EFA", "EMB", "VNQ"];

const PRESETS: { label: string; tickers: string[] }[] = [
  { label: "Global ETF",  tickers: ["SPY", "QQQ", "IWM", "TLT", "GLD", "EFA", "EMB", "VNQ"] },
  { label: "Tech Growth", tickers: ["QQQ", "NVDA", "AAPL", "MSFT", "META", "AMZN"] },
  { label: "Defensive",   tickers: ["TLT", "GLD", "VNQ", "IEF", "BND", "XLP", "XLU"] },
  { label: "60 / 40",     tickers: ["SPY", "QQQ", "IWM", "TLT", "IEF", "BND"] },
];

const LAYER_LABELS: { key: "hrp" | "bl" | "cvar" | "regime"; label: string; desc: string }[] = [
  { key: "hrp",    label: "HRP",    desc: "Hierarchical Risk Parity — equal-risk clustering" },
  { key: "bl",     label: "BL",     desc: "Black-Litterman — macro & factor signal tilts" },
  { key: "cvar",   label: "CVaR",   desc: "CVaR control — scale down if risk budget breached" },
  { key: "regime", label: "Regime", desc: "Market regime overlay — equity fraction scaling" },
];

const LOADING_STEPS = [
  "Fetching price history…",
  "Computing HRP weights…",
  "Applying BL signal tilts…",
  "Enforcing CVaR risk budget…",
  "Overlaying market regime…",
];

// ── Small helpers ─────────────────────────────────────────────────────────────

function Tip({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="inline-flex items-center text-text-muted/40 hover:text-text-muted cursor-help ml-1 transition-colors"
    >
      <Info size={10} />
    </span>
  );
}

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

function MetricCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 flex flex-col gap-0.5">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={cn("text-lg font-mono font-bold", accent ?? "text-text-primary")}>{value}</div>
      {sub && <div className="text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

// ── Waterfall table ───────────────────────────────────────────────────────────

function WaterfallTable({ result }: { result: HybridResponse }) {
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const { layers, tickers_used } = result;
  const visible = tickers_used.filter(t =>
    LAYER_LABELS.some(l => (layers[l.key][t] ?? 0) > 0.001)
  );
  return (
    <>
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
              <tr key={t} onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${t}`, color: "#6366f1" })}
                className="hover:bg-surface-2 transition-colors cursor-pointer">
                <td className="py-2 font-mono font-semibold text-text-primary">{t}</td>
                <td className="py-2 text-right font-mono text-text-muted">{pctFmt(hrp)}</td>
                <td className={cn("py-2 text-right font-mono", deltaColor(hrp, bl))}>
                  <span className="flex items-center justify-end gap-0.5">
                    <DeltaIcon from={hrp} to={bl} />{pctFmt(bl)}
                  </span>
                </td>
                <td className={cn("py-2 text-right font-mono", deltaColor(bl, cvar))}>
                  <span className="flex items-center justify-end gap-0.5">
                    <DeltaIcon from={bl} to={cvar} />{pctFmt(cvar)}
                  </span>
                </td>
                <td className={cn("py-2 text-right font-mono", deltaColor(cvar, regime))}>
                  <span className="flex items-center justify-end gap-0.5">
                    <DeltaIcon from={cvar} to={regime} />{pctFmt(regime)}
                  </span>
                </td>
                <td className="py-2 text-right font-mono font-semibold text-accent">
                  {final > 0 ? pctFmt(final) : <span className="text-text-muted/40">—</span>}
                </td>
              </tr>
            );
          })}
          {result.cash_pct > 0.001 && (
            <tr className="border-t border-border/60">
              <td className="py-2 font-mono text-text-muted">CASH</td>
              <td colSpan={4} />
              <td className="py-2 text-right font-mono text-amber-400/80">{pctFmt(result.cash_pct)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </>
  );
}

// ── Allocation bars ───────────────────────────────────────────────────────────

function AllocationBars({ result }: { result: HybridResponse }) {
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const entries = Object.entries(result.final_weights).sort(([, a], [, b]) => b - a);
  if (result.cash_pct > 0.001) entries.push(["CASH", result.cash_pct]);
  const max = Math.max(...entries.map(([, v]) => v));
  return (
    <>
    <div className="space-y-1.5">
      {entries.map(([t, w]) => (
        <div key={t}
          onClick={() => t !== "CASH" && setDrawer({ fetchUrl: `/api/chart/stock/${t}`, color: "#6366f1" })}
          className={cn("flex items-center gap-2", t !== "CASH" && "cursor-pointer hover:opacity-80 transition-opacity")}>
          <span className="font-mono text-xs w-12 shrink-0 text-text-primary">{t}</span>
          <div className="flex-1 bg-surface-2 rounded-full h-2 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", t === "CASH" ? "bg-amber-400/60" : "bg-accent")}
              style={{ width: `${(w / max) * 100}%` }}
            />
          </div>
          <span className="font-mono text-xs w-10 text-right text-text-muted">{pctFmt(w)}</span>
        </div>
      ))}
    </div>
    <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </>
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
  const [tickers, setTickers]             = useState<string[]>(DEFAULT_TICKERS);
  const [tickerInput, setTickerInput]     = useState("");
  const [regime, setRegime]               = useState<RegimeName>("Strong Trend");
  const [cvarLimit, setCvarLimit]         = useState(0.02);
  const [maxWeight, setMaxWeight]         = useState(0.20);
  const [signals, setSignals]             = useState<Record<string, number>>({});
  const [showSentiment, setShowSentiment] = useState(false);
  const [loadStep, setLoadStep]           = useState(0);
  const [hasRun, setHasRun]               = useState(false);
  const [runConfig, setRunConfig]         = useState("");

  const inputRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const resultsRef  = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [suggestions, setSuggestions]         = useState<{ ticker: string; name: string; is_etf: boolean }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIdx, setActiveIdx]             = useState(-1);

  // Autocomplete search
  useEffect(() => {
    const q = tickerInput.trim();
    if (!q) { setSuggestions([]); setShowSuggestions(false); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.searchUniverse(q, 8);
        const filtered = res.results.filter(r => !tickers.includes(r.ticker));
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        setActiveIdx(-1);
      } catch { /* ignore */ }
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [tickerInput]);

  // Click-outside to close dropdown
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const mutation = useMutation({
    mutationFn: () => api.hybridOptimize({
      tickers,
      regime,
      signals,
      cvar_limit: cvarLimit,
      max_weight: maxWeight,
      start_date: "2020-01-01",
    }),
    onSuccess: () => {
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    },
  });

  const result = mutation.data;
  const selectedRegime = REGIMES.find(r => r.value === regime)!;

  // Stale detection
  const currentConfig = JSON.stringify({
    t: [...tickers].sort(), r: regime,
    c: cvarLimit.toFixed(3), m: maxWeight.toFixed(2), s: signals,
  });
  const isDirty = hasRun && mutation.isSuccess && currentConfig !== runConfig;

  // Loading step cycling
  useEffect(() => {
    if (!mutation.isPending) { setLoadStep(0); return; }
    const id = setInterval(() => setLoadStep(s => (s + 1) % LOADING_STEPS.length), 1200);
    return () => clearInterval(id);
  }, [mutation.isPending]);

  function handleRun() {
    setRunConfig(currentConfig);
    setHasRun(true);
    mutation.mutate();
  }

  function addTicker() {
    const t = tickerInput.trim().toUpperCase();
    if (t && !tickers.includes(t)) setTickers(prev => [...prev, t]);
    setTickerInput("");
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function addTickerBySymbol(symbol: string) {
    const t = symbol.toUpperCase();
    if (t && !tickers.includes(t)) setTickers(prev => [...prev, t]);
    setTickerInput("");
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function removeTicker(t: string) {
    setTickers(prev => prev.filter(x => x !== t));
    setSignals(prev => { const s = { ...prev }; delete s[t]; return s; });
  }

  function setSentiment(ticker: string, val: number | null) {
    setSignals(prev => {
      const s = { ...prev };
      if (val === null) delete s[ticker]; else s[ticker] = val;
      return s;
    });
  }

  const signalCount = Object.keys(signals).length;

  return (
    <div className="space-y-5 max-w-screen-xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-base font-semibold">Hybrid Risk Engine</h1>
          <p className="text-xs text-text-muted mt-0.5">
            HRP base · Black-Litterman / ML tilts · CVaR budget · Regime overlay
          </p>
        </div>

        {/* Quick preset buttons */}
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => { setTickers(p.tickers); setSignals({}); }}
              className={cn(
                "px-2.5 py-1 rounded-md border text-xs transition-colors",
                tickers.length === p.tickers.length && p.tickers.every(t => tickers.includes(t))
                  ? "bg-accent/10 border-accent/40 text-accent"
                  : "bg-surface border-border text-text-muted hover:text-text-primary hover:border-border/80"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Config panel ───────────────────────────────────────────────────── */}
        <div className="space-y-3 lg:col-span-1">

          {/* Tickers */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Portfolio Tickers</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 border border-border text-text-muted">
                  {tickers.length}
                </span>
              </div>
              <button
                onClick={() => { setTickers(DEFAULT_TICKERS); setSignals({}); }}
                title="Reset to default tickers"
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <RotateCcw size={12} />
              </button>
            </div>

            <div className="flex gap-1.5 flex-wrap min-h-[28px]">
              {tickers.map(t => (
                <span
                  key={t}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-2 border border-border text-xs font-mono"
                >
                  {signals[t] != null && (
                    signals[t] > 0
                      ? <TrendingUp size={9} className="text-emerald-400" />
                      : <TrendingDown size={9} className="text-red-400" />
                  )}
                  {t}
                  <button
                    onClick={() => removeTicker(t)}
                    className="text-text-muted hover:text-red-400 ml-0.5 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>

            {/* Autocomplete input */}
            <div className="relative" ref={dropdownRef}>
              <div className="flex gap-1.5">
                <input
                  ref={inputRef}
                  value={tickerInput}
                  onChange={e => setTickerInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
                    else if (e.key === "Enter") {
                      if (activeIdx >= 0 && suggestions[activeIdx]) addTickerBySymbol(suggestions[activeIdx].ticker);
                      else addTicker();
                    }
                    else if (e.key === "Escape") setShowSuggestions(false);
                  }}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Search ticker or company…"
                  className="flex-1 bg-surface-2 border border-border rounded px-2 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
                <button
                  onClick={addTicker}
                  className="px-2 py-1.5 rounded bg-surface-2 border border-border text-text-muted hover:text-text-primary transition-colors"
                >
                  <Plus size={12} />
                </button>
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-surface shadow-lg overflow-hidden">
                  {suggestions.map((s, i) => (
                    <button
                      key={s.ticker}
                      onMouseDown={e => { e.preventDefault(); addTickerBySymbol(s.ticker); }}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={cn(
                        "w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 text-xs hover:bg-surface-2 transition-colors",
                        i === activeIdx && "bg-surface-2"
                      )}
                    >
                      <span className="font-mono font-semibold text-text-primary">{s.ticker}</span>
                      <span className="text-text-muted truncate max-w-[160px]">{s.name}</span>
                      {s.is_etf && <span className="text-[9px] text-accent/70 shrink-0">ETF</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Market Regime */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
            <div className="text-sm font-medium">Market Regime</div>
            {REGIMES.map(r => (
              <button
                key={r.value}
                onClick={() => setRegime(r.value)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded border text-xs transition-colors",
                  regime === r.value
                    ? `${REGIME_BG[r.value]}`
                    : "bg-surface-2 border-border text-text-muted hover:text-text-primary"
                )}
              >
                <div className={cn("font-semibold", regime === r.value ? r.color : "")}>
                  {r.label}
                </div>
                <div className={cn(
                  "text-[10px] mt-0.5 transition-colors",
                  regime === r.value ? "text-text-muted" : "text-text-muted/40"
                )}>
                  {r.desc}
                </div>
              </button>
            ))}
          </div>

          {/* Risk Parameters */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="text-sm font-medium">Risk Parameters</div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-text-muted flex items-center">
                  CVaR 95% daily limit
                  <Tip text="Max expected loss on the worst 5% of days. Lower = safer portfolio, but may reduce returns." />
                </span>
                <span className="font-mono text-text-primary">{pctFmt(cvarLimit)}</span>
              </div>
              <input
                type="range" min={0.005} max={0.05} step={0.001}
                value={cvarLimit}
                onChange={e => setCvarLimit(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-[9px] text-text-muted mt-0.5">
                <span>0.5% tight</span><span>5.0% loose</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-text-muted flex items-center">
                  Max position size
                  <Tip text="No single holding can exceed this % of portfolio weight." />
                </span>
                <span className="font-mono text-text-primary">{pctFmt(maxWeight)}</span>
              </div>
              <input
                type="range" min={0.05} max={1.0} step={0.01}
                value={maxWeight}
                onChange={e => setMaxWeight(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-[9px] text-text-muted mt-0.5">
                <span>5% diversified</span><span>100% uncapped</span>
              </div>
            </div>
          </div>

          {/* Your Market Views — collapsible sentiment */}
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            <button
              onClick={() => setShowSentiment(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs hover:bg-surface-2 transition-colors"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                Your Market Views
                <Tip text="Optional: tilt Black-Litterman weights toward your conviction. Bullish = overweight, Bearish = underweight." />
                {signalCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-mono">
                    {signalCount} set
                  </span>
                )}
              </span>
              <ChevronRight
                size={13}
                className={cn("text-text-muted transition-transform", showSentiment && "rotate-90")}
              />
            </button>

            {showSentiment && tickers.length > 0 && (
              <div className="px-4 pb-4 space-y-1.5 border-t border-border/50">
                <p className="text-[10px] text-text-muted pt-3 pb-1">
                  Click a ticker to tilt its Black-Litterman weight. Leave neutral to rely on the model.
                </p>
                {tickers.map(t => {
                  const sig = signals[t] ?? null;
                  return (
                    <div key={t} className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-text-primary w-12 shrink-0">{t}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setSentiment(t, sig === 2 ? null : 2)}
                          className={cn(
                            "flex items-center gap-0.5 px-2 py-1 rounded text-[10px] border transition-colors",
                            sig === 2
                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                              : "bg-surface-2 border-border text-text-muted hover:text-emerald-400 hover:border-emerald-500/30"
                          )}
                        >
                          <TrendingUp size={9} />
                          <span>Bull</span>
                        </button>
                        <button
                          onClick={() => setSentiment(t, null)}
                          className={cn(
                            "flex items-center gap-0.5 px-2 py-1 rounded text-[10px] border transition-colors",
                            sig === null
                              ? "bg-surface-2 border-accent/30 text-accent"
                              : "bg-surface-2 border-border text-text-muted hover:text-text-primary"
                          )}
                        >
                          <Minus size={9} />
                          <span>Neutral</span>
                        </button>
                        <button
                          onClick={() => setSentiment(t, sig === -2 ? null : -2)}
                          className={cn(
                            "flex items-center gap-0.5 px-2 py-1 rounded text-[10px] border transition-colors",
                            sig === -2
                              ? "bg-red-500/15 border-red-500/40 text-red-400"
                              : "bg-surface-2 border-border text-text-muted hover:text-red-400 hover:border-red-500/30"
                          )}
                        >
                          <TrendingDown size={9} />
                          <span>Bear</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {showSentiment && tickers.length === 0 && (
              <p className="px-4 pb-4 pt-3 text-xs text-text-muted border-t border-border/50">
                Add tickers above to set sentiment signals.
              </p>
            )}
          </div>

          {/* Run button */}
          <div className="space-y-2">
            <button
              onClick={handleRun}
              disabled={mutation.isPending || tickers.length < 2}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50",
                isDirty
                  ? "bg-amber-500 hover:bg-amber-400 text-white"
                  : "bg-accent hover:bg-accent/90 text-white"
              )}
            >
              {mutation.isPending ? (
                <><RefreshCw size={13} className="animate-spin" />{LOADING_STEPS[loadStep]}</>
              ) : isDirty ? (
                <><RefreshCw size={13} />Update Results</>
              ) : (
                <><Play size={13} />Run 5-Layer Optimization</>
              )}
            </button>

            {tickers.length < 2 && (
              <p className="text-center text-[10px] text-text-muted">
                Add at least 2 tickers to run the engine
              </p>
            )}

            {mutation.isError && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                {(mutation.error as Error).message}
              </div>
            )}
          </div>
        </div>

        {/* ── Results panel ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4" ref={resultsRef}>

          {/* Empty state */}
          {!result && !mutation.isPending && (
            <div className="rounded-lg border border-border bg-surface p-8 space-y-8">
              <div className="grid grid-cols-3 gap-6">
                {[
                  {
                    n: "1",
                    title: "Build your portfolio",
                    desc: "Search any stock or ETF by name or symbol, or load a preset above.",
                  },
                  {
                    n: "2",
                    title: "Set your market view",
                    desc: "Pick a regime and optionally set bullish or bearish signals per ticker.",
                  },
                  {
                    n: "3",
                    title: "Run the engine",
                    desc: "Get 5-layer risk-parity allocation with CVaR and regime overlay.",
                  },
                ].map(step => (
                  <div key={step.n} className="flex flex-col items-center text-center gap-2.5">
                    <div className="w-8 h-8 rounded-full border-2 border-accent/40 bg-accent/10 flex items-center justify-center font-mono font-bold text-accent text-sm">
                      {step.n}
                    </div>
                    <div className="text-xs font-semibold text-text-primary">{step.title}</div>
                    <div className="text-[10px] text-text-muted leading-relaxed">{step.desc}</div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-6">
                <div className="text-xs font-medium text-text-muted mb-3">How the 5 layers work</div>
                <LayerLegend />
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {mutation.isPending && (
            <div className="rounded-lg border border-border bg-surface p-8 flex flex-col items-center gap-4">
              <RefreshCw size={20} className="animate-spin text-accent" />
              <div className="text-sm text-text-primary font-medium">{LOADING_STEPS[loadStep]}</div>
              <div className="flex gap-1.5">
                {LOADING_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 w-8 rounded-full transition-all duration-500",
                      i === loadStep ? "bg-accent" : i < loadStep ? "bg-accent/40" : "bg-surface-2"
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {result && (
            <>
              {/* Missing tickers warning */}
              {result.tickers_missing.length > 0 && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs">
                  <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-amber-200/80">
                    No price data for:{" "}
                    <span className="font-mono">{result.tickers_missing.join(", ")}</span>
                    {" "}— excluded from optimization
                  </span>
                </div>
              )}

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
                  sub={result.metrics.sharpe_ratio >= 1 ? "Excellent" : result.metrics.sharpe_ratio >= 0.5 ? "Good" : "Low"}
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
                  sub={result.cvar_95_daily <= cvarLimit ? "Within limit" : "Over limit"}
                  accent={result.cvar_95_daily <= cvarLimit ? "text-emerald-400" : "text-red-400"}
                />
                <MetricCard
                  label="Max Drawdown"
                  value={pctFmt(result.metrics.max_drawdown)}
                  accent="text-red-400"
                />
              </div>

              {/* Allocation bars */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="text-sm font-medium mb-3">Final Allocation</div>
                <AllocationBars result={result} />
              </div>

              {/* Waterfall table */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <div className="text-sm font-medium">Allocation Waterfall</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      Weight evolution through each layer · arrows show change direction
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
