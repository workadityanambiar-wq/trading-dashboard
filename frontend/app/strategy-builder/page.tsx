"use client";
import { useState, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import {
  Play, Plus, X, ChevronDown, ChevronUp, AlertTriangle,
  TrendingUp, TrendingDown, Activity, Shield, Target,
  Zap, BarChart2, GitBranch, Shuffle, Star, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Factor { name: string; weight: number; }
interface BacktestResult {
  strategy_name: string;
  metrics: Record<string, number | null>;
  grade: { score: number; grade: string; breakdown: Record<string, number> };
  warnings: Array<{ type: string; severity: string; message: string }>;
  insights: {
    what_drove_returns: string;
    best_environment: string;
    worst_environment: string;
    key_risks: string;
    suggested_improvements: string[];
    hedge_fund_classification: string;
  };
  regime_metrics: Record<string, { cagr: number; sharpe: number; n_days: number; pct_time: number } | null>;
  factor_attribution: Record<string, number>;
  equity_curve: Array<{ date: string; portfolio: number; benchmark: number }>;
  drawdown_series: Array<{ date: string; value: number }>;
  monthly_returns: Array<{ year: number; month: number; return_pct: number | null }>;
  annual_returns: Array<{ year: number; return_pct: number | null }>;
  rolling_sharpe: Array<{ date: string; value: number }>;
  rolling_vol: Array<{ date: string; value: number }>;
  walk_forward: Record<string, unknown> | null;
  monte_carlo: Record<string, unknown> | null;
  n_tickers: number;
  n_days: number;
}

// ── Signal catalogue ──────────────────────────────────────────────────────────

const TECHNICAL_FACTORS = [
  { id: "ma_crossover", label: "MA Crossover", desc: "Fast/slow moving average crossover" },
  { id: "rsi", label: "RSI", desc: "Relative Strength Index momentum" },
  { id: "macd", label: "MACD", desc: "MACD histogram trend momentum" },
  { id: "bollinger_bands", label: "Bollinger Bands %B", desc: "Price position within Bollinger Bands" },
  { id: "atr", label: "ATR (Low Vol)", desc: "Low ATR = tighter, quieter setup" },
  { id: "adx", label: "ADX", desc: "Average Directional Index — trend strength" },
  { id: "stochastic", label: "Stochastic", desc: "Stochastic %D oscillator" },
  { id: "donchian", label: "Donchian Channels", desc: "Price position within Donchian channel" },
  { id: "volume_breakout", label: "Volume Breakout", desc: "Volume surge on positive price move" },
  { id: "vwap", label: "VWAP", desc: "Price relative to rolling VWAP" },
];

const QUANT_FACTORS = [
  { id: "momentum_1m", label: "Momentum 1M", desc: "1-month price momentum" },
  { id: "momentum_3m", label: "Momentum 3M", desc: "3-month price momentum (skip 1M)" },
  { id: "momentum_6m", label: "Momentum 6M", desc: "6-month price momentum" },
  { id: "momentum_12m", label: "Momentum 12M", desc: "12-month price momentum" },
  { id: "relative_strength", label: "Relative Strength", desc: "Return relative to benchmark" },
  { id: "low_volatility", label: "Low Volatility", desc: "Prefer lower realized volatility stocks" },
  { id: "mean_reversion", label: "Mean Reversion", desc: "Buy below 20-day moving average" },
  { id: "low_beta", label: "Low Beta", desc: "Prefer lower market beta" },
  { id: "low_correlation", label: "Low Correlation", desc: "Prefer lower benchmark correlation" },
  { id: "earnings_momentum", label: "Earnings Momentum", desc: "Return acceleration proxy for earnings surprise" },
];

const REGIME_FILTERS = [
  { id: "bull_market", label: "Bull Market Only", desc: "SPY above 200-day SMA" },
  { id: "bear_market", label: "Bear Market Only", desc: "SPY below 200-day SMA" },
  { id: "low_volatility", label: "Low Volatility", desc: "VIX below 15" },
  { id: "high_volatility", label: "High Volatility", desc: "VIX above 25" },
  { id: "risk_on", label: "Risk-On", desc: "SPY above 50-SMA with positive trend" },
  { id: "risk_off", label: "Risk-Off", desc: "SPY below 50-SMA or negative trend" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct = (v: number | null | undefined, dec = 1) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
const num = (v: number | null | undefined, dec = 2) =>
  v == null ? "—" : v.toFixed(dec);
const clr = (v: number | null | undefined) =>
  v == null ? "text-text-muted" : v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-text-muted";

const GRADE_COLOR: Record<string, string> = {
  A: "text-emerald-400 border-emerald-400",
  B: "text-blue-400 border-blue-400",
  C: "text-amber-400 border-amber-400",
  D: "text-orange-400 border-orange-400",
  F: "text-red-400 border-red-400",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Main Component ─────────────────────────────────────────────────────────────

export default function StrategyBuilderPage() {
  // Strategy builder state
  const [factors, setFactors] = useState<Factor[]>([{ name: "momentum_12m", weight: 1 }]);
  const [regimeFilters, setRegimeFilters] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("2019-01-01");
  const [endDate, setEndDate] = useState("");
  const [nPositions, setNPositions] = useState(20);
  const [positionSizing, setPositionSizing] = useState("equal");
  const [rebalFreq, setRebalFreq] = useState("monthly");
  const [initialCapital, setInitialCapital] = useState(100000);
  const [leverage, setLeverage] = useState(1.0);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [trailingStop, setTrailingStop] = useState("");
  const [txCostBps, setTxCostBps] = useState(10);
  const [slippageBps, setSlippageBps] = useState(5);
  const [strategyName, setStrategyName] = useState("My Strategy");
  // Walk-forward
  const [wfEnabled, setWfEnabled] = useState(false);
  const [wfTrain, setWfTrain] = useState(24);
  const [wfTest, setWfTest] = useState(6);
  // Monte Carlo
  const [mcEnabled, setMcEnabled] = useState(false);
  const [mcSims, setMcSims] = useState(1000);
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const addFactor = (id: string) => {
    if (factors.find(f => f.name === id)) return;
    setFactors(prev => [...prev, { name: id, weight: 1 }]);
  };
  const removeFactor = (id: string) => setFactors(prev => prev.filter(f => f.name !== id));
  const updateWeight = (id: string, w: number) =>
    setFactors(prev => prev.map(f => f.name === id ? { ...f, weight: w } : f));
  const toggleRegime = (id: string) =>
    setRegimeFilters(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);

  const run = useCallback(async () => {
    if (factors.length === 0) { setError("Add at least one factor."); return; }
    setLoading(true);
    setError("");
    try {
      const body = {
        name: strategyName,
        factors: factors.map(f => ({ name: f.name, weight: f.weight })),
        regime_filters: regimeFilters,
        start_date: startDate,
        end_date: endDate || undefined,
        n_positions: nPositions,
        position_sizing: positionSizing,
        rebalance_frequency: rebalFreq,
        initial_capital: initialCapital,
        leverage,
        stop_loss: stopLoss ? parseFloat(stopLoss) / 100 : undefined,
        take_profit: takeProfit ? parseFloat(takeProfit) / 100 : undefined,
        trailing_stop: trailingStop ? parseFloat(trailingStop) / 100 : undefined,
        transaction_cost_bps: txCostBps,
        slippage_bps: slippageBps,
        walk_forward: { enabled: wfEnabled, train_months: wfTrain, test_months: wfTest },
        monte_carlo: { enabled: mcEnabled, n_simulations: mcSims, horizon_days: 252 },
      };
      const res = await fetch("/api/strategy/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Backtest failed");
      setResult(data);
      setActiveTab("overview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [factors, regimeFilters, startDate, endDate, nPositions, positionSizing, rebalFreq,
      initialCapital, leverage, stopLoss, takeProfit, trailingStop, txCostBps, slippageBps,
      wfEnabled, wfTrain, wfTest, mcEnabled, mcSims, strategyName]);

  const allFactorIds = [...TECHNICAL_FACTORS, ...QUANT_FACTORS].reduce(
    (acc, f) => { acc[f.id] = f.label; return acc; }, {} as Record<string, string>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Strategy Builder</h1>
        <p className="text-xs text-text-muted mt-0.5">
          Build multi-factor strategies · Backtest · Walk-forward · Monte Carlo · AI insights
        </p>
      </div>

      <div className="grid grid-cols-[340px_1fr] gap-6 items-start">
        {/* ── Left Panel: Builder ───────────────────────────────────── */}
        <div className="space-y-4">
          {/* Strategy Name */}
          <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Strategy</h2>
            <input
              value={strategyName}
              onChange={e => setStrategyName(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder="Strategy name"
            />
          </div>

          {/* Technical Factors */}
          <FactorPanel
            title="Technical Factors"
            factors={TECHNICAL_FACTORS}
            selected={factors}
            onAdd={addFactor}
            onRemove={removeFactor}
            onWeightChange={updateWeight}
            allLabels={allFactorIds}
          />

          {/* Quant Factors */}
          <FactorPanel
            title="Quantitative Factors"
            factors={QUANT_FACTORS}
            selected={factors}
            onAdd={addFactor}
            onRemove={removeFactor}
            onWeightChange={updateWeight}
            allLabels={allFactorIds}
          />

          {/* Regime Filters */}
          <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Market Regime Filters</h2>
            <div className="space-y-1.5">
              {REGIME_FILTERS.map(rf => (
                <button
                  key={rf.id}
                  onClick={() => toggleRegime(rf.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded text-xs transition-colors",
                    regimeFilters.includes(rf.id)
                      ? "bg-accent/20 border border-accent/40 text-accent"
                      : "bg-background border border-border text-text-muted hover:text-text-primary hover:border-border"
                  )}
                >
                  <span className="font-medium">{rf.label}</span>
                  <span className="ml-2 opacity-60">{rf.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Simulation Settings */}
          <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Simulation</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Date">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
              </Field>
              <Field label="End Date">
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
              </Field>
              <Field label="Positions">
                <input type="number" min={1} max={100} value={nPositions} onChange={e => setNPositions(+e.target.value)}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
              </Field>
              <Field label="Rebalance">
                <select value={rebalFreq} onChange={e => setRebalFreq(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
              <Field label="Position Sizing">
                <select value={positionSizing} onChange={e => setPositionSizing(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent col-span-2">
                  <option value="equal">Equal Weight</option>
                  <option value="signal_weighted">Signal Weighted</option>
                  <option value="vol_target">Vol Targeted</option>
                </select>
              </Field>
              <Field label="Tx Cost (bps)">
                <input type="number" min={0} max={100} value={txCostBps} onChange={e => setTxCostBps(+e.target.value)}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
              </Field>
              <Field label="Slippage (bps)">
                <input type="number" min={0} max={100} value={slippageBps} onChange={e => setSlippageBps(+e.target.value)}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
              </Field>
            </div>

            {/* Advanced */}
            <button onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
              {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Advanced Settings
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Field label="Leverage">
                  <input type="number" min={1} max={5} step={0.1} value={leverage} onChange={e => setLeverage(+e.target.value)}
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
                </Field>
                <Field label="Stop Loss %">
                  <input type="number" min={0} max={50} step={0.5} value={stopLoss} onChange={e => setStopLoss(e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
                </Field>
                <Field label="Take Profit %">
                  <input type="number" min={0} max={200} step={1} value={takeProfit} onChange={e => setTakeProfit(e.target.value)}
                    placeholder="e.g. 20"
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
                </Field>
                <Field label="Trailing Stop %">
                  <input type="number" min={0} max={50} step={0.5} value={trailingStop} onChange={e => setTrailingStop(e.target.value)}
                    placeholder="e.g. 8"
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
                </Field>
              </div>
            )}
          </div>

          {/* Walk-Forward & Monte Carlo */}
          <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Advanced Analysis</h2>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={wfEnabled} onChange={e => setWfEnabled(e.target.checked)}
                  className="accent-accent" />
                <span className="text-xs text-text-primary">Walk-Forward Analysis</span>
              </label>
              {wfEnabled && (
                <div className="grid grid-cols-2 gap-3 pl-5">
                  <Field label="Train (months)">
                    <input type="number" min={6} max={60} value={wfTrain} onChange={e => setWfTrain(+e.target.value)}
                      className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
                  </Field>
                  <Field label="Test (months)">
                    <input type="number" min={1} max={24} value={wfTest} onChange={e => setWfTest(+e.target.value)}
                      className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent" />
                  </Field>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={mcEnabled} onChange={e => setMcEnabled(e.target.checked)}
                  className="accent-accent" />
                <span className="text-xs text-text-primary">Monte Carlo Simulation</span>
              </label>
              {mcEnabled && (
                <div className="pl-5">
                  <Field label="Simulations">
                    <select value={mcSims} onChange={e => setMcSims(+e.target.value)}
                      className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent">
                      <option value={500}>500</option>
                      <option value={1000}>1,000</option>
                      <option value={2000}>2,000</option>
                    </select>
                  </Field>
                </div>
              )}
            </div>
          </div>

          {/* Run Button */}
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">{error}</div>
          )}
          <button
            onClick={run}
            disabled={loading || factors.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-accent text-white font-semibold text-sm py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Play size={14} />
            {loading ? "Running Backtest…" : "Run Backtest"}
          </button>
        </div>

        {/* ── Right Panel: Results ──────────────────────────────────── */}
        <div>
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center h-96 text-text-muted border border-dashed border-border rounded-lg">
              <BarChart2 size={40} className="mb-4 opacity-30" />
              <p className="text-sm">Configure your strategy and click Run Backtest</p>
              <p className="text-xs mt-1 opacity-60">Select factors → Set simulation parameters → Run</p>
            </div>
          )}
          {loading && (
            <div className="flex flex-col items-center justify-center h-96 text-text-muted">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm">Running backtest…</p>
              <p className="text-xs mt-1 opacity-60">Computing signals across {nPositions} positions</p>
            </div>
          )}
          {result && !loading && (
            <ResultsPanel
              result={result}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              allFactorIds={allFactorIds}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-Components ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-text-muted uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function FactorPanel({ title, factors: catalogue, selected, onAdd, onRemove, onWeightChange, allLabels }:
  { title: string; factors: typeof TECHNICAL_FACTORS; selected: Factor[];
    onAdd: (id: string) => void; onRemove: (id: string) => void;
    onWeightChange: (id: string, w: number) => void; allLabels: Record<string, string> }) {

  const [open, setOpen] = useState(false);
  const selectedIds = new Set(selected.map(f => f.name));
  const catSelected = selected.filter(f => catalogue.find(c => c.id === f.name));

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">{title}</h2>

      {/* Selected factors */}
      {catSelected.length > 0 && (
        <div className="space-y-2">
          {catSelected.map(f => (
            <div key={f.name} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-text-primary truncate">{allLabels[f.name] || f.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-text-muted">w:</span>
                <input
                  type="number" min={-5} max={5} step={0.5} value={f.weight}
                  onChange={e => onWeightChange(f.name, parseFloat(e.target.value) || 1)}
                  className="w-14 bg-background border border-border rounded px-1.5 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
                />
                <button onClick={() => onRemove(f.name)}
                  className="text-text-muted hover:text-red-400 transition-colors">
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add factor */}
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-accent hover:opacity-80">
        <Plus size={12} />
        Add {title.split(" ")[0]} Factor
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {open && (
        <div className="space-y-1 border-t border-border pt-2">
          {catalogue.map(f => (
            <button
              key={f.id}
              onClick={() => { onAdd(f.id); setOpen(false); }}
              disabled={selectedIds.has(f.id)}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded text-xs transition-colors",
                selectedIds.has(f.id)
                  ? "text-text-muted opacity-40 cursor-not-allowed"
                  : "text-text-primary hover:bg-surface-2"
              )}
            >
              <span className="font-medium">{f.label}</span>
              <span className="ml-2 text-text-muted">{f.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultsPanel({ result, activeTab, setActiveTab, allFactorIds }:
  { result: BacktestResult; activeTab: string; setActiveTab: (t: string) => void; allFactorIds: Record<string, string> }) {

  const m = result.metrics;
  const g = result.grade;

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart2 },
    { id: "charts", label: "Charts", icon: TrendingUp },
    { id: "returns", label: "Returns", icon: Activity },
    { id: "risk", label: "Risk", icon: Shield },
    { id: "regime", label: "Regime", icon: Target },
    ...(result.walk_forward ? [{ id: "walkforward", label: "Walk-Forward", icon: GitBranch }] : []),
    ...(result.monte_carlo ? [{ id: "montecarlo", label: "Monte Carlo", icon: Shuffle }] : []),
    { id: "insights", label: "AI Insights", icon: Zap },
  ];

  return (
    <div className="space-y-4">
      {/* Grade Banner */}
      <div className="bg-surface border border-border rounded-lg p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Strategy Grade</div>
          <div className="text-2xl font-bold text-text-primary">{result.strategy_name}</div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className={cn("text-4xl font-bold border-2 rounded-lg w-16 h-16 flex items-center justify-center", GRADE_COLOR[g.grade] || "text-text-muted border-border")}>
              {g.grade}
            </div>
            <div className="text-xs text-text-muted mt-1">{g.score}/100</div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <KpiMini label="CAGR" value={pct(m.cagr)} positive={m.cagr != null && m.cagr > 0} />
            <KpiMini label="Sharpe" value={num(m.sharpe)} positive={m.sharpe != null && m.sharpe > 1} />
            <KpiMini label="Max DD" value={pct(m.max_drawdown)} positive={false} />
            <KpiMini label="Win Rate" value={pct(m.win_rate_monthly)} positive={m.win_rate_monthly != null && m.win_rate_monthly > 0.5} />
          </div>
        </div>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="space-y-2">
          {result.warnings.slice(0, 3).map((w, i) => (
            <div key={i} className={cn(
              "flex items-start gap-2 px-3 py-2 rounded text-xs border",
              w.severity === "high" ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"
            )}>
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {w.message}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs whitespace-nowrap transition-colors",
              activeTab === t.id ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-primary hover:bg-surface-2"
            )}>
            <t.icon size={11} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && <OverviewTab result={result} />}
      {activeTab === "charts" && <ChartsTab result={result} />}
      {activeTab === "returns" && <ReturnsTab result={result} />}
      {activeTab === "risk" && <RiskTab result={result} />}
      {activeTab === "regime" && <RegimeTab result={result} />}
      {activeTab === "walkforward" && result.walk_forward && <WalkForwardTab wf={result.walk_forward as any} />}
      {activeTab === "montecarlo" && result.monte_carlo && <MonteCarloTab mc={result.monte_carlo as any} />}
      {activeTab === "insights" && <InsightsTab result={result} />}
    </div>
  );
}

function KpiMini({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div>
      <div className="text-text-muted">{label}</div>
      <div className={positive ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>{value}</div>
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ result }: { result: BacktestResult }) {
  const m = result.metrics;
  const kpis = [
    { label: "Total Return", value: pct(m.total_return), positive: (m.total_return || 0) > 0 },
    { label: "CAGR", value: pct(m.cagr), positive: (m.cagr || 0) > 0 },
    { label: "Volatility", value: pct(m.volatility), positive: false },
    { label: "Sharpe Ratio", value: num(m.sharpe), positive: (m.sharpe || 0) > 1 },
    { label: "Sortino Ratio", value: num(m.sortino), positive: (m.sortino || 0) > 1 },
    { label: "Calmar Ratio", value: num(m.calmar), positive: (m.calmar || 0) > 0.5 },
    { label: "Max Drawdown", value: pct(m.max_drawdown), positive: false },
    { label: "Beta", value: num(m.beta), positive: (m.beta || 0) < 1 },
    { label: "Alpha (ann.)", value: pct(m.alpha), positive: (m.alpha || 0) > 0 },
    { label: "Info Ratio", value: num(m.information_ratio), positive: (m.information_ratio || 0) > 0.3 },
    { label: "Win Rate (mo.)", value: pct(m.win_rate_monthly), positive: (m.win_rate_monthly || 0) > 0.5 },
    { label: "Profit Factor", value: num(m.profit_factor), positive: (m.profit_factor || 0) > 1.5 },
  ];

  // Grade breakdown
  const g = result.grade;
  const gradeItems = Object.entries(g.breakdown).filter(([, v]) => v != null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-surface border border-border rounded-lg p-3">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{k.label}</div>
            <div className={cn("text-lg font-semibold", k.positive ? "text-emerald-400" : k.value === "—" ? "text-text-muted" : "text-red-400")}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Grade breakdown */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Grade Breakdown</h3>
        <div className="space-y-2">
          {gradeItems.map(([key, val]) => {
            const maxes: Record<string, number> = { sharpe: 25, drawdown: 20, consistency: 20, calmar: 15, out_of_sample: 20 };
            const max = maxes[key] || 20;
            const pctVal = ((val as number) / max) * 100;
            return (
              <div key={key} className="flex items-center gap-3">
                <div className="w-28 text-xs text-text-muted capitalize">{key.replace(/_/g, " ")}</div>
                <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${pctVal}%` }} />
                </div>
                <div className="w-12 text-right text-xs text-text-primary">{val}/{max}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-xs text-text-muted">Total: {g.score}/100 — Grade {g.grade}</div>
      </div>

      {/* Factor Attribution */}
      {result.factor_attribution && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Factor Attribution (ann.)</h3>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(result.factor_attribution).map(([k, v]) => (
              <div key={k} className="text-xs">
                <div className="text-text-muted capitalize">{k.replace(/_/g, " ")}</div>
                <div className={clr(v as number)}>{pct(v as number)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Charts ───────────────────────────────────────────────────────────────

function ChartsTab({ result }: { result: BacktestResult }) {
  const equityData = result.equity_curve.map(d => ({
    date: d.date,
    Portfolio: d.portfolio != null ? +(d.portfolio * 100 - 100).toFixed(2) : null,
    Benchmark: d.benchmark != null ? +(d.benchmark * 100 - 100).toFixed(2) : null,
  }));

  const ddData = result.drawdown_series.map(d => ({
    date: d.date,
    Drawdown: d.value != null ? +(d.value * 100).toFixed(2) : null,
  }));

  const sharpeData = result.rolling_sharpe.map(d => ({
    date: d.date,
    Sharpe: d.value != null ? +d.value.toFixed(2) : null,
  }));

  const volData = result.rolling_vol.map(d => ({
    date: d.date,
    Vol: d.value != null ? +(d.value * 100).toFixed(2) : null,
  }));

  return (
    <div className="space-y-4">
      <ChartCard title="Equity Curve" subtitle="% return vs benchmark">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={equityData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 11 }}
              formatter={(v: number) => [`${v?.toFixed(1)}%`]} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="Portfolio" stroke="#6366f1" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Benchmark" stroke="#6b6b80" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Drawdown" subtitle="% from peak">
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={ddData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 11 }}
              formatter={(v: number) => [`${v?.toFixed(2)}%`]} />
            <Area type="monotone" dataKey="Drawdown" stroke="#ef4444" fill="#ef444420" dot={false} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-2 gap-4">
        <ChartCard title="Rolling Sharpe" subtitle="252-day rolling">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={sharpeData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} />
              <Tooltip contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#2a2a38" />
              <ReferenceLine y={1} stroke="#6366f1" strokeDasharray="3 3" opacity={0.5} />
              <Line type="monotone" dataKey="Sharpe" stroke="#6366f1" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Rolling Volatility" subtitle="63-day annualized">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={volData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 11 }}
                formatter={(v: number) => [`${v?.toFixed(1)}%`]} />
              <Line type="monotone" dataKey="Vol" stroke="#f59e0b" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

// ── Tab: Returns ──────────────────────────────────────────────────────────────

function ReturnsTab({ result }: { result: BacktestResult }) {
  const years = Array.from(new Set(result.monthly_returns.map(r => r.year))).sort();
  const byYear: Record<number, Record<number, number | null>> = {};
  for (const r of result.monthly_returns) {
    if (!byYear[r.year]) byYear[r.year] = {};
    byYear[r.year][r.month] = r.return_pct;
  }

  const getColor = (v: number | null | undefined) => {
    if (v == null) return "bg-surface text-text-muted";
    if (v > 0.05) return "bg-emerald-500/60 text-emerald-100";
    if (v > 0.02) return "bg-emerald-500/30 text-emerald-300";
    if (v > 0) return "bg-emerald-500/15 text-emerald-400";
    if (v > -0.02) return "bg-red-500/15 text-red-400";
    if (v > -0.05) return "bg-red-500/30 text-red-300";
    return "bg-red-500/60 text-red-100";
  };

  const annualData = result.annual_returns.map(r => ({
    year: String(r.year),
    Return: r.return_pct != null ? +(r.return_pct * 100).toFixed(1) : null,
    fill: (r.return_pct || 0) >= 0 ? "#22c55e" : "#ef4444",
  }));

  return (
    <div className="space-y-4">
      {/* Annual returns bar chart */}
      <ChartCard title="Annual Returns" subtitle="">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={annualData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 11 }}
              formatter={(v: number) => [`${v?.toFixed(1)}%`]} />
            <ReferenceLine y={0} stroke="#2a2a38" />
            <Bar dataKey="Return" radius={[3, 3, 0, 0]}>
              {annualData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Monthly heatmap */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Monthly Returns Heatmap</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left text-text-muted py-1 pr-3 font-normal">Year</th>
                {MONTHS.map(m => (
                  <th key={m} className="text-center text-text-muted py-1 px-1 font-normal w-12">{m}</th>
                ))}
                <th className="text-center text-text-muted py-1 pl-2 font-normal">Ann.</th>
              </tr>
            </thead>
            <tbody>
              {years.map(year => {
                const annRet = result.annual_returns.find(r => r.year === year)?.return_pct;
                return (
                  <tr key={year}>
                    <td className="text-text-muted pr-3 py-0.5">{year}</td>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(month => {
                      const v = byYear[year]?.[month];
                      return (
                        <td key={month} className="px-0.5 py-0.5">
                          <div className={cn("text-center rounded py-1 text-[10px] tabular-nums", getColor(v))}>
                            {v != null ? pct(v, 0) : "—"}
                          </div>
                        </td>
                      );
                    })}
                    <td className={cn("pl-2 text-center font-medium", clr(annRet))}>
                      {pct(annRet, 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trade stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Win Rate", value: pct(result.metrics.win_rate_monthly), },
          { label: "Profit Factor", value: num(result.metrics.profit_factor) },
          { label: "Expectancy", value: pct(result.metrics.expectancy) },
          { label: "Avg Win", value: pct(result.metrics.avg_win_monthly) },
          { label: "Avg Loss", value: pct(result.metrics.avg_loss_monthly) },
          { label: "Payoff Ratio", value: num(result.metrics.payoff_ratio) },
          { label: "Max Consec Wins", value: String(result.metrics.max_consecutive_wins ?? "—") },
          { label: "Max Consec Loss", value: String(result.metrics.max_consecutive_losses ?? "—") },
          { label: "Skewness", value: num(result.metrics.skewness) },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-border rounded-lg p-3">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">{item.label}</div>
            <div className="text-sm font-semibold text-text-primary mt-1">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Risk ─────────────────────────────────────────────────────────────────

function RiskTab({ result }: { result: BacktestResult }) {
  const m = result.metrics;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Volatility (ann.)", value: pct(m.volatility) },
          { label: "Max Drawdown", value: pct(m.max_drawdown) },
          { label: "DD Duration", value: `${m.max_dd_duration_days}d` },
          { label: "Downside Dev", value: pct(m.downside_deviation) },
          { label: "Ulcer Index", value: pct(m.ulcer_index) },
          { label: "VaR 95%", value: pct(m.var_95) },
          { label: "CVaR 95%", value: pct(m.cvar_95) },
          { label: "Kurtosis", value: num(m.kurtosis) },
          { label: "Skewness", value: num(m.skewness) },
          { label: "Beta", value: num(m.beta) },
          { label: "Tracking Error", value: pct(m.tracking_error) },
          { label: "Active Return", value: pct(m.active_return) },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-border rounded-lg p-3">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{item.label}</div>
            <div className="text-base font-semibold text-text-primary">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Drawdown chart */}
      <ChartCard title="Underwater Chart (Drawdown)" subtitle="">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={result.drawdown_series.map(d => ({ date: d.date, DD: d.value != null ? +(d.value * 100).toFixed(2) : null }))}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 11 }}
              formatter={(v: number) => [`${v?.toFixed(2)}%`]} />
            <Area type="monotone" dataKey="DD" stroke="#ef4444" fill="#ef444420" dot={false} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ── Tab: Regime ───────────────────────────────────────────────────────────────

function RegimeTab({ result }: { result: BacktestResult }) {
  const rm = result.regime_metrics;
  const labels: Record<string, string> = {
    bull_market: "Bull Market",
    bear_market: "Bear Market",
    high_volatility: "High Volatility",
    low_volatility: "Low Volatility",
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(rm).map(([key, val]) => (
          <div key={key} className="bg-surface border border-border rounded-lg p-4">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              {labels[key] || key}
            </h3>
            {val ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-text-muted">CAGR</div>
                  <div className={cn("text-lg font-semibold", clr(val.cagr))}>{pct(val.cagr)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">Sharpe</div>
                  <div className={cn("text-lg font-semibold", val.sharpe > 0 ? "text-emerald-400" : "text-red-400")}>{num(val.sharpe)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">% of Time</div>
                  <div className="text-sm text-text-primary">{pct(val.pct_time, 0)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted">Trading Days</div>
                  <div className="text-sm text-text-primary">{val.n_days}</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-text-muted">Insufficient data for this regime</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Walk-Forward ─────────────────────────────────────────────────────────

function WalkForwardTab({ wf }: { wf: Record<string, unknown> }) {
  if (wf.error) return <div className="text-sm text-red-400">{String(wf.error)}</div>;
  const windows = (wf.window_results as any[]) || [];

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Windows", value: String(wf.n_windows) },
          { label: "Avg IS Sharpe", value: num(wf.avg_is_sharpe as number) },
          { label: "Avg OOS Sharpe", value: num(wf.avg_oos_sharpe as number) },
          { label: "Sharpe Degradation", value: num(wf.sharpe_degradation as number) },
          { label: "OOS CAGR", value: pct((wf.oos_metrics as any)?.cagr) },
          { label: "OOS Sharpe", value: num((wf.oos_metrics as any)?.sharpe) },
          { label: "OOS Max DD", value: pct((wf.oos_metrics as any)?.max_drawdown) },
          { label: "% Windows Positive", value: pct(wf.pct_windows_positive as number) },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-border rounded-lg p-3">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{item.label}</div>
            <div className="text-sm font-semibold text-text-primary">{item.value}</div>
          </div>
        ))}
      </div>

      {/* OOS equity curve */}
      {(wf.oos_equity_curve as any[])?.length > 0 && (
        <ChartCard title="OOS Equity Curve (Out-of-Sample periods)" subtitle="">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={(wf.oos_equity_curve as any[]).map(d => ({ date: d.date, OOS: d.value != null ? +((d.value - 1) * 100).toFixed(2) : null }))}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 11 }} />
              <Line type="monotone" dataKey="OOS" stroke="#6366f1" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Window table */}
      <div className="bg-surface border border-border rounded-lg p-4 overflow-x-auto">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Window Results</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-text-muted border-b border-border">
              {["Win", "Train", "Test", "IS Sharpe", "IS CAGR", "OOS Sharpe", "OOS CAGR", "OOS DD"].map(h => (
                <th key={h} className="text-left py-1.5 pr-4 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {windows.map((w: any) => (
              <tr key={w.window} className="border-b border-border/50">
                <td className="py-1.5 pr-4 text-text-muted">{w.window}</td>
                <td className="py-1.5 pr-4 text-text-muted">{w.train_start} → {w.train_end}</td>
                <td className="py-1.5 pr-4 text-text-muted">{w.test_start} → {w.test_end}</td>
                <td className="py-1.5 pr-4">{num(w.is_sharpe)}</td>
                <td className={cn("py-1.5 pr-4", clr(w.is_cagr))}>{pct(w.is_cagr)}</td>
                <td className={cn("py-1.5 pr-4 font-medium", (w.oos_sharpe || 0) > 0 ? "text-emerald-400" : "text-red-400")}>{num(w.oos_sharpe)}</td>
                <td className={cn("py-1.5 pr-4 font-medium", clr(w.oos_cagr))}>{pct(w.oos_cagr)}</td>
                <td className="py-1.5 pr-4 text-red-400">{pct(w.oos_max_dd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Monte Carlo ──────────────────────────────────────────────────────────

function MonteCarloTab({ mc }: { mc: Record<string, unknown> }) {
  if (mc.error) return <div className="text-sm text-red-400">{String(mc.error)}</div>;
  const stats = mc.statistics as Record<string, number>;
  const hist = (mc.histogram as any[]) || [];
  const pctPaths = mc.percentile_paths as Record<string, number[]>;

  const pathData = pctPaths?.p50?.map((v: number, i: number) => ({
    day: i,
    p5: pctPaths.p5?.[i] != null ? +((pctPaths.p5[i] - 1) * 100).toFixed(1) : null,
    p25: pctPaths.p25?.[i] != null ? +((pctPaths.p25[i] - 1) * 100).toFixed(1) : null,
    p50: v != null ? +((v - 1) * 100).toFixed(1) : null,
    p75: pctPaths.p75?.[i] != null ? +((pctPaths.p75[i] - 1) * 100).toFixed(1) : null,
    p95: pctPaths.p95?.[i] != null ? +((pctPaths.p95[i] - 1) * 100).toFixed(1) : null,
  })) || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Expected Return", value: pct(stats?.expected_return) },
          { label: "Median Return", value: pct(stats?.median_return) },
          { label: "Std Dev", value: pct(stats?.std_return) },
          { label: "P(Profit)", value: pct(stats?.prob_profit) },
          { label: "P(Loss >10%)", value: pct(stats?.prob_loss_10pct) },
          { label: "P(Loss >20%)", value: pct(stats?.prob_loss_20pct) },
          { label: "P(Gain >20%)", value: pct(stats?.prob_gain_20pct) },
          { label: "P(Gain >50%)", value: pct(stats?.prob_gain_50pct) },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-border rounded-lg p-3">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{item.label}</div>
            <div className="text-sm font-semibold text-text-primary">{item.value}</div>
          </div>
        ))}
      </div>

      <ChartCard title={`Monte Carlo — ${mc.n_simulations} Simulations · ${mc.horizon_days}-day horizon`} subtitle="Percentile bands">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={pathData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 11 }}
              formatter={(v: number) => [`${v?.toFixed(1)}%`]} />
            <Area type="monotone" dataKey="p95" stroke="none" fill="#6366f120" />
            <Area type="monotone" dataKey="p75" stroke="none" fill="#6366f130" />
            <Area type="monotone" dataKey="p50" stroke="#6366f1" fill="#6366f115" strokeWidth={2} />
            <Area type="monotone" dataKey="p25" stroke="none" fill="#ef444420" />
            <Area type="monotone" dataKey="p5" stroke="none" fill="#ef444415" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Return distribution histogram */}
      <ChartCard title="Return Distribution" subtitle="1-year simulated returns">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={hist.filter((_: any, i: number) => i % 2 === 0)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" vertical={false} />
            <XAxis dataKey="bin_center" tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false}
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
            <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false} />
            <Tooltip contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 11 }} />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              {hist.filter((_: any, i: number) => i % 2 === 0).map((entry: any, i: number) => (
                <Cell key={i} fill={(entry.bin_center || 0) >= 0 ? "#22c55e" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ── Tab: AI Insights ──────────────────────────────────────────────────────────

function InsightsTab({ result }: { result: BacktestResult }) {
  const ins = result.insights;
  return (
    <div className="space-y-4">
      {/* Classification banner */}
      <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Star size={16} className="text-accent mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">Hedge Fund Style Classification</div>
            <p className="text-sm text-text-primary">{ins.hedge_fund_classification}</p>
          </div>
        </div>
      </div>

      {/* Insight cards */}
      {[
        { icon: TrendingUp, label: "What Drove Returns?", text: ins.what_drove_returns, color: "text-emerald-400" },
        { icon: Target, label: "Best Market Environment", text: ins.best_environment, color: "text-blue-400" },
        { icon: TrendingDown, label: "Worst Market Environment", text: ins.worst_environment, color: "text-amber-400" },
        { icon: Shield, label: "Key Risks", text: ins.key_risks, color: "text-red-400" },
      ].map(item => (
        <div key={item.label} className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <item.icon size={13} className={item.color} />
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">{item.label}</span>
          </div>
          <p className="text-sm text-text-primary">{item.text}</p>
        </div>
      ))}

      {/* Suggested improvements */}
      {ins.suggested_improvements?.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} className="text-accent" />
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Suggested Improvements</span>
          </div>
          <ul className="space-y-2">
            {ins.suggested_improvements.map((s: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                <span className="text-accent mt-0.5">→</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings detail */}
      {result.warnings.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={13} className="text-amber-400" />
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Strategy Warnings</span>
          </div>
          <div className="space-y-2">
            {result.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={cn("text-[10px] uppercase font-bold mt-0.5",
                  w.severity === "high" ? "text-red-400" : "text-amber-400")}>
                  {w.severity}
                </span>
                <span className="text-xs text-text-primary">{w.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared Chart Wrapper ──────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-xs font-semibold text-text-primary">{title}</h3>
        {subtitle && <span className="text-[10px] text-text-muted">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}
