"use client";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import type { VolHistoryPoint } from "@/lib/api";

interface Props {
  data:    VolHistoryPoint[];
  height?: number;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg min-w-[150px]">
      <div className="text-text-muted mb-1.5">{label}</div>
      {payload.map((p: any) => (
        p.value != null && (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="font-mono">{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</span>
          </div>
        )
      ))}
    </div>
  );
}

// Regime shading thresholds
const BANDS = [
  { y1: 0,  y2: 12, fill: "rgba(34,197,94,0.06)"  },  // Very Low
  { y1: 12, y2: 18, fill: "rgba(34,197,94,0.04)"  },  // Low
  { y1: 18, y2: 25, fill: "rgba(234,179,8,0.06)"  },  // Normal
  { y1: 25, y2: 35, fill: "rgba(249,115,22,0.08)" },  // Elevated
  { y1: 35, y2: 80, fill: "rgba(239,68,68,0.08)"  },  // High/Crisis
];

export function VIXHistoryChart({ data, height = 280 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
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
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          width={32}
          domain={[0, "auto"]}
        />
        {/* Regime zone reference lines */}
        <ReferenceLine y={12} stroke="#22c55e" strokeDasharray="2 4" strokeOpacity={0.4} />
        <ReferenceLine y={18} stroke="#eab308" strokeDasharray="2 4" strokeOpacity={0.4} />
        <ReferenceLine y={25} stroke="#f97316" strokeDasharray="2 4" strokeOpacity={0.5} />
        <ReferenceLine y={35} stroke="#ef4444" strokeDasharray="2 4" strokeOpacity={0.5} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#6b6b80" }} iconType="line" iconSize={12} />
        <Line
          type="monotone" dataKey="vix3m" name="VIX 3M"
          stroke="#6b6b80" strokeWidth={1} dot={false}
          strokeDasharray="4 2" connectNulls={false}
        />
        <Line
          type="monotone" dataKey="vix_ma50" name="MA 50"
          stroke="#4b4b70" strokeWidth={1.5} dot={false} connectNulls={false}
        />
        <Line
          type="monotone" dataKey="vix_ma20" name="MA 20"
          stroke="#6366f1" strokeWidth={1.5} dot={false} connectNulls={false}
        />
        <Line
          type="monotone" dataKey="vix" name="VIX"
          stroke="#ef4444" strokeWidth={2} dot={false} connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
