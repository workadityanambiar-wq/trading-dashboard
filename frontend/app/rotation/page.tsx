"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type SectorRotationPoint, type RotationQuadrant } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";
import { PageGuide } from "@/components/PageGuide";

// ── Quadrant config ───────────────────────────────────────────────────────────

const Q_COLOR: Record<RotationQuadrant, string> = {
  Leading:   "#22c55e",
  Improving: "#3b82f6",
  Weakening: "#f59e0b",
  Lagging:   "#ef4444",
};

const Q_BG: Record<RotationQuadrant, string> = {
  Leading:   "rgba(34,197,94,0.06)",
  Improving: "rgba(59,130,246,0.06)",
  Weakening: "rgba(245,158,11,0.06)",
  Lagging:   "rgba(239,68,68,0.06)",
};

const Q_DESC: Record<RotationQuadrant, string> = {
  Leading:   "Strong & accelerating — momentum longs",
  Improving: "Weak but turning — watch for rotation in",
  Weakening: "Strong but fading — reduce or tighten stops",
  Lagging:   "Weak & deteriorating — avoid or short",
};

// ── SVG Rotation Chart ────────────────────────────────────────────────────────

const SVG_W = 540;
const SVG_H = 540;
const PAD   = 48;

function toSVG(rx: number, rm: number, bound: number) {
  const usable = (SVG_W - PAD * 2) / 2;
  const x = SVG_W / 2 + (rx / bound) * usable;
  const y = SVG_H / 2 - (rm / bound) * usable; // flip y
  return { x, y };
}

function labelOffset(rx: number, rm: number): { dx: number; dy: number; anchor: "start" | "end" } {
  return { dx: rx >= 0 ? 11 : -11, dy: rm >= 0 ? -10 : 18, anchor: rx >= 0 ? "start" : "end" };
}

interface ChartProps { sectors: SectorRotationPoint[]; }

function RotationChart({ sectors }: ChartProps) {
  const vals  = sectors.flatMap((s) => [Math.abs(s.rs_ratio), Math.abs(s.rs_momentum)]);
  const bound = Math.max(1.5, ...vals) * 1.25;
  const cx    = SVG_W / 2;
  const cy    = SVG_H / 2;
  const usable = (SVG_W - PAD * 2) / 2;

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="w-full max-w-[540px]"
      style={{ background: "transparent" }}
    >
      {/* Quadrant backgrounds */}
      <rect x={cx} y={PAD} width={usable} height={usable} fill={Q_BG["Leading"]} />
      <rect x={PAD} y={PAD} width={usable} height={usable} fill={Q_BG["Improving"]} />
      <rect x={cx} y={cy} width={usable} height={usable} fill={Q_BG["Weakening"]} />
      <rect x={PAD} y={cy} width={usable} height={usable} fill={Q_BG["Lagging"]} />

      {/* Quadrant labels */}
      {(
        [
          { name: "Leading",   x: cx + usable - 4,  y: PAD + 14,          anchor: "end"   },
          { name: "Improving", x: PAD + 4,           y: PAD + 14,          anchor: "start" },
          { name: "Weakening", x: cx + usable - 4,  y: SVG_H - PAD - 6,   anchor: "end"   },
          { name: "Lagging",   x: PAD + 4,           y: SVG_H - PAD - 6,   anchor: "start" },
        ] as { name: RotationQuadrant; x: number; y: number; anchor: "start" | "end" }[]
      ).map(({ name, x, y, anchor }) => (
        <text
          key={name}
          x={x} y={y}
          fontSize={10}
          fontWeight={600}
          fill={Q_COLOR[name]}
          textAnchor={anchor}
          opacity={0.7}
        >
          {name.toUpperCase()}
        </text>
      ))}

      {/* Axis lines */}
      <line x1={cx} y1={PAD} x2={cx} y2={SVG_H - PAD} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      <line x1={PAD} y1={cy} x2={SVG_W - PAD} y2={cy} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

      {/* Axis tick labels */}
      {[-1, 1].map((sign) => {
        const tickVal = (bound * 0.6 * sign).toFixed(1);
        return (
          <g key={sign}>
            <text x={cx + sign * usable * 0.6} y={cy + 14} fontSize={8} fill="rgba(255,255,255,0.3)" textAnchor="middle">
              {Number(tickVal) > 0 ? "+" : ""}{tickVal}%
            </text>
            <text x={cx + 6} y={cy - sign * usable * 0.6 + 3} fontSize={8} fill="rgba(255,255,255,0.3)" textAnchor="start">
              {Number(tickVal) > 0 ? "+" : ""}{tickVal}%
            </text>
          </g>
        );
      })}

      {/* Axis labels */}
      <text x={SVG_W - PAD + 4} y={cy + 4} fontSize={9} fill="rgba(255,255,255,0.4)" textAnchor="start">RS →</text>
      <text x={cx} y={PAD - 6} fontSize={9} fill="rgba(255,255,255,0.4)" textAnchor="middle">Momentum ↑</text>

      {/* Trails */}
      {sectors.map((s) => {
        if (s.trail.length < 2) return null;
        const color = Q_COLOR[s.quadrant];
        return (
          <g key={`trail-${s.ticker}`}>
            {s.trail.slice(0, -1).map(([rx, rm], i) => {
              const [nx, nm] = s.trail[i + 1];
              const from = toSVG(rx, rm, bound);
              const to   = toSVG(nx, nm, bound);
              const opacity = 0.08 + (i / s.trail.length) * 0.55;
              return (
                <line
                  key={i}
                  x1={from.x} y1={from.y}
                  x2={to.x}   y2={to.y}
                  stroke={color}
                  strokeWidth={1.5}
                  opacity={opacity}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
        );
      })}

      {/* Dots + labels */}
      {sectors.map((s) => {
        const pos    = toSVG(s.rs_ratio, s.rs_momentum, bound);
        const color  = Q_COLOR[s.quadrant];
        const { dx, dy, anchor } = labelOffset(s.rs_ratio, s.rs_momentum);
        return (
          <g key={s.ticker}>
            <circle cx={pos.x} cy={pos.y} r={9}  fill={color} opacity={0.18} />
            <circle cx={pos.x} cy={pos.y} r={5.5} fill={color} opacity={0.95} />
            <text
              x={pos.x + dx}
              y={pos.y + dy}
              fontSize={10}
              fontWeight={700}
              fill={color}
              textAnchor={anchor}
            >
              {s.ticker}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Ranked table ──────────────────────────────────────────────────────────────

function pct(v: number, sign = true) {
  const s = (v * 100).toFixed(1);
  return sign && v > 0 ? `+${s}%` : `${s}%`;
}

function momArrow(v: number) {
  if (v >  0.3) return <span className="text-emerald-400 font-bold">↑</span>;
  if (v < -0.3) return <span className="text-red-400 font-bold">↓</span>;
  return <span className="text-text-muted">→</span>;
}

function RankedTable({ sectors, onRowClick }: { sectors: SectorRotationPoint[]; onRowClick: (ticker: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-surface">
            <th className="px-3 py-2.5 text-left text-text-muted font-medium w-6">#</th>
            <th className="px-3 py-2.5 text-left text-text-muted font-medium">Sector</th>
            <th className="px-3 py-2.5 text-left text-text-muted font-medium">Phase</th>
            <th className="px-3 py-2.5 text-right text-text-muted font-medium">RS Ratio</th>
            <th className="px-3 py-2.5 text-right text-text-muted font-medium">Momentum</th>
            <th className="px-3 py-2.5 text-right text-text-muted font-medium">1D</th>
            <th className="px-3 py-2.5 text-right text-text-muted font-medium">1W</th>
            <th className="px-3 py-2.5 text-right text-text-muted font-medium">1M</th>
            <th className="px-3 py-2.5 text-right text-text-muted font-medium">3M</th>
            <th className="px-3 py-2.5 text-right text-text-muted font-medium">YTD</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((s, i) => {
            const qColor = Q_COLOR[s.quadrant];
            return (
              <tr key={s.ticker} onClick={() => onRowClick(s.ticker)} className={cn("border-b border-border/50 hover:bg-surface-2/50 cursor-pointer", i % 2 !== 0 && "bg-surface/30")}>
                <td className="px-3 py-2.5 tabular-nums text-text-muted">{s.rs_rank}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold" style={{ color: qColor }}>{s.ticker}</span>
                    <span className="text-text-muted">{s.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs border font-medium"
                    style={{ color: qColor, borderColor: qColor + "44", backgroundColor: qColor + "12" }}
                  >
                    {s.quadrant}
                  </span>
                </td>
                <td className={cn("px-3 py-2.5 text-right tabular-nums font-medium",
                  s.rs_ratio >= 0 ? "text-emerald-400" : "text-red-400"
                )}>
                  {s.rs_ratio >= 0 ? "+" : ""}{s.rs_ratio.toFixed(2)}%
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span className={cn(s.rs_momentum >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {s.rs_momentum >= 0 ? "+" : ""}{s.rs_momentum.toFixed(2)}%
                  </span>
                  <span className="ml-1">{momArrow(s.rs_momentum)}</span>
                </td>
                {[s.change_1d, s.change_1w, s.change_1m, s.change_3m, s.change_ytd].map((v, j) => (
                  <td key={j} className={cn("px-3 py-2.5 text-right tabular-nums",
                    v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-text-muted"
                  )}>
                    {pct(v)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RotationPage() {
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["sector-rotation"],
    queryFn: api.getSectorRotation,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <PageGuide
        title="Sector Rotation (RRG) — Guide"
        subtitle="Relative Rotation Graph showing sector momentum vs. relative strength"
        steps={[
          { title: "Read the Four Quadrants", detail: "Leading (top-right): strong RS, improving momentum — longs here. Improving (bottom-right): weak RS but momentum turning up — watch for rotation in. Weakening (top-left): strong RS but losing momentum — reduce exposure. Lagging (bottom-left): weak RS and falling momentum — avoid or consider shorts." },
          { title: "Follow the Rotation Path", detail: "Sectors naturally rotate clockwise through the four quadrants over time. A sector in 'Improving' with strong upward trajectory is often the best entry." },
          { title: "Tap a Sector Dot", detail: "Click any sector dot on the chart to see its history chart popup, showing raw price action context behind its rotation position." },
          { title: "Read the Quadrant Breakdown", detail: "Below the chart, sectors are grouped by quadrant with their RS-Ratio and RS-Momentum values. Sectors with RS-Ratio > 100 and RS-Momentum > 100 are in the Leading quadrant." },
          { title: "Check the Rotation Summary", detail: "The summary panel shows which sectors are entering Leading (strong buy) vs. entering Lagging (strong avoid) this week based on recent trajectory." },
        ]}
        howItWorks={[
          { title: "JdK RS-Ratio Calculation", detail: "The RS-Ratio (x-axis) measures a sector's price relative to the S&P 500 benchmark, smoothed using a Jurik Moving Average-based algorithm. Values above 100 = sector is outperforming SPY." },
          { title: "JdK RS-Momentum Calculation", detail: "The RS-Momentum (y-axis) measures the rate of change of the RS-Ratio itself. Above 100 = the relative performance is accelerating; below 100 = decelerating." },
          { title: "Sector ETF Proxies", detail: "Each GICS sector is represented by its SPDR ETF: XLK (Tech), XLF (Financials), XLE (Energy), XLV (Healthcare), XLI (Industrials), XLY (Consumer Disc), XLP (Consumer Staples), XLU (Utilities), XLB (Materials), XLRE (Real Estate), XLC (Communication)." },
          { title: "Benchmark", detail: "The S&P 500 (SPY) is the benchmark at the center (100, 100). All sector readings are relative to SPY." },
        ]}
        tips={[
          "The best trades are sectors rotating from Improving into Leading with strong momentum.",
          "Sectors in Lagging with downward trajectory are best to underweight or avoid entirely.",
          "The rotation pattern is most reliable over 4-12 week periods; don't over-trade intraday signals on this chart.",
        ]}
      />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Sector Leadership Rotation</h1>
          <p className="text-xs text-text-muted mt-0.5">
            RS Ratio vs RS Momentum — 11 GICS sector ETFs vs SPY · 8-week trails
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.as_of && <span className="text-xs text-text-muted">As of {data.as_of}</span>}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Quadrant legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.entries(Q_COLOR) as [RotationQuadrant, string][]).map(([q, color]) => (
          <div key={q} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="font-medium" style={{ color }}>{q}</span>
            <span className="text-text-muted hidden sm:inline">— {Q_DESC[q]}</span>
          </div>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-64 text-text-muted text-sm gap-2">
          <RefreshCw size={14} className="animate-spin" /> Loading rotation data…
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-32 text-red-400 text-sm">
          Failed to load. Is the backend running?
        </div>
      )}

      {data?.sectors && data.sectors.length > 0 && (
        <>
          {/* Chart + summary cards */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">
            {/* RRG Chart */}
            <div className="xl:col-span-3 rounded-lg border border-border bg-surface p-4 flex justify-center">
              <RotationChart sectors={data.sectors} />
            </div>

            {/* Quadrant summary cards */}
            <div className="xl:col-span-2 grid grid-cols-2 gap-3">
              {(["Leading", "Improving", "Weakening", "Lagging"] as RotationQuadrant[]).map((q) => {
                const inQ = data.sectors.filter((s) => s.quadrant === q);
                const color = Q_COLOR[q];
                return (
                  <div
                    key={q}
                    className="rounded-lg border p-3"
                    style={{ borderColor: color + "33", backgroundColor: color + "08" }}
                  >
                    <div className="text-xs font-semibold mb-2" style={{ color }}>
                      {q}
                    </div>
                    {inQ.length === 0 ? (
                      <div className="text-xs text-text-muted">None</div>
                    ) : (
                      <div className="space-y-1.5">
                        {inQ.map((s) => (
                          <div key={s.ticker} onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${s.ticker}`, color: "#6366f1" })} className="flex items-center justify-between cursor-pointer hover:opacity-80">
                            <span className="text-xs font-medium" style={{ color }}>{s.ticker}</span>
                            <span className={cn("text-xs tabular-nums",
                              s.rs_momentum >= 0 ? "text-emerald-400" : "text-red-400"
                            )}>
                              {s.rs_momentum >= 0 ? "↑" : "↓"}{Math.abs(s.rs_momentum).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Axis explanation */}
              <div className="col-span-2 rounded border border-border bg-surface p-3 text-xs text-text-muted space-y-1">
                <div><span className="text-text-primary font-medium">RS Ratio</span> = % deviation of (sector/SPY) from its 1-year mean. Positive = outperforming.</div>
                <div><span className="text-text-primary font-medium">RS Momentum</span> = 4-week change in RS Ratio. Positive = acceleration.</div>
                <div><span className="text-text-primary font-medium">Trails</span> = last 8 weekly positions, fading from oldest to newest.</div>
              </div>
            </div>
          </div>

          {/* Ranked table */}
          <RankedTable sectors={data.sectors} onRowClick={(ticker) => setDrawer({ fetchUrl: `/api/chart/stock/${ticker}`, color: "#6366f1" })} />
        </>
      )}

      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}
