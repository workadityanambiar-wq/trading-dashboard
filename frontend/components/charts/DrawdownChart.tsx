"use client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface DDPoint { date: string; drawdown: number | null }
interface Props { data: DDPoint[]; height?: number }

const FMT = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short" });

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg">
      <div className="text-text-muted mb-1">{label}</div>
      <span className="text-negative font-mono">{(val * 100).toFixed(2)}%</span>
    </div>
  );
}

export function DrawdownChart({ data, height = 200 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
          </linearGradient>
        </defs>
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
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          width={46}
          domain={["auto", 0]}
        />
        <ReferenceLine y={0} stroke="#3a3a50" />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone" dataKey="drawdown" name="Drawdown"
          stroke="#ef4444" strokeWidth={1.5}
          fill="url(#ddGrad)" connectNulls={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
