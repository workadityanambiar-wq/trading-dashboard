"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import type { BreadthHistoryPoint } from "@/lib/api";

interface Props {
  data:    BreadthHistoryPoint[];
  height?: number;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg min-w-[150px]">
      <div className="text-text-muted mb-1.5">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{p.value != null ? `${Math.round(p.value * 100)}%` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

export function BreadthHistoryChart({ data, height = 260 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => DATE_FMT.format(new Date(d))}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          minTickGap={70}
        />
        <YAxis
          tickFormatter={(v) => `${Math.round(v * 100)}%`}
          domain={[0, 1]}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          width={40}
        />
        <ReferenceLine y={0.5} stroke="#3a3a50" strokeDasharray="4 4" />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#6b6b80" }} iconType="line" iconSize={12} />
        <Line
          type="monotone" dataKey="pct_above_20ma" name="Above 20MA"
          stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls={false}
        />
        <Line
          type="monotone" dataKey="pct_above_50ma" name="Above 50MA"
          stroke="#6366f1" strokeWidth={2} dot={false} connectNulls={false}
        />
        <Line
          type="monotone" dataKey="pct_above_200ma" name="Above 200MA"
          stroke="#22c55e" strokeWidth={1.5} dot={false}
          strokeDasharray="5 3" connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
