"use client";
import { useState } from "react";
import {
  Search, TrendingUp, TrendingDown, Minus,
  Activity, BarChart3, Layers, Eye, Zap,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ComponentScores {
  obv: number;
  cmf: number;
  vwap: number;
  dark_pool: number;
  block_trades: number;
}

interface Signal {
  type: "bullish" | "bearish" | "neutral";
  text: string;
}

interface BlockDay {
  date: string;
  volume: number;
  vol_ratio: number;
  close: number;
  close_pct: number;
  type: "buying" | "selling";
  confidence: number;
}

interface SmartMoneyData {
  ticker: string;
  score: number;
  grade: string;
  color: string;
  label: string;
  components: ComponentScores;
  signals: Signal[];
  obv: { score: number; trend: string; divergence: number; latest_obv: number; series: number[] };
  cmf: { score: number; cmf: number; signal: string; series: number[] };
  vwap: { score: number; vwap: number; price: number; pct_diff: number; position: string };
  dark_pool: { score: number; signal: string; vol_price_impact: number; vol_consistency: number; large_print_ratio: number };
  block_trades: { score: number; block_days: number; buy_blocks: number; sell_blocks: number; buy_ratio: number; avg_vol_ratio: number; recent_blocks: BlockDay[] };
  price_series: number[];
  date_series: string[];
  spot: number;
  period_days: number;
  from_date: string;
  to_date: string;
}

interface CompareResult {
  ticker: string;
  score: number;
  grade: string;
  label: string;
  color: string;
  components: ComponentScores;
  signals: Signal[];
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ScoreGauge({ score, color, grade, label }: {
  score: number; color: string; grade: string; label: string;
}) {
  const cx = 110; const cy = 110; const r = 85;
  const angle = Math.PI - (score / 100) * Math.PI;
  const ex = cx + r * Math.cos(angle);
  const ey = cy - r * Math.sin(angle);

  // Tick marks at 0, 25, 50, 75, 100
  const ticks = [0, 25, 50, 75, 100].map((v) => {
    const a = Math.PI - (v / 100) * Math.PI;
    return {
      x1: cx + (r - 10) * Math.cos(a),
      y1: cy - (r - 10) * Math.sin(a),
      x2: cx + (r + 2)  * Math.cos(a),
      y2: cy - (r + 2)  * Math.sin(a),
      lx: cx + (r + 14) * Math.cos(a),
      ly: cy - (r + 14) * Math.sin(a),
      v,
    };
  });

  return (
    <div className="flex flex-col items-center">
      <svg width="220" height="130" viewBox="0 0 220 130">
        {/* Background track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="#1e2035" strokeWidth="18" strokeLinecap="round"
        />
        {/* Gradient score arc */}
        {score > 0 && (
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${score > 50 ? 1 : 0} 1 ${ex} ${ey}`}
            fill="none" stroke={color} strokeWidth="18" strokeLinecap="round"
          />
        )}
        {/* Tick marks */}
        {ticks.map((t) => (
          <line key={t.v} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke="#444" strokeWidth="2" />
        ))}
        {/* Score number */}
        <text x={cx} y={cy - 8} textAnchor="middle" fill="white"
          fontSize="36" fontWeight="bold" fontFamily="monospace">
          {score.toFixed(0)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#666" fontSize="13">
          / 100
        </text>
        {/* Grade badge */}
        <circle cx={cx} cy={cy + 36} r="18" fill={color + "22"} stroke={color} strokeWidth="1.5" />
        <text x={cx} y={cy + 41} textAnchor="middle" fill={color}
          fontSize="16" fontWeight="bold">
          {grade}
        </text>
      </svg>
      <p className="text-sm font-semibold mt-1 text-center" style={{ color }}>{label}</p>
    </div>
  );
}

const COMP_META: Record<string, { label: string; icon: React.ElementType; desc: string }> = {
  obv:          { label: "OBV Trend",     icon: TrendingUp, desc: "On-Balance Volume vs price" },
  cmf:          { label: "Chaikin MF",    icon: Activity,   desc: "Money-flow pressure 20d" },
  vwap:         { label: "VWAP",          icon: BarChart3,  desc: "Price vs institutional ref" },
  dark_pool:    { label: "Dark Pool",     icon: Eye,        desc: "Stealth accumulation signals" },
  block_trades: { label: "Block Trades",  icon: Layers,     desc: "Large-print buying evidence" },
};

function ComponentCard({ id, score, weight }: {
  id: keyof ComponentScores; score: number; weight: number;
}) {
  const meta = COMP_META[id];
  const Icon = meta.icon;
  const pct  = score;
  const fill =
    pct >= 65 ? "#00d97e" :
    pct >= 50 ? "#f5a623" :
    "#e84040";

  return (
    <div className="bg-surface-2 rounded-xl p-4 flex flex-col gap-3 border border-border hover:border-accent/40 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-accent" />
          <span className="text-xs font-semibold text-text-primary">{meta.label}</span>
        </div>
        <span className="text-xs text-text-muted">{(weight * 100).toFixed(0)}%</span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold" style={{ color: fill }}>{score.toFixed(0)}</span>
        <span className="text-xs text-text-muted mb-1">/100</span>
      </div>
      <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: fill }}
        />
      </div>
      <p className="text-xs text-text-muted leading-tight">{meta.desc}</p>
    </div>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  const cfg = {
    bullish: { icon: TrendingUp,   color: "#00d97e", bg: "#00d97e15" },
    bearish: { icon: TrendingDown, color: "#e84040", bg: "#e8404015" },
    neutral: { icon: Minus,        color: "#f5a623", bg: "#f5a62315" },
  }[signal.type];
  const Icon = cfg.icon;

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg" style={{ backgroundColor: cfg.bg }}>
      <Icon size={13} style={{ color: cfg.color }} className="mt-0.5 shrink-0" />
      <span className="text-xs text-text-primary leading-relaxed">{signal.text}</span>
    </div>
  );
}

// Normalise a series to [lo, hi] pixel range
function normSeries(arr: number[], lo: number, hi: number) {
  const mn = Math.min(...arr);
  const mx = Math.max(...arr);
  const rng = mx - mn || 1;
  return arr.map((v) => lo + ((v - mn) / rng) * (hi - lo));
}

function OBVChart({ prices, obvSeries, dates }: {
  prices: number[]; obvSeries: number[]; dates: string[];
}) {
  const W = 480; const H = 120; const PAD = 8;
  const n = prices.length;
  if (n < 2) return null;

  const px = normSeries(prices, H - PAD, PAD);
  const ov = normSeries(obvSeries, H - PAD, PAD);

  const pts = (arr: number[]) =>
    arr.map((y, i) => `${PAD + (i / (n - 1)) * (W - PAD * 2)},${y}`).join(" ");

  const pricePts = pts(px);
  const obvPts   = pts(ov);

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4c9fff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#4c9fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="obvGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00d97e" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#00d97e" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD} y1={PAD + f * (H - PAD * 2)}
            x2={W - PAD} y2={PAD + f * (H - PAD * 2)}
            stroke="#1e2035" strokeWidth="1" />
        ))}
        {/* OBV area */}
        <polyline points={obvPts} fill="none" stroke="#00d97e" strokeWidth="1.5" strokeOpacity="0.8" />
        {/* Price line */}
        <polyline points={pricePts} fill="none" stroke="#4c9fff" strokeWidth="2" />
        {/* Legend */}
        <rect x={W - 120} y={4} width="10" height="3" fill="#4c9fff" />
        <text x={W - 106} y={9} fill="#888" fontSize="8">Price</text>
        <rect x={W - 60} y={4} width="10" height="3" fill="#00d97e" />
        <text x={W - 46} y={9} fill="#888" fontSize="8">OBV</text>
      </svg>
    </div>
  );
}

function CMFChart({ series }: { series: number[] }) {
  const W = 480; const H = 90; const PAD = 10;
  const n = series.length;
  if (n < 2) return null;

  const zeroY  = PAD + (H - PAD * 2) / 2;
  const barW   = Math.max((W - PAD * 2) / n - 1, 1);
  const maxAbs = Math.max(...series.map(Math.abs), 0.01);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Zero line */}
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="#444" strokeWidth="1" />
      {series.map((v, i) => {
        const x   = PAD + i * ((W - PAD * 2) / n);
        const h   = Math.abs(v) / maxAbs * ((H - PAD * 2) / 2);
        const y   = v >= 0 ? zeroY - h : zeroY;
        const col = v >= 0 ? "#00d97e" : "#e84040";
        return <rect key={i} x={x} y={y} width={barW} height={h} fill={col} fillOpacity="0.75" />;
      })}
      {/* Labels */}
      <text x={PAD + 2} y={PAD + 8} fill="#888" fontSize="8">+{maxAbs.toFixed(2)}</text>
      <text x={PAD + 2} y={H - 4}   fill="#888" fontSize="8">-{maxAbs.toFixed(2)}</text>
    </svg>
  );
}

function DarkPoolBreakdown({ dp }: { dp: SmartMoneyData["dark_pool"] }) {
  const rows = [
    { label: "Vol/Price Impact",   value: dp.vol_price_impact,  desc: "Volume not moving price" },
    { label: "Vol Consistency",    value: dp.vol_consistency,   desc: "Sustained elevated volume" },
    { label: "Large Print Ratio",  value: dp.large_print_ratio, desc: "High vol, narrow range" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const fill =
          r.value >= 65 ? "#00d97e" :
          r.value >= 40 ? "#f5a623" : "#e84040";
        return (
          <div key={r.label}>
            <div className="flex justify-between mb-1">
              <span className="text-xs text-text-muted">{r.label}</span>
              <span className="text-xs font-mono" style={{ color: fill }}>{r.value.toFixed(0)}</span>
            </div>
            <div className="w-full h-1.5 bg-surface rounded-full">
              <div className="h-full rounded-full" style={{ width: `${r.value}%`, backgroundColor: fill }} />
            </div>
            <p className="text-xs text-text-muted mt-0.5">{r.desc}</p>
          </div>
        );
      })}
    </div>
  );
}

function BlockTable({ blocks }: { blocks: BlockDay[] }) {
  if (!blocks.length) {
    return <p className="text-xs text-text-muted text-center py-4">No significant block days detected in this period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-text-muted">
            {["Date", "Volume", "× Avg", "Close", "Close%", "Type", "Conf."].map((h) => (
              <th key={h} className="text-left pb-2 pr-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {blocks.map((b, i) => (
            <tr key={i} className="border-b border-border/40 hover:bg-surface-2">
              <td className="py-2 pr-4 font-mono text-text-muted">{b.date}</td>
              <td className="py-2 pr-4 font-mono">{(b.volume / 1e6).toFixed(2)}M</td>
              <td className="py-2 pr-4 font-mono text-accent">{b.vol_ratio}×</td>
              <td className="py-2 pr-4 font-mono">${b.close.toFixed(2)}</td>
              <td className="py-2 pr-4 font-mono">{b.close_pct.toFixed(0)}%</td>
              <td className="py-2 pr-4">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  b.type === "buying"
                    ? "bg-green-900/40 text-green-400"
                    : "bg-red-900/40 text-red-400"
                }`}>
                  {b.type === "buying" ? "Buy" : "Sell"}
                </span>
              </td>
              <td className="py-2">
                <span className={`font-mono ${
                  b.confidence >= 70 ? "text-green-400" :
                  b.confidence >= 50 ? "text-yellow-400" : "text-text-muted"
                }`}>
                  {b.confidence}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompareRow({ r, rank }: { r: CompareResult; rank: number }) {
  return (
    <div className="flex items-center gap-3 bg-surface-2 rounded-xl p-3 border border-border hover:border-accent/30 transition-colors">
      <span className="text-lg font-bold text-text-muted w-6 text-center">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-text-primary">{r.ticker}</span>
          <span className="text-xs px-1.5 py-0.5 rounded font-bold"
            style={{ color: r.color, backgroundColor: r.color + "22" }}>
            {r.grade}
          </span>
        </div>
        <p className="text-xs text-text-muted truncate">{r.label}</p>
        {r.signals[0] && (
          <p className="text-xs text-text-muted mt-0.5 truncate">
            {r.signals[0].text}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="text-2xl font-bold" style={{ color: r.color }}>{r.score.toFixed(0)}</div>
        <div className="text-xs text-text-muted">/ 100</div>
      </div>
      {/* Mini bar stack */}
      <div className="flex flex-col gap-0.5 w-20 shrink-0">
        {Object.entries(r.components).slice(0, 5).map(([k, v]) => (
          <div key={k} className="w-full h-1 bg-surface rounded-full overflow-hidden">
            <div className="h-full rounded-full"
              style={{
                width: `${v}%`,
                backgroundColor:
                  v >= 65 ? "#00d97e" :
                  v >= 50 ? "#f5a623" : "#e84040",
              }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: "30d",  value: 30 },
  { label: "60d",  value: 60 },
  { label: "90d",  value: 90 },
  { label: "180d", value: 180 },
];

const PRESETS = ["AAPL", "NVDA", "MSFT", "META", "AMZN", "TSLA", "GOOGL", "JPM", "SPY", "QQQ"];

export default function SmartMoneyPage() {
  const [tab, setTab]             = useState<"single" | "compare">("single");
  const [ticker, setTicker]       = useState("AAPL");
  const [period, setPeriod]       = useState(60);
  const [compareList, setCompare] = useState("AAPL,NVDA,MSFT,META,AMZN");
  const [loading, setLoading]     = useState(false);
  const [data, setData]           = useState<SmartMoneyData | null>(null);
  const [compareData, setCompareData] = useState<CompareResult[] | null>(null);
  const [error, setError]         = useState("");
  const [activeSection, setActiveSection] = useState<string>("obv");

  async function analyze() {
    setLoading(true); setError(""); setData(null);
    try {
      const res = await fetch(`${API}/api/smart-money/flow/${ticker.toUpperCase()}?period_days=${period}`);
      if (!res.ok) throw new Error((await res.json()).detail ?? "Request failed");
      setData(await res.json());
      setActiveSection("obv");
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function runCompare() {
    setLoading(true); setError(""); setCompareData(null);
    try {
      const syms = compareList.trim().toUpperCase();
      const res  = await fetch(`${API}/api/smart-money/compare?tickers=${encodeURIComponent(syms)}&period_days=${period}`);
      if (!res.ok) throw new Error((await res.json()).detail ?? "Request failed");
      const json = await res.json();
      setCompareData(json.results);
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const SECTIONS = [
    { id: "obv",          label: "OBV" },
    { id: "cmf",          label: "CMF" },
    { id: "vwap",         label: "VWAP" },
    { id: "dark_pool",    label: "Dark Pool" },
    { id: "block_trades", label: "Block Trades" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/20">
          <Zap size={20} className="text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Smart Money Flow</h1>
          <p className="text-sm text-text-muted">Institutional Accumulation Score — OBV · CMF · VWAP · Dark Pool · Block Trades</p>
        </div>
      </div>

      {/* Tab + Controls */}
      <div className="bg-surface-2 rounded-2xl border border-border p-4 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2">
          {(["single", "compare"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-accent text-black"
                  : "text-text-muted hover:text-text-primary hover:bg-surface"
              }`}>
              {t === "single" ? "Single Ticker" : "Compare Tickers"}
            </button>
          ))}
        </div>

        {tab === "single" ? (
          <div className="flex flex-wrap gap-3 items-end">
            {/* Ticker input */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Ticker</label>
              <div className="flex gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && analyze()}
                    placeholder="AAPL"
                    className="pl-8 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary w-28 focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>
            {/* Period */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Period</label>
              <div className="flex gap-1">
                {PERIODS.map((p) => (
                  <button key={p.value} onClick={() => setPeriod(p.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      period === p.value
                        ? "bg-accent text-black"
                        : "bg-surface text-text-muted hover:text-text-primary border border-border"
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Presets */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Quick picks</label>
              <div className="flex flex-wrap gap-1">
                {PRESETS.slice(0, 6).map((sym) => (
                  <button key={sym} onClick={() => { setTicker(sym); }}
                    className="px-2 py-1 rounded text-xs bg-surface border border-border text-text-muted hover:text-text-primary hover:border-accent/50 transition-colors">
                    {sym}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={analyze} disabled={loading}
              className="px-6 py-2 bg-accent text-black rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors ml-auto"
            >
              {loading ? "Analyzing…" : "Analyze"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1 flex-1 min-w-60">
              <label className="text-xs text-text-muted">Tickers (comma-separated, up to 10)</label>
              <input
                value={compareList}
                onChange={(e) => setCompare(e.target.value.toUpperCase())}
                placeholder="AAPL,NVDA,MSFT,META,AMZN"
                className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Period</label>
              <div className="flex gap-1">
                {PERIODS.map((p) => (
                  <button key={p.value} onClick={() => setPeriod(p.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      period === p.value
                        ? "bg-accent text-black"
                        : "bg-surface text-text-muted hover:text-text-primary border border-border"
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={runCompare} disabled={loading}
              className="px-6 py-2 bg-accent text-black rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Comparing…" : "Compare"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500/40 rounded-xl px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Single ticker result ── */}
      {tab === "single" && data && (
        <div className="space-y-6">
          {/* Hero row */}
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
            {/* Gauge */}
            <div className="bg-surface-2 rounded-2xl border border-border p-6 flex flex-col items-center justify-center gap-2 min-w-[260px]">
              <ScoreGauge
                score={data.score}
                color={data.color}
                grade={data.grade}
                label={data.label}
              />
              <div className="text-xs text-text-muted text-center mt-2">
                {data.ticker} · {data.from_date} → {data.to_date}
              </div>
              {data.spot > 0 && (
                <div className="text-lg font-bold text-text-primary">${data.spot.toFixed(2)}</div>
              )}
            </div>

            {/* Component grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
              {(Object.entries(data.components) as [keyof ComponentScores, number][]).map(([k, v]) => (
                <ComponentCard
                  key={k} id={k} score={v}
                  weight={(data.weights as any)[k] ?? 0.2}
                />
              ))}
            </div>
          </div>

          {/* Signals + OBV chart */}
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            {/* Signals */}
            <div className="bg-surface-2 rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Activity size={14} className="text-accent" />
                Key Signals
              </h3>
              <div className="space-y-2">
                {data.signals.map((s, i) => <SignalRow key={i} signal={s} />)}
              </div>
            </div>

            {/* OBV vs Price chart */}
            <div className="bg-surface-2 rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <TrendingUp size={14} className="text-accent" />
                  OBV vs Price (last {data.price_series.length} sessions)
                </h3>
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block" />Price</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-400 inline-block" />OBV</span>
                </div>
              </div>
              <OBVChart
                prices={data.price_series}
                obvSeries={data.obv.series}
                dates={data.date_series}
              />
              <div className="flex justify-between mt-2 text-xs text-text-muted">
                <span>OBV trend: <span className={
                  data.obv.score >= 60 ? "text-green-400" :
                  data.obv.score <= 40 ? "text-red-400" : "text-yellow-400"
                }>{data.obv.trend}</span></span>
                <span>Divergence: <span className="font-mono text-text-primary">
                  {data.obv.divergence > 0 ? "+" : ""}{data.obv.divergence.toFixed(3)}
                </span></span>
              </div>
            </div>
          </div>

          {/* Detail sections */}
          <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
            {/* Section tabs */}
            <div className="flex border-b border-border overflow-x-auto">
              {SECTIONS.map((s) => {
                const score = (data as any)[s.id === "dark_pool" ? "dark_pool" : s.id]?.score ?? 0;
                const col   =
                  score >= 65 ? "#00d97e" :
                  score >= 50 ? "#f5a623" : "#e84040";
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                      activeSection === s.id
                        ? "text-text-primary border-b-2 border-accent -mb-px"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {s.label}
                    <span className="text-xs font-bold" style={{ color: col }}>{score.toFixed(0)}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-5">
              {/* OBV */}
              {activeSection === "obv" && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted leading-relaxed">
                    OBV adds volume on up-days and subtracts on down-days. When OBV rises faster than
                    price, institutions are accumulating quietly. A divergence score above 0 means OBV is
                    leading price — the classic smart-money footprint.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "OBV Score",    value: `${data.obv.score.toFixed(0)}/100` },
                      { label: "Trend",        value: data.obv.trend },
                      { label: "Divergence",   value: `${data.obv.divergence > 0 ? "+" : ""}${data.obv.divergence.toFixed(3)}` },
                      { label: "Latest OBV",   value: (data.obv.latest_obv / 1e6).toFixed(1) + "M" },
                    ].map((m) => (
                      <div key={m.label} className="bg-surface rounded-xl p-3">
                        <p className="text-xs text-text-muted">{m.label}</p>
                        <p className="text-base font-bold text-text-primary mt-1">{m.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CMF */}
              {activeSection === "cmf" && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted leading-relaxed">
                    Chaikin Money Flow measures the cumulative volume-weighted close position within the
                    day's range. Values above +0.20 indicate strong institutional buying; below −0.20
                    signals distribution. The rolling 20-day window filters short-term noise.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                    {[
                      { label: "CMF Score",  value: `${data.cmf.score.toFixed(0)}/100` },
                      { label: "CMF Value",  value: `${data.cmf.cmf > 0 ? "+" : ""}${data.cmf.cmf.toFixed(4)}` },
                      { label: "Signal",     value: data.cmf.signal },
                    ].map((m) => (
                      <div key={m.label} className="bg-surface rounded-xl p-3">
                        <p className="text-xs text-text-muted">{m.label}</p>
                        <p className="text-base font-bold text-text-primary mt-1">{m.value}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-2">CMF History (20-session rolling)</p>
                    <CMFChart series={data.cmf.series} />
                  </div>
                </div>
              )}

              {/* VWAP */}
              {activeSection === "vwap" && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted leading-relaxed">
                    VWAP is the institutional reference price. Algo systems and large funds use VWAP
                    benchmarks to evaluate execution quality. Price trading above VWAP indicates the
                    institutional side is net long; holding near VWAP with rising volume signals
                    systematic accumulation near the mean.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "VWAP Score",  value: `${data.vwap.score.toFixed(0)}/100` },
                      { label: "VWAP",        value: `$${data.vwap.vwap.toFixed(2)}` },
                      { label: "Price",       value: `$${data.vwap.price.toFixed(2)}` },
                      { label: "Distance",    value: `${data.vwap.pct_diff > 0 ? "+" : ""}${data.vwap.pct_diff.toFixed(2)}%` },
                    ].map((m) => (
                      <div key={m.label} className="bg-surface rounded-xl p-3">
                        <p className="text-xs text-text-muted">{m.label}</p>
                        <p className="text-base font-bold text-text-primary mt-1">{m.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-surface rounded-xl p-4">
                    <p className="text-xs text-text-muted mb-1">VWAP Position</p>
                    <p className="text-sm font-semibold text-text-primary">{data.vwap.position}</p>
                    <p className="text-xs text-text-muted mt-2">
                      Optimal accumulation zone: 0.1%–3% above VWAP with rising volume.
                      Greater than 5% above VWAP risks over-extension and potential mean reversion.
                    </p>
                  </div>
                </div>
              )}

              {/* Dark Pool */}
              {activeSection === "dark_pool" && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted leading-relaxed">
                    Dark pools (Alternative Trading Systems) account for ~35–40% of US equity volume.
                    Institutions use them to accumulate large positions without tipping the market.
                    We detect their presence via three heuristics: high volume with low price impact,
                    sustained elevated volume (not retail spikes), and wide-volume / narrow-range days.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <div className="bg-surface rounded-xl p-4 mb-3">
                        <p className="text-xs text-text-muted">Composite Dark Pool Score</p>
                        <p className="text-3xl font-bold text-text-primary mt-1">
                          {data.dark_pool.score.toFixed(0)}
                          <span className="text-base text-text-muted font-normal"> / 100</span>
                        </p>
                        <p className="text-xs mt-1 font-medium" style={{ color: data.color }}>
                          {data.dark_pool.signal}
                        </p>
                      </div>
                      <div className="bg-surface rounded-xl p-4 text-xs text-text-muted leading-relaxed">
                        <strong className="text-text-primary">Methodology note:</strong> Real FINRA ATS
                        data requires paid feeds (Quandl, Bloomberg). These scores use publicly
                        observable price-volume heuristics that strongly correlate with dark pool
                        activity based on academic research (Foley &amp; Putniņš, 2016).
                      </div>
                    </div>
                    <div className="bg-surface rounded-xl p-4">
                      <p className="text-xs font-medium text-text-primary mb-3">Sub-indicator Breakdown</p>
                      <DarkPoolBreakdown dp={data.dark_pool} />
                    </div>
                  </div>
                </div>
              )}

              {/* Block Trades */}
              {activeSection === "block_trades" && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted leading-relaxed">
                    Block trades (≥10,000 shares or ≥$200,000) reveal institutional intent.
                    Days with volume significantly above average, closing in the upper half of range
                    with a controlled (not wide) day, are classified as block-buy days. Dominant
                    buy-side block activity is a powerful accumulation signal.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    {[
                      { label: "Block Score",   value: `${data.block_trades.score.toFixed(0)}/100` },
                      { label: "Total Days",    value: data.block_trades.block_days.toString() },
                      { label: "Buy / Sell",    value: `${data.block_trades.buy_blocks} / ${data.block_trades.sell_blocks}` },
                      { label: "Buy Ratio",     value: `${(data.block_trades.buy_ratio * 100).toFixed(0)}%` },
                    ].map((m) => (
                      <div key={m.label} className="bg-surface rounded-xl p-3">
                        <p className="text-xs text-text-muted">{m.label}</p>
                        <p className="text-base font-bold text-text-primary mt-1">{m.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-surface rounded-xl p-4">
                    <p className="text-xs font-medium text-text-primary mb-3">Recent Block Days (highest conviction)</p>
                    <BlockTable blocks={data.block_trades.recent_blocks} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Compare result ── */}
      {tab === "compare" && compareData && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">
              Institutional Accumulation Leaderboard — {period}d
            </h3>
            <span className="text-xs text-text-muted">{compareData.length} tickers ranked</span>
          </div>
          <div className="space-y-3">
            {compareData.map((r, i) => (
              <CompareRow key={r.ticker} r={r} rank={i + 1} />
            ))}
          </div>
          {/* Legend */}
          <div className="flex gap-4 text-xs text-text-muted pt-2">
            <span>Mini bars (left→right): OBV · CMF · VWAP · Dark Pool · Block Trades</span>
            <span className="text-green-400">■ ≥65</span>
            <span className="text-yellow-400">■ 50–64</span>
            <span className="text-red-400">■ &lt;50</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!data && !compareData && !loading && !error && (
        <div className="bg-surface-2 rounded-2xl border border-border p-12 text-center">
          <Zap size={40} className="mx-auto text-accent/30 mb-4" />
          <h3 className="text-base font-semibold text-text-primary mb-2">Enter a ticker to analyze smart money flow</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            The Institutional Accumulation Score combines five independent signals to surface where
            large money is quietly building positions — before it becomes obvious on price charts.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {PRESETS.map((sym) => (
              <button key={sym}
                onClick={() => { setTicker(sym); setTab("single"); }}
                className="px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-text-muted hover:text-text-primary hover:border-accent/50 transition-colors">
                {sym}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
