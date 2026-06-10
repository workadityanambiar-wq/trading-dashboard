"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type MacroAsset, type YieldPoint } from "@/lib/api";
import { MacroHistoryChart } from "@/components/charts/MacroHistoryChart";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}

function retColor(v: number | null): string {
  if (v == null) return "text-text-muted";
  if (v >= 0.02) return "text-emerald-400";
  if (v >= 0)    return "text-emerald-400/70";
  if (v >= -0.02)return "text-red-400/70";
  return "text-red-400";
}

function RetCell({ v }: { v: number | null }) {
  const Icon = v == null ? null : v >= 0.005 ? TrendingUp : v <= -0.005 ? TrendingDown : Minus;
  return (
    <td className={cn("px-2 py-2 text-right text-xs font-mono font-medium tabular-nums", retColor(v))}>
      <span className="flex items-center justify-end gap-0.5">
        {Icon && <Icon size={10} strokeWidth={2} />}
        {pct(v)}
      </span>
    </td>
  );
}

const CATEGORY_ORDER = ["Equity", "Bonds", "Credit", "Commodities", "FX", "Crypto"];
const CATEGORY_COLOR: Record<string, string> = {
  "Equity":      "text-indigo-400",
  "Bonds":       "text-emerald-400",
  "Credit":      "text-teal-400",
  "Commodities": "text-amber-400",
  "FX":          "text-blue-400",
  "Crypto":      "text-orange-400",
};

const RISK_MODE_STYLE: Record<string, { bg: string; border: string; text: string; desc: string }> = {
  "Risk-On":  { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400",
                desc: "Equities leading bonds · credit spreads tightening · momentum favored" },
  "Neutral":  { bg: "bg-amber-500/10",   border: "border-amber-500/30",   text: "text-amber-400",
                desc: "Mixed signals · balanced allocation · watch for directional break" },
  "Risk-Off": { bg: "bg-red-500/10",     border: "border-red-500/30",     text: "text-red-400",
                desc: "Bonds outperforming equities · defensive positioning preferred" },
};

// ── Yield curve chart (simple SVG sparkline) ──────────────────────────────────

function YieldCurveChart({ points }: { points: YieldPoint[] }) {
  if (points.length < 2) return null;

  const maturities = [0.25, 1, 2, 5, 10, 30];
  const available  = points.map(p => ({ x: p.maturity, curr: p.level, prev1m: p.prev_1m, prev1y: p.prev_1y, label: p.label }));

  const allVals = available.flatMap(p => [p.curr, p.prev1m, p.prev1y].filter((v): v is number => v != null));
  const minY = Math.floor(Math.min(...allVals) * 2) / 2;
  const maxY = Math.ceil(Math.max(...allVals) * 2) / 2 + 0.5;
  const rangeY = maxY - minY || 1;

  const W = 400, H = 160, PADL = 30, PADR = 10, PADT = 10, PADB = 28;
  const maxX = Math.log(30 + 1);

  function xPos(mat: number) {
    return PADL + (Math.log(mat + 1) / maxX) * (W - PADL - PADR);
  }
  function yPos(val: number) {
    return PADT + (1 - (val - minY) / rangeY) * (H - PADT - PADB);
  }
  function toPath(pts: { x: number; y: number }[]) {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  }

  const currPath = toPath(available.map(p => ({ x: xPos(p.x), y: yPos(p.curr) })));
  const prev1mPath = available[0].prev1m != null
    ? toPath(available.filter(p => p.prev1m != null).map(p => ({ x: xPos(p.x), y: yPos(p.prev1m!) })))
    : null;
  const prev1yPath = available[0].prev1y != null
    ? toPath(available.filter(p => p.prev1y != null).map(p => ({ x: xPos(p.x), y: yPos(p.prev1y!) })))
    : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
      {/* Y axis ticks */}
      {[minY, minY + rangeY / 4, minY + rangeY / 2, minY + rangeY * 0.75, maxY].map(v => (
        <g key={v}>
          <line x1={PADL} y1={yPos(v)} x2={W - PADR} y2={yPos(v)} stroke="#1e1e2e" strokeWidth={1} />
          <text x={PADL - 3} y={yPos(v) + 3} textAnchor="end" fontSize={8} fill="#6b6b80">{v.toFixed(1)}</text>
        </g>
      ))}
      {/* X axis labels */}
      {available.map(p => (
        <text key={p.label} x={xPos(p.x)} y={H - 6} textAnchor="middle" fontSize={9} fill="#6b6b80">{p.label}</text>
      ))}
      {/* Curves */}
      {prev1yPath && <path d={prev1yPath} fill="none" stroke="#3a3a50" strokeWidth={1.5} strokeDasharray="4 3" />}
      {prev1mPath && <path d={prev1mPath} fill="none" stroke="#6b6b80" strokeWidth={1.5} strokeDasharray="3 2" />}
      <path d={currPath} fill="none" stroke="#6366f1" strokeWidth={2.5} />
      {/* Dots on current */}
      {available.map(p => (
        <circle key={p.label} cx={xPos(p.x)} cy={yPos(p.curr)} r={3} fill="#6366f1" />
      ))}
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MacroPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey:      ["macro"],
    queryFn:       api.getMacro,
    staleTime:     5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const riskStyle = data ? (RISK_MODE_STYLE[data.risk_mode] ?? RISK_MODE_STYLE["Neutral"]) : null;

  const categories = CATEGORY_ORDER.filter(c =>
    data?.assets.some(a => a.category === c)
  );

  const filteredAssets = (data?.assets ?? []).filter(a =>
    activeCategory == null || a.category === activeCategory
  );

  const tnxPoint = data?.yield_curve.find(y => y.ticker === "^TNX");
  const spreadInverted = data?.spread_3m_10y != null && data.spread_3m_10y < 0;

  return (
    <div className="space-y-5 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base font-semibold">Macro Dashboard</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {data ? `Cross-asset · yield curve · risk mode · as of ${data.as_of ?? "—"}` : "Loading…"}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 rounded bg-surface-2 border border-border text-text-muted hover:text-text-primary disabled:opacity-50"
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-text-muted text-sm gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Fetching cross-asset data…
        </div>
      )}

      {data && (
        <>
          {/* Risk mode banner */}
          {riskStyle && (
            <div className={cn("flex items-center justify-between px-4 py-3 rounded-lg border flex-wrap gap-2",
              riskStyle.bg, riskStyle.border)}>
              <div className="flex items-center gap-3">
                <span className={cn("text-sm font-bold", riskStyle.text)}>{data.risk_mode}</span>
                <span className={cn("text-xs", riskStyle.text)}>20D equity vs bond signal</span>
              </div>
              <span className="text-xs text-text-muted">{riskStyle.desc}</span>
            </div>
          )}

          {/* Top row: yield curve + key yields */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Yield curve chart */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-medium">Treasury Yield Curve</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {spreadInverted
                      ? <span className="text-red-400">⚠ Inverted — 3M-10Y spread: {data.spread_3m_10y?.toFixed(2)}%</span>
                      : <span className="text-text-muted">3M-10Y spread: {data.spread_3m_10y != null ? `+${data.spread_3m_10y.toFixed(2)}%` : "—"}</span>
                    }
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-text-muted">
                  <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-indigo-500 inline-block rounded" /> Now</span>
                  <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#6b6b80] inline-block rounded" style={{borderTop: '1px dashed'}} /> 1M ago</span>
                  <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#3a3a50] inline-block rounded" /> 1Y ago</span>
                </div>
              </div>
              {data.yield_curve.length >= 2 ? (
                <YieldCurveChart points={data.yield_curve} />
              ) : (
                <div className="flex items-center justify-center h-32 text-text-muted text-xs">
                  Yield data not yet cached
                </div>
              )}
            </div>

            {/* Yield levels table */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-3">Yield Levels</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-text-muted border-b border-border">
                    <th className="text-left pb-2 font-normal">Maturity</th>
                    <th className="text-right pb-2 font-normal">Now</th>
                    <th className="text-right pb-2 font-normal">1M ago</th>
                    <th className="text-right pb-2 font-normal">Δ 1M</th>
                    <th className="text-right pb-2 font-normal">1Y ago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {data.yield_curve.map(y => {
                    const delta1m = y.prev_1m != null ? y.level - y.prev_1m : null;
                    return (
                      <tr key={y.ticker} className="hover:bg-surface-2 transition-colors">
                        <td className="py-2 text-text-primary font-medium">{y.label}</td>
                        <td className="py-2 text-right font-mono font-semibold text-text-primary">{y.level.toFixed(2)}%</td>
                        <td className="py-2 text-right font-mono text-text-muted">{y.prev_1m != null ? `${y.prev_1m.toFixed(2)}%` : "—"}</td>
                        <td className={cn("py-2 text-right font-mono",
                          delta1m == null ? "text-text-muted"
                          : delta1m > 0.1 ? "text-red-400" : delta1m < -0.1 ? "text-emerald-400"
                          : "text-text-muted")}>
                          {delta1m != null ? `${delta1m >= 0 ? "+" : ""}${delta1m.toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2 text-right font-mono text-text-muted">{y.prev_1y != null ? `${y.prev_1y.toFixed(2)}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cross-asset returns table */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="text-sm font-medium">Cross-Asset Returns</div>
              {/* Category filter */}
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={cn("px-2.5 py-1 rounded text-xs transition-colors",
                    activeCategory == null ? "bg-accent text-white" : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                  )}
                >All</button>
                {categories.map(c => (
                  <button key={c} onClick={() => setActiveCategory(activeCategory === c ? null : c)}
                    className={cn("px-2.5 py-1 rounded text-xs transition-colors",
                      activeCategory === c ? "bg-accent text-white"
                      : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                    )}
                  >{c}</button>
                ))}
              </div>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left pb-2 font-normal w-32">Asset</th>
                  <th className="text-left pb-2 font-normal text-text-muted/60">Category</th>
                  <th className="text-right pb-2 font-normal">1D</th>
                  <th className="text-right pb-2 font-normal">1W</th>
                  <th className="text-right pb-2 font-normal">1M</th>
                  <th className="text-right pb-2 font-normal">3M</th>
                  <th className="text-right pb-2 font-normal">YTD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredAssets.map(a => (
                  <tr key={a.ticker} className="hover:bg-surface-2 transition-colors">
                    <td className="py-2">
                      <div className="font-mono font-semibold text-text-primary">{a.ticker}</div>
                      <div className="text-text-muted text-[10px]">{a.label}</div>
                    </td>
                    <td className={cn("py-2 text-xs", CATEGORY_COLOR[a.category] ?? "text-text-muted")}>
                      {a.category}
                    </td>
                    <RetCell v={a.ret_1d} />
                    <RetCell v={a.ret_1w} />
                    <RetCell v={a.ret_1m} />
                    <RetCell v={a.ret_3m} />
                    <RetCell v={a.ret_ytd} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* History chart */}
          {data.history.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-1">1-Year: SPY vs TLT vs 10Y Yield</div>
              <div className="text-xs text-text-muted mb-4">
                SPY and TLT indexed to 100 at start · 10Y yield on right axis
              </div>
              <MacroHistoryChart data={data.history} height={260} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
