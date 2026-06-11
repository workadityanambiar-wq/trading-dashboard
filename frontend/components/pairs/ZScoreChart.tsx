"use client";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, ReferenceArea,
} from "recharts";

interface Props {
  data: { date: string; z_score: number }[];
  entryThreshold?: number;
  exitThreshold?: number;
  height?: number;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const z = payload[0]?.value;
  const color = z > 2 ? "#f87171" : z < -2 ? "#34d399" : "#94a3b8";
  return (
    <div className="bg-surface border border-border rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-text-muted mb-1">{label}</p>
      <p style={{ color }}>Z-Score: {z?.toFixed(3)}</p>
    </div>
  );
}

export function ZScoreChart({ data, entryThreshold = 2.0, exitThreshold = 0.5, height = 220 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
        <XAxis
          dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }}
          tickFormatter={(v) => v?.slice(5)} interval="preserveStartEnd"
        />
        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} width={40} />
        <Tooltip content={<CustomTooltip />} />

        {/* Shaded entry zones */}
        <ReferenceArea y1={entryThreshold} y2={4} fill="#f8717115" />
        <ReferenceArea y1={-4} y2={-entryThreshold} fill="#34d39915" />

        {/* Threshold lines */}
        <ReferenceLine y={entryThreshold}  stroke="#f87171" strokeDasharray="4 2" strokeWidth={1.2} label={{ value: `+${entryThreshold}`, fill: "#f87171", fontSize: 9 }} />
        <ReferenceLine y={-entryThreshold} stroke="#34d399" strokeDasharray="4 2" strokeWidth={1.2} label={{ value: `-${entryThreshold}`, fill: "#34d399", fontSize: 9 }} />
        <ReferenceLine y={exitThreshold}   stroke="#6b7280" strokeDasharray="2 3" strokeWidth={1} />
        <ReferenceLine y={-exitThreshold}  stroke="#6b7280" strokeDasharray="2 3" strokeWidth={1} />
        <ReferenceLine y={0}               stroke="#334155" strokeWidth={1} />

        <Line
          dataKey="z_score" stroke="#a78bfa" strokeWidth={1.8} dot={false} name="Z-Score"
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
