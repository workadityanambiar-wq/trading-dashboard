"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const fmt = (n: number, d = 2) => n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export function DrawdownTab({ connected }: { connected: boolean }) {
  const [days, setDays] = useState(180);

  const { data: perf, isLoading: loadingPerf } = useQuery({
    queryKey: ["mt5-performance", days],
    queryFn: () => api.getMT5Performance(days),
    enabled: connected, staleTime: 60_000,
  });

  const { data: dd, isLoading: loadingDd } = useQuery({
    queryKey: ["mt5-drawdown", days],
    queryFn: () => api.getMT5Drawdown(days),
    enabled: connected, staleTime: 60_000,
  });

  if (!connected) return <div className="text-center text-text-muted py-12 text-sm">Connect MT5 to view drawdown analysis</div>;
  if (loadingPerf || loadingDd) return <div className="text-center text-text-muted py-12 text-sm">Analysing drawdowns…</div>;
  if (!dd || dd.n_periods === 0) return <div className="text-center text-text-muted py-12 text-sm">No drawdown periods detected in the last {days} days</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted">Period:</span>
        {[90, 180, 365].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={cn("px-2.5 py-1 rounded text-xs border transition-colors",
              days === d ? "bg-accent text-white border-accent" : "text-text-muted border-border hover:text-text-primary")}>
            {d}d
          </button>
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Drawdown Periods",    value: String(dd.n_periods),                         sub: `${dd.total_time_in_drawdown_pct}% of time` },
          { label: "Deepest Drawdown",    value: `$${fmt(dd.deepest_dd)}`,                     sub: "absolute", red: true },
          { label: "Avg DD Depth",        value: `$${fmt(dd.avg_depth)}`,                      sub: "per period" },
          { label: "Avg Duration",        value: `${dd.avg_duration_trades} trades`,            sub: `max ${dd.longest_dd_trades}t` },
        ].map(({ label, value, sub, red }) => (
          <div key={label} className="bg-surface-2 rounded-lg border border-border p-3">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</div>
            <div className={cn("text-lg font-bold font-mono", red ? "text-red-400" : "text-text-primary")}>{value}</div>
            {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
          </div>
        ))}
      </div>

      {/* Underwater / drawdown curve */}
      {perf && perf.drawdown_series.length > 0 && (
        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Underwater Curve</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={perf.drawdown_series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
              <XAxis dataKey="idx" tick={{ fill: "#6b7280", fontSize: 9 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={52} tickFormatter={v => `$${v?.toFixed(0)}`} />
              <Tooltip formatter={(v: number) => [`$${fmt(v)}`, "Drawdown"]}
                contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#374151" />
              <Line dataKey="drawdown" stroke="#f87171" strokeWidth={1.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Drawdown periods table */}
      <div className="bg-surface-2 rounded-lg border border-border p-4">
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">All Drawdown Periods</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-text-muted">
                {["Start","End","Depth $","Depth %","Duration","Recovered"].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dd.periods.map((p: any, i: number) => (
                <tr key={i} className="border-b border-border/50 hover:bg-surface-2/40">
                  <td className="py-2 px-2 text-text-muted font-mono">{p.start}</td>
                  <td className="py-2 px-2 text-text-muted font-mono">{p.end}</td>
                  <td className="py-2 px-2 text-red-400 font-mono font-bold">${fmt(p.depth)}</td>
                  <td className="py-2 px-2">
                    <span className={cn("font-mono", p.depth_pct > 20 ? "text-red-400" : p.depth_pct > 10 ? "text-yellow-400" : "text-text-primary")}>
                      -{fmt(p.depth_pct, 1)}%
                    </span>
                  </td>
                  <td className="py-2 px-2 text-text-muted">{p.duration_trades} trades</td>
                  <td className="py-2 px-2">
                    {p.recovered
                      ? <span className="text-emerald-400">✓ Yes</span>
                      : <span className="text-yellow-400">⏳ Ongoing</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
