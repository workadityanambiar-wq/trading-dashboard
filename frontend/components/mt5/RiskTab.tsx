"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RefreshCw, ShieldAlert, TrendingUp, TrendingDown } from "lucide-react";

const fmt = (n: number, d = 2) => n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export function RiskTab({ connected }: { connected: boolean }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["mt5-risk"],
    queryFn: api.getMT5Risk,
    enabled: connected,
    refetchInterval: 5000,
  });

  if (!connected) return <div className="text-center text-text-muted py-12 text-sm">Connect MT5 to view live risk</div>;
  if (isLoading) return <div className="text-center text-text-muted py-12 text-sm">Loading risk data…</div>;
  if (!data) return <div className="text-center text-text-muted py-12 text-sm">No positions open</div>;

  const p = data.portfolio;

  const riskColor = p.total_risk_pct > 5 ? "text-red-400" : p.total_risk_pct > 2 ? "text-yellow-400" : "text-emerald-400";
  const varColor  = p.var_95_pct > 3 ? "text-red-400" : p.var_95_pct > 1 ? "text-yellow-400" : "text-emerald-400";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-xs text-text-muted">{p.n_positions} open position{p.n_positions !== 1 ? "s" : ""}</div>
        <button onClick={() => refetch()} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
          <RefreshCw size={11} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Portfolio summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface-2 rounded-lg border border-border p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Total Exposure</div>
          <div className="text-lg font-bold font-mono text-text-primary">${fmt(p.total_exposure)}</div>
          <div className="text-xs text-text-muted">{fmt(p.total_exposure_pct, 1)}% of balance</div>
        </div>
        <div className="bg-surface-2 rounded-lg border border-border p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Capital at Risk</div>
          <div className={cn("text-lg font-bold font-mono", riskColor)}>{fmt(p.total_risk_pct, 2)}%</div>
          <div className="text-xs text-text-muted">${fmt(p.total_risk_dollar)}</div>
        </div>
        <div className="bg-surface-2 rounded-lg border border-border p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">VaR 95% (Daily)</div>
          <div className={cn("text-lg font-bold font-mono", varColor)}>{fmt(p.var_95_pct, 2)}%</div>
          <div className="text-xs text-text-muted">${fmt(p.var_95_daily)}</div>
        </div>
        <div className="bg-surface-2 rounded-lg border border-border p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Floating P&L</div>
          <div className={cn("text-lg font-bold font-mono", p.floating_pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
            {p.floating_pnl >= 0 ? "+" : ""}{fmt(p.floating_pnl)}
          </div>
          <div className="text-xs text-text-muted">{p.floating_pnl_pct >= 0 ? "+" : ""}{fmt(p.floating_pnl_pct, 2)}%</div>
        </div>
      </div>

      {/* Direction + SL coverage */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface-2 rounded-lg border border-border p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Direction</div>
          <div className={cn("text-sm font-bold uppercase tracking-wide",
            p.direction === "net_long" ? "text-emerald-400" :
            p.direction === "net_short" ? "text-red-400" : "text-blue-400")}>
            {p.direction.replace("_", " ")}
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            L: ${fmt(p.net_long_exposure, 0)} / S: ${fmt(p.net_short_exposure, 0)}
          </div>
        </div>
        <div className="bg-surface-2 rounded-lg border border-border p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Stop Loss Coverage</div>
          <div className={cn("text-sm font-bold", p.positions_without_sl > 0 ? "text-red-400" : "text-emerald-400")}>
            {p.positions_with_sl}/{p.n_positions} protected
          </div>
          {p.positions_without_sl > 0 && (
            <div className="text-xs text-red-400 mt-0.5">{p.positions_without_sl} without SL!</div>
          )}
        </div>
        <div className="bg-surface-2 rounded-lg border border-border p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Margin Level</div>
          <div className={cn("text-sm font-bold font-mono",
            p.margin_level > 300 ? "text-emerald-400" : p.margin_level > 150 ? "text-yellow-400" : "text-red-400")}>
            {fmt(p.margin_level, 1)}%
          </div>
          <div className="text-xs text-text-muted">Margin: ${fmt(p.margin_used)}</div>
        </div>
      </div>

      {/* Per-position risk table */}
      {data.positions.length > 0 ? (
        <div>
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Per-Position Risk</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  {["Symbol","Side","Volume","Entry","Current","Pips","Risk $","Risk %","R:R","SL","TP"].map(h => (
                    <th key={h} className="text-left py-2 px-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.positions.map((p: any) => (
                  <tr key={p.ticket} className="border-b border-border/50 hover:bg-surface-2/40">
                    <td className="py-2 px-2 font-medium text-text-primary">{p.symbol}</td>
                    <td className="py-2 px-2">
                      <span className={cn("text-[10px] font-bold uppercase", p.type === 0 ? "text-emerald-400" : "text-red-400")}>
                        {p.type_label}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-mono">{p.volume}</td>
                    <td className="py-2 px-2 font-mono text-text-muted">{p.price_open.toFixed(4)}</td>
                    <td className="py-2 px-2 font-mono">{p.price_current.toFixed(4)}</td>
                    <td className={cn("py-2 px-2 font-mono", (p.current_pips ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {p.current_pips != null ? `${p.current_pips > 0 ? "+" : ""}${p.current_pips}` : "—"}
                    </td>
                    <td className="py-2 px-2 font-mono text-red-400">{fmt(p.risk_dollar)}</td>
                    <td className={cn("py-2 px-2 font-mono", p.risk_pct > 2 ? "text-red-400" : "text-text-primary")}>
                      {fmt(p.risk_pct, 2)}%
                    </td>
                    <td className={cn("py-2 px-2 font-mono", p.rr_ratio >= 2 ? "text-emerald-400" : p.rr_ratio >= 1 ? "text-yellow-400" : "text-text-muted")}>
                      {p.rr_ratio > 0 ? `1:${fmt(p.rr_ratio)}` : "—"}
                    </td>
                    <td className={cn("py-2 px-2 text-[10px]", p.has_sl ? "text-emerald-400" : "text-red-400")}>
                      {p.has_sl ? (p.sl_pips ? `${p.sl_pips}p` : "✓") : "⚠ None"}
                    </td>
                    <td className={cn("py-2 px-2 text-[10px]", p.has_tp ? "text-emerald-400" : "text-text-muted")}>
                      {p.has_tp ? (p.tp_pips ? `${p.tp_pips}p` : "✓") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center text-text-muted text-sm py-8">No open positions</div>
      )}
    </div>
  );
}
