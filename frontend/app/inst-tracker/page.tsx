"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HistoryDrawer, DrawerConfig } from "@/components/HistoryDrawer";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";
import {
  TrendingUp, TrendingDown, RefreshCw, Building2, Users, Landmark,
  BarChart3, Activity, Brain, Bell, ChevronRight, ArrowUpRight,
  ArrowDownRight, Shield, Eye, Globe, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageGuide } from "@/components/PageGuide";

// ── API base ─────────────────────────────────────────────────────────────────

const BASE = "/api/inst-tracker";

async function fetchAll() {
  const endpoints = [
    "overview", "holdings", "flows", "smart-money",
    "hedge-funds", "mutual-funds", "pe", "vc",
    "ownership", "crowded", "rotation", "insider",
    "insights", "alerts", "sovereign",
  ];
  const results = await Promise.allSettled(
    endpoints.map((e) => fetch(`${BASE}/${e}`).then((r) => r.json()))
  );
  const [
    overview, holdings, flows, smartMoney,
    hedgeFunds, mutualFunds, pe, vc,
    ownership, crowded, rotation, insider,
    insights, alerts, sovereign,
  ] = results.map((r) => (r.status === "fulfilled" ? r.value : null));
  return {
    overview, holdings, flows, smartMoney,
    hedgeFunds, mutualFunds, pe, vc,
    ownership, crowded, rotation, insider,
    insights, alerts, sovereign,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number, decimals = 1) {
  return v >= 0 ? `+${v.toFixed(decimals)}` : v.toFixed(decimals);
}
function fmtBn(v: number) {
  return `$${Math.abs(v).toFixed(1)}B`;
}
function chgColor(v: number) {
  if (v > 0) return "text-positive";
  if (v < 0) return "text-negative";
  return "text-text-muted";
}
function sevColor(s: string) {
  if (s === "Critical") return "text-red-400 bg-red-400/10 border-red-400/30";
  if (s === "High") return "text-orange-400 bg-orange-400/10 border-orange-400/30";
  if (s === "Medium") return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
  return "text-blue-400 bg-blue-400/10 border-blue-400/30";
}
function scoreColor(s: number) {
  if (s >= 75) return "text-positive";
  if (s >= 50) return "text-accent";
  if (s >= 25) return "text-yellow-400";
  return "text-negative";
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-1">
      <div className="text-[10px] text-text-muted uppercase tracking-widest">{label}</div>
      <div className={cn("text-[22px] font-bold tabular-nums", color || "text-text-primary")}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted">{sub}</div>}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border", color)}>
      {label}
    </span>
  );
}

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min((Math.abs(value) / max) * 100, 100);
  return (
    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden w-full">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const isPos = data.flow_score >= 50;
  return (
    <div className="space-y-4">
      {/* Filing period badge */}
      <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-[10px] text-accent font-medium flex items-center gap-2">
        <Shield size={11} /> {data.filing_period}
      </div>

      {/* Score + Sentiment */}
      <div className={cn(
        "rounded-2xl border p-5 text-center",
        isPos ? "border-positive/30 bg-positive/5" : "border-negative/30 bg-negative/5"
      )}>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-1">Institutional Flow Score</div>
        <div className={cn("text-[52px] font-black tabular-nums leading-none", isPos ? "text-positive" : "text-negative")}>
          {data.flow_score}
        </div>
        <div className="text-[13px] text-text-muted font-semibold mt-1">{data.sentiment}</div>
        <div className="text-[11px] text-text-muted mt-2">
          Net Flow: <span className={chgColor(data.total_net_flow_bn)}>{fmtBn(data.total_net_flow_bn)}</span>
        </div>
      </div>

      {/* Heatmap */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Asset Class Flows</div>
        <div className="grid grid-cols-1 gap-2">
          {data.heatmap?.map((h: any) => {
            const pos = h.flow_bn >= 0;
            return (
              <div key={h.asset} className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", pos ? "bg-positive" : "bg-negative")} />
                  <span className="text-[12px] text-text-primary font-medium">{h.asset}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("text-[12px] font-semibold tabular-nums", pos ? "text-positive" : "text-negative")}>
                    {pos ? "+" : ""}{fmtBn(h.flow_bn)}
                  </span>
                  <Badge label={h.signal} color={pos ? "text-positive bg-positive/10 border-positive/20" : "text-negative bg-negative/10 border-negative/20"} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top insights preview */}
      {data.top_insights && (
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">AI Highlights</div>
          <div className="space-y-2">
            {data.top_insights.map((ins: any) => (
              <div key={ins.id} className="rounded-xl border border-border bg-surface px-3 py-3">
                <div className="flex items-start gap-2">
                  <span className="text-[16px]">{ins.icon}</span>
                  <div>
                    <div className="text-[11px] font-semibold text-text-primary leading-tight">{ins.headline}</div>
                    <div className="text-[10px] text-text-muted mt-0.5">{ins.category}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Holdings Changes ─────────────────────────────────────────────────────

function HoldingsTab({ data }: { data: any }) {
  const [view, setView] = useState<"new" | "inc" | "red" | "exit">("new");
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;

  const views = [
    { id: "new" as const, label: `New (${data.summary?.new_count ?? 0})` },
    { id: "inc" as const, label: `Inc. (${data.summary?.increase_count ?? 0})` },
    { id: "red" as const, label: `Red. (${data.summary?.reduction_count ?? 0})` },
    { id: "exit" as const, label: `Exits (${data.summary?.exit_count ?? 0})` },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-surface rounded-full p-0.5 border border-border overflow-x-auto">
        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all flex-shrink-0",
              view === v.id ? "bg-accent text-white" : "text-text-muted"
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "new" && (
        <div className="space-y-2">
          {data.new_positions?.map((p: any) => (
            <div key={p.ticker} className="rounded-2xl border border-positive/20 bg-positive/5 p-4 cursor-pointer hover:border-positive/50 transition-colors"
              onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${p.ticker}`, color: "#22c55e" })}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-text-primary">{p.ticker}</span>
                    <span className="text-[10px] text-text-muted">{p.name}</span>
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">{p.institution}</div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-bold text-positive">${p.size_mn}M</div>
                  <div className="text-[10px] text-text-muted">{p.weight}% weight</div>
                </div>
              </div>
              <div className="text-[10px] text-text-muted bg-surface rounded-lg px-3 py-2">{p.catalyst}</div>
            </div>
          ))}
        </div>
      )}

      {view === "inc" && (
        <div className="space-y-2">
          {data.increases?.map((p: any) => (
            <div key={`${p.institution}-${p.ticker}`} className="rounded-2xl border border-border bg-surface p-4 cursor-pointer hover:border-accent/40 transition-colors"
              onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${p.ticker}`, color: "#6366f1" })}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-text-primary">{p.ticker}</span>
                    <span className="text-[10px] text-text-muted">{p.name}</span>
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">{p.institution}</div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-bold text-positive">{fmt(p.chg_pct, 0)}%</div>
                  <div className="text-[10px] text-text-muted">{p.prev_weight}% → {p.curr_weight}%</div>
                </div>
              </div>
              <div className="text-[10px] text-text-muted">{p.rationale}</div>
            </div>
          ))}
        </div>
      )}

      {view === "red" && (
        <div className="space-y-2">
          {data.reductions?.map((p: any) => (
            <div key={`${p.institution}-${p.ticker}`} className="rounded-2xl border border-negative/20 bg-negative/5 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-text-primary">{p.ticker}</span>
                    <span className="text-[10px] text-text-muted">{p.name}</span>
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">{p.institution} · {p.impact}</div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-bold text-negative">{p.chg_pct}%</div>
                  <div className="text-[10px] text-text-muted">{p.prev_weight}% → {p.curr_weight}%</div>
                </div>
              </div>
              <div className="text-[10px] text-text-muted">{p.rationale}</div>
            </div>
          ))}
        </div>
      )}

      {view === "exit" && (
        <div className="space-y-2">
          {data.full_exits?.map((p: any) => (
            <div key={`${p.institution}-${p.ticker}`} className="rounded-2xl border border-negative/30 bg-negative/8 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-text-primary">{p.ticker}</span>
                    <span className="text-[10px] text-text-muted">{p.name}</span>
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">{p.institution}</div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-bold text-negative">-${p.proceeds_mn}M</div>
                  <div className="text-[10px] text-text-muted">Full Exit</div>
                </div>
              </div>
              <div className="text-[10px] text-text-muted mt-2">{p.reason}</div>
            </div>
          ))}
        </div>
      )}
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}

// ── Tab: Sector Flows ─────────────────────────────────────────────────────────

function SectorFlowsTab({ data }: { data: any }) {
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const sectors = data.sectors ?? [];

  const chartData = sectors.map((s: any) => ({
    name: s.sector.replace(" Disc.", "").replace("Commodities/", "").substring(0, 12),
    flow: s.net_flow_bn,
  }));

  return (
    <div className="space-y-4">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis dataKey="name" tick={{ fontSize: 8, fill: "#666" }} />
            <YAxis tick={{ fontSize: 8, fill: "#666" }} tickFormatter={(v) => `${v}B`} />
            <Tooltip
              contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [`$${v.toFixed(1)}B`, "Net Flow"]}
            />
            <Bar dataKey="flow" radius={[3, 3, 0, 0]}>
              {chartData.map((d: any, i: number) => (
                <Cell key={i} fill={d.flow >= 0 ? "#22c55e" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        {sectors.map((s: any) => {
          const pos = s.net_flow_bn >= 0;
          return (
            <div
              key={s.sector}
              className="rounded-xl border border-border bg-surface p-3 cursor-pointer hover:border-accent/40 transition-colors"
              onClick={() => setDrawer({ fetchUrl: `/api/chart/metric/sector-${s.sector}`, color: pos ? "#22c55e" : "#ef4444" })}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-[12px] font-semibold text-text-primary">{s.sector}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">{s.momentum}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn("text-[12px] font-bold tabular-nums", pos ? "text-positive" : "text-negative")}>
                    {pos ? "+" : ""}{fmtBn(s.net_flow_bn)}
                  </span>
                  <Badge label={s.signal} color={pos ? "text-positive bg-positive/10 border-positive/20" : "text-negative bg-negative/10 border-negative/20"} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[9px] text-text-muted">
                <div><div>HF</div><div className={chgColor(s.hedge_funds)}>{fmt(s.hedge_funds)}B</div></div>
                <div><div>MF</div><div className={chgColor(s.mutual_funds)}>{fmt(s.mutual_funds)}B</div></div>
                <div><div>Pension</div><div className={chgColor(s.pension)}>{fmt(s.pension)}B</div></div>
                <div><div>SWF</div><div className={chgColor(s.sovereign)}>{fmt(s.sovereign)}B</div></div>
              </div>
            </div>
          );
        })}
      </div>
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}

// ── Tab: Smart Money ──────────────────────────────────────────────────────────

function SmartMoneyTab({ data }: { data: any }) {
  const [view, setView] = useState<"bought" | "sold">("bought");
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;

  const items = view === "bought" ? (data.most_bought ?? []) : (data.most_sold ?? []);

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-surface rounded-full p-0.5 border border-border">
        <button
          onClick={() => setView("bought")}
          className={cn("flex-1 py-1.5 rounded-full text-[10px] font-medium transition-all",
            view === "bought" ? "bg-positive text-white" : "text-text-muted")}
        >
          Most Bought
        </button>
        <button
          onClick={() => setView("sold")}
          className={cn("flex-1 py-1.5 rounded-full text-[10px] font-medium transition-all",
            view === "sold" ? "bg-negative text-white" : "text-text-muted")}
        >
          Most Sold
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item: any, i: number) => {
          const isBuy = view === "bought";
          const flow = isBuy ? item.net_flow_mn : -item.net_outflow_mn;
          const buyers = isBuy ? item.net_buyers : item.net_sellers;
          const chg = isBuy ? item.ownership_chg : item.ownership_chg;
          return (
            <div
              key={item.ticker}
              className={cn(
                "rounded-xl border p-3 flex items-center gap-3 cursor-pointer hover:border-accent/40 transition-colors",
                isBuy ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"
              )}
              onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${item.ticker}`, color: isBuy ? "#22c55e" : "#ef4444" })}
            >
              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0",
                isBuy ? "bg-positive/20 text-positive" : "bg-negative/20 text-negative")}
              >
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-text-primary">{item.ticker}</span>
                  <span className="text-[10px] text-text-muted truncate">{item.name}</span>
                </div>
                <div className="text-[10px] text-text-muted">{item.sector} · {buyers} {isBuy ? "buyers" : "sellers"}</div>
              </div>
              <div className="text-right shrink-0">
                <div className={cn("text-[12px] font-bold tabular-nums", isBuy ? "text-positive" : "text-negative")}>
                  {isBuy ? "+" : "-"}${Math.abs(flow).toFixed(0)}M
                </div>
                <div className={cn("text-[10px] tabular-nums", chgColor(chg))}>
                  {fmt(chg)}% own
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}

// ── Tab: Hedge Funds ──────────────────────────────────────────────────────────

function HedgeFundsTab({ data }: { data: any }) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;

  const funds: any[] = data.funds ?? [];
  const selectedFund = funds.find((f: any) => f.name === selected);
  const hfSentiment = data.hf_sentiment ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-widest">HF Sentiment Index</div>
          <div className={cn("text-[28px] font-black", scoreColor(hfSentiment))}>{hfSentiment}</div>
        </div>
        <div className="text-[11px] text-text-muted text-right">
          <div>{funds.length} funds tracked</div>
          <div className="text-positive">Bullish Bias</div>
        </div>
      </div>

      {selectedFund ? (
        <div className="space-y-3">
          <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-[11px] text-accent">
            ← All Funds
          </button>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[14px] font-bold text-text-primary">{selectedFund.name}</div>
                <div className="text-[11px] text-text-muted">{selectedFund.manager} · {selectedFund.style}</div>
              </div>
              <div className="text-right">
                <div className="text-[16px] font-bold text-text-primary">${selectedFund.aum_bn}B</div>
                <div className={cn("text-[11px] font-semibold", scoreColor(selectedFund.sentiment_score))}>
                  Score: {selectedFund.sentiment_score}
                </div>
              </div>
            </div>
            <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Top Holdings</div>
            <div className="space-y-2">
              {selectedFund.top_holdings?.map((h: any) => (
                <div key={h.ticker} className="flex items-center justify-between py-1.5 border-b border-surface-2 last:border-0">
                  <div>
                    <span className="text-[12px] font-semibold text-text-primary">{h.ticker}</span>
                    <span className="text-[10px] text-text-muted ml-2">{h.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-semibold">{h.weight}%</div>
                    <div className={cn("text-[10px]", chgColor(h.chg_qoq))}>{fmt(h.chg_qoq)}%</div>
                  </div>
                </div>
              ))}
            </div>
            {(selectedFund.new_positions?.length > 0 || selectedFund.exits?.length > 0) && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                {selectedFund.new_positions?.length > 0 && (
                  <div className="bg-positive/5 rounded-lg p-2 border border-positive/20">
                    <div className="text-text-muted mb-1">New Positions</div>
                    {selectedFund.new_positions.map((p: any) => (
                      <div key={p.ticker} className="text-positive font-semibold">{p.ticker} ${p.value_mn}M</div>
                    ))}
                  </div>
                )}
                {selectedFund.exits?.length > 0 && (
                  <div className="bg-negative/5 rounded-lg p-2 border border-negative/20">
                    <div className="text-text-muted mb-1">Exits</div>
                    {selectedFund.exits.map((p: any) => (
                      <div key={p.ticker} className="text-negative font-semibold">{p.ticker}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {funds.map((fund: any) => (
            <button
              key={fund.name}
              onClick={() => setSelected(fund.name)}
              className="w-full text-left rounded-xl border border-border bg-surface p-3 hover:bg-surface-2 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-text-primary truncate">{fund.name}</div>
                  <div className="text-[10px] text-text-muted">{fund.manager} · {fund.style}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  <div className="text-right">
                    <div className="text-[12px] font-bold">${fund.aum_bn}B</div>
                    <div className={cn("text-[10px] font-semibold", scoreColor(fund.sentiment_score))}>
                      {fund.sentiment_score}/100
                    </div>
                  </div>
                  <ChevronRight size={12} className="text-text-muted" />
                </div>
              </div>
              <div className="mt-2">
                <ScoreBar value={fund.sentiment_score} color={fund.sentiment_score >= 60 ? "bg-positive" : fund.sentiment_score >= 40 ? "bg-accent" : "bg-negative"} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Mutual Funds ─────────────────────────────────────────────────────────

function MutualFundsTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const funds: any[] = data.funds ?? [];

  const SECTOR_COLORS: Record<string, string> = {
    Technology: "#6366f1", Financials: "#3b82f6", Healthcare: "#10b981",
    "Consumer Disc": "#f59e0b", Industrials: "#8b5cf6", Energy: "#f97316",
    Utilities: "#06b6d4", "Real Estate": "#ec4899", Other: "#64748b",
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-surface p-3 flex items-center justify-between">
        <div className="text-[11px] text-text-muted">Avg. Risk Appetite</div>
        <div className={cn("text-[16px] font-bold", scoreColor(data.avg_risk_appetite ?? 0))}>
          {data.avg_risk_appetite ?? "—"}/100
        </div>
      </div>
      {funds.map((fund: any) => (
        <div key={fund.name} className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-[13px] font-bold text-text-primary">{fund.name}</div>
              <div className="text-[10px] text-text-muted">{fund.type} · ${fund.aum_tn}T AUM</div>
            </div>
            <div className={cn("text-[12px] font-semibold", scoreColor(fund.risk_appetite))}>
              {fund.risk_appetite}/100 risk
            </div>
          </div>
          <div className="space-y-1.5">
            {Object.entries(fund.sector_alloc ?? {}).map(([sector, alloc]: [string, any]) => {
              const chg = fund.changes?.[sector] ?? 0;
              const color = SECTOR_COLORS[sector] ?? "#64748b";
              return (
                <div key={sector} className="flex items-center gap-2">
                  <span className="text-[9px] text-text-muted w-20 truncate">{sector}</span>
                  <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${alloc}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-[9px] tabular-nums text-text-primary w-7 text-right">{alloc}%</span>
                  {chg !== 0 && (
                    <span className={cn("text-[9px] tabular-nums w-8 text-right", chgColor(chg))}>
                      {fmt(chg, 1)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab: PE & VC ──────────────────────────────────────────────────────────────

function PeVcTab({ peData, vcData }: { peData: any; vcData: any }) {
  const [view, setView] = useState<"pe" | "vc">("pe");

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-surface rounded-full p-0.5 border border-border">
        <button
          onClick={() => setView("pe")}
          className={cn("flex-1 py-1.5 rounded-full text-[10px] font-medium transition-all",
            view === "pe" ? "bg-accent text-white" : "text-text-muted")}
        >Private Equity</button>
        <button
          onClick={() => setView("vc")}
          className={cn("flex-1 py-1.5 rounded-full text-[10px] font-medium transition-all",
            view === "vc" ? "bg-accent text-white" : "text-text-muted")}
        >Venture Capital</button>
      </div>

      {view === "pe" && peData && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Dry Powder" value={`$${(peData.metrics?.dry_powder_bn / 1000).toFixed(1)}T`} sub="Deployable capital" />
            <StatCard label="YTD Volume" value={`$${peData.metrics?.ytd_deal_volume_bn}B`} sub="Deal volume" />
            <StatCard label="Avg Multiple" value={`${peData.metrics?.avg_entry_multiple}x`} sub="Entry EBITDA" />
            <StatCard label="Activity" value={`${peData.metrics?.activity_index}/100`} sub="Deal pace" color={scoreColor(peData.metrics?.activity_index ?? 0)} />
          </div>
          <div className="space-y-2">
            {peData.deals?.map((d: any, i: number) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <div className="text-[12px] font-bold text-text-primary">{d.company}</div>
                    <div className="text-[10px] text-text-muted">{d.firm} · {d.type} · {d.sector}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-bold">${d.size_bn}B</div>
                    <div className={cn("text-[10px]",
                      d.status === "Closed" ? "text-positive" :
                      d.status === "Pending" ? "text-yellow-400" : "text-text-muted"
                    )}>{d.status}</div>
                  </div>
                </div>
                <div className="flex gap-3 text-[10px] text-text-muted">
                  <span>IRR: {d.irr_target}%</span>
                  {d.multiple !== "N/A" && <span>{d.multiple}</span>}
                  {d.status_note && <span className="text-accent">{d.status_note}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "vc" && vcData && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="YTD Deals" value={`${vcData.metrics?.ytd_deal_count?.toLocaleString()}`} sub="Q1-Q2 2026" />
            <StatCard label="YTD Volume" value={`$${vcData.metrics?.ytd_volume_bn}B`} sub="Total deployed" />
            <StatCard label="AI Share" value={`${vcData.metrics?.ai_pct_of_deals}%`} sub="Of all deals" color="text-accent" />
            <StatCard label="Down Rounds" value={`${vcData.metrics?.down_round_pct}%`} sub="Valuation cuts" color="text-negative" />
          </div>
          <div className="space-y-2">
            {vcData.rounds?.map((r: any, i: number) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <div className="text-[12px] font-bold text-text-primary">{r.company}</div>
                    <div className="text-[10px] text-text-muted">{r.sector} · {r.stage}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-bold">${r.amount_mn >= 1000 ? `${(r.amount_mn/1000).toFixed(1)}B` : `${r.amount_mn}M`}</div>
                    <div className="text-[10px] text-text-muted">Val: ${r.valuation_bn}B</div>
                  </div>
                </div>
                <div className="text-[10px] text-text-muted">Lead: {r.lead}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Ownership ────────────────────────────────────────────────────────────

function OwnershipTab({ data }: { data: any }) {
  const [ticker, setTicker] = useState("NVDA");
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;

  const tickers = Object.keys(data.holders ?? {});
  const holders = data.holders?.[ticker] ?? [];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tickers.map((t) => (
          <button
            key={t}
            onClick={() => setTicker(t)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[11px] font-semibold border shrink-0 transition-colors",
              ticker === t ? "bg-accent text-white border-accent" : "border-border text-text-muted bg-surface hover:bg-surface-2"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 flex items-center justify-between">
        <span className="text-[11px] text-accent">Accumulation Score</span>
        <span className="text-[14px] font-bold text-accent">{data.accumulation_score}/100</span>
      </div>

      <div className="space-y-2">
        {holders.map((h: any, i: number) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-start justify-between mb-1">
              <div>
                <div className="text-[12px] font-semibold text-text-primary">{h.institution}</div>
                <div className="text-[10px] text-text-muted">{h.type}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] font-bold">${h.value_bn}B</div>
                <div className="text-[10px] text-text-muted">{h.shares_mn ?? h.pct_held?.toFixed(2)}%</div>
              </div>
            </div>
            {h.chg_qoq != null && (
              <div className={cn("text-[10px] font-semibold", chgColor(h.chg_qoq))}>
                QoQ: {fmt(h.chg_qoq)}%
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Crowded Trades ───────────────────────────────────────────────────────

function CrowdedTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;

  const longs: any[] = data.longs ?? [];
  const shorts: any[] = data.shorts ?? [];
  const riskIndex = data.crowding_risk_index ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Crowding Risk Index" value={`${riskIndex}`} sub="Composite score" color={scoreColor(100 - riskIndex)} />
        <StatCard label="Most Crowded" value={data.most_crowded?.ticker ?? "—"} sub={`Score: ${data.most_crowded?.crowding_score}`} color="text-negative" />
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Crowded Longs</div>
        <div className="space-y-2">
          {longs.map((t: any) => (
            <div key={t.ticker} className={cn(
              "rounded-xl border p-3",
              t.crowding_score >= 80 ? "border-negative/30 bg-negative/5" : "border-border bg-surface"
            )}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold">{t.ticker}</span>
                    {t.crowding_score >= 80 && (
                      <AlertTriangle size={11} className="text-negative" />
                    )}
                  </div>
                  <div className="text-[10px] text-text-muted">{t.inst_count} institutions · {t.pct_of_float}% of float</div>
                </div>
                <div className="text-right">
                  <div className={cn("text-[14px] font-black", t.crowding_score >= 80 ? "text-negative" : "text-accent")}>
                    {t.crowding_score}
                  </div>
                  <div className={cn("text-[10px]", sevColor(t.risk).split(" ")[0])}>
                    {t.risk}
                  </div>
                </div>
              </div>
              <ScoreBar value={t.crowding_score} color={t.crowding_score >= 80 ? "bg-negative" : "bg-accent"} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Crowded Shorts</div>
        <div className="space-y-2">
          {shorts.map((t: any) => (
            <div key={t.ticker} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-[12px] font-bold">{t.ticker}</span>
                  <div className="text-[10px] text-text-muted">{t.inst_count} institutions · {t.pct_of_float}% of float</div>
                </div>
                <div className="text-right">
                  <div className="text-[14px] font-black text-negative">{t.crowding_score}</div>
                  <div className="text-[10px] text-yellow-400">{t.risk}</div>
                </div>
              </div>
              <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-negative" style={{ width: `${t.crowding_score}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Rotation ─────────────────────────────────────────────────────────────

function RotationTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* Primary signals */}
      <div className="space-y-2">
        {[
          { label: "Primary", text: data.primary_rotation },
          { label: "Secondary", text: data.secondary_rotation },
          { label: "Emerging", text: data.emerging_rotation },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-3">
            <div className="text-[9px] text-text-muted uppercase tracking-widest mb-1">{item.label}</div>
            <div className="text-[12px] font-semibold text-text-primary">{item.text}</div>
          </div>
        ))}
      </div>

      {/* Weekly */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Weekly Flows</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-positive/20 bg-positive/5 p-3">
            <div className="text-[10px] text-positive mb-2 font-semibold">Inflows</div>
            {data.weekly?.into?.map((s: string) => (
              <div key={s} className="flex items-center justify-between py-1 border-b border-positive/10 last:border-0">
                <span className="text-[11px] text-text-primary">{s}</span>
                <span className="text-[10px] text-positive tabular-nums">
                  +${Math.abs(data.weekly?.magnitude_bn?.[s] ?? 0).toFixed(1)}B
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-negative/20 bg-negative/5 p-3">
            <div className="text-[10px] text-negative mb-2 font-semibold">Outflows</div>
            {data.weekly?.out_of?.map((s: string) => (
              <div key={s} className="flex items-center justify-between py-1 border-b border-negative/10 last:border-0">
                <span className="text-[11px] text-text-primary">{s}</span>
                <span className="text-[10px] text-negative tabular-nums">
                  -${Math.abs(data.weekly?.magnitude_bn?.[s] ?? 0).toFixed(1)}B
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly */}
      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Monthly Flows</div>
        <div className="space-y-2">
          {Object.entries(data.monthly?.magnitude_bn ?? {}).map(([sector, flow]: [string, any]) => (
            <div key={sector} className="flex items-center gap-3">
              <span className="text-[11px] text-text-muted w-32 truncate">{sector}</span>
              <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full", flow >= 0 ? "bg-positive" : "bg-negative")}
                  style={{ width: `${Math.min(Math.abs(flow) * 2, 100)}%` }}
                />
              </div>
              <span className={cn("text-[10px] tabular-nums font-semibold w-12 text-right", chgColor(flow))}>
                {flow >= 0 ? "+" : ""}${Math.abs(flow).toFixed(1)}B
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quarterly */}
      {data.quarterly && (
        <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
          <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Quarterly Signal</div>
          <div className="text-[13px] font-bold text-accent mb-3">{data.quarterly.signal}</div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <div className="text-positive mb-1 font-semibold">Leaders</div>
              {data.quarterly.leaders?.map((l: string) => (
                <div key={l} className="text-text-primary">{l}</div>
              ))}
            </div>
            <div>
              <div className="text-negative mb-1 font-semibold">Laggards</div>
              {data.quarterly.laggards?.map((l: string) => (
                <div key={l} className="text-text-primary">{l}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Insider Overlay ──────────────────────────────────────────────────────

function InsiderTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;

  const composite = data.smart_money_composite ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-positive/20 bg-positive/5 p-4">
          <div className="text-[10px] text-text-muted mb-1">Buy Volume</div>
          <div className="text-[20px] font-bold text-positive">${data.buy_volume_mn?.toFixed(0)}M</div>
        </div>
        <div className="rounded-2xl border border-negative/20 bg-negative/5 p-4">
          <div className="text-[10px] text-text-muted mb-1">Sell Volume</div>
          <div className="text-[20px] font-bold text-negative">${data.sell_volume_mn?.toFixed(0)}M</div>
        </div>
      </div>

      <div className={cn(
        "rounded-2xl border p-4 text-center",
        composite >= 60 ? "border-positive/30 bg-positive/5" : "border-border bg-surface"
      )}>
        <div className="text-[10px] text-text-muted uppercase tracking-widest">Smart Money Composite</div>
        <div className={cn("text-[36px] font-black", scoreColor(composite))}>{composite}</div>
        <div className="text-[12px] font-semibold text-text-muted">{data.composite_label}</div>
      </div>

      <div className="space-y-2">
        {data.transactions?.map((t: any, i: number) => {
          const isBuy = t.type === "Buy";
          const isBullish = t.signal?.toLowerCase().includes("bullish");
          return (
            <div key={i} className={cn(
              "rounded-xl border p-3",
              isBuy && isBullish ? "border-positive/20 bg-positive/5" :
              !isBuy ? "border-border bg-surface" :
              "border-border bg-surface"
            )}>
              <div className="flex items-start justify-between mb-1">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-text-primary">{t.ticker}</span>
                    <span className={cn("text-[10px] font-semibold", isBuy ? "text-positive" : "text-negative")}>
                      {t.type}
                    </span>
                  </div>
                  <div className="text-[10px] text-text-muted">{t.insider} · {t.role}</div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-bold">${t.value_mn}M</div>
                  <div className="text-[10px] text-text-muted">{t.date}</div>
                </div>
              </div>
              <div className={cn("text-[10px] font-medium",
                t.signal?.includes("Bullish") ? "text-positive" :
                t.signal?.includes("Bearish") ? "text-negative" :
                "text-text-muted"
              )}>
                {t.signal}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab: AI Insights & Alerts ─────────────────────────────────────────────────

function InsightsTab({ insightsData, alertsData }: { insightsData: any; alertsData: any }) {
  const [view, setView] = useState<"insights" | "alerts">("insights");
  const insights: any[] = insightsData?.insights ?? [];
  const alerts: any[] = alertsData?.alerts ?? [];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-surface rounded-full p-0.5 border border-border">
        <button
          onClick={() => setView("insights")}
          className={cn("flex-1 py-1.5 rounded-full text-[10px] font-medium transition-all",
            view === "insights" ? "bg-accent text-white" : "text-text-muted")}
        >
          AI Insights ({insights.length})
        </button>
        <button
          onClick={() => setView("alerts")}
          className={cn("flex-1 py-1.5 rounded-full text-[10px] font-medium transition-all",
            view === "alerts" ? "bg-accent text-white" : "text-text-muted")}
        >
          Alerts ({alerts.length})
        </button>
      </div>

      {view === "insights" && (
        <div className="space-y-3">
          {insights.map((ins: any) => (
            <div key={ins.id} className={cn(
              "rounded-2xl border p-4",
              ins.severity === "Critical" ? "border-red-400/30 bg-red-400/5" :
              ins.severity === "High" ? "border-orange-400/30 bg-orange-400/5" :
              "border-border bg-surface"
            )}>
              <div className="flex items-start gap-3 mb-3">
                <span className="text-[20px] shrink-0">{ins.icon}</span>
                <div>
                  <div className="text-[11px] text-text-muted">{ins.category}</div>
                  <div className="text-[13px] font-bold text-text-primary leading-tight">{ins.headline}</div>
                  <Badge label={ins.severity} color={sevColor(ins.severity)} />
                </div>
              </div>
              <div className="space-y-2 text-[11px]">
                <div className="text-text-muted">{ins.detail}</div>
                <div className="rounded-lg bg-surface-2 p-2.5 space-y-1">
                  <div><span className="text-accent font-semibold">Changed: </span>{ins.what_changed}</div>
                  <div><span className="text-yellow-400 font-semibold">Matters: </span>{ins.why_it_matters}</div>
                  <div><span className="text-positive font-semibold">Impact: </span>{ins.impact}</div>
                </div>
                <div className="text-text-muted text-[10px] italic">{ins.historical}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "alerts" && (
        <div className="space-y-2">
          {alerts.map((a: any) => (
            <div key={a.id} className={cn("rounded-xl border p-3", sevColor(a.severity))}>
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1">
                  <div className="text-[12px] font-bold leading-tight">{a.title}</div>
                  <div className="text-[10px] opacity-70">{a.type} · {a.time}</div>
                </div>
                <Badge label={a.severity} color={sevColor(a.severity)} />
              </div>
              <div className="text-[11px] opacity-80 mb-2">{a.desc}</div>
              <div className="text-[10px] font-medium opacity-90">→ {a.action}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Sovereign Wealth ─────────────────────────────────────────────────────

function SovereignTab({ data }: { data: any }) {
  if (!data) return <div className="text-text-muted text-xs p-4">Loading…</div>;
  const funds: any[] = data.funds ?? [];

  return (
    <div className="space-y-3">
      <StatCard
        label="Total SWF AUM"
        value={`$${data.total_aum_tn}T`}
        sub="5 major sovereign funds"
        color="text-accent"
      />
      {funds.map((f: any) => (
        <div key={f.name} className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-[13px] font-bold text-text-primary">{f.name}</div>
              <div className="text-[10px] text-text-muted">{f.country} · ${f.aum_tn}T AUM</div>
            </div>
            <div className={cn("text-[12px] font-semibold", scoreColor(f.score))}>
              {f.score}/100
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center">
              <div className="text-[10px] text-text-muted">Equity</div>
              <div className="text-[13px] font-bold text-positive">{f.equity_pct}%</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-text-muted">Bonds</div>
              <div className="text-[13px] font-bold text-accent">{f.bond_pct}%</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-text-muted">Real Estate</div>
              <div className="text-[13px] font-bold text-text-primary">{f.re_pct}%</div>
            </div>
          </div>
          <div className="flex gap-3 text-[10px]">
            <div>
              <span className="text-text-muted">Tech: </span>
              <span className={chgColor(f.chg_qoq?.tech ?? 0)}>{fmt(f.chg_qoq?.tech ?? 0)}%</span>
            </div>
            <div>
              <span className="text-text-muted">Bonds: </span>
              <span className={chgColor(f.chg_qoq?.bonds ?? 0)}>{fmt(f.chg_qoq?.bonds ?? 0)}%</span>
            </div>
            <div>
              <span className="text-text-muted">Gold: </span>
              <span className={chgColor(f.chg_qoq?.gold ?? 0)}>{fmt(f.chg_qoq?.gold ?? 0)}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",   label: "Overview",    icon: Activity },
  { id: "holdings",   label: "Holdings",    icon: TrendingUp },
  { id: "flows",      label: "Flows",       icon: BarChart3 },
  { id: "smart",      label: "Smart $",     icon: Eye },
  { id: "hf",         label: "Hedge Funds", icon: Shield },
  { id: "mf",         label: "Mutual Funds",icon: Building2 },
  { id: "pevc",       label: "PE / VC",     icon: Globe },
  { id: "ownership",  label: "Ownership",   icon: Users },
  { id: "crowded",    label: "Crowded",     icon: AlertTriangle },
  { id: "rotation",   label: "Rotation",    icon: TrendingDown },
  { id: "insider",    label: "Insider",     icon: Brain },
  { id: "insights",   label: "Insights",    icon: Bell },
  { id: "sovereign",  label: "SWFs",        icon: Landmark },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Main Component ────────────────────────────────────────────────────────────

export default function InstTrackerPage() {
  const [tab, setTab] = useState<TabId>("overview");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["inst-tracker"],
    queryFn: fetchAll,
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header
        className="sticky top-0 z-40 px-4 bg-background/95 backdrop-blur-xl border-b border-border"
        style={{ paddingTop: `calc(env(safe-area-inset-top) + 10px)` }}
      >
        <div className="flex items-center justify-between h-11">
          <div>
            <div className="text-[14px] font-bold text-text-primary">Inst. Tracker</div>
            <div className="text-[9px] text-text-muted">13F · Smart Money · PE/VC</div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-surface-2 text-text-muted active:bg-border transition-colors"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Tab Scroll */}
        <div className="flex gap-1 overflow-x-auto pb-2 -mx-4 px-4 mt-1 scrollbar-none">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap shrink-0 transition-all border",
                tab === id
                  ? "bg-accent text-white border-accent"
                  : "text-text-muted border-border bg-surface hover:bg-surface-2"
              )}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 pt-4">
        <PageGuide
          title="Institutional Tracker"
          subtitle="Monitor 13F filings, smart money flows, hedge fund holdings, mutual fund allocations, PE/VC activity, and insider transactions in one dashboard."
          steps={[
            { title: "Overview Tab", detail: "Start here for a snapshot: total AUM tracked, top institutional buyers and sellers this quarter, net sector flows, and the most crowded positions. A great starting point for spotting where the big money is moving." },
            { title: "Holdings Tab", detail: "Browse aggregate institutional ownership for any stock. See the top 20 institutional holders, their position sizes, quarter-over-quarter changes, and whether they're new buyers or sellers." },
            { title: "Sector Flows Tab", detail: "Visualize net institutional capital flows by GICS sector over the past quarter. Green bars = net buying; red bars = net selling. Rotation from one sector to another is visible here first." },
            { title: "Smart Money Tab", detail: "Track the top-performing institutional investors (Tiger Global, Coatue, D1 Capital, etc.) — their new positions and exits are leading indicators for where conviction is building." },
            { title: "Crowded Positions Tab", detail: "Shows the 25 most-owned stocks by institutional holders. High crowding creates exit risk — if sentiment shifts, many funds need to sell simultaneously, amplifying drawdowns." },
            { title: "Insights Tab", detail: "AI-generated narrative summarizing this quarter's major institutional trends, sector rotation themes, and notable smart money moves, with actionable implications for portfolio positioning." },
          ]}
          howItWorks={[
            { title: "13F Filing Data", detail: "The SEC requires institutional investment managers with >$100M AUM to file Form 13F quarterly (45 days after quarter end). The backend parses and aggregates thousands of filings to compute net position changes." },
            { title: "Smart Money Selection", detail: "Smart money funds are selected based on historical performance and influence: top-decile 3-year risk-adjusted returns, AUM > $1B, and equity-focused mandate. Their new positions are tracked as high-conviction signals." },
            { title: "PE/VC Activity", detail: "Private equity and venture capital deal flow is aggregated from public SEC filings (Form D, S-1, 8-K) and deal databases. The tab shows recent investments, exits, and IPO pipeline activity." },
            { title: "Insider Transactions", detail: "SEC Form 4 filings report insider buys and sells within 2 business days. The Insider tab filters for open-market purchases (the most bullish signal) and screens out options exercises." },
          ]}
          tips={[
            "Focus on 'new position' buys by smart money over adds — initiating a new position requires stronger conviction than adding to an existing one.",
            "High institutional crowding (>80% ownership by top 20 holders) combined with recent net selling is a strong warning signal for potential forced liquidation.",
            "Compare the Sector Flows tab to the Regime page — institutional capital flowing into defensive sectors (utilities, healthcare) confirms a risk-off regime shift.",
          ]}
        />
      </div>

      {/* Content */}
      <div className="px-4 pt-4 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-text-muted text-xs gap-2">
            <RefreshCw size={13} className="animate-spin" /> Loading institutional data…
          </div>
        ) : (
          <>
            {tab === "overview"  && <OverviewTab data={data?.overview} />}
            {tab === "holdings"  && <HoldingsTab data={data?.holdings} />}
            {tab === "flows"     && <SectorFlowsTab data={data?.flows} />}
            {tab === "smart"     && <SmartMoneyTab data={data?.smartMoney} />}
            {tab === "hf"        && <HedgeFundsTab data={data?.hedgeFunds} />}
            {tab === "mf"        && <MutualFundsTab data={data?.mutualFunds} />}
            {tab === "pevc"      && <PeVcTab peData={data?.pe} vcData={data?.vc} />}
            {tab === "ownership" && <OwnershipTab data={data?.ownership} />}
            {tab === "crowded"   && <CrowdedTab data={data?.crowded} />}
            {tab === "rotation"  && <RotationTab data={data?.rotation} />}
            {tab === "insider"   && <InsiderTab data={data?.insider} />}
            {tab === "insights"  && <InsightsTab insightsData={data?.insights} alertsData={data?.alerts} />}
            {tab === "sovereign" && <SovereignTab data={data?.sovereign} />}
          </>
        )}
      </div>
    </div>
  );
}
