"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const fmt = (n: number, d = 2) => n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export function MonteCarloTab({ connected }: { connected: boolean }) {
  const [days, setDays]    = useState(180);
  const [forward, setForward] = useState(100);

  const { data, isLoading } = useQuery({
    queryKey: ["mt5-mc", days, forward],
    queryFn: () => api.getMT5MonteCarlo(days, 500, forward),
    enabled: connected,
    staleTime: 120_000,
  });

  if (!connected) return <div className="text-center text-text-muted py-12 text-sm">Connect MT5 to run simulation</div>;
  if (isLoading) return <div className="text-center text-text-muted py-12 text-sm">Running Monte Carlo simulation…</div>;
  if (!data || data.error) return <div className="text-center text-text-muted py-12 text-sm">{data?.error ?? "Not enough trades to simulate"}</div>;

  const s = data.summary;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Historical:</span>
          {[90, 180, 365].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={cn("px-2 py-0.5 rounded text-xs border transition-colors",
                days === d ? "bg-accent text-white border-accent" : "text-text-muted border-border hover:text-text-primary")}>
              {d}d
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Forward trades:</span>
          {[50, 100, 200].map(f => (
            <button key={f} onClick={() => setForward(f)}
              className={cn("px-2 py-0.5 rounded text-xs border transition-colors",
                forward === f ? "bg-accent text-white border-accent" : "text-text-muted border-border hover:text-text-primary")}>
              {f}
            </button>
          ))}
        </div>
        <span className="text-xs text-text-muted ml-auto">500 simulated paths · bootstrap resampling</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Median Outcome",   value: `${s.median_final >= 0 ? "+" : ""}$${fmt(s.median_final)}`, accent: s.median_final >= 0 ? "green" : "red" },
          { label: "Best Case (p95)",  value: `+$${fmt(s.p95_final)}`,  accent: "green" },
          { label: "Worst Case (p5)",  value: `$${fmt(s.p5_final)}`,   accent: s.p5_final >= 0 ? "green" : "red" },
          { label: "Prob of Profit",   value: `${s.prob_profit_pct}%`, accent: s.prob_profit_pct >= 60 ? "green" : s.prob_profit_pct >= 40 ? "neutral" : "red" },
          { label: "Median Max DD",    value: `$${fmt(s.median_max_dd)}`, accent: "red" },
          { label: "Worst Case DD",    value: `$${fmt(s.worst_case_mdd)}`, accent: "red" },
        ].map(({ label, value, accent }) => (
          <div key={label} className="bg-surface-2 rounded-lg border border-border p-3">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</div>
            <div className={cn("text-sm font-bold font-mono",
              accent === "green" ? "text-emerald-400" : accent === "red" ? "text-red-400" : "text-text-primary")}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Fan chart */}
      <div className="bg-surface-2 rounded-lg border border-border p-4">
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Equity Fan Chart — next {forward} trades
          <span className="font-normal ml-2 normal-case text-text-muted">Shaded: 90% confidence interval · Line: median</span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.percentiles} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
            <XAxis dataKey="trade" tick={{ fill: "#6b7280", fontSize: 9 }} label={{ value: "Trade #", position: "insideBottom", offset: -2, fill: "#6b7280", fontSize: 9 }} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={56} tickFormatter={v => `$${v >= 0 ? "+" : ""}${v.toFixed(0)}`} />
            <Tooltip
              formatter={(v: number, name: string) => [`$${v >= 0 ? "+" : ""}${fmt(v)}`, name]}
              contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", fontSize: 10 }}
            />
            <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 2" />
            <Line dataKey="p95"  stroke="#34d399" strokeWidth={1} dot={false} name="p95 (best)"    strokeDasharray="3 2" />
            <Line dataKey="p75"  stroke="#6ee7b7" strokeWidth={1} dot={false} name="p75"           strokeOpacity={0.7} />
            <Line dataKey="p50"  stroke="#a78bfa" strokeWidth={2} dot={false} name="Median (p50)"  />
            <Line dataKey="p25"  stroke="#fca5a5" strokeWidth={1} dot={false} name="p25"           strokeOpacity={0.7} />
            <Line dataKey="p5"   stroke="#f87171" strokeWidth={1} dot={false} name="p5 (worst)"    strokeDasharray="3 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="text-[11px] text-text-muted bg-surface-2 rounded-lg border border-border p-3 leading-relaxed">
        <strong className="text-text-primary">How this works:</strong> We take your last {days} days of actual trade P&Ls and randomly resample them {forward} times, repeating this 500 times to simulate possible future paths. The fan shows the 5th/25th/50th/75th/95th percentile outcomes. This assumes future trades have similar characteristics to historical ones — past performance does not guarantee future results.
      </div>
    </div>
  );
}
