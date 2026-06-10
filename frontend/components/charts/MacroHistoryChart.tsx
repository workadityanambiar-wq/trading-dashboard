"use client";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { MacroHistoryPoint } from "@/lib/api";

interface Props {
  data:    MacroHistoryPoint[];
  height?: number;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg min-w-[170px]">
      <div className="text-text-muted mb-1.5">{label}</div>
      {payload.map((p: any) => (
        p.value != null && (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="font-mono">
              {p.dataKey === "y10" ? `${p.value.toFixed(2)}%` : p.value.toFixed(1)}
            </span>
          </div>
        )
      ))}
    </div>
  );
}

export function MacroHistoryChart({ data, height = 260 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => DATE_FMT.format(new Date(d))}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          minTickGap={70}
        />
        {/* Left axis: indexed returns */}
        <YAxis
          yAxisId="idx"
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          width={40}
          tickFormatter={(v) => `${v.toFixed(0)}`}
        />
        {/* Right axis: 10Y yield */}
        <YAxis
          yAxisId="yield"
          orientation="right"
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          width={36}
          tickFormatter={(v) => `${v.toFixed(1)}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#6b6b80" }} iconType="line" iconSize={12} />
        <Line
          yAxisId="idx" type="monotone" dataKey="spy_idx" name="SPY (idx)"
          stroke="#6366f1" strokeWidth={2} dot={false} connectNulls={false}
        />
        <Line
          yAxisId="idx" type="monotone" dataKey="tlt_idx" name="TLT (idx)"
          stroke="#22c55e" strokeWidth={1.5} dot={false}
          strokeDasharray="5 3" connectNulls={false}
        />
        <Line
          yAxisId="yield" type="monotone" dataKey="y10" name="10Y Yield"
          stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
