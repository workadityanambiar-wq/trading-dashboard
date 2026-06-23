"use client";
import { useMemo } from "react";
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
import { formatPct } from "@/lib/utils";

interface Props {
  data: QuintilePoint[];
  height?: number;
  logScale?: boolean;
  showBrush?: boolean;
}

const COLORS = {
  Q1: "#ef4444",
  Q2: "#f97316",
  Q3: "#6b6b80",
  Q4: "#22d3ee",
  Q5: "#22c55e",
};

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });
const YEAR_FMT  = new Intl.DateTimeFormat("en-US", { year: "numeric" });

const QUINTILES = ["Q1", "Q2", "Q3", "Q4", "Q5"] as const;

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
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg min-w-[120px]">
      <div className="text-text-muted mb-1">{MONTH_FMT.format(new Date(label))}</div>
      {sorted.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.dataKey}</span>
          <span className="font-mono">{p.value !== null ? formatPct(p.value) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

export function QuintileReturns({ data, height = 300, logScale = false, showBrush = false }: Props) {
  // For log scale: shift to "growth of $1" (1 + return) so all values > 0
  const chartData = useMemo(() => {
    if (!logScale) return data;
    return data.map((d) => {
      const out: Record<string, any> = { date: d.date };
      for (const q of QUINTILES) {
        const v = d[q];
        out[q] = v != null && v > -1 ? 1 + v : null;
      }
      return out as QuintilePoint;
    });
  }, [data, logScale]);

  const brushStart = showBrush ? Math.max(0, chartData.length - 60) : 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 4, right: 16, left: logScale ? -4 : -10, bottom: showBrush ? 8 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="date"
          tickFormatter={showBrush
            ? (d) => YEAR_FMT.format(new Date(d))
            : (d) => MONTH_FMT.format(new Date(d))}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          minTickGap={showBrush ? 48 : 80}
        />
        <YAxis
          scale={logScale ? "log" : "auto"}
          domain={logScale ? ["auto", "auto"] : undefined}
          allowDataOverflow={logScale}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          tickFormatter={logScale ? (v: number) => `${v.toFixed(1)}×` : formatPct}
        />
        {!logScale && <ReferenceLine y={0} stroke="#3a3a50" />}
        <Tooltip content={logScale ? <LogTooltip /> : <LinearTooltip />} />
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
        {showBrush && (
          <Brush
            dataKey="date"
            height={24}
            stroke="#2a2a38"
            fill="#111118"
            travellerWidth={6}
            startIndex={brushStart}
            tickFormatter={(d) => String(d).slice(0, 4)}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
