"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { RollingBetaPoint } from "@/lib/api";

interface Props {
  data: RollingBetaPoint[];
  height?: number;
}

export function RollingBetaChart({ data, height = 200 }: Props) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center text-text-muted text-xs" style={{ height }}>
        No data
      </div>
    );
  }

  const thinned =
    data.length > 500 ? data.filter((_, i) => i % Math.ceil(data.length / 500) === 0) : data;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={thinned} margin={{ top: 8, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#6b7280" }}
          tickFormatter={(v: string) => v.slice(0, 7)}
          minTickGap={60}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#6b7280" }}
          width={38}
          tickFormatter={(v: number) => v.toFixed(2)}
        />
        <Tooltip
          contentStyle={{ background: "#111118", border: "1px solid #1e1e2e", fontSize: 11 }}
          formatter={(v: number) => [v.toFixed(3), "Beta"]}
          labelFormatter={(l) => String(l)}
        />
        <ReferenceLine y={1} stroke="#3f3f5a" strokeDasharray="4 4" label={{ value: "β=1", fill: "#6b7280", fontSize: 9 }} />
        <ReferenceLine y={0} stroke="#3f3f5a" />
        <Line
          type="monotone"
          dataKey="beta"
          stroke="#6366f1"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
