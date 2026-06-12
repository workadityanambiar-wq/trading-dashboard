"use client";
import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────────
const pct = (v: number | null, d = 1) => v == null ? "—" : `${v.toFixed(d)}%`;
const num = (v: number | null, d = 2) => v == null ? "—" : v.toFixed(d);

function SCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: "green" | "red" | "yellow" | "blue";
}) {
  const c = accent === "green" ? "text-emerald-400" : accent === "red" ? "text-red-400"
    : accent === "yellow" ? "text-yellow-400" : accent === "blue" ? "text-blue-400" : "text-text-primary";
  return (
    <div className="bg-surface-2 rounded-lg border border-border p-3">
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={cn("text-lg font-bold font-mono", c)}>{value}</div>
      {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Correlation heatmap ────────────────────────────────────────────────────────
function CorrHeatmap({ tickers, flat }: { tickers: string[]; flat: { i: number; j: number; r: number }[] }) {
  const N = tickers.length;
  const size = Math.max(12, Math.min(28, Math.floor(560 / N)));
  const map: Record<string, number> = {};
  flat.forEach(({ i, j, r }) => { map[`${i},${j}`] = r; });

  const color = (r: number) => {
    if (r >= 0.8)  return "#22c55e";
    if (r >= 0.5)  return "#86efac";
    if (r >= 0.2)  return "#d1fae5";
    if (r >= -0.2) return "#f3f4f6";
    if (r >= -0.5) return "#fca5a5";
    if (r >= -0.8) return "#f87171";
    return "#ef4444";
  };

  return (
    <div className="overflow-auto">
      <div className="flex">
        <div style={{ width: size * 2 }} />
        {tickers.map((t, j) => (
          <div key={j} style={{ width: size, fontSize: 7, writingMode: "vertical-rl", textAlign: "left",
            color: "#6b7280", height: 60, overflow: "hidden", paddingBottom: 2 }}>
            {t}
          </div>
        ))}
      </div>
      {tickers.map((rowTk, i) => (
        <div key={i} className="flex items-center">
          <div style={{ width: size * 2, fontSize: 7, color: "#6b7280", overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 2 }}>
            {rowTk}
          </div>
          {tickers.map((_, j) => {
            const r = map[`${i},${j}`] ?? 0;
            return (
              <div key={j} title={`${tickers[i]} / ${tickers[j]}: ${r.toFixed(3)}`}
                style={{ width: size, height: size, background: color(r), flexShrink: 0,
                  border: "0.5px solid rgba(0,0,0,0.04)" }} />
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {[
          { label: "≥0.8", bg: "#22c55e" }, { label: "0.5–0.8", bg: "#86efac" },
          { label: "0–0.2", bg: "#f3f4f6" }, { label: "-0.5–0", bg: "#fca5a5" },
          { label: "≤-0.8", bg: "#ef4444" },
        ].map(({ label, bg }) => (
          <div key={label} className="flex items-center gap-1">
            <div style={{ width: 10, height: 10, background: bg, borderRadius: 2 }} />
            <span className="text-[10px] text-text-muted">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Factor loadings table ──────────────────────────────────────────────────────
function FactorCard({ f, idx }: { f: any; idx: number }) {
  const [open, setOpen] = useState(idx === 0);
  return (
    <div className="bg-surface-2 rounded-lg border border-border overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2/80"
        onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-accent font-mono">{f.factor}</span>
          <span className="text-xs text-text-muted">{pct(f.expl_var_pct)} of variance</span>
          <span className="text-xs bg-surface rounded px-2 py-0.5 text-text-muted font-mono">
            σ = {pct(f.vol_ann)} ann
          </span>
        </div>
        {open ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-emerald-400 uppercase tracking-wider mb-2 font-semibold">
              Top Long Exposures
            </div>
            {f.top_long.map((r: any) => (
              <div key={r.ticker} className="flex justify-between items-center py-0.5">
                <span className="text-xs font-mono text-text-primary">{r.ticker}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 rounded-full bg-surface overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, Math.abs(r.loading) * 500)}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 w-12 text-right">
                    {r.loading?.toFixed(3)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[10px] text-red-400 uppercase tracking-wider mb-2 font-semibold">
              Top Short Exposures
            </div>
            {f.top_short.map((r: any) => (
              <div key={r.ticker} className="flex justify-between items-center py-0.5">
                <span className="text-xs font-mono text-text-primary">{r.ticker}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 rounded-full bg-surface overflow-hidden">
                    <div className="h-full rounded-full bg-red-500"
                      style={{ width: `${Math.min(100, Math.abs(r.loading) * 500)}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-red-400 w-12 text-right">
                    {r.loading?.toFixed(3)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
const SP500_SAMPLE = "AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA,BRK-B,JPM,V,UNH,XOM,LLY,JNJ,WMT,MA,PG,HD,CVX,MRK,ABBV,PEP,KO,AVGO,COST,CSCO,TMO,ACN,MCD,ABT,BAC,CRM,NEE,NFLX,TXN,DHR,QCOM,DIS,BMY,PM,AMGN,INTC,UNP,RTX,LOW,SPGI,HON,IBM,GS,CAT";

export default function RiskModelPage() {
  const [tickerInput, setTickerInput] = useState(SP500_SAMPLE);
  const [period, setPeriod]           = useState("2y");
  const [halfLife, setHalfLife]       = useState(63);
  const [activeTab, setActiveTab]     = useState<"scree" | "factors" | "assets" | "corr" | "portfolio">("scree");

  const { mutate: run, data, isPending, error } = useMutation({
    mutationFn: () => api.estimateRiskModel({
      tickers: tickerInput.split(/[\s,]+/).map(t => t.trim()).filter(Boolean),
      period,
      half_life: halfLife,
    }),
  });

  // Prepare scree data with colour coding
  const screeData = useMemo(() => {
    if (!data?.scree) return [];
    return data.scree.map((d: any) => ({ ...d, fill: d.signal ? "#a78bfa" : "#374151" }));
  }, [data]);

  // Prepare asset risk sorted by total vol
  const assetRisk = useMemo(() => {
    if (!data?.asset_risk) return [];
    return [...data.asset_risk].sort((a: any, b: any) => b.total_vol - a.total_vol);
  }, [data]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-screen-2xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Statistical Factor Risk Model</h1>
        <p className="text-xs text-text-muted mt-0.5">
          EWMA covariance · Marchenko-Pastur RMT denoising · Ledoit-Wolf shrinkage · Σ = BΩ<sub>f</sub>B′ + D
        </p>
      </div>

      {/* Config panel */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">
              Tickers (comma or space separated · max 80)
            </label>
            <textarea
              rows={3}
              value={tickerInput}
              onChange={e => setTickerInput(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-accent resize-none"
              placeholder="AAPL, MSFT, GOOGL, ..."
            />
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Lookback Period</label>
              <select value={period} onChange={e => setPeriod(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-text-primary">
                <option value="6m">6 months</option>
                <option value="1y">1 year</option>
                <option value="2y">2 years</option>
                <option value="3y">3 years</option>
                <option value="5y">5 years</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">
                EWMA Half-Life: {halfLife}d
              </label>
              <input type="range" min={10} max={252} step={1} value={halfLife}
                onChange={e => setHalfLife(Number(e.target.value))}
                className="w-full accent-accent" />
              <div className="flex justify-between text-[9px] text-text-muted mt-0.5">
                <span>10d (fast)</span><span>63d (default)</span><span>252d (slow)</span>
              </div>
            </div>
            <button onClick={() => run()} disabled={isPending}
              className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 disabled:opacity-60 text-white rounded px-3 py-2 text-sm font-semibold transition-colors">
              {isPending ? <RefreshCw size={14} className="animate-spin" /> : null}
              {isPending ? "Estimating…" : "Run Risk Model"}
            </button>
          </div>
        </div>

        {/* Methodology note */}
        <div className="text-[10px] text-text-muted leading-relaxed border-t border-border pt-3">
          <strong className="text-text-primary">Methodology:</strong>
          {" "}Daily log-returns → EWMA covariance (half-life {halfLife}d) →
          eigendecomposition → Marchenko-Pastur clipping (noise eigenvalues replaced with their mean,
          preserving trace) → Ledoit-Wolf shrinkage → factor model Σ = BΩ<sub>f</sub>B′ + D
          (low-rank-plus-diagonal). VaR/CVaR parametric (Normal). All vols annualised (×252).
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle size={14} /> {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          {/* Model summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <SCard label="Assets"         value={String(data.n_assets)}   sub={`${data.n_obs} observations`} />
            <SCard label="Signal Factors" value={String(data.n_factors)}  sub="above MP threshold" accent="blue" />
            <SCard label="MP Threshold"   value={num(data.lambda_plus != null ? data.lambda_plus * 1e4 : null)} sub="×10⁻⁴ daily eigenvalue" />
            <SCard label="Period"         value={data.period}             sub={`½-life ${data.half_life}d`} />
            <SCard label="EW Port Vol"    value={pct(data.portfolio?.port_vol)} sub="annualised" accent="yellow" />
            <SCard label="VaR 95%"        value={pct(data.portfolio?.var_95)}   sub="parametric (1Y)" accent="red" />
            <SCard label="CVaR 95%"       value={pct(data.portfolio?.cvar_95)}  sub="expected shortfall" accent="red" />
          </div>

          {/* Tabs */}
          <div className="bg-surface-2 rounded-lg border border-border">
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-border overflow-x-auto">
              {([
                { id: "scree",     label: "Eigenvalue Scree" },
                { id: "factors",   label: `Factors (${data.n_factors})` },
                { id: "assets",    label: "Asset Risk" },
                { id: "corr",      label: "Correlation Matrix" },
                { id: "portfolio", label: "Portfolio Decomp" },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={cn("px-3 py-2 text-xs font-medium rounded-t whitespace-nowrap transition-colors",
                    activeTab === t.id ? "bg-surface text-text-primary border border-b-0 border-border" : "text-text-muted hover:text-text-primary")}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* ── SCREE PLOT ──────────────────────────────────────────── */}
              {activeTab === "scree" && (
                <div className="space-y-4">
                  <div className="text-xs text-text-muted leading-relaxed">
                    <strong className="text-text-primary">Purple bars</strong> = signal eigenvalues (above Marchenko-Pastur edge).
                    {" "}<strong className="text-text-primary">Dark bars</strong> = noise eigenvalues (statistically indistinguishable from random).
                    {" "}The MP threshold at λ+ = {data.lambda_plus?.toExponential(3)} separates real co-movement from sampling noise.
                    The model retains <strong className="text-text-primary">{data.n_factors} factors</strong> — each represents a
                    latent risk driver (market, size, value, sector clusters, etc.) though they are not labelled by construction.
                  </div>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={screeData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
                      <XAxis dataKey="i" tick={{ fill: "#6b7280", fontSize: 9 }} label={{ value: "Eigenvalue rank", position: "insideBottom", offset: -2, fill: "#6b7280", fontSize: 9 }} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={60} tickFormatter={v => v.toExponential(1)} />
                      <Tooltip formatter={(v: number) => [v.toExponential(3), "Eigenvalue"]}
                        contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", fontSize: 10 }} />
                      <ReferenceLine y={data.lambda_plus} stroke="#f59e0b" strokeDasharray="4 2"
                        label={{ value: "MP edge λ+", fill: "#f59e0b", fontSize: 9, position: "insideTopRight" }} />
                      <Bar dataKey="eigenvalue">
                        {screeData.map((d: any, i: number) => (
                          <Cell key={i} fill={d.signal ? "#a78bfa" : "#374151"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Cumulative explained variance */}
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                      Cumulative Explained Variance — signal factors
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {data.factors?.map((f: any, i: number) => {
                        const cumPct = data.factors.slice(0, i + 1).reduce((s: number, x: any) => s + (x.expl_var_pct ?? 0), 0);
                        return (
                          <div key={f.factor} className="bg-surface rounded px-2 py-1 border border-border text-center min-w-[52px]">
                            <div className="text-[9px] text-text-muted">{f.factor}</div>
                            <div className="text-xs font-mono text-accent">{pct(f.expl_var_pct)}</div>
                            <div className="text-[9px] text-text-muted">cum {pct(cumPct)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── FACTORS ─────────────────────────────────────────────── */}
              {activeTab === "factors" && (
                <div className="space-y-2">
                  <p className="text-xs text-text-muted mb-4 leading-relaxed">
                    Each factor is a statistical portfolio (eigenvector) — they are <em>not</em> labelled by construction.
                    Stocks with high positive loadings co-move together when this factor is active;
                    high negative vs. positive loadings means the pair is a natural hedge.
                    Factor 1 is almost always the market. Factors 2–N loosely map to size, value, sector clusters.
                  </p>
                  {data.factors?.map((f: any, i: number) => (
                    <FactorCard key={f.factor} f={f} idx={i} />
                  ))}
                </div>
              )}

              {/* ── ASSET RISK ───────────────────────────────────────────── */}
              {activeTab === "assets" && (
                <div className="space-y-4">
                  <p className="text-xs text-text-muted leading-relaxed">
                    Each bar stacks <span className="text-accent">systematic risk</span> (factor-driven co-movement)
                    on top of <span className="text-text-muted">idiosyncratic risk</span> (stock-specific).
                    A high systematic % means the stock's risk is mostly explained by common factors — harder to diversify away by adding more stocks.
                  </p>
                  <ResponsiveContainer width="100%" height={Math.max(250, assetRisk.length * 18)}>
                    <BarChart data={assetRisk} layout="vertical" margin={{ top: 4, right: 60, left: 50, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 9 }} tickFormatter={v => `${v.toFixed(0)}%`} />
                      <YAxis type="category" dataKey="ticker" tick={{ fill: "#9ca3af", fontSize: 9 }} width={44} />
                      <Tooltip
                        formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]}
                        contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", fontSize: 10 }}
                      />
                      <Bar dataKey="systematic_vol" stackId="a" name="Systematic" fill="#a78bfa" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="specific_vol"   stackId="a" name="Idiosyncratic" fill="#374151" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-text-muted">
                          {["Ticker","Total Vol","Systematic Vol","Specific Vol","Factor %"].map(h => (
                            <th key={h} className="text-left py-2 px-2 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {assetRisk.map((a: any) => (
                          <tr key={a.ticker} className="border-b border-border/50 hover:bg-surface-2/40">
                            <td className="py-1.5 px-2 font-mono font-medium text-text-primary">{a.ticker}</td>
                            <td className="py-1.5 px-2 font-mono">{pct(a.total_vol)}</td>
                            <td className="py-1.5 px-2 font-mono text-accent">{pct(a.systematic_vol)}</td>
                            <td className="py-1.5 px-2 font-mono text-text-muted">{pct(a.specific_vol)}</td>
                            <td className="py-1.5 px-2">
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 rounded-full bg-surface overflow-hidden">
                                  <div className="h-full rounded-full bg-accent"
                                    style={{ width: `${Math.min(100, a.systematic_pct ?? 0)}%` }} />
                                </div>
                                <span className={cn("font-mono text-[10px]",
                                  (a.systematic_pct ?? 0) > 70 ? "text-yellow-400" : "text-text-primary")}>
                                  {pct(a.systematic_pct, 0)}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── CORRELATION MATRIX ───────────────────────────────────── */}
              {activeTab === "corr" && (
                <div className="space-y-3">
                  <p className="text-xs text-text-muted leading-relaxed">
                    Model-implied correlation (reconstructed from Σ = BΩ<sub>f</sub>B′ + D).
                    This is smoother than the raw sample correlation because noise eigenvalues have been replaced —
                    it better reflects true co-movement rather than fitting sampling artefacts.
                    Capped at 50 tickers for rendering.
                  </p>
                  <CorrHeatmap tickers={data.corr_tickers ?? []} flat={data.corr_flat ?? []} />
                </div>
              )}

              {/* ── PORTFOLIO DECOMP ─────────────────────────────────────── */}
              {activeTab === "portfolio" && data.portfolio && (
                <div className="space-y-5">
                  <p className="text-xs text-text-muted leading-relaxed">
                    Equal-weight portfolio across all {data.n_assets} assets.
                    VaR/CVaR are parametric (Gaussian) — multiply by √h for h-day horizon.
                    Systematic risk = variance fraction explained by the {data.n_factors} retained factors;
                    residual is idiosyncratic.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <SCard label="Portfolio Vol"  value={pct(data.portfolio.port_vol)}   accent="yellow" sub="annualised" />
                    <SCard label="1Y VaR 95%"      value={pct(data.portfolio.var_95)}    accent="red"    sub="loss not exceeded 95% of yrs" />
                    <SCard label="CVaR 95%"         value={pct(data.portfolio.cvar_95)}   accent="red"    sub="expected shortfall" />
                    <SCard label="VaR 99%"          value={pct(data.portfolio.var_99)}    accent="red"    sub="1-in-100 year" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <SCard label="Systematic %" value={pct(data.portfolio.systematic_pct)} accent="blue"  sub="factor-explained variance" />
                    <SCard label="Specific %"   value={pct(data.portfolio.specific_pct)}   sub="idiosyncratic variance" />
                  </div>

                  {/* Factor contribution bar */}
                  <div>
                    <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                      Factor Contribution to Portfolio Variance
                    </div>
                    <div className="space-y-2">
                      {data.portfolio.factor_contributions
                        ?.sort((a: any, b: any) => b.pct - a.pct)
                        .map((fc: any) => (
                          <div key={fc.factor} className="flex items-center gap-3">
                            <span className="text-xs font-mono text-accent w-8">{fc.factor}</span>
                            <div className="flex-1 h-3 rounded bg-surface overflow-hidden">
                              <div className="h-full rounded bg-accent/70"
                                style={{ width: `${Math.min(100, fc.pct ?? 0)}%` }} />
                            </div>
                            <span className="text-xs font-mono text-text-muted w-12 text-right">
                              {pct(fc.pct)}
                            </span>
                          </div>
                        ))}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-text-muted w-8">Spec.</span>
                        <div className="flex-1 h-3 rounded bg-surface overflow-hidden">
                          <div className="h-full rounded bg-surface-2"
                            style={{ width: `${Math.min(100, data.portfolio.specific_pct ?? 0)}%` }} />
                        </div>
                        <span className="text-xs font-mono text-text-muted w-12 text-right">
                          {pct(data.portfolio.specific_pct)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-text-muted bg-surface rounded-lg border border-border p-3 leading-relaxed">
                    <strong className="text-text-primary">Reading this:</strong> Systematic % measures how much of the portfolio's
                    risk is factor-driven (common across stocks) vs. idiosyncratic. A highly systematic portfolio can only be
                    hedged by shorting the statistical factors (or their proxies). High specific % means stock-picking risk
                    dominates — adding more uncorrelated names will reduce it further. The factor contributions show which
                    latent risk drivers dominate — F1 is almost always the market beta.
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!data && !isPending && (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <div className="text-4xl mb-4 opacity-20">Σ</div>
          <div className="text-sm">Configure tickers and click <strong>Run Risk Model</strong></div>
          <div className="text-xs mt-1 opacity-60">Pre-loaded with 50 S&P 500 names — takes ~10s to fetch prices + estimate</div>
        </div>
      )}
    </div>
  );
}
