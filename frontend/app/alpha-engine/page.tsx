"use client";
import { useState, useCallback } from "react";
import {
  Zap, Search, TrendingUp, BarChart2, Eye, FileText,
  Star, Globe, Activity, ChevronDown, ChevronUp,
  RefreshCw, SlidersHorizontal, X,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

type FactorKey = "momentum"|"relative_strength"|"institutional"|"earnings"|"quality"|"macro"|"volatility";

interface FactorMeta { label: string; color: string; icon: string }
interface FactorScores { [k: string]: number }

interface MomentumDetail {
  score: number; return_12_1: number; return_3m: number; return_1m: number;
  rsi: number; macd_bull: boolean; trend: string;
}
interface RSDetail {
  score: number; rs_12m: number; rs_3m: number; rs_1m: number; rs_trend: string;
}
interface InstDetail {
  score: number; obv_score: number; cmf_score: number; dark_pool: number; block_score: number; grade: string; signal: string;
}
interface EarnDetail {
  score: number; rec_mean: number; rec_label: string; n_analysts: number; rev_growth: number; eps_growth: number;
}
interface QualDetail {
  score: number; roe: number; gross_margin: number; debt_equity: number; current_ratio: number; profit_margin: number; fcf_yield: number;
}
interface MacroDetail {
  score: number; sector_rs_3m: number; sector_rs_1m: number; above_sector_ma50: boolean; tailwind: string; sector: string;
}
interface VolDetail {
  score: number; hv_21d: number; hv_63d: number; hv_ratio: number; above_ma200: boolean; above_ma50: boolean; regime: string;
}

interface AlphaResult {
  ticker: string; score: number; grade: string; color: string; label: string;
  weights: Record<string, number>; factor_meta: Record<string, FactorMeta>;
  factor_scores: FactorScores;
  strengths: { factor: string; score: number }[];
  weaknesses: { factor: string; score: number }[];
  momentum: MomentumDetail; relative_strength: RSDetail; institutional: InstDetail;
  earnings: EarnDetail; quality: QualDetail; macro: MacroDetail; volatility: VolDetail;
  spot: number; from_date: string; to_date: string; sector: string; sector_etf: string;
}

interface RankRow {
  ticker: string; score: number; grade: string; label: string; color: string;
  factor_scores: FactorScores;
  strengths: { factor: string; score: number }[];
  weaknesses: { factor: string; score: number }[];
  sector: string; spot: number; percentile: number;
  momentum_detail?: MomentumDetail; rs_detail?: RSDetail; vol_detail?: VolDetail;
}

interface RankResult {
  results: RankRow[]; universe_size: number; avg_score: number;
  weights: Record<string, number>; factor_meta: Record<string, FactorMeta>; quick_mode: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FACTOR_ICONS: Record<string, React.ElementType> = {
  momentum: TrendingUp, relative_strength: BarChart2, institutional: Eye,
  earnings: FileText, quality: Star, macro: Globe, volatility: Activity,
};

const FACTOR_ORDER: FactorKey[] = [
  "momentum","relative_strength","institutional","earnings","quality","macro","volatility",
];

const DEFAULT_WEIGHTS: Record<FactorKey, number> = {
  momentum: 25, relative_strength: 20, institutional: 15,
  earnings: 10, quality: 10, macro: 10, volatility: 10,
};

const UNIVERSES: Record<string, string[]> = {
  "Magnificent 7":   ["AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA"],
  "S&P Top 20":      ["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","JPM","LLY","V","UNH","XOM","MA","HD","COST","WMT","NFLX","ORCL","ABBV"],
  "Growth Leaders":  ["NVDA","ASTS","PLTR","CRWD","ZS","DDOG","NET","APP","AXON","MSTR"],
  "Quality Value":   ["BRK-B","JPM","JNJ","PG","KO","WMT","V","MA","UNH","LLY"],
  "Sector ETFs":     ["XLK","XLV","XLF","XLY","XLE","XLB","XLU","XLRE","XLI","XLC","XLP"],
};

// ── Score helpers ──────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 65 ? "#00d97e" : s >= 50 ? "#f5a623" : s >= 35 ? "#e8743b" : "#e84040";
}

function gradeBg(grade: string) {
  const m: Record<string, string> = { A:"#00d97e22", B:"#4c9fff22", C:"#f5a62322", D:"#e8743b22", F:"#e8404022" };
  return m[grade] ?? "#55555522";
}

// ── Radar / Spider Chart ───────────────────────────────────────────────────────

function RadarChart({ scores, meta, size = 240 }: {
  scores: FactorScores; meta: Record<string, FactorMeta>; size?: number;
}) {
  const keys   = FACTOR_ORDER.filter(k => k in scores);
  const n      = keys.length;
  const cx     = size / 2;
  const cy     = size / 2;
  const R      = size * 0.35;
  const angles = keys.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / n);

  const pt = (a: number, r: number) =>
    `${(cx + R * r * Math.cos(a)).toFixed(1)},${(cy + R * r * Math.sin(a)).toFixed(1)}`;

  const outerPoly = angles.map(a => pt(a, 1)).join(" ");
  const gridPolys = [0.25, 0.5, 0.75].map(g => angles.map(a => pt(a, g)).join(" "));
  const scorePoly = keys.map((k, i) => pt(angles[i], (scores[k] ?? 0) / 100)).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid rings */}
      {gridPolys.map((p, i) => (
        <polygon key={i} points={p} fill="none" stroke="#1e2035" strokeWidth="1" />
      ))}
      <polygon points={outerPoly} fill="none" stroke="#2a2d3e" strokeWidth="1.5" />
      {/* Spokes */}
      {angles.map((a, i) => (
        <line key={i} x1={cx} y1={cy}
          x2={cx + R * Math.cos(a)} y2={cy + R * Math.sin(a)}
          stroke="#2a2d3e" strokeWidth="1" />
      ))}
      {/* Score polygon */}
      <polygon points={scorePoly} fill="#4c9fff18" stroke="#4c9fff" strokeWidth="2" />
      {/* Factor dots */}
      {keys.map((k, i) => {
        const v = (scores[k] ?? 0) / 100;
        const x = cx + R * v * Math.cos(angles[i]);
        const y = cy + R * v * Math.sin(angles[i]);
        return (
          <circle key={k} cx={x} cy={y} r="5"
            fill={meta[k]?.color ?? "#4c9fff"} stroke="#111" strokeWidth="1" />
        );
      })}
      {/* Labels */}
      {keys.map((k, i) => {
        const lx = cx + (R + 22) * Math.cos(angles[i]);
        const ly = cy + (R + 22) * Math.sin(angles[i]);
        const short = (meta[k]?.label ?? k).split(" ").slice(0, 2).join(" ");
        return (
          <text key={k} x={lx} y={ly + 4}
            textAnchor="middle" fill="#aaa" fontSize="9" fontWeight="500">
            {short}
          </text>
        );
      })}
      {/* Center labels: 25/50/75 */}
      {[0.25,0.5,0.75].map(g => (
        <text key={g}
          x={cx + 3}
          y={cy - R * g - 2}
          fill="#444" fontSize="7" textAnchor="middle">
          {g*100}
        </text>
      ))}
    </svg>
  );
}

// ── Big Alpha Score Gauge ──────────────────────────────────────────────────────

function AlphaGauge({ score, grade, color, label }: {
  score: number; grade: string; color: string; label: string;
}) {
  const cx = 120; const cy = 120; const r = 90;
  const angle = Math.PI - (score / 100) * Math.PI;
  const ex = cx + r * Math.cos(angle);
  const ey = cy - r * Math.sin(angle);
  const largeArc = score > 50 ? 1 : 0;

  return (
    <div className="flex flex-col items-center">
      <svg width="240" height="140" viewBox="0 0 240 140">
        {/* Track */}
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
          fill="none" stroke="#1a1d2e" strokeWidth="20" strokeLinecap="round" />
        {/* Fill arc */}
        {score > 0 && (
          <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`}
            fill="none" stroke={color} strokeWidth="20" strokeLinecap="round" />
        )}
        {/* Tick marks at 20/40/60/80/100 */}
        {[0,20,40,60,80,100].map(v => {
          const a = Math.PI - (v/100)*Math.PI;
          return (
            <line key={v}
              x1={cx + (r-12)*Math.cos(a)} y1={cy - (r-12)*Math.sin(a)}
              x2={cx + (r+2)*Math.cos(a)}  y2={cy - (r+2)*Math.sin(a)}
              stroke="#2e3248" strokeWidth="2" />
          );
        })}
        {/* Score */}
        <text x={cx} y={cy-12} textAnchor="middle" fill="white" fontSize="42" fontWeight="800">
          {Math.round(score)}
        </text>
        <text x={cx} y={cy+10} textAnchor="middle" fill="#555" fontSize="13">/100</text>
        {/* Grade ring */}
        <circle cx={cx} cy={cy+38} r="22" fill={color+"22"} stroke={color} strokeWidth="2"/>
        <text x={cx} y={cy+44} textAnchor="middle" fill={color} fontSize="18" fontWeight="800">
          {grade}
        </text>
      </svg>
      <p className="text-sm font-semibold -mt-1" style={{ color }}>{label}</p>
    </div>
  );
}

// ── Factor bar ─────────────────────────────────────────────────────────────────

function FactorBar({ factorKey, score, weight, meta, active, onClick }: {
  factorKey: string; score: number; weight: number;
  meta: FactorMeta; active: boolean; onClick: () => void;
}) {
  const Icon  = FACTOR_ICONS[factorKey] ?? Activity;
  const color = meta.color;
  const fill  = scoreColor(score);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
        active
          ? "border-accent bg-accent/10"
          : "border-border bg-surface-2 hover:border-accent/40"
      }`}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: color + "22" }}>
        <Icon size={15} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-text-primary">{meta.label}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">{weight}%</span>
            <span className="text-sm font-bold" style={{ color: fill }}>{score.toFixed(0)}</span>
          </div>
        </div>
        <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${score}%`, backgroundColor: fill }} />
        </div>
      </div>
    </button>
  );
}

// ── Weight editor ──────────────────────────────────────────────────────────────

function WeightEditor({ weights, onChange, meta }: {
  weights: Record<string, number>;
  onChange: (w: Record<string, number>) => void;
  meta: Record<string, FactorMeta>;
}) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);

  const update = (key: string, val: number) => {
    onChange({ ...weights, [key]: val });
  };

  return (
    <div className="space-y-3 p-4 bg-surface rounded-xl border border-border">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-text-primary">Customize Weights</p>
        <span className={`text-xs font-mono ${Math.abs(total - 100) < 0.5 ? "text-green-400" : "text-red-400"}`}>
          Total: {total.toFixed(0)}%
        </span>
      </div>
      {FACTOR_ORDER.map(k => {
        const Icon = FACTOR_ICONS[k] ?? Activity;
        const m    = meta[k];
        return (
          <div key={k} className="flex items-center gap-3">
            <Icon size={12} style={{ color: m?.color }} className="shrink-0" />
            <span className="text-xs text-text-muted w-28 shrink-0">{m?.label}</span>
            <input type="range" min="0" max="50" step="1"
              value={weights[k] ?? 0}
              onChange={e => update(k, +e.target.value)}
              className="flex-1 accent-accent h-1" />
            <span className="text-xs font-mono text-text-primary w-8 text-right">
              {(weights[k] ?? 0).toFixed(0)}%
            </span>
          </div>
        );
      })}
      <button onClick={() => onChange({ ...DEFAULT_WEIGHTS })}
        className="text-xs text-accent hover:underline">
        Reset to default
      </button>
    </div>
  );
}

// ── Factor detail panels ───────────────────────────────────────────────────────

function MomentumPanel({ d }: { d: MomentumDetail }) {
  const rows = [
    { label: "12-1 Month Return", value: `${d.return_12_1 > 0 ? "+" : ""}${d.return_12_1.toFixed(1)}%`, good: d.return_12_1 > 0 },
    { label: "3-Month Return",    value: `${d.return_3m > 0 ? "+" : ""}${d.return_3m.toFixed(1)}%`,   good: d.return_3m > 0 },
    { label: "1-Month Return",    value: `${d.return_1m > 0 ? "+" : ""}${d.return_1m.toFixed(1)}%`,   good: d.return_1m > 0 },
    { label: "RSI (14)",          value: d.rsi.toFixed(1),   good: d.rsi > 50 && d.rsi < 70 },
    { label: "MACD Signal",       value: d.macd_bull ? "Bullish ↑" : "Bearish ↓", good: d.macd_bull },
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted leading-relaxed">
        12-1 month momentum (Fama-French) skips the most recent month to avoid short-term
        reversal. Combined with 3-month and 1-month signals, RSI positioning, and MACD
        direction for a holistic trend picture.
      </p>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
        style={{ backgroundColor: scoreColor(d.score)+"22", color: scoreColor(d.score) }}>
        {d.trend}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {rows.map(r => (
          <div key={r.label} className="bg-surface rounded-xl p-3">
            <p className="text-xs text-text-muted">{r.label}</p>
            <p className={`text-sm font-bold mt-1 ${r.good ? "text-green-400" : "text-red-400"}`}>{r.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RSPanel({ d }: { d: RSDetail }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted leading-relaxed">
        Relative Strength measures outperformance vs. SPY across three timeframes.
        A rising RS line (price/SPY trending up) is the single strongest institutional
        selection signal — it means the stock is attracting incremental capital.
      </p>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
        style={{ backgroundColor: scoreColor(d.score)+"22", color: scoreColor(d.score) }}>
        RS Line {d.rs_trend === "rising" ? "Rising ↑" : "Falling ↓"}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {([["12M vs SPY", d.rs_12m], ["3M vs SPY", d.rs_3m], ["1M vs SPY", d.rs_1m]] as [string,number][]).map(([l,v]) => (
          <div key={l} className="bg-surface rounded-xl p-3">
            <p className="text-xs text-text-muted">{l}</p>
            <p className={`text-sm font-bold mt-1 ${v > 0 ? "text-green-400" : "text-red-400"}`}>
              {v > 0 ? "+" : ""}{v.toFixed(1)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function InstPanel({ d }: { d: InstDetail }) {
  const rows = [
    { label: "OBV Trend",    value: d.obv_score.toFixed(0) },
    { label: "Chaikin MF",  value: d.cmf_score.toFixed(0) },
    { label: "Dark Pool",    value: d.dark_pool.toFixed(0) },
    { label: "Block Trades", value: d.block_score.toFixed(0) },
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted leading-relaxed">
        Powered by the Smart Money Flow engine — combines OBV divergence, Chaikin Money
        Flow, dark pool activity heuristics, and block-trade day detection to estimate
        where institutions are quietly positioning.
      </p>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
        style={{ backgroundColor: scoreColor(d.score)+"22", color: scoreColor(d.score) }}>
        Grade {d.grade} — {d.signal}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {rows.map(r => (
          <div key={r.label} className="bg-surface rounded-xl p-3">
            <p className="text-xs text-text-muted">{r.label}</p>
            <p className="text-sm font-bold mt-1" style={{ color: scoreColor(+r.value) }}>{r.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EarningsPanel({ d }: { d: EarnDetail }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted leading-relaxed">
        Analyst consensus, revenue growth, and EPS growth trajectory. High analyst
        coverage combined with positive revisions is one of the most reliable
        leading indicators of price outperformance (Hawkins et al. 2010).
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Analyst Rating", value: d.rec_label,           color: d.rec_mean <= 2 ? "#00d97e" : d.rec_mean >= 4 ? "#e84040" : "#f5a623" },
          { label: "# Analysts",     value: d.n_analysts.toString(), color: "white" },
          { label: "Rev Growth",     value: `${d.rev_growth > 0 ? "+" : ""}${d.rev_growth.toFixed(1)}%`, color: d.rev_growth > 0 ? "#00d97e" : "#e84040" },
          { label: "EPS Growth",     value: `${d.eps_growth > 0 ? "+" : ""}${d.eps_growth.toFixed(1)}%`, color: d.eps_growth > 0 ? "#00d97e" : "#e84040" },
        ].map(r => (
          <div key={r.label} className="bg-surface rounded-xl p-3">
            <p className="text-xs text-text-muted">{r.label}</p>
            <p className="text-sm font-bold mt-1" style={{ color: r.color }}>{r.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QualityPanel({ d }: { d: QualDetail }) {
  const rows = [
    { label: "ROE",           value: `${d.roe.toFixed(1)}%`,           good: d.roe > 15 },
    { label: "Gross Margin",  value: `${d.gross_margin.toFixed(1)}%`,  good: d.gross_margin > 40 },
    { label: "Net Margin",    value: `${d.profit_margin.toFixed(1)}%`, good: d.profit_margin > 10 },
    { label: "Debt / Equity", value: d.debt_equity.toFixed(1),         good: d.debt_equity < 80 },
    { label: "Current Ratio", value: d.current_ratio.toFixed(2),       good: d.current_ratio > 1.5 },
    { label: "FCF Yield",     value: `${d.fcf_yield.toFixed(2)}%`,     good: d.fcf_yield > 3 },
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted leading-relaxed">
        Quality measures balance-sheet health and profitability durability.
        High-quality compounders (ROE &gt;15%, net margin &gt;10%, low leverage)
        outperform consistently — especially in late-cycle environments.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {rows.map(r => (
          <div key={r.label} className="bg-surface rounded-xl p-3">
            <p className="text-xs text-text-muted">{r.label}</p>
            <p className={`text-sm font-bold mt-1 ${r.good ? "text-green-400" : "text-red-400"}`}>{r.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MacroPanel({ d }: { d: MacroDetail }) {
  const tailwindColor =
    d.tailwind.includes("Strong Tail") ? "#00d97e" :
    d.tailwind.includes("Mild Tail")   ? "#4c9fff" :
    d.tailwind === "Neutral"           ? "#f5a623" :
    d.tailwind.includes("Mild Head")   ? "#e8743b" : "#e84040";
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted leading-relaxed">
        Sector ETF performance vs. SPY captures the macro tailwind or headwind
        for the stock's industry. Owning the right sector at the right time accounts
        for ~40% of individual stock returns (Grinblatt &amp; Moskowitz, 2004).
      </p>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
        style={{ backgroundColor: tailwindColor + "22", color: tailwindColor }}>
        {d.tailwind}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Sector",         value: d.sector || "N/A",                                  color: "white" },
          { label: "Sector RS 3M",   value: `${d.sector_rs_3m > 0 ? "+" : ""}${d.sector_rs_3m.toFixed(1)}%`, color: d.sector_rs_3m > 0 ? "#00d97e" : "#e84040" },
          { label: "Above 50d MA",   value: d.above_sector_ma50 ? "Yes ✓" : "No ✗",            color: d.above_sector_ma50 ? "#00d97e" : "#e84040" },
        ].map(r => (
          <div key={r.label} className="bg-surface rounded-xl p-3">
            <p className="text-xs text-text-muted">{r.label}</p>
            <p className="text-sm font-bold mt-1" style={{ color: r.color }}>{r.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function VolPanel({ d }: { d: VolDetail }) {
  const regimeColor =
    d.regime.includes("Ideal") ? "#00d97e" :
    d.regime.includes("Low")   ? "#4c9fff" :
    d.regime.includes("Mod")   ? "#f5a623" : "#e84040";
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted leading-relaxed">
        Low, contracting realized volatility + price above the 200-day MA is the ideal
        entry regime. Elevated or expanding vol signals distribution or uncertainty —
        strategies must adjust position sizing accordingly.
      </p>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
        style={{ backgroundColor: regimeColor+"22", color: regimeColor }}>
        {d.regime}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "HV 21-Day",   value: `${d.hv_21d.toFixed(1)}%`,  good: d.hv_21d < 25 },
          { label: "HV 63-Day",   value: `${d.hv_63d.toFixed(1)}%`,  good: d.hv_63d < 30 },
          { label: "HV Ratio",    value: d.hv_ratio.toFixed(2),       good: d.hv_ratio < 1 },
          { label: "Above 200MA", value: d.above_ma200 ? "Yes ✓" : "No ✗", good: d.above_ma200 },
          { label: "Above 50MA",  value: d.above_ma50  ? "Yes ✓" : "No ✗", good: d.above_ma50  },
        ].map(r => (
          <div key={r.label} className="bg-surface rounded-xl p-3">
            <p className="text-xs text-text-muted">{r.label}</p>
            <p className={`text-sm font-bold mt-1 ${r.good ? "text-green-400" : "text-red-400"}`}>{r.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rank table row ─────────────────────────────────────────────────────────────

function RankTableRow({ row, rank, meta, onSelect }: {
  row: RankRow; rank: number;
  meta: Record<string, FactorMeta>;
  onSelect: (t: string) => void;
}) {
  const scoreCol = scoreColor(row.score);
  const factors  = FACTOR_ORDER.filter(k => k in row.factor_scores);

  return (
    <tr className="border-b border-border/40 hover:bg-surface-2 group transition-colors">
      {/* Rank */}
      <td className="py-3 pl-4 pr-2">
        <span className={`text-sm font-bold ${rank <= 3 ? "text-accent" : "text-text-muted"}`}>
          {rank}
        </span>
      </td>
      {/* Ticker + sector */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <button onClick={() => onSelect(row.ticker)}
            className="font-bold text-sm text-text-primary hover:text-accent transition-colors">
            {row.ticker}
          </button>
          {row.grade !== "N/A" && (
            <span className="text-xs px-1.5 py-0.5 rounded font-bold"
              style={{ color: row.color, backgroundColor: row.color+"22" }}>
              {row.grade}
            </span>
          )}
        </div>
        {row.sector && (
          <p className="text-xs text-text-muted mt-0.5">{row.sector}</p>
        )}
      </td>
      {/* Alpha Score */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold" style={{ color: scoreCol }}>
            {row.score.toFixed(0)}
          </span>
          <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
            <div className="h-full rounded-full"
              style={{ width:`${row.score}%`, backgroundColor: scoreCol }} />
          </div>
        </div>
        <p className="text-xs text-text-muted mt-0.5">P{row.percentile.toFixed(0)}</p>
      </td>
      {/* Mini factor bars */}
      <td className="py-3 pr-4">
        <div className="flex gap-1 items-end h-6">
          {factors.map(k => {
            const v   = row.factor_scores[k] ?? 0;
            const col = scoreColor(v);
            return (
              <div key={k} title={`${meta[k]?.label}: ${v.toFixed(0)}`}
                className="w-3.5 rounded-sm" style={{ height:`${Math.max(v/100*22, 2)}px`, backgroundColor: col }} />
            );
          })}
        </div>
        <div className="flex gap-1 mt-0.5">
          {factors.map(k => (
            <span key={k} className="text-[7px] text-text-muted w-3.5 text-center truncate">
              {(meta[k]?.label ?? k).slice(0,3)}
            </span>
          ))}
        </div>
      </td>
      {/* Price */}
      <td className="py-3 pr-4 font-mono text-sm text-text-primary">
        ${row.spot.toFixed(2)}
      </td>
      {/* Top signal */}
      <td className="py-3 pr-4">
        {row.strengths[0] && (
          <span className="text-xs px-2 py-0.5 rounded-full text-green-400 bg-green-900/30">
            ↑ {meta[row.strengths[0].factor]?.label}
          </span>
        )}
        {row.weaknesses[0] && (
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full text-red-400 bg-red-900/30">
            ↓ {meta[row.weaknesses[0].factor]?.label}
          </span>
        )}
      </td>
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: "6M", value: 180 },
  { label: "1Y", value: 252 },
  { label: "2Y", value: 504 },
];

export default function AlphaEnginePage() {
  const [tab, setTab]               = useState<"single"|"rank">("single");
  const [ticker, setTicker]         = useState("NVDA");
  const [period, setPeriod]         = useState(252);
  const [data, setData]             = useState<AlphaResult | null>(null);
  const [rankData, setRankData]     = useState<RankResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [activePanel, setActivePanel] = useState<FactorKey>("momentum");
  const [showWeights, setShowWeights] = useState(false);
  const [weights, setWeights]       = useState({ ...DEFAULT_WEIGHTS });
  const [customTickers, setCustom]  = useState("AAPL,MSFT,NVDA,GOOGL,AMZN,META,TSLA");
  const [quickMode, setQuickMode]   = useState(false);

  // ── Single ticker ──────────────────────────────────────────────────────────

  const analyze = useCallback(async (sym?: string) => {
    const t = (sym ?? ticker).toUpperCase();
    setLoading(true); setError(""); setData(null); setTab("single");
    try {
      const w = Object.fromEntries(
        Object.entries(weights).map(([k, v]) => [k, v / 100])
      );
      const res = await fetch(
        `${API}/api/alpha-engine/score/${t}?period_days=${period}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );
      if (!res.ok) throw new Error((await res.json()).detail ?? "Error");
      const json: AlphaResult = await res.json();
      setData(json);
      setActivePanel("momentum");
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [ticker, period, weights]);

  // ── Rank universe ──────────────────────────────────────────────────────────

  const runRank = useCallback(async (tickerList?: string[]) => {
    const tickers = tickerList ?? customTickers.split(",").map(t => t.trim()).filter(Boolean);
    setLoading(true); setError(""); setRankData(null); setTab("rank");
    try {
      const w = Object.fromEntries(
        Object.entries(weights).map(([k, v]) => [k, v / 100])
      );
      const res = await fetch(`${API}/api/alpha-engine/rank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers, weights: w, period_days: period, quick: quickMode }),
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? "Error");
      setRankData(await res.json());
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [customTickers, period, weights, quickMode]);

  const activeMeta = data?.factor_meta ?? {};

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/20">
          <Zap size={22} className="text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Alpha Engine</h1>
          <p className="text-sm text-text-muted">
            Composite 0-100 score · Momentum · RS · Institutional · Earnings · Quality · Macro · Vol
          </p>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="bg-surface-2 rounded-2xl border border-border p-4 space-y-4">

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {(["single","rank"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? "bg-accent text-black" : "text-text-muted hover:text-text-primary hover:bg-surface border border-border"
              }`}>
              {t === "single" ? "Single Ticker" : "Rank Universe"}
            </button>
          ))}
        </div>

        {tab === "single" ? (
          <div className="flex flex-wrap gap-3 items-end">
            {/* Ticker */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Ticker</label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && analyze()}
                  placeholder="NVDA"
                  className="pl-8 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary w-28 focus:outline-none focus:border-accent" />
              </div>
            </div>
            {/* Period */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Lookback</label>
              <div className="flex gap-1">
                {PERIODS.map(p => (
                  <button key={p.value} onClick={() => setPeriod(p.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      period === p.value ? "bg-accent text-black" : "bg-surface text-text-muted border border-border hover:text-text-primary"
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Quick tickers */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Quick picks</label>
              <div className="flex flex-wrap gap-1">
                {["NVDA","AAPL","MSFT","META","TSLA","AMZN"].map(sym => (
                  <button key={sym} onClick={() => { setTicker(sym); setTimeout(() => analyze(sym), 0); }}
                    className="px-2 py-1 rounded text-xs bg-surface border border-border text-text-muted hover:text-text-primary hover:border-accent/50 transition-colors">
                    {sym}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 ml-auto items-end">
              <button onClick={() => setShowWeights(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-text-muted hover:text-text-primary transition-colors">
                <SlidersHorizontal size={12} />
                Weights
                {showWeights ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              <button onClick={() => analyze()} disabled={loading}
                className="px-6 py-2 bg-accent text-black rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors">
                {loading ? <RefreshCw size={14} className="animate-spin" /> : "Analyze"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Universe presets */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Preset Universes</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(UNIVERSES).map(([name, tickers]) => (
                  <button key={name}
                    onClick={() => { setCustom(tickers.join(",")); runRank(tickers); }}
                    className="px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-text-muted hover:text-text-primary hover:border-accent/50 transition-colors">
                    {name} ({tickers.length})
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1 flex-1 min-w-60">
                <label className="text-xs text-text-muted">Custom Tickers (comma-separated, up to 50)</label>
                <input value={customTickers} onChange={e => setCustom(e.target.value.toUpperCase())}
                  className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-text-muted">Lookback</label>
                <div className="flex gap-1">
                  {PERIODS.map(p => (
                    <button key={p.value} onClick={() => setPeriod(p.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        period === p.value ? "bg-accent text-black" : "bg-surface text-text-muted border border-border"
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
                  <input type="checkbox" checked={quickMode} onChange={e => setQuickMode(e.target.checked)}
                    className="accent-accent" />
                  Quick mode (price-only, faster)
                </label>
                <button onClick={() => setShowWeights(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-text-muted hover:text-text-primary">
                  <SlidersHorizontal size={12} />
                  Weights
                </button>
                <button onClick={() => runRank()} disabled={loading}
                  className="px-6 py-2 bg-accent text-black rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50">
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : "Rank"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Weight editor (shared) */}
        {showWeights && (
          <WeightEditor
            weights={weights}
            onChange={setWeights}
            meta={data?.factor_meta ?? Object.fromEntries(
              FACTOR_ORDER.map(k => [k, { label: k, color: "#4c9fff", icon: "" }])
            )}
          />
        )}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500/40 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")}><X size={14} /></button>
        </div>
      )}

      {/* ══════════════════════════════ SINGLE TICKER RESULT ══════════════════ */}
      {tab === "single" && data && (
        <div className="space-y-6">

          {/* Hero: Gauge + Radar + Factor bars */}
          <div className="grid grid-cols-1 lg:grid-cols-[auto_auto_1fr] gap-6">

            {/* Gauge */}
            <div className="bg-surface-2 rounded-2xl border border-border p-6 flex flex-col items-center justify-center gap-3 min-w-[260px]">
              <AlphaGauge
                score={data.score} grade={data.grade}
                color={data.color} label={data.label}
              />
              <div className="text-center space-y-1">
                <p className="text-lg font-bold text-text-primary">{data.ticker}</p>
                {data.spot > 0 && (
                  <p className="text-sm text-text-muted">${data.spot.toFixed(2)}</p>
                )}
                <p className="text-xs text-text-muted">{data.sector}</p>
                <p className="text-xs text-text-muted">{data.from_date} → {data.to_date}</p>
              </div>
              {/* Strengths/Weaknesses */}
              <div className="w-full space-y-1.5">
                {data.strengths.slice(0, 2).map(s => (
                  <div key={s.factor} className="flex items-center justify-between px-2 py-1 bg-green-900/20 rounded-lg">
                    <span className="text-xs text-green-400">↑ {activeMeta[s.factor]?.label}</span>
                    <span className="text-xs font-mono text-green-400">{s.score.toFixed(0)}</span>
                  </div>
                ))}
                {data.weaknesses.slice(0, 2).map(s => (
                  <div key={s.factor} className="flex items-center justify-between px-2 py-1 bg-red-900/20 rounded-lg">
                    <span className="text-xs text-red-400">↓ {activeMeta[s.factor]?.label}</span>
                    <span className="text-xs font-mono text-red-400">{s.score.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Radar */}
            <div className="bg-surface-2 rounded-2xl border border-border p-4 flex flex-col items-center justify-center">
              <p className="text-xs text-text-muted mb-2 font-medium">Factor Profile</p>
              <RadarChart scores={data.factor_scores} meta={activeMeta} size={240} />
            </div>

            {/* 7 Factor bars */}
            <div className="bg-surface-2 rounded-2xl border border-border p-4">
              <p className="text-xs font-semibold text-text-primary mb-3">Factor Breakdown</p>
              <div className="space-y-2">
                {FACTOR_ORDER.map(k => (
                  <FactorBar
                    key={k}
                    factorKey={k}
                    score={data.factor_scores[k] ?? 0}
                    weight={Math.round((data.weights[k] ?? 0) * 100)}
                    meta={activeMeta[k] ?? { label: k, color: "#888", icon: "" }}
                    active={activePanel === k}
                    onClick={() => setActivePanel(k)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Detail panel */}
          <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
            {/* Tabs */}
            <div className="flex overflow-x-auto border-b border-border">
              {FACTOR_ORDER.map(k => {
                const m     = activeMeta[k];
                const score = data.factor_scores[k] ?? 0;
                return (
                  <button key={k} onClick={() => setActivePanel(k)}
                    className={`px-4 py-3 text-sm font-medium whitespace-nowrap flex items-center gap-2 transition-colors ${
                      activePanel === k
                        ? "border-b-2 border-accent text-text-primary -mb-px"
                        : "text-text-muted hover:text-text-primary"
                    }`}>
                    <span style={{ color: m?.color }}>{m?.label}</span>
                    <span className="text-xs font-bold" style={{ color: scoreColor(score) }}>
                      {score.toFixed(0)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold"
                    style={{ color: scoreColor(data.factor_scores[activePanel] ?? 0) }}>
                    {(data.factor_scores[activePanel] ?? 0).toFixed(0)}
                  </span>
                  <div>
                    <p className="text-xs text-text-muted">out of 100</p>
                    <p className="text-xs text-text-muted">
                      Weight: {Math.round((data.weights[activePanel] ?? 0) * 100)}% of Alpha Score
                    </p>
                  </div>
                </div>
              </div>
              {activePanel === "momentum"          && <MomentumPanel d={data.momentum} />}
              {activePanel === "relative_strength" && <RSPanel       d={data.relative_strength} />}
              {activePanel === "institutional"     && <InstPanel     d={data.institutional} />}
              {activePanel === "earnings"          && <EarningsPanel d={data.earnings} />}
              {activePanel === "quality"           && <QualityPanel  d={data.quality} />}
              {activePanel === "macro"             && <MacroPanel    d={data.macro} />}
              {activePanel === "volatility"        && <VolPanel      d={data.volatility} />}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════ RANK RESULT ═══════════════════════════ */}
      {tab === "rank" && rankData && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-4 bg-surface-2 rounded-xl border border-border px-4 py-3">
            <div>
              <p className="text-xs text-text-muted">Universe</p>
              <p className="text-sm font-bold text-text-primary">{rankData.universe_size} tickers</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Avg Alpha Score</p>
              <p className="text-sm font-bold" style={{ color: scoreColor(rankData.avg_score) }}>
                {rankData.avg_score.toFixed(1)}
              </p>
            </div>
            {rankData.quick_mode && (
              <span className="text-xs px-2 py-1 bg-yellow-900/30 border border-yellow-500/30 rounded text-yellow-400">
                Quick mode — earnings &amp; quality at neutral
              </span>
            )}
            <div className="ml-auto flex gap-2">
              {["A","B","C","D","F"].map(g => {
                const cnt = rankData.results.filter(r => r.grade === g).length;
                return cnt > 0 ? (
                  <div key={g} className="text-center">
                    <p className="text-xs font-bold" style={{ color: rankData.results.find(r=>r.grade===g)?.color }}>
                      {cnt}×{g}
                    </p>
                  </div>
                ) : null;
              })}
            </div>
          </div>

          {/* Table */}
          <div className="bg-surface-2 rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-text-muted text-xs">
                    <th className="text-left pb-3 pt-3 pl-4 pr-2 font-medium">#</th>
                    <th className="text-left pb-3 pr-4 font-medium">Ticker</th>
                    <th className="text-left pb-3 pr-4 font-medium">Alpha Score</th>
                    <th className="text-left pb-3 pr-4 font-medium">
                      Factor Bars
                      <span className="block font-normal text-[10px] text-text-muted/60">
                        M · RS · I · E · Q · Mc · V
                      </span>
                    </th>
                    <th className="text-left pb-3 pr-4 font-medium">Price</th>
                    <th className="text-left pb-3 pr-4 font-medium">Signals</th>
                  </tr>
                </thead>
                <tbody>
                  {rankData.results.map((row, i) => (
                    <RankTableRow
                      key={row.ticker}
                      row={row}
                      rank={i + 1}
                      meta={rankData.factor_meta}
                      onSelect={sym => { setTicker(sym); analyze(sym); }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Heatmap mini strip */}
          <div className="bg-surface-2 rounded-xl border border-border p-4">
            <p className="text-xs font-semibold text-text-primary mb-3">Factor Heatmap</p>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr className="text-text-muted">
                    <th className="text-left pr-4 pb-1 font-medium">Ticker</th>
                    {FACTOR_ORDER.map(k => (
                      <th key={k} className="pr-2 pb-1 font-medium text-center" style={{ color: rankData.factor_meta[k]?.color }}>
                        {(rankData.factor_meta[k]?.label ?? k).split(" ").map(w => w[0]).join("")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankData.results.filter(r => r.grade !== "N/A").slice(0, 20).map(row => (
                    <tr key={row.ticker}>
                      <td className="pr-4 py-0.5 font-mono text-text-primary">{row.ticker}</td>
                      {FACTOR_ORDER.map(k => {
                        const v = row.factor_scores[k] ?? 0;
                        const bg = v >= 65 ? "#00d97e" : v >= 50 ? "#f5a623" : v >= 35 ? "#e8743b" : "#e84040";
                        return (
                          <td key={k} className="pr-2 py-0.5 text-center">
                            <span className="inline-block w-7 rounded text-center font-mono"
                              style={{ backgroundColor: bg+"33", color: bg }}>
                              {v.toFixed(0)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!data && !rankData && !loading && !error && (
        <div className="bg-surface-2 rounded-2xl border border-border p-12 text-center">
          <Zap size={44} className="mx-auto text-accent/30 mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            One score. Every signal. Zero noise.
          </h3>
          <p className="text-sm text-text-muted max-w-lg mx-auto mb-6">
            The Alpha Engine combines seven independent signals — the same factors that drive
            institutional alpha generation — into a single composite 0-100 score per stock.
          </p>
          {/* Factor legend */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 max-w-3xl mx-auto mb-8">
            {FACTOR_ORDER.map((k, i) => {
              const Icon = FACTOR_ICONS[k] ?? Activity;
              const COLORS = ["#4c9fff","#a78bfa","#00d97e","#f5a623","#f472b6","#34d399","#fb923c"];
              const LABELS = ["Momentum","Rel. Strength","Institutional","Earnings","Quality","Macro","Vol Regime"];
              const WEIGHTS_DISPLAY = ["25%","20%","15%","10%","10%","10%","10%"];
              return (
                <div key={k} className="bg-surface rounded-xl p-3 text-center border border-border">
                  <Icon size={18} className="mx-auto mb-1" style={{ color: COLORS[i] }} />
                  <p className="text-xs font-semibold text-text-primary">{LABELS[i]}</p>
                  <p className="text-xs text-text-muted">{WEIGHTS_DISPLAY[i]}</p>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {["NVDA","AAPL","MSFT","META","AMZN","TSLA"].map(sym => (
              <button key={sym}
                onClick={() => { setTicker(sym); analyze(sym); }}
                className="px-4 py-2 bg-surface border border-border rounded-lg text-sm text-text-muted hover:text-text-primary hover:border-accent/50 transition-colors">
                Analyze {sym}
              </button>
            ))}
            <button
              onClick={() => runRank(UNIVERSES["Magnificent 7"])}
              className="px-4 py-2 bg-accent/10 border border-accent/30 rounded-lg text-sm text-accent hover:bg-accent/20 transition-colors">
              Rank Mag 7 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
