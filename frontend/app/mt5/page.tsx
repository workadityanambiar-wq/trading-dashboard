"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api, MT5Position, MT5Deal, MT5Symbol, MT5OrderRequest,
} from "@/lib/api";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Activity,
  AlertTriangle, X, RefreshCw, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtPnl = (n: number) => (
  <span className={cn("font-mono text-xs", n >= 0 ? "text-emerald-400" : "text-red-400")}>
    {n >= 0 ? "+" : ""}{fmt(n)}
  </span>
);

const TYPE_LABEL: Record<number, string> = { 0: "BUY", 1: "SELL" };
const TYPE_COLOR: Record<number, string> = { 0: "text-emerald-400", 1: "text-red-400" };

// ── sub-components ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: "green" | "red" | "neutral";
}) {
  const accentClass =
    accent === "green" ? "text-emerald-400" :
    accent === "red"   ? "text-red-400" : "text-text-primary";
  return (
    <div className="bg-surface-2 rounded-lg p-4 border border-border">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className={cn("text-xl font-semibold font-mono", accentClass)}>{value}</div>
      {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

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

// ── Quick Trade panel ──────────────────────────────────────────────────────────
function QuickTrade({ symbols }: { symbols: MT5Symbol[] }) {
  const qc = useQueryClient();
  const [sym, setSym] = useState("");
  const [vol, setVol] = useState("0.01");
  const [sl, setSl]   = useState("");
  const [tp, setTp]   = useState("");
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = search.length >= 1
    ? symbols.filter(s => s.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10)
    : [];

  const { mutate: place, isPending, error } = useMutation({
    mutationFn: (req: MT5OrderRequest) => api.placeMT5Order(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mt5-positions"] });
      setSym(""); setVol("0.01"); setSl(""); setTp(""); setSearch("");
    },
  });

  const handleTrade = (type: "buy" | "sell") => {
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
          onChange={e => { setSearch(e.target.value); setSym(e.target.value.toUpperCase()); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
        />
        {showDropdown && filtered.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-surface border border-border rounded shadow-lg max-h-40 overflow-y-auto">
            {filtered.map(s => (
              <button key={s.name} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 text-text-primary"
                onClick={() => { setSym(s.name); setSearch(s.name); setShowDropdown(false); }}>
                <span className="font-medium">{s.name}</span>
                <span className="text-text-muted ml-2 text-xs">{s.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-text-muted mb-1 block">Volume</label>
          <input className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
            value={vol} onChange={e => setVol(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">Stop Loss</label>
          <input className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
            value={sl} onChange={e => setSl(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">Take Profit</label>
          <input className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
            value={tp} onChange={e => setTp(e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleTrade("buy")}
          disabled={!sym || isPending}
          className="py-2.5 rounded font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors">
          {isPending ? "..." : "BUY"}
        </button>
        <button
          onClick={() => handleTrade("sell")}
          disabled={!sym || isPending}
          className="py-2.5 rounded font-semibold text-sm bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white transition-colors">
          {isPending ? "..." : "SELL"}
        </button>
      </div>
      {error && <div className="text-xs text-red-400">{(error as Error).message}</div>}
    </div>
  );
}

// ── Positions table ────────────────────────────────────────────────────────────
function PositionsTable({ positions }: { positions: MT5Position[] }) {
  const qc = useQueryClient();
  const { mutate: closePos, isPending } = useMutation({
    mutationFn: (ticket: number) => api.closeMT5Position(ticket),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mt5-positions"] }),
  });

  if (positions.length === 0) {
    return <div className="text-center text-text-muted py-10 text-sm">No open positions</div>;
  }
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
              <td className="py-2 px-2 font-medium text-text-primary">{p.symbol}</td>
              <td className="py-2 px-2"><Badge v={p.type}>{TYPE_LABEL[p.type] ?? p.type}</Badge></td>
              <td className="py-2 px-2 font-mono">{p.volume}</td>
              <td className="py-2 px-2 font-mono">{fmt(p.price_open, 5)}</td>
              <td className="py-2 px-2 font-mono">{fmt(p.price_current, 5)}</td>
              <td className="py-2 px-2 font-mono text-text-muted">{p.sl ? fmt(p.sl, 5) : "—"}</td>
              <td className="py-2 px-2 font-mono text-text-muted">{p.tp ? fmt(p.tp, 5) : "—"}</td>
              <td className="py-2 px-2">{fmtPnl(p.swap)}</td>
              <td className="py-2 px-2">{fmtPnl(p.profit)}</td>
              <td className="py-2 px-2">
                <button
                  onClick={() => closePos(p.ticket)}
                  disabled={isPending}
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

// ── Deal history ───────────────────────────────────────────────────────────────
function DealHistory({ deals }: { deals: MT5Deal[] }) {
  if (deals.length === 0) {
    return <div className="text-center text-text-muted py-10 text-sm">No deal history</div>;
  }
  const ENTRY_LABEL: Record<number, string> = { 0: "IN", 1: "OUT", 2: "IN/OUT" };
  return (
    <div className="overflow-x-auto max-h-72 overflow-y-auto">
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
              <td className="py-1.5 px-2">{ENTRY_LABEL[d.entry] ?? d.entry}</td>
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

// ── OHLCV mini-chart ───────────────────────────────────────────────────────────
function SymbolChart() {
  const [sym, setSym] = useState("EURUSD");
  const [tf, setTf]   = useState("H1");
  const TFS = ["M1","M5","M15","M30","H1","H4","D1"];

  const { data, isFetching } = useQuery({
    queryKey: ["mt5-ohlcv", sym, tf],
    queryFn: () => api.getMT5OHLCV(sym, tf, 200),
    enabled: !!sym,
    retry: false,
  });

  return (
    <div className="bg-surface-2 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <input
          className="w-28 bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-accent uppercase"
          value={sym} onChange={e => setSym(e.target.value.toUpperCase())}
        />
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
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
            <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 9 }}
              tickFormatter={v => v?.slice(5, 16).replace("T", " ")} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={52}
              tickFormatter={v => v?.toFixed(4)} domain={["auto", "auto"]} />
            <Tooltip
              formatter={(v: number) => v?.toFixed(5)}
              labelStyle={{ color: "#94a3b8" }}
              contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", borderRadius: 6, fontSize: 10 }}
            />
            <Line dataKey="close" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="Close" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-40 flex items-center justify-center text-text-muted text-sm">
          {isFetching ? "Loading chart…" : "No data"}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function MT5Page() {
  const [histDays, setHistDays] = useState(30);
  const [activeTab, setActiveTab] = useState<"positions" | "history" | "chart">("positions");

  const { data: status } = useQuery({
    queryKey: ["mt5-status"],
    queryFn: api.getMT5Status,
    refetchInterval: 10000,
  });

  const { data: account, isLoading: loadingAcct, error: acctErr } = useQuery({
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

  if (!status?.available) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3 max-w-md">
          <AlertTriangle size={40} className="mx-auto text-yellow-500" />
          <div className="text-text-primary font-semibold text-lg">MetaTrader 5 Not Available</div>
          <div className="text-text-muted text-sm">
            The MT5 Python library only runs on Windows. Make sure the backend is running locally (not on Railway) and MetaTrader 5 is installed.
          </div>
          <div className="bg-surface-2 rounded-lg p-3 text-left text-xs font-mono text-text-muted border border-border">
            pip install MetaTrader5
          </div>
        </div>
      </div>
    );
  }

  if (!status?.connected || acctErr) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3 max-w-md">
          <Activity size={40} className="mx-auto text-red-500" />
          <div className="text-text-primary font-semibold text-lg">MT5 Terminal Not Connected</div>
          <div className="text-text-muted text-sm">
            Open MetaTrader 5, log in to your account, and make sure algorithmic trading is enabled.
          </div>
          <div className="text-xs text-text-muted">Tools → Options → Expert Advisors → Allow algorithmic trading</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">MT5 Terminal</h1>
          {account && (
            <div className="text-xs text-text-muted mt-0.5">
              {account.name} · #{account.login} · {account.server}
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
          <StatCard label="Balance" value={`${account.currency} ${fmt(account.balance)}`} />
          <StatCard label="Equity"  value={`${account.currency} ${fmt(account.equity)}`}
            accent={account.equity >= account.balance ? "green" : "red"} />
          <StatCard label="Margin"  value={fmt(account.margin)} sub="used" />
          <StatCard label="Free Margin" value={fmt(account.margin_free)} accent="green" />
          <StatCard label="Margin Level" value={`${fmt(account.margin_level, 1)}%`}
            accent={account.margin_level > 200 ? "green" : account.margin_level > 100 ? "neutral" : "red"} />
          <StatCard label="Floating P&L" value={fmt(totalPnl)}
            accent={totalPnl >= 0 ? "green" : "red"} sub={`${positions.length} positions`} />
          <StatCard label="Open Lots" value={fmt(openLots, 2)} sub={`1:${account.leverage}`} />
        </div>
      )}

      {/* Main content: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: Quick Trade + Symbol Chart */}
        <div className="space-y-4">
          <QuickTrade symbols={symbols} />
          <SymbolChart />
        </div>

        {/* Right: Tabs — positions / history / chart */}
        <div className="lg:col-span-2 bg-surface-2 rounded-lg border border-border p-4">
          <div className="flex items-center gap-1 mb-4 border-b border-border pb-3">
            {(["positions","history","chart"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn("px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors",
                  activeTab === tab ? "bg-accent text-white" : "text-text-muted hover:text-text-primary")}>
                {tab === "positions" ? `Positions (${positions.length})` :
                 tab === "history"   ? "Deal History" : "Chart"}
              </button>
            ))}
            {activeTab === "history" && (
              <div className="ml-auto flex items-center gap-1 text-xs text-text-muted">
                Last
                {[7,30,90].map(d => (
                  <button key={d} onClick={() => setHistDays(d)}
                    className={cn("px-2 py-0.5 rounded", histDays === d ? "bg-surface text-text-primary" : "hover:text-text-primary")}>
                    {d}d
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeTab === "positions" && <PositionsTable positions={positions} />}
          {activeTab === "history"   && <DealHistory deals={deals} />}
          {activeTab === "chart" && (
            <div className="space-y-3">
              <div className="text-xs text-text-muted">
                P&L summary for last {histDays} days — {deals.length} deals
              </div>
              {deals.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart
                    data={(() => {
                      let cum = 0;
                      return [...deals].map(d => ({ time: d.time.slice(0, 10), cum: (cum += d.profit) }));
                    })()}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" />
                    <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} width={48}
                      tickFormatter={v => v?.toFixed(0)} />
                    <Tooltip
                      formatter={(v: number) => [`${v?.toFixed(2)}`, "Cumulative P&L"]}
                      contentStyle={{ background: "#0f1117", border: "1px solid #1e2030", borderRadius: 6, fontSize: 10 }}
                    />
                    <Line dataKey="cum" stroke="#a78bfa" strokeWidth={1.8} dot={false} name="P&L" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-text-muted text-sm py-10">No deal data</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
