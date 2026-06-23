"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api, MT5Position, MT5Deal, MT5Symbol, MT5Performance,
} from "@/lib/api";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { AlertTriangle, Activity, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageGuide } from "@/components/PageGuide";
import { RiskTab } from "@/components/mt5/RiskTab";
import { JournalTab } from "@/components/mt5/JournalTab";
import { DrawdownTab } from "@/components/mt5/DrawdownTab";
import { MonteCarloTab } from "@/components/mt5/MonteCarloTab";

// ── helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtPnl = (n: number, cls = "") => (
  <span className={cn("font-mono text-xs", n >= 0 ? "text-emerald-400" : "text-red-400", cls)}>
    {n >= 0 ? "+" : ""}{fmt(n)}
  </span>
);

const TYPE_LABEL: Record<number, string> = { 0: "BUY", 1: "SELL" };

function Badge({ v, children }: { v?: number; children: React.ReactNode }) {
  return (
    <span className={cn(
      "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
      v === 0 ? "bg-emerald-900/60 text-emerald-300" : "bg-red-900/60 text-red-300"
    )}>
      {children}
    </span>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: "green" | "red" | "neutral";
}) {
  const c = accent === "green" ? "text-emerald-400" : accent === "red" ? "text-red-400" : "text-text-primary";
  return (
    <div className="bg-surface-2 rounded-lg p-4 border border-border">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className={cn("text-xl font-semibold font-mono", c)}>{value}</div>
      {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Quick Trade ────────────────────────────────────────────────────────────────
function QuickTrade({ symbols }: { symbols: MT5Symbol[] }) {
  const qc = useQueryClient();
  const [sym, setSym]   = useState("");
  const [vol, setVol]   = useState("0.01");
  const [sl, setSl]     = useState("");
  const [tp, setTp]     = useState("");
  const [search, setSearch] = useState("");
  const [showDrop, setShowDrop] = useState(false);

  const filtered = search.length >= 1
    ? symbols.filter(s => s.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10)
    : [];

  const { mutate: place, isPending, error } = useMutation({
    mutationFn: (req: { symbol: string; order_type: "buy" | "sell"; volume: number; sl: number; tp: number }) =>
      api.placeMT5Order(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mt5-positions"] });
      setSym(""); setSearch(""); setVol("0.01"); setSl(""); setTp("");
    },
  });

  const go = (type: "buy" | "sell") => {
    if (!sym) return;
    place({ symbol: sym, order_type: type, volume: parseFloat(vol), sl: parseFloat(sl) || 0, tp: parseFloat(tp) || 0 });
  };

  return (
    <div className="bg-surface-2 rounded-lg border border-border p-4 space-y-3">
      <div className="text-sm font-semibold text-text-primary">Quick Trade</div>
      <div className="relative">
        <input
          className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          placeholder="Symbol (e.g. EURUSD)"
          value={search}
          onChange={e => { setSearch(e.target.value); setSym(e.target.value.toUpperCase()); setShowDrop(true); }}
          onFocus={() => setShowDrop(true)}
        />
        {showDrop && filtered.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-surface border border-border rounded shadow-lg max-h-40 overflow-y-auto">
            {filtered.map(s => (
              <button key={s.name} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 text-text-primary"
                onClick={() => { setSym(s.name); setSearch(s.name); setShowDrop(false); }}>
                <span className="font-medium">{s.name}</span>
                <span className="text-text-muted ml-2 text-xs">{s.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[["Volume", vol, setVol, "0.01"], ["Stop Loss", sl, setSl, "0"], ["Take Profit", tp, setTp, "0"]].map(([lbl, val, set, ph]) => (
          <div key={lbl as string}>
            <label className="text-xs text-text-muted mb-1 block">{lbl as string}</label>
            <input className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
              value={val as string} onChange={e => (set as any)(e.target.value)} placeholder={ph as string} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => go("buy")} disabled={!sym || isPending}
          className="py-2.5 rounded font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors">
          {isPending ? "…" : "BUY"}
        </button>
        <button onClick={() => go("sell")} disabled={!sym || isPending}
          className="py-2.5 rounded font-semibold text-sm bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white transition-colors">
          {isPending ? "…" : "SELL"}
        </button>
      </div>
      {error && <div className="text-xs text-red-400">{(error as Error).message}</div>}
    </div>
  );
}

// ── Symbol OHLCV chart ─────────────────────────────────────────────────────────
function SymbolChart() {
  const [sym, setSym] = useState("EURUSD");
  const [tf, setTf]   = useState("H1");
  const TFS = ["M1","M5","M15","M30","H1","H4","D1"];
  const { data, isFetching } = useQuery({
    queryKey: ["mt5-ohlcv", sym, tf],
    queryFn: () => api.getMT5OHLCV(sym, tf, 200),
    enabled: !!sym, retry: false,
  });
  return (
    <div className="bg-surface-2 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="w-24 bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-accent uppercase"
          value={sym} onChange={e => setSym(e.target.value.toUpperCase())} />
        <div className="flex gap-1">
          {TFS.map(t => (
            <button key={t} onClick={() => setTf(t)}
              className={cn("px-1.5 py-0.5 rounded text-xs transition-colors",
                tf === t ? "bg-accent text-white" : "text-text-muted hover:text-text-primary")}>
              {t}
            </button>
          ))}
        </div>
        {isFetching && <RefreshCw size={12} className="animate-spin text-text-muted ml-auto" />}
      </div>
      {data && data.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
            <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 9 }}
              tickFormatter={v => v?.slice(5, 16).replace("T", " ")} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={52}
              tickFormatter={v => v?.toFixed(4)} domain={["auto", "auto"]} />
            <Tooltip formatter={(v: number) => v?.toFixed(5)} labelStyle={{ color: "#94a3b8" }}
              contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", borderRadius: 6, fontSize: 10 }} />
            <Line dataKey="close" stroke="#60a5fa" strokeWidth={1.5} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-32 flex items-center justify-center text-text-muted text-sm">
          {isFetching ? "Loading…" : "No data"}
        </div>
      )}
    </div>
  );
}

// ── Positions table ────────────────────────────────────────────────────────────
function PositionsTable({ positions }: { positions: MT5Position[] }) {
  const qc = useQueryClient();
  const { mutate: closePos, isPending } = useMutation({
    mutationFn: (t: number) => api.closeMT5Position(t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mt5-positions"] }),
  });
  if (!positions.length) return <div className="text-center text-text-muted py-10 text-sm">No open positions</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-text-muted">
            {["Ticket","Symbol","Type","Volume","Open","Current","SL","TP","Swap","P&L",""].map(h => (
              <th key={h} className="text-left py-2 px-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map(p => (
            <tr key={p.ticket} className="border-b border-border/50 hover:bg-surface-2/50">
              <td className="py-2 px-2 text-text-muted">{p.ticket}</td>
              <td className="py-2 px-2 font-medium">{p.symbol}</td>
              <td className="py-2 px-2"><Badge v={p.type}>{TYPE_LABEL[p.type] ?? p.type}</Badge></td>
              <td className="py-2 px-2 font-mono">{p.volume}</td>
              <td className="py-2 px-2 font-mono">{fmt(p.price_open, 5)}</td>
              <td className="py-2 px-2 font-mono">{fmt(p.price_current, 5)}</td>
              <td className="py-2 px-2 font-mono text-text-muted">{p.sl ? fmt(p.sl, 5) : "—"}</td>
              <td className="py-2 px-2 font-mono text-text-muted">{p.tp ? fmt(p.tp, 5) : "—"}</td>
              <td className="py-2 px-2">{fmtPnl(p.swap)}</td>
              <td className="py-2 px-2">{fmtPnl(p.profit)}</td>
              <td className="py-2 px-2">
                <button onClick={() => closePos(p.ticket)} disabled={isPending}
                  className="p-1 rounded hover:bg-red-900/40 text-red-400 hover:text-red-300 transition-colors">
                  <X size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Deal history table ─────────────────────────────────────────────────────────
function DealHistory({ deals }: { deals: MT5Deal[] }) {
  if (!deals.length) return <div className="text-center text-text-muted py-10 text-sm">No deal history</div>;
  const ENTRY: Record<number, string> = { 0: "IN", 1: "OUT", 2: "IN/OUT" };
  return (
    <div className="overflow-x-auto max-h-80 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-border text-text-muted">
            {["Ticket","Symbol","Dir","Volume","Price","Profit","Comm","Time"].map(h => (
              <th key={h} className="text-left py-2 px-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...deals].reverse().map(d => (
            <tr key={d.ticket} className="border-b border-border/50 hover:bg-surface-2/50">
              <td className="py-1.5 px-2 text-text-muted">{d.ticket}</td>
              <td className="py-1.5 px-2 font-medium">{d.symbol}</td>
              <td className="py-1.5 px-2 text-text-muted">{ENTRY[d.entry] ?? d.entry}</td>
              <td className="py-1.5 px-2 font-mono">{d.volume}</td>
              <td className="py-1.5 px-2 font-mono">{fmt(d.price, 5)}</td>
              <td className="py-1.5 px-2">{fmtPnl(d.profit)}</td>
              <td className="py-1.5 px-2 text-text-muted font-mono">{fmt(d.commission)}</td>
              <td className="py-1.5 px-2 text-text-muted">{d.time.slice(0, 16).replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Performance analytics ──────────────────────────────────────────────────────
function PerformanceTab({ connected }: { connected: boolean }) {
  const [days, setDays] = useState(90);

  const { data: perf, isLoading, error } = useQuery({
    queryKey: ["mt5-performance", days],
    queryFn: () => api.getMT5Performance(days),
    enabled: connected,
    staleTime: 60_000,
  });

  if (!connected) return <div className="text-center text-text-muted py-12 text-sm">Connect MT5 terminal to view performance</div>;
  if (isLoading)  return <div className="text-center text-text-muted py-12 text-sm">Computing metrics…</div>;
  if (error || !perf) return <div className="text-center text-text-muted py-12 text-sm">No performance data — place some trades first</div>;
  if (perf.total_trades === 0) return <div className="text-center text-text-muted py-12 text-sm">No closed trades in the last {days} days</div>;

  const pfColor = perf.profit_factor >= 1.5 ? "text-emerald-400" : perf.profit_factor >= 1.0 ? "text-yellow-400" : "text-red-400";
  const ddColor = perf.max_drawdown_pct > 20 ? "text-red-400" : perf.max_drawdown_pct > 10 ? "text-yellow-400" : "text-emerald-400";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted">Period:</span>
        {[7, 30, 90, 180, 365].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={cn("px-2.5 py-1 rounded text-xs transition-colors",
              days === d ? "bg-accent text-white" : "text-text-muted hover:text-text-primary bg-surface-2 border border-border")}>
            {d}d
          </button>
        ))}
        <span className="ml-auto text-xs text-text-muted">{perf.total_trades} closed trades</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <div className="text-xs text-text-muted mb-1">Total P&L</div>
          <div className={cn("text-2xl font-semibold font-mono", perf.total_pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
            {perf.total_pnl >= 0 ? "+" : ""}{fmt(perf.total_pnl)}
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            <span className="text-emerald-400">+{fmt(perf.gross_profit)}</span>
            {" / "}
            <span className="text-red-400">-{fmt(perf.gross_loss)}</span>
          </div>
        </div>
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <div className="text-xs text-text-muted mb-1">Win Rate</div>
          <div className="text-2xl font-semibold font-mono text-text-primary">{perf.win_rate}%</div>
          <div className="text-xs text-text-muted mt-0.5">
            <span className="text-emerald-400">{perf.winners}W</span>
            {" / "}
            <span className="text-red-400">{perf.losers}L</span>
            {perf.breakeven > 0 && <span className="text-text-muted"> / {perf.breakeven}BE</span>}
          </div>
        </div>
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <div className="text-xs text-text-muted mb-1">Profit Factor</div>
          <div className={cn("text-2xl font-semibold font-mono", pfColor)}>
            {perf.profit_factor >= 999 ? "∞" : fmt(perf.profit_factor)}
          </div>
          <div className="text-xs text-text-muted mt-0.5">Expectancy: {fmt(perf.expectancy)}</div>
        </div>
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <div className="text-xs text-text-muted mb-1">Max Drawdown</div>
          <div className={cn("text-2xl font-semibold font-mono", ddColor)}>
            -{fmt(perf.max_drawdown_pct, 1)}%
          </div>
          <div className="text-xs text-text-muted mt-0.5">{fmt(perf.max_drawdown)} abs</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard label="Sharpe"          value={fmt(perf.sharpe)}         accent={perf.sharpe >= 1 ? "green" : perf.sharpe >= 0 ? "neutral" : "red"} />
        <StatCard label="Sortino"         value={fmt(perf.sortino)}        accent={perf.sortino >= 1 ? "green" : "neutral"} />
        <StatCard label="Recovery Factor" value={fmt(perf.recovery_factor)} />
        <StatCard label="Avg Win"         value={fmt(perf.avg_win)}        accent="green" />
        <StatCard label="Avg Loss"        value={fmt(perf.avg_loss)}       accent="red" />
        <StatCard label="Best Trade"      value={fmt(perf.max_win)}        accent="green" />
        <StatCard label="Worst Trade"     value={fmt(perf.max_loss)}       accent="red" />
        <StatCard label="Avg Trade"       value={fmt(perf.avg_trade_pnl)}  accent={perf.avg_trade_pnl >= 0 ? "green" : "red"} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Max Win Streak"  value={String(perf.consecutive_wins)}   accent="green" />
        <StatCard label="Max Loss Streak" value={String(perf.consecutive_losses)} accent="red" />
        <StatCard label="Commission Paid" value={fmt(perf.total_commission)}      accent="red" />
        <StatCard label="Swap"            value={fmt(perf.total_swap)}            accent={perf.total_swap >= 0 ? "green" : "red"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="text-xs font-medium text-text-muted mb-3">Equity Curve (cumulative P&L)</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={perf.equity_curve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
              <XAxis dataKey="idx" tick={{ fill: "#6b7280", fontSize: 9 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={52} tickFormatter={v => v?.toFixed(0)} />
              <Tooltip formatter={(v: number) => [fmt(v), "P&L"]}
                contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", borderRadius: 6, fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 2" />
              <Line dataKey="equity" stroke="#a78bfa" strokeWidth={1.8} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="text-xs font-medium text-text-muted mb-3">Drawdown per Trade</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={perf.drawdown_series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
              <XAxis dataKey="idx" tick={{ fill: "#6b7280", fontSize: 9 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={52} tickFormatter={v => v?.toFixed(0)} />
              <Tooltip formatter={(v: number) => [fmt(v), "Drawdown"]}
                contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", borderRadius: 6, fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#374151" />
              <Line dataKey="drawdown" stroke="#f87171" strokeWidth={1.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="text-xs font-medium text-text-muted mb-3">Daily P&L</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={perf.daily_returns} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 9 }} tickFormatter={v => v?.slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={48} />
              <Tooltip formatter={(v: number) => [fmt(v), "P&L"]}
                contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", borderRadius: 6, fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#374151" />
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                {perf.daily_returns.map((d, i) => (
                  <Cell key={i} fill={d.pnl >= 0 ? "#34d399" : "#f87171"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="text-xs font-medium text-text-muted mb-3">P&L by Day of Week</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={perf.weekday_pnl} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
              <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 10 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={48} />
              <Tooltip formatter={(v: number) => [fmt(v), "P&L"]}
                contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", borderRadius: 6, fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#374151" />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                {perf.weekday_pnl.map((d, i) => (
                  <Cell key={i} fill={d.pnl >= 0 ? "#60a5fa" : "#f87171"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {perf.monthly_pnl.length > 1 && (
        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="text-xs font-medium text-text-muted mb-3">Monthly P&L</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={perf.monthly_pnl} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 9 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={48} />
              <Tooltip formatter={(v: number) => [fmt(v), "P&L"]}
                contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", borderRadius: 6, fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#374151" />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                {perf.monthly_pnl.map((d, i) => (
                  <Cell key={i} fill={d.pnl >= 0 ? "#34d399" : "#f87171"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {perf.per_symbol.length > 0 && (
        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <div className="text-xs font-medium text-text-muted mb-3">Per-Symbol Breakdown</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  {["Symbol","Trades","Win Rate","Net P&L","Profit Factor"].map(h => (
                    <th key={h} className="text-left py-2 px-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perf.per_symbol.map(s => (
                  <tr key={s.symbol} className="border-b border-border/50 hover:bg-surface-2/50">
                    <td className="py-2 px-2 font-medium text-text-primary">{s.symbol}</td>
                    <td className="py-2 px-2 text-text-muted">{s.trades}</td>
                    <td className="py-2 px-2">
                      <span className={cn("font-mono", s.win_rate >= 50 ? "text-emerald-400" : "text-red-400")}>
                        {s.win_rate}%
                      </span>
                    </td>
                    <td className="py-2 px-2">{fmtPnl(s.pnl)}</td>
                    <td className="py-2 px-2">
                      <span className={cn("font-mono", s.profit_factor >= 1.5 ? "text-emerald-400" : s.profit_factor >= 1 ? "text-yellow-400" : "text-red-400")}>
                        {s.profit_factor === 0 ? "—" : fmt(s.profit_factor)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────────
type MainTab = "positions" | "history" | "chart" | "performance" | "risk" | "journal" | "drawdown" | "montecarlo";

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: "positions",   label: "Positions" },
  { id: "history",     label: "Deal History" },
  { id: "chart",       label: "P&L Chart" },
  { id: "performance", label: "Performance" },
  { id: "risk",        label: "Live Risk" },
  { id: "journal",     label: "Journal" },
  { id: "drawdown",    label: "Drawdown" },
  { id: "montecarlo",  label: "Monte Carlo" },
];

// ── Main page ──────────────────────────────────────────────────────────────────
export default function MT5Page() {
  const [histDays, setHistDays] = useState(30);
  const [activeTab, setActiveTab] = useState<MainTab>("positions");

  const { data: status } = useQuery({
    queryKey: ["mt5-status"],
    queryFn: api.getMT5Status,
    refetchInterval: 10000,
  });

  const { data: account, error: acctErr } = useQuery({
    queryKey: ["mt5-account"],
    queryFn: api.getMT5Account,
    enabled: status?.connected === true,
    refetchInterval: 5000,
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["mt5-positions"],
    queryFn: api.getMT5Positions,
    enabled: status?.connected === true,
    refetchInterval: 3000,
  });

  const { data: deals = [] } = useQuery({
    queryKey: ["mt5-history", histDays],
    queryFn: () => api.getMT5History(histDays),
    enabled: status?.connected === true,
  });

  const { data: symbols = [] } = useQuery({
    queryKey: ["mt5-symbols"],
    queryFn: () => api.getMT5Symbols(),
    enabled: status?.connected === true,
  });

  const totalPnl = positions.reduce((s, p) => s + p.profit, 0);
  const openLots  = positions.reduce((s, p) => s + p.volume, 0);
  const connected = status?.connected === true && !acctErr;

  if (!status?.available) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-lg">
          <AlertTriangle size={40} className="mx-auto text-yellow-500" />
          <div className="text-text-primary font-semibold text-lg">MT5 Requires Local Backend</div>
          <div className="text-text-muted text-sm leading-relaxed">
            The MetaTrader 5 Python library is <strong className="text-text-primary">Windows-only</strong> and cannot run on the cloud server (Railway/Linux).
            MT5 only works when you access the dashboard via your local machine.
          </div>
          <div className="bg-surface-2 rounded-lg border border-border p-4 text-left space-y-3">
            <div className="text-xs font-semibold text-text-primary uppercase tracking-wider">To use MT5 Terminal:</div>
            <ol className="space-y-2 text-xs text-text-muted list-decimal list-inside">
              <li>Open <strong className="text-text-primary">MetaTrader 5</strong> and log into your demo account</li>
              <li>Enable algo trading: <span className="font-mono text-accent">Tools → Options → Expert Advisors → Allow algorithmic trading</span></li>
              <li>Start the local backend: <span className="font-mono text-accent">python -m uvicorn app.main:app --port 8000</span></li>
              <li>Open the dashboard at <a href="http://localhost:3000/mt5" className="text-accent underline hover:text-accent/80">localhost:3000/mt5</a> instead of the Vercel URL</li>
            </ol>
          </div>
          <div className="text-xs text-text-muted opacity-60">All other pages (Pairs, Screener, Setups, etc.) work normally on the Vercel URL.</div>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3 max-w-md">
          <Activity size={40} className="mx-auto text-red-500" />
          <div className="text-text-primary font-semibold text-lg">MT5 Terminal Not Connected</div>
          <div className="text-text-muted text-sm">Open MetaTrader 5, log in to your demo account, and enable algorithmic trading.</div>
          <div className="text-xs text-text-muted">Tools → Options → Expert Advisors → Allow algorithmic trading</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <PageGuide
        title="MT5 Live Trading — Guide"
        subtitle="Live position management and order execution via MetaTrader 5"
        steps={[
          { title: "Check Connection Status", detail: "The status bar at the top shows whether your MT5 account is connected (green dot) or disconnected (red). Your account number, balance, equity, and margin level are shown when connected." },
          { title: "View Open Positions", detail: "All open positions are listed with symbol, direction (buy/sell), lot size, open price, current price, swap, and floating P&L. Positions are color-coded: green = profit, red = loss." },
          { title: "Place a New Order", detail: "Tap the + button or the Place Order button. Enter the symbol (e.g. EURUSD, XAUUSD), direction (Buy/Sell), lot size, and optional Stop Loss / Take Profit levels, then confirm." },
          { title: "Close a Position", detail: "Tap any open position row and press Close. You can partially close by entering a smaller lot size than the full position. Partial closes are useful for taking profit while keeping a running position." },
          { title: "Monitor Account Metrics", detail: "The account panel shows Balance (realized), Equity (balance + unrealized P&L), Margin (used collateral), Free Margin, and Margin Level %. Margin Level below 100% triggers a margin call." },
        ]}
        howItWorks={[
          { title: "MT5 Python API", detail: "The backend uses the MetaTrader5 Python library to communicate directly with the MT5 terminal running on your machine. All order placement, position querying, and account data comes through this API." },
          { title: "Real-Time Price Streaming", detail: "Live bid/ask prices are fetched from MT5's tick data stream. Prices update every second for open positions to show real-time floating P&L." },
          { title: "Order Execution", detail: "Market orders are sent via MetaTrader5.order_send() with ORDER_TYPE_BUY or ORDER_TYPE_SELL. The backend validates lot size, symbol, and margin requirements before sending." },
          { title: "Credential Security", detail: "MT5 login credentials (account number, password, server) are stored in the backend .env file and never exposed to the browser. All trading actions are proxied through the backend API." },
        ]}
        tips={[
          "Always set a Stop Loss on every trade — even a wide one (e.g. 200 pips on FX) — to protect against gap risk.",
          "Monitor margin level above 200% to avoid unexpected position close-outs during volatile periods.",
          "Use the demo account (MetaQuotes-Demo) to test order flow before switching to a live account.",
        ]}
      />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">MT5 Terminal</h1>
          {account && (
            <div className="text-xs text-text-muted mt-0.5">
              {account.name} · #{account.login} · {account.server}
              <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 text-[10px] font-medium uppercase">Demo</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400">Live</span>
        </div>
      </div>

      {/* Account stat cards */}
      {account && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Balance"      value={`${account.currency} ${fmt(account.balance)}`} />
          <StatCard label="Equity"       value={`${account.currency} ${fmt(account.equity)}`}
            accent={account.equity >= account.balance ? "green" : "red"} />
          <StatCard label="Margin Used"  value={fmt(account.margin)} />
          <StatCard label="Free Margin"  value={fmt(account.margin_free)} accent="green" />
          <StatCard label="Margin Level" value={`${fmt(account.margin_level, 1)}%`}
            accent={account.margin_level > 200 ? "green" : account.margin_level > 100 ? "neutral" : "red"} />
          <StatCard label="Floating P&L" value={fmt(totalPnl)}
            accent={totalPnl >= 0 ? "green" : "red"} sub={`${positions.length} positions`} />
          <StatCard label="Open Lots"    value={fmt(openLots, 2)} sub={`1:${account.leverage}`} />
        </div>
      )}

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="space-y-4">
          <QuickTrade symbols={symbols} />
          <SymbolChart />
        </div>

        {/* Right column — tabs */}
        <div className="lg:col-span-2 bg-surface-2 rounded-lg border border-border p-4">
          {/* Tab bar — scrollable on mobile */}
          <div className="flex items-center gap-1 mb-4 border-b border-border pb-3 overflow-x-auto">
            {MAIN_TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn("px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0",
                  activeTab === tab.id ? "bg-accent text-white" : "text-text-muted hover:text-text-primary")}>
                {tab.id === "positions" ? `Positions (${positions.length})` : tab.label}
              </button>
            ))}
            {activeTab === "history" && (
              <div className="ml-auto flex items-center gap-1 text-xs text-text-muted flex-shrink-0">
                {[7,30,90].map(d => (
                  <button key={d} onClick={() => setHistDays(d)}
                    className={cn("px-2 py-0.5 rounded", histDays === d ? "bg-surface text-text-primary" : "hover:text-text-primary")}>
                    {d}d
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeTab === "positions"   && <PositionsTable positions={positions} />}
          {activeTab === "history"     && <DealHistory deals={deals} />}
          {activeTab === "chart" && (
            <div>
              <div className="text-xs text-text-muted mb-3">Cumulative P&L — last {histDays} days · {deals.length} deals</div>
              {deals.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart
                    data={(() => { let c = 0; return [...deals].map(d => ({ t: d.time.slice(0,10), c: (c += d.profit) })); })()}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
                    <XAxis dataKey="t" tick={{ fill: "#6b7280", fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={48} />
                    <Tooltip formatter={(v: number) => [fmt(v), "Cum. P&L"]}
                      contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", borderRadius: 6, fontSize: 10 }} />
                    <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 2" />
                    <Line dataKey="c" stroke="#a78bfa" strokeWidth={1.8} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-text-muted text-sm py-10">No deal data</div>
              )}
            </div>
          )}
          {activeTab === "performance" && <PerformanceTab connected={connected} />}
          {activeTab === "risk"        && <RiskTab connected={connected} />}
          {activeTab === "journal"     && <JournalTab connected={connected} />}
          {activeTab === "drawdown"    && <DrawdownTab connected={connected} />}
          {activeTab === "montecarlo"  && <MonteCarloTab connected={connected} />}
        </div>
      </div>
    </div>
  );
}
