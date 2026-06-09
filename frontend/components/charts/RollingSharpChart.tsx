"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface SharpPoint { date: string; sharpe: number | null }
interface Props { data: SharpPoint[]; height?: number }

const FMT = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short" });

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg">
      <div className="text-text-muted mb-1">{label}</div>
      <span className={v >= 0 ? "text-positive" : "text-negative"}>{v?.toFixed(2)}</span>
    </div>
  );
}

export function RollingSharpChart({ data, height = 200 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => FMT.format(new Date(d))}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          minTickGap={80}
        />
        <YAxis
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          width={36}
          tickFormatter={(v) => v.toFixed(1)}
        />
        <ReferenceLine y={0} stroke="#3a3a50" />
        <ReferenceLine y={1} stroke="#22c55e22" strokeDasharray="4 4" label={{ value: "1.0", fill: "#6b6b80", fontSize: 9 }} />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone" dataKey="sharpe" name="Rolling Sharpe"
          stroke="#22d3ee" strokeWidth={1.5} dot={false} connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
