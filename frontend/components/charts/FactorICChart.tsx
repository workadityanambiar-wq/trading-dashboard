"use client";
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
} from "recharts";
import type { ICPoint } from "@/lib/api";

interface Props {
  data: ICPoint[];
  height?: number;
  yDomain?: [number, number];
}

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });

function formatDate(dateStr: string) {
  return MONTH_FMT.format(new Date(dateStr));
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg">
      <div className="text-text-muted mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex gap-2">
          <span style={{ color: p.color }}>{p.name}:</span>
          <span className="font-mono">{p.value?.toFixed(3)}</span>
        </div>
      ))}
    </div>
  );
}

export function FactorICChart({ data, height = 280, yDomain = [-0.15, 0.15] }: Props) {
  const filtered = data.filter((d) => d.ic !== null);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={filtered} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          minTickGap={60}
        />
        <YAxis
          domain={yDomain}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          tickFormatter={(v) => v.toFixed(2)}
        />
        <ReferenceLine y={0} stroke="#3a3a50" />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#6b6b80" }}
          iconType="line"
          iconSize={12}
        />
        <Line
          type="monotone"
          dataKey="ic"
          name="Monthly IC"
          stroke="#4b4b70"
          strokeWidth={1}
          dot={false}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="ic_3m_ma"
          name="3M MA"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
