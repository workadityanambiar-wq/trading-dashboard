"use client";
import { useState, useMemo, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
  Brush,
} from "recharts";
import type { QuintilePoint } from "@/lib/api";
import { cn, formatPct } from "@/lib/utils";

interface Props {
  data: QuintilePoint[];
  height?: number;
  showBrush?: boolean;
  initialLogScale?: boolean;
}

const COLORS: Record<string, string> = {
  Q1: "#ef4444",
  Q2: "#f97316",
  Q3: "#6b6b80",
  Q4: "#22d3ee",
  Q5: "#22c55e",
  "Q5-Q1": "#a78bfa",
};

const QUINTILES = ["Q1", "Q2", "Q3", "Q4", "Q5"] as const;
type Q = typeof QUINTILES[number];

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });
const YEAR_FMT  = new Intl.DateTimeFormat("en-US", { year: "numeric" });

const PERIODS = [
  { label: "1Y",  months: 12 },
  { label: "3Y",  months: 36 },
  { label: "5Y",  months: 60 },
  { label: "10Y", months: 120 },
  { label: "20Y", months: 240 },
  { label: "All", months: 0 },
] as const;

function LogTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => (b.value ?? -99) - (a.value ?? -99));
  return (
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg min-w-[130px]">
      <div className="text-text-muted mb-1">{YEAR_FMT.format(new Date(label))}</div>
      {sorted.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.dataKey}</span>
          <span className="font-mono">{p.value != null ? `${p.value.toFixed(2)}×` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function LinearTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => (b.value ?? -99) - (a.value ?? -99));
  return (
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg min-w-[130px]">
      <div className="text-text-muted mb-1">{MONTH_FMT.format(new Date(label))}</div>
      {sorted.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.dataKey}</span>
          <span className="font-mono">{p.value != null ? formatPct(p.value) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function DrawdownTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
  return (
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg min-w-[130px]">
      <div className="text-text-muted mb-1">{MONTH_FMT.format(new Date(label))}</div>
      {sorted.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.dataKey}</span>
          <span className="font-mono text-red-400/90">{p.value != null ? formatPct(p.value) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

export function QuintileReturns({
  data,
  height = 300,
  showBrush = false,
  initialLogScale = false,
}: Props) {
  const [logScale, setLogScale]         = useState(initialLogScale);
  const [showSpread, setShowSpread]     = useState(false);
  const [view, setView]                 = useState<"returns" | "drawdown">("returns");
  const [activePeriod, setActivePeriod] = useState<string>(() =>
    showBrush && data.length >= 60 ? "5Y" : "All"
  );
  const [brushKey, setBrushKey]         = useState(0);
  const [brushRange, setBrushRange]     = useState(() => {
    const end   = Math.max(0, data.length - 1);
    const start = showBrush && data.length >= 60 ? Math.max(0, data.length - 60) : 0;
    return { start, end };
  });

  const applyPeriod = useCallback(
    (label: string, months: number) => {
      const end   = data.length - 1;
      const start = months === 0 ? 0 : Math.max(0, data.length - months);
      setBrushRange({ start, end });
      setActivePeriod(label);
      setBrushKey((k) => k + 1);
    },
    [data.length]
  );

  const onBrushChange = useCallback(
    (range: { startIndex?: number; endIndex?: number }) => {
      setBrushRange({
        start: range.startIndex ?? 0,
        end:   range.endIndex   ?? Math.max(0, data.length - 1),
      });
      setActivePeriod("");
    },
    [data.length]
  );

  // Build chart data — drawdown from all-time peak, or returns rebased to brushRange.start
  const chartData = useMemo(() => {
    if (!data.length) return [];

    if (view === "drawdown") {
      const peaks: Record<Q, number> = { Q1: 1, Q2: 1, Q3: 1, Q4: 1, Q5: 1 };
      return data.map((d) => {
        const out: Record<string, any> = { date: d.date };
        for (const q of QUINTILES) {
          const v = d[q];
          if (v == null || v <= -1) { out[q] = null; continue; }
          const gf = 1 + v;
          peaks[q] = Math.max(peaks[q], gf);
          out[q] = gf / peaks[q] - 1;
        }
        return out;
      });
    }

    // Rebase every quintile to 0% (linear) or 1× (log) at the brush window start
    const safeStart = Math.min(brushRange.start, data.length - 1);
    const bases: Record<string, number> = {};
    for (const q of QUINTILES) {
      const raw = data[safeStart]?.[q];
      bases[q] = raw != null ? 1 + raw : 1;
    }

    return data.map((d) => {
      const out: Record<string, any> = { date: d.date };
      for (const q of QUINTILES) {
        const v = d[q];
        if (v == null) { out[q] = null; continue; }
        const gf = (1 + v) / bases[q];
        out[q] = logScale ? gf : gf - 1;
      }
      if (showSpread) {
        const v5 = d.Q5;
        const v1 = d.Q1;
        if (v5 != null && v1 != null) {
          const gf5 = (1 + v5) / bases.Q5;
          const gf1 = (1 + v1) / bases.Q1;
          out["Q5-Q1"] = logScale ? gf5 - gf1 : (gf5 - 1) - (gf1 - 1);
        } else {
          out["Q5-Q1"] = null;
        }
      }
      return out;
    });
  }, [data, brushRange.start, logScale, showSpread, view]);

  // Stats for the selected window (only in returns mode)
  const periodStats = useMemo(() => {
    if (view === "drawdown" || !chartData.length) return null;
    const { start, end } = brushRange;
    const endIdx  = Math.min(end, chartData.length - 1);
    const endPt   = chartData[endIdx];
    const months  = endIdx - start + 1;
    if (!endPt || months <= 1) return null;
    return QUINTILES.map((q) => {
      const val = endPt[q] as number | null;
      if (val == null) return { q, total: null as number | null, ann: null as number | null };
      const total = logScale ? val - 1 : val;
      const ann   = Math.pow(1 + total, 12 / months) - 1;
      return { q, total, ann };
    });
  }, [chartData, brushRange, logScale, view]);

  const isLongSeries = data.length > 120;
  const useLogAxis   = logScale && view === "returns";

  return (
    <div>
      {showBrush && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {/* Period presets */}
          <div className="flex rounded border border-border overflow-hidden">
            {PERIODS.filter((p) => p.months === 0 || data.length >= p.months).map(({ label, months }) => (
              <button
                key={label}
                onClick={() => applyPeriod(label, months)}
                className={cn(
                  "px-2 py-0.5 text-xs transition-colors",
                  activePeriod === label
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Returns / Drawdown toggle */}
          <div className="flex rounded border border-border overflow-hidden">
            {(["returns", "drawdown"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-2 py-0.5 text-xs capitalize transition-colors",
                  view === v ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Log / Linear toggle — returns mode only */}
          {view === "returns" && (
            <button
              onClick={() => setLogScale((l) => !l)}
              className={cn(
                "px-2 py-0.5 text-xs rounded border transition-colors",
                logScale
                  ? "border-accent text-accent bg-accent/10"
                  : "border-border text-text-muted hover:text-text-primary"
              )}
            >
              {logScale ? "Log" : "Linear"}
            </button>
          )}

          {/* Q5−Q1 spread — returns mode only */}
          {view !== "drawdown" && (
            <button
              onClick={() => setShowSpread((s) => !s)}
              className={cn(
                "px-2 py-0.5 text-xs rounded border transition-colors",
                showSpread
                  ? "border-[#a78bfa] text-[#a78bfa] bg-[#a78bfa]/10"
                  : "border-border text-text-muted hover:text-text-primary"
              )}
            >
              Q5−Q1
            </button>
          )}
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 16, left: useLogAxis ? -4 : -10, bottom: showBrush ? 8 : 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
          <XAxis
            dataKey="date"
            tickFormatter={isLongSeries
              ? (d) => YEAR_FMT.format(new Date(d))
              : (d) => MONTH_FMT.format(new Date(d))}
            tick={{ fill: "#6b6b80", fontSize: 10 }}
            axisLine={{ stroke: "#2a2a38" }}
            tickLine={false}
            minTickGap={isLongSeries ? 48 : 80}
          />
          <YAxis
            scale={useLogAxis ? "log" : "auto"}
            domain={useLogAxis ? ["auto", "auto"] : undefined}
            allowDataOverflow={useLogAxis}
            tick={{ fill: "#6b6b80", fontSize: 10 }}
            axisLine={{ stroke: "#2a2a38" }}
            tickLine={false}
            tickFormatter={useLogAxis ? (v: number) => `${v.toFixed(1)}×` : formatPct}
          />
          <ReferenceLine y={useLogAxis ? 1 : 0} stroke="#3a3a50" />
          <Tooltip
            content={
              view === "drawdown"
                ? <DrawdownTooltip />
                : logScale
                ? <LogTooltip />
                : <LinearTooltip />
            }
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#6b6b80" }}
            iconType="line"
            iconSize={12}
          />
          {QUINTILES.map((q) => (
            <Line
              key={q}
              type="monotone"
              dataKey={q}
              name={q}
              stroke={COLORS[q]}
              strokeWidth={q === "Q1" || q === "Q5" ? 2.5 : 1}
              dot={false}
              connectNulls={false}
              opacity={q === "Q3" ? 0.5 : 1}
            />
          ))}
          {showSpread && view !== "drawdown" && (
            <Line
              type="monotone"
              dataKey="Q5-Q1"
              name="Q5−Q1"
              stroke={COLORS["Q5-Q1"]}
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              connectNulls={false}
            />
          )}
          {showBrush && (
            <Brush
              key={brushKey}
              dataKey="date"
              height={24}
              stroke="#2a2a38"
              fill="#111118"
              travellerWidth={6}
              startIndex={brushRange.start}
              endIndex={brushRange.end}
              onChange={onBrushChange as any}
              tickFormatter={(d) => String(d).slice(0, 4)}
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* Period stats bar */}
      {periodStats && showBrush && (
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {periodStats.map(({ q, total, ann }) => (
            <div key={q} className="rounded bg-surface-2/50 border border-border/50 px-2 py-1.5 text-center">
              <div className="text-[10px] font-medium mb-0.5" style={{ color: COLORS[q] }}>{q}</div>
              <div className={cn("font-mono text-[10px]", (total ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                {total != null ? formatPct(total, 1) : "—"}
              </div>
              <div className="text-text-muted/70 text-[9px] mt-0.5">
                {ann != null ? `${ann >= 0 ? "+" : ""}${(ann * 100).toFixed(1)}%/yr` : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
