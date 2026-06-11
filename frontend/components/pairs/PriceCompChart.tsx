"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface Props {
  data: { date: string; p1: number; p2: number }[];
  ticker1: string;
  ticker2: string;
  height?: number;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-text-muted mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value?.toFixed(2)}</p>
      ))}
    </div>
  );
}

export function PriceCompChart({ data, ticker1, ticker2, height = 240 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
        <XAxis
          dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }}
          tickFormatter={(v) => v?.slice(5)} interval="preserveStartEnd"
        />
        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} width={44} tickFormatter={(v) => `${v?.toFixed(0)}`} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line dataKey="p1" stroke="#6366f1" strokeWidth={1.8} dot={false} name={ticker1} />
        <Line dataKey="p2" stroke="#f59e0b" strokeWidth={1.8} dot={false} name={ticker2} strokeDasharray="5 2" />
      </LineChart>
    </ResponsiveContainer>
  );
}
