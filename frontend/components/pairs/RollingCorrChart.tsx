"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

interface Props {
  data: { date: string; corr: number }[];
  height?: number;
}

export function RollingCorrChart({ data, height = 180 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
        <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => v?.slice(5)} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} width={36} domain={[-1, 1]} />
        <Tooltip formatter={(v: number) => v?.toFixed(3)} labelStyle={{ color: "#94a3b8" }} contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", borderRadius: 6, fontSize: 11 }} />
        <ReferenceLine y={0.7} stroke="#6366f1" strokeDasharray="3 2" strokeWidth={1} />
        <ReferenceLine y={0}   stroke="#334155" strokeWidth={1} />
        <Line dataKey="corr" stroke="#22d3ee" strokeWidth={1.8} dot={false} name="30d Corr" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
