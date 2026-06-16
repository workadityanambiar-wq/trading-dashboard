"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Activity, BarChart3,
  Zap, Brain, Table2, RefreshCw, ChevronDown,
  Target, Layers, AlertCircle,
} from "lucide-react";

const B = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────────

interface Greeks {
  delta: number; gamma: number; theta: number; vega: number; rho: number;
  vanna: number; charm: number; vomma: number; speed: number; color: number; zomma: number;
}
interface BSResult {
  price: number; call: number; put: number; intrinsic: number; time_value: number;
  d1: number; d2: number; prob_itm: number; greeks: Greeks;
}
interface StrategyResult {
  payoff: number[]; s_range: number[]; breakevens: number[];
  max_profit: number; max_loss: number; net_credit: number;
  risk_reward: number | null; label: string; description: string;
}
interface ChainRow {
  strike: number; bid: number; ask: number; mid: number; volume: number;
  openInterest: number; impliedVolatility: number; inTheMoney: boolean; type: string;
}
interface ChainData {
  ticker: string; spot: number; expiry: string; expirations: string[];
  calls: ChainRow[]; puts: ChainRow[];
  max_pain: { max_pain_strike: number }; put_call_ratio: { vol_pcr: number; sentiment: string };
  gex: { total_gex: number; regime: string; flip_points: number[] };
}

// ── Mini components ───────────────────────────────────────────────────────────

function Stat({ label, value, color = "" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded bg-surface border border-border">
      <span className="text-[10px] text-text-muted uppercase tracking-wide">{label}</span>
      <span className={cn("text-sm font-bold", color || "text-text-primary")}>{value}</span>
    </div>
  );
}

function PosNeg({ v, fmt = (x: number) => x.toFixed(4) }: { v: number; fmt?: (n: number) => string }) {
  return <span className={v >= 0 ? "text-green-400" : "text-red-400"}>{fmt(v)}</span>;
}

// ── Payoff Chart (SVG) ───────────────────────────────────────────────────────

function PayoffChart({ result }: { result: StrategyResult }) {
  const { payoff, s_range, breakevens, max_profit, max_loss } = result;
  if (!payoff?.length) return null;

  const W = 560, H = 220, PAD = { t: 20, r: 16, b: 32, l: 56 };
  const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;

  const minS = s_range[0], maxS = s_range[s_range.length - 1];
  const minP = Math.min(max_loss * 1.1, -0.5), maxP = Math.max(max_profit * 1.1, 0.5);

  const xScale = (s: number) => PAD.l + ((s - minS) / (maxS - minS)) * iW;
  const yScale = (p: number) => PAD.t + (1 - (p - minP) / (maxP - minP)) * iH;
  const y0 = yScale(0);

  // Build path
  const pts = payoff.map((p, i) => [xScale(s_range[i]), yScale(p)] as [number, number]);
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");

  // Fill areas
  const greenPts = pts.filter(p => p[1] <= y0);
  const redPts   = pts.filter(p => p[1] >= y0);

  // Y ticks
  const ticks = [minP, minP / 2, 0, maxP / 2, maxP].filter(v => isFinite(v) && v !== 0);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {/* Grid */}
      {ticks.map(t => (
        <line key={t} x1={PAD.l} x2={W - PAD.r} y1={yScale(t)} y2={yScale(t)}
              stroke="rgba(255,255,255,0.06)" strokeWidth={0.8} />
      ))}
      {/* Zero line */}
      <line x1={PAD.l} x2={W - PAD.r} y1={y0} y2={y0}
            stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="4 2" />
      {/* Profit fill */}
      {greenPts.length > 1 && (
        <polyline points={[
          `${greenPts[0][0]},${y0}`,
          ...greenPts.map(p => `${p[0]},${p[1]}`),
          `${greenPts[greenPts.length - 1][0]},${y0}`,
        ].join(" ")}
          fill="rgba(63,185,80,0.15)" stroke="none" />
      )}
      {/* Loss fill */}
      {redPts.length > 1 && (
        <polyline points={[
          `${redPts[0][0]},${y0}`,
          ...redPts.map(p => `${p[0]},${p[1]}`),
          `${redPts[redPts.length - 1][0]},${y0}`,
        ].join(" ")}
          fill="rgba(248,81,73,0.15)" stroke="none" />
      )}
      {/* Main line */}
      <path d={pathD} fill="none" stroke="#00D4FF" strokeWidth={2} />
      {/* Breakevens */}
      {breakevens.map(be => (
        <g key={be}>
          <line x1={xScale(be)} x2={xScale(be)} y1={PAD.t} y2={H - PAD.b}
                stroke="#F0C040" strokeWidth={1} strokeDasharray="3 2" />
          <text x={xScale(be)} y={PAD.t - 5} textAnchor="middle" fill="#F0C040" fontSize={9}>
            ${be.toFixed(0)}
          </text>
        </g>
      ))}
      {/* Y axis labels */}
      {ticks.map(t => (
        <text key={t} x={PAD.l - 6} y={yScale(t) + 4} textAnchor="end"
              fill="rgba(255,255,255,0.4)" fontSize={8.5}>
          {t > 0 ? "+" : ""}{t.toFixed(0)}
        </text>
      ))}
      {/* X axis labels */}
      {[0, Math.floor(s_range.length / 2), s_range.length - 1].map(i => (
        <text key={i} x={xScale(s_range[i])} y={H - 4} textAnchor="middle"
              fill="rgba(255,255,255,0.4)" fontSize={8.5}>
          ${s_range[i].toFixed(0)}
        </text>
      ))}
    </svg>
  );
}

// ── Vol Smile Chart (SVG) ────────────────────────────────────────────────────

function SmileChart({ strikes, ivs }: { strikes: number[]; ivs: (number | null)[] }) {
  if (!strikes.length) return null;
  const W = 480, H = 180, P = { t: 16, r: 16, b: 28, l: 44 };
  const iW = W - P.l - P.r, iH = H - P.t - P.b;

  const validPairs = strikes.map((s, i) => [s, ivs[i]] as [number, number | null]).filter(([, v]) => v !== null);
  if (!validPairs.length) return null;

  const minS = Math.min(...validPairs.map(([s]) => s));
  const maxS = Math.max(...validPairs.map(([s]) => s));
  const minV = Math.min(...validPairs.map(([, v]) => v as number)) * 0.92;
  const maxV = Math.max(...validPairs.map(([, v]) => v as number)) * 1.08;

  const xs = (s: number) => P.l + ((s - minS) / (maxS - minS || 1)) * iW;
  const ys = (v: number) => P.t + (1 - (v - minV) / (maxV - minV || 1)) * iH;

  const pts = validPairs.map(([s, v]) => `${xs(s).toFixed(1)},${ys(v as number).toFixed(1)}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {[minV, (minV + maxV) / 2, maxV].map(v => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={ys(v)} y2={ys(v)} stroke="rgba(255,255,255,0.07)" strokeWidth={0.8} />
          <text x={P.l - 5} y={ys(v) + 3.5} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={8.5}>
            {v.toFixed(1)}%
          </text>
        </g>
      ))}
      <polyline points={pts} fill="none" stroke="#00D4FF" strokeWidth={2} />
      {validPairs.map(([s, v]) => (
        <circle key={s} cx={xs(s)} cy={ys(v as number)} r={2.5} fill="#00D4FF" />
      ))}
      {[0, Math.floor(validPairs.length / 2), validPairs.length - 1].map(i => (
        <text key={i} x={xs(validPairs[i][0])} y={H - 4} textAnchor="middle"
              fill="rgba(255,255,255,0.4)" fontSize={8}>
          ${validPairs[i][0].toFixed(0)}
        </text>
      ))}
    </svg>
  );
}

// ── Greeks Bar ────────────────────────────────────────────────────────────────

function GreeksBar({ g, label, scale = 1 }: { g: number; label: string; scale?: number }) {
  const pct = Math.min(Math.abs(g * scale) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-text-muted w-12 text-right shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", g >= 0 ? "bg-green-500" : "bg-red-500")}
             style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-[11px] font-mono w-16 shrink-0", g >= 0 ? "text-green-400" : "text-red-400")}>
        {g >= 0 ? "+" : ""}{g.toFixed(4)}
      </span>
    </div>
  );
}

// ── Scenario P&L Cell ─────────────────────────────────────────────────────────

function ScenarioCell({ value }: { value: number }) {
  const color = value > 0 ? "bg-green-500/20 text-green-400"
              : value < 0 ? "bg-red-500/20 text-red-400"
              : "bg-surface text-text-muted";
  return (
    <td className={cn("px-2 py-1.5 text-center text-xs font-mono border border-border/50", color)}>
      {value > 0 ? "+" : ""}{value.toFixed(0)}
    </td>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = ["Pricer", "Greeks", "Vol Surface", "Chain", "Strategy", "Scenario", "AI Insights"] as const;
type Tab = typeof TABS[number];

const OUTLOOK_OPTS = ["neutral", "bullish", "bearish"];

export default function OptionsAnalyticsPage() {
  const [tab, setTab] = useState<Tab>("Pricer");

  // Core inputs
  const [S, setS]       = useState("150");
  const [K, setK]       = useState("150");
  const [T, setT]       = useState("30");
  const [r, setR]       = useState("5");
  const [sig, setSig]   = useState("25");
  const [q, setQ]       = useState("0");
  const [optType, setOptType] = useState<"call"|"put">("call");

  // Pricer results
  const [bsResult, setBsResult] = useState<BSResult | null>(null);
  const [binoResult, setBinoResult] = useState<any>(null);
  const [mcResult, setMcResult] = useState<any>(null);
  const [model, setModel] = useState<"bs"|"binomial"|"mc">("bs");
  const [nSims, setNSims] = useState("10000");
  const [binoN, setBinoN] = useState("50");
  const [american, setAmerican] = useState(false);
  const [exotic, setExotic] = useState("vanilla");

  // Vol Surface
  const [smileData, setSmileData] = useState<any>(null);
  const [chainTicker, setChainTicker] = useState("AAPL");
  const [chainData, setChainData] = useState<ChainData | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [chainLoading, setChainLoading] = useState(false);

  // Strategy
  const [stratId, setStratId] = useState("iron_condor");
  const [strategies, setStrategies] = useState<any[]>([]);
  const [stratResult, setStratResult] = useState<StrategyResult | null>(null);

  // Scenario
  const [scenResult, setScenResult] = useState<any>(null);
  const [scen2D, setScen2D] = useState<string>("0d"); // active time slice

  // AI
  const [ivRank, setIvRank] = useState("55");
  const [ivPct, setIvPct] = useState("60");
  const [outlook, setOutlook] = useState("neutral");
  const [aiResult, setAiResult] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load strategy list
  useEffect(() => {
    fetch(`${B}/api/options/strategies`).then(r => r.ok ? r.json() : []).then(setStrategies).catch(() => {});
  }, []);

  const params = useCallback(() => ({
    S: parseFloat(S), K: parseFloat(K), T_days: parseInt(T),
    r: parseFloat(r) / 100, sigma: parseFloat(sig) / 100,
    q: parseFloat(q) / 100, option_type: optType,
  }), [S, K, T, r, sig, q, optType]);

  // ── Price ──────────────────────────────────────────────────────────────────
  async function handlePrice() {
    setLoading(true); setError("");
    try {
      const p = params();
      if (model === "bs") {
        const res = await fetch(`${B}/api/options/price/bs`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
        setBsResult(await res.json());
      } else if (model === "binomial") {
        const res = await fetch(`${B}/api/options/price/binomial`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...p, N: parseInt(binoN), american }),
        });
        setBinoResult(await res.json());
      } else {
        const res = await fetch(`${B}/api/options/price/mc`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...p, n_sims: parseInt(nSims), exotic }),
        });
        setMcResult(await res.json());
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Chain ──────────────────────────────────────────────────────────────────
  async function loadChain(ticker?: string, expiry?: string) {
    const t = ticker || chainTicker;
    setChainLoading(true); setError("");
    try {
      const url = `${B}/api/options/chain/${t}${expiry ? `?expiry=${expiry}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setChainData(data);
      setSelectedExpiry(data.expiry);
      // Build smile from chain
      buildSmile(data.calls, data.puts, data.spot);
    } catch (e: any) { setError(String(e.message || e)); }
    finally { setChainLoading(false); }
  }

  function buildSmile(calls: ChainRow[], puts: ChainRow[], spot: number) {
    fetch(`${B}/api/options/vol-smile`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        S: spot, T_days: parseInt(T), r: parseFloat(r) / 100, q: parseFloat(q) / 100,
        chain_calls: calls.map(c => ({ strike: c.strike, mid: c.mid })),
        chain_puts:  puts.map(p => ({ strike: p.strike,  mid: p.mid  })),
      }),
    }).then(r => r.ok ? r.json() : null).then(setSmileData).catch(() => {});
  }

  // ── Strategy ───────────────────────────────────────────────────────────────
  async function handleStrategy() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${B}/api/options/strategy/preset`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: stratId, S: parseFloat(S), atm_premium: parseFloat(sig) / 100 * parseFloat(S) * 0.1 }),
      });
      setStratResult(await res.json());
      // Auto-run scenario
      const sr = await res.json().catch(() => null);
      if (sr?.legs) {
        const scenRes = await fetch(`${B}/api/options/scenario`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            legs: sr.legs, S: parseFloat(S), sigma: parseFloat(sig)/100,
            T_days: parseInt(T), r: parseFloat(r)/100, q: parseFloat(q)/100,
          }),
        });
        setScenResult(await scenRes.json());
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  // Fix strategy ATM premium calculation
  async function buildStrategyPayoff() {
    setLoading(true); setError("");
    try {
      const p = params();
      // Get ATM premium from BS first
      const bsRes = await fetch(`${B}/api/options/price/bs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, K: parseFloat(S) }),
      });
      const bs = await bsRes.json();
      const atm_prem = bs.price || 5;

      const res = await fetch(`${B}/api/options/strategy/preset`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: stratId, S: parseFloat(S), atm_premium: atm_prem }),
      });
      const data = await res.json();
      setStratResult(data);

      // Build scenario from those legs
      if (data.legs) {
        const scenRes = await fetch(`${B}/api/options/scenario`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            legs: data.legs, S: parseFloat(S), sigma: parseFloat(sig)/100,
            T_days: parseInt(T), r: parseFloat(r)/100, q: parseFloat(q)/100,
          }),
        });
        setScenResult(await scenRes.json());
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── AI ─────────────────────────────────────────────────────────────────────
  async function handleAI() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${B}/api/options/ai-analysis`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          S: parseFloat(S), K: parseFloat(K), T_days: parseInt(T),
          sigma: parseFloat(sig) / 100,
          iv_rank: parseFloat(ivRank), iv_pct: parseFloat(ivPct),
          pcr: chainData?.put_call_ratio?.vol_pcr,
          gex_regime: chainData?.gex?.regime,
          max_pain_strike: chainData?.max_pain?.max_pain_strike,
          outlook, ticker: chainTicker,
        }),
      });
      setAiResult(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Input panel (shared) ──────────────────────────────────────────────────
  const InputPanel = () => (
    <div className="flex flex-wrap gap-3 items-end p-4 bg-surface border-b border-border">
      {[
        { label: "Spot (S)", val: S, set: setS },
        { label: "Strike (K)", val: K, set: setK },
        { label: "Days (T)", val: T, set: setT },
        { label: "Risk-Free r (%)", val: r, set: setR },
        { label: "IV σ (%)", val: sig, set: setSig },
        { label: "Div Yield (%)", val: q, set: setQ },
      ].map(({ label, val, set }) => (
        <div key={label} className="flex flex-col gap-1">
          <label className="text-[10px] text-text-muted">{label}</label>
          <input value={val} onChange={e => set(e.target.value)} type="number" step="any"
            className="w-24 px-2 py-1.5 rounded bg-surface-2 border border-border text-sm text-text-primary font-mono focus:outline-none focus:border-accent" />
        </div>
      ))}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-text-muted">Type</label>
        <div className="flex rounded border border-border overflow-hidden">
          {(["call","put"] as const).map(t => (
            <button key={t} onClick={() => setOptType(t)}
              className={cn("px-3 py-1.5 text-xs capitalize",
                optType === t ? "bg-accent text-white" : "text-text-muted hover:text-text-primary")}>
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Tab: Pricer ───────────────────────────────────────────────────────────

  const PricerTab = () => (
    <div className="flex flex-col gap-4 p-5">
      {/* Model selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted">Model:</span>
        <div className="flex rounded border border-border overflow-hidden">
          {(["bs","binomial","mc"] as const).map(m => (
            <button key={m} onClick={() => setModel(m)}
              className={cn("px-3 py-1.5 text-xs",
                model === m ? "bg-accent text-white" : "text-text-muted hover:text-text-primary")}>
              {m === "bs" ? "Black-Scholes" : m === "binomial" ? "Binomial" : "Monte Carlo"}
            </button>
          ))}
        </div>
        {model === "binomial" && (
          <label className="flex items-center gap-1.5 text-xs text-text-muted ml-3">
            <input type="checkbox" checked={american} onChange={e => setAmerican(e.target.checked)} className="accent-accent" />
            American
          </label>
        )}
        {model === "mc" && (
          <select value={exotic} onChange={e => setExotic(e.target.value)}
            className="ml-2 px-2 py-1 rounded bg-surface border border-border text-xs text-text-primary">
            {["vanilla","asian","barrier_ko","barrier_ki","lookback"].map(o =>
              <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <button onClick={handlePrice} disabled={loading}
          className="ml-auto px-4 py-1.5 bg-accent text-white rounded text-xs font-medium hover:opacity-90 disabled:opacity-50">
          {loading ? "Computing…" : "Price"}
        </button>
      </div>

      {/* BS Results */}
      {model === "bs" && bsResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Option Price" value={`$${bsResult.price.toFixed(4)}`} color="text-accent" />
            <Stat label="Intrinsic Value" value={`$${bsResult.intrinsic.toFixed(4)}`} />
            <Stat label="Time Value" value={`$${bsResult.time_value.toFixed(4)}`} />
            <Stat label="Prob ITM" value={`${(bsResult.prob_itm*100).toFixed(1)}%`} />
            <Stat label="Call Price" value={`$${bsResult.call.toFixed(4)}`} color="text-green-400" />
            <Stat label="Put Price"  value={`$${bsResult.put.toFixed(4)}`}  color="text-red-400" />
            <Stat label="d₁" value={bsResult.d1.toFixed(4)} />
            <Stat label="d₂" value={bsResult.d2.toFixed(4)} />
          </div>
        </div>
      )}

      {/* Binomial */}
      {model === "binomial" && binoResult && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Price" value={`$${binoResult.price?.toFixed(4)}`} color="text-accent" />
            <Stat label="Up Factor (u)" value={binoResult.u?.toFixed(4)} />
            <Stat label="Down Factor (d)" value={binoResult.d?.toFixed(4)} />
            <Stat label="Risk-neutral p" value={binoResult.p?.toFixed(4)} />
          </div>
          <div>
            <p className="text-xs text-text-muted mb-2">Stock Price Tree (first 6 steps)</p>
            <div className="overflow-x-auto">
              <table className="text-[10px] font-mono border-collapse">
                {binoResult.stock_tree?.map((row: number[], i: number) => (
                  <tr key={i}>{row.map((v: number, j: number) =>
                    <td key={j} className="border border-border/30 px-2 py-1 text-text-muted">${v}</td>
                  )}</tr>
                ))}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Monte Carlo */}
      {model === "mc" && mcResult && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="MC Price" value={`$${mcResult.price?.toFixed(4)}`} color="text-accent" />
            <Stat label="BS Price" value={`$${mcResult.bs_price?.toFixed(4)}`} />
            <Stat label="Std Error" value={`±${mcResult.std_error?.toFixed(4)}`} />
            <Stat label="95% CI" value={`$${mcResult.ci_95?.[0]?.toFixed(2)} – $${mcResult.ci_95?.[1]?.toFixed(2)}`} />
          </div>
          {mcResult.sample_paths?.length > 0 && (
            <div>
              <p className="text-xs text-text-muted mb-1">Sample Paths ({mcResult.n_sims?.toLocaleString()} simulations)</p>
              <svg width="100%" viewBox="0 0 560 140" className="overflow-visible">
                {mcResult.sample_paths.map((path: number[], pi: number) => {
                  const xs = mcResult.time_axis || path.map((_: any, i: number) => i);
                  const allVals = mcResult.sample_paths.flat();
                  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
                  const xScale = (x: number) => 8 + (x / (xs[xs.length-1] || 1)) * 544;
                  const yScale = (v: number) => 8 + (1 - (v - minV) / (maxV - minV || 1)) * 124;
                  const pts = path.map((v: number, i: number) => `${xScale(xs[i]).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ");
                  return <polyline key={pi} points={pts} fill="none"
                    stroke={`hsl(${pi * 18}, 70%, 60%)`} strokeWidth={0.7} opacity={0.5} />;
                })}
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Tab: Greeks ───────────────────────────────────────────────────────────

  const GreeksTab = () => {
    const g = bsResult?.greeks;
    return (
      <div className="p-5 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">Greeks computed from current Black-Scholes inputs</p>
          <button onClick={handlePrice} disabled={loading}
            className="px-3 py-1 bg-accent text-white rounded text-xs hover:opacity-90 disabled:opacity-50">
            {loading ? "…" : "Compute"}
          </button>
        </div>
        {!g && <p className="text-sm text-text-muted text-center py-12">Press Compute to calculate Greeks</p>}
        {g && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-accent mb-3 uppercase tracking-wider">First-Order</p>
              <div className="space-y-2">
                <GreeksBar g={g.delta} label="Delta" scale={1} />
                <GreeksBar g={g.gamma} label="Gamma" scale={100} />
                <GreeksBar g={g.theta} label="Theta/d" scale={10} />
                <GreeksBar g={g.vega}  label="Vega" scale={10} />
                <GreeksBar g={g.rho}   label="Rho" scale={10} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Stat label="Delta" value={g.delta.toFixed(4)} color={g.delta > 0 ? "text-green-400" : "text-red-400"} />
                <Stat label="Gamma" value={g.gamma.toFixed(6)} />
                <Stat label="Theta ($/day)" value={g.theta.toFixed(4)} color="text-red-400" />
                <Stat label="Vega (per 1%)" value={g.vega.toFixed(4)} />
                <Stat label="Rho (per 1%)" value={g.rho.toFixed(4)} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-accent mb-3 uppercase tracking-wider">Second-Order</p>
              <div className="space-y-2">
                <GreeksBar g={g.vanna}  label="Vanna" scale={10} />
                <GreeksBar g={g.charm}  label="Charm" scale={100} />
                <GreeksBar g={g.vomma}  label="Vomma" scale={50} />
                <GreeksBar g={g.speed}  label="Speed" scale={1000} />
                <GreeksBar g={g.color}  label="Color" scale={10000} />
                <GreeksBar g={g.zomma}  label="Zomma" scale={1000} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Stat label="Vanna" value={g.vanna.toFixed(6)} />
                <Stat label="Charm" value={g.charm.toFixed(6)} />
                <Stat label="Vomma" value={g.vomma.toFixed(6)} />
                <Stat label="Speed" value={g.speed.toFixed(6)} />
                <Stat label="Color" value={g.color.toFixed(6)} />
                <Stat label="Zomma" value={g.zomma.toFixed(6)} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Tab: Vol Surface ──────────────────────────────────────────────────────

  const VolTab = () => (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-3">
        <input value={chainTicker} onChange={e => setChainTicker(e.target.value.toUpperCase())}
          className="w-24 px-2 py-1.5 rounded bg-surface border border-border text-sm text-text-primary font-mono focus:outline-none focus:border-accent uppercase"
          placeholder="AAPL" />
        <button onClick={() => loadChain()} disabled={chainLoading}
          className="px-4 py-1.5 bg-accent text-white rounded text-xs font-medium hover:opacity-90 disabled:opacity-50">
          {chainLoading ? "Loading…" : "Load Vol Surface"}
        </button>
        {chainData && (
          <span className="text-xs text-text-muted">Spot: ${chainData.spot?.toFixed(2)}</span>
        )}
      </div>

      {smileData?.smile && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="ATM IV" value={`${smileData.smile.atm_iv?.toFixed(1)}%`} color="text-accent" />
            <Stat label="Skew (90-110%)" value={`${smileData.skew?.skew?.toFixed(2)}%`} />
            <Stat label="Put Skew" value={`${smileData.skew?.put_skew?.toFixed(2)}%`} />
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs text-text-muted mb-3">Volatility Smile — {chainData?.expiry}</p>
            <SmileChart strikes={smileData.smile.strikes} ivs={smileData.smile.smile_iv} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-text-muted mb-2">Call IV by Strike</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {smileData.smile.strikes?.slice(0, 20).map((k: number, i: number) => (
                  <div key={k} className="flex justify-between text-xs px-2 py-1 rounded hover:bg-surface-2">
                    <span className="text-text-muted">${k}</span>
                    <span className="text-text-primary font-mono">{smileData.smile.call_ivs?.[i]?.toFixed(1) ?? "—"}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-text-muted mb-2">Put IV by Strike</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {smileData.smile.strikes?.slice(0, 20).map((k: number, i: number) => (
                  <div key={k} className="flex justify-between text-xs px-2 py-1 rounded hover:bg-surface-2">
                    <span className="text-text-muted">${k}</span>
                    <span className="text-text-primary font-mono">{smileData.smile.put_ivs?.[i]?.toFixed(1) ?? "—"}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      {!smileData && !chainLoading && (
        <p className="text-sm text-text-muted text-center py-12">Enter a ticker and load vol surface</p>
      )}
    </div>
  );

  // ── Tab: Chain ────────────────────────────────────────────────────────────

  const ChainTab = () => (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input value={chainTicker} onChange={e => setChainTicker(e.target.value.toUpperCase())}
          className="w-24 px-2 py-1.5 rounded bg-surface border border-border text-sm text-text-primary font-mono focus:outline-none focus:border-accent uppercase" />
        {chainData?.expirations && (
          <select value={selectedExpiry}
            onChange={e => { setSelectedExpiry(e.target.value); loadChain(chainTicker, e.target.value); }}
            className="px-2 py-1.5 rounded bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-accent">
            {chainData.expirations.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        )}
        <button onClick={() => loadChain()} disabled={chainLoading}
          className="px-4 py-1.5 bg-accent text-white rounded text-xs hover:opacity-90 disabled:opacity-50">
          {chainLoading ? "Loading…" : "Load Chain"}
        </button>
        {chainData && (
          <div className="flex gap-3 text-xs text-text-muted">
            <span>Spot: <b className="text-text-primary">${chainData.spot?.toFixed(2)}</b></span>
            <span>Max Pain: <b className="text-accent">${chainData.max_pain?.max_pain_strike}</b></span>
            <span>P/C Ratio: <b className={chainData.put_call_ratio?.vol_pcr > 1 ? "text-red-400" : "text-green-400"}>
              {chainData.put_call_ratio?.vol_pcr?.toFixed(2)}</b>
            </span>
            <span>GEX: <b className={chainData.gex?.total_gex > 0 ? "text-green-400" : "text-red-400"}>
              {chainData.gex?.total_gex ? `$${(chainData.gex.total_gex/1e6).toFixed(0)}M` : "—"}
            </b></span>
          </div>
        )}
      </div>

      {chainData && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-accent/20">
                {["IV","Volume","OI","Bid","Ask","Last"].map(h =>
                  <th key={h} className="px-2 py-1.5 text-text-muted text-right border border-border/30">{h}</th>
                )}
                <th className="px-3 py-1.5 text-accent text-center border border-border font-bold">Strike</th>
                {["IV","Volume","OI","Bid","Ask","Last"].map(h =>
                  <th key={h+"p"} className="px-2 py-1.5 text-text-muted text-right border border-border/30">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const allStrikes = Array.from(new Set([
                  ...chainData.calls.map(c => c.strike),
                  ...chainData.puts.map(p => p.strike),
                ])).sort((a, b) => a - b);
                const cMap = Object.fromEntries(chainData.calls.map(c => [c.strike, c]));
                const pMap = Object.fromEntries(chainData.puts.map(p => [p.strike, p]));
                return allStrikes.map(strike => {
                  const c = cMap[strike]; const p = pMap[strike];
                  const isATM = Math.abs(strike - chainData.spot) / chainData.spot < 0.015;
                  return (
                    <tr key={strike} className={cn("hover:bg-surface-2",
                      isATM ? "bg-accent/5" : "",
                      c?.inTheMoney ? "opacity-80" : "")}>
                      {[c?.impliedVolatility, c?.volume, c?.openInterest, c?.bid, c?.ask, c?.lastPrice].map((v, i) => (
                        <td key={i} className="px-2 py-1 text-right text-text-muted border border-border/20 font-mono">
                          {v !== undefined && v !== null ?
                            i === 0 ? `${(Number(v)*100).toFixed(1)}%` :
                            i >= 3 ? `$${Number(v).toFixed(2)}` :
                            Number(v).toLocaleString() : "—"}
                        </td>
                      ))}
                      <td className={cn("px-3 py-1 text-center border border-border font-bold",
                        isATM ? "text-accent" : "text-text-primary")}>
                        ${strike}
                      </td>
                      {[p?.impliedVolatility, p?.volume, p?.openInterest, p?.bid, p?.ask, p?.lastPrice].map((v, i) => (
                        <td key={i+"p"} className="px-2 py-1 text-right text-text-muted border border-border/20 font-mono">
                          {v !== undefined && v !== null ?
                            i === 0 ? `${(Number(v)*100).toFixed(1)}%` :
                            i >= 3 ? `$${Number(v).toFixed(2)}` :
                            Number(v).toLocaleString() : "—"}
                        </td>
                      ))}
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Tab: Strategy ─────────────────────────────────────────────────────────

  const StratTab = () => {
    const byCategory: Record<string, any[]> = {};
    strategies.forEach(s => { (byCategory[s.category] = byCategory[s.category] || []).push(s); });
    return (
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={stratId} onChange={e => setStratId(e.target.value)}
            className="px-3 py-1.5 rounded bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent">
            {Object.entries(byCategory).map(([cat, strats]) => (
              <optgroup key={cat} label={cat}>
                {strats.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </optgroup>
            ))}
          </select>
          <button onClick={buildStrategyPayoff} disabled={loading}
            className="px-4 py-1.5 bg-accent text-white rounded text-xs font-medium hover:opacity-90 disabled:opacity-50">
            {loading ? "Building…" : "Build Strategy"}
          </button>
          {stratResult && (
            <span className="text-xs text-text-muted italic">{stratResult.description}</span>
          )}
        </div>

        {stratResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              <Stat label="Max Profit" value={stratResult.max_profit === Infinity ? "Unlimited" : `$${stratResult.max_profit.toFixed(2)}`} color="text-green-400" />
              <Stat label="Max Loss" value={stratResult.max_loss === -Infinity ? "Unlimited" : `$${stratResult.max_loss.toFixed(2)}`} color="text-red-400" />
              <Stat label="Net Credit/Debit" value={`$${stratResult.net_credit.toFixed(2)}`} />
              <Stat label="Risk/Reward" value={stratResult.risk_reward ? `1:${stratResult.risk_reward.toFixed(2)}` : "Unlimited"} />
            </div>
            {stratResult.breakevens?.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {stratResult.breakevens.map(be => (
                  <span key={be} className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-2.5 py-1 rounded-full">
                    BE: ${be.toFixed(2)}
                  </span>
                ))}
              </div>
            )}
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-text-muted mb-3">Expiry Payoff Diagram</p>
              <PayoffChart result={stratResult} />
            </div>
            {stratResult.legs && (
              <div>
                <p className="text-xs font-semibold text-text-muted mb-2">Legs</p>
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="bg-surface-2">
                    {["Type","Strike","Premium","Position","Qty"].map(h =>
                      <th key={h} className="px-3 py-1.5 text-left text-text-muted border border-border/30">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {stratResult.legs.map((leg: any, i: number) => (
                      <tr key={i} className="hover:bg-surface-2">
                        <td className={cn("px-3 py-1.5 border border-border/20 capitalize font-medium",
                          leg.type === "call" ? "text-green-400" : leg.type === "put" ? "text-red-400" : "text-text-muted")}>
                          {leg.type}
                        </td>
                        <td className="px-3 py-1.5 border border-border/20 font-mono">${leg.K?.toFixed(2)}</td>
                        <td className="px-3 py-1.5 border border-border/20 font-mono">${leg.premium?.toFixed(2)}</td>
                        <td className={cn("px-3 py-1.5 border border-border/20 font-bold",
                          leg.position === 1 ? "text-green-400" : "text-red-400")}>
                          {leg.position === 1 ? "Long ↑" : "Short ↓"}
                        </td>
                        <td className="px-3 py-1.5 border border-border/20">{leg.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Tab: Scenario ─────────────────────────────────────────────────────────

  const ScenTab = () => {
    if (!scenResult) return (
      <div className="p-5">
        <p className="text-sm text-text-muted text-center py-12">
          Build a strategy first to see scenario analysis
        </p>
      </div>
    );
    const timeKeys = Object.keys(scenResult.grid || {});
    const activeGrid = scenResult.grid?.[scen2D] || {};
    const priceKeys = Object.keys(activeGrid);
    const volKeys = priceKeys.length > 0 ? Object.keys(activeGrid[priceKeys[0]] || {}) : [];
    return (
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">Days elapsed:</span>
          <div className="flex rounded border border-border overflow-hidden">
            {timeKeys.map(tk => (
              <button key={tk} onClick={() => setScen2D(tk)}
                className={cn("px-3 py-1 text-xs", scen2D === tk ? "bg-accent text-white" : "text-text-muted hover:text-text-primary")}>
                {tk}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="px-3 py-2 text-text-muted border border-border/30 bg-surface-2">Price \ Vol</th>
                {volKeys.map(vk => (
                  <th key={vk} className="px-3 py-2 text-text-muted border border-border/30 bg-surface-2">{vk}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {priceKeys.map(pk => (
                <tr key={pk}>
                  <td className="px-3 py-1.5 text-text-muted border border-border/30 bg-surface-2 font-medium">{pk}</td>
                  {volKeys.map(vk => (
                    <ScenarioCell key={vk} value={activeGrid[pk]?.[vk] ?? 0} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-text-muted">P&L change from current position value (before premium). Green = profit, Red = loss.</p>
      </div>
    );
  };

  // ── Tab: AI Insights ──────────────────────────────────────────────────────

  const AITab = () => (
    <div className="p-5 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        {[
          { label: "IV Rank (0-100)", val: ivRank, set: setIvRank },
          { label: "IV Percentile (0-100)", val: ivPct, set: setIvPct },
        ].map(({ label, val, set }) => (
          <div key={label} className="flex flex-col gap-1">
            <label className="text-[10px] text-text-muted">{label}</label>
            <input value={val} onChange={e => set(e.target.value)} type="number" step="1"
              className="w-28 px-2 py-1.5 rounded bg-surface border border-border text-sm font-mono focus:outline-none focus:border-accent" />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-text-muted">Outlook</label>
          <div className="flex rounded border border-border overflow-hidden">
            {OUTLOOK_OPTS.map(o => (
              <button key={o} onClick={() => setOutlook(o)}
                className={cn("px-3 py-1.5 text-xs capitalize",
                  outlook === o ? "bg-accent text-white" : "text-text-muted hover:text-text-primary")}>
                {o}
              </button>
            ))}
          </div>
        </div>
        <button onClick={handleAI} disabled={loading}
          className="px-4 py-1.5 bg-accent text-white rounded text-xs font-medium hover:opacity-90 disabled:opacity-50">
          {loading ? "Analyzing…" : "Generate Insights"}
        </button>
      </div>

      {aiResult && (
        <div className="space-y-4">
          {/* Main recommendation */}
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain size={14} className="text-accent" />
              <span className="text-xs font-semibold text-accent uppercase tracking-wider">AI Strategy Recommendation</span>
            </div>
            <p className="text-base font-bold text-text-primary mb-1">{aiResult.primary_strategy}</p>
            <p className="text-sm text-text-muted leading-relaxed">{aiResult.narrative}</p>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-4 gap-2">
            <Stat label="IV Regime" value={aiResult.iv_regime} />
            <Stat label="Expected Move" value={`±${aiResult.expected_move_pct?.toFixed(1)}%`} color="text-accent" />
            <Stat label="Upper 1-SD" value={`$${aiResult.expected_move_up?.toFixed(2)}`} color="text-green-400" />
            <Stat label="Lower 1-SD" value={`$${aiResult.expected_move_dn?.toFixed(2)}`} color="text-red-400" />
            <Stat label="Attractiveness" value={aiResult.score_card?.iv_attractiveness} />
            <Stat label="Timing" value={aiResult.score_card?.timing} />
            <Stat label="Complexity" value={aiResult.score_card?.complexity} />
            {aiResult.key_levels?.max_pain && (
              <Stat label="Max Pain" value={`$${aiResult.key_levels.max_pain?.toFixed(2)}`} />
            )}
          </div>

          {/* Risk notes */}
          {aiResult.risk_notes?.length > 0 && (
            <div className="space-y-1">
              {aiResult.risk_notes.map((note: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/5 border border-yellow-500/20 rounded px-3 py-2">
                  {note}
                </div>
              ))}
            </div>
          )}

          {/* GEX + PCR */}
          {(aiResult.gex_note || aiResult.pcr_note) && (
            <div className="grid grid-cols-2 gap-3">
              {aiResult.gex_note && (
                <div className="rounded border border-border bg-surface p-3">
                  <p className="text-[10px] text-text-muted uppercase mb-1">Gamma Exposure</p>
                  <p className="text-xs text-text-primary">{aiResult.gex_note}</p>
                </div>
              )}
              {aiResult.pcr_note && (
                <div className="rounded border border-border bg-surface p-3">
                  <p className="text-[10px] text-text-muted uppercase mb-1">Put/Call Sentiment</p>
                  <p className="text-xs text-text-primary">{aiResult.pcr_note}</p>
                </div>
              )}
            </div>
          )}

          {/* Unusual activity from chain */}
          {chainData && (() => {
            const unusual = [];
            const avgVol = (chainData.calls.reduce((s, c) => s + (c.volume || 0), 0) + chainData.puts.reduce((s, p) => s + (p.volume || 0), 0)) / Math.max(chainData.calls.length + chainData.puts.length, 1);
            const sorted = [...chainData.calls, ...chainData.puts].filter(c => (c.volume || 0) > avgVol * 3).sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 5);
            if (!sorted.length) return null;
            return (
              <div>
                <p className="text-xs font-semibold text-text-muted mb-2 uppercase tracking-wider">Unusual Activity Scanner</p>
                <div className="space-y-1.5">
                  {sorted.map((c, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded border border-border bg-surface text-xs">
                      <span className={c.type === "call" ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                        {c.type?.toUpperCase()} ${c.strike}
                      </span>
                      <span className="text-text-muted">Vol: {c.volume?.toLocaleString()}</span>
                      <span className="text-text-muted">OI: {c.openInterest?.toLocaleString()}</span>
                      <span className="text-text-muted">IV: {(c.impliedVolatility*100).toFixed(1)}%</span>
                      <span className="text-accent text-[10px]">
                        {((c.volume || 0) / Math.max(c.openInterest || 1, 1)).toFixed(1)}× OI
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-accent" />
          <h1 className="text-base font-semibold text-text-primary">Options Analytics</h1>
          <span className="text-xs text-text-muted ml-1">Institutional Derivatives Platform</span>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle size={11} />{error.slice(0, 60)}
            </span>
          )}
        </div>
      </div>

      {/* Shared inputs */}
      <InputPanel />

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border shrink-0">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2.5 text-xs transition-colors border-b-2 -mb-px whitespace-nowrap",
              tab === t ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-primary")}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "Pricer"      && <PricerTab />}
        {tab === "Greeks"      && <GreeksTab />}
        {tab === "Vol Surface" && <VolTab />}
        {tab === "Chain"       && <ChainTab />}
        {tab === "Strategy"    && <StratTab />}
        {tab === "Scenario"    && <ScenTab />}
        {tab === "AI Insights" && <AITab />}
      </div>
    </div>
  );
}
