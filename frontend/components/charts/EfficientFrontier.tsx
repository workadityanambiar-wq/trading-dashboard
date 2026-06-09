"use client";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Label,
} from "recharts";
import type { FrontierPoint, PortfolioMetrics } from "@/lib/api";
import { formatPct } from "@/lib/utils";

const METHOD_COLORS: Record<string, string> = {
  equal_weight: "#94a3b8",
  max_sharpe: "#22c55e",
  min_volatility: "#6366f1",
  hrp: "#f59e0b",
};

const METHOD_LABELS: Record<string, string> = {
  equal_weight: "Equal Weight",
  max_sharpe: "Max Sharpe",
  min_volatility: "Min Volatility",
  hrp: "HRP",
};

interface Props {
  frontier: FrontierPoint[];
  portfolios: Record<string, PortfolioMetrics>;
  height?: number;
}

export function EfficientFrontier({ frontier, portfolios, height = 320 }: Props) {
  const frontierData = frontier.map((p) => ({ x: p.volatility, y: p.expected_return }));

  const portfolioPoints = Object.entries(portfolios).map(([method, m]) => ({
    method,
    x: m.volatility,
    y: m.expected_return,
    sharpe: m.sharpe,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
          <XAxis
            type="number"
            dataKey="x"
            domain={["auto", "auto"]}
            tickFormatter={(v) => formatPct(v)}
            tick={{ fontSize: 10, fill: "#6b7280" }}
          >
            <Label value="Volatility (ann.)" position="insideBottom" offset={-16} fill="#6b7280" fontSize={10} />
          </XAxis>
          <YAxis
            type="number"
            dataKey="y"
            domain={["auto", "auto"]}
            tickFormatter={(v) => formatPct(v)}
            tick={{ fontSize: 10, fill: "#6b7280" }}
            width={52}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{ background: "#111118", border: "1px solid #1e1e2e", fontSize: 11 }}
            formatter={(value: number, name: string) => [formatPct(value), name === "x" ? "Vol" : "Ret"]}
          />

          {/* Frontier curve */}
          <Scatter
            name="Frontier"
            data={frontierData}
            fill="#3f3f5a"
            opacity={0.7}
            r={2}
          />

          {/* Portfolio overlays */}
          {portfolioPoints.map((p) => (
            <Scatter
              key={p.method}
              name={METHOD_LABELS[p.method] ?? p.method}
              data={[{ x: p.x, y: p.y }]}
              fill={METHOD_COLORS[p.method] ?? "#fff"}
              r={7}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {portfolioPoints.map((p) => (
          <div key={p.method} className="flex items-center gap-1.5 text-xs text-text-muted">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: METHOD_COLORS[p.method] ?? "#fff" }}
            />
            <span>{METHOD_LABELS[p.method] ?? p.method}</span>
            <span className="text-text-primary font-mono">
              {formatPct(p.y)} / {formatPct(p.x)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
