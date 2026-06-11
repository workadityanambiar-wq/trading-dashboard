"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Props {
  data: { date: string; hedge_ratio: number }[];
  height?: number;
}

export function HedgeRatioChart({ data, height = 180 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
        <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => v?.slice(5)} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} width={44} tickFormatter={(v) => v?.toFixed(2)} />
        <Tooltip formatter={(v: number) => v?.toFixed(4)} labelStyle={{ color: "#94a3b8" }} contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", borderRadius: 6, fontSize: 11 }} />
        <Line dataKey="hedge_ratio" stroke="#f59e0b" strokeWidth={1.8} dot={false} name="Hedge Ratio" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
