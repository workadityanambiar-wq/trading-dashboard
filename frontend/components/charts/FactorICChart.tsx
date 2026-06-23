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
  Brush,
} from "recharts";
import type { ICPoint } from "@/lib/api";

interface Props {
  data: ICPoint[];
  height?: number;
  yDomain?: [number | string, number | string];
  showBrush?: boolean;
  hideMonthlySeries?: boolean;
}

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });
const YEAR_FMT  = new Intl.DateTimeFormat("en-US", { year: "numeric" });

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

export function FactorICChart({
  data,
  height = 280,
  yDomain,
  showBrush = false,
  hideMonthlySeries = false,
}: Props) {
  const filtered = data.filter((d) => d.ic !== null);
  const domain: [number | string, number | string] = yDomain ?? ["auto", "auto"];

  // Default brush to show last ~5 years (60 points) for long-run data
  const brushStart = showBrush ? Math.max(0, filtered.length - 60) : 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={filtered} margin={{ top: 4, right: 16, left: -20, bottom: showBrush ? 8 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="date"
          tickFormatter={showBrush ? (d) => YEAR_FMT.format(new Date(d)) : formatDate}
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          minTickGap={showBrush ? 48 : 60}
        />
        <YAxis
          domain={domain}
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
        {!hideMonthlySeries && (
          <Line
            type="monotone"
            dataKey="ic"
            name="Monthly IC"
            stroke="#4b4b70"
            strokeWidth={1}
            dot={false}
            connectNulls={false}
          />
        )}
        <Line
          type="monotone"
          dataKey="ic_3m_ma"
          name="3M MA"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
        {showBrush && (
          <Brush
            dataKey="date"
            height={24}
            stroke="#2a2a38"
            fill="#111118"
            travellerWidth={6}
            startIndex={brushStart}
            tickFormatter={(d) => String(d).slice(0, 4)}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
