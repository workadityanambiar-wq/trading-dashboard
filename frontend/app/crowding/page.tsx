"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Legend,
} from "recharts";
import { api, CrowdingResult, SectorCrowding } from "@/lib/api";
import { cn } from "@/lib/utils";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";

// ── Colour helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score == null) return "text-text-muted";
  if (score >= 75) return "text-red-400";
  if (score >= 60) return "text-orange-400";
  if (score >= 40) return "text-yellow-400";
  if (score >= 25) return "text-teal-400";
  return "text-emerald-400";
}

function scoreBg(score: number | null): string {
  if (score == null) return "bg-border";
  if (score >= 75) return "bg-red-500";
  if (score >= 60) return "bg-orange-500";
  if (score >= 40) return "bg-yellow-500";
  if (score >= 25) return "bg-teal-500";
  return "bg-emerald-500";
}

function labelBadge(label: string) {
  const cls: Record<string, string> = {
    "Extremely Crowded": "bg-red-500/20 text-red-400 border-red-500/30",
    "Crowded":           "bg-orange-500/20 text-orange-400 border-orange-500/30",
    "Moderate":          "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    "Under the Radar":   "bg-teal-500/20 text-teal-400 border-teal-500/30",
    "Undiscovered":      "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs border font-medium", cls[label] ?? "bg-border text-text-muted")}>
      {label}
    </span>
  );
}

// ── Crowding score gauge bar ──────────────────────────────────────────────────

function ScoreBar({ score }: { score: number | null }) {
  const pct = score ?? 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", scoreBg(score))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("text-xs font-mono w-8 text-right", scoreColor(score))}>
        {score != null ? score.toFixed(0) : "—"}
      </span>
    </div>
  );
}

// ── Analyst donut ─────────────────────────────────────────────────────────────

function AnalystDonut({ buy, hold, sell }: { buy: number | null; hold: number | null; sell: number | null }) {
  if (!buy && !hold && !sell) return <span className="text-xs text-text-muted">—</span>;
  const data = [
    { name: "Buy",  value: buy  ?? 0, fill: "#22c55e" },
    { name: "Hold", value: hold ?? 0, fill: "#f59e0b" },
    { name: "Sell", value: sell ?? 0, fill: "#ef4444" },
  ].filter(d => d.value > 0);

  return (
    <ResponsiveContainer width={60} height={60}>
      <PieChart>
        <Pie data={data} dataKey="value" outerRadius={25} innerRadius={14} strokeWidth={0}>
          {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
        </Pie>
        <Tooltip
          formatter={(v: number) => [`${v.toFixed(0)}%`, ""]}
          contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 6, fontSize: 11 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Summary stat card ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "text-text-primary" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3 flex-1">
      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={cn("text-lg font-bold", color)}>{value}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Sector heatmap strip ──────────────────────────────────────────────────────

function SectorStrip({ sectors }: { sectors: SectorCrowding[] }) {
  const short: Record<string, string> = {
    "Technology": "Tech", "Health Care": "Health", "Financials": "Fin",
    "Consumer Discretionary": "Disc", "Industrials": "Ind",
    "Communication Services": "Comm", "Energy": "Nrg",
    "Materials": "Mat", "Consumer Staples": "Stapl",
    "Utilities": "Util", "Real Estate": "RE",
  };
  return (
    <div className="flex gap-2 flex-wrap">
      {sectors.map(s => (
        <div key={s.sector} title={`${s.sector}: ${s.avg_score}`}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface border border-border text-xs">
          <div className={cn("w-2 h-2 rounded-full", scoreBg(s.avg_score))} />
          <span className="text-text-muted">{short[s.sector] ?? s.sector}</span>
          <span className={cn("font-mono font-bold", scoreColor(s.avg_score))}>{s.avg_score}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "all" | "crowded" | "radar" | "squeeze";

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "all",     label: "All Stocks",       desc: "" },
  { id: "crowded", label: "Most Crowded",      desc: "score ≥ 60" },
  { id: "radar",   label: "Under the Radar",   desc: "score ≤ 40" },
  { id: "squeeze", label: "Short Squeeze",     desc: "short >10% + uptrend" },
];

export default function CrowdingPage() {
  const [tab, setTab]           = useState<Tab>("all");
  const [search, setSearch]     = useState("");
  const [universe, setUniverse] = useState("sp500");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["crowding", universe],
    queryFn:  () => api.getCrowding(universe, 150),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!data?.results) return [];
    let rows = data.results;

    if (tab === "crowded") rows = rows.filter(r => (r.crowding_score ?? 0) >= 60);
    if (tab === "radar")   rows = rows.filter(r => (r.crowding_score ?? 100) <= 40);
    if (tab === "squeeze") rows = rows.filter(r => r.squeeze_candidate);

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [data, tab, search]);

  // Summary stats
  const topCrowded   = data?.results.find(r => (r.crowding_score ?? 0) >= 60);
  const topUndisco   = [...(data?.results ?? [])].reverse().find(r => (r.crowding_score ?? 100) <= 35);
  const topUpgraded  = data?.results.slice().sort((a, b) => b.net_upgrades - a.net_upgrades)[0];
  const squeezeCount = data?.results.filter(r => r.squeeze_candidate).length ?? 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Crowding Dashboard</h1>
            <p className="text-xs text-text-muted mt-0.5">
              Find trades before they become crowded — or after everyone piled in.
              {data && <span> &nbsp;·&nbsp; {data.computed} stocks · as of {data.as_of}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text" placeholder="Search…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 px-3 text-sm bg-surface-2 border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none w-40"
            />
            <select value={universe} onChange={e => setUniverse(e.target.value)}
              className="h-8 px-2 text-sm bg-surface-2 border border-border rounded-md text-text-primary">
              <option value="sp500">S&P 500</option>
              <option value="nasdaq100">Nasdaq 100</option>
            </select>
            <button onClick={() => refetch()}
              className="h-8 px-3 text-sm bg-accent text-white rounded-md hover:opacity-80 transition-opacity">
              Refresh
            </button>
          </div>
        </div>

        {/* Sector heatmap */}
        {data?.sector_crowding && (
          <div className="mt-3">
            <SectorStrip sectors={data.sector_crowding} />
          </div>
        )}
      </div>

      {/* Summary cards */}
      {data && (
        <div className="px-6 py-3 border-b border-border flex gap-3">
          <StatCard
            label="Most Crowded"
            value={topCrowded?.ticker ?? "—"}
            sub={topCrowded ? `${topCrowded.crowding_label} · ${topCrowded.crowding_score?.toFixed(0)}` : undefined}
            color="text-red-400"
          />
          <StatCard
            label="Undiscovered"
            value={topUndisco?.ticker ?? "—"}
            sub={topUndisco ? `Score ${topUndisco.crowding_score?.toFixed(0)} · ${topUndisco.num_analysts} analysts` : undefined}
            color="text-emerald-400"
          />
          <StatCard
            label="Most Upgraded (90d)"
            value={topUpgraded?.ticker ?? "—"}
            sub={topUpgraded ? `+${topUpgraded.net_upgrades} net upgrades` : undefined}
            color="text-blue-400"
          />
          <StatCard
            label="Squeeze Candidates"
            value={String(squeezeCount)}
            sub="High short + uptrend"
            color="text-orange-400"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="px-6 border-b border-border flex gap-1 pt-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 text-sm rounded-t transition-colors",
              tab === t.id
                ? "text-text-primary border-b-2 border-accent"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            {t.label}
            {t.desc && <span className="ml-1 text-xs text-text-muted hidden sm:inline">({t.desc})</span>}
          </button>
        ))}
        <div className="ml-auto flex items-center pb-2 text-xs text-text-muted">
          {filtered.length} stocks
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-text-muted">Fetching institutional, analyst & short data… (~30-60s first load)</p>
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-32 text-red-400 text-sm">
            Failed to load — check backend.
          </div>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">
            No stocks match the current filter.
          </div>
        )}
        {!isLoading && !isError && filtered.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wider">
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left w-20">Ticker</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left w-28">Sector</th>
                <th className="px-3 py-2 text-center w-24">Crowding</th>
                <th className="px-3 py-2 text-right w-28">Score</th>
                <th className="px-3 py-2 text-right w-20">Inst %</th>
                <th className="px-3 py-2 text-right w-16">Buy %</th>
                <th className="px-3 py-2 text-right w-16">Short %</th>
                <th className="px-3 py-2 text-right w-20">Net Upg.</th>
                <th className="px-3 py-2 text-right w-16">1M Ret</th>
                <th className="px-3 py-2 text-left w-32">Label</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <Row key={r.ticker} r={r} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <div className="px-6 py-2 border-t border-border flex items-center gap-6 text-xs text-text-muted flex-wrap">
        {[
          { label: "Extremely Crowded (≥75)", color: "bg-red-500" },
          { label: "Crowded (≥60)", color: "bg-orange-500" },
          { label: "Moderate (40-60)", color: "bg-yellow-500" },
          { label: "Under the Radar (≤40)", color: "bg-teal-500" },
          { label: "Undiscovered (<25)", color: "bg-emerald-500" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={cn("w-2.5 h-2.5 rounded-full", l.color)} />
            {l.label}
          </div>
        ))}
        <span className="text-text-muted/50 ml-auto">
          Score = 40% Inst. Ownership + 30% Buy % + 20% Low Short + 10% News
        </span>
      </div>
    </div>
  );
}

// ── Table row component ───────────────────────────────────────────────────────

function Row({ r }: { r: CrowdingResult }) {
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);

  return (
    <>
      <tr
        onClick={() => setOpen(p => !p)}
        className="border-b border-border/40 hover:bg-surface-2 cursor-pointer transition-colors"
      >
        <td className="px-3 py-2 text-text-muted font-mono text-xs">{r.rank}</td>
        <td className="px-3 py-2 font-semibold text-accent" onClick={e => { e.stopPropagation(); setDrawer({ fetchUrl: `/api/chart/stock/${r.ticker}`, color: "#6366f1" }); }}>{r.ticker}</td>
        <td className="px-3 py-2 text-text-primary truncate max-w-[180px]">{r.name}</td>
        <td className="px-3 py-2 text-text-muted text-xs truncate">{r.sector}</td>
        <td className="px-3 py-2">
          <ScoreBar score={r.crowding_score} />
        </td>
        <td className={cn("px-3 py-2 text-right font-mono font-bold text-sm", scoreColor(r.crowding_score))}>
          {r.crowding_score?.toFixed(1) ?? "—"}
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs text-text-primary">
          {r.inst_pct != null ? `${r.inst_pct.toFixed(1)}%` : "—"}
        </td>
        <td className={cn("px-3 py-2 text-right font-mono text-xs",
          r.buy_pct != null && r.buy_pct >= 60 ? "text-green-400" : r.buy_pct != null && r.buy_pct < 40 ? "text-red-400" : "text-text-primary")}>
          {r.buy_pct != null ? `${r.buy_pct.toFixed(0)}%` : "—"}
        </td>
        <td className={cn("px-3 py-2 text-right font-mono text-xs",
          r.short_pct != null && r.short_pct >= 15 ? "text-red-400" : r.short_pct != null && r.short_pct <= 3 ? "text-emerald-400" : "text-text-primary")}>
          {r.short_pct != null ? `${r.short_pct.toFixed(1)}%` : "—"}
          {r.squeeze_candidate && <span className="ml-1 text-orange-400">⚡</span>}
        </td>
        <td className={cn("px-3 py-2 text-right font-mono text-xs",
          r.net_upgrades > 0 ? "text-green-400" : r.net_upgrades < 0 ? "text-red-400" : "text-text-muted")}>
          {r.net_upgrades > 0 ? "+" : ""}{r.net_upgrades}
        </td>
        <td className={cn("px-3 py-2 text-right font-mono text-xs",
          r.mo_1m != null && r.mo_1m > 0 ? "text-green-400" : r.mo_1m != null && r.mo_1m < 0 ? "text-red-400" : "text-text-muted")}>
          {r.mo_1m != null ? `${r.mo_1m > 0 ? "+" : ""}${r.mo_1m.toFixed(1)}%` : "—"}
        </td>
        <td className="px-3 py-2">{labelBadge(r.crowding_label)}</td>
      </tr>

      {open && (
        <tr>
          <td colSpan={12} className="bg-surface-2 px-6 py-4 border-b border-border">
            <div className="flex gap-8 flex-wrap">
              {/* Analyst donut */}
              <div>
                <p className="text-xs text-text-muted mb-1 uppercase tracking-wider">Analyst Consensus</p>
                <div className="flex items-center gap-3">
                  <AnalystDonut buy={r.buy_pct} hold={r.hold_pct} sell={r.sell_pct} />
                  <div className="text-xs space-y-1">
                    <div className="flex gap-2">
                      <span className="text-green-400">Buy</span>
                      <span className="font-mono">{r.buy_pct?.toFixed(0) ?? "—"}%</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-yellow-400">Hold</span>
                      <span className="font-mono">{r.hold_pct?.toFixed(0) ?? "—"}%</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-red-400">Sell</span>
                      <span className="font-mono">{r.sell_pct?.toFixed(0) ?? "—"}%</span>
                    </div>
                    <div className="flex gap-2 text-text-muted">
                      <span>Analysts</span>
                      <span className="font-mono">{r.num_analysts}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Key metrics */}
              <div className="text-xs space-y-1.5 min-w-[160px]">
                <p className="text-text-muted uppercase tracking-wider mb-1">Key Metrics</p>
                <MetricRow label="Target Upside" value={r.target_upside != null ? `${r.target_upside > 0 ? "+" : ""}${r.target_upside.toFixed(1)}%` : "—"}
                  positive={r.target_upside != null && r.target_upside > 0} />
                <MetricRow label="Short Ratio" value={r.short_ratio != null ? `${r.short_ratio.toFixed(1)}d` : "—"} />
                <MetricRow label="Insider %" value={r.insider_pct != null ? `${r.insider_pct.toFixed(1)}%` : "—"} />
                <MetricRow label="News (7d)" value={String(r.news_count)} />
                <MetricRow label="Upgrades 90d" value={String(r.upgrades_90d)} positive={r.upgrades_90d > 0} />
                <MetricRow label="Downgrades 90d" value={String(r.downgrades_90d)} positive={false} negative={r.downgrades_90d > 0} />
              </div>

              {/* Price momentum */}
              <div className="text-xs min-w-[120px]">
                <p className="text-text-muted uppercase tracking-wider mb-1">Price Momentum</p>
                <div className="space-y-1.5">
                  <MetricRow label="1 Month" value={r.mo_1m != null ? `${r.mo_1m > 0 ? "+" : ""}${r.mo_1m.toFixed(1)}%` : "—"}
                    positive={r.mo_1m != null && r.mo_1m > 0} negative={r.mo_1m != null && r.mo_1m < 0} />
                  <MetricRow label="3 Month" value={r.mo_3m != null ? `${r.mo_3m > 0 ? "+" : ""}${r.mo_3m.toFixed(1)}%` : "—"}
                    positive={r.mo_3m != null && r.mo_3m > 0} negative={r.mo_3m != null && r.mo_3m < 0} />
                </div>
                {r.squeeze_candidate && (
                  <div className="mt-2 px-2 py-1 bg-orange-500/10 border border-orange-500/30 rounded text-orange-400 text-xs">
                    ⚡ Short Squeeze Watch — high short + uptrend
                  </div>
                )}
              </div>

              {/* Crowding breakdown */}
              <div className="text-xs min-w-[160px]">
                <p className="text-text-muted uppercase tracking-wider mb-1">What drives this score?</p>
                <div className="space-y-1.5">
                  <div>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-text-muted">Inst. Ownership (40%)</span>
                      <span className={r.inst_pct != null && r.inst_pct > 75 ? "text-red-400" : "text-text-primary"}>
                        {r.inst_pct?.toFixed(1) ?? "—"}%
                      </span>
                    </div>
                    <div className="h-1 bg-surface rounded-full">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(r.inst_pct ?? 0, 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-text-muted">Analyst Buy % (30%)</span>
                      <span className={r.buy_pct != null && r.buy_pct > 70 ? "text-orange-400" : "text-text-primary"}>
                        {r.buy_pct?.toFixed(0) ?? "—"}%
                      </span>
                    </div>
                    <div className="h-1 bg-surface rounded-full">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${r.buy_pct ?? 0}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-text-muted">Low Short % (20%)</span>
                      <span className={r.short_pct != null && r.short_pct < 3 ? "text-red-400" : "text-text-primary"}>
                        {r.short_pct?.toFixed(1) ?? "—"}%
                      </span>
                    </div>
                    <div className="h-1 bg-surface rounded-full">
                      <div className="h-full bg-teal-500 rounded-full"
                        style={{ width: `${Math.max(0, 100 - (r.short_pct ?? 50))}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </>
  );
}

function MetricRow({ label, value, positive = false, negative = false }: {
  label: string; value: string; positive?: boolean; negative?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-text-muted">{label}</span>
      <span className={cn("font-mono", positive ? "text-green-400" : negative ? "text-red-400" : "text-text-primary")}>
        {value}
      </span>
    </div>
  );
}
