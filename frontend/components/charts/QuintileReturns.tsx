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
import type { QuintilePoint } from "@/lib/api";
import { formatPct } from "@/lib/utils";

interface Props {
  data: QuintilePoint[];
  height?: number;
}

const COLORS = {
  Q1: "#ef4444",
  Q2: "#f97316",
  Q3: "#6b6b80",
  Q4: "#22d3ee",
  Q5: "#22c55e",
};

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => (b.value ?? -99) - (a.value ?? -99));
  return (
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg min-w-[120px]">
      <div className="text-text-muted mb-1">{MONTH_FMT.format(new Date(label))}</div>
      {sorted.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.dataKey}</span>
          <span className="font-mono">{p.value !== null ? formatPct(p.value) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

export function QuintileReturns({ data, height = 300 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => MONTH_FMT.format(new Date(d))}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          minTickGap={80}
        />
        <YAxis
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          tickFormatter={formatPct}
        />
        <ReferenceLine y={0} stroke="#3a3a50" />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#6b6b80" }}
          iconType="line"
          iconSize={12}
        />
        {(["Q1", "Q2", "Q3", "Q4", "Q5"] as const).map((q) => (
          <Line
            key={q}
            type="monotone"
            dataKey={q}
            name={q}
            stroke={COLORS[q]}
            strokeWidth={q === "Q1" || q === "Q5" ? 2.5 : 1}
            dot={false}
            connectNulls={false}
            opacity={q === "Q3" ? 0.5 : 1}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
