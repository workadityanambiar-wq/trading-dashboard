"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { AlertTriangle, Zap } from "lucide-react";

const fmt = (n: number, d = 2) => n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

// ── Calendar heatmap ───────────────────────────────────────────────────────────
function CalendarHeatmap({ data }: { data: { date: string; pnl: number; trades: number }[] }) {
  if (!data.length) return <div className="text-text-muted text-sm text-center py-4">No data</div>;

  const maxAbs = Math.max(...data.map(d => Math.abs(d.pnl)), 1);
  const byDate: Record<string, { pnl: number; trades: number }> = {};
  data.forEach(d => { byDate[d.date] = d; });

  // Build weeks grid from first to last date
  const first = new Date(data[0].date);
  const last  = new Date(data[data.length - 1].date);
  // Start from Monday of first week
  const start = new Date(first);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const weeks: Date[][] = [];
  let cur = new Date(start);
  while (cur <= last) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  const days = ["M","T","W","T","F","S","S"];

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-0.5 mt-1">
        <div className="flex flex-col gap-0.5 mr-1">
          {days.map((d, i) => (
            <div key={i} className="h-4 w-4 text-[9px] text-text-muted flex items-center justify-center">{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {week.map((date, di) => {
              const key = date.toISOString().slice(0, 10);
              const entry = byDate[key];
              const intensity = entry ? Math.abs(entry.pnl) / maxAbs : 0;
              const bg = !entry ? "bg-surface-2" :
                entry.pnl > 0 ? `bg-emerald-500` : `bg-red-500`;
              return (
                <div
                  key={di}
                  title={entry ? `${key}: ${entry.pnl >= 0 ? "+" : ""}${fmt(entry.pnl)} (${entry.trades}t)` : key}
                  style={{ opacity: entry ? 0.2 + intensity * 0.8 : 0.15 }}
                  className={cn("h-4 w-4 rounded-sm cursor-default transition-opacity", bg)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2 text-[10px] text-text-muted">
        <div className="w-3 h-3 rounded-sm bg-red-500 opacity-80" /> Loss
        <div className="w-3 h-3 rounded-sm bg-emerald-500 opacity-80 ml-2" /> Profit
        <div className="w-3 h-3 rounded-sm bg-surface-2 opacity-50 ml-2" /> No trades
      </div>
    </div>
  );
}

// ── Hour heatmap ───────────────────────────────────────────────────────────────
function HourHeatmap({ data }: { data: { hour: number; label: string; pnl: number; trades: number; win_rate: number }[] }) {
  if (!data.length) return <div className="text-text-muted text-sm text-center py-4">No hourly data</div>;
  const maxAbs = Math.max(...data.map(d => Math.abs(d.pnl)), 1);
  return (
    <div>
      <div className="flex gap-0.5 flex-wrap">
        {Array.from({ length: 24 }, (_, h) => {
          const entry = data.find(d => d.hour === h);
          const intensity = entry ? Math.abs(entry.pnl) / maxAbs : 0;
          const bg = !entry || entry.trades === 0 ? "bg-surface-2" :
            entry.pnl >= 0 ? "bg-emerald-500" : "bg-red-500";
          return (
            <div key={h} className="flex flex-col items-center gap-0.5">
              <div
                title={entry ? `${h}:00 — P&L: ${fmt(entry.pnl)} | ${entry.trades} trades | WR: ${entry.win_rate}%` : `${h}:00`}
                style={{ opacity: entry && entry.trades > 0 ? 0.2 + intensity * 0.8 : 0.1 }}
                className={cn("w-7 h-8 rounded cursor-default", bg)}
              />
              <span className="text-[8px] text-text-muted">{h}</span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-text-muted mt-1">Hour of day (server time). Darker = larger P&L magnitude.</div>
    </div>
  );
}

export function JournalTab({ connected }: { connected: boolean }) {
  const [days, setDays] = useState(90);
  const { data, isLoading } = useQuery({
    queryKey: ["mt5-journal", days],
    queryFn: () => api.getMT5Journal(days),
    enabled: connected,
    staleTime: 60_000,
  });

  if (!connected) return <div className="text-center text-text-muted py-12 text-sm">Connect MT5 to view journal</div>;
  if (isLoading) return <div className="text-center text-text-muted py-12 text-sm">Analysing trades…</div>;
  if (!data || data.total_closed === 0) return <div className="text-center text-text-muted py-12 text-sm">No closed trades in the last {days} days</div>;

  return (
    <div className="space-y-6">
      {/* Period */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted">Period:</span>
        {[30, 90, 180, 365].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={cn("px-2.5 py-1 rounded text-xs border transition-colors",
              days === d ? "bg-accent text-white border-accent" : "text-text-muted border-border hover:text-text-primary")}>
            {d}d
          </button>
        ))}
        <span className="ml-auto text-xs text-text-muted">{data.total_closed} closed trades</span>
      </div>

      {/* Calendar heatmap */}
      <div className="bg-surface-2 rounded-lg border border-border p-4">
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">P&L Calendar</div>
        <CalendarHeatmap data={data.calendar} />
      </div>

      {/* Hourly heatmap */}
      <div className="bg-surface-2 rounded-lg border border-border p-4">
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">P&L by Hour of Day</div>
        <HourHeatmap data={data.hourly} />
      </div>

      {/* Sessions + Long/Short */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Session Breakdown</div>
          <div className="space-y-2">
            {data.sessions.map((s: any) => (
              <div key={s.session} className="flex items-center gap-3">
                <div className="w-20 text-xs text-text-muted">{s.session}</div>
                <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", s.pnl >= 0 ? "bg-emerald-500" : "bg-red-500")}
                    style={{ width: `${Math.min(100, Math.abs(s.pnl) / Math.max(...data.sessions.map((x: any) => Math.abs(x.pnl)), 1) * 100)}%` }} />
                </div>
                <div className={cn("text-xs font-mono w-16 text-right", s.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {s.pnl >= 0 ? "+" : ""}{fmt(s.pnl)}
                </div>
                <div className="text-xs text-text-muted w-12 text-right">{s.win_rate}% WR</div>
                <div className="text-xs text-text-muted w-8 text-right">{s.trades}t</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Long vs Short</div>
          <div className="space-y-3">
            {[["Long", data.long_short?.long, "emerald"], ["Short", data.long_short?.short, "red"]].map(([label, s, color]: any) => s && (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className={cn("text-xs font-semibold", color === "emerald" ? "text-emerald-400" : "text-red-400")}>{label}</span>
                  <span className="text-xs text-text-muted">{s.trades} trades</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["Win Rate", `${s.win_rate}%`], ["Net P&L", `${s.pnl >= 0 ? "+" : ""}${fmt(s.pnl)}`], ["Avg P&L", `${fmt(s.trades > 0 ? s.pnl / s.trades : 0)}`]].map(([lbl, val]) => (
                    <div key={lbl} className="bg-surface rounded px-2 py-1.5">
                      <div className="text-[9px] text-text-muted">{lbl}</div>
                      <div className="text-xs font-mono font-bold text-text-primary">{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Duration buckets + P&L distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
            Trade Duration {data.avg_hold_minutes && <span className="font-normal normal-case text-text-muted ml-1">· avg {data.avg_hold_minutes < 60 ? `${data.avg_hold_minutes}m` : `${(data.avg_hold_minutes / 60).toFixed(1)}h`}</span>}
          </div>
          {data.duration_buckets.length > 0 ? (
            <div className="space-y-2">
              {data.duration_buckets.map((b: any) => (
                <div key={b.bucket} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-text-muted truncate">{b.bucket}</div>
                  <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", b.pnl >= 0 ? "bg-blue-500" : "bg-orange-500")}
                      style={{ width: `${b.trades / data.total_closed * 100}%` }} />
                  </div>
                  <div className="text-xs text-text-muted w-8 text-right">{b.trades}t</div>
                  <div className={cn("text-xs font-mono w-16 text-right", b.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {b.pnl >= 0 ? "+" : ""}{fmt(b.pnl)}
                  </div>
                  <div className="text-xs text-text-muted w-10 text-right">{b.win_rate}%</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-text-muted text-center py-4">Need position_id in deal history to compute hold times</div>
          )}
        </div>

        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">P&L Distribution</div>
          {data.pnl_histogram.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.pnl_histogram} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
                <XAxis dataKey="from" tick={{ fill: "#6b7280", fontSize: 8 }} tickFormatter={v => fmt(v, 0)} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={24} />
                <Tooltip formatter={(v: number) => [v, "Trades"]}
                  labelFormatter={(v: number) => `P&L ${fmt(v, 0)} to ${fmt(v, 0)}`}
                  contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", fontSize: 10 }} />
                <ReferenceLine x={0} stroke="#374151" />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {data.pnl_histogram.map((b: any, i: number) => (
                    <Cell key={i} fill={b.from >= 0 ? "#34d399" : "#f87171"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-xs text-text-muted text-center py-8">Not enough data</div>
          )}
        </div>
      </div>

      {/* Psychology flags */}
      {(data.revenge_trades.length > 0 || data.overtrading_days.length > 0) && (
        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle size={12} className="text-yellow-400" /> Psychology Flags
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.revenge_trades.length > 0 && (
              <div>
                <div className="text-xs text-yellow-400 font-medium mb-2">
                  {data.revenge_trades.length} possible revenge trade{data.revenge_trades.length > 1 ? "s" : ""}
                  <span className="text-text-muted font-normal ml-1">(trade within 30min of a loss)</span>
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {data.revenge_trades.slice(0, 5).map((r: any, i: number) => (
                    <div key={i} className="text-[11px] bg-yellow-500/5 border border-yellow-500/20 rounded px-2 py-1.5 flex items-center justify-between">
                      <span className="text-text-muted">{r.loss_time}</span>
                      <span className="text-red-400 font-mono">Loss {fmt(r.loss_pnl)}</span>
                      <span className="text-text-muted">→ {r.minutes_after}m later</span>
                      <span className={cn("font-mono", r.next_pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {r.next_pnl >= 0 ? "+" : ""}{fmt(r.next_pnl)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.overtrading_days.length > 0 && (
              <div>
                <div className="text-xs text-orange-400 font-medium mb-2">
                  {data.overtrading_days.length} overtrading day{data.overtrading_days.length > 1 ? "s" : ""}
                  <span className="text-text-muted font-normal ml-1">({">"} 2σ above avg)</span>
                </div>
                <div className="space-y-1.5">
                  {data.overtrading_days.map((d: any, i: number) => (
                    <div key={i} className="text-[11px] bg-orange-500/5 border border-orange-500/20 rounded px-2 py-1.5 flex items-center justify-between">
                      <span className="text-text-muted">{d.date}</span>
                      <span className="text-orange-400 font-mono">{d.trades} trades</span>
                      <span className="text-text-muted">threshold: {d.threshold}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
