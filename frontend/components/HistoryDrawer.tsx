"use client";
import { useEffect, useState } from "react";
import { X, RefreshCw } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";

export interface DrawerConfig {
  fetchUrl: string;
  color?: string;
}

interface ChartData {
  title: string;
  subtitle?: string;
  unit?: string;
  current?: number;
  data: { date: string; value: number }[];
  stats?: { min: number; max: number; chg_1m?: number; chg_6m?: number; chg_1y?: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  config: DrawerConfig | null;
}

export function HistoryDrawer({ open, onClose, config }: Props) {
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !config?.fetchUrl) return;
    setChartData(null); setError(null); setLoading(true);
    fetch(config.fetchUrl)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(d => setChartData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, config?.fetchUrl]);

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  if (!open) return null;

  const color = config?.color ?? "#6366f1";
  const stats = chartData?.stats;
  const points = chartData?.data ?? [];
  const current = chartData?.current ?? (points.length ? points[points.length - 1]?.value : null);
  const step = points.length > 36 ? 6 : points.length > 18 ? 3 : 1;

  function fmtVal(v: number | null) {
    if (v == null) return "—";
    if (v >= 10000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (v >= 1000)  return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
    if (v < 0.01)   return v.toFixed(4);
    if (v < 1)      return v.toFixed(3);
    return v.toFixed(2);
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border rounded-t-3xl"
        style={{ maxHeight: "85vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-2 pb-3">
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex items-center gap-2 text-text-muted">
                <RefreshCw size={14} className="animate-spin" />
                <span className="text-[13px]">Loading history…</span>
              </div>
            ) : error ? (
              <div className="text-negative text-[13px]">Failed to load: {error}</div>
            ) : (
              <>
                <div className="text-[17px] font-bold text-text-primary leading-tight">{chartData?.title}</div>
                {chartData?.subtitle && (
                  <div className="text-[11px] text-text-muted mt-0.5">
                    {chartData.subtitle}{chartData.unit ? ` · ${chartData.unit}` : ""}
                  </div>
                )}
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-3 flex items-center justify-center w-8 h-8 rounded-full bg-surface-2 text-text-muted hover:bg-border transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Stats row */}
        {chartData && (
          <div className="grid grid-cols-4 gap-2 px-5 mb-4">
            <div className="rounded-xl bg-surface-2 border border-border p-2.5 text-center">
              <div className="text-[9px] text-text-muted mb-0.5">Current</div>
              <div className="text-[12px] font-bold text-text-primary">{fmtVal(current ?? null)}</div>
            </div>
            {[
              { label: "1 Month", val: stats?.chg_1m },
              { label: "6 Month", val: stats?.chg_6m },
              { label: "1 Year",  val: stats?.chg_1y  },
            ].map(({ label, val }) => (
              <div key={label} className="rounded-xl bg-surface-2 border border-border p-2.5 text-center">
                <div className="text-[9px] text-text-muted mb-0.5">{label}</div>
                <div className={cn("text-[12px] font-bold",
                  val == null ? "text-text-muted" : val > 0 ? "text-positive" : "text-negative")}>
                  {val == null ? "—" : `${val > 0 ? "+" : ""}${val.toFixed(1)}%`}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 52-week range bar */}
        {stats && current != null && (
          <div className="px-5 mb-4">
            <div className="flex justify-between text-[9px] text-text-muted mb-1.5">
              <span>Low: {fmtVal(stats.min)}</span>
              <span className="text-text-primary font-semibold">Current: {fmtVal(current)}</span>
              <span>High: {fmtVal(stats.max)}</span>
            </div>
            <div className="h-2 bg-surface-2 rounded-full overflow-hidden relative">
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: `linear-gradient(to right, #ef444430, ${color}30)` }}
              />
              {stats.max !== stats.min && (
                <div
                  className="absolute top-0 bottom-0 w-1.5 rounded-full shadow"
                  style={{
                    left: `${Math.min(99, Math.max(1, ((current - stats.min) / (stats.max - stats.min)) * 100))}%`,
                    backgroundColor: color,
                    transform: "translateX(-50%)",
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* Chart */}
        {points.length > 1 && (
          <div className="px-4 pb-8">
            <div style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id={`hd-grad-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 8, fill: "#555" }}
                    tickLine={false}
                    axisLine={false}
                    interval={step - 1}
                  />
                  <YAxis
                    tick={{ fontSize: 8, fill: "#555" }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(v: number) =>
                      v >= 10000 ? `${(v/1000).toFixed(0)}k`
                      : v >= 1000 ? `${(v/1000).toFixed(1)}k`
                      : v < 0.01 ? v.toFixed(4)
                      : v < 1   ? v.toFixed(3)
                      : v.toFixed(v < 100 ? 1 : 0)
                    }
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f0f1a",
                      border: `1px solid ${color}50`,
                      borderRadius: 10,
                      fontSize: 11,
                      padding: "8px 12px",
                    }}
                    labelStyle={{ color: "#888", marginBottom: 3 }}
                    formatter={(v: number) => [fmtVal(v), chartData?.unit ?? "Value"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={color}
                    strokeWidth={2.5}
                    fill={`url(#hd-grad-${color.replace("#","")})`}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: color }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {!loading && !error && points.length <= 1 && (
          <div className="text-center text-text-muted text-[12px] py-10">No historical data available</div>
        )}
      </div>
    </>
  );
}
