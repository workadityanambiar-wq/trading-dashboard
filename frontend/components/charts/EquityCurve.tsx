"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { formatPct } from "@/lib/utils";

export interface CurvePoint {
  date: string;
  portfolio?: number | null;
  benchmark?: number | null;
}

interface Props {
  data: CurvePoint[];
  height?: number;
}

const YEAR_FMT = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short" });

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg min-w-[140px]">
      <div className="text-text-muted mb-1.5">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{p.value != null ? `${((p.value - 1) * 100).toFixed(1)}%` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function yFormatter(v: number) {
  return `${((v - 1) * 100).toFixed(0)}%`;
}

export function EquityCurve({ data, height = 320 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => YEAR_FMT.format(new Date(d))}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          minTickGap={80}
        />
        <YAxis
          tickFormatter={yFormatter}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          width={52}
        />
        <ReferenceLine y={1} stroke="#3a3a50" strokeDasharray="4 4" />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#6b6b80" }} iconType="line" iconSize={12} />
        <Line
          type="monotone" dataKey="portfolio" name="Strategy"
          stroke="#6366f1" strokeWidth={2} dot={false} connectNulls={false}
        />
        <Line
          type="monotone" dataKey="benchmark" name="SPY"
          stroke="#4b4b70" strokeWidth={1.5} dot={false}
          strokeDasharray="5 3" connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
