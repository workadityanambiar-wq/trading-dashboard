"use client";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";

interface Props {
  data: { date: string; spread: number; rolling_mean: number; upper2: number; lower2: number; upper1: number; lower1: number }[];
  height?: number;
}

const fmt = (v: number) => v?.toFixed(4) ?? "—";

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-text-muted mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

export function SpreadChart({ data, height = 280 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#6b7280", fontSize: 10 }}
          tickFormatter={(v) => v?.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} width={56} tickFormatter={fmt} />
        <Tooltip content={<CustomTooltip />} />
        {/* ±2σ band */}
        <Area dataKey="upper2" stroke="none" fill="#6366f130" fillOpacity={1} name="Upper 2σ" />
        <Area dataKey="lower2" stroke="none" fill="#6366f130" fillOpacity={1} name="Lower 2σ" />
        {/* ±1σ band */}
        <Area dataKey="upper1" stroke="none" fill="#6366f120" fillOpacity={1} name="Upper 1σ" />
        <Area dataKey="lower1" stroke="none" fill="#6366f120" fillOpacity={1} name="Lower 1σ" />
        {/* Rolling mean */}
        <Line dataKey="rolling_mean" stroke="#94a3b8" strokeWidth={1.5} dot={false} name="Mean" strokeDasharray="4 2" />
        {/* Spread */}
        <Line dataKey="spread" stroke="#6366f1" strokeWidth={1.8} dot={false} name="Spread" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
