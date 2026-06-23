"use client";
import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, FACTOR_OPTIONS, type ICStats, type FFPoint, type FFSummary } from "@/lib/api";
import { FactorICChart } from "@/components/charts/FactorICChart";
import { QuintileReturns } from "@/components/charts/QuintileReturns";
import { RefreshCw, Plus, X, ChevronDown, Clock, Database, TrendingUp } from "lucide-react";
import { cn, formatPct } from "@/lib/utils";
import { PageGuide } from "@/components/PageGuide";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine,
} from "recharts";

// ── Universe selector ─────────────────────────────────────────────────────────

type UniversePreset = "sp500" | "sp1500" | "all_cached" | "custom";

const UNIVERSE_OPTIONS = [
  { value: "sp500"      as UniversePreset, label: "S&P 500",    description: "503 large-cap US stocks" },
  { value: "sp1500"     as UniversePreset, label: "S&P 1500",   description: "500 + 400 mid + 600 small" },
  { value: "all_cached" as UniversePreset, label: "All Cached", description: "Every ticker with price history" },
  { value: "custom"     as UniversePreset, label: "Custom",     description: "Pick your own tickers" },
];

const PRICE_FACTORS  = FACTOR_OPTIONS.filter((f) => f.icHistory);
const FUND_FACTORS   = FACTOR_OPTIONS.filter((f) => !f.icHistory);

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, description }: { label: string; value: string | null; description: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className="text-lg font-semibold text-text-primary">
        {value ?? <span className="text-text-muted text-sm">—</span>}
      </div>
      <div className="text-xs text-text-muted mt-1">{description}</div>
    </div>
  );
}

function UniverseDropdown({ value, onChange }: { value: UniversePreset; onChange: (v: UniversePreset) => void }) {
  const [open, setOpen] = useState(false);
  const selected = UNIVERSE_OPTIONS.find((o) => o.value === value)!;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-surface text-xs text-text-primary hover:border-accent transition-colors"
      >
        {selected.label}
        <ChevronDown size={11} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-border bg-surface shadow-xl">
          {UNIVERSE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-2.5 text-xs hover:bg-surface-2 transition-colors first:rounded-t-lg last:rounded-b-lg",
                opt.value === value ? "text-accent" : "text-text-primary"
              )}
            >
              <div className="font-medium">{opt.label}</div>
              <div className="text-text-muted mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomTickerInput({ tickers, onChange }: { tickers: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  function add() {
    const tokens = input.toUpperCase().trim().split(/[\s,;]+/).filter(Boolean);
    onChange(Array.from(new Set([...tickers, ...tokens])));
    setInput("");
    ref.current?.focus();
  }
  return (
    <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
      <div className="text-xs text-text-muted font-medium">Custom Tickers</div>
      <div className="flex gap-2">
        <input
          ref={ref}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="AAPL MSFT GOOGL…"
          className="flex-1 bg-background border border-border rounded px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <button
          onClick={add}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-border bg-surface-2 text-xs text-text-muted hover:text-accent hover:border-accent transition-colors"
        >
          <Plus size={11} /> Add
        </button>
      </div>
      {tickers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {tickers.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-2 border border-border text-xs font-mono text-text-primary">
              {t}
              <button onClick={() => onChange(tickers.filter((x) => x !== t))} className="text-text-muted hover:text-red-400">
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="text-xs text-text-muted/50 italic">No tickers added yet</div>
      )}
    </div>
  );
}

function NoHistoryCard({ factor }: { factor: string }) {
  const label = FACTOR_OPTIONS.find((f) => f.value === factor)?.label ?? factor;
  return (
    <div className="rounded-lg border border-border bg-surface p-8 flex flex-col items-center gap-3 text-center">
      <Database size={28} strokeWidth={1} className="text-text-muted/50" />
      <div className="text-sm font-medium text-text-primary">{label}</div>
      <div className="text-xs text-text-muted max-w-sm">
        IC history requires time-series fundamental snapshots. This factor shows current
        cross-sectional scores in the Screener. Fetch fundamentals via the Screener page
        to populate value, quality, profitability, and sentiment scores.
      </div>
      <div className="flex items-center gap-1.5 text-xs text-yellow-500/80 mt-1">
        <Clock size={11} />
        Screener → "Fundamentals" button fetches latest data
      </div>
    </div>
  );
}

// ── Factor tab groups ─────────────────────────────────────────────────────────

function FactorTabs({ selected, onChange }: { selected: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      {/* Price-based group */}
      <div>
        <div className="text-[10px] text-text-muted/60 font-medium uppercase tracking-wider px-1 mb-1">
          Price-based · full IC history
        </div>
        <div className="flex flex-wrap gap-1">
          {PRICE_FACTORS.map((f) => (
            <button
              key={f.value}
              onClick={() => onChange(f.value)}
              className={cn(
                "px-2.5 py-1.5 rounded text-xs transition-colors",
                selected === f.value
                  ? "bg-accent text-white"
                  : "bg-surface border border-border text-text-muted hover:text-text-primary"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {/* Fundamental group */}
      <div>
        <div className="text-[10px] text-text-muted/60 font-medium uppercase tracking-wider px-1 mb-1">
          Fundamental · latest scores only
        </div>
        <div className="flex flex-wrap gap-1">
          {FUND_FACTORS.map((f) => (
            <button
              key={f.value}
              onClick={() => onChange(f.value)}
              className={cn(
                "px-2.5 py-1.5 rounded text-xs transition-colors",
                selected === f.value
                  ? "bg-accent/80 text-white"
                  : "bg-surface border border-border border-dashed text-text-muted hover:text-text-primary"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── FF colour palette ─────────────────────────────────────────────────────────

const FF_COLORS: Record<string, string> = {
  spx:    "#a78bfa",
  mkt_rf: "#6366f1",
  smb:    "#22c55e",
  hml:    "#f59e0b",
  rmw:    "#3b82f6",
  cma:    "#ec4899",
  mom:    "#f97316",
};

const FF_ORDER = ["spx", "mkt_rf", "mom", "hml", "rmw", "smb", "cma"] as const;

function pctFmt(v: number) {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

// ── Long-run chart ────────────────────────────────────────────────────────────

function FamaFrenchSection() {
  const [visible, setVisible] = useState<Set<string>>(
    new Set(["spx", "mkt_rf", "mom", "hml"])
  );
  const [view, setView] = useState<"cumulative" | "drawdown">("cumulative");

  const { data, isLoading, error } = useQuery({
    queryKey: ["fama-french"],
    queryFn:  api.getFamaFrench,
    staleTime: 24 * 60 * 60 * 1000,
  });

  function toggleFactor(key: string) {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }

  const series = view === "cumulative" ? data?.series : data?.drawdown;
  const factors = data?.factors ?? {};

  // Thin the series to monthly (already monthly) — but reduce label density
  const thinned = useMemo(() => {
    if (!series) return [];
    // Show a tick every 5 years for X axis — still render all data points
    return series;
  }, [series]);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-accent" />
            <span className="text-sm font-medium">Long-Run Factor Performance</span>
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            Fama-French 5-Factor + Momentum · SPX benchmark · Monthly since 1963
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-border overflow-hidden">
            {(["cumulative", "drawdown"] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn("px-3 py-1 text-xs transition-colors capitalize",
                  view === v ? "bg-accent text-white" : "text-text-muted hover:text-text-primary")}>
                {v}
              </button>
            ))}
          </div>
          {isLoading && <RefreshCw size={12} className="animate-spin text-text-muted" />}
        </div>
      </div>

      {/* Factor toggles */}
      <div className="flex flex-wrap gap-1.5">
        {FF_ORDER.map(key => {
          const label = factors[key] ?? key;
          const on = visible.has(key);
          return (
            <button key={key} onClick={() => toggleFactor(key)}
              className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors border",
                on ? "text-white border-transparent" : "text-text-muted border-border bg-surface")}
              style={on ? { background: FF_COLORS[key] } : {}}
            >
              <span className="w-2 h-2 rounded-full shrink-0"
                style={{ background: FF_COLORS[key] }} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      {error ? (
        <div className="h-72 flex items-center justify-center text-red-400 text-sm">
          Failed to load Fama-French data
        </div>
      ) : !thinned.length ? (
        <div className="h-72 flex items-center justify-center text-text-muted text-sm">
          {isLoading ? "Loading historical data…" : "No data"}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={thinned} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false}
              interval={Math.floor(thinned.length / 12)}
              tickFormatter={d => d.slice(0, 4)} />
            <YAxis tick={{ fontSize: 9, fill: "#6b6b80" }} tickLine={false}
              tickFormatter={view === "cumulative"
                ? (v: number) => `${v.toFixed(0)}×`
                : (v: number) => `${(v * 100).toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 11 }}
              formatter={(val: number, name: string) => [
                view === "cumulative" ? `${val?.toFixed(2)}×` : pctFmt(val),
                factors[name] ?? name,
              ]}
              labelFormatter={l => `${l}`}
            />
            {view === "drawdown" && <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="3 3" />}
            {FF_ORDER.filter(k => visible.has(k)).map(key => (
              <Line key={key} type="monotone" dataKey={key}
                stroke={FF_COLORS[key]} dot={false} strokeWidth={1.5}
                name={key} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Summary stats table */}
      {data?.summaries && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted border-b border-border">
                {["Factor", "Ann. Return", "Ann. Vol", "Sharpe", "Max DD", "Months"].map(h => (
                  <th key={h} className="text-left py-1.5 pr-4 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FF_ORDER.filter(k => k in data.summaries).map(key => {
                const s: FFSummary = data.summaries[key];
                return (
                  <tr key={key} className="border-b border-border/30 hover:bg-surface-2/50">
                    <td className="py-1.5 pr-4">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: FF_COLORS[key] }} />
                        {factors[key] ?? key}
                      </span>
                    </td>
                    <td className={cn("py-1.5 pr-4 font-mono", s.ann_return >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {pctFmt(s.ann_return)}
                    </td>
                    <td className="py-1.5 pr-4 font-mono text-text-primary">{pctFmt(s.ann_vol)}</td>
                    <td className={cn("py-1.5 pr-4 font-mono", s.sharpe >= 0.5 ? "text-emerald-400" : s.sharpe >= 0 ? "text-amber-400" : "text-red-400")}>
                      {s.sharpe.toFixed(2)}
                    </td>
                    <td className="py-1.5 pr-4 font-mono text-red-400">{pctFmt(s.max_dd)}</td>
                    <td className="py-1.5 pr-4 font-mono text-text-muted">{s.n_months}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[10px] text-text-muted/60">
        Source: Kenneth French Data Library · SPX: Yahoo Finance (^GSPC, price return) ·
        Returns are in USD, not annualised in chart · Cumulative starts at 1.0 in January 1963
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

// Factors that have a Fama-French long-run quintile portfolio equivalent
const FF_QUINTILE_FACTORS = new Set(["momentum_12_1", "momentum_6_1", "low_volatility"]);

export default function FactorsPage() {
  const [factor, setFactor]           = useState("momentum_12_1");
  const [universePreset, setUniverse] = useState<UniversePreset>("sp500");
  const [customTickers, setCustom]    = useState<string[]>([]);
  const [quintileMode, setQuintileMode] = useState<"live" | "longrun">("live");

  const universeParam = useMemo(() => {
    return universePreset === "custom" ? customTickers.join(",") : universePreset;
  }, [universePreset, customTickers]);

  const ready = universePreset !== "custom" || customTickers.length >= 10;
  const selectedMeta = FACTOR_OPTIONS.find((f) => f.value === factor)!;
  const hasPriceHistory = selectedMeta?.icHistory ?? false;
  const hasFFQuintile   = FF_QUINTILE_FACTORS.has(factor);

  const { data: icData, isLoading: icLoading } = useQuery({
    queryKey: ["ic", factor, universeParam],
    queryFn: () => api.getIC(factor, 21, universeParam),
    staleTime: 5 * 60 * 1000,
    enabled: ready && hasPriceHistory,
  });

  const { data: qData, isLoading: qLoading } = useQuery({
    queryKey: ["quintiles", factor, universeParam],
    queryFn: () => api.getQuintiles(factor, universeParam),
    staleTime: 5 * 60 * 1000,
    enabled: ready && hasPriceHistory,
  });

  const { data: ffQData, isLoading: ffQLoading } = useQuery({
    queryKey: ["ff-quintiles", factor],
    queryFn: () => api.getFFQuintiles(factor),
    staleTime: 24 * 60 * 60 * 1000,
    enabled: hasPriceHistory && hasFFQuintile,
  });

  const stats: ICStats | undefined = icData?.stats;

  return (
    <div className="space-y-5 max-w-screen-xl">
      <PageGuide
        title="Factor Analysis — Guide"
        subtitle="Information Coefficient analysis showing which factors predict future returns"
        steps={[
          { title: "Select One or More Factors", detail: "Add factors using the + button or the factor tag list. You can compare multiple factors side by side. Start with Momentum 12-1, Quality, and Value for a balanced view." },
          { title: "Choose a Universe", detail: "S&P 500 tests the factor on large caps only. S&P 1500 includes mid and small caps. All Cached tests on every ticker in the database. Custom lets you paste your own list." },
          { title: "Set Lookback and Forward Period", detail: "Lookback controls how much history to use for the IC calculation. Forward period (1M, 3M) sets how far ahead you're testing return predictability." },
          { title: "Run and Interpret IC", detail: "Click Compute. IC (Information Coefficient) is the Spearman rank correlation between factor scores and forward returns. IC > 0.05 is meaningful; IC > 0.10 is excellent." },
          { title: "Read the IC History Chart", detail: "The IC history chart shows how the factor's predictive power has varied over time. Stable positive IC = consistent factor. Volatile IC = factor works in some regimes but not others." },
        ]}
        howItWorks={[
          { title: "Information Coefficient Definition", detail: "IC = Spearman correlation between today's factor rank and the stock's return over the forward period. A perfect IC of 1.0 means the factor perfectly predicts relative returns. Typical good factors have IC of 0.04-0.08." },
          { title: "ICIR (IC Information Ratio)", detail: "ICIR = mean IC / standard deviation of IC. This measures how consistent the factor is — a high mean IC with low volatility is far more tradeable than an equally high mean IC with wild swings." },
          { title: "Quintile Returns", detail: "Stocks are sorted into 5 buckets (quintiles) by factor score each month. The quintile return chart shows the average return of each bucket. A good factor shows monotonically increasing returns from Q1 to Q5." },
          { title: "Universe Adjustment", detail: "Factor scores are z-scored within the selected universe before computing IC, ensuring the result reflects relative ordering within the investable universe rather than absolute values." },
        ]}
        tips={[
          "IC above 0.05 with ICIR above 0.5 is a reliable signal worth including in a multi-factor model.",
          "Compare IC across different forward windows — a factor that works at 1M but not 3M is a short-term signal, not a strategic one.",
          "Momentum IC tends to be positive in trending markets and negative in choppy markets — always check the IC history chart, not just the summary.",
        ]}
      />
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base font-semibold">Factor Explorer</h1>
          <p className="text-xs text-text-muted mt-0.5">
            IC, quintile spreads, and signal quality across 11 factors
          </p>
        </div>
        <UniverseDropdown value={universePreset} onChange={setUniverse} />
      </div>

      {/* Factor tabs */}
      <FactorTabs selected={factor} onChange={setFactor} />

      {/* Custom ticker input */}
      {universePreset === "custom" && (
        <CustomTickerInput tickers={customTickers} onChange={setCustom} />
      )}
      {universePreset === "custom" && customTickers.length < 10 && (
        <div className="text-xs text-yellow-500/80 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500" />
          Add at least 10 tickers for meaningful z-scores ({customTickers.length}/10)
        </div>
      )}

      {/* Stats row — only for price-based factors */}
      {hasPriceHistory && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Mean IC"
            value={stats?.mean_ic != null ? `${stats.mean_ic >= 0 ? "+" : ""}${stats.mean_ic.toFixed(3)}` : null}
            description="Avg monthly Spearman(score, fwd return)"
          />
          <StatCard
            label="ICIR"
            value={stats?.icir != null ? stats.icir.toFixed(2) : null}
            description="IC / std(IC) — signal-to-noise"
          />
          <StatCard
            label="% Positive IC"
            value={stats?.pct_positive != null ? formatPct(stats.pct_positive, 1) : null}
            description="Fraction of months with positive IC"
          />
          <StatCard
            label="Observations"
            value={stats?.n_obs != null ? String(stats.n_obs) : null}
            description="Monthly IC measurements"
          />
        </div>
      )}

      {/* Content area */}
      {!hasPriceHistory ? (
        <NoHistoryCard factor={factor} />
      ) : !ready ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center text-sm text-text-muted">
          Add 10+ tickers to compute IC
        </div>
      ) : (
        <>
          {/* IC chart */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-medium">Information Coefficient</div>
                <div className="text-xs text-text-muted mt-0.5">
                  Monthly Spearman(score, 21-day fwd return) · 3M rolling avg
                </div>
              </div>
              {icLoading && <RefreshCw size={13} className="animate-spin text-text-muted" />}
            </div>
            {icData?.series?.length ? (
              <FactorICChart data={icData.series} height={260} />
            ) : (
              <div className="h-64 flex items-center justify-center text-text-muted text-sm">
                {icLoading ? "Computing IC…" : "No data — price history may still be loading"}
              </div>
            )}
          </div>

          {/* Quintile chart */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <div className="text-sm font-medium">Quintile Cumulative Returns</div>
                <div className="text-xs text-text-muted mt-0.5">
                  {quintileMode === "live"
                    ? "Equal-weight, monthly rebalanced · Q5 = top 20% by factor score"
                    : "Kenneth French portfolio quintiles (Lo20→Q1, Hi20→Q5) · Equal-weight · Since 1963"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasFFQuintile && (
                  <div className="flex rounded border border-border overflow-hidden">
                    <button
                      onClick={() => setQuintileMode("live")}
                      className={cn("px-2.5 py-1 text-xs transition-colors",
                        quintileMode === "live" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary")}
                    >5Y Live</button>
                    <button
                      onClick={() => setQuintileMode("longrun")}
                      className={cn("px-2.5 py-1 text-xs transition-colors",
                        quintileMode === "longrun" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary")}
                    >1963+ (FF)</button>
                  </div>
                )}
                {(quintileMode === "live" ? qLoading : ffQLoading) && (
                  <RefreshCw size={13} className="animate-spin text-text-muted" />
                )}
              </div>
            </div>
            {quintileMode === "live" ? (
              qData?.series?.length ? (
                <QuintileReturns data={qData.series} height={300} />
              ) : (
                <div className="h-72 flex items-center justify-center text-text-muted text-sm">
                  {qLoading ? "Computing quintile returns…" : "No data"}
                </div>
              )
            ) : (
              ffQData?.series?.length ? (
                <QuintileReturns data={ffQData.series} height={300} />
              ) : (
                <div className="h-72 flex items-center justify-center text-text-muted text-sm">
                  {ffQLoading ? "Loading historical quintile data…" : "No data"}
                </div>
              )
            )}
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-muted">
              <span><span className="text-green-400">Q5</span> = highest factor score (long)</span>
              <span><span className="text-red-400">Q1</span> = lowest factor score (short)</span>
              {quintileMode === "longrun" && (
                <span className="text-text-muted/60">Source: Kenneth French Data Library · No transaction costs</span>
              )}
              {quintileMode === "live" && <span>No transaction costs applied</span>}
            </div>
          </div>
        </>
      )}

      {/* Long-run Fama-French historical factor returns */}
      <FamaFrenchSection />
    </div>
  );
}
