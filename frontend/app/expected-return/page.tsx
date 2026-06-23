"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, LabelList,
} from "recharts";
import { api, ERResult, ERComponents } from "@/lib/api";
import { cn } from "@/lib/utils";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";
import { PageGuide } from "@/components/PageGuide";

// ── Colour palette per factor ─────────────────────────────────────────────────

const FACTOR_COLORS: Record<string, string> = {
  base:      "#6366f1",
  momentum:  "#22c55e",
  value:     "#f59e0b",
  quality:   "#3b82f6",
  macro:     "#a855f7",
  sentiment: "#ec4899",
  low_vol:   "#14b8a6",
};

const FACTOR_ORDER: (keyof ERComponents)[] = [
  "base", "momentum", "value", "quality", "macro", "sentiment", "low_vol",
];

const FACTOR_LABELS: Record<string, string> = {
  base:      "Base",
  momentum:  "Momentum",
  value:     "Value",
  quality:   "Quality",
  macro:     "Macro",
  sentiment: "Sentiment",
  low_vol:   "Low Vol",
};

// ── Waterfall bar for a single stock ─────────────────────────────────────────

function WaterfallBar({ components }: { components: ERComponents }) {
  const data = FACTOR_ORDER.map((k) => ({
    name:  FACTOR_LABELS[k],
    value: components[k],
    color: FACTOR_COLORS[k],
    abs:   Math.abs(components[k]),
  }));

  const total = data.reduce((s, d) => s + d.value, 0);
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <div className="flex items-center gap-0.5 h-4">
      {data.map((d) => (
        <div
          key={d.name}
          title={`${d.name}: ${d.value > 0 ? "+" : ""}${d.value.toFixed(1)}%`}
          style={{
            width: `${(d.abs / (total + 0.01)) * 100}%`,
            backgroundColor: d.color,
            opacity: d.value < 0 ? 0.45 : 0.85,
            minWidth: d.abs > 0 ? 3 : 0,
          }}
          className="h-full rounded-sm transition-all"
        />
      ))}
    </div>
  );
}

// ── Colour for expected return value ─────────────────────────────────────────

function erColor(er: number) {
  if (er >= 15) return "text-emerald-400";
  if (er >= 10) return "text-green-400";
  if (er >= 5)  return "text-yellow-400";
  return "text-red-400";
}

// ── Expanded detail row ───────────────────────────────────────────────────────

function DetailRow({ result }: { result: ERResult }) {
  const chartData = FACTOR_ORDER.map((k) => ({
    name:  FACTOR_LABELS[k],
    value: result.components[k],
  }));

  return (
    <tr>
      <td colSpan={9} className="bg-surface-2 px-6 py-3 border-b border-border">
        <div className="flex gap-8">
          {/* Factor breakdown chart */}
          <div className="flex-1">
            <p className="text-xs text-text-muted mb-2 uppercase tracking-wider">Factor Contributions (%)</p>
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={chartData} barCategoryGap="25%">
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <ReferenceLine y={0} stroke="#444" />
                <Tooltip
                  formatter={(v: number) => [`${v > 0 ? "+" : ""}${v.toFixed(2)}%`, "Contribution"]}
                  contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 6 }}
                  labelStyle={{ color: "#aaa" }}
                />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {chartData.map((d) => (
                    <Cell
                      key={d.name}
                      fill={FACTOR_COLORS[FACTOR_ORDER.find((k) => FACTOR_LABELS[k] === d.name)!] ?? "#888"}
                      opacity={d.value < 0 ? 0.5 : 0.9}
                    />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
                    style={{ fontSize: 10, fill: "#aaa" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Z-score table */}
          <div className="w-56">
            <p className="text-xs text-text-muted mb-2 uppercase tracking-wider">Z-Scores</p>
            <table className="w-full text-xs">
              <tbody>
                {(Object.entries(result.z_scores) as [string, number][]).map(([k, z]) => (
                  <tr key={k} className="border-b border-border/30">
                    <td className="py-0.5 text-text-muted">{FACTOR_LABELS[k] ?? k}</td>
                    <td className={cn(
                      "py-0.5 text-right font-mono",
                      z > 0.5 ? "text-emerald-400" : z < -0.5 ? "text-red-400" : "text-text-muted",
                    )}>
                      {z > 0 ? "+" : ""}{z.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SECTORS = ["All Sectors", "Technology", "Health Care", "Financials", "Consumer Discretionary", "Industrials", "Communication Services", "Energy", "Materials", "Consumer Staples", "Utilities", "Real Estate"];

export default function ExpectedReturnPage() {
  const [universe, setUniverse] = useState("sp500");
  const [topN, setTopN]         = useState(200);
  const [sectorFilter, setSectorFilter] = useState("All Sectors");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drawer, setDrawer]     = useState<DrawerConfig | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["expected-return", universe, topN],
    queryFn:  () => api.getExpectedReturn(universe, topN),
    staleTime: 30 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!data?.results) return [];
    return data.results.filter((r) => {
      if (sectorFilter !== "All Sectors" && r.sector !== sectorFilter) return false;
      if (search && !r.ticker.toLowerCase().includes(search.toLowerCase()) &&
          !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, sectorFilter, search]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-6 pt-4">
        <PageGuide
          title="Expected Return Engine"
          subtitle="Compute factor-based expected returns for every stock in the S&P 500 or Nasdaq 100 using a 7-factor model."
          steps={[
            { title: "Select Universe & Size", detail: "Choose S&P 500 or Nasdaq 100, and set how many stocks to fetch (top 50 to 500 by market cap). Larger universes give more cross-sectional context but take longer." },
            { title: "Filter by Sector", detail: "Use the sector dropdown to narrow results to a specific GICS sector. This is useful for intra-sector stock selection based on factor exposures." },
            { title: "Search Tickers", detail: "Type in the search box to find a specific company's expected return decomposition instantly." },
            { title: "Read the Expected Return", detail: "The E[R] column shows the annualized expected return. A value of +12% means the model expects 12% price appreciation over the next year based on current factor scores." },
            { title: "Expand Factor Decomposition", detail: "Click any row to expand it and see the full factor attribution — how much each factor (momentum, value, quality, macro, sentiment, low-vol) contributes to the total expected return." },
            { title: "Use the Bar Chart", detail: "The factor waterfall bar chart visually shows each factor's contribution. Bars above zero are additive (positive expected return); below zero are subtractive." },
          ]}
          howItWorks={[
            { title: "Factor Model", detail: "E[R] = Base (9%) + Σ (factor_z_score × factor_premium × 0.5). The base rate is the long-run equity risk premium. Each factor z-score is computed cross-sectionally (vs. the universe) and multiplied by an empirical risk premium." },
            { title: "Factor Premiums", detail: "Momentum: +6%, Value: +4%, Quality: +5%, Macro: ±3%, Sentiment: +2%, Low Volatility: +3%. These are long-run empirical premia from academic and practitioner research; they are not recalibrated daily." },
            { title: "Z-Score Normalization", detail: "Each stock's raw factor value (e.g. 12-month price momentum = +32%) is normalized relative to the universe using mean and standard deviation. A z-score of +1.5 means the stock is 1.5 standard deviations above average on that factor." },
            { title: "Data Sources", detail: "Price momentum from yfinance; earnings estimates from financial APIs; quality metrics (ROIC, margins) from quarterly financials; macro exposures from factor regressions against economic indices." },
          ]}
          tips={[
            "Sort by Expected Return descending and filter to Quality + Momentum stocks — this combination has the highest historical information ratio.",
            "Expected returns are model estimates, not guarantees — use them as one signal among many, not a standalone buy/sell trigger.",
            "Compare E[R] across sectors to identify which sector the model is most bullish on currently — a useful input for a sector rotation decision.",
          ]}
        />
      </div>

      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Expected Return Engine</h1>
          <p className="text-xs text-text-muted mt-0.5">
            E[R] = Base (9%) + Σ (z-score × factor premium × 0.5) &nbsp;·&nbsp;
            {data && <span>{data.computed} stocks computed · as of {data.as_of}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search ticker / name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 px-3 text-sm bg-surface-2 border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent w-48"
          />
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="h-8 px-2 text-sm bg-surface-2 border border-border rounded-md text-text-primary focus:outline-none"
          >
            {SECTORS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select
            value={universe}
            onChange={(e) => setUniverse(e.target.value)}
            className="h-8 px-2 text-sm bg-surface-2 border border-border rounded-md text-text-primary focus:outline-none"
          >
            <option value="sp500">S&P 500</option>
            <option value="nasdaq100">Nasdaq 100</option>
            <option value="russell2000">Russell 2000</option>
          </select>
          <button
            onClick={() => refetch()}
            className="h-8 px-3 text-sm bg-accent text-white rounded-md hover:opacity-80 transition-opacity"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Factor legend */}
      <div className="px-6 py-2 border-b border-border flex items-center gap-4 flex-wrap">
        {FACTOR_ORDER.map((k) => (
          <div key={k} className="flex items-center gap-1.5 text-xs text-text-muted">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: FACTOR_COLORS[k] }} />
            {FACTOR_LABELS[k]}
            {data?.factor_specs?.[k] && (
              <span className="text-text-muted/60">
                ({data.factor_specs[k].premium > 0 ? "+" : ""}{data.factor_specs[k].premium}% premium)
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-text-muted">Computing expected returns for S&P 500… (~30s)</p>
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-32 text-red-400 text-sm">
            Failed to load — check backend connection.
          </div>
        )}
        {!isLoading && !isError && (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wider">
                <th className="px-4 py-2 text-left w-10">#</th>
                <th className="px-4 py-2 text-left w-24">Ticker</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left w-36">Sector</th>
                <th className="px-3 py-2 text-right w-20">Price</th>
                <th className="px-3 py-2 text-right w-16">1D</th>
                <th className="px-4 py-2 text-right w-24">Exp. Return</th>
                <th className="px-4 py-2 text-left w-64">Breakdown</th>
                <th className="px-3 py-2 text-right w-20">Composite</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <>
                  <tr
                    key={r.ticker}
                    onClick={() => setExpanded(expanded === r.ticker ? null : r.ticker)}
                    className="border-b border-border/40 hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2 text-text-muted font-mono text-xs">{r.rank}</td>
                    <td className="px-4 py-2 font-semibold text-accent" onClick={e => { e.stopPropagation(); setDrawer({ fetchUrl: `/api/chart/stock/${r.ticker}`, color: "#6366f1" }); }}>{r.ticker}</td>
                    <td className="px-4 py-2 text-text-primary truncate max-w-xs">{r.name}</td>
                    <td className="px-4 py-2 text-text-muted text-xs truncate">{r.sector}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-primary">
                      {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                    </td>
                    <td className={cn(
                      "px-3 py-2 text-right font-mono text-xs",
                      r.chg_1d != null && r.chg_1d > 0 ? "text-green-400" : "text-red-400",
                    )}>
                      {r.chg_1d != null ? `${r.chg_1d > 0 ? "+" : ""}${(r.chg_1d * 100).toFixed(2)}%` : "—"}
                    </td>
                    <td className={cn("px-4 py-2 text-right font-mono font-bold", erColor(r.expected_return))}>
                      {r.expected_return > 0 ? "+" : ""}{r.expected_return.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2">
                      <WaterfallBar components={r.components} />
                    </td>
                    <td className={cn(
                      "px-3 py-2 text-right font-mono text-xs",
                      r.composite_score != null && r.composite_score > 0 ? "text-emerald-400" : "text-red-400",
                    )}>
                      {r.composite_score != null ? r.composite_score.toFixed(2) : "—"}
                    </td>
                  </tr>
                  {expanded === r.ticker && <DetailRow key={`${r.ticker}-detail`} result={r} />}
                </>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-text-muted">
                    No results match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer summary */}
      {data && !isLoading && (
        <div className="px-6 py-2 border-t border-border flex items-center gap-6 text-xs text-text-muted">
          <span>Showing {filtered.length} of {data.computed} stocks</span>
          <span>Base return: {data.base_return}%</span>
          <span className="text-text-muted/50">Click any row to expand factor detail</span>
        </div>
      )}
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}
